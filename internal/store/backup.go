package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// BackupPrefix and BackupExt name the database copies in a backup directory.
const (
	BackupPrefix = "attendance-"
	BackupExt    = ".sqlite3"
)

// Backup writes a consistent copy of the database at src into dir (created 0700) and returns its path.
// It opens src read-only on a connection of its own: it never runs migrations and never writes to src,
// so a binary newer than the running service can back up the live file safely. VACUUM INTO reads a
// consistent snapshot, the WAL included. The copy is readable by the owner only; it holds names and
// grades. When keep > 0, only the newest keep copies are left.
func Backup(src, dir string, keep int) (string, error) {
	if _, err := os.Stat(src); err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path, err := freshName(dir, BackupPrefix, BackupExt)
	if err != nil {
		return "", err
	}
	// VACUUM INTO accepts an existing empty file: creating it first keeps it 0600 from the start
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	f.Close()
	db, err := sql.Open("sqlite", "file:"+src+"?mode=ro&_pragma=busy_timeout(10000)")
	if err != nil {
		os.Remove(path)
		return "", err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("vacuum into ?", path); err != nil {
		os.Remove(path)
		return "", fmt.Errorf("backup: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return "", err
	}
	if err := verify(path); err != nil {
		os.Remove(path)
		return "", fmt.Errorf("backup %s: %w", path, err)
	}
	if keep > 0 {
		if err := Prune(dir, BackupPrefix, BackupExt, keep); err != nil {
			return path, err
		}
	}
	return path, nil
}

// verify opens a finished copy read-only and runs SQLite's integrity check on it, so a copy that would
// not restore is reported now rather than found out on the day it is needed.
func verify(path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()
	var result string
	if err := db.QueryRow("pragma integrity_check").Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("integrity check: %s", result)
	}
	return nil
}

// WriteCopy writes a small file (the redacted auth.json) into dir under prefix+stamp+ext, mode 0600.
func WriteCopy(raw []byte, dir, prefix, ext string) (string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path, err := freshName(dir, prefix, ext)
	if err != nil {
		return "", err
	}
	return path, os.WriteFile(path, raw, 0o600)
}

// freshName is dir/prefix + a timestamp that sorts by time + ext, one that does not exist yet.
func freshName(dir, prefix, ext string) (string, error) {
	for range 100 {
		path := filepath.Join(dir, prefix+time.Now().In(Tashkent()).Format("20060102-150405.000000")+ext)
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			return path, nil
		}
		time.Sleep(time.Millisecond) // the next stamp still sorts after this one
	}
	return "", errors.New("backup: no free file name")
}

// Backups lists the copies in dir, oldest first.
func Backups(dir, prefix, ext string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), ext) {
			out = append(out, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(out) // the names carry the time
	return out, nil
}

// Prune deletes all but the newest keep copies.
func Prune(dir, prefix, ext string, keep int) error {
	list, err := Backups(dir, prefix, ext)
	if err != nil {
		return err
	}
	for len(list) > keep {
		if err := os.Remove(list[0]); err != nil {
			return err
		}
		list = list[1:]
	}
	return nil
}

// LastBackup is when the newest database copy in dir was written; zero when there is none.
func LastBackup(dir string) (time.Time, error) {
	list, err := Backups(dir, BackupPrefix, BackupExt)
	if err != nil || len(list) == 0 {
		return time.Time{}, err
	}
	info, err := os.Stat(list[len(list)-1])
	if err != nil {
		return time.Time{}, err
	}
	return info.ModTime(), nil
}
