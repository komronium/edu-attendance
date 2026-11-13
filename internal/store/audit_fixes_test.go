package store

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRenameRefusesANameThatDiffersOnlyInNonASCIICase(t *testing.T) {
	s := open(t)
	must(s.AddStudents([]any{"Ōzbekova Ōlga", "Aliyev Ali"}))
	list := must(s.Students())
	var ali int64
	for _, st := range list {
		if st.Name == "Aliyev Ali" {
			ali = st.ID
		}
	}
	err := s.UpdateStudent(ali, "ōzbekova ōlga", nil)
	if err == nil || !strings.Contains(err.Error(), "allaqachon") {
		t.Fatalf("rename to a duplicate (Unicode case) was accepted: %v", err)
	}
	if err := s.UpdateStudent(ali, "aliyev ali", nil); err != nil {
		t.Fatalf("a student may change the case of their own name: %v", err)
	}
}

func TestImportRejectsBadLessons(t *testing.T) {
	for name, lessons := range map[string]string{
		"para 3":    `[{"date":"2026-11-02","number":3}]`,
		"para 0":    `[{"date":"2026-11-02","number":0}]`,
		"bad date":  `[{"date":"2026-13-02","number":1}]`,
		"duplicate": `[{"date":"2026-11-02","number":1},{"date":"2026-11-02","number":1}]`,
	} {
		t.Run(name, func(t *testing.T) {
			s := open(t)
			must(s.AddStudents([]any{"Aliyev Ali"}))
			must(s.StartSession("2026-10-01", "", "", nil, 0))
			var spec ImportSpec
			check(json.Unmarshal([]byte(`{"students":[],"lessons":`+lessons+`,"retakes":[]}`), &spec))
			if _, err := s.Import(&spec); err == nil {
				t.Fatal("accepted")
			}
			if got := must(s.Sessions()); len(got) != 1 {
				t.Fatalf("a refused import changed the lessons: %d left", len(got))
			}
		})
	}
}
