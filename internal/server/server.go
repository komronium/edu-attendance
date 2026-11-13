// Package server is the HTTP layer: login, the JSON API and the static single page.
package server

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"attendance/internal/auth"
	"attendance/internal/oxu"
	"attendance/internal/store"
)

const csp = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; " +
	"img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

const loginPage = `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>attendance</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head>
<body class="login"><form method="post" action="/login" class="login-box">
<div class="login-brand"><span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span><h1>attendance</h1></div>
<label for="password">Parol</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit" class="primary">Kirish</button>
<p class="login-error" role="alert">%s</p>
</form></body></html>`

const (
	cookieName  = "session"
	maxJSONBody = 200_000
	maxFormBody = 4096
)

// Config is what the server needs from the outside.
type Config struct {
	Store        *store.Store
	Auth         *auth.Auth
	Web          fs.FS // the contents of web/
	SecureCookie bool  // set Secure on the cookie even when the proxy does not say it is HTTPS

	// OxuSync reads digital.oxu.uz; nil means the real site.
	OxuSync func(ctx context.Context, cookie, owner string, prev *oxu.Data) (*oxu.Data, []string, error)
	// CookieFile keeps the digital.oxu.uz session between restarts; empty keeps it in memory.
	CookieFile string
	// BackupDir is where database copies are written; empty means none are reported.
	BackupDir string
}

type asset struct {
	body  []byte
	ctype string
	cache string
	etag  string
	gz    []byte // the compressed body, for text files
}

// Server is an http.Handler.
type Server struct {
	cfg    Config
	api    *http.ServeMux
	assets map[string]asset
	sync   *Syncer
}

// Syncer is the background reader of digital.oxu.uz.
func (s *Server) Syncer() *Syncer { return s.sync }

// New builds the handler; the static files are read into memory once.
func New(cfg Config) (*Server, error) {
	if cfg.OxuSync == nil {
		cfg.OxuSync = oxu.Sync
	}
	s := &Server{cfg: cfg, api: http.NewServeMux(), assets: map[string]asset{}, sync: newSyncer(cfg.Store, cfg.OxuSync, cfg.CookieFile)}
	err := fs.WalkDir(cfg.Web, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		body, err := fs.ReadFile(cfg.Web, p)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(body)
		a := asset{body: body, ctype: contentType(p), cache: "no-cache", etag: `"` + hex.EncodeToString(sum[:8]) + `"`}
		if strings.HasSuffix(p, ".woff2") {
			a.cache = "public, max-age=86400"
		}
		if strings.HasPrefix(a.ctype, "text/") {
			var buf bytes.Buffer
			w, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
			w.Write(body)
			if w.Close() == nil {
				a.gz = buf.Bytes()
			}
		}
		s.assets[p] = a
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.routes()
	return s, nil
}

func contentType(name string) string {
	var ct string
	switch path.Ext(name) {
	case ".woff2":
		return "font/woff2"
	case ".md":
		ct = "text/markdown"
	default:
		ct = mime.TypeByExtension(path.Ext(name))
	}
	if ct == "" {
		return "application/octet-stream"
	}
	if strings.HasPrefix(ct, "text/") && !strings.Contains(ct, "charset") {
		ct += "; charset=utf-8"
	}
	return ct
}

// ------------------------------------------------------------------ top level

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Content-Security-Policy", csp)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Frame-Options", "DENY")
	defer func() {
		if rec := recover(); rec != nil && rec != http.ErrAbortHandler {
			slog.Error("panic", "path", r.URL.Path, "err", rec)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ichki xato"})
		}
	}()
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		s.get(w, r)
	case http.MethodPost:
		if r.URL.Path == "/login" {
			s.login(w, r)
			return
		}
		if r.URL.Path == "/api/login" {
			s.apiLogin(w, r)
			return
		}
		s.mutate(w, r)
	case http.MethodPatch, http.MethodPut, http.MethodDelete:
		s.mutate(w, r)
	default:
		w.Header().Set("Allow", "GET, HEAD, POST, PATCH, PUT, DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) authed(r *http.Request) bool {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return s.cfg.Auth.ValidSession("")
	}
	return s.cfg.Auth.ValidSession(c.Value)
}

