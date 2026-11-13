package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"attendance/internal/auth"
	"attendance/internal/oxu"
	"attendance/internal/store"
)

type env struct {
	t      *testing.T
	srv    *httptest.Server
	cookie string
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := auth.Create(filepath.Join(dir, "auth.json"), "parol-123"); err != nil {
		t.Fatal(err)
	}
	a, err := auth.Load(filepath.Join(dir, "auth.json"))
	if err != nil {
		t.Fatal(err)
	}
	web := fstest.MapFS{
		"index.html":       {Data: []byte("<h1>index</h1>")},
		"app.js":           {Data: []byte("// js")},
		"app.css":          {Data: []byte("body{}")},
		"fonts/f.woff2":    {Data: []byte("font")},
		"fonts/LICENSE.md": {Data: []byte("license")},
	}
	h, err := New(Config{Store: db, Auth: a, Web: web, OxuSync: func(_ context.Context, cookie, owner string, prev *oxu.Data) (*oxu.Data, []string, error) {
		switch cookie {
		case "good":
			return &oxu.Data{Account: owner, Lessons: []oxu.Lesson{{Subject: "Fan"}}}, []string{"yuklama: x"}, nil
		case "someone":
			return nil, nil, &oxu.WrongAccountError{Code: "999999"}
		case "offline":
			return nil, nil, context.DeadlineExceeded
		}
		return nil, nil, oxu.ErrSession
	}})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &env{t: t, srv: srv}
}

func (e *env) do(method, path, body string, headers ...string) (*http.Response, string) {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, strings.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var sb strings.Builder
	buf := make([]byte, 4096)
	for {
		n, err := res.Body.Read(buf)
		sb.Write(buf[:n])
		if err != nil {
			break
		}
	}
	return res, sb.String()
}

func (e *env) login() {
	e.t.Helper()
	res, _ := e.do("POST", "/login", "password=parol-123", "Content-Type", "application/x-www-form-urlencoded")
	if res.StatusCode != 303 || res.Header.Get("Location") != "/" {
		e.t.Fatalf("login: %d %v", res.StatusCode, res.Header)
	}
	e.cookie = strings.Split(res.Header.Get("Set-Cookie"), ";")[0]
}

func (e *env) api(method, path, body string) (int, map[string]any) {
	e.t.Helper()
	res, raw := e.do(method, path, body, "Cookie", e.cookie, "X-Requested-With", "attendance", "Content-Type", "application/json")
	var out map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		e.t.Fatalf("%s %s: not JSON: %q", method, path, raw)
	}
	return res.StatusCode, out
}

func TestLoginFlow(t *testing.T) {
	e := newEnv(t)
	if res, _ := e.do("GET", "/", ""); res.StatusCode != 303 || res.Header.Get("Location") != "/login" {
		t.Fatalf("page without session must redirect to /login, got %d", res.StatusCode)
	}
	if res, body := e.do("GET", "/api/students", ""); res.StatusCode != 401 || !strings.Contains(body, "kirish kerak") {
		t.Fatalf("api without session: %d %s", res.StatusCode, body)
	}
	res, body := e.do("POST", "/login", "password=wrong", "Content-Type", "application/x-www-form-urlencoded")
	if res.StatusCode != 401 || !strings.Contains(body, "parol noto'g'ri") {
		t.Fatalf("wrong password: %d", res.StatusCode)
	}
	e.login()
	flags := ""
	res, _ = e.do("POST", "/login", "password=parol-123")
	flags = res.Header.Get("Set-Cookie")
	for _, want := range []string{"HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=43200"} {
		if !strings.Contains(flags, want) {
			t.Errorf("cookie lacks %s: %s", want, flags)
		}
	}
	if strings.Contains(flags, "Secure") {
		t.Error("Secure must only be set behind HTTPS")
	}
	res, _ = e.do("POST", "/login", "password=parol-123", "X-Forwarded-Proto", "https")
	if !strings.Contains(res.Header.Get("Set-Cookie"), "Secure") {
		t.Error("Secure expected behind an HTTPS proxy")
	}
	if res, body := e.do("GET", "/", "", "Cookie", e.cookie); res.StatusCode != 200 || body != "<h1>index</h1>" {
		t.Fatalf("index: %d %q", res.StatusCode, body)
	}
	res, _ = e.do("GET", "/logout", "")
	if res.StatusCode != 303 || !strings.Contains(res.Header.Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("logout must clear the cookie: %v", res.Header)
	}
}

