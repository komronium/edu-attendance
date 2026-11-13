// Package oxu reads the teacher's own data from digital.oxu.uz. The site has no API, so this parses
// its HTML pages, using a session the teacher logged into by hand: login itself has a robot check
// and is deliberately not automated. Everything here is read-only (plain GET requests), and the
// session cookie is only held for the duration of a sync.
//
// Salary columns are never read: only the month, KPI result, KPI % and status of the monthly table.
package oxu

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
)

const (
	baseURL = "https://digital.oxu.uz"
	maxPage = 4 << 20

	lastWeek = 2 // the site publishes the schedule only a little ahead

	weekPagesAtOnce = 3 // timetable pages read in parallel; gentle on the site

	// attendancePage is only ever linked to, never fetched: the teacher opens it in their own
	// browser. Whether merely loading it changes anything on the site is unknown.
	attendancePage = "/davomat_uqituvchi.asp"
)

// ErrSession means the cookie is missing, wrong or expired.
var ErrSession = errors.New("oxu: session expired")

// WrongAccountError means the session belongs to someone else. A browser keeps the same session cookie
// when another person logs in, so a cookie that worked yesterday can be another person's today.
type WrongAccountError struct{ Code string }

func (e *WrongAccountError) Error() string { return "oxu: session belongs to account " + e.Code }

// errDenied means the site refused one page. An invalid session gets this on every page, but a valid
// one can also get it for a page its current role may not open, so one refusal is only a warning.
var errDenied = errors.New("ruxsat yo'q, saytdagi rolni tekshiring")

// Lesson is one entry of the teacher's schedule.
type Lesson struct {
	Date    string `json:"date"`
	Para    string `json:"para"`
	Time    string `json:"time"`
	Subject string `json:"subject"`
	Type    string `json:"type"`
	Group   string `json:"group"`
	Room    string `json:"room"`
	URL     string `json:"url"` // path of the lesson's attendance page on the site
}

// LoadItem is one line of the teaching load.
type LoadItem struct {
	Group    string `json:"group"`
	Subject  string `json:"subject"`
	Type     string `json:"type"`
	Hours    string `json:"hours"`
	Students string `json:"students"`
	Total    string `json:"total"`
}

// Load is the teaching load of one semester.
type Load struct {
	Semester string     `json:"semester"`
	Start    string     `json:"start"` // first day counted as this semester
	Position string     `json:"position"`
	Total    string     `json:"total"`
	Lectures string     `json:"lectures"`
	Items    []LoadItem `json:"items"`
}

// KPIBand is one line of the scientific KPI table.
type KPIBand struct {
	Name   string `json:"name"`
	Weight string `json:"weight"`
	Count  string `json:"count"`
	Score  string `json:"score"`
	Limit  string `json:"limit"`
	Min    string `json:"min,omitempty"` // required count, when the item has one
}

// Paper is one uploaded scientific work.
type Paper struct {
	Title  string `json:"title"`
	Band   string `json:"band"`
	Date   string `json:"date"`
	Status string `json:"status"`
}

// KPI is the scientific KPI.
type KPI struct {
	Bands  []KPIBand `json:"bands"`
	Papers []Paper   `json:"papers"`
}

// Month is one line of the monthly staff KPI, without any money column.
type Month struct {
	Month   string `json:"month"`
	Result  string `json:"result"`
	Percent string `json:"percent"`
	Status  string `json:"status"`
}

// KPIItem is one graded item of the monthly bonus.
type KPIItem struct {
	Title    string   `json:"title"`
	Value    string   `json:"value"`
	Max      string   `json:"max"`
	Min      string   `json:"min"`
	Graded   int      `json:"graded"` // entries in the item's grading history
	Criteria []string `json:"criteria"`
}

// KPIPeriod is the monthly bonus of one month. The page also shows money; only these fields are read.
type KPIPeriod struct {
	Label string    `json:"label"` // "2026 — Oktabr"
	Score string    `json:"score"`
	Bonus string    `json:"bonus"`
	Items []KPIItem `json:"items"`
}

