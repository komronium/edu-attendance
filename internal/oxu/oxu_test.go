package oxu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/net/html"
)

// Invented fixtures with the same markup as the real pages.
const schedulePage = `<div class="day-section"><div class="day-header"><span class="day-name">Dushanba</span>
<span class="day-date">2026-11-02</span><span class="day-count">1 ta dars</span></div><div class="lessons-grid">
<div class="lesson-card"><div class="lesson-body-row"><div class="lesson-time"><div class="para-num">7</div>
<div class="time-text"> 17:50 - 19:10 </div></div><div class="lesson-details"><div class="fan-name">Algoritmlar</div>
<div class="meta-row"><span class="lesson-badge badge-type"><i class="lni"></i> Amaliyot</span>
<span class="lesson-badge badge-guruh"><i class="lni"></i> K4-ATT-25</span>
<span class="lesson-badge badge-offline"><i class="lni"></i> Auditoriya</span></div>
<div> <i class="lni"></i> 4-o'quv bino, 306-xona </div></div></div>
<div class="lesson-footer"><a class="btn-davomat" href="/davomat_uqituvchi.asp?dars=5&guruh=6&patok=0">Davomat</a></div></div></div></div>`

// the unsaved-lessons page as the site sends it (2026-11-12, trimmed): title, a "Jami: N" badge, the table
const unsavedHead = `<title>Davomati saqlanmagan darslar</title><div class="card-header"><div>Davomati saqlanmagan darslar</div> <span class="jami-badge">Jami: %d</span></div>`
const unsavedPage = `<title>Davomati saqlanmagan darslar</title><div class="card-header"><div>Davomati saqlanmagan darslar</div> <span class="jami-badge">Jami: 1</span></div>
<table id="example"><thead><tr><th>N</th><th>Sana</th><th>Para</th><th>Fan</th><th>Dars turi</th><th>Guruh</th><th>Xona</th><th>Davomat</th></tr></thead><tbody>
<tr><td>1</td><td data-order="2026-10-17"> 2026-10-17<br><span class="kun-badge kun-eski">19 kun oldin</span></td><td>3-para<br><small class="text-muted">11:30 - 12:50</small></td><td>Informatika</td><td>Amaliyot</td><td>14-OHI-26</td><td>2-bino</td>
<td><a class="btn" href="davomat_uqituvchi.asp?dars=9&guruh=8&patok=0">Davomat</a><button class="btn btn-saqlash" data-dars="9">Saqlash</button></td></tr></tbody></table>`

const loadForm = `<form method="get"><select name="ses"><option value="0">Tanlanmagan</option><option value="8">2025-2026 Bahorgi semestr</option>
<option value="9">2026-2027 Kuzgi semestr</option><option value="10">2026-2027 Bahorgi semestr</option></select>
<select name="teacher"><option value="0">Lavozimni tanlang</option><option value="77">stajyor-o'qituvchi</option></select></form>`

const loadTables = `<table><tr><th>M Kod</th><th>F I O</th><th>Kafedra</th><th>Lavozim</th><th>Hissasi</th><th>Jami Yuklamasi</th><th colspan="2">Shundan</th><th>Taqsimot holati</th></tr>
<tr><th>Maruza</th><th>Auditoriyaviy emas</th></tr><tr><td>1</td><td>Test Ism</td><td>Kafedra</td><td>o'qituvchi</td><td>1</td><td>156</td><td>46</td><td>0</td><td>0</td></tr></table>
<table><tr><th>N</th><th>id</th><th>Guruh</th><th>Fan nomi</th><th>Dars turi</th><th>Soat</th><th>Talaba soni</th><th>Reyting</th><th>Boshqa</th><th>Jami</th></tr>
<tr><th colspan="10">1-Semestr</th></tr><tr><td>1</td><td>5</td><td>K-1</td><td>Fan</td><td>Ma'ruza</td><td>16</td><td>81</td><td>0</td><td>0</td><td>16</td></tr>
<tr><td colspan="9">Jami</td><td>16</td></tr></table>`

const kpiCabinet = `<table><tr><th>Band</th><th>Str.</th><th>Vazn</th><th>Soni</th><th>Ball</th><th>Cheklov</th></tr>
<tr><td>Mahalliy OAK maqola min talab: 2</td><td>A</td><td>1</td><td>1</td><td>1.00</td><td>2</td></tr></table>`

