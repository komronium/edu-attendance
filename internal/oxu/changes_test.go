package oxu

import (
	"strings"
	"testing"
)

func lesson(date, para string) Lesson {
	return Lesson{Date: date, Para: para, Subject: "Fan", Group: "G-1"}
}

func TestChanges(t *testing.T) {
	today := "2026-11-05"
	prev := &Data{Lessons: []Lesson{lesson("2026-11-01", "1"), lesson("2026-11-09", "3"), lesson("2026-11-10", "3")}, Unsaved: []Lesson{lesson("2026-10-01", "2")}}
	next := &Data{Lessons: []Lesson{lesson("2026-11-09", "3"), lesson("2026-11-11", "4")}, Unsaved: []Lesson{lesson("2026-10-01", "2"), lesson("2026-11-04", "5")}}
	got := Changes(prev, next, today)
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
	if got := Changes(nil, next, "2026-11-05"); got != nil {
		t.Fatalf("%+v", got)
	}
	// an older snapshot had no unsaved list: filling it in the first time is not news
	if got := Changes(&Data{Lessons: []Lesson{lesson("2026-11-09", "3")}}, next, "2026-11-05"); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestManyChangesBecomeOneNotice(t *testing.T) {
	next := &Data{Lessons: []Lesson{lesson("2026-11-16", "1"), lesson("2026-11-16", "2"), lesson("2026-11-17", "1"), lesson("2026-11-17", "2"), lesson("2026-11-18", "1")}}
	got := Changes(&Data{Lessons: []Lesson{}}, next, "2026-11-05")
	if len(got) != 1 || got[0].Title != "5 ta yangi dars qo'shildi" || !strings.Contains(got[0].Body, "va yana 3 ta") {
		t.Fatalf("%+v", got)
	}
}