// Data is everything a sync brings in.
type Data struct {
	Account string   `json:"account"` // the account the data was read from
	Lessons []Lesson `json:"lessons"`
	Unsaved []Lesson `json:"unsaved"` // past lessons whose attendance is not saved on the site
	Load    *Load    `json:"load"`
	KPI     *KPI     `json:"kpi"`
	Months  []Month  `json:"months"`

	Periods []KPIPeriod `json:"periods"`

	// Fetched is when each section was last read successfully (unix seconds), by section: lessons,
	// unsaved, load, kpi, periods, months. A section that failed keeps its old value and its old time,
	// so the page can tell how old each part is; the snapshot's own time only says when a sync ran.
	Fetched map[string]float64 `json:"fetched,omitempty"`
	// Warnings are the sections that failed in the sync that wrote this data.
	Warnings []string `json:"warnings,omitempty"`
}

// Client fetches pages with one session cookie.
type Client struct {
	base   string
	cookie string
	http   *http.Client
	now    func() time.Time
}

// New makes a client for the session in cookie (the value of the Cookie header).
func New(cookie string) (*Client, error) { return newClient(baseURL, cookie) }

func newClient(base, cookie string) (*Client, error) {
	cookie = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(cookie), "Cookie:"))
	if cookie == "" || len(cookie) > 8192 || strings.ContainsAny(cookie, "\r\n") {
		return nil, ErrSession
	}
	return &Client{base: base, cookie: cookie, now: time.Now, http: &http.Client{
		Timeout: 10 * time.Second,
		// a refused page answers with a redirect; following it would parse the wrong page
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse // no page we read redirects when it works
		},
	}}, nil
}

func (c *Client) page(ctx context.Context, path string) (*html.Node, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Cookie", c.cookie)
	req.Header.Set("User-Agent", "edu-attendance-sync")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 && res.StatusCode < 400 {
		return nil, errDenied
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: status %d", path, res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxPage))
	if err != nil {
		return nil, err
	}
	if strings.Contains(string(raw), `name="avtorizatsiya"`) { // the login form came back instead
		return nil, ErrSession
	}
	if !strings.Contains(string(raw), `name="role"`) { // every logged-in page has the role selector
		return nil, errDenied
	}
	return html.Parse(strings.NewReader(string(raw)))
}

// Sync reads every section. A section that fails keeps its value from prev and adds a warning;
// an expired session stops the whole sync with ErrSession.
//
// owner is the account the data must belong to. It is checked before anything else is read and again
// at the end, and if it cannot be confirmed nothing is returned.
func Sync(ctx context.Context, cookie, owner string, prev *Data) (*Data, []string, error) {
	c, err := New(cookie)
	if err != nil {
		return nil, nil, err
	}
	return c.Sync(ctx, owner, prev)
}

var accountRe = regexp.MustCompile(`Maxsus kod:?\s*(\d+)`)

func (c *Client) checkAccount(ctx context.Context, owner string) error {
	doc, err := c.page(ctx, "/kabinet.asp")
	if errors.Is(err, errDenied) {
		return ErrSession
	}
	if err != nil {
		return err
	}
	m := accountRe.FindStringSubmatch(text(doc))
	if m == nil {
		return errors.New("oxu: account id not found")
	}
	if m[1] != owner {
		return &WrongAccountError{Code: m[1]}
	}
	return nil
}

// Sync is the package-level Sync on this client.
func (c *Client) Sync(ctx context.Context, owner string, prev *Data) (*Data, []string, error) {
	if err := c.checkAccount(ctx, owner); err != nil {
		return nil, nil, err
	}
	out := Data{}
	if prev != nil {
		out = *prev
	}
	out.Fetched = map[string]float64{}
	if prev != nil {
		for k, v := range prev.Fetched {
			out.Fetched[k] = v
		}
	}
	var warnings []string
	denied := 0
	step := func(name, section string, fn func() error) error {
		err := fn()
		if errors.Is(err, ErrSession) {
			return err
		}
		if err == nil {
			out.Fetched[section] = float64(c.now().Unix())
		}
		if errors.Is(err, errDenied) {
			denied++
		}
		if err != nil {
			warnings = append(warnings, name+": "+err.Error())
		}
		return nil
	}
	steps := []struct {
		name, section string
		fn            func() error
	}{
		{"jadval", "lessons", func() error {
			v, err := c.lessons(ctx)
			if err == nil {
				out.Lessons = v
			}
			return err
		}},
		{"davomat holati", "unsaved", func() error {
			v, err := c.unsaved(ctx)
			if err == nil {
				out.Unsaved = v
			}
			return err
		}},
		{"yuklama", "load", func() error {
			v, err := c.load(ctx)
			if err == nil {
				out.Load = v
			}
			return err
		}},
		{"ilmiy KPI", "kpi", func() error {
			v, err := c.kpi(ctx)
			if err == nil {
				out.KPI = v
			}
			return err
		}},
		{"KPI bandlari", "periods", func() error {
			v, err := c.periods(ctx)
			if err == nil {
				out.Periods = v
			}
			return err
		}},
		{"oylik KPI", "months", func() error {
			v, err := c.months(ctx)
			if err == nil {
				out.Months = v
			}
			return err
		}},
	}
	for _, s := range steps {
		if err := step(s.name, s.section, s.fn); err != nil {
			return nil, nil, err
		}
	}
	if denied == len(steps) {
		return nil, nil, ErrSession
	}
	if err := c.checkAccount(ctx, owner); err != nil { // someone else may have logged in meanwhile
		return nil, nil, err
	}
	out.Account = owner
	out.Warnings = warnings
	return &out, warnings, nil
}

func (c *Client) lessons(ctx context.Context) ([]Lesson, error) {
	out := []Lesson{}
	// the whole semester, because taught hours are counted from the schedule
	now := c.now()
	first := -int(now.Sub(semesterStart(now)).Hours()/(24*7)) - 1
	weeks := make([][]Lesson, lastWeek-first+1)
	errs := make([]error, len(weeks))
	// a few pages at a time: a late-semester sync reads twenty weeks, one by one it nears the time limit
	slots := make(chan struct{}, weekPagesAtOnce)
	var wg sync.WaitGroup
	for i := range weeks {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			path := "/uqituvchi_dars_jadvali.asp"
			if w := first + i; w != 0 {
				path += "?week=" + strconv.Itoa(w)
			}
			doc, err := c.page(ctx, path)
			if err != nil {
				errs[i] = err
				return
			}
			weeks[i] = parseLessons(doc)
		}(i)
	}
	wg.Wait()
	for i := range weeks { // in week order, and the first failure as it would have come one by one
		if errs[i] != nil {
			return nil, errs[i]
		}
		out = append(out, weeks[i]...)
	}
	return out, nil
}