const kpiResults = `<table><tr><th>N</th><th>Ish nomi va Tafsilotlar</th><th>Band</th><th>Sana</th><th>Mual.</th><th>Fayl</th><th>Holat</th><th>Amallar</th></tr>
<tr><td>1</td><td>Maqola nomi</td><td>Mahalliy OAK maqola</td><td>2026-09-25</td><td>1</td><td>yo'q</td><td>Tasdiqlandi</td><td></td></tr></table>`

const monthsPage = `<table><tr><th>Oy</th><th>KPI natijasi</th><th>KPI %</th><th>Qo'shimcha summa</th><th>Oklad</th><th>Ustama</th><th>KPI ustamasi</th><th>Ilmiylik</th><th>Jami maosh</th><th>Holat</th><th></th></tr>
<tr><td>Oktabr</td><td>29 / 50 ball</td><td>29%</td><td>111</td><td>222222</td><td>333</td><td>444</td><td>555</td><td>999999</td><td>Taxminiy</td><td></td></tr>
<tr><td>Jami hisoblangan</td><td></td><td></td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td></td><td></td></tr></table>`

const ratingStart = `<select name="lavozim"><option value="0">Tanlanmagan</option><option value="77">o'qituvchi</option></select>`
const ratingMonths = `<select name="davr"><option value="0">Tanlanmagan</option><option value="64">2026 — Oktabr</option></select>`
const ratingPage = `<div class="kpi-stats"><div class="kpi-stat"><div class="kpi-stat__val">29</div><div class="kpi-stat__lbl">Jami ballim</div></div>
<div class="kpi-stat"><div class="kpi-stat__val">29%</div><div class="kpi-stat__lbl">Okladga ustama</div></div>
<div class="kpi-stat"><div class="kpi-stat__val">7 654 321</div><div class="kpi-stat__lbl">Kutilayotgan maosh (qo'lga)</div></div></div>
<div class="kpi-card"><div class="kpi-card__body"><h6 class="kpi-card__title">Maqola</h6><div class="kpi-mini__val"> 5 </div><div class="kpi-mini__lbl"> max 5 · min 0 </div>
<div><p><b>Mezonlar:</b></p><ul><li>1.1 birinchi</li><li>1.2 ikkinchi</li></ul></div></div><div class="kpi-card__foot"><button>Baholar tarixi (1)</button></div></div>
<div class="kpi-card"><div class="kpi-card__body"><h6 class="kpi-card__title">Jarima</h6><div class="kpi-mini__val"> -1 </div><div class="kpi-mini__lbl"> max 0 · min -5 </div></div><div class="kpi-card__foot">Baholar tarixi (0)</div></div>`

func site(t *testing.T, routes map[string]string) (*Client, *[]string) {
	t.Helper()
	var cookies []string
	var mu sync.Mutex // timetable pages are read in parallel
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		cookies = append(cookies, r.Header.Get("Cookie"))
		mu.Unlock()
		if r.Method != http.MethodGet {
			t.Errorf("sync must only GET, got %s %s", r.Method, r.URL)
		}
		body, ok := routes[r.URL.RequestURI()]
		if !ok {
			body, ok = routes[r.URL.Path]
		}
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(`<select name="role"></select>` + body))
	}))
	t.Cleanup(srv.Close)
	c, err := newClient(srv.URL, "Cookie: ASPSESSIONIDX=abc")
	if err != nil {
		t.Fatal(err)
	}
	c.now = func() time.Time { return time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC) }
	return c, &cookies
}

func fullSite() map[string]string {
	return map[string]string{
		"/kabinet.asp":                                 `<h4>Maxsus kod: 123456</h4>`,
		"/uqituvchi_dars_jadvali.asp":                  schedulePage,
		"/mening_yuklamam.asp":                         loadForm,
		"/mening_yuklamam.asp?ses=9&teacher=77":        loadTables,
		"/uqituvchi_saqlanmagan_darslar.asp":           unsavedPage,
		"/ilmiy/kpi_kabinet.asp":                       kpiCabinet,
		"/ilmiy/kpi_natijalar.asp":                     kpiResults,
		"/kpi/mening_reytingim.asp":                    ratingStart,
		"/kpi/mening_reytingim.asp?lavozim=77":         ratingMonths,
		"/kpi/mening_reytingim.asp?davr=64&lavozim=77": ratingPage,
		"/kpi/mening_kpi_oylar.asp":                    monthsPage,
	}
}

