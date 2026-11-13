package store

import (
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

func TestADeletedLessonDisappearsEverywhereAndComesBackWhole(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Aliyev Ali", "Karimova Madina")))
	ali := must(s.Students())[0].ID
	sid := must(s.StartSession("2026-11-02", "K4", "Sikllar", 1, 0))
	check(s.SetPresent(sid, ali, false))
	check(s.SetRetake(sid, ali, true, "2026-11-05", "14:10", "K4 / 309"))
	check(s.SetGrade(sid, ali, "4.5"))
	before := must(s.Session(sid))

	check(s.DeleteSession(sid))
	if n := len(must(s.Sessions())); n != 0 {
		t.Fatalf("%d lessons listed after delete", n)
	}
	if _, err := s.Session(sid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted lesson opens: %v", err)
	}
	st := must(s.Student(ali))
	if st.Lessons != 0 || st.Missed != 0 || len(st.History) != 0 || st.Graded != 0 {
		t.Fatalf("the student still counts the deleted lesson: %+v", st.Student)
	}
	if r := must(s.Retakes()); r.Missed != 0 {
		t.Fatalf("debts of a deleted lesson: %+v", r)
	}
	if rooms := must(s.Rooms()); len(rooms) != 0 {
		t.Fatalf("rooms of a deleted lesson: %v", rooms)
	}
	if err := s.SetPresent(sid, ali, true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("marks a deleted lesson: %v", err)
	}
	if err := s.DeleteSession(sid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleting twice: %v", err)
	}

	check(s.RestoreSession(sid))
	after := must(s.Session(sid))
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("restored lesson differs:\n%+v\n%+v", before, after)
	}
	if err := s.RestoreSession(sid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("restoring a lesson that is not deleted: %v", err)
	}
}

func TestADeletedLessonsSlotCanBeTakenThenItCannotComeBack(t *testing.T) {
	s := open(t)
	sid := must(s.StartSession("2026-11-02", "", "", 1, 0))
	check(s.DeleteSession(sid))
	if para := must(s.FreePara("2026-11-02")); para == nil || *para != 1 {
		t.Fatalf("the deleted lesson's para is not free: %v", para)
	}
	must(s.StartSession("2026-11-02", "", "", 1, 0))
	wantInvalid(t, s.RestoreSession(sid), "bu kunda 1-para allaqachon bor")
}

func TestOldDeletedLessonsArePurgedOnOpen(t *testing.T) {
	s, path := fileStore(t)
	old := must(s.StartSession("2026-09-02", "", "", 1, 0))
	recent := must(s.StartSession("2026-09-03", "", "", 1, 0))
	check(s.DeleteSession(old))
	check(s.DeleteSession(recent))
	if _, err := s.db.Exec("update sessions set deleted_at = ? where id = ?", now()-31*86400, old); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s = must(Open(path))
	defer s.Close()
	var n int
	check(s.db.QueryRow("select count(*) from sessions").Scan(&n))
	if n != 1 {
		t.Fatalf("%d lessons kept, want only the recently deleted one", n)
	}
	check(s.RestoreSession(recent))
}

// Every query that reads lessons must leave out the deleted ones. A new query that forgets will fail
// here; the few that must see all lessons are listed. The scan reads the Go string literals themselves.
func TestEveryLessonQueryLeavesOutDeletedOnes(t *testing.T) {
	allowed := []string{
		"select distinct date from sessions where para is null",                 // migrate: numbering old lessons
		"select id from sessions where date=? order by started_at, id",          // migrate
		"select date, para from sessions where id=? and deleted_at is not null", // RestoreSession
		"delete from sessions", // Import, purgeDeleted
	}
	lesson := regexp.MustCompile(`\b(from|join) sessions\b`)
	files, _ := filepath.Glob("*.go")
	seen := 0
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), f, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			q, err := strconv.Unquote(lit.Value)
			if err != nil || !lesson.MatchString(q) {
				return true
			}
			seen++
			ok = strings.Contains(q, "deleted_at")
			for _, a := range allowed {
				ok = ok || strings.Contains(q, a)
			}
			if !ok {
				t.Errorf("%s: query does not leave out deleted lessons: %s", f, strings.Join(strings.Fields(q), " "))
			}
			return true
		})
	}
	if seen < 15 {
		t.Fatalf("only %d lesson queries found: the scan is not reading the code", seen)
	}
}

func TestParaMustBeAWholeOneOrTwo(t *testing.T) {
	for _, v := range []any{1.9, true, 3.0, 0.0, "x"} {
		if _, err := cleanPara(v); err == nil {
			t.Errorf("cleanPara(%v) accepted", v)
		}
	}
	for _, v := range []any{1.0, 2.0, "2", " 1 "} {
		if _, err := cleanPara(v); err != nil {
			t.Errorf("cleanPara(%v): %v", v, err)
		}
	}
}

func TestAllPresentNeedsAnExistingLesson(t *testing.T) {
	s := open(t)
	if err := s.SetAllPresent(999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing lesson: %v", err)
	}
	empty := must(s.StartSession("2026-11-02", "", "", 1, 0)) // nobody on the list yet
	check(s.SetAllPresent(empty))
}

