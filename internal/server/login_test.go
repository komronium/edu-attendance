package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"attendance/internal/auth"
	"attendance/internal/store"
)

func handler(t *testing.T) (*Server, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	path := filepath.Join(dir, "auth.json")
	if err := auth.Create(path, "parol-123"); err != nil {
		t.Fatal(err)
	}
	a, err := auth.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{Store: db, Auth: a, Web: fstest.MapFS{"index.html": {Data: []byte("x")}}})
	if err != nil {
		t.Fatal(err)
	}
	return s, path
}

func post(s *Server, peer, password string, headers ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "/login", strings.NewReader("password="+password))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.RemoteAddr = peer
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestSpoofedRealIPIsIgnoredFromTheInternet(t *testing.T) {
	s, _ := handler(t)
	codes := []int{}
	for i := range 7 {
		codes = append(codes, post(s, "203.0.113.9:4000", "wrong", "X-Real-IP", "10.0.0."+string(rune('1'+i))).Code)
	}
	if codes[5] != http.StatusTooManyRequests {
		t.Fatalf("rotating X-Real-IP from a public peer must not escape the lockout: %v", codes)
	}
}

func TestRealIPFromTheLocalProxyIsTrusted(t *testing.T) {
	s, _ := handler(t)
	for range 5 {
		post(s, "127.0.0.1:4000", "wrong", "X-Real-IP", "198.51.100.1")
	}
	if c := post(s, "127.0.0.1:4000", "wrong", "X-Real-IP", "198.51.100.1").Code; c != http.StatusTooManyRequests {
		t.Fatalf("the proxied address was not locked: %d", c)
	}
	// someone else behind the same proxy is not locked out by it
	if c := post(s, "127.0.0.1:4000", "parol-123", "X-Real-IP", "198.51.100.2").Code; c != http.StatusSeeOther {
		t.Fatalf("another address was locked out: %d", c)
	}
}

func TestForwardedProtoCountsOnlyFromTheLocalProxy(t *testing.T) {
	s, _ := handler(t)
	public := post(s, "203.0.113.9:4000", "parol-123", "X-Forwarded-Proto", "https").Header().Get("Set-Cookie")
	local := post(s, "127.0.0.1:4000", "parol-123", "X-Forwarded-Proto", "https").Header().Get("Set-Cookie")
	if strings.Contains(public, "Secure") || !strings.Contains(local, "Secure") {
		t.Fatalf("public: %q\nlocal: %q", public, local)
	}
}

func TestParallelGuessesCannotPassTheLimit(t *testing.T) {
	s, _ := handler(t)
	var wg sync.WaitGroup
	var mu sync.Mutex
	checked := 0
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if post(s, "203.0.113.9:4000", "wrong").Code == http.StatusUnauthorized {
				mu.Lock()
				checked++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if checked > 5 {
		t.Fatalf("%d of 20 parallel guesses reached the password check, want at most 5", checked)
	}
}

func TestOldCheapHashIsUpgradedOnLogin(t *testing.T) {
	old := auth.Iterations
	auth.Iterations = 1000
	s, path := handler(t)
	auth.Iterations = old // the "current" cost is now higher than the stored one
	before, _ := os.ReadFile(path)
	cookie := post(s, "127.0.0.1:4000", "parol-123").Header().Get("Set-Cookie")
	after, _ := os.ReadFile(path)
	if string(before) == string(after) || !strings.Contains(string(after), fmt.Sprintf(`"iterations":%d`, auth.Iterations)) {
		t.Fatalf("auth.json not upgraded: %s", after)
	}
	// the secret is kept: the session issued before the upgrade is still valid
	a, _ := auth.Load(path)
	token := strings.TrimPrefix(strings.Split(cookie, ";")[0], "session=")
	if !a.ValidSession(token) || !a.CheckPassword("parol-123") {
		t.Fatal("the upgrade ended the session or lost the password")
	}
}

func request(s *Server, method, path, cookie, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:4000"
	r.Header.Set("X-Requested-With", "attendance")
	r.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		r.Header.Set("Cookie", "session="+cookie)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestJSONLoginSetsTheSession(t *testing.T) {
	s, _ := handler(t)
	if w := request(s, "POST", "/api/login", "", `{"password":"wrong"}`); w.Code != 401 || !strings.Contains(w.Body.String(), "parol") {
		t.Fatalf("wrong password: %d %s", w.Code, w.Body)
	}
	w := request(s, "POST", "/api/login", "", `{"password":"parol-123"}`)
	if w.Code != 200 || !strings.Contains(w.Header().Get("Set-Cookie"), "session=") {
		t.Fatalf("login: %d %v", w.Code, w.Header())
	}
	// without the custom header a cross-site form cannot log in
	r := httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"password":"parol-123"}`))
	r.RemoteAddr = "127.0.0.1:4000"
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, r)
	if rec.Code != 403 {
		t.Fatalf("no header: %d", rec.Code)
	}
}

func TestASessionInUseIsRenewed(t *testing.T) {
	s, _ := handler(t)
	fresh := s.cfg.Auth.NewSession()
	if c := request(s, "GET", "/api/students", fresh, "").Header().Get("Set-Cookie"); c != "" {
		t.Fatalf("a fresh session was renewed: %q", c)
	}
	// a token in the second half of its life, signed with the same secret
	half := s.cfg.Auth.NewSessionAt(time.Now().Add(-(auth.SessionSeconds/2 + 60) * time.Second))
	w := request(s, "GET", "/api/students", half, "")
	if w.Code != 200 || !strings.Contains(w.Header().Get("Set-Cookie"), "session=") {
		t.Fatalf("an older session was not renewed: %d %q", w.Code, w.Header().Get("Set-Cookie"))
	}
}