func TestSyncReadsEverySection(t *testing.T) {
	c, cookies := site(t, fullSite())
	d, warnings, err := c.Sync(context.Background(), "123456", nil)
	if err != nil || len(warnings) != 0 {
		t.Fatalf("%v %v", err, warnings)
	}
	want := Lesson{Date: "2026-11-02", Para: "7", Time: "17:50 - 19:10", Subject: "Algoritmlar", Type: "Amaliyot", Group: "K4-ATT-25", Room: "4-o'quv bino, 306-xona",
		URL: "/davomat_uqituvchi.asp?dars=5&guruh=6&patok=0"}
	// 5 November counts back to 15 August: weeks -12..+2, the fixture answers each with one lesson
	if len(d.Lessons) != 15 || d.Lessons[0] != want {
		t.Fatalf("lessons: %+v", d.Lessons)
	}
	wantUnsaved := Lesson{Date: "2026-10-17", Para: "3", Time: "11:30 - 12:50", Subject: "Informatika", Type: "Amaliyot", Group: "14-OHI-26", Room: "2-bino",
		URL: "/davomat_uqituvchi.asp?dars=9&guruh=8&patok=0"}
	if len(d.Unsaved) != 1 || d.Unsaved[0] != wantUnsaved {
		t.Fatalf("unsaved: %+v", d.Unsaved)
	}
	if d.Load.Start != "2026-08-15" {
		t.Fatalf("start: %s", d.Load.Start)
	}
	if d.Load.Semester != "2026-2027 Kuzgi semestr" || d.Load.Total != "156" || d.Load.Lectures != "46" || len(d.Load.Items) != 1 || d.Load.Items[0].Students != "81" {
		t.Fatalf("load: %+v", d.Load)
	}
	if len(d.KPI.Bands) != 1 || d.KPI.Bands[0].Name != "Mahalliy OAK maqola" || d.KPI.Bands[0].Score != "1.00" || d.KPI.Bands[0].Min != "2" {
		t.Fatalf("bands: %+v", d.KPI.Bands)
	}
	if len(d.KPI.Papers) != 1 || d.KPI.Papers[0].Status != "Tasdiqlandi" {
		t.Fatalf("papers: %+v", d.KPI.Papers)
	}
	if len(d.Months) != 1 || d.Months[0] != (Month{"Oktabr", "29 / 50 ball", "29%", "Taxminiy"}) {
		t.Fatalf("months: %+v", d.Months)
	}
	if len(d.Periods) != 1 {
		t.Fatalf("periods: %+v", d.Periods)
	}
	p := d.Periods[0]
	if p.Label != "2026 — Oktabr" || p.Score != "29" || p.Bonus != "29%" || len(p.Items) != 2 {
		t.Fatalf("period: %+v", p)
	}
	if i := p.Items[0]; i.Title != "Maqola" || i.Value != "5" || i.Max != "5" || i.Min != "0" || i.Graded != 1 || len(i.Criteria) != 2 {
		t.Fatalf("item: %+v", i)
	}
	if i := p.Items[1]; i.Value != "-1" || i.Max != "0" || i.Min != "-5" || i.Graded != 0 {
		t.Fatalf("penalty: %+v", i)
	}
	for _, got := range *cookies {
		if got != "ASPSESSIONIDX=abc" {
			t.Fatalf("cookie header: %q", got)
		}
	}
}

func TestSalaryNeverEntersTheData(t *testing.T) {
	c, _ := site(t, fullSite())
	d, _, err := c.Sync(context.Background(), "123456", nil)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(d)
	for _, money := range []string{"222222", "999999", "7 654 321", "maosh"} {
		if strings.Contains(string(raw), money) {
			t.Fatalf("salary figure %s leaked into %s", money, raw)
		}
	}
}

func TestExpiredSessionStopsSync(t *testing.T) {
	routes := fullSite()
	routes["/uqituvchi_dars_jadvali.asp"] = `<form><input name="login"><button name="avtorizatsiya"></button></form>`
	// the login form comes back on its own, without the logged-in layout
	c, _ := site(t, routes)
	if _, _, err := c.Sync(context.Background(), "123456", nil); !errors.Is(err, ErrSession) {
		t.Fatalf("want ErrSession, got %v", err)
	}
}

// This is what the real site does for an invalid session.
func TestDeniedEverywhereIsAnExpiredSession(t *testing.T) {
	srv := httptest.NewServer(http.RedirectHandler("/ruhsat_berilmagan.asp?return_url=x", http.StatusFound))
	defer srv.Close()
	c, err := newClient(srv.URL, "a=b")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := c.Sync(context.Background(), "123456", nil); !errors.Is(err, ErrSession) {
		t.Fatalf("want ErrSession, got %v", err)
	}
}

