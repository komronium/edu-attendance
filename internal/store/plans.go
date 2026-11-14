package store

import (
	"database/sql"
	"encoding/json"
	"strings"
)

// ---------------------------------------------------------------- lesson plans

// PlanItem is one point of a lesson plan ("for sikli", "uy vazifasi"); Done is ticked after the lesson.
type PlanItem struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

// LessonPlan is the teacher's own preparation for one lesson, made before the lesson exists anywhere
// else. The date, timetable para (1-9), subject and group name it: two lessons can fall on the same
// para (a timetable clash), and each keeps its own plan.
// Outcome is "" until the lesson is over: "done", "partial" or "moved" (left for the next lesson).
type LessonPlan struct {
	Date      string     `json:"date"`
	Para      int        `json:"para"`
	Subject   string     `json:"subject"`
	Group     string     `json:"group"`
	Topic     string     `json:"topic"`
	Items     []PlanItem `json:"items"`
	Ready     bool       `json:"ready"`
	Outcome   string     `json:"outcome"`
	UpdatedAt float64    `json:"updated_at"`
}

const (
	maxPlanItems = 20
	maxTopics    = 200
)

var outcomes = map[string]bool{"": true, "done": true, "partial": true, "moved": true}

func (s *Store) LessonPlans() ([]LessonPlan, error) {
	return list(s.db, "select date, para, subject, grp, topic, items, ready, outcome, updated_at from lesson_plans order by date, para", nil,
		func(r *sql.Rows) (LessonPlan, error) {
			var p LessonPlan
			var items string
			if err := r.Scan(&p.Date, &p.Para, &p.Subject, &p.Group, &p.Topic, &items, &p.Ready, &p.Outcome, &p.UpdatedAt); err != nil {
				return p, err
			}
			p.Items = []PlanItem{}
			if err := json.Unmarshal([]byte(items), &p.Items); err != nil {
				p.Items = []PlanItem{}
			}
			return p, nil
		})
}

func timetablePara(v any) (int, error) {
	n, ok := v.(float64)
	if !ok || n < 1 || n > 12 || n != float64(int(n)) {
		return 0, invalid("para noto'g'ri")
	}
	return int(n), nil
}

func cleanItems(v any) ([]PlanItem, error) {
	if v == nil {
		return []PlanItem{}, nil
	}
	raw, ok := v.([]any)
	if !ok {
		return nil, invalid("bandlar ro'yxat bo'lishi kerak")
	}
	out := make([]PlanItem, 0, len(raw))
	for _, x := range raw {
		m, ok := x.(map[string]any)
		if !ok {
			return nil, invalid("band noto'g'ri")
		}
		text, err := cleanText(m["text"], "band", 200, false)
		if err != nil {
			return nil, err
		}
		if text == "" {
			continue
		}
		out = append(out, PlanItem{Text: text, Done: Truthy(m["done"])})
	}
	if len(out) > maxPlanItems {
		return nil, invalid("bandlar %d tadan oshmasin", maxPlanItems)
	}
	return out, nil
}

// SetLessonPlan writes the plan of one lesson; a plan with nothing in it is removed.
func (s *Store) SetLessonPlan(date, para, subject, group, topic, items, ready, outcome any) error {
	d, err := cleanDate(date)
	if err != nil {
		return err
	}
	p, err := timetablePara(para)
	if err != nil {
		return err
	}
	subj, err := cleanText(subject, "fan", 300, true)
	if err != nil {
		return err
	}
	grp, err := cleanText(group, "guruh", 100, false)
	if err != nil {
		return err
	}
	t, err := cleanText(topic, "mavzu", 200, false)
	if err != nil {
		return err
	}
	planItems, err := cleanItems(items)
	if err != nil {
		return err
	}
	out := str(outcome)
	if !outcomes[out] {
		return invalid("natija noto'g'ri")
	}
	isReady := Truthy(ready)
	if t == "" && len(planItems) == 0 && !isReady && out == "" {
		_, err := s.db.Exec("delete from lesson_plans where date=? and para=? and subject=? and grp=?", d, p, subj, grp)
		return err
	}
	js, err := json.Marshal(planItems)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`insert into lesson_plans (date, para, subject, grp, topic, items, ready, outcome, updated_at) values (?,?,?,?,?,?,?,?,?)
		on conflict (date, para, subject, grp) do update set topic=excluded.topic, items=excluded.items,
		ready=excluded.ready, outcome=excluded.outcome, updated_at=excluded.updated_at`,
		d, p, subj, grp, t, string(js), isReady, out, now())
	return err
}

// CourseTopics is each subject's semester topic list, in teaching order.
func (s *Store) CourseTopics() (map[string][]string, error) {
	out := map[string][]string{}
	rows, err := list(s.db, "select subject, topics from course_topics", nil, func(r *sql.Rows) ([2]string, error) {
		var v [2]string
		err := r.Scan(&v[0], &v[1])
		return v, err
	})
	if err != nil {
		return nil, err
	}
	for _, v := range rows {
		var topics []string
		if json.Unmarshal([]byte(v[1]), &topics) == nil {
			out[v[0]] = topics
		}
	}
	return out, nil
}

// SetCourseTopics replaces a subject's topic list; an empty list removes it.
func (s *Store) SetCourseTopics(subject any, topics []any) error {
	subj, err := cleanText(subject, "fan", 300, true)
	if err != nil {
		return err
	}
	clean := make([]string, 0, len(topics))
	seen := map[string]bool{}
	for _, t := range topics {
		text, err := cleanText(t, "mavzu", 200, false)
		if err != nil {
			return err
		}
		key := strings.ToLower(text)
		if text == "" || seen[key] {
			continue
		}
		seen[key] = true
		clean = append(clean, text)
	}
	if len(clean) > maxTopics {
		return invalid("mavzular %d tadan oshmasin", maxTopics)
	}
	if len(clean) == 0 {
		_, err := s.db.Exec("delete from course_topics where subject=?", subj)
		return err
	}
	js, err := json.Marshal(clean)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("insert into course_topics (subject, topics) values (?,?) on conflict (subject) do update set topics=excluded.topics", subj, string(js))
	return err
}

// migratePlanKey rebuilds lesson_plans made when a plan was keyed by date and para alone, so two
// lessons on the same para get a plan each. The rows are kept as they are.
func (s *Store) migratePlanKey() error {
	var n int
	if err := s.db.QueryRow("select count(*) from pragma_table_info('lesson_plans') where pk > 0").Scan(&n); err != nil {
		return err
	}
	if n != 2 {
		return nil
	}
	return s.tx(func(tx *sql.Tx) error {
		for _, q := range []string{
			"alter table lesson_plans rename to lesson_plans_old",
			`create table lesson_plans (
    date text not null, para integer not null, subject text not null, grp text not null default '',
    topic text not null default '', items text not null default '[]', ready integer not null default 0,
    outcome text not null default '', updated_at real not null, primary key (date, para, subject, grp))`,
			"insert into lesson_plans select date, para, subject, grp, topic, items, ready, outcome, updated_at from lesson_plans_old",
			"drop table lesson_plans_old",
		} {
			if _, err := tx.Exec(q); err != nil {
				return err
			}
		}
		return nil
	})
}
