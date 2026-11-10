package oxu

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Change is something worth telling the teacher after a sync.
type Change struct {
	Kind  string // lesson_added, lesson_removed, attendance_missing
	Title string
	Body  string
	Link  string
}

// paraEnd is when each para ends: the university's fixed times.
var paraEnd = map[int]string{1: "09:50", 2: "11:20", 3: "12:50", 4: "14:40", 5: "16:10", 6: "17:40", 7: "19:10", 8: "20:40", 9: "22:10"}

// over reports whether the lesson's para had ended at t (Tashkent time). A lesson whose para is
// unknown counts as over once its day is.
func over(l Lesson, t time.Time) bool {
	day, clock := t.Format("2006-01-02"), t.Format("15:04")
	if l.Date != day {
		return l.Date < day
	}
	n, err := strconv.Atoi(l.Para)
	end, ok := paraEnd[n]
	return err == nil && ok && end <= clock
}

func lessonKey(l Lesson) string { return l.Date + "|" + l.Para + "|" + l.Group + "|" + l.Subject }

func describe(l Lesson) string {
	day := l.Date
	if p := strings.Split(l.Date, "-"); len(p) == 3 {
		day = p[2] + "." + p[1] + "." + p[0]
	}
	return fmt.Sprintf("%s, %s-para: %s · %s", day, l.Para, l.Subject, l.Group)
}

func keys(list []Lesson) map[string]bool {
	out := make(map[string]bool, len(list))
	for _, l := range list {
		out[lessonKey(l)] = true
	}
	return out
}

// notice makes one notice for all lessons of a kind: a line per lesson, so none is hidden behind "and more".
func notice(kind, one, many, link string, list []Lesson) []Change {
	if len(list) == 0 {
		return nil
	}
	lines := make([]string, 0, len(list))
	for _, l := range list {
		lines = append(lines, describe(l))
	}
	title := one
	if len(list) > 1 {
		title = fmt.Sprintf(many, len(list))
	}
	return []Change{{Kind: kind, Title: title, Body: strings.Join(lines, "\n"), Link: link}}
}

// Changes compares two syncs made at prevAt and now (Tashkent time). Past lessons never count as
// added or removed, because the window the schedule is read over moves with time. Attendance is
// missing only once the lesson's para has ended: the site lists a lesson as unsaved from the morning
// of its day. Without a previous sync there is nothing to compare.
func Changes(prev, next *Data, now, prevAt time.Time) []Change {
	if prev == nil || next == nil {
		return nil
	}
	today := now.Format("2006-01-02")
	if prevAt.IsZero() {
		prevAt = now
	}
	var out []Change
	if prev.Lessons != nil {
		before, after := keys(prev.Lessons), keys(next.Lessons)
		var added, removed []Lesson
		for _, l := range next.Lessons {
			if l.Date >= today && !before[lessonKey(l)] {
				added = append(added, l)
			}
		}
		for _, l := range prev.Lessons {
			if l.Date >= today && !after[lessonKey(l)] {
				removed = append(removed, l)
			}
		}
		out = append(out, notice("lesson_added", "Yangi dars qo'shildi", "%d ta yangi dars qo'shildi", "#/jadval", added)...)
		out = append(out, notice("lesson_removed", "Dars olib tashlandi", "%d ta dars olib tashlandi", "#/jadval", removed)...)
	}
	if prev.Unsaved != nil {
		before := keys(prev.Unsaved)
		var missing []Lesson
		for _, l := range next.Unsaved {
			// told once: when the lesson is over and was not already over, and listed, at the last sync
			if over(l, now) && !(before[lessonKey(l)] && over(l, prevAt)) {
				missing = append(missing, l)
			}
		}
		out = append(out, notice("attendance_missing", "Davomat olinmagan", "%d ta darsda davomat olinmagan", "#/jadval", missing)...)
	}
	return out
}