func TestDeniedSectionWarnsAndKeepsPreviousValue(t *testing.T) {
	mux := http.NewServeMux()
	routes := fullSite()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/kpi/mening_kpi_oylar.asp" {
			http.Redirect(w, r, "/ruhsat_berilmagan.asp", http.StatusFound)
			return
		}
		body, ok := routes[r.URL.RequestURI()]
		if !ok {
			body = routes[r.URL.Path]
		}
		w.Write([]byte(`<select name="role"></select>` + body))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c, _ := newClient(srv.URL, "a=b")
	c.now = func() time.Time { return time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC) }
	d, warnings, err := c.Sync(context.Background(), "123456", &Data{Months: []Month{{Month: "eski"}}})
	if err != nil || len(warnings) != 1 || !strings.Contains(warnings[0], "ruxsat") {
		t.Fatalf("%v %v", err, warnings)
	}
	if d.Months[0].Month != "eski" || len(d.Lessons) == 0 {
		t.Fatalf("%+v", d)
	}
}

// A page without the logged-in layout must never be parsed into an empty result.
func TestPageWithoutLoggedInLayoutNeverBlanksData(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><body>texnik ishlar</body></html>"))
	}))
	defer srv.Close()
	c, _ := newClient(srv.URL, "a=b")
	if _, _, err := c.Sync(context.Background(), "123456", &Data{Lessons: []Lesson{{Subject: "eski"}}}); !errors.Is(err, ErrSession) {
		t.Fatalf("want ErrSession, got %v", err)
	}
}

func TestFailedSectionKeepsPreviousValue(t *testing.T) {
	routes := fullSite()
	delete(routes, "/ilmiy/kpi_kabinet.asp")
	c, _ := site(t, routes)
	prev := &Data{KPI: &KPI{Bands: []KPIBand{{Name: "eski"}}}}
	d, warnings, err := c.Sync(context.Background(), "123456", prev)
	if err != nil {
		t.Fatal(err)
	}
	if len(warnings) != 1 || !strings.HasPrefix(warnings[0], "ilmiy KPI") {
		t.Fatalf("warnings: %v", warnings)
	}
	if d.KPI.Bands[0].Name != "eski" || len(d.Lessons) == 0 {
		t.Fatalf("%+v", d)
	}
}

// Attendance pages may have effects, and the Saqlash button writes: neither is ever requested.
func TestSyncNeverOpensAttendancePages(t *testing.T) {
	var seen []string
	var seenMu sync.Mutex
	routes := fullSite()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenMu.Lock()
		seen = append(seen, r.URL.Path)
		seenMu.Unlock()
		body, ok := routes[r.URL.RequestURI()]
		if !ok {
			body = routes[r.URL.Path]
		}
		w.Write([]byte(`<select name="role"></select>` + body))
	}))
	defer srv.Close()
	c, _ := newClient(srv.URL, "a=b")
	c.now = func() time.Time { return time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC) }
	if _, _, err := c.Sync(context.Background(), "123456", nil); err != nil {
		t.Fatal(err)
	}
	for _, p := range seen {
		if strings.Contains(p, "davomat") {
			t.Fatalf("fetched %s", p)
		}
	}
}

func TestOnlyAttendanceLinksAreKept(t *testing.T) {
	for href, want := range map[string]string{
		"/davomat_uqituvchi.asp?dars=1":                "/davomat_uqituvchi.asp?dars=1",
		"davomat_uqituvchi.asp?dars=1":                 "/davomat_uqituvchi.asp?dars=1",
		"https://evil.example/davomat_uqituvchi.asp?x": "",
		"javascript:alert(1)":                          "",
		"/other.asp":                                   "",
	} {
		doc, _ := html.Parse(strings.NewReader(`<a href="` + href + `">x</a>`))
		if got := attendanceLink(doc); got != want {
			t.Errorf("%s: %q", href, got)
		}
	}
}

func TestAnotherPersonsSessionIsRefused(t *testing.T) {
	routes := fullSite()
	routes["/kabinet.asp"] = `<h4>Maxsus kod: 999999</h4>`
	c, cookies := site(t, routes)
	_, _, err := c.Sync(context.Background(), "123456", nil)
	var wrong *WrongAccountError
	if !errors.As(err, &wrong) || wrong.Code != "999999" {
		t.Fatalf("want wrong account, got %v", err)
	}
	if len(*cookies) != 1 {
		t.Fatalf("nothing else may be read from that account: %d requests", len(*cookies))
	}
}