func parseLessons(doc *html.Node) []Lesson {
	out := []Lesson{}
	for _, day := range byClass(doc, "day-section") {
		date := classText(day, "day-date")
		for _, card := range byClass(day, "lesson-card") {
			l := Lesson{Date: date, Para: classText(card, "para-num"), Time: classText(card, "time-text"),
				Subject: classText(card, "fan-name"), Type: classText(card, "badge-type"), Group: classText(card, "badge-guruh")}
			l.URL = attendanceLink(card)
			if details := byClass(card, "lesson-details"); len(details) > 0 {
				// the room is the block that follows the badges
				for n := details[0].LastChild; n != nil; n = n.PrevSibling {
					if n.Type == html.ElementNode && !hasClass(n, "meta-row") && !hasClass(n, "fan-name") {
						l.Room = text(n)
						break
					}
				}
			}
			out = append(out, l)
		}
	}
	return out
}

// attendanceLink finds the link to a lesson's attendance page, and accepts nothing else.
func attendanceLink(root *html.Node) string {
	found := ""
	walk(root, func(n *html.Node) {
		if found != "" || n.Type != html.ElementNode || n.Data != "a" {
			return
		}
		if u, err := url.Parse(attr(n, "href")); err == nil && u.Host == "" && "/"+strings.TrimPrefix(u.Path, "/") == attendancePage {
			found = attendancePage + "?" + u.RawQuery
		}
	})
	return found
}

func (c *Client) unsaved(ctx context.Context) ([]Lesson, error) {
	doc, err := c.page(ctx, "/uqituvchi_saqlanmagan_darslar.asp")
	if err != nil {
		return nil, err
	}
	list, ok := parseUnsaved(doc)
	if !ok {
		return nil, errors.New("sahifa tanilmadi, eski ro'yxat qoldi")
	}
	return list, nil
}

var (
	dateRe = regexp.MustCompile(`\d{4}-\d{2}-\d{2}`)
	paraRe = regexp.MustCompile(`^(\d+)-para`)
	timeRe = regexp.MustCompile(`\d{2}:\d{2} - \d{2}:\d{2}`)
)

