package server

import (
	"html/template"
	"net/http"
	"sort"
	"strings"
	"time"

	"attendance/internal/store"
)

// The students' page: who owes which lessons and on what topics, behind the secret link the owner
// hands out. It is read-only, carries short names only, and is kept out of search engines and caches.

var uzMonths = []string{"yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"}
var uzWeekdays = []string{"yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"}

func uzDay(iso string) string {
	d, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	return d.Format("2") + "-" + uzMonths[d.Month()-1] + ", " + uzWeekdays[d.Weekday()]
}

type publicLesson struct {
	Day, Topic string
	Para       int64
}

type publicStudent struct {
	Name    string
	Lessons []publicLesson
}

type publicPage struct {
	Title    string
	Updated  string
	Students []publicStudent
	Owed     int
	Retaken  int
}

var publicTmpl = template.Must(template.New("public").Parse(`<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Qayta topshirish{{if .Title}} · {{.Title}}{{end}}</title>
<script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head>
<body class="public"><main class="public-page">
<header class="page-head"><div><h1>Qayta topshirish</h1>
<p class="sub">{{if .Title}}{{.Title}} · {{end}}{{.Updated}} holatiga</p></div></header>
<div class="tiles">
<div class="tile"><span class="label">Qarzi bor talabalar</span><b>{{len .Students}}</b></div>
<div class="tile"><span class="label">Topshirilmagan darslar</span><b>{{.Owed}}</b></div>
<div class="tile"><span class="label">Topshirilgan</span><b>{{.Retaken}}</b></div>
</div>
<p class="sub">Qoldirilgan har bir darsning mavzusini o'qituvchiga qayta topshirasiz. Topshirilgan dars bu ro'yxatdan o'zi chiqib ketadi.</p>
{{if .Students}}<div class="public-list">{{range .Students}}
<section class="card">
<h2><span>{{.Name}}</span><span class="badge">{{len .Lessons}}</span></h2>
<ul class="plain">{{range .Lessons}}<li><span class="when"><b>{{.Day}}</b>{{if .Para}}<small>{{.Para}}-para</small>{{end}}</span><span{{if not .Topic}} class="muted"{{end}}>{{if .Topic}}{{.Topic}}{{else}}Mavzu yozilmagan{{end}}</span></li>{{end}}</ul>
</section>{{end}}</div>
{{else}}<p class="card empty">Hozir hech kimda qarz yo'q.</p>{{end}}
</main></body></html>`))

const publicGone = `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Havola ishlamaydi</title>
<script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head>
<body class="public"><main class="public-page"><p class="card empty">Bu havola eskirgan yoki noto'g'ri. Yangi havolani o'qituvchidan so'rang.</p></main></body></html>`

func (s *Server) publicRetakes(w http.ResponseWriter, r *http.Request, token string) {
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Robots-Tag", "noindex, nofollow")
	sh, ok := s.cfg.Store.CheckRetakeShare(token)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(publicGone))
		return
	}
	rt, err := s.cfg.Store.Retakes()
	if err != nil {
		http.Error(w, "ichki xato", http.StatusInternalServerError)
		return
	}
	page := publicPage{Title: sh.Title, Updated: time.Now().In(store.Tashkent()).Format("02.01.2006 15:04")}
	byName := map[int64]*publicStudent{}
	var order []int64
	for _, x := range rt.Items {
		if x.Active == 0 {
			continue
		}
		if x.RetakeAt != nil {
			page.Retaken++
			continue
		}
		st := byName[x.StudentID]
		if st == nil {
			st = &publicStudent{Name: store.ShortName(x.Name)}
			byName[x.StudentID] = st
			order = append(order, x.StudentID)
		}
		var para int64
		if x.Para != nil {
			para = sh.Para(*x.Para)
		}
		st.Lessons = append(st.Lessons, publicLesson{Day: uzDay(x.Date), Para: para, Topic: strings.TrimSpace(x.Topic)})
		page.Owed++
	}
	for _, id := range order {
		st := byName[id]
		// the oldest lesson first: that is the one to bring first
		for i, j := 0, len(st.Lessons)-1; i < j; i, j = i+1, j-1 {
			st.Lessons[i], st.Lessons[j] = st.Lessons[j], st.Lessons[i]
		}
		page.Students = append(page.Students, *st)
	}
	sort.SliceStable(page.Students, func(i, j int) bool {
		return strings.ToLower(page.Students[i].Name) < strings.ToLower(page.Students[j].Name)
	})
	publicTmpl.Execute(w, page)
}
