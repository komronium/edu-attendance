package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"attendance/internal/oxu"
	"attendance/internal/store"
)

// How often digital.oxu.uz is read in the background.
const (
	dayInterval   = 30 * time.Minute
	nightInterval = 5 * time.Hour
	nightStarts   = 22 // hour, Tashkent time
	nightEnds     = 8
	syncTimeout   = 70 * time.Second
)

var (
	errNoCookie = errors.New("no cookie")
	errNoOwner  = errors.New("no owner")
	errBusy     = errors.New("sync already running")
)

// syncInterval is the wait between background syncs at the given moment.
func syncInterval(t time.Time) time.Duration {
	if h := t.In(store.Tashkent()).Hour(); h >= nightStarts || h < nightEnds {
		return nightInterval
	}
	return dayInterval
}

// SyncStatus is what the page may know about syncing. It never contains the cookie.
type SyncStatus struct {
	HasCookie bool     `json:"has_cookie"`
	State     string   `json:"state"` // none, ok, expired, error, wrong_account
	Owner     string   `json:"owner"`
	WrongID   string   `json:"wrong_id"` // the account the session belongs to, when it is not the owner
	Running   bool     `json:"running"`
	LastSync  *float64 `json:"last_sync"`
	NextSync  *float64 `json:"next_sync"`
	Warnings  []string `json:"warnings"`
}

// Syncer keeps the session cookie and reads the site on a schedule. A dead session stops the schedule
// until a new cookie is saved: logging in again is the teacher's job (it has a robot check).
type Syncer struct {
	db   *store.Store
	sync func(ctx context.Context, cookie, owner string, prev *oxu.Data) (*oxu.Data, []string, error)
	file string
	now  func() time.Time

	mu          sync.Mutex
	cookie      string
	state       string
	running     bool
	lastAttempt time.Time
	warnings    []string
	wrongID     string
}

func newSyncer(db *store.Store, fn func(context.Context, string, string, *oxu.Data) (*oxu.Data, []string, error), file string) *Syncer {
	s := &Syncer{db: db, sync: fn, file: file, now: time.Now, state: "none", warnings: []string{}}
	if file != "" {
		if raw, err := os.ReadFile(file); err == nil {
			s.cookie = strings.TrimSpace(string(raw))
		}
	}
	if s.cookie != "" {
		s.state = "ok"
	}
	if _, at := s.Snapshot(); at > 0 {
		s.lastAttempt = time.Unix(int64(at), 0)
	}
	return s
}

// Snapshot returns the synced data, but only if it belongs to the owner: anything else is treated as absent.
func (s *Syncer) Snapshot() ([]byte, float64) {
	raw, at, err := s.db.Oxu()
	owner, oerr := s.db.OxuOwner()
	if err != nil || oerr != nil || raw == nil || owner == "" {
		return nil, 0
	}
	var tag struct {
		Account string `json:"account"`
	}
	if json.Unmarshal(raw, &tag) != nil || tag.Account != owner {
		return nil, 0
	}
	return raw, at
}

// Status reports the current state.
func (s *Syncer) Status() SyncStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := SyncStatus{HasCookie: s.cookie != "", State: s.state, Running: s.running, Warnings: s.warnings, WrongID: s.wrongID}
	st.Owner, _ = s.db.OxuOwner()
	if _, at := s.Snapshot(); at > 0 {
		st.LastSync = &at
	}
	if s.cookie != "" && s.state != "expired" {
		next := float64(s.lastAttempt.Add(syncInterval(s.now())).Unix())
		if now := float64(s.now().Unix()); next < now {
			next = now
		}
		st.NextSync = &next
	}
	return st
}

func (s *Syncer) due() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cookie != "" && s.state != "expired" && !s.running && s.now().Sub(s.lastAttempt) >= syncInterval(s.now())
}

// Run syncs whenever one is due, until ctx ends.
func (s *Syncer) Run(ctx context.Context) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if s.due() {
				if _, err := s.Now(ctx); err != nil && !errors.Is(err, errBusy) {
					slog.Warn("oxu background sync", "err", err)
				}
			}
		}
	}
}

// Now syncs with the saved cookie.
func (s *Syncer) Now(ctx context.Context) ([]string, error) {
	s.mu.Lock()
	cookie := s.cookie
	s.mu.Unlock()
	if cookie == "" {
		return nil, errNoCookie
	}
	return s.run(ctx, cookie, false)
}

// Replace syncs with a new cookie and keeps it only if that worked.
func (s *Syncer) Replace(ctx context.Context, cookie string) ([]string, error) {
	cookie = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(cookie), "Cookie:"))
	return s.run(ctx, cookie, true)
}

// Forget removes the saved cookie.
func (s *Syncer) Forget() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cookie, s.state = "", "none"
	if s.file != "" {
		if err := os.Remove(s.file); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func (s *Syncer) run(ctx context.Context, cookie string, replacing bool) ([]string, error) {
	owner, err := s.db.OxuOwner()
	if err != nil {
		return nil, err
	}
	if owner == "" {
		return nil, errNoOwner
	}
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil, errBusy
	}
	s.running = true
	s.mu.Unlock()
	warnings, err := s.fetch(ctx, cookie, owner)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.running = false
	s.lastAttempt = s.now()
	var wrong *oxu.WrongAccountError
	switch {
	case errors.As(err, &wrong):
		// keep trying: when the owner logs back in, the same cookie is theirs again
		if !replacing {
			s.state, s.wrongID = "wrong_account", wrong.Code
		}
		return nil, err
	case errors.Is(err, oxu.ErrSession):
		if !replacing { // a bad new cookie says nothing about the saved one
			s.state = "expired"
		}
		return nil, err
	case err != nil:
		if !replacing {
			s.state = "error"
		}
		return nil, err
	}
	if replacing {
		if err := s.keep(cookie); err != nil {
			return nil, err
		}
	}
	s.state, s.warnings, s.wrongID = "ok", warnings, ""
	return warnings, nil
}

func (s *Syncer) fetch(ctx context.Context, cookie, owner string) ([]string, error) {
	var prev *oxu.Data
	if raw, _ := s.Snapshot(); raw != nil {
		prev = &oxu.Data{}
		if json.Unmarshal(raw, prev) != nil {
			prev = nil
		}
	}
	ctx, cancel := context.WithTimeout(ctx, syncTimeout)
	defer cancel()
	data, warnings, err := s.sync(ctx, cookie, owner, prev)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	if err := s.db.SaveOxu(raw); err != nil {
		return nil, err
	}
	today := s.now().In(store.Tashkent()).Format("2006-01-02")
	for _, c := range oxu.Changes(prev, data, today) {
		if err := s.db.AddNotification(c.Kind, c.Title, c.Body, c.Link); err != nil {
			slog.Error("notification", "err", err)
		}
	}
	if warnings == nil {
		warnings = []string{}
	}
	return warnings, nil
}

// keep stores the cookie readable by the owner only; it works like a password while it is valid.
func (s *Syncer) keep(cookie string) error {
	s.cookie = cookie
	if s.file == "" {
		return nil
	}
	tmp := s.file + ".tmp"
	if err := os.WriteFile(tmp, []byte(cookie), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.file)
}
