package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func fileStore(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "attendance.sqlite3")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, path
}

func countRows(t *testing.T, path, table string) int {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow("select count(*) from " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestBackupIsACompleteCopyWhileTheServiceRuns(t *testing.T) {
	s, path := fileStore(t)
	must(s.AddStudents(names("Aliyev Ali", "Karimova Madina")))
	sid := must(s.StartSession("2026-11-02", "", "Sikllar", nil, 0))
	check(s.SetPresent(sid, 1, false))
	// the store keeps its connection open: these writes sit in the WAL, not yet in the main file
	out, err := Backup(path, filepath.Join(t.TempDir(), "backups"), 0)
	if err != nil {
		t.Fatal(err)
	}
	for table, want := range map[string]int{"students": 2, "sessions": 1, "attendance": 2} {
		if got := countRows(t, out, table); got != want {
			t.Errorf("%s: %d rows in the backup, want %d", table, got, want)
		}
	}
	copied, err := Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer copied.Close()
	rt := must(copied.Retakes())
	if rt.Owed != 1 {
		t.Fatalf("the backup lost the absence: %+v", rt)
	}
}

func TestBackupIsPrivateAndRotated(t *testing.T) {
	_, path := fileStore(t)
	dir := filepath.Join(t.TempDir(), "backups")
	var made []string
	for range 3 {
		made = append(made, must(Backup(path, dir, 2)))
	}
	info := must(os.Stat(made[2]))
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v, want 0600", info.Mode().Perm())
	}
	if d := must(os.Stat(dir)); d.Mode().Perm() != 0o700 {
		t.Fatalf("dir mode %v, want 0700", d.Mode().Perm())
	}
	left := must(Backups(dir, BackupPrefix, BackupExt))
	if len(left) != 2 || left[0] != made[1] || left[1] != made[2] {
		t.Fatalf("kept %v, want the two newest of %v", left, made)
	}
	last := must(LastBackup(dir))
	if time.Since(last) > time.Minute {
		t.Fatalf("last backup %v", last)
	}
}

func TestBackupNeverChangesTheSource(t *testing.T) {
	// an old database: no para column, no grade column; a backup must not migrate it
	path := filepath.Join(t.TempDir(), "davomat.sqlite3")
	db := must(sql.Open("sqlite", path))
	if _, err := db.Exec(`create table sessions (id integer primary key, date text not null, started_at real not null,
		room text not null default '', topic text not null default '', created_at real not null)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	before := must(os.ReadFile(path))
	stat := must(os.Stat(path))
	if _, err := Backup(path, filepath.Join(t.TempDir(), "b"), 0); err != nil {
		t.Fatal(err)
	}
	after := must(os.ReadFile(path))
	if string(before) != string(after) || !must(os.Stat(path)).ModTime().Equal(stat.ModTime()) {
		t.Fatal("the backup changed the source file")
	}
	cols := map[string]bool{}
	ro := must(sql.Open("sqlite", "file:"+path+"?mode=ro"))
	defer ro.Close()
	rows := must(ro.Query("select name from pragma_table_info('sessions')"))
	for rows.Next() {
		var n string
		check(rows.Scan(&n))
		cols[n] = true
	}
	rows.Close()
	if cols["para"] {
		t.Fatal("the backup migrated the source")
	}
}

func TestBackupOfAMissingFileFails(t *testing.T) {
	if _, err := Backup(filepath.Join(t.TempDir(), "nope.sqlite3"), t.TempDir(), 0); err == nil {
		t.Fatal("want an error")
	}
}

func TestOpenBacksUpBeforeAddingAColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "attendance.sqlite3")
	s := must(Open(path))
	must(s.AddStudents(names("Aliyev Ali")))
	s.Close()
	if list := must(Backups(BackupDir(path), BackupPrefix, BackupExt)); len(list) != 0 {
		t.Fatalf("a current database was backed up on open: %v", list)
	}
	// take the database back to before deleted_at existed
	db := must(sql.Open("sqlite", path))
	if _, err := db.Exec("alter table sessions drop column deleted_at"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s = must(Open(path))
	defer s.Close()
	list := must(Backups(BackupDir(path), BackupPrefix, BackupExt))
	if len(list) != 1 {
		t.Fatalf("want one backup before the migration, got %v", list)
	}
	if countRows(t, list[0], "students") != 1 {
		t.Fatal("the backup is not of the old database")
	}
	if must(os.Stat(path)).Mode().Perm() != 0o600 {
		t.Fatal("the database file is not 0600")
	}
}

func TestBackupRefusesACorruptSource(t *testing.T) {
	path := filepath.Join(t.TempDir(), "attendance.sqlite3")
	s := must(Open(path))
	if _, err := s.AddStudents([]any{"Aliyev Ali"}); err != nil {
		t.Fatal(err)
	}
	s.Close()
	raw := must(os.ReadFile(path))
	if len(raw) < 8192 {
		t.Skip("database too small to damage a page")
	}
	for i := 4096; i < 8192; i++ { // the second page: a table b-tree page, not the header
		raw[i] = 0xff
	}
	os.WriteFile(path, raw, 0o600)
	dir := filepath.Join(t.TempDir(), "b")
	if _, err := Backup(path, dir, 0); err == nil {
		t.Fatal("a damaged database was backed up without an error")
	}
	if left := must(Backups(dir, BackupPrefix, BackupExt)); len(left) != 0 {
		t.Fatalf("a failed backup left a file: %v", left)
	}
}