func TestLockoutAfterFiveFailures(t *testing.T) {
	e := newEnv(t)
	for i := 0; i < 5; i++ {
		if res, _ := e.do("POST", "/login", "password=bad"); res.StatusCode != 401 {
			t.Fatalf("attempt %d: %d", i, res.StatusCode)
		}
	}
	res, body := e.do("POST", "/login", "password=parol-123")
	if res.StatusCode != 429 || !strings.Contains(body, "juda ko'p urinish") {
		t.Fatalf("locked login: %d", res.StatusCode)
	}
}

func TestStaticFiles(t *testing.T) {
	e := newEnv(t)
	for _, p := range []string{"/app.css", "/fonts/f.woff2", "/fonts/LICENSE.md"} {
		if res, _ := e.do("GET", p, ""); res.StatusCode != 200 {
			t.Errorf("%s is public: %d", p, res.StatusCode)
		}
	}
	if res, _ := e.do("GET", "/app.js", ""); res.StatusCode != 303 {
		t.Errorf("app.js needs a session: %d", res.StatusCode)
	}
	e.login()
	res, body := e.do("GET", "/app.js", "", "Cookie", e.cookie)
	if res.StatusCode != 200 || body != "// js" || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/javascript") {
		t.Fatalf("app.js: %d %q %s", res.StatusCode, body, res.Header.Get("Content-Type"))
	}
	if res.Header.Get("Cache-Control") != "no-cache" {
		t.Errorf("cache: %s", res.Header.Get("Cache-Control"))
	}
	if res, _ = e.do("GET", "/app.js", "", "Cookie", e.cookie, "If-None-Match", res.Header.Get("ETag")); res.StatusCode != 304 {
		t.Errorf("conditional request: %d", res.StatusCode)
	}
	res, _ = e.do("GET", "/fonts/f.woff2", "")
	if res.Header.Get("Content-Type") != "font/woff2" || !strings.Contains(res.Header.Get("Cache-Control"), "max-age=86400") {
		t.Errorf("font headers: %v", res.Header)
	}
	for _, p := range []string{"/nothing", "/../etc/passwd", "/fonts/", "/fonts"} {
		if res, _ := e.do("GET", p, "", "Cookie", e.cookie); res.StatusCode != 404 {
			t.Errorf("%s: %d", p, res.StatusCode)
		}
	}
	h := res.Header
	if !strings.Contains(h.Get("Content-Security-Policy"), "default-src 'none'") || h.Get("X-Frame-Options") != "DENY" ||
		h.Get("X-Content-Type-Options") != "nosniff" || h.Get("Referrer-Policy") != "no-referrer" {
		t.Errorf("security headers missing: %v", h)
	}
}

