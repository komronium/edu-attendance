package store

import (
	"database/sql"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"
	_ "time/tzdata" // so Asia/Tashkent resolves on a machine without zoneinfo
)

var (
	tzOnce sync.Once
	tz     *time.Location
)

// Tashkent is the time zone the lessons are in.
func Tashkent() *time.Location {
	tzOnce.Do(func() {
		var err error
		if tz, err = time.LoadLocation("Asia/Tashkent"); err != nil {
			tz = time.FixedZone("UTC+5", 5*3600)
		}
	})
	return tz
}

// ImportSpec is the JSON made from the gradebook.
type ImportSpec struct {
	Students []string `json:"students"`
	Lessons  []struct {
		Date   string `json:"date"`
		Number int    `json:"number"`
		Topic  string `json:"topic"`
		Marks  map[string]struct {
			Absent bool     `json:"absent"`
			Grade  *float64 `json:"grade"`
		} `json:"marks"`
	} `json:"lessons"`
	Retakes []struct {
		Date  string `json:"date"`
		Start string `json:"start"`
		End   string `json:"end"`
		Room  string `json:"room"`
		Items []struct {
			Missed string `json:"missed"`
			Number int    `json:"number"`
			Name   string `json:"name"`
		} `json:"items"`
	} `json:"retakes"`
}

// ImportResult counts what an import wrote.
type ImportResult struct {
	Students       int `json:"students"`
	Lessons        int `json:"lessons"`
	RetakeSittings int `json:"retake_sittings"`
	Retakes        int `json:"retakes"`
}

func ts(day, hhmm string) (float64, error) {
	t, err := time.ParseInLocation("2006-01-02T15:04", day+"T"+hhmm, Tashkent())
	if err != nil {
		return 0, err
	}
	return float64(t.Unix()), nil
}

