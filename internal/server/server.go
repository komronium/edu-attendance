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
<title>attendance</title><script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head>
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

func (s *Server) setCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteStrictMode,
		Secure: s.cfg.SecureCookie || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func isPublic(p string) bool {
	return strings.HasPrefix(p, "/fonts/") || strings.HasPrefix(p, "/app.css") || p == "/theme.js"
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	switch {
	case p == "/healthz":
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	case p == "/login":
		writeLogin(w, http.StatusOK, "")
	case p == "/logout":
		s.setCookie(w, r, "", -1)
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	case isPublic(p):
		s.static(w, r, p)
	case strings.HasPrefix(p, "/q/"): // the students' retakes page: the secret in the link is the key
		s.publicRetakes(w, r, strings.TrimPrefix(p, "/q/"))
	case !s.authed(r):
		if strings.HasPrefix(p, "/api/") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "kirish kerak"})
		} else {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
		}
	case strings.HasPrefix(p, "/api/"):
		s.api.ServeHTTP(w, r)
	case p == "/":
		s.static(w, r, "/index.html")
	default:
		s.static(w, r, p)
	}
}

func (s *Server) mutate(w http.ResponseWriter, r *http.Request) {
	if !s.authed(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "kirish kerak"})
		return
	}
	if r.Header.Get("X-Requested-With") != "attendance" { // a cross-site form cannot set this header
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "ruxsat yo'q"})
		return
	}
	s.api.ServeHTTP(w, r)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if s.cfg.Auth.Locked(ip) {
		writeLogin(w, http.StatusTooManyRequests, "juda ko'p urinish, bir necha daqiqadan keyin qayta urining")
		return
	}
	raw, _ := io.ReadAll(io.LimitReader(r.Body, maxFormBody))
	form, _ := url.ParseQuery(string(raw))
	if s.cfg.Auth.CheckPassword(form.Get("password")) {
		s.cfg.Auth.Succeed(ip)
		s.setCookie(w, r, s.cfg.Auth.NewSession(), auth.SessionSeconds)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	s.cfg.Auth.Fail(ip)
	writeLogin(w, http.StatusUnauthorized, "parol noto'g'ri")
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

type apiFunc func(r *http.Request) (status int, body any, err error)

func (s *Server) handle(pattern string, f apiFunc) {
	s.api.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		status, body, err := f(r)
		var verr *store.ValidationError
		switch {
		case err == nil:
			writeJSON(w, status, body)
		case errors.As(err, &verr):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": verr.Msg})
		case errors.Is(err, store.ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "topilmadi"})
		default:
			slog.Error("api", "method", r.Method, "path", r.URL.Path, "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ichki xato"})
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
			names = names[:500]
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
		if _, ok := b["present"]; ok {
			if err := db.SetPresent(v[0], v[1], store.Truthy(b["present"])); err != nil {
				return 0, nil, err
			}
		}
		if _, ok := b["grade"]; ok {
			if err := db.SetGrade(v[0], v[1], b["grade"]); err != nil {
				return 0, nil, err
			}
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
		return 200, okBody, db.SetKPIProgress(b["period"], b["item"], b["step"])
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
		return 200, map[string]any{"synced_at": at, "data": json.RawMessage(data)}, nil
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
		fresh := strings.TrimSpace(cookie) != ""
		start := time.Now()
		if fresh {
			warnings, err = s.sync.Replace(r.Context(), cookie)
		} else {
			warnings, err = s.sync.Now(r.Context())
		}
		slog.Info("oxu sync", "new_cookie", fresh, "ok", err == nil, "err", err, "took", time.Since(start).Round(time.Millisecond))
		var wrong *oxu.WrongAccountError
		switch {
		case err == nil:
			return 200, map[string]any{"ok": true, "warnings": warnings}, nil
		case errors.Is(err, errNoOwner):
			return 0, nil, &store.ValidationError{Msg: "Avval o'z ID raqamingizni kiriting"}
		case errors.As(err, &wrong):
			return 0, nil, &store.ValidationError{Msg: "Bu sessiya boshqa hisobga tegishli (ID " + wrong.Code + "). Hech narsa saqlanmadi."}
		case errors.Is(err, errNoCookie):
			return 0, nil, &store.ValidationError{Msg: "Avval cookie kiriting"}
		case errors.Is(err, errBusy):
			return 0, nil, &store.ValidationError{Msg: "Sinxronlash ketmoqda, biroz kuting"}
		case errors.Is(err, oxu.ErrSession):
			return 0, nil, &store.ValidationError{Msg: "Sessiya tugagan yoki cookie noto'g'ri. digital.oxu.uz ga qayta kiring va yangi cookie kiriting."}
		}
		slog.Error("oxu sync", "err", err)
		return 0, nil, &store.ValidationError{Msg: "digital.oxu.uz bilan bog'lanib bo'lmadi"}
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
	s.handle("GET /api/retake-sessions", func(r *http.Request) (int, any, error) {
		rs, err := db.RetakeSessions()
		return 200, map[string]any{"sessions": rs}, err
	})
	s.handle("POST /api/retake-sessions", func(r *http.Request) (int, any, error) {
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		n, err := db.StartRetakeSession(b["date"], 0)
		return 201, map[string]int64{"id": n}, err
	})
	s.handle("GET /api/retake-sessions/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		rs, err := db.RetakeSession(n)
		return 200, rs, err
	})
	s.handle("DELETE /api/retake-sessions/{id}", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.DeleteRetakeSession(n)
	})
	s.handle("PUT /api/retake-sessions/{rid}/items/{sid}/{st}", func(r *http.Request) (int, any, error) {
		v, err := ids(r, "rid", "sid", "st")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.AcceptRetake(v[0], v[1], v[2], store.Truthy(b["done"]))
	})
	s.handle("POST /api/retake-sessions/{id}/finish", func(r *http.Request) (int, any, error) {
		n, err := id(r, "id")
		if err != nil {
			return 0, nil, err
		}
		b, err := body(r)
		if err != nil {
			return 0, nil, err
		}
		return 200, okBody, db.FinishRetakeSession(n, b["room"], 0)
	})
}
