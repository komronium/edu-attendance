package store

import "testing"

func TestLessonPlanUpsertAndClear(t *testing.T) {
	s := open(t)
	items := []any{map[string]any{"text": "  for   sikli ", "done": true}, map[string]any{"text": ""}, map[string]any{"text": "while"}}
	check(s.SetLessonPlan("2026-11-09", 3.0, "Algoritmlash", "2-ATT-25", "Sikllar", items, false, nil))
	plans := must(s.LessonPlans())
	if len(plans) != 1 || plans[0].Topic != "Sikllar" || len(plans[0].Items) != 2 || plans[0].Items[0].Text != "for sikli" || !plans[0].Items[0].Done || plans[0].Ready {
		t.Fatalf("%+v", plans)
	}
	// the same lesson again replaces it
	check(s.SetLessonPlan("2026-11-09", 3.0, "Algoritmlash", "2-ATT-25", "Sikllar", nil, true, "partial"))
	plans = must(s.LessonPlans())
	if len(plans) != 1 || !plans[0].Ready || plans[0].Outcome != "partial" || len(plans[0].Items) != 0 {
		t.Fatalf("%+v", plans)
	}
	// nothing left in it: removed
	check(s.SetLessonPlan("2026-11-09", 3.0, "Algoritmlash", "", "", nil, false, ""))
	if plans = must(s.LessonPlans()); len(plans) != 0 {
		t.Fatalf("%+v", plans)
	}
}

func TestLessonPlanValidation(t *testing.T) {
	s := open(t)
	wantInvalid(t, s.SetLessonPlan("2026-13-01", 3.0, "A", "", "x", nil, false, ""), "sana noto'g'ri")
	wantInvalid(t, s.SetLessonPlan("2026-11-09", 0.0, "A", "", "x", nil, false, ""), "para noto'g'ri")
	wantInvalid(t, s.SetLessonPlan("2026-11-09", 3.0, "", "", "x", nil, false, ""), "fan bo'sh bo'lmasligi kerak")
	wantInvalid(t, s.SetLessonPlan("2026-11-09", 3.0, "A", "", "x", "nope", false, ""), "bandlar ro'yxat bo'lishi kerak")
	wantInvalid(t, s.SetLessonPlan("2026-11-09", 3.0, "A", "", "x", nil, false, "maybe"), "natija noto'g'ri")
	many := make([]any, 21)
	for i := range many {
		many[i] = map[string]any{"text": "b"}
	}
	wantInvalid(t, s.SetLessonPlan("2026-11-09", 3.0, "A", "", "x", many, false, ""), "bandlar 20 tadan oshmasin")
}

func TestCourseTopics(t *testing.T) {
	s := open(t)
	check(s.SetCourseTopics("Algoritmlash", []any{"Kirish", " kirish ", "Sikllar", ""}))
	got := must(s.CourseTopics())
	if len(got["Algoritmlash"]) != 2 || got["Algoritmlash"][1] != "Sikllar" {
		t.Fatalf("%+v", got)
	}
	check(s.SetCourseTopics("Algoritmlash", nil))
	if got = must(s.CourseTopics()); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestSubjectStyles(t *testing.T) {
	s := open(t)
	check(s.SetSubjectStyles(map[string]any{"Algoritmlash": map[string]any{"color": "c1"}, "Tibbiyotda axborot texnologiyalar": map[string]any{"color": "c2", "short": " Tibbiyot  AT "}}))
	check(s.SetSubjectStyles(map[string]any{"Algoritmlash": map[string]any{"color": "c4"}}))
	got := must(s.SubjectStyles())
	if len(got) != 2 || got["Algoritmlash"].Color != "c4" || got["Tibbiyotda axborot texnologiyalar"] != (SubjectStyle{"c2", "Tibbiyot AT"}) {
		t.Fatalf("%+v", got)
	}
	wantInvalid(t, s.SetSubjectStyles(map[string]any{"A": map[string]any{"color": "c9"}}), "rang noto'g'ri")
	wantInvalid(t, s.SetSubjectStyles("x"), "uslublar noto'g'ri")
}
