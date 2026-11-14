// Package demo invents what a sync with digital.oxu.uz would bring, for `attendance demo --with-site`:
// a timetable, a teaching load, scientific KPI and the monthly bonus. Every name, number and group is
// made up; nothing here comes from the site.
package demo

import (
	"fmt"
	"time"

	"attendance/internal/oxu"
)

// Owner is the account the invented data belongs to.
const Owner = "100200"

var paraTime = map[int]string{1: "08:30 - 09:50", 2: "10:00 - 11:20", 3: "11:30 - 12:50", 4: "13:20 - 14:40", 5: "14:50 - 16:10",
	6: "16:20 - 17:40", 7: "17:50 - 19:10", 8: "19:20 - 20:40", 9: "20:50 - 22:10"}

// a class taught every week on one weekday, from its first to its last day
type class struct {
	subject, typ, group, room string
	weekday                   time.Weekday
	para                      int
	from, to                  string // "" means the semester's own bounds
}

// Snapshot is the invented sync result for a semester starting on start, read on the day today
// (Tashkent): the schedule up to two weeks ahead, and two lessons of the past week left unsaved.
func Snapshot(start, today time.Time) *oxu.Data {
	day := func(t time.Time) string { return t.Format("2006-01-02") }
	semEnd := start.AddDate(0, 0, 15*7-1)
	// a part-time group's session: three weeks around today
	sesFrom, sesTo := today.AddDate(0, 0, -9), today.AddDate(0, 0, 11)
	classes := []class{
		{"Ma`lumotlar tuzilmasi va algoritmlar", "Ma`ruza", "K4-ATT-25", "4-o'quv bino, 306-informatika xonasi", time.Tuesday, 6, "", ""},
		{"Ma`lumotlar tuzilmasi va algoritmlar", "Amaliy", "K4-ATT-25", "4-o'quv bino, 306-informatika xonasi", time.Friday, 5, "", ""},
		{"Tibbiyotda axborot texnologiyalar", "Amaliy", "14-OHI-26", "7-o'quv bino, 202-kompyuter xonasi", time.Wednesday, 7, "", ""},
		{"Tibbiyotda axborot texnologiyalar", "Amaliy", "23-OHI-26_yopildi_24.09.2026", "7-o'quv bino, 202-kompyuter xonasi", time.Thursday, 7, day(start), day(start.AddDate(0, 0, 10))},
		{"Bulutli texnologiyalar", "Ma`ruza", "S1-KT-22, S3-KT-22", "4-o'quv bino, 404-ma`ruzalar xonasi", time.Monday, 6, day(sesFrom), day(sesTo)},
		{"Bulutli texnologiyalar", "Ma`ruza", "S1-KT-22, S3-KT-22", "4-o'quv bino, 404-ma`ruzalar xonasi", time.Thursday, 6, day(sesFrom), day(sesTo)},
		{"Bulutli texnologiyalar", "Amaliy", "S1-KT-22", "4-o'quv bino, 308-kompyuter xonasi", time.Saturday, 4, day(sesFrom), day(sesTo)},
		{"Bulutli texnologiyalar", "Amaliy", "S3-KT-22", "4-o'quv bino, 308-kompyuter xonasi", time.Wednesday, 5, day(sesFrom), day(sesTo)},
		// on the course's own para: a timetable clash, as the real one on Mondays
		{"Bulutli texnologiyalar", "Amaliy", "S1-KT-22", "4-o'quv bino, 308-kompyuter xonasi", time.Monday, 4, day(sesFrom), day(sesTo)},
	}
	// the site publishes the schedule only two weeks ahead
	last := today.AddDate(0, 0, 14)
	if semEnd.Before(last) {
		last = semEnd
	}
	var lessons []oxu.Lesson
	id := 168000
	for d := start; !d.After(last); d = d.AddDate(0, 0, 1) {
		for _, c := range classes {
			if d.Weekday() != c.weekday || (c.from != "" && day(d) < c.from) || (c.to != "" && day(d) > c.to) {
				continue
			}
			id++
			lessons = append(lessons, oxu.Lesson{Date: day(d), Para: fmt.Sprint(c.para), Time: paraTime[c.para], Subject: c.subject,
				Type: c.typ, Group: c.group, Room: c.room, URL: fmt.Sprintf("/davomat_uqituvchi.asp?dars=%d", id)})
		}
	}
	// two lessons of the last week whose attendance was not saved on the site
	unsaved := []oxu.Lesson{}
	for i := len(lessons) - 1; i >= 0 && len(unsaved) < 2; i-- {
		l := lessons[i]
		if l.Date < day(today) && l.Date >= day(today.AddDate(0, 0, -7)) {
			unsaved = append(unsaved, l)
		}
	}
	load := &oxu.Load{Semester: fmt.Sprintf("%d-%d Kuzgi semestr", start.Year(), start.Year()+1), Start: day(start.AddDate(0, 0, -30)),
		Position: "o'qituvchi", Total: "530", Lectures: "92", Items: []oxu.LoadItem{
			{Group: "K4-ATT-25", Subject: "Ma`lumotlar tuzilmasi va algoritmlar", Type: "Ma`ruza", Hours: "30", Students: "24", Total: "30"},
			{Group: "K4-ATT-25", Subject: "Ma`lumotlar tuzilmasi va algoritmlar", Type: "Amaliy", Hours: "30", Students: "24", Total: "30"},
			{Group: "K4-ATT-25", Subject: "Ma`lumotlar tuzilmasi va algoritmlar", Type: "Mustaqil ta'lim", Hours: "60", Students: "24", Total: "60"},
			{Group: "14-OHI-26", Subject: "Tibbiyotda axborot texnologiyalar", Type: "Amaliy", Hours: "30", Students: "18", Total: "30"},
			{Group: "23-OHI-26_yopildi_24.09.2026", Subject: "Tibbiyotda axborot texnologiyalar", Type: "Amaliy", Hours: "16", Students: "15", Total: "16"},
			{Group: "S1-KT-22, S3-KT-22", Subject: "Bulutli texnologiyalar", Type: "Ma`ruza", Hours: "16", Students: "40", Total: "16"},
			{Group: "S1-KT-22", Subject: "Bulutli texnologiyalar", Type: "Amaliy", Hours: "8", Students: "20", Total: "8"},
			{Group: "S3-KT-22", Subject: "Bulutli texnologiyalar", Type: "Amaliy", Hours: "8", Students: "20", Total: "8"},
		}}
	kpi := &oxu.KPI{
		Bands: []oxu.KPIBand{
			{Name: "Scopus va Web of Science bazasidagi maqola", Weight: "10", Count: "0", Score: "0.00", Limit: "30"},
			{Name: "OAK ro'yxatidagi jurnalda maqola", Weight: "4", Count: "1", Score: "4.00", Limit: "20", Min: "1"},
			{Name: "Xalqaro anjumanda tezis", Weight: "1", Count: "2", Score: "2.00", Limit: "6"},
			{Name: "O'quv qo'llanma", Weight: "8", Count: "0", Score: "0.00", Limit: "16"},
			{Name: "DGU guvohnomasi", Weight: "3", Count: "0", Score: "0.00", Limit: "9"},
		},
		Papers: []oxu.Paper{
			{Title: "Talabalar davomatini raqamli kuzatish usullari", Band: "OAK ro'yxatidagi jurnalda maqola", Date: day(start.AddDate(0, 0, 20)), Status: "Tasdiqlangan"},
			{Title: "Bulutli hisoblash ta'limda", Band: "Xalqaro anjumanda tezis", Date: day(start.AddDate(0, 0, 35)), Status: "Ko'rib chiqilmoqda"},
		},
	}
	item := func(title, max, min string, value string, graded int, criteria ...string) oxu.KPIItem {
		if criteria == nil {
			criteria = []string{}
		}
		return oxu.KPIItem{Title: title, Value: value, Max: max, Min: min, Graded: graded, Criteria: criteria}
	}
	months := []string{"Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"}
	prev := today.AddDate(0, -1, 0)
	label := func(t time.Time) string { return fmt.Sprintf("%d — %s", t.Year(), months[t.Month()-1]) }
	periods := []oxu.KPIPeriod{
		{Label: label(prev), Score: "35", Items: []oxu.KPIItem{
			item("Ochiq dars o'tkazish", "5", "0", "5", 1, "Ochiq dars rejasi tasdiqlangan", "Kafedra bayonnomasi"),
			item("Ilmiy maqola tayyorlash", "5", "0", "0", 0),
			item("LMS uchun video kontent", "5", "0", "5", 1),
			item("Professor o'qituvchining dars jarayonidagi mas'uliyati", "10", "0", "10", 1),
			item("Rektor ustamasi", "15", "0", "15", 1),
			item("Darsga kechikish", "0", "-5", "0", 0),
		}},
		{Label: label(today), Items: []oxu.KPIItem{
			item("Ochiq dars o'tkazish", "5", "0", "", 0, "Ochiq dars rejasi tasdiqlangan", "Kafedra bayonnomasi"),
			item("Ilmiy maqola tayyorlash", "5", "0", "", 0),
			item("LMS uchun video kontent", "5", "0", "", 0),
			item("Metodik ishlanma", "5", "0", "", 0),
			item("Professor o'qituvchining dars jarayonidagi mas'uliyati", "10", "0", "", 0),
			item("Rektor ustamasi", "15", "0", "", 0),
			item("Darsga kechikish", "0", "-5", "", 0),
		}},
	}
	return &oxu.Data{Account: Owner, Lessons: lessons, Unsaved: unsaved, Load: load, KPI: kpi, Periods: periods,
		Months: []oxu.Month{
			{Month: months[prev.Month()-1], Result: "35", Percent: "35%", Status: "Hisoblangan"},
			{Month: months[prev.AddDate(0, -1, 0).Month()-1], Result: "20", Percent: "20%", Status: "Hisoblangan"},
		}}
}
