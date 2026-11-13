// Package auth checks the password and signs the session cookie. The password is stored only as a
// salted PBKDF2 hash. The file format and the cookie format are the same as the Python version's,
// so an existing auth.json keeps working and logged-in browsers stay logged in.
package auth

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	SessionSeconds = 12 * 3600 // since the last request: an open tab renews its session (Renew)
	maxFailures    = 5
	lockSeconds    = 900
	maxHashing     = 2 // password checks running at once; more get "too many requests"
)

// Iterations is the PBKDF2 cost of new hashes (OWASP's figure for SHA-256). A hash made with fewer is
// still accepted and is rewritten at this cost after the next successful login.
var Iterations = 600_000

type record struct {
	Salt       string `json:"salt"`
	Hash       string `json:"hash"`
	Iterations int    `json:"iterations"`
	Secret     string `json:"secret,omitempty"`
}

// Auth holds the password hash, the cookie signing secret and the failed-login counters.
type Auth struct {
	keyMu  sync.RWMutex // guards rec and secret: Upgrade and Rotate replace them while requests read them
	rec    record
	secret []byte
	path   string        // auth.json, for re-hashing at a higher cost and for a new secret
	hashes chan struct{} // a slot per password check that may run

	// NoLogin accepts every request (the demo's screenshot mode).
	NoLogin bool

	mu       sync.Mutex
	failures map[string][]time.Time
}

func hashPassword(password string, salt []byte, iterations int) (string, error) {
	key, err := pbkdf2.Key(sha256.New, password, salt, iterations, sha256.Size)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(key), nil
}

// Load reads auth.json. A file without a secret (a restored backup: Redacted leaves it out) gets a new
// one, written back when the file is writable; no old session is valid with it.
func Load(path string) (*Auth, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var rec record
	if err := json.Unmarshal(raw, &rec); err != nil {
		return nil, err
	}
	secret, err := hex.DecodeString(rec.Secret)
	if err != nil || rec.Salt == "" || rec.Hash == "" || rec.Iterations <= 0 {
		return nil, errors.New("auth: bad auth.json")
	}
	if len(secret) == 0 {
		if secret, err = newSecret(); err != nil {
			return nil, err
		}
		rec.Secret = hex.EncodeToString(secret)
		if err := writeRecord(path, rec); err != nil {
			slog.Warn("auth: new session secret kept in memory only", "err", err)
		}
	}
	return &Auth{rec: rec, secret: secret, path: path, hashes: make(chan struct{}, maxHashing), failures: map[string][]time.Time{}}, nil
}

// Create writes a new auth.json (mode 0600) for the password, replacing any existing one. A new
// secret means every session signed with the old one ends.
func Create(path, password string) error {
	secret, err := newSecret()
	if err != nil {
		return err
	}
	return write(path, password, secret)
}

func newSecret() ([]byte, error) {
	secret := make([]byte, 32)
	_, err := rand.Read(secret)
	return secret, err
}

// Redacted is auth.json without the session secret, for a backup: a copy that leaks then holds only the
// password hash, and cannot be used to sign a session cookie.
func Redacted(path string) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var rec record
	if err := json.Unmarshal(raw, &rec); err != nil {
		return nil, err
	}
	rec.Secret = ""
	return json.Marshal(rec)
}

func write(path, password string, secret []byte) error {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	hash, err := hashPassword(password, salt, Iterations)
	if err != nil {
		return err
	}
	return writeRecord(path, record{Salt: hex.EncodeToString(salt), Hash: hash, Iterations: Iterations, Secret: hex.EncodeToString(secret)})
}

func writeRecord(path string, rec record) error {
	data, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// CheckPassword compares the password against the stored hash in constant time.
func (a *Auth) CheckPassword(password string) bool {
	a.keyMu.RLock()
	rec := a.rec
	a.keyMu.RUnlock()
	salt, err := hex.DecodeString(rec.Salt)
	if err != nil {
		return false
	}
	got, err := hashPassword(password, salt, rec.Iterations)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(rec.Hash)) == 1
}