func TestAStudentAddedLaterCanJoinAStartedLesson(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Aliyev Ali")))
	sid := must(s.StartSession("2026-11-02", "", "", 1, 0))
	must(s.AddStudents(names("Karimova Madina")))
	d := must(s.Session(sid))
	if len(d.Students) != 1 || len(d.Missing) != 1 || d.Missing[0].Name != "Karimova Madina" {
		t.Fatalf("students %v, missing %v", d.Students, d.Missing)
	}
	late := d.Missing[0].ID
	check(s.AddToSession(sid, late, false))
	check(s.AddToSession(sid, late, true)) // already there: nothing changes
	d = must(s.Session(sid))
	if len(d.Students) != 2 || len(d.Missing) != 0 || d.Came != 1 {
		t.Fatalf("after adding: %+v", d)
	}
	if r := must(s.Retakes()); r.Owed != 1 {
		t.Fatalf("the late student's absence is not a debt: %+v", r)
	}
	if err := s.AddToSession(999, late, true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown lesson: %v", err)
	}
	if err := s.AddToSession(sid, 999, true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown student: %v", err)
	}
	// an archived student is not offered
	check(s.UpdateStudent(late, nil, false))
	sid2 := must(s.StartSession("2026-11-03", "", "", 1, 0))
	if m := must(s.Session(sid2)).Missing; len(m) != 0 {
		t.Fatalf("archived student offered: %v", m)
	}
}

func TestANewSemesterArchivesStudentsAndKeepsTheRecord(t *testing.T) {
	s, path := fileStore(t)
	must(s.AddStudents(names("Aliyev Ali", "Karimova Madina")))
	sid := must(s.StartSession("2026-11-02", "", "", 1, 0))
	check(s.SetPresent(sid, must(s.Students())[0].ID, false))

	wantInvalid(t, func() error { _, err := s.NewSemester("2027-02-08", 2.0, nil); return err }(), "haftalar 4 va 30 orasida bo'lsin")
	if sem := must(s.Semester()); sem.Start != "2026-09-14" {
		t.Fatal("an invalid new semester changed the settings")
	}
	backup := must(s.NewSemester("2027-02-08", 16.0, "180"))
	if backup == "" || must(Backups(BackupDir(path), BackupPrefix, BackupExt))[0] != backup {
		t.Fatalf("no backup before the new semester: %q", backup)
	}
	if sem := must(s.Semester()); sem != (Semester{Start: "2027-02-08", Weeks: 16}) {
		t.Fatalf("semester %+v", sem)
	}
	if h := must(s.CoursePlanHours()); h == nil || *h != 180 {
		t.Fatalf("plan hours %v", h)
	}
	for _, st := range must(s.Students()) {
		if st.Active != 0 {
			t.Fatalf("%s is still active", st.Name)
		}
	}
	if len(must(s.Sessions())) != 1 || must(s.Retakes()).Owed != 1 {
		t.Fatal("the old semester's lessons or debts were lost")
	}
	next := must(s.StartSession("2027-02-08", "", "", 1, 0))
	if n := len(must(s.Session(next)).Students); n != 0 {
		t.Fatalf("a new lesson lists %d archived students", n)
	}
}

func TestAMarkChangesPresenceAndGradeTogetherOrNotAtAll(t *testing.T) {
	s := open(t)
	must(s.AddStudents(names("Aliyev Ali")))
	ali := must(s.Students())[0].ID
	sid := must(s.StartSession("2026-11-02", "", "", 1, 0))
	absent := false
	// a bad grade: the presence change that came with it must not be saved
	wantInvalid(t, s.UpdateMark(sid, ali, &absent, true, "abc"), "baho raqam bo'lishi kerak")
	if st := must(s.Session(sid)).Students[0]; st.Present != 1 || st.Grade != nil {
		t.Fatalf("a rejected mark changed something: %+v", st)
	}
	// a student who is not on the lesson: the grade is not saved either
	if err := s.UpdateMark(sid, 999, &absent, true, 4.0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown student: %v", err)
	}
	check(s.UpdateMark(sid, ali, &absent, true, "4,5"))
	if st := must(s.Session(sid)).Students[0]; st.Present != 0 || st.Grade == nil || *st.Grade != 4.5 {
		t.Fatalf("both changes expected: %+v", st)
	}
	check(s.UpdateMark(sid, ali, nil, false, nil)) // nothing asked, nothing changed
	if st := must(s.Session(sid)).Students[0]; st.Present != 0 || *st.Grade != 4.5 {
		t.Fatalf("an empty update changed something: %+v", st)
	}
}

func TestAKPIStageAndItsTickChangeTogether(t *testing.T) {
	s := open(t)
	yes, no := true, false
	ticked := func() bool {
		for _, m := range must(s.KPIMarks()) {
			if m.Period == "2026-11" && m.Item == "Maqola" {
				return true
			}
		}
		return false
	}
	stage := func() int {
		for _, p := range must(s.KPIProgress()) {
			if p.Period == "2026-11" && p.Item == "Maqola" {
				return p.Step
			}
		}
		return 0
	}
	check(s.SetKPIStep("2026-11", "Maqola", 3.0, &yes))
	if stage() != 3 || !ticked() {
		t.Fatalf("stage %d, ticked %v", stage(), ticked())
	}
	// a bad stage: the tick must not be cleared by the same request
	wantInvalid(t, s.SetKPIStep("2026-11", "Maqola", 99.0, &no), "bosqich noto'g'ri")
	if stage() != 3 || !ticked() {
		t.Fatalf("a rejected step changed something: stage %d, ticked %v", stage(), ticked())
	}
	check(s.SetKPIStep("2026-11", "Maqola", -1.0, &no)) // "cannot be done this month" un-ticks it
	if stage() != -1 || ticked() {
		t.Fatalf("stage %d, ticked %v", stage(), ticked())
	}
	check(s.SetKPIStep("2026-11", "Maqola", 0.0, nil)) // without done: the tick is left alone
	check(s.SetKPIProgress("2026-11", "Maqola", 1.0))
}
