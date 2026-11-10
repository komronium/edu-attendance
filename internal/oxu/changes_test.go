package oxu

import (
	"strings"
	"testing"
	"time"
)

// at is a Tashkent clock reading on the given day.
func at(date, clock string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", date+" "+clock, time.FixedZone("UZT", 5*3600))
	if err != nil {
		panic(err)
	}
	return t
}

func lesson(date, para string) Lesson {
	return Lesson{Date: date, Para: para, Subject: "Fan", Group: "G-1"}
}

func TestChanges(t *testing.T) {
	now := at("2026-11-05", "20:00")
	prev := &Data{Lessons: []Lesson{lesson("2026-11-01", "1"), lesson("2026-11-09", "3"), lesson("2026-11-10", "3")}, Unsaved: []Lesson{lesson("2026-10-01", "2")}}
	next := &Data{Lessons: []Lesson{lesson("2026-11-09", "3"), lesson("2026-11-11", "4")}, Unsaved: []Lesson{lesson("2026-10-01", "2"), lesson("2026-11-04", "5")}}
	got := Changes(prev, next, now, now.Add(-time.Hour))
	if len(got) != 3 {
		t.Fatalf("%+v", got)
	}
	if got[0].Kind != "lesson_added" || got[0].Body != "11.11.2026, 4-para: Fan · G-1" {
		t.Fatalf("%+v", got[0])
	}
	if got[1].Kind != "lesson_removed" || !strings.HasPrefix(got[1].Body, "10.11.2026") {
		t.Fatalf("a past lesson leaving the window is not a removal: %+v", got[1])
	}
	if got[2].Kind != "attendance_missing" || !strings.HasPrefix(got[2].Body, "04.11.2026") {
		t.Fatalf("%+v", got[2])
	}
}

func TestFirstSyncCreatesNoNotices(t *testing.T) {
	next := &Data{Lessons: []Lesson{lesson("2026-11-09", "3")}, Unsaved: []Lesson{lesson("2026-10-01", "2")}}
	if got := Changes(nil, next, at("2026-11-05", "12:00"), time.Time{}); got != nil {
		t.Fatalf("%+v", got)
	}
	// an older snapshot had no unsaved list: filling it in the first time is not news
	if got := Changes(&Data{Lessons: []Lesson{lesson("2026-11-09", "3")}}, next, at("2026-11-05", "12:00"), time.Time{}); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestManyChangesStayListedOneByOne(t *testing.T) {
	next := &Data{Lessons: []Lesson{lesson("2026-11-16", "1"), lesson("2026-11-16", "2"), lesson("2026-11-17", "1"), lesson("2026-11-17", "2"), lesson("2026-11-18", "1")}}
	got := Changes(&Data{Lessons: []Lesson{}}, next, at("2026-11-05", "12:00"), time.Time{})
	if len(got) != 1 || got[0].Title != "5 ta yangi dars qo'shildi" || len(strings.Split(got[0].Body, "\n")) != 5 || strings.Contains(got[0].Body, "va yana") {
		t.Fatalf("%+v", got)
	}
}

// the site lists today's lessons as unsaved from the morning: nothing to say until the para is over
func TestAttendanceIsMissingOnlyAfterThePara(t *testing.T) {
	prev := &Data{Unsaved: []Lesson{}}
	next := &Data{Unsaved: []Lesson{lesson("2026-11-10", "5"), lesson("2026-11-10", "6")}}
	if got := Changes(prev, next, at("2026-11-10", "09:55"), at("2026-11-10", "09:45")); len(got) != 0 {
		t.Fatalf("lessons later today are not missing yet: %+v", got)
	}
	// the 5th para ends at 16:10: it is reported then, once, though the site listed it all day
	later := &Data{Unsaved: next.Unsaved}
	got := Changes(next, later, at("2026-11-10", "16:30"), at("2026-11-10", "16:00"))
	if len(got) != 1 || got[0].Kind != "attendance_missing" || !strings.Contains(got[0].Body, "5-para") || strings.Contains(got[0].Body, "6-para") {
		t.Fatalf("%+v", got)
	}
	if got := Changes(later, later, at("2026-11-10", "16:45"), at("2026-11-10", "16:30")); len(got) != 0 {
		t.Fatalf("told twice: %+v", got)
	}
}
