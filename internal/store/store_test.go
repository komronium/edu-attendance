package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func names(n ...string) []any {
	out := make([]any, len(n))
	for i, v := range n {
		out[i] = v
	}
	return out
}

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func wantInvalid(t *testing.T, err error, msg string) {
	t.Helper()
	var v *ValidationError
	if !errors.As(err, &v) || v.Msg != msg {
		t.Fatalf("want validation error %q, got %v", msg, err)
	}
}

func TestStudentsDedupeAndTrim(t *testing.T) {
	s := open(t)
	added, err := s.AddStudents(names("  Ali   Valiyev ", "ali valiyev", "", "Vali"))
	if err != nil || added != 2 {
		t.Fatalf("added=%d err=%v", added, err)
	}
	students := must(s.Students())
	if len(students) != 2 || students[0].Name != "Ali Valiyev" {
		t.Fatalf("%+v", students)
	}
}

func TestLongNameRollsBack(t *testing.T) {
	s := open(t)
	long := ""
	for i := 0; i < 121; i++ {
		long += "x"
	}
	_, err := s.AddStudents(names("Rollback Me", long))
	wantInvalid(t, err, "ism 120 belgidan oshmasin")
	if got := must(s.Students()); len(got) != 0 {
		t.Fatalf("batch not rolled back: %+v", got)
	}
}

func TestSessionsAndParas(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("A", "B", "C")))
	archived := must(s.Students())[0]
	if err := s.UpdateStudent(archived.ID, nil, false); err != nil {
		t.Fatal(err)
	}

	id1 := must(s.StartSession("2026-10-01", nil, nil, nil, 0))
	d := must(s.Session(id1))
	if d.Total != 2 || d.Came != 2 || *d.Para != 1 {
		t.Fatalf("archived student must not be on the list: %+v", d)
	}
	id2 := must(s.StartSession("2026-10-01", nil, nil, nil, 0))
	if p := *must(s.Session(id2)).Para; p != 2 {
		t.Fatalf("second lesson of the day is para 2, got %d", p)
	}
	_, err := s.StartSession("2026-10-01", nil, nil, nil, 0)
	wantInvalid(t, err, "bu kunda ikkala para ham bor")
	_, err = s.StartSession("2026-10-01", nil, nil, 1, 0)
	wantInvalid(t, err, "bu kunda 1-para allaqachon bor")
	_, err = s.StartSession("2026-10-02", nil, nil, 3, 0)
	wantInvalid(t, err, "para 1 yoki 2 bo'lishi kerak")
	_, err = s.StartSession("2026-13-40", nil, nil, 1, 0)
	wantInvalid(t, err, "sana noto'g'ri")

	if p := must(s.FreePara("2026-10-01")); p != nil {
		t.Fatalf("no free para expected, got %d", *p)
	}
	if p := must(s.FreePara("2026-10-09")); p == nil || *p != 1 {
		t.Fatal("empty day offers para 1")
	}

	wantInvalid(t, s.UpdateSession(id2, nil, nil, nil, 1), "bu kunda 1-para allaqachon bor")
	if err := s.UpdateSession(id2, "2026-10-03", nil, "Mavzu   bir", nil); err != nil {
		t.Fatal(err)
	}
	if got := must(s.Session(id2)); got.Date != "2026-10-03" || got.Topic != "Mavzu bir" || *got.Para != 2 {
		t.Fatalf("%+v", got)
	}
	if err := s.UpdateSession(999, nil, nil, "x", nil); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}

	if err := s.DeleteSession(id1); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteSession(id1); !errors.Is(err, ErrNotFound) {
		t.Fatal("second delete must be not found")
	}
}

