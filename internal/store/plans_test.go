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
	check(s.SetLessonPlan("2026-11-09", 3.0, "Algoritmlash", "2-ATT-25", "", nil, false, ""))
	if plans = must(s.LessonPlans()); len(plans) != 0 {
		t.Fatalf("%+v", plans)
	}
}

// two lessons on the same para (a timetable clash) keep a plan each
func TestLessonPlansOnTheSamePara(t *testing.T) {
	s := open(t)
	check(s.SetLessonPlan("2026-11-16", 4.0, "Algoritmlash", "2-ATT-25", "Sikllar", nil, false, ""))
	check(s.SetLessonPlan("2026-11-16", 4.0, "Bulutli texnologiyalar", "S5-KT-22", "Docker", nil, true, ""))
	plans := must(s.LessonPlans())
	if len(plans) != 2 || plans[0].Topic == plans[1].Topic {
		t.Fatalf("%+v", plans)
	}
	check(s.SetLessonPlan("2026-11-16", 4.0, "Algoritmlash", "2-ATT-25", "", nil, false, ""))
	if plans = must(s.LessonPlans()); len(plans) != 1 || plans[0].Topic != "Docker" {
		t.Fatalf("%+v", plans)
	}
}

// a database from before the clash fix: its plans survive the new key
func TestLessonPlanKeyMigration(t *testing.T) {
	s := open(t)
	for _, q := range []string{
		"drop table lesson_plans",
		`create table lesson_plans (date text not null, para integer not null, subject text not null, grp text not null default '',
    topic text not null default '', items text not null default '[]', ready integer not null default 0,
    outcome text not null default '', updated_at real not null, primary key (date, para))`,
		"insert into lesson_plans values ('2026-11-16', 4, 'Algoritmlash', '2-ATT-25', 'Sikllar', '[]', 1, '', 1)",
	} {
		if _, err := s.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	check(s.migratePlanKey())
	check(s.SetLessonPlan("2026-11-16", 4.0, "Bulutli texnologiyalar", "S5-KT-22", "Docker", nil, false, ""))
	if plans := must(s.LessonPlans()); len(plans) != 2 || plans[0].Topic != "Sikllar" || !plans[0].Ready {
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