func TestUnreadableAccountIsRefused(t *testing.T) {
	routes := fullSite()
	routes["/kabinet.asp"] = `<h4>sahifa o'zgardi</h4>`
	c, _ := site(t, routes)
	if d, _, err := c.Sync(context.Background(), "123456", nil); err == nil || d != nil {
		t.Fatalf("must fail closed: %+v %v", d, err)
	}
}

// Another person can log in with the same cookie while a sync is running.
func TestAccountChangingDuringSyncIsRefused(t *testing.T) {
	routes := fullSite()
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := routes[r.URL.RequestURI()]
		if !ok {
			body = routes[r.URL.Path]
		}
		if r.URL.Path == "/kabinet.asp" {
			if n++; n > 1 {
				body = `<h4>Maxsus kod: 999999</h4>`
			}
		}
		w.Write([]byte(`<select name="role"></select>` + body))
	}))
	defer srv.Close()
	c, _ := newClient(srv.URL, "a=b")
	c.now = func() time.Time { return time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC) }
	var wrong *WrongAccountError
	if d, _, err := c.Sync(context.Background(), "123456", nil); !errors.As(err, &wrong) || d != nil {
		t.Fatalf("%+v %v", d, err)
	}
}

func TestDataIsTaggedWithItsOwner(t *testing.T) {
	c, _ := site(t, fullSite())
	d, _, err := c.Sync(context.Background(), "123456", nil)
	if err != nil || d.Account != "123456" {
		t.Fatalf("%+v %v", d, err)
	}
}

func TestBadCookiesAreRejected(t *testing.T) {
	for _, bad := range []string{"", "   ", "Cookie:", "a=b\r\nX-Evil: 1", strings.Repeat("x", 9000)} {
		if _, err := New(bad); !errors.Is(err, ErrSession) {
			t.Errorf("%q: %v", bad, err)
		}
	}
}

func TestCurrentSemester(t *testing.T) {
	for _, c := range []struct {
		m    time.Month
		y    int
		want string
	}{{time.November, 2026, "2026-2027 Kuzgi"}, {time.January, 2027, "2026-2027 Kuzgi"}, {time.March, 2027, "2026-2027 Bahorgi"}, {time.August, 2027, "2027-2028 Kuzgi"}} {
		if got := currentSemester(time.Date(c.y, c.m, 10, 0, 0, 0, 0, time.UTC)); got != c.want {
			t.Errorf("%v %d: %s", c.m, c.y, got)
		}
	}
}

func TestEachSectionRecordsWhenItWasRead(t *testing.T) {
	routes := fullSite()
	delete(routes, "/uqituvchi_saqlanmagan_darslar.asp")
	c, _ := site(t, routes)
	old := float64(time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC).Unix())
	prev := &Data{Unsaved: []Lesson{{Date: "2026-10-30", Para: "3"}}, Fetched: map[string]float64{"unsaved": old, "load": old}}
	d, warnings, err := c.Sync(context.Background(), "123456", prev)
	if err != nil {
		t.Fatal(err)
	}
	now := float64(c.now().Unix())
	for _, s := range []string{"lessons", "load", "kpi", "periods", "months"} {
		if d.Fetched[s] != now {
			t.Errorf("%s fetched at %v, want %v", s, d.Fetched[s], now)
		}
	}
	// the section that failed keeps its old list and its old time: it did not get any fresher
	if d.Fetched["unsaved"] != old || len(d.Unsaved) != 1 {
		t.Fatalf("unsaved: %v %v", d.Fetched["unsaved"], d.Unsaved)
	}
	if prev.Fetched["load"] != old {
		t.Fatal("the previous data's times were changed in place")
	}
	if len(d.Warnings) != 1 || len(warnings) != 1 {
		t.Fatalf("warnings %v / %v", d.Warnings, warnings)
	}
}

