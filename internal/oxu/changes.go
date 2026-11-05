package oxu

import (
	"fmt"
	"strings"
)

// Change is something worth telling the teacher after a sync.
type Change struct {
	Kind  string // lesson_added, lesson_removed, attendance_missing
	Title string
	Body  string
	Link  string
}

const mergeAbove = 3 // more changes of one kind than this become a single notice

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

func notice(kind, one, many, link string, list []Lesson) []Change {
	if len(list) > mergeAbove {
		lines := make([]string, 0, 2)
		for _, l := range list[:2] {
			lines = append(lines, describe(l))
		}
		body := strings.Join(lines, "; ") + fmt.Sprintf(" va yana %d ta", len(list)-2)
		return []Change{{Kind: kind, Title: fmt.Sprintf(many, len(list)), Body: body, Link: link}}
	}
	out := make([]Change, 0, len(list))
	for _, l := range list {
		out = append(out, Change{Kind: kind, Title: one, Body: describe(l), Link: link})
	}
	return out
}

// Changes compares two syncs. Past lessons never count as added or removed, because the window the
// schedule is read over moves with time. Without a previous sync there is nothing to compare.
func Changes(prev, next *Data, today string) []Change {
	if prev == nil || next == nil {
		return nil
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
			if !before[lessonKey(l)] {
				missing = append(missing, l)
			}
		}
		out = append(out, notice("attendance_missing", "Davomat olinmagan", "%d ta darsda davomat olinmagan", "#/jadval", missing)...)
	}
	return out
}