// renew gives a session in use a fresh cookie once it is past half its life.
func (s *Server) renew(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		if fresh, ok := s.cfg.Auth.Renew(c.Value); ok {
			s.setCookie(w, r, fresh, auth.SessionSeconds)
		}
	}
}

func (s *Server) setCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteStrictMode,
		Secure: s.cfg.SecureCookie || (fromProxy(r) && r.Header.Get("X-Forwarded-Proto") == "https"),
	})
}

// fromProxy reports whether the request came through the local reverse proxy (nginx on the same
// host, as deployed): only then do its X-Real-IP and X-Forwarded-Proto headers mean anything. From any
// other peer they are whatever the client chose to send.
func fromProxy(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" && fromProxy(r) {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func isPublic(p string) bool {
	return strings.HasPrefix(p, "/fonts/") || strings.HasPrefix(p, "/app.css") || p == "/theme.js" || p == "/public.js" || p == "/favicon.svg"
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	switch {
	case p == "/healthz": // for a monitor: the process is up and the database answers
		if err := s.cfg.Store.Ping(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "db": false})
			return
		}
		out := map[string]any{"ok": true, "db": true}
		if _, at := s.sync.Snapshot(); at > 0 {
			out["snapshot_age_s"] = int(time.Since(time.Unix(int64(at), 0)).Seconds())
		}
		writeJSON(w, http.StatusOK, out)
	case p == "/login":
		writeLogin(w, http.StatusOK, "")
	case p == "/favicon.ico": // browsers ask for it on pages that name no icon
		s.static(w, r, "/favicon.svg")
	case p == "/logout":
		// a logged-in logout also ends every other session (a copied cookie included). It needs the
		// session cookie, which SameSite=Strict keeps off a link from another site.
		if s.authed(r) && !s.cfg.Auth.NoLogin {
			if err := s.cfg.Auth.Rotate(); err != nil {
				slog.Error("logout: rotate secret", "err", err)
			}
		}
		s.setCookie(w, r, "", -1)
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	case isPublic(p):
		s.static(w, r, p)
	case strings.HasPrefix(p, "/q/"): // the students' retakes page: the secret in the link is the key
		s.publicRetakes(w, r, strings.TrimPrefix(p, "/q/"))
	case !s.authed(r):
		if strings.HasPrefix(p, "/api/") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "kirish kerak", "code": "unauthorized"})
		} else {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
		}
	case strings.HasPrefix(p, "/api/"):
		s.renew(w, r)
		s.api.ServeHTTP(w, r)
	case p == "/":
		s.static(w, r, "/index.html")
	default:
		s.static(w, r, p)
	}
}

func (s *Server) mutate(w http.ResponseWriter, r *http.Request) {
	if !s.authed(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "kirish kerak", "code": "unauthorized"})
		return
	}
	if r.Header.Get("X-Requested-With") != "attendance" { // a cross-site form cannot set this header
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "ruxsat yo'q"})
		return
	}
	s.renew(w, r)
	s.api.ServeHTTP(w, r)
}

// apiLogin is the page's own login, for a session that ended while a page was open: the page stays,
// and what was being typed is kept. Same checks as the login form.
func (s *Server) apiLogin(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Requested-With") != "attendance" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "ruxsat yo'q"})
		return
	}
	b, err := body(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "noto'g'ri so'rov"})
		return
	}
	password, _ := b["password"].(string)
	if status, msg := s.checkLogin(w, r, password); status != http.StatusOK {
		writeJSON(w, status, map[string]string{"error": msg})
		return
	}
	writeJSON(w, http.StatusOK, okBody)
}

const tooMany = "juda ko'p urinish, bir necha daqiqadan keyin qayta urining"