func TestUnsavedPageThatChangedKeepsTheOldList(t *testing.T) {
	routes := fullSite()
	// eight cells per row, but nothing that reads as a date and a para
	routes["/uqituvchi_saqlanmagan_darslar.asp"] = fmt.Sprintf(unsavedHead, 1) + `<table><tr><td>1</td><td>bugun</td><td>uchinchi</td><td>Fan</td><td>Amaliy</td><td>G</td><td>X</td><td></td></tr></table>`
	c, _ := site(t, routes)
	prev := &Data{Unsaved: []Lesson{{Date: "2026-10-30", Para: "3"}}}
	d, warnings, err := c.Sync(context.Background(), "123456", prev)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Unsaved) != 1 || len(warnings) != 1 || !strings.HasPrefix(warnings[0], "davomat holati") {
		t.Fatalf("unsaved %v, warnings %v", d.Unsaved, warnings)
	}
	if _, ok := d.Fetched["unsaved"]; ok {
		t.Fatal("an unreadable page must not count as read")
	}
}

func TestUnsavedPageWithoutTableIsEmpty(t *testing.T) {
	routes := fullSite()
	routes["/uqituvchi_saqlanmagan_darslar.asp"] = fmt.Sprintf(unsavedHead, 0) + `<p class="text-muted">Hozircha davomati saqlanmagan dars yo'q.</p>`
	c, _ := site(t, routes)
	d, warnings, err := c.Sync(context.Background(), "123456", &Data{Unsaved: []Lesson{{Date: "2026-10-30", Para: "3"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Unsaved) != 0 || len(warnings) != 0 || d.Fetched["unsaved"] == 0 {
		t.Fatalf("unsaved %v, warnings %v, fetched %v", d.Unsaved, warnings, d.Fetched)
	}
}

func TestWeekPagesComeBackInOrderAFewAtATime(t *testing.T) {
	var mu sync.Mutex
	inFlight, most := 0, 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		inFlight++
		if inFlight > most {
			most = inFlight
		}
		mu.Unlock()
		time.Sleep(20 * time.Millisecond)
		mu.Lock()
		inFlight--
		mu.Unlock()
		week := r.URL.Query().Get("week")
		if week == "" {
			week = "0"
		}
		fmt.Fprintf(w, `<select name="role"></select><div class="day-section"><span class="day-date">%s</span><div class="lesson-card"><span class="para-num">1</span><span class="fan-name">Fan</span></div></div>`, week)
	}))
	defer srv.Close()
	c, err := newClient(srv.URL, "ASPSESSIONIDX=abc")
	if err != nil {
		t.Fatal(err)
	}
	c.now = func() time.Time { return time.Date(2026, 12, 20, 12, 0, 0, 0, time.UTC) } // late in the semester: many weeks
	lessons, err := c.lessons(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(lessons) < 15 {
		t.Fatalf("only %d weeks read", len(lessons))
	}
	for i := 1; i < len(lessons); i++ {
		a, _ := strconv.Atoi(lessons[i-1].Date)
		b, _ := strconv.Atoi(lessons[i].Date)
		if b != a+1 {
			t.Fatalf("weeks out of order at %d: %s then %s", i, lessons[i-1].Date, lessons[i].Date)
		}
	}
	if most > weekPagesAtOnce || most < 2 {
		t.Fatalf("%d pages at once, want 2..%d", most, weekPagesAtOnce)
	}
}

// the site's own count must match what could be read, and a page that is not this page proves nothing
func TestUnsavedPageIsRecognisedByTitleAndCount(t *testing.T) {
	parse := func(body string) ([]Lesson, bool) {
		doc, err := html.Parse(strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		return parseUnsaved(doc)
	}
	if l, ok := parse(unsavedPage); !ok || len(l) != 1 || l[0].Time != "11:30 - 12:50" || l[0].Group != "14-OHI-26" {
		t.Fatalf("the real page: %v %v", l, ok)
	}
	if l, ok := parse(fmt.Sprintf(unsavedHead, 0)); !ok || len(l) != 0 {
		t.Fatalf("empty list: %v %v", l, ok)
	}
	// the badge says 3 but only one row can be read: the page changed
	if _, ok := parse(strings.Replace(unsavedPage, "Jami: 1", "Jami: 3", 1)); ok {
		t.Fatal("a count that does not match the rows was accepted")
	}
	// the badge says 2 and there are no rows at all
	if _, ok := parse(fmt.Sprintf(unsavedHead, 2)); ok {
		t.Fatal("rows missing but accepted")
	}
	// a page that is not the unsaved-lessons page (no title) never means "nothing is missing"
	if _, ok := parse(`<h1>Xatolik</h1><p>Server band</p>`); ok {
		t.Fatal("an unrelated page was read as an empty list")
	}
	if _, ok := parse(`<table><tr><td>x</td></tr></table>`); ok {
		t.Fatal("a table without the title was accepted")
	}
}
