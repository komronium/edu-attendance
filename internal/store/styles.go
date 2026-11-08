package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
)

// SubjectStyle is how a subject looks on the timetable: its colour, fixed once it is first given so
// a new subject in the load never reshuffles the others, and an optional short name for the cards.
type SubjectStyle struct {
	Color string `json:"color"`
	Short string `json:"short"`
}

var colorRe = regexp.MustCompile(`^c[1-8]$`)

const maxSubjects = 100

func (s *Store) SubjectStyles() (map[string]SubjectStyle, error) {
	out := map[string]SubjectStyle{}
	var raw string
	err := s.db.QueryRow("select value from settings where key = 'subject_styles'").Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if json.Unmarshal([]byte(raw), &out) != nil {
		return map[string]SubjectStyle{}, nil
	}
	return out, nil
}

// SetSubjectStyles merges the given subjects into the saved ones; each value replaces that subject's style.
func (s *Store) SetSubjectStyles(styles any) error {
	in, ok := styles.(map[string]any)
	if !ok {
		return invalid("uslublar noto'g'ri")
	}
	return s.tx(func(tx *sql.Tx) error {
		cur := map[string]SubjectStyle{}
		var raw string
		err := tx.QueryRow("select value from settings where key = 'subject_styles'").Scan(&raw)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if raw != "" {
			json.Unmarshal([]byte(raw), &cur)
		}
		for name, v := range in {
			subj, err := cleanText(name, "fan", 300, true)
			if err != nil {
				return err
			}
			m, ok := v.(map[string]any)
			if !ok {
				return invalid("uslub noto'g'ri")
			}
			color := str(m["color"])
			if !colorRe.MatchString(color) {
				return invalid("rang noto'g'ri")
			}
			short, err := cleanText(m["short"], "qisqa nom", 40, false)
			if err != nil {
				return err
			}
			cur[subj] = SubjectStyle{Color: color, Short: short}
		}
		if len(cur) > maxSubjects {
			return invalid("fanlar %d tadan oshmasin", maxSubjects)
		}
		js, err := json.Marshal(cur)
		if err != nil {
			return err
		}
		_, err = tx.Exec("insert into settings (key, value) values ('subject_styles', ?) on conflict (key) do update set value = excluded.value", string(js))
		return err
	})
}