// checkLogin checks a password with the lockout and the cap on parallel checks; on success the session
// cookie is set. status is 200 on success, else 401 or 429 with a message for the person.
func (s *Server) checkLogin(w http.ResponseWriter, r *http.Request, password string) (int, string) {
	ip := clientIP(r)
	release, ok := s.cfg.Auth.TryHash()
	if !ok {
		w.Header().Set("Retry-After", "1")
		return http.StatusTooManyRequests, tooMany
	}
	defer release()
	if !s.cfg.Auth.Attempt(ip) { // counted before the check: parallel guesses cannot pass the limit
		slog.Warn("login locked", "ip", ip)
		return http.StatusTooManyRequests, tooMany
	}
	if !s.cfg.Auth.CheckPassword(password) {
		return http.StatusUnauthorized, "parol noto'g'ri"
	}
	s.cfg.Auth.Succeed(ip)
	if err := s.cfg.Auth.Upgrade(password); err != nil {
		slog.Error("auth upgrade", "err", err)
	}
	s.setCookie(w, r, s.cfg.Auth.NewSession(), auth.SessionSeconds)
	return http.StatusOK, ""
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(io.LimitReader(r.Body, maxFormBody))
	form, _ := url.ParseQuery(string(raw))
	if status, msg := s.checkLogin(w, r, form.Get("password")); status != http.StatusOK {
		writeLogin(w, status, msg)
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func writeLogin(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprintf(w, loginPage, msg)
}

func (s *Server) static(w http.ResponseWriter, r *http.Request, p string) {
	a, ok := s.assets[strings.TrimPrefix(p, "/")]
	if !ok {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		io.WriteString(w, "topilmadi")
		return
	}
	h := w.Header()
	h.Set("Content-Type", a.ctype)
	h.Set("Cache-Control", a.cache)
	h.Set("ETag", a.etag)
	if r.Header.Get("If-None-Match") == a.etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h.Set("Vary", "Accept-Encoding")
	out := a.body
	if a.gz != nil && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		h.Set("Content-Encoding", "gzip")
		out = a.gz
	}
	h.Set("Content-Length", strconv.Itoa(len(out)))
	w.Write(out)
}

// ------------------------------------------------------------------ JSON helpers

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.Encode(v)
}

// writeJSONFor is writeJSON, compressed when the body is large and the client accepts it: the synced
// site data is tens of kilobytes of repetitive text.
func writeJSONFor(w http.ResponseWriter, r *http.Request, status int, v any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		slog.Error("api encode", "path", r.URL.Path, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ichki xato", "code": "internal"})
		return
	}
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Add("Vary", "Accept-Encoding")
	out := buf.Bytes()
	if len(out) >= 1024 && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		var z bytes.Buffer
		gz := gzip.NewWriter(&z)
		if _, err := gz.Write(out); err == nil && gz.Close() == nil {
			h.Set("Content-Encoding", "gzip")
			out = z.Bytes()
		}
	}
	h.Set("Content-Length", strconv.Itoa(len(out)))
	w.WriteHeader(status)
	w.Write(out)
}

type apiFunc func(r *http.Request) (status int, body any, err error)

func (s *Server) handle(pattern string, f apiFunc) {
	s.api.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		status, body, err := f(r)
		var verr *store.ValidationError
		switch {
		case err == nil:
			writeJSONFor(w, r, status, body)
		case errors.As(err, &verr):
			code := verr.Code
			if code == "" {
				code = "validation"
			}
			out := map[string]string{"error": verr.Msg, "code": code}
			if verr.Field != "" {
				out["field"] = verr.Field
			}
			writeJSON(w, http.StatusBadRequest, out)
		case errors.Is(err, store.ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "topilmadi", "code": "not_found"})
		default:
			slog.Error("api", "method", r.Method, "path", r.URL.Path, "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ichki xato", "code": "internal"})
		}
	})
}

var okBody = map[string]bool{"ok": true}

func body(r *http.Request) (map[string]any, error) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxJSONBody))
	if err != nil {
		return nil, &store.ValidationError{Msg: "noto'g'ri so'rov"}
	}
	var b map[string]any
	if len(strings.TrimSpace(string(raw))) > 0 {
		if err := json.Unmarshal(raw, &b); err != nil {
			return nil, &store.ValidationError{Msg: "noto'g'ri so'rov"}
		}
	}
	return b, nil // a nil map reads as empty
}

// id reads a path wildcard that must be a plain number; anything else is a 404 like any unknown path.
func id(r *http.Request, name string) (int64, error) {
	v := r.PathValue(name)
	if v == "" || strings.Trim(v, "0123456789") != "" {
		return 0, store.ErrNotFound
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, store.ErrNotFound
	}
	return n, nil
}

func ids(r *http.Request, names ...string) ([]int64, error) {
	out := make([]int64, len(names))
	for i, n := range names {
		v, err := id(r, n)
		if err != nil {
			return nil, err
		}
		out[i] = v
	}
	return out, nil
}

