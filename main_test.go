package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"attendance/internal/auth"
	"attendance/internal/store"
)

func TestDBPathPrefersTheCurrentNameAndKeepsTheOldOne(t *testing.T) {
	dir := t.TempDir()
	if got := dbPath(dir); got != filepath.Join(dir, "attendance.sqlite3") {
		t.Fatalf("empty dir: %s", got)
	}
	os.WriteFile(filepath.Join(dir, "davomat.sqlite3"), nil, 0o600)
	if got := dbPath(dir); got != filepath.Join(dir, "davomat.sqlite3") {
		t.Fatalf("legacy only: %s", got)
	}
	os.WriteFile(filepath.Join(dir, "attendance.sqlite3"), nil, 0o600)
	if got := dbPath(dir); got != filepath.Join(dir, "attendance.sqlite3") {
		t.Fatalf("both: %s", got)
	}
}

func TestIsLoopback(t *testing.T) {
	for bind, want := range map[string]bool{"127.0.0.1": true, "::1": true, "localhost": true, "0.0.0.0": false, "": false, "192.168.1.5": false} {
		if isLoopback(bind) != want {
			t.Errorf("isLoopback(%q) = %v", bind, !want)
		}
	}
}

func TestNoLoginNeedsALoopbackBind(t *testing.T) {
	err := serve(true, options{dataDir: t.TempDir(), bind: "0.0.0.0", port: 0, noLogin: true})
	if err == nil || !strings.Contains(err.Error(), "loopback") {
		t.Fatalf("got %v", err)
	}
}

func TestImportNeedsYesAndBacksUpFirst(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(dbPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.AddStudents([]any{"Aliyev Ali"}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.StartSession("2026-11-02", "", "", nil, 0); err != nil {
		t.Fatal(err)
	}
	db.Close()
	spec := filepath.Join(dir, "spec.json")
	os.WriteFile(spec, []byte(`{"students":["Aliyev Ali"],"lessons":[],"retakes":[]}`), 0o600)

	if err := importSpec(dir, spec, false); err == nil || !strings.Contains(err.Error(), "--yes") {
		t.Fatalf("without --yes: %v", err)
	}
	db, _ = store.Open(dbPath(dir))
	if s, _ := db.Sessions(); len(s) != 1 {
		t.Fatal("import without --yes changed the lessons")
	}
	db.Close()

	if err := importSpec(dir, spec, true); err != nil {
		t.Fatal(err)
	}
	list, _ := store.Backups(store.BackupDir(dbPath(dir)), store.BackupPrefix, store.BackupExt)
	if len(list) != 1 {
		t.Fatalf("want a backup before the import, got %v", list)
	}
	db, _ = store.Open(dbPath(dir))
	defer db.Close()
	if s, _ := db.Sessions(); len(s) != 0 {
		t.Fatal("import with --yes did not replace the lessons")
	}
}

func TestBackupCommandCopiesAuthToo(t *testing.T) {
	dir := t.TempDir()
	db, _ := store.Open(dbPath(dir))
	db.Close()
	if err := auth.Create(filepath.Join(dir, "auth.json"), "parol-123"); err != nil {
		t.Fatal(err)
	}
	out, err := backup(dir, "", 1)
	if err != nil || len(out) != 2 || !strings.HasSuffix(out[1], ".json") {
		t.Fatalf("%v %v", out, err)
	}
	raw, _ := os.ReadFile(out[1])
	if strings.Contains(string(raw), "secret") || !strings.Contains(string(raw), `"hash"`) {
		t.Fatalf("the auth copy must keep the hash and leave out the session secret: %s", raw)
	}
}