// parseUnsaved reads the table N | Sana | Para | Fan | Dars turi | Guruh | Xona | Davomat.
// An empty list has no table at all, which simply means nothing is missing. ok is false when the page
// has rows that look like that table but none of them can be read: the page changed, and an empty
// list would wrongly say that every lesson's attendance is saved.
func parseUnsaved(doc *html.Node) (list []Lesson, ok bool) {
	out := []Lesson{}
	wide := 0 // rows with the table's eight cells
	walk(doc, func(t *html.Node) {
		if t.Type != html.ElementNode || t.Data != "table" {
			return
		}
		walk(t, func(r *html.Node) {
			if r.Type != html.ElementNode || r.Data != "tr" {
				return
			}
			var cells []*html.Node
			for c := r.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && c.Data == "td" {
					cells = append(cells, c)
				}
			}
			if len(cells) < 8 {
				return
			}
			wide++
			date, para := dateRe.FindString(text(cells[1])), paraRe.FindStringSubmatch(text(cells[2]))
			if date == "" || para == nil {
				return
			}
			out = append(out, Lesson{Date: date, Para: para[1], Time: timeRe.FindString(text(cells[2])), Subject: text(cells[3]),
				Type: text(cells[4]), Group: text(cells[5]), Room: text(cells[6]), URL: attendanceLink(cells[7])})
		})
	})
	// The page is recognised only by what the site really puts on it (seen 2026-11-12): the title
	// "Davomati saqlanmagan darslar", and a badge "Jami: N" with the number of rows. A page without that
	// title is some other page (an error, a changed layout) and says nothing about what is saved.
	if !strings.Contains(strings.ToLower(pageTitle(doc)), "saqlanmagan") {
		return out, false
	}
	if m := jamiRe.FindStringSubmatch(classText(doc, "jami-badge")); m != nil {
		n, _ := strconv.Atoi(m[1])
		return out, n == len(out) // the site's own count must match the rows that could be read
	}
	return out, len(out) > 0 || wide == 0 // no badge: an empty list is a page without a table
}

var jamiRe = regexp.MustCompile(`Jami:\s*(\d+)`)

func pageTitle(doc *html.Node) string {
	var title string
	walk(doc, func(n *html.Node) {
		if title == "" && n.Type == html.ElementNode && n.Data == "title" {
			title = text(n)
		}
	})
	return title
}

// semesterStart is a safe lower bound for the first lesson of the semester containing t.
func semesterStart(t time.Time) time.Time {
	y, m := t.Year(), t.Month()
	switch {
	case m >= time.August:
		return time.Date(y, time.August, 15, 0, 0, 0, 0, t.Location())
	case m == time.January:
		return time.Date(y-1, time.August, 15, 0, 0, 0, 0, t.Location())
	}
	return time.Date(y, time.January, 20, 0, 0, 0, 0, t.Location())
}

// currentSemester is the label prefix of the semester containing t, e.g. "2026-2027 Kuzgi".
func currentSemester(t time.Time) string {
	y, m := t.Year(), t.Month()
	switch {
	case m >= time.August:
		return fmt.Sprintf("%d-%d Kuzgi", y, y+1)
	case m == time.January:
		return fmt.Sprintf("%d-%d Kuzgi", y-1, y)
	}
	return fmt.Sprintf("%d-%d Bahorgi", y-1, y)
}

func (c *Client) load(ctx context.Context) (*Load, error) {
	doc, err := c.page(ctx, "/mening_yuklamam.asp")
	if err != nil {
		return nil, err
	}
	semester := currentSemester(c.now())
	ses, sesLabel := "", ""
	for _, o := range selectOptions(doc, "ses") {
		if strings.HasPrefix(o.text, semester) {
			ses, sesLabel = o.value, o.text
		}
	}
	teacher, position := "", ""
	for _, o := range selectOptions(doc, "teacher") {
		if o.value != "" && o.value != "0" {
			teacher, position = o.value, o.text
			break
		}
	}
	if ses == "" || teacher == "" {
		return nil, errors.New("semestr yoki lavozim topilmadi")
	}
	doc, err = c.page(ctx, "/mening_yuklamam.asp?"+url.Values{"ses": {ses}, "teacher": {teacher}}.Encode())
	if err != nil {
		return nil, err
	}
	load := parseLoad(doc)
	if load == nil {
		return nil, errors.New("yuklama jadvali topilmadi")
	}
	load.Semester, load.Position = sesLabel, position
	load.Start = semesterStart(c.now()).Format("2006-01-02")
	return load, nil
}