func TestDebtsAndRetakes(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Ali", "Vali")))
	st := must(s.Students())
	ali := st[0].ID
	sid := must(s.StartSession("2026-10-01", nil, nil, 1, 0))

	if err := s.SetPresent(sid, ali, false); err != nil {
		t.Fatal(err)
	}
	r := must(s.Retakes())
	if r.Missed != 1 || r.Owed != 1 || r.Retaken != 0 {
		t.Fatalf("%+v", r)
	}

	wantInvalid(t, s.SetRetake(sid, ali, true, "2026-10-05", "25:61", "K4"), "vaqt soat:daqiqa ko'rinishida bo'lsin, masalan 14:50")
	wantInvalid(t, s.SetRetake(sid, ali, true, "2026-10-05", "9:05", " "), "xona bo'sh bo'lmasligi kerak")
	if err := s.SetRetake(sid, ali, true, "2026-10-05", "9:05", "K4 / 309"); err != nil {
		t.Fatal(err)
	}
	r = must(s.Retakes())
	if r.Owed != 0 || r.Retaken != 1 || *r.Items[0].RetakeTime != "09:05" {
		t.Fatalf("%+v", r.Items[0])
	}
	if rooms := must(s.Rooms()); len(rooms) != 1 || rooms[0] != "K4 / 309" {
		t.Fatalf("%v", rooms)
	}
	// a present student has nothing to retake
	if err := s.SetRetake(sid, st[1].ID, true, "2026-10-05", "9:05", "K4"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	// turning "present" back on clears the retake date
	if err := s.SetPresent(sid, ali, true); err != nil {
		t.Fatal(err)
	}
	if r = must(s.Retakes()); r.Missed != 0 {
		t.Fatalf("%+v", r)
	}

	// retake sittings
	check(s.SetPresent(sid, ali, false))
	rid := must(s.StartRetakeSession("2026-10-10", 0))
	if err := s.AcceptRetake(rid, sid, ali, true); err != nil {
		t.Fatal(err)
	}
	d := must(s.RetakeSession(rid))
	if d.Accepted != 1 || len(d.Items) != 1 {
		t.Fatalf("%+v", d)
	}
	if err := s.AcceptRetake(999, sid, ali, true); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	wantInvalid(t, s.FinishRetakeSession(rid, "", 0), "xona bo'sh bo'lmasligi kerak")
	if err := s.FinishRetakeSession(rid, "K4", 0); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteRetakeSession(rid); err != nil {
		t.Fatal(err)
	}
	if r = must(s.Retakes()); r.Owed != 1 {
		t.Fatalf("deleting a sitting must make its retakes owed again: %+v", r)
	}
}

func TestStudentStatsAndGrades(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Ali")))
	ali := must(s.Students())[0].ID
	var sids []int64
	for _, day := range []string{"2026-10-01", "2026-10-02", "2026-10-03"} {
		sids = append(sids, must(s.StartSession(day, nil, nil, 1, 0)))
	}
	check(s.SetPresent(sids[2], ali, false))
	check(s.SetGrade(sids[0], ali, "4,5"))
	check(s.SetGrade(sids[1], ali, "5"))
	wantInvalid(t, s.SetGrade(sids[1], ali, "abc"), "baho raqam bo'lishi kerak")
	wantInvalid(t, s.SetGrade(sids[1], ali, "100.5"), "baho -100 va 100 orasida bo'lsin")
	wantInvalid(t, s.SetGrade(sids[1], ali, "nan"), "baho -100 va 100 orasida bo'lsin")

	d := must(s.Student(ali))
	if d.Lessons != 3 || d.Came != 2 || d.Missed != 1 || d.Owed != 1 || d.Graded != 2 || d.Points != 9.5 {
		t.Fatalf("%+v", d.Student)
	}
	if *d.Rate != 66.7 || *d.Average != 4.75 {
		t.Fatalf("rate=%v average=%v", *d.Rate, *d.Average)
	}
	if len(d.History) != 3 || d.History[0].Date != "2026-10-03" {
		t.Fatalf("history is newest first: %+v", d.History)
	}
	check(s.SetGrade(sids[0], ali, ""))
	if d = must(s.Student(ali)); d.Graded != 1 {
		t.Fatalf("empty grade clears: %+v", d.Student)
	}
	if _, err := s.Student(999); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

func TestRoundMatchesPython(t *testing.T) {
	// Python: round(2/3*100, 1) == 66.7, round(0.125, 2) == 0.12 (ties to even), round(2.675, 2) == 2.67
	for _, c := range []struct {
		in     float64
		digits int
		want   float64
	}{{200.0 / 3, 1, 66.7}, {0.125, 2, 0.12}, {2.675, 2, 2.67}, {5, 2, 5}, {-1.005, 2, -1}} {
		if got := round(c.in, c.digits); got != c.want {
			t.Errorf("round(%v,%d)=%v want %v", c.in, c.digits, got, c.want)
		}
	}
}

func TestOpensDatabaseWithOldSchema(t *testing.T) {
	// a database from before para/grades/retakes existed: the migration adds the columns and numbers the lessons
	path := filepath.Join(t.TempDir(), "old.sqlite3")
	old, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"drop table attendance", "drop table sessions", "drop table retake_sessions",
		`create table sessions (id integer primary key, date text not null, started_at real not null,
            room text not null default '', topic text not null default '', created_at real not null)`,
		`create table attendance (session_id integer not null references sessions(id) on delete cascade,
            student_id integer not null references students(id) on delete cascade,
            present integer not null default 1, retake_at text, primary key (session_id, student_id))`,
		"insert into sessions (id, date, started_at, created_at) values (1,'2026-10-01',200,200),(2,'2026-10-01',100,100),(3,'2026-10-02',50,50)",
	} {
		if _, err := old.db.Exec(q); err != nil {
			t.Fatal(q, err)
		}
	}
	old.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	got := map[int64]int64{}
	for _, se := range must(s.Sessions()) {
		got[se.ID] = *se.Para
	}
	if got[2] != 1 || got[1] != 2 || got[3] != 1 {
		t.Fatalf("backfilled paras: %v", got)
	}
	must(s.AddStudents(names("Ali")))
	sid := must(s.StartSession("2026-10-09", nil, nil, 1, 0))
	ali := must(s.Students())[0].ID
	check(s.SetGrade(sid, ali, "3"))
	check(s.SetPresent(sid, ali, false))
	check(s.SetRetake(sid, ali, true, "2026-10-12", "10:00", "K1"))
}

func TestImport(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Old Student")))
	spec := &ImportSpec{Students: []string{"Ali", "Vali"}}
	spec.Lessons = append(spec.Lessons, struct {
		Date   string `json:"date"`
		Number int    `json:"number"`
		Topic  string `json:"topic"`
		Marks  map[string]struct {
			Absent bool     `json:"absent"`
			Grade  *float64 `json:"grade"`
		} `json:"marks"`
	}{Date: "2026-09-15", Number: 1, Topic: "Kirish", Marks: map[string]struct {
		Absent bool     `json:"absent"`
		Grade  *float64 `json:"grade"`
	}{"Ali": {Absent: true}, "Vali": {Grade: func() *float64 { g := 4.0; return &g }()}}})
	res, err := s.Import(spec)
	if err != nil || res.Students != 3 || res.Lessons != 1 {
		t.Fatalf("%+v %v", res, err)
	}
	if r := must(s.Retakes()); r.Missed != 1 {
		t.Fatalf("%+v", r)
	}
}

func TestKPIMarks(t *testing.T) {
	s := open(t)
	check(s.SetKPIMark("2026-11", "  Ochiq   dars ", true))
	check(s.SetKPIMark("2026-11", "Ochiq dars", true)) // ticking twice is harmless
	check(s.SetKPIMark("2026-10", "Maqola", true))
	if got := must(s.KPIMarks()); len(got) != 2 {
		t.Fatalf("%+v", got)
	}
	check(s.SetKPIMark("2026-11", "Ochiq dars", false))
	if got := must(s.KPIMarks()); len(got) != 1 || got[0].Item != "Maqola" {
		t.Fatalf("%+v", got)
	}
	wantInvalid(t, s.SetKPIMark("2026-13", "x", true), "oy noto'g'ri")
	wantInvalid(t, s.SetKPIMark("noyabr", "x", true), "oy noto'g'ri")
	wantInvalid(t, s.SetKPIMark("2026-11", " ", true), "band bo'sh bo'lmasligi kerak")
}

func TestKPIProgressAndSteps(t *testing.T) {
	s := open(t)
	check(s.SetKPIProgress("2026-11", "Maqola", 2.0))
	check(s.SetKPIProgress("2026-11", "Maqola", 3.0))
	check(s.SetKPIProgress("2026-10", "Maqola", 1.0))
	got := must(s.KPIProgress())
	if len(got) != 2 {
		t.Fatalf("%+v", got)
	}
	check(s.SetKPIProgress("2026-10", "Maqola", 0.0))
	if got := must(s.KPIProgress()); len(got) != 1 || got[0].Step != 3 {
		t.Fatalf("%+v", got)
	}
	check(s.SetKPIProgress("2026-12", "Maqola", -1.0)) // cannot be done this month
	wantInvalid(t, s.SetKPIProgress("2026-12", "Maqola", -2.0), "bosqich noto'g'ri")
	wantInvalid(t, s.SetKPIProgress("x", "Maqola", 1.0), "oy noto'g'ri")
	wantInvalid(t, s.SetKPIProgress("2026-11", "Maqola", 1.5), "bosqich noto'g'ri")
	wantInvalid(t, s.SetKPIProgress("2026-11", "Maqola", "2"), "bosqich noto'g'ri")

	check(s.SetKPISteps("Maqola", names(" Yozildi ", "", "Yuklandi")))
	if got := must(s.KPISteps()); len(got["Maqola"]) != 2 || got["Maqola"][0] != "Yozildi" {
		t.Fatalf("%+v", got)
	}
	check(s.SetKPISteps("Maqola", nil))
	if got, ok := must(s.KPISteps())["Maqola"]; !ok || len(got) != 0 {
		t.Fatalf("no stages must stay an explicit empty list: %v %v", got, ok)
	}
}

func TestOxuOwner(t *testing.T) {
	s := open(t)
	if v := must(s.OxuOwner()); v != "" {
		t.Fatal(v)
	}
	wantInvalid(t, s.SetOxuOwner("abc"), "ID faqat raqamlardan iborat bo'lsin")
	check(s.SetOxuOwner(" 123456 "))
	check(s.SaveOxu([]byte(`{"account":"123456"}`)))
	check(s.SetOxuOwner("123456"))
	if raw, _, _ := s.Oxu(); raw == nil {
		t.Fatal("same owner keeps the data")
	}
	check(s.SetOxuOwner("999999"))
	if raw, _, _ := s.Oxu(); raw != nil {
		t.Fatal("changing the owner must drop the old account's data")
	}
}

func TestKPIWorks(t *testing.T) {
	s := open(t)
	id := must(s.AddKPIWork("  Yangi   maqola ", "Mahalliy OAK maqola"))
	check(s.SetKPIWorkStep(id, 2.0))
	got := must(s.KPIWorks())
	if len(got) != 1 || got[0].Title != "Yangi maqola" || got[0].Step != 2 {
		t.Fatalf("%+v", got)
	}
	_, err := s.AddKPIWork(" ", "x")
	wantInvalid(t, err, "ish nomi bo'sh bo'lmasligi kerak")
	wantInvalid(t, s.SetKPIWorkStep(id, 1.5), "bosqich noto'g'ri")
	if err := s.SetKPIWorkStep(999, 1.0); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	check(s.DeleteKPIWork(id))
	if err := s.DeleteKPIWork(id); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

func TestNotifications(t *testing.T) {
	s := open(t)
	check(s.AddNotification("lesson_added", "Yangi dars", "matn", "#/jadval"))
	check(s.AddNotification("attendance_missing", "Davomat", "matn", "#/jadval"))
	got := must(s.Notifications())
	if len(got) != 2 || got[0].Kind != "attendance_missing" || got[0].ReadAt != nil {
		t.Fatalf("newest first and unread: %+v", got)
	}
	check(s.MarkNotificationsRead())
	if got := must(s.Notifications()); got[1].ReadAt == nil {
		t.Fatalf("%+v", got)
	}
}

func TestPresentAgainClearsTheWholeRetake(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Ali", "Vali")))
	st := must(s.Students())
	ali, vali := st[0].ID, st[1].ID
	sid := must(s.StartSession("2026-10-01", nil, nil, 1, 0))
	check(s.SetPresent(sid, ali, false))
	check(s.SetPresent(sid, vali, false))

	// accepted in a sitting, then marked present: the sitting must forget the student
	rid := must(s.StartRetakeSession("2026-10-10", 0))
	check(s.AcceptRetake(rid, sid, ali, true))
	if got := must(s.RetakeSessions()); got[0].Accepted != 1 {
		t.Fatalf("%+v", got)
	}
	check(s.SetPresent(sid, ali, true))
	if got := must(s.RetakeSessions()); got[0].Accepted != 0 {
		t.Fatalf("a student marked present again must leave the sitting: %+v", got)
	}
	check(s.SetPresent(sid, ali, false))
	for _, i := range must(s.RetakeSession(rid)).Items {
		if i.RetakeSessionID != nil {
			t.Fatalf("absent again means owed again, not accepted: %+v", i)
		}
	}

	// a recorded time and room must not come back with the next absence
	check(s.SetRetake(sid, vali, true, "2026-10-12", "9:05", "K4"))
	check(s.SetAllPresent(sid))
	check(s.SetPresent(sid, vali, false))
	for _, x := range must(s.Retakes()).Items {
		if x.RetakeAt != nil || x.RetakeTime != nil || x.RetakeRoom != nil {
			t.Fatalf("stale retake details: %+v", x)
		}
	}
}

func TestCancelledLessons(t *testing.T) {
	s := open(t)
	check(s.SetLessonCancelled("2026-11-03", 3.0, "Algoritmlash", true))
	check(s.SetLessonCancelled("2026-11-03", 3.0, "Algoritmlash", true))
	check(s.SetLessonCancelled("2026-11-03", 4.0, "Algoritmlash", true))
	if got := must(s.CancelledLessons()); len(got) != 2 {
		t.Fatalf("%+v", got)
	}
	check(s.SetLessonCancelled("2026-11-03", 3.0, "Algoritmlash", false))
	if got := must(s.CancelledLessons()); len(got) != 1 || got[0].Para != 4 {
		t.Fatalf("%+v", got)
	}
	wantInvalid(t, s.SetLessonCancelled("bad", 3.0, "x", true), "sana noto'g'ri")
	wantInvalid(t, s.SetLessonCancelled("2026-11-03", 0.0, "x", true), "para noto'g'ri")
}

func TestCoursePlanHours(t *testing.T) {
	s := open(t)
	if v := must(s.CoursePlanHours()); v != nil {
		t.Fatalf("empty at first: %v", *v)
	}
	check(s.SetCoursePlanHours(60.0))
	if v := must(s.CoursePlanHours()); v == nil || *v != 60 {
		t.Fatalf("%v", v)
	}
	check(s.SetCoursePlanHours("72"))
	if v := must(s.CoursePlanHours()); *v != 72 {
		t.Fatalf("%v", *v)
	}
	wantInvalid(t, s.SetCoursePlanHours("abc"), "soat raqam bo'lishi kerak")
	wantInvalid(t, s.SetCoursePlanHours(-1.0), "soat 0 va 2000 orasida bo'lsin")
	check(s.SetCoursePlanHours(""))
	if v := must(s.CoursePlanHours()); v != nil {
		t.Fatal("cleared")
	}
}

func TestSeed(t *testing.T) {
	s := open(t)
	if err := s.Seed(); err != nil {
		t.Fatal(err)
	}
	if n := len(must(s.Students())); n != 18 {
		t.Fatalf("students: %d", n)
	}
	if n := len(must(s.Sessions())); n != 8 {
		t.Fatalf("sessions: %d", n)
	}
}

func TestSemester(t *testing.T) {
	s := open(t)
	if v := must(s.Semester()); v != (Semester{Start: "2026-09-14", Weeks: 15}) {
		t.Fatalf("default: %+v", v)
	}
	check(s.SetSemester("2027-02-08", 16.0))
	if v := must(s.Semester()); v != (Semester{Start: "2027-02-08", Weeks: 16}) {
		t.Fatalf("%+v", v)
	}
	check(s.SetSemester("2027-02-08", "14"))
	if v := must(s.Semester()); v.Weeks != 14 {
		t.Fatalf("%+v", v)
	}
	wantInvalid(t, s.SetSemester("14.09.2026", 15.0), "sana noto'g'ri")
	wantInvalid(t, s.SetSemester("2026-09-14", 2.0), "haftalar 4 va 30 orasida bo'lsin")
	wantInvalid(t, s.SetSemester("2026-09-14", "abc"), "haftalar 4 va 30 orasida bo'lsin")
}
