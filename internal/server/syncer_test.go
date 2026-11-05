package server

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"attendance/internal/oxu"
	"attendance/internal/store"
)

func newTestSyncer(t *testing.T, file string) (*Syncer, *int) {
	t.Helper()
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.SetOxuOwner("123456"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	s := newSyncer(db, func(_ context.Context, cookie, owner string, _ *oxu.Data) (*oxu.Data, []string, error) {
		calls++
		switch cookie {
		case "good", "good2":
			return &oxu.Data{Account: owner}, nil, nil
		case "someone":
			return nil, nil, &oxu.WrongAccountError{Code: "999999"}
		case "offline":
			return nil, nil, errors.New("timeout")
		}
		return nil, nil, oxu.ErrSession
	}, file)
	return s, &calls
}

func at(hour int) time.Time { return time.Date(2026, 11, 5, hour, 0, 0, 0, store.Tashkent()) }

func TestSyncInterval(t *testing.T) {
	for hour, want := range map[int]time.Duration{8: dayInterval, 12: dayInterval, 21: dayInterval, 22: nightInterval, 23: nightInterval, 0: nightInterval, 7: nightInterval} {
		if got := syncInterval(at(hour)); got != want {
			t.Errorf("%d:00: %v", hour, got)
		}
	}
}

func TestCookieIsKeptOnlyAfterItWorks(t *testing.T) {
	file := filepath.Join(t.TempDir(), "oxu_cookie")
	s, _ := newTestSyncer(t, file)
	ctx := context.Background()
	if _, err := s.Replace(ctx, "dead"); !errors.Is(err, oxu.ErrSession) {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); err == nil {
		t.Fatal("a cookie that failed must not be saved")
	}
	if _, err := s.Replace(ctx, "Cookie: good"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(file)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("cookie file must be 0600: %v %v", info, err)
	}
	if raw, _ := os.ReadFile(file); string(raw) != "good" {
		t.Fatalf("%q", raw)
	}
	// a bad replacement leaves the working cookie alone
	if _, err := s.Replace(ctx, "dead"); !errors.Is(err, oxu.ErrSession) {
		t.Fatal(err)
	}
	if st := s.Status(); st.State != "ok" || !st.HasCookie {
		t.Fatalf("%+v", st)
	}
	// it survives a restart
	again, _ := newTestSyncer(t, file)
	if !again.Status().HasCookie {
		t.Fatal("cookie lost on restart")
	}
	if err := s.Forget(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); err == nil {
		t.Fatal("forget must remove the file")
	}
}

func TestDeadSessionStopsTheSchedule(t *testing.T) {
	s, calls := newTestSyncer(t, "")
	ctx := context.Background()
	now := at(12)
	s.now = func() time.Time { return now }
	if _, err := s.Replace(ctx, "good"); err != nil {
		t.Fatal(err)
	}
	if s.due() {
		t.Fatal("just synced")
	}
	now = now.Add(dayInterval)
	if !s.due() {
		t.Fatal("30 minutes passed")
	}
	s.cookie = "dead" // the session died on the site
	if _, err := s.Now(ctx); !errors.Is(err, oxu.ErrSession) {
		t.Fatal(err)
	}
	st := s.Status()
	if st.State != "expired" || st.NextSync != nil {
		t.Fatalf("%+v", st)
	}
	before := *calls
	now = now.Add(24 * time.Hour)
	if s.due() || *calls != before {
		t.Fatal("a dead session must not be retried")
	}
	if _, err := s.Replace(ctx, "good2"); err != nil {
		t.Fatal(err)
	}
	if st := s.Status(); st.State != "ok" || st.NextSync == nil {
		t.Fatalf("%+v", st)
	}
}

func TestNetworkErrorKeepsRetrying(t *testing.T) {
	s, _ := newTestSyncer(t, "")
	now := at(12)
	s.now = func() time.Time { return now }
	s.cookie, s.state = "offline", "ok"
	if _, err := s.Now(context.Background()); err == nil {
		t.Fatal("want an error")
	}
	if s.Status().State != "error" {
		t.Fatalf("%+v", s.Status())
	}
	now = now.Add(dayInterval)
	if !s.due() {
		t.Fatal("a network problem is retried on schedule")
	}
}

func TestStatusNeverContainsTheCookie(t *testing.T) {
	s, _ := newTestSyncer(t, "")
	if _, err := s.Replace(context.Background(), "good"); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(s.Status())
	if strings.Contains(string(raw), "good") {
		t.Fatalf("%s", raw)
	}
}

func TestAnotherAccountIsNeverKeptAndSyncResumes(t *testing.T) {
	file := filepath.Join(t.TempDir(), "oxu_cookie")
	s, _ := newTestSyncer(t, file)
	ctx := context.Background()
	now := at(12)
	s.now = func() time.Time { return now }
	var wrong *oxu.WrongAccountError
	if _, err := s.Replace(ctx, "someone"); !errors.As(err, &wrong) {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); err == nil {
		t.Fatal("another person's cookie must not be saved")
	}
	if _, err := s.Replace(ctx, "good"); err != nil {
		t.Fatal(err)
	}
	// someone else logs in through the same browser session: the saved cookie is now theirs
	s.cookie = "someone"
	before, _ := s.Snapshot()
	if _, err := s.Now(ctx); !errors.As(err, &wrong) {
		t.Fatal(err)
	}
	st := s.Status()
	if st.State != "wrong_account" || st.WrongID != "999999" {
		t.Fatalf("%+v", st)
	}
	if after, _ := s.Snapshot(); string(after) != string(before) {
		t.Fatal("the owner's data must stay as it was")
	}
	now = now.Add(dayInterval)
	if !s.due() {
		t.Fatal("keeps checking, so it resumes once the owner is back")
	}
	s.cookie = "good" // the owner logged back in
	if _, err := s.Now(ctx); err != nil {
		t.Fatal(err)
	}
	if st := s.Status(); st.State != "ok" || st.WrongID != "" {
		t.Fatalf("%+v", st)
	}
}

func TestSyncCreatesNotices(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.SetOxuOwner("123456"); err != nil {
		t.Fatal(err)
	}
	lessons := []oxu.Lesson{{Date: "2026-11-09", Para: "3", Subject: "Fan", Group: "G"}}
	s := newSyncer(db, func(_ context.Context, _, owner string, _ *oxu.Data) (*oxu.Data, []string, error) {
		return &oxu.Data{Account: owner, Lessons: lessons, Unsaved: []oxu.Lesson{}}, nil, nil
	}, "")
	s.now = func() time.Time { return at(12) }
	if _, err := s.Replace(context.Background(), "good"); err != nil {
		t.Fatal(err)
	}
	if got, _ := db.Notifications(); len(got) != 0 {
		t.Fatalf("first sync: %+v", got)
	}
	lessons = append(lessons, oxu.Lesson{Date: "2026-11-10", Para: "4", Subject: "Fan", Group: "G"})
	if _, err := s.Now(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got, _ := db.Notifications(); len(got) != 1 || got[0].Kind != "lesson_added" {
		t.Fatalf("%+v", got)
	}
}

func TestDataOfAnotherAccountIsHidden(t *testing.T) {
	s, _ := newTestSyncer(t, "")
	for _, raw := range []string{`{"account":"999999","lessons":[]}`, `{"lessons":[]}`} {
		if err := s.db.SaveOxu([]byte(raw)); err != nil {
			t.Fatal(err)
		}
		if got, _ := s.Snapshot(); got != nil {
			t.Fatalf("%s must be hidden", raw)
		}
	}
}