func parseLoad(doc *html.Node) *Load {
	var load *Load
	for _, t := range tables(doc) {
		if len(t) == 0 || len(t[0]) == 0 {
			continue
		}
		switch t[0][0] {
		case "M Kod":
			if load == nil {
				load = &Load{Items: []LoadItem{}}
			}
			if len(t) > 2 && len(t[2]) >= 7 {
				load.Total, load.Lectures = t[2][5], t[2][6]
			}
		case "N":
			if load == nil {
				load = &Load{Items: []LoadItem{}}
			}
			for _, r := range t[1:] {
				if len(r) >= 10 && isNumber(r[0]) {
					load.Items = append(load.Items, LoadItem{Group: r[2], Subject: r[3], Type: r[4], Hours: r[5], Students: r[6], Total: r[9]})
				}
			}
		}
	}
	return load
}

func (c *Client) kpi(ctx context.Context) (*KPI, error) {
	cabinet, err := c.page(ctx, "/ilmiy/kpi_kabinet.asp")
	if err != nil {
		return nil, err
	}
	results, err := c.page(ctx, "/ilmiy/kpi_natijalar.asp")
	if err != nil {
		return nil, err
	}
	k := &KPI{Bands: parseBands(cabinet), Papers: parsePapers(results)}
	if len(k.Bands) == 0 {
		return nil, errors.New("KPI jadvali topilmadi")
	}
	return k, nil
}

var minTalab = regexp.MustCompile(`\s*min talab:?\s*(\d*).*$`)

func parseBands(doc *html.Node) []KPIBand {
	out := []KPIBand{}
	for _, t := range tables(doc) {
		if len(t) == 0 || len(t[0]) < 6 || t[0][0] != "Band" || t[0][4] != "Ball" {
			continue
		}
		for _, r := range t[1:] {
			if len(r) >= 6 {
				band := KPIBand{Name: minTalab.ReplaceAllString(r[0], ""), Weight: r[2], Count: r[3], Score: r[4], Limit: r[5]}
				if m := minTalab.FindStringSubmatch(r[0]); m != nil {
					band.Min = m[1]
				}
				out = append(out, band)
			}
		}
	}
	return out
}

func parsePapers(doc *html.Node) []Paper {
	out := []Paper{}
	for _, t := range tables(doc) {
		if len(t) == 0 || len(t[0]) < 7 || t[0][0] != "N" || t[0][6] != "Holat" {
			continue
		}
		for _, r := range t[1:] {
			if len(r) >= 7 && isNumber(r[0]) {
				out = append(out, Paper{Title: r[1], Band: r[2], Date: r[3], Status: r[6]})
			}
		}
	}
	return out
}

func (c *Client) periods(ctx context.Context) ([]KPIPeriod, error) {
	const path = "/kpi/mening_reytingim.asp"
	doc, err := c.page(ctx, path)
	if err != nil {
		return nil, err
	}
	position := ""
	for _, o := range selectOptions(doc, "lavozim") {
		if o.value != "" && o.value != "0" {
			position = o.value
			break
		}
	}
	if position == "" {
		return nil, errors.New("lavozim topilmadi")
	}
	if doc, err = c.page(ctx, path+"?"+url.Values{"lavozim": {position}}.Encode()); err != nil {
		return nil, err
	}
	out := []KPIPeriod{}
	for _, o := range selectOptions(doc, "davr") {
		if o.value == "" || o.value == "0" {
			continue
		}
		month, err := c.page(ctx, path+"?"+url.Values{"lavozim": {position}, "davr": {o.value}}.Encode())
		if err != nil {
			return nil, err
		}
		p := parsePeriod(month)
		p.Label = o.text
		out = append(out, p)
	}
	return out, nil
}

var (
	rangeRe   = regexp.MustCompile(`max\s*(-?[\d.]+)\s*·\s*min\s*(-?[\d.]+)`)
	historyRe = regexp.MustCompile(`\((\d+)\)`)
)