// Import replaces lessons, attendance, grades and retakes with the spec. Students are matched by
// name and created when missing. Run it with the service stopped.
func (s *Store) Import(spec *ImportSpec) (*ImportResult, error) {
	res := &ImportResult{Lessons: len(spec.Lessons), RetakeSittings: len(spec.Retakes)}
	err := s.tx(func(tx *sql.Tx) error {
		existing, err := list(tx, "select id, name from students", nil, func(r *sql.Rows) ([2]any, error) {
			var id int64
			var name string
			err := r.Scan(&id, &name)
			return [2]any{id, name}, err
		})
		if err != nil {
			return err
		}
		names := map[string]int64{}
		for _, e := range existing {
			names[e[1].(string)] = e[0].(int64)
		}
		created, err := ts("2026-09-14", "12:00")
		if err != nil {
			return err
		}
		for _, name := range spec.Students {
			if _, ok := names[name]; !ok {
				r, err := tx.Exec("insert into students (name, created_at) values (?, ?)", name, created)
				if err != nil {
					return err
				}
				if names[name], err = r.LastInsertId(); err != nil {
					return err
				}
			}
		}
		res.Students = len(names)
		if _, err := tx.Exec("update attendance set retake_session_id = null"); err != nil {
			return err
		}
		if _, err := tx.Exec("delete from retake_sessions"); err != nil {
			return err
		}
		if _, err := tx.Exec("delete from sessions"); err != nil { // attendance rows go with them
			return err
		}
		type key struct {
			date   string
			number int
		}
		lessonIDs := map[key]int64{}
		for _, lesson := range spec.Lessons {
			base, err := ts(lesson.Date, "12:00")
			if err != nil {
				return err
			}
			start := base + float64(lesson.Number*60) // order lessons of the same day
			r, err := tx.Exec("insert into sessions (date, para, started_at, finished_at, room, topic, created_at) values (?,?,?,?,?,?,?)",
				lesson.Date, lesson.Number, start, start, "", lesson.Topic, start)
			if err != nil {
				return err
			}
			sid, err := r.LastInsertId()
			if err != nil {
				return err
			}
			lessonIDs[key{lesson.Date, lesson.Number}] = sid
			for name, mark := range lesson.Marks {
				stid, ok := names[name]
				if !ok {
					return fmt.Errorf("unknown student in marks: %q", name)
				}
				present, grade := 1, any(nil)
				if mark.Absent {
					present = 0
				}
				if mark.Grade != nil {
					grade = *mark.Grade
				}
				if _, err := tx.Exec("insert into attendance (session_id, student_id, present, grade) values (?,?,?,?)", sid, stid, present, grade); err != nil {
					return err
				}
			}
		}
		for _, sitting := range spec.Retakes {
			started, err := ts(sitting.Date, sitting.Start)
			if err != nil {
				return err
			}
			var finished any
			if sitting.Room != "" {
				end, err := ts(sitting.Date, sitting.End)
				if err != nil {
					return err
				}
				finished = end
			}
			r, err := tx.Exec("insert into retake_sessions (date, started_at, finished_at, room) values (?,?,?,?)",
				sitting.Date, started, finished, sitting.Room)
			if err != nil {
				return err
			}
			rid, err := r.LastInsertId()
			if err != nil {
				return err
			}
			for _, item := range sitting.Items {
				sid, ok := lessonIDs[key{item.Missed, item.Number}]
				if !ok {
					return fmt.Errorf("no such lesson for retake: %+v", item)
				}
				if err := affected(tx.Exec("update attendance set retake_at=?, retake_session_id=? where session_id=? and student_id=? and present=0",
					sitting.Date, rid, sid, names[item.Name])); err != nil {
					return fmt.Errorf("no absence to retake: %+v", item)
				}
				res.Retakes++
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// ---------------------------------------------------------------- demo

var demoNames = []string{"Abdullayev Jasur", "Karimova Madina", "Toshmatov Bekzod", "Yusupova Dilnoza", "Rahimov Sardor",
	"Nazarova Sevara", "Ergashev Otabek", "Qodirova Nilufar", "Saidov Javohir", "Mirzayeva Shahzoda",
	"Xolmatov Azizbek", "Umarova Gulnoza", "Ismoilov Doniyor", "Sobirova Malika", "Aliyev Shoxrux",
	"To'xtayeva Zarina", "G'aniyev Ulug'bek", "Ro'ziyeva Kamola"}

var demoTopics = []string{"Kirish. Kurs maqsadi", "O'zgaruvchilar va turlar", "Shart operatorlari", "Sikllar", "Funksiyalar",
	"Ro'yxatlar va lug'atlar", "Fayllar bilan ishlash", "Xatolarni ushlash"}

// Seed fills the database with invented data for looking at the design.
func (s *Store) Seed() error {
	rng := rand.New(rand.NewPCG(3, 3))
	names := make([]any, len(demoNames))
	for i, n := range demoNames {
		names[i] = n
	}
	if _, err := s.AddStudents(names); err != nil {
		return err
	}
	students, err := s.Students()
	if err != nil {
		return err
	}
	today := time.Now().In(Tashkent())
	type debt struct{ session, student int64 }
	var retakes []debt
	for i, topic := range demoTopics {
		day := today.AddDate(0, 0, -21+i*3)
		if day.After(today) {
			break
		}
		daysAgo := int(today.Sub(day).Hours() / 24)
		started := now() - float64(daysAgo*86400) - 3600
		sid, err := s.StartSession(day.Format("2006-01-02"), nil, nil, nil, started)
		if err != nil {
			return err
		}
		for _, st := range students {
			if rng.Float64() < 0.13 {
				if err := s.SetPresent(sid, st.ID, false); err != nil {
					return err
				}
				if rng.Float64() < 0.5 {
					retakes = append(retakes, debt{sid, st.ID})
				}
			}
		}
		if day.Format("2006-01-02") != today.Format("2006-01-02") { // today's attendance is still being taken
			if err := s.FinishSession(sid, topic, started+float64(180+rng.IntN(240))); err != nil {
				return err
			}
		}
	}
	yesterday := today.AddDate(0, 0, -1).Format("2006-01-02")
	for n, d := range retakes { // half of the debts already retaken, with time and place
		if err := s.SetRetake(d.session, d.student, true, yesterday, fmt.Sprintf("14:%02d", 10+n*5%50), "K4 / 309"); err != nil {
			return err
		}
	}
	return nil
}