// ------------------------------------------------------------------ API

func (s *Server) routes() {
	db := s.cfg.Store

	s.api.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "topilmadi"})
	})

	// students
	s.handle("GET /api/students", func(r *http.Request) (int, any, error) {
		students, err := db.Students()
		return 200, map[string]any{"students": students}, err
	})
	s.handle("POST /api/students", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		var names []any
		if store.Truthy(b["names"]) {
			var ok bool
			if names, ok = b["names"].([]any); !ok {
				return 0, nil, &store.ValidationError{Msg: "ismlar ro'yxat bo'lishi kerak"}
			}
		}
		if len(names) > 500 {
			return 0, nil, &store.ValidationError{Msg: "bir yo'la 500 tadan ko'p ism qo'shib bo'lmaydi"}
		}
		added, err := db.AddStudents(names)
		return 201, map[string]int{"added": added}, err
	})
	s.handle("GET /api/students/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		st, err := db.Student(n)
		return 200, st, err
	})
	s.handle("PATCH /api/students/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.UpdateStudent(n, b["name"], b["active"])
	})

	// lessons
	s.handle("GET /api/sessions", func(r *http.Request) (int, any, error) {
		sessions, err := db.Sessions()
		return 200, map[string]any{"sessions": sessions}, err
	})
	s.handle("POST /api/sessions", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		n, err := db.StartSession(b["date"], b["room"], b["topic"], b["para"], 0)
		return 201, map[string]int64{"id": n}, err
	})
	s.handle("GET /api/sessions/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		se, err := db.Session(n)
		return 200, se, err
	})
	s.handle("PATCH /api/sessions/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.UpdateSession(n, b["date"], b["room"], b["topic"], b["para"])
	})
	s.handle("DELETE /api/sessions/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.DeleteSession(n)
	})
	s.handle("POST /api/sessions/{id}/students", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		st, ok := b["student_id"].(float64)
		if !ok || st != float64(int64(st)) {
			return 0, nil, &store.ValidationError{Msg: "talaba noto'g'ri"}
		}
		present := true
		if v, ok := b["present"]; ok {
			present = store.Truthy(v)
		}
		return 200, okBody, db.AddToSession(n, int64(st), present)
	})
	s.handle("POST /api/sessions/{id}/restore", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.RestoreSession(n)
	})
	s.handle("GET /api/free-para", func(r *http.Request) (int, any, error) {
		para, err := db.FreePara(r.URL.Query().Get("date"))
		return 200, map[string]*int{"para": para}, err
	})
	s.handle("GET /api/rooms", func(r *http.Request) (int, any, error) {
		rooms, err := db.Rooms()
		return 200, map[string]any{"rooms": rooms}, err
	})
	s.handle("POST /api/sessions/{id}/finish", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.FinishSession(n, b["topic"], 0)
	})
	s.handle("POST /api/sessions/{id}/all-present", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetAllPresent(n)
	})
	s.handle("PUT /api/sessions/{sid}/students/{st}", func(r *http.Request) (int, any, error) {
		v, err := ids(r, "sid", "st")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		var present *bool
		if _, ok := b["present"]; ok {
			p := store.Truthy(b["present"])
			present = &p
		}
		_, hasGrade := b["grade"]
		if err := db.UpdateMark(v[0], v[1], present, hasGrade, b["grade"]); err != nil {
			return 0, nil, err
		}
		return 200, okBody, nil
	})

	s.handle("GET /api/kpi-marks", func(r *http.Request) (int, any, error) {
		marks, err := db.KPIMarks()
		if err != nil {
			return 0, nil, err
		}
		progress, err := db.KPIProgress()
		if err != nil {
			return 0, nil, err
		}
		steps, err := db.KPISteps()
		return 200, map[string]any{"marks": marks, "progress": progress, "steps": steps}, err
	})
	s.handle("PUT /api/kpi-marks", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetKPIMark(b["period"], b["item"], store.Truthy(b["done"]))
	})
	s.handle("PUT /api/kpi-progress", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		var done *bool
		if v, ok := b["done"]; ok { // a stage and the item's tick change together
			d := store.Truthy(v)
			done = &d
		}
		return 200, okBody, db.SetKPIStep(b["period"], b["item"], b["step"], done)
	})
	s.handle("PUT /api/kpi-steps", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		steps, ok := b["steps"].([]any)
		if !ok {
			return 0, nil, &store.ValidationError{Msg: "bosqichlar ro'yxat bo'lishi kerak"}
		}
		return 200, okBody, db.SetKPISteps(b["item"], steps)
	})
	s.handle("GET /api/notifications", func(r *http.Request) (int, any, error) {
		items, err := db.Notifications()
		unread := 0
		for _, n := range items {
			if n.ReadAt == nil {
				unread++
			}
		}
		return 200, map[string]any{"items": items, "unread": unread}, err
	})
	s.handle("POST /api/notifications/read", func(r *http.Request) (int, any, error) {
		return 200, okBody, db.MarkNotificationsRead()
	})
	s.handle("GET /api/cancelled", func(r *http.Request) (int, any, error) {
		items, err := db.CancelledLessons()
		return 200, map[string]any{"items": items}, err
	})
	s.handle("PUT /api/cancelled", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetLessonCancelled(b["date"], b["para"], b["subject"], store.Truthy(b["cancelled"]))
	})
	// the teacher's own lesson plans and each subject's topic list
	s.handle("GET /api/plans", func(r *http.Request) (int, any, error) {
		plans, err := db.LessonPlans()
		if err != nil {
			return 0, nil, err
		}
		topics, err := db.CourseTopics()
		return 200, map[string]any{"plans": plans, "topics": topics}, err
	})
	s.handle("PUT /api/plans", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetLessonPlan(b["date"], b["para"], b["subject"], b["group"], b["topic"], b["items"], b["ready"], b["outcome"])
	})
	s.handle("PUT /api/course-topics", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		topics, ok := b["topics"].([]any)
		if !ok && b["topics"] != nil {
			return 0, nil, &store.ValidationError{Msg: "mavzular ro'yxat bo'lishi kerak"}
		}
		return 200, okBody, db.SetCourseTopics(b["subject"], topics)
	})
	s.handle("GET /api/subject-styles", func(r *http.Request) (int, any, error) {
		styles, err := db.SubjectStyles()
		return 200, map[string]any{"styles": styles}, err
	})
	s.handle("PUT /api/subject-styles", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetSubjectStyles(b["styles"])
	})
	s.handle("GET /api/kpi-works", func(r *http.Request) (int, any, error) {
		works, err := db.KPIWorks()
		return 200, map[string]any{"works": works}, err
	})
	s.handle("POST /api/kpi-works", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		n, err := db.AddKPIWork(b["title"], b["band"])
		return 201, map[string]int64{"id": n}, err
	})
	s.handle("PATCH /api/kpi-works/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetKPIWorkStep(n, b["step"])
	})
	s.handle("DELETE /api/kpi-works/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.DeleteKPIWork(n)
	})
	s.handle("GET /api/course-plan", func(r *http.Request) (int, any, error) {
		v, err := db.CoursePlanHours()
		return 200, map[string]*float64{"hours": v}, err
	})
	s.handle("PUT /api/course-plan", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetCoursePlanHours(b["hours"])
	})
	s.handle("GET /api/backup", func(r *http.Request) (int, any, error) {
		if s.cfg.BackupDir == "" {
			return 200, map[string]any{"last": nil}, nil
		}
		at, err := store.LastBackup(s.cfg.BackupDir)
		if err != nil || at.IsZero() {
			return 200, map[string]any{"last": nil}, err
		}
		return 200, map[string]any{"last": float64(at.Unix())}, nil
	})
	s.handle("POST /api/semester/new", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		path, err := db.NewSemester(b["start"], b["weeks"], b["plan_hours"])
		if err != nil {
			return 0, nil, err
		}
		slog.Info("new semester", "start", b["start"], "backup", path)
		return 200, map[string]any{"ok": true, "backup": path != ""}, nil
	})
	s.handle("GET /api/semester", func(r *http.Request) (int, any, error) {
		v, err := db.Semester()
		return 200, v, err
	})
	s.handle("PUT /api/semester", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetSemester(b["start"], b["weeks"])
	})

	// data synced from digital.oxu.uz
	s.handle("GET /api/oxu", func(r *http.Request) (int, any, error) {
		data, at := s.sync.Snapshot()
		if data == nil {
			return 200, map[string]any{"synced_at": nil, "data": nil}, nil
		}
		return 200, map[string]any{"synced_at": at, "data": json.RawMessage(withFetched(data, at))}, nil
	})
	s.handle("PUT /api/oxu/owner", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetOxuOwner(b["code"])
	})
	s.handle("GET /api/oxu/status", func(r *http.Request) (int, any, error) {
		return 200, s.sync.Status(), nil
	})
	s.handle("POST /api/oxu/sync", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		var warnings []string
		cookie, _ := b["cookie"].(string)
		ctx := context.WithValue(r.Context(), manualKey{}, true)
		if strings.TrimSpace(cookie) != "" {
			warnings, err = s.sync.Replace(ctx, cookie)
		} else {
			warnings, err = s.sync.Now(ctx)
		}
		var wrong *oxu.WrongAccountError
		switch {
		case err == nil:
			return 200, map[string]any{"ok": true, "warnings": warnings}, nil
		case errors.Is(err, errNoOwner):
			return 0, nil, &store.ValidationError{Msg: "Avval o'z ID raqamingizni kiriting", Code: "oxu_no_owner"}
		case errors.As(err, &wrong):
			return 0, nil, &store.ValidationError{Msg: "Bu sessiya boshqa hisobga tegishli (ID " + wrong.Code + "). Hech narsa saqlanmadi.", Code: "oxu_wrong_account"}
		case errors.Is(err, errNoCookie):
			return 0, nil, &store.ValidationError{Msg: "Avval cookie kiriting", Code: "oxu_no_cookie"}
		case errors.Is(err, errBusy):
			return 0, nil, &store.ValidationError{Msg: "Sinxronlash ketmoqda, biroz kuting", Code: "oxu_busy"}
		case errors.Is(err, oxu.ErrSession):
			return 0, nil, &store.ValidationError{Msg: "Sessiya tugagan yoki cookie noto'g'ri. digital.oxu.uz ga qayta kiring va yangi cookie kiriting.", Code: "oxu_session"}
		}
		return 0, nil, &store.ValidationError{Msg: "digital.oxu.uz bilan bog'lanib bo'lmadi", Code: "oxu_unreachable"}
	})
	s.handle("DELETE /api/oxu/cookie", func(r *http.Request) (int, any, error) {
		return 200, okBody, s.sync.Forget()
	})

	// debts and retakes
	s.handle("GET /api/retakes", func(r *http.Request) (int, any, error) {
		rt, err := db.Retakes()
		return 200, rt, err
	})
	s.handle("GET /api/retake-share", func(r *http.Request) (int, any, error) {
		sh, err := db.RetakeShare()
		return 200, map[string]any{"share": sh}, err
	})
	s.handle("POST /api/retake-share", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		sh, err := db.NewRetakeShare(b["title"], b["paras"])
		return 200, map[string]any{"share": sh}, err
	})
	s.handle("DELETE /api/retake-share", func(r *http.Request) (int, any, error) {
		return 200, okBody, db.StopRetakeShare()
	})
	s.handle("PUT /api/retakes/{sid}/{st}", func(r *http.Request) (int, any, error) {
		v, err := ids(r, "sid", "st")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.SetRetake(v[0], v[1], store.Truthy(b["done"]), b["date"], b["time"], b["room"])
	})
}

// withFetched fills in when each section was read for a snapshot written before sections recorded it:
// all of them at the sync's own time, which is what such a sync claimed.
func withFetched(raw []byte, at float64) []byte {
	var probe struct {
		Fetched map[string]float64 `json:"fetched"`
	}
	if json.Unmarshal(raw, &probe) != nil || probe.Fetched != nil {
		return raw
	}
	var all map[string]json.RawMessage
	if json.Unmarshal(raw, &all) != nil {
		return raw
	}
	fetched := map[string]float64{}
	for _, k := range []string{"lessons", "unsaved", "load", "kpi", "periods", "months"} {
		fetched[k] = at
	}
	all["fetched"], _ = json.Marshal(fetched)
	out, err := json.Marshal(all)
	if err != nil {
		return raw
	}
	return out
}