// parsePeriod copies named stats only: other stats on this page are money.
func parsePeriod(doc *html.Node) KPIPeriod {
	p := KPIPeriod{Items: []KPIItem{}}
	for _, s := range byClass(doc, "kpi-stat") {
		switch classText(s, "kpi-stat__lbl") {
		case "Jami ballim":
			p.Score = classText(s, "kpi-stat__val")
		case "Okladga ustama":
			p.Bonus = classText(s, "kpi-stat__val")
		}
	}
	for _, card := range byClass(doc, "kpi-card") {
		item := KPIItem{Title: classText(card, "kpi-card__title"), Value: classText(card, "kpi-mini__val"), Criteria: []string{}}
		if m := rangeRe.FindStringSubmatch(classText(card, "kpi-mini__lbl")); m != nil {
			item.Max, item.Min = m[1], m[2]
		}
		if m := historyRe.FindStringSubmatch(classText(card, "kpi-card__foot")); m != nil {
			item.Graded, _ = strconv.Atoi(m[1])
		}
		walk(card, func(n *html.Node) {
			if n.Type == html.ElementNode && n.Data == "li" {
				item.Criteria = append(item.Criteria, text(n))
			}
		})
		p.Items = append(p.Items, item)
	}
	return p
}

func (c *Client) months(ctx context.Context) ([]Month, error) {
	doc, err := c.page(ctx, "/kpi/mening_kpi_oylar.asp")
	if err != nil {
		return nil, err
	}
	out := parseMonths(doc)
	if len(out) == 0 {
		return nil, errors.New("oylik KPI jadvali topilmadi")
	}
	return out, nil
}

var uzMonths = map[string]bool{"Yanvar": true, "Fevral": true, "Mart": true, "Aprel": true, "May": true, "Iyun": true,
	"Iyul": true, "Avgust": true, "Sentabr": true, "Oktabr": true, "Noyabr": true, "Dekabr": true}

// parseMonths takes columns 0, 1, 2 and 9 by position. Columns 3-8 are money and are never copied.
func parseMonths(doc *html.Node) []Month {
	out := []Month{}
	for _, t := range tables(doc) {
		if len(t) == 0 || len(t[0]) < 10 || t[0][0] != "Oy" || t[0][2] != "KPI %" || t[0][9] != "Holat" {
			continue
		}
		for _, r := range t[1:] {
			if len(r) >= 10 && uzMonths[strings.Fields(r[0] + " x")[0]] {
				out = append(out, Month{Month: r[0], Result: r[1], Percent: r[2], Status: r[9]})
			}
		}
	}
	return out
}

// ------------------------------------------------------------------ HTML helpers

func isNumber(s string) bool { _, err := strconv.Atoi(s); return err == nil }

func hasClass(n *html.Node, class string) bool {
	for _, a := range n.Attr {
		if a.Key == "class" {
			for _, c := range strings.Fields(a.Val) {
				if c == class {
					return true
				}
			}
		}
	}
	return false
}

func walk(n *html.Node, fn func(*html.Node)) {
	fn(n)
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		walk(c, fn)
	}
}

func byClass(root *html.Node, class string) []*html.Node {
	var out []*html.Node
	walk(root, func(n *html.Node) {
		if n.Type == html.ElementNode && hasClass(n, class) {
			out = append(out, n)
		}
	})
	return out
}

func text(n *html.Node) string {
	var b strings.Builder
	walk(n, func(x *html.Node) {
		if x.Type == html.TextNode {
			b.WriteString(x.Data + " ")
		}
	})
	return strings.Join(strings.Fields(b.String()), " ")
}

func classText(root *html.Node, class string) string {
	if found := byClass(root, class); len(found) > 0 {
		return text(found[0])
	}
	return ""
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

type option struct{ value, text string }

func selectOptions(doc *html.Node, name string) []option {
	var out []option
	walk(doc, func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "select" && attr(n, "name") == name {
			walk(n, func(o *html.Node) {
				if o.Type == html.ElementNode && o.Data == "option" {
					out = append(out, option{attr(o, "value"), text(o)})
				}
			})
		}
	})
	return out
}

// tables returns every table as rows of cell texts.
func tables(doc *html.Node) [][][]string {
	var out [][][]string
	walk(doc, func(n *html.Node) {
		if n.Type != html.ElementNode || n.Data != "table" {
			return
		}
		var rows [][]string
		walk(n, func(r *html.Node) {
			if r.Type != html.ElementNode || r.Data != "tr" {
				return
			}
			var cells []string
			for c := r.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && (c.Data == "td" || c.Data == "th") {
					cells = append(cells, text(c))
				}
			}
			rows = append(rows, cells)
		})
		out = append(out, rows)
	})
	return out
}