func TestTextFilesAreCompressed(t *testing.T) {
	e := newEnv(t)
	req, _ := http.NewRequest("GET", e.srv.URL+"/app.css", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res, err := (&http.Transport{DisableCompression: true}).RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.Header.Get("Content-Encoding") != "gzip" || res.Header.Get("Vary") != "Accept-Encoding" {
		t.Fatalf("%v", res.Header)
	}
	if plain, body := e.do("GET", "/app.css", "", "Accept-Encoding", "identity"); plain.Header.Get("Content-Encoding") != "" || body != "body{}" {
		t.Fatalf("%v %q", plain.Header, body)
	}
}

func TestMutationsNeedSessionAndHeader(t *testing.T) {
	e := newEnv(t)
	if res, _ := e.do("POST", "/api/students", `{"names":["x"]}`, "X-Requested-With", "attendance"); res.StatusCode != 401 {
		t.Fatalf("no session: %d", res.StatusCode)
	}
	e.login()
	res, body := e.do("POST", "/api/students", `{"names":["x"]}`, "Cookie", e.cookie)
	if res.StatusCode != 403 || !strings.Contains(body, "ruxsat yo'q") {
		t.Fatalf("no csrf header: %d %s", res.StatusCode, body)
	}
}

func TestAPIFlow(t *testing.T) {
	e := newEnv(t)
	e.login()

	if st, out := e.api("POST", "/api/students", `{"names":["Ali Valiyev","Vali Aliyev"]}`); st != 201 || out["added"] != 2.0 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("POST", "/api/students", `{"names":"x"}`); st != 400 || out["error"] != "ismlar ro'yxat bo'lishi kerak" {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("POST", "/api/students", `{bad`); st != 400 || out["error"] != "noto'g'ri so'rov" {
		t.Fatalf("%d %v", st, out)
	}
	st, out := e.api("POST", "/api/sessions", `{"date":"2026-10-01","para":1}`)
	if st != 201 {
		t.Fatalf("%d %v", st, out)
	}
	sid := int(out["id"].(float64))
	path := "/api/sessions/" + itoa(sid)

	if st, out = e.api("PUT", path+"/students/1", `{"present":false}`); st != 200 || out["ok"] != true {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("PUT", path+"/students/1", `{"grade":"4,5"}`); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("PUT", path+"/students/1", `{"grade":"zzz"}`); st != 400 || out["error"] != "baho raqam bo'lishi kerak" {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("GET", path, ""); st != 200 || out["came"] != 1.0 || out["total"] != 2.0 || out["finished_at"] != nil {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("POST", path+"/finish", `{"topic":"Kirish"}`); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	st, out = e.api("GET", "/api/retakes", "")
	if st != 200 || out["owed"] != 1.0 || len(out["items"].([]any)) != 1 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("PUT", "/api/retakes/"+itoa(sid)+"/1", `{"done":true,"date":"2026-10-05","time":"9:05","room":"K4"}`); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("GET", "/api/rooms", ""); st != 200 || out["rooms"].([]any)[0] != "K4" {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("GET", "/api/students/1", ""); st != 200 || out["owed"] != 0.0 || out["rate"] != 0.0 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("DELETE", path, ""); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
}

func TestEmptyListsAreArraysNotNull(t *testing.T) {
	e := newEnv(t)
	e.login()
	for path, key := range map[string]string{"/api/students": "students", "/api/sessions": "sessions", "/api/retakes": "items",
		"/api/rooms": "rooms", "/api/plans": "plans"} {
		_, out := e.api("GET", path, "")
		if arr, ok := out[key].([]any); !ok || len(arr) != 0 {
			t.Errorf("%s: %s should be [], got %v", path, key, out[key])
		}
	}
}

func TestNotFoundShapes(t *testing.T) {
	e := newEnv(t)
	e.login()
	for _, c := range [][2]string{{"GET", "/api/students/abc"}, {"GET", "/api/students/-1"}, {"GET", "/api/students/999"},
		{"GET", "/api/nope"}, {"PUT", "/api/students"}, {"GET", "/api/sessions/999"}, {"DELETE", "/api/sessions/999"}} {
		if st, out := e.api(c[0], c[1], ""); st != 404 || out["error"] != "topilmadi" {
			t.Errorf("%s %s: %d %v", c[0], c[1], st, out)
		}
	}
}

func TestOxuSync(t *testing.T) {
	e := newEnv(t)
	if res, _ := e.do("POST", "/api/oxu/sync", `{"cookie":"good"}`, "X-Requested-With", "attendance"); res.StatusCode != 401 {
		t.Fatalf("sync needs a session: %d", res.StatusCode)
	}
	e.login()
	if st, out := e.api("GET", "/api/oxu", ""); st != 200 || out["data"] != nil || out["synced_at"] != nil {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("POST", "/api/oxu/sync", `{"cookie":"good"}`); st != 400 || !strings.Contains(out["error"].(string), "ID raqamingizni") {
		t.Fatalf("no sync before the owner is known: %d %v", st, out)
	}
	if st, out := e.api("PUT", "/api/oxu/owner", `{"code":"123456"}`); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("POST", "/api/oxu/sync", `{"cookie":"someone"}`); st != 400 || !strings.Contains(out["error"].(string), "boshqa hisobga") {
		t.Fatalf("%d %v", st, out)
	}
	if _, out := e.api("GET", "/api/oxu", ""); out["data"] != nil {
		t.Fatalf("nothing may be stored: %v", out)
	}
	if st, out := e.api("POST", "/api/oxu/sync", `{"cookie":"expired"}`); st != 400 || !strings.Contains(out["error"].(string), "Sessiya tugagan") {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("POST", "/api/oxu/sync", `{"cookie":"offline"}`); st != 400 || !strings.Contains(out["error"].(string), "bog'lanib") {
		t.Fatalf("%d %v", st, out)
	}
	st, out := e.api("POST", "/api/oxu/sync", `{"cookie":"good"}`)
	if st != 200 || len(out["warnings"].([]any)) != 1 {
		t.Fatalf("%d %v", st, out)
	}
	st, out = e.api("GET", "/api/oxu", "")
	if st != 200 || out["synced_at"] == nil || len(out["data"].(map[string]any)["lessons"].([]any)) != 1 {
		t.Fatalf("%d %v", st, out)
	}
	if strings.Contains(fmtAny(out), "good") {
		t.Fatal("the cookie must never reach the page")
	}
	st, out = e.api("GET", "/api/oxu/status", "")
	if st != 200 || out["has_cookie"] != true || out["state"] != "ok" || strings.Contains(fmtAny(out), "good") {
		t.Fatalf("%d %v", st, out)
	}
	if st, out = e.api("POST", "/api/oxu/sync", `{}`); st != 200 {
		t.Fatalf("sync now with the saved cookie: %d %v", st, out)
	}
	if st, _ = e.api("DELETE", "/api/oxu/cookie", ""); st != 200 {
		t.Fatal(st)
	}
	if st, out = e.api("POST", "/api/oxu/sync", `{}`); st != 400 || out["error"] != "Avval cookie kiriting" {
		t.Fatalf("%d %v", st, out)
	}
}

func fmtAny(v any) string { b, _ := json.Marshal(v); return string(b) }

func itoa(n int) string { return strconv.Itoa(n) }

func TestPlansAPI(t *testing.T) {
	e := newEnv(t)
	e.login()
	if st, out := e.api("PUT", "/api/plans", `{"date":"2026-11-09","para":3,"subject":"Algoritmlash","group":"2-ATT-25","topic":"Sikllar","items":[{"text":"for"}],"ready":true}`); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("PUT", "/api/course-topics", `{"subject":"Algoritmlash","topics":["Kirish","Sikllar"]}`); st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	if st, out := e.api("PUT", "/api/course-topics", `{"subject":"Algoritmlash","topics":"x"}`); st != 400 {
		t.Fatalf("%d %v", st, out)
	}
	st, out := e.api("GET", "/api/plans", "")
	plans, _ := out["plans"].([]any)
	topics, _ := out["topics"].(map[string]any)
	if st != 200 || len(plans) != 1 || len(topics["Algoritmlash"].([]any)) != 2 {
		t.Fatalf("%d %v", st, out)
	}
}

func TestPublicRetakes(t *testing.T) {
	e := newEnv(t)
	if res, _ := e.do("GET", "/q/anything", ""); res.StatusCode != 404 {
		t.Fatalf("no share yet: %d", res.StatusCode)
	}
	e.login()
	e.api("POST", "/api/students", `{"names":["Valiyev Ali Karim o'g'li","Aliyev Vali"]}`)
	_, out := e.api("POST", "/api/sessions", `{"date":"2026-10-01","para":1}`)
	sid := itoa(int(out["id"].(float64)))
	e.api("PUT", "/api/sessions/"+sid+"/students/1", `{"present":false}`)
	e.api("POST", "/api/sessions/"+sid+"/finish", `{"topic":"Rekursiya"}`)

	st, out := e.api("POST", "/api/retake-share", `{"title":"Algoritmlash · 2-ATT-25","paras":{"1":3,"2":4}}`)
	if st != 200 {
		t.Fatalf("%d %v", st, out)
	}
	token := out["share"].(map[string]any)["token"].(string)
	res, page := e.do("GET", "/q/"+token, "") // no session: the link is the key
	if res.StatusCode != 200 || res.Header.Get("Cache-Control") != "no-store" || !strings.Contains(res.Header.Get("X-Robots-Tag"), "noindex") {
		t.Fatalf("%d %v", res.StatusCode, res.Header)
	}
	for _, want := range []string{"Valiyev A.", "Rekursiya", "1-oktabr, payshanba", "3-para", "Algoritmlash · 2-ATT-25"} {
		if !strings.Contains(page, want) {
			t.Fatalf("page lacks %q:\n%s", want, page)
		}
	}
	if strings.Contains(page, "Karim") || strings.Contains(page, "Aliyev V") {
		t.Fatalf("full name or a student with no debt on the page:\n%s", page)
	}

	// a new link retires the old one, and stopping retires both
	_, out = e.api("POST", "/api/retake-share", `{"title":"x"}`)
	if res, _ := e.do("GET", "/q/"+token, ""); res.StatusCode != 404 {
		t.Fatalf("old link still works: %d", res.StatusCode)
	}
	fresh := out["share"].(map[string]any)["token"].(string)
	e.api("DELETE", "/api/retake-share", "")
	if res, _ := e.do("GET", "/q/"+fresh, ""); res.StatusCode != 404 {
		t.Fatalf("stopped link still works: %d", res.StatusCode)
	}
}

func TestLargeJSONIsGzippedWhenAccepted(t *testing.T) {
	e := newEnv(t)
	e.login()
	names := make([]string, 0, 100)
	for i := 0; i < 100; i++ {
		names = append(names, `"Talaba Nomi `+strconv.Itoa(i)+`"`)
	}
	e.api("POST", "/api/students", `{"names":[`+strings.Join(names, ",")+`]}`)

	res, _ := e.do("GET", "/api/students", "", "Cookie", e.cookie, "Accept-Encoding", "gzip")
	if res.Header.Get("Content-Encoding") != "" { // Go's client would unzip transparently: this one asked itself
		t.Log("client decoded:", res.Header.Get("Content-Encoding"))
	}
	req, _ := http.NewRequest("GET", e.srv.URL+"/api/students", nil)
	req.Header.Set("Cookie", e.cookie)
	req.Header.Set("Accept-Encoding", "gzip")
	raw, err := (&http.Transport{DisableCompression: true}).RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Body.Close()
	if raw.Header.Get("Content-Encoding") != "gzip" || !strings.Contains(raw.Header.Get("Vary"), "Accept-Encoding") {
		t.Fatalf("large body not gzipped: %v", raw.Header)
	}
	// a small body, and a client that does not accept gzip, are left alone
	req2, _ := http.NewRequest("GET", e.srv.URL+"/api/course-plan", nil)
	req2.Header.Set("Cookie", e.cookie)
	req2.Header.Set("Accept-Encoding", "gzip")
	small, _ := (&http.Transport{DisableCompression: true}).RoundTrip(req2)
	defer small.Body.Close()
	if small.Header.Get("Content-Encoding") != "" {
		t.Fatal("a small body was compressed")
	}
	req3, _ := http.NewRequest("GET", e.srv.URL+"/api/students", nil)
	req3.Header.Set("Cookie", e.cookie)
	plain, _ := (&http.Transport{DisableCompression: true}).RoundTrip(req3)
	defer plain.Body.Close()
	if plain.Header.Get("Content-Encoding") != "" {
		t.Fatal("compressed for a client that did not ask")
	}
}

func TestHealthzChecksTheDatabase(t *testing.T) {
	e := newEnv(t)
	_, out := e.do("GET", "/healthz", "")
	if !strings.Contains(out, `"db":true`) {
		t.Fatalf("%s", out)
	}
}
