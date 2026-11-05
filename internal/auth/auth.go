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
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	Iterations     = 240_000
	SessionSeconds = 12 * 3600
	maxFailures    = 5
	lockSeconds    = 900
)

type record struct {
	Salt       string `json:"salt"`
	Hash       string `json:"hash"`
	Iterations int    `json:"iterations"`
	Secret     string `json:"secret,omitempty"`
}

// Auth holds the password hash, the cookie signing secret and the failed-login counters.
type Auth struct {
	rec    record
	secret []byte

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

// Load reads auth.json.
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
	if err != nil || len(secret) == 0 || rec.Salt == "" || rec.Hash == "" || rec.Iterations <= 0 {
		return nil, errors.New("auth: bad auth.json")
	}
	return &Auth{rec: rec, secret: secret, failures: map[string][]time.Time{}}, nil
}

// Create writes a new auth.json (mode 0600) for the password, replacing any existing one.
func Create(path, password string) error {
	salt := make([]byte, 16)
	secret := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	if _, err := rand.Read(secret); err != nil {
		return err
	}
	hash, err := hashPassword(password, salt, Iterations)
	if err != nil {
		return err
	}
	data, err := json.Marshal(record{Salt: hex.EncodeToString(salt), Hash: hash, Iterations: Iterations, Secret: hex.EncodeToString(secret)})
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
	salt, err := hex.DecodeString(a.rec.Salt)
	if err != nil {
		return false
	}
	got, err := hashPassword(password, salt, a.rec.Iterations)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(a.rec.Hash)) == 1
}

// Locked reports whether the address has failed too many times recently.
func (a *Auth) Locked(ip string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	cutoff := time.Now().Add(-lockSeconds * time.Second)
	recent := a.failures[ip][:0]
	for _, t := range a.failures[ip] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) == 0 {
		delete(a.failures, ip)
	} else {
		a.failures[ip] = recent
	}
	return len(recent) >= maxFailures
}

func (a *Auth) Fail(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.failures[ip] = append(a.failures[ip], time.Now())
}

func (a *Auth) Succeed(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.failures, ip)
}

func (a *Auth) sign(payload string) string {
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// NewSession returns a signed token valid for SessionSeconds.
func (a *Auth) NewSession() string {
	expires := strconv.FormatInt(time.Now().Unix()+SessionSeconds, 10)
	return expires + "." + a.sign(expires)
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