// prune drops attempts older than the lock window, for every address, so the map cannot grow without
// bound from addresses that never come back. a.mu must be held.
func (a *Auth) prune() {
	cutoff := time.Now().Add(-lockSeconds * time.Second)
	for ip, list := range a.failures {
		recent := list[:0]
		for _, t := range list {
			if t.After(cutoff) {
				recent = append(recent, t)
			}
		}
		if len(recent) == 0 {
			delete(a.failures, ip)
		} else {
			a.failures[ip] = recent
		}
	}
}

// Locked reports whether the address has failed too many times recently.
func (a *Auth) Locked(ip string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.prune()
	return len(a.failures[ip]) >= maxFailures
}

// Attempt reports whether the address may try a password now, and if so counts the try at once,
// before the slow check: requests sent in parallel cannot all slip under the limit. A successful
// login clears the count (Succeed).
func (a *Auth) Attempt(ip string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.prune()
	if len(a.failures[ip]) >= maxFailures {
		return false
	}
	a.failures[ip] = append(a.failures[ip], time.Now())
	return true
}

// TryHash takes one of the few slots for a password check; ok is false when all are busy. The caller
// must call release when done.
func (a *Auth) TryHash() (release func(), ok bool) {
	select {
	case a.hashes <- struct{}{}:
		return func() { <-a.hashes }, true
	default:
		return nil, false
	}
}

// Upgrade rewrites auth.json at the current cost when the stored hash is cheaper, keeping the secret
// so no session ends. password must be the one that just matched.
func (a *Auth) Upgrade(password string) error {
	a.keyMu.Lock()
	defer a.keyMu.Unlock()
	if a.rec.Iterations >= Iterations || a.path == "" {
		return nil
	}
	if err := write(a.path, password, a.secret); err != nil {
		return err
	}
	fresh, err := Load(a.path)
	if err != nil {
		return err
	}
	a.rec = fresh.rec
	return nil
}

// Rotate replaces the session secret, which ends every session at once: on logout, a cookie copied
// from this browser (or from any other) stops working too. The password does not change.
func (a *Auth) Rotate() error {
	secret, err := newSecret()
	if err != nil {
		return err
	}
	a.keyMu.Lock()
	defer a.keyMu.Unlock()
	rec := a.rec
	rec.Secret = hex.EncodeToString(secret)
	if a.path != "" {
		if err := writeRecord(a.path, rec); err != nil {
			return err
		}
	}
	a.rec, a.secret = rec, secret
	return nil
}

func (a *Auth) Succeed(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.failures, ip)
}

func (a *Auth) sign(payload string) string {
	a.keyMu.RLock()
	secret := a.secret
	a.keyMu.RUnlock()
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// NewSession returns a signed token valid for SessionSeconds.
func (a *Auth) NewSession() string { return a.NewSessionAt(time.Now()) }

// NewSessionAt is NewSession as if it were issued at t.
func (a *Auth) NewSessionAt(t time.Time) string {
	expires := strconv.FormatInt(t.Unix()+SessionSeconds, 10)
	return expires + "." + a.sign(expires)
}

// Renew returns a fresh token for a valid one that is past half its lifetime, so a session in use does
// not end; ok is false when the token is invalid or still fresh. The token format does not change.
func (a *Auth) Renew(token string) (fresh string, ok bool) {
	if a.NoLogin || !a.ValidSession(token) {
		return "", false
	}
	expires, _, _ := strings.Cut(token, ".")
	at, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || at-time.Now().Unix() > SessionSeconds/2 {
		return "", false
	}
	return a.NewSession(), true
}

// ValidSession checks the signature and the expiry of a token.
func (a *Auth) ValidSession(token string) bool {
	if a.NoLogin {
		return true
	}
	expires, sig, ok := strings.Cut(token, ".")
	if !ok || expires == "" || strings.Trim(expires, "0123456789") != "" {
		return false
	}
	if !hmac.Equal([]byte(sig), []byte(a.sign(expires))) {
		return false
	}
	at, err := strconv.ParseInt(expires, 10, 64)
	return err == nil && at > time.Now().Unix()
}
