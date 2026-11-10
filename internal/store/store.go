// Package store is the SQLite storage: students, lessons (attendance sessions) and who came to each lesson.
// A missed lesson is a debt until a retake date is recorded.
//
// The schema and its migrations are identical to the original Python version, so an existing
// database file opens as is.
package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
create table if not exists students (
    id integer primary key, name text not null, active integer not null default 1, created_at real not null
);
create table if not exists sessions (
    id integer primary key, date text not null, started_at real not null,
    room text not null default '', topic text not null default '', created_at real not null,
    finished_at real
);
create table if not exists attendance (
    session_id integer not null references sessions(id) on delete cascade,
    student_id integer not null references students(id) on delete cascade,
    present integer not null default 1,
    retake_at text,
    primary key (session_id, student_id)
);
create index if not exists attendance_student on attendance (student_id);
create table if not exists retake_sessions (
    id integer primary key, date text not null, started_at real not null, finished_at real,
    room text not null default ''
);
create table if not exists kpi_marks (
    period text not null, item text not null, done integer not null default 1, updated_at real not null,
    primary key (period, item)
);
create table if not exists kpi_progress (
    period text not null, item text not null, step integer not null, updated_at real not null,
    primary key (period, item)
);
create table if not exists notifications (
    id integer primary key, kind text not null, title text not null, body text not null default '',
    link text not null default '', created_at real not null, read_at real
);
create table if not exists cancelled_lessons (
    date text not null, para integer not null, subject text not null, primary key (date, para, subject)
);
create table if not exists kpi_works (
    id integer primary key, title text not null, band text not null default '', step integer not null default 0, created_at real not null
);
create table if not exists kpi_steps (item text primary key, steps text not null);
create table if not exists settings (key text primary key, value text not null);
create table if not exists lesson_plans (
    date text not null, para integer not null, subject text not null, grp text not null default '',
    topic text not null default '', items text not null default '[]', ready integer not null default 0,
    outcome text not null default '', updated_at real not null, primary key (date, para)
);
create table if not exists course_topics (subject text primary key, topics text not null);
create table if not exists oxu_snapshot (
    id integer primary key check (id = 1), synced_at real not null, data text not null
);
`

// Store wraps the database. All access goes through one connection, which also serialises writers.
type Store struct{ db *sql.DB }

// Open opens (and migrates) the database at path; ":memory:" gives a throw-away one.
func Open(path string) (*Store, error) {
	dsn := path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return nil, err
		}
		dsn += "&_pragma=journal_mode(wal)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

type querier interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
	Exec(query string, args ...any) (sql.Result, error)
}

func (s *Store) tx(fn func(tx *sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func list[T any](q querier, query string, args []any, scan func(*sql.Rows) (T, error)) ([]T, error) {
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]T, 0)
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func exists(q querier, query string, args ...any) (bool, error) {
	var one int
	err := q.QueryRow(query, args...).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// affected turns "no row changed" into ErrNotFound.
func affected(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func now() float64 { return float64(time.Now().UnixNano()) / 1e9 }

func columns(q querier, table string) (map[string]bool, error) {
	names, err := list(q, "select name from pragma_table_info(?)", []any{table}, func(r *sql.Rows) (string, error) {
		var n string
		err := r.Scan(&n)
		return n, err
	})
	cols := make(map[string]bool, len(names))
	for _, n := range names {
		cols[n] = true
	}
	return cols, err
}

func (s *Store) migrate() error {
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}
	scols, err := columns(s.db, "sessions")
	if err != nil {
		return err
	}
	if !scols["finished_at"] {
		if _, err := s.db.Exec("alter table sessions add column finished_at real"); err != nil {
			return err
		}
	}
	if !scols["para"] {
		if _, err := s.db.Exec("alter table sessions add column para integer"); err != nil {
			return err
		}
	}
	// existing lessons: the first of a day is para 1, the next para 2
	if err := s.tx(func(tx *sql.Tx) error {
		days, err := list(tx, "select distinct date from sessions where para is null", nil, func(r *sql.Rows) (string, error) {
			var d string
			err := r.Scan(&d)
			return d, err
		})
		if err != nil {
			return err
		}
		for _, day := range days {
			ids, err := list(tx, "select id from sessions where date=? order by started_at, id", []any{day}, func(r *sql.Rows) (int64, error) {
				var id int64
				err := r.Scan(&id)
				return id, err
			})
			if err != nil {
				return err
			}
			for n, id := range ids {
				if _, err := tx.Exec("update sessions set para=? where id=?", min(n+1, 2), id); err != nil {
					return err
				}
			}
		}
		return nil
	}); err != nil {
		return err
	}
	acols, err := columns(s.db, "attendance")
	if err != nil {
		return err
	}
	for _, add := range []struct{ col, ddl string }{
		{"retake_time", "retake_time text"},
		{"retake_room", "retake_room text"},
		{"grade", "grade real"},
		{"retake_session_id", "retake_session_id integer references retake_sessions(id) on delete set null"},
	} {
		if !acols[add.col] {
			if _, err := s.db.Exec("alter table attendance add column " + add.ddl); err != nil {
				return err
			}
		}
	}
	return nil
}

// ---------------------------------------------------------------- KPI self-tracking

// KPIMark is the teacher's own note that a bonus item was done in a month.
type KPIMark struct {
	Period string `json:"period"`
	Item   string `json:"item"`
}

func (s *Store) KPIMarks() ([]KPIMark, error) {
	return list(s.db, "select period, item from kpi_marks where done = 1", nil, func(r *sql.Rows) (KPIMark, error) {
		var m KPIMark
		err := r.Scan(&m.Period, &m.Item)
		return m, err
	})
}

var periodRe = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// SetKPIMark records or clears the tick of an item for a month ("2026-11").
func (s *Store) SetKPIMark(period, item any, done bool) error {
	p, _ := period.(string)
	if !periodRe.MatchString(p) {
		return invalid("oy noto'g'ri")
	}
	title, err := cleanText(item, "band", 400, true)
	if err != nil {
		return err
	}
	if !done {
		_, err := s.db.Exec("delete from kpi_marks where period=? and item=?", p, title)
		return err
	}
	_, err = s.db.Exec("insert into kpi_marks (period, item, done, updated_at) values (?, ?, 1, ?)"+
		" on conflict (period, item) do update set done = 1, updated_at = excluded.updated_at", p, title, now())
	return err
}

// Notification is a notice shown in the app and through the browser.
type Notification struct {
	ID        int64    `json:"id"`
	Kind      string   `json:"kind"`
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	Link      string   `json:"link"`
	CreatedAt float64  `json:"created_at"`
	ReadAt    *float64 `json:"read_at"`
}

func (s *Store) AddNotification(kind, title, body, link string) error {
	_, err := s.db.Exec("insert into notifications (kind, title, body, link, created_at) values (?,?,?,?,?)", kind, title, body, link, now())
	return err
}

// Notifications returns the newest notices.
func (s *Store) Notifications() ([]Notification, error) {
	return list(s.db, "select id, kind, title, body, link, created_at, read_at from notifications order by id desc limit 100", nil, func(r *sql.Rows) (Notification, error) {
		var n Notification
		err := r.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.Link, &n.CreatedAt, &n.ReadAt)
		return n, err
	})
}

func (s *Store) MarkNotificationsRead() error {
	_, err := s.db.Exec("update notifications set read_at=? where read_at is null", now())
	return err
}

// CancelledLesson is a lesson that did not happen: it leaves the timetable and the teaching load.
type CancelledLesson struct {
	Date    string `json:"date"`
	Para    int    `json:"para"`
	Subject string `json:"subject"`
}

func (s *Store) CancelledLessons() ([]CancelledLesson, error) {
	return list(s.db, "select date, para, subject from cancelled_lessons order by date desc, para", nil, func(r *sql.Rows) (CancelledLesson, error) {
		var c CancelledLesson
		err := r.Scan(&c.Date, &c.Para, &c.Subject)
		return c, err
	})
}

func (s *Store) SetLessonCancelled(date, para, subject any, cancelled bool) error {
	d, err := cleanDate(date)
	if err != nil {
		return err
	}
	n, ok := para.(float64)
	if !ok || n < 1 || n > 12 || n != float64(int(n)) {
		return invalid("para noto'g'ri")
	}
	subj, err := cleanText(subject, "fan", 300, true)
	if err != nil {
		return err
	}
	if cancelled {
		_, err = s.db.Exec("insert or ignore into cancelled_lessons (date, para, subject) values (?,?,?)", d, int(n), subj)
	} else {
		_, err = s.db.Exec("delete from cancelled_lessons where date=? and para=? and subject=?", d, int(n), subj)
	}
	return err
}

// KPIWork is a scientific work the teacher tracks until it is uploaded to the site.
type KPIWork struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
	Band  string `json:"band"`
	Step  int    `json:"step"`
}

func (s *Store) KPIWorks() ([]KPIWork, error) {
	return list(s.db, "select id, title, band, step from kpi_works order by created_at desc, id desc", nil, func(r *sql.Rows) (KPIWork, error) {
		var w KPIWork
		err := r.Scan(&w.ID, &w.Title, &w.Band, &w.Step)
		return w, err
	})
}

func (s *Store) AddKPIWork(title, band any) (int64, error) {
	t, err := cleanText(title, "ish nomi", 400, true)
	if err != nil {
		return 0, err
	}
	b, err := cleanText(band, "band", 200, false)
	if err != nil {
		return 0, err
	}
	res, err := s.db.Exec("insert into kpi_works (title, band, created_at) values (?, ?, ?)", t, b, now())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// SetKPIWorkStep saves how many stages of a work are finished.
func (s *Store) SetKPIWorkStep(id int64, step any) error {
	n, ok := step.(float64)
	if !ok || n < 0 || n > 12 || n != float64(int(n)) {
		return invalid("bosqich noto'g'ri")
	}
	return affected(s.db.Exec("update kpi_works set step=? where id=?", int(n), id))
}

func (s *Store) DeleteKPIWork(id int64) error {
	return affected(s.db.Exec("delete from kpi_works where id=?", id))
}

// KPIProgress is how many stages of an item are finished in a month.
type KPIProgress struct {
	Period string `json:"period"`
	Item   string `json:"item"`
	Step   int    `json:"step"`
}

func (s *Store) KPIProgress() ([]KPIProgress, error) {
	return list(s.db, "select period, item, step from kpi_progress", nil, func(r *sql.Rows) (KPIProgress, error) {
		var p KPIProgress
		err := r.Scan(&p.Period, &p.Item, &p.Step)
		return p, err
	})
}

// SetKPIProgress saves the finished stages of an item for a month; 0 clears it, and -1 marks the item
// as one that cannot be done this month (it then leaves the open items and the reminders).
func (s *Store) SetKPIProgress(period, item, step any) error {
	p, _ := period.(string)
	if !periodRe.MatchString(p) {
		return invalid("oy noto'g'ri")
	}
	title, err := cleanText(item, "band", 400, true)
	if err != nil {
		return err
	}
	n, ok := step.(float64)
	if !ok || n < -1 || n > 12 || n != float64(int(n)) {
		return invalid("bosqich noto'g'ri")
	}
	if n == 0 {
		_, err := s.db.Exec("delete from kpi_progress where period=? and item=?", p, title)
		return err
	}
	_, err = s.db.Exec("insert into kpi_progress (period, item, step, updated_at) values (?, ?, ?, ?)"+
		" on conflict (period, item) do update set step = excluded.step, updated_at = excluded.updated_at", p, title, int(n), now())
	return err
}

// KPISteps returns the stage names the teacher set, by item. They apply to every month.
func (s *Store) KPISteps() (map[string][]string, error) {
	type row struct {
		item string
		raw  string
	}
	rows, err := list(s.db, "select item, steps from kpi_steps", nil, func(r *sql.Rows) (row, error) {
		var x row
		err := r.Scan(&x.item, &x.raw)
		return x, err
	})
	if err != nil {
		return nil, err
	}
	out := make(map[string][]string, len(rows))
	for _, x := range rows {
		steps := []string{}
		if err := json.Unmarshal([]byte(x.raw), &steps); err != nil {
			return nil, err
		}
		out[x.item] = steps
	}
	return out, nil
}

// SetKPISteps saves an item's stage names; an empty list means the item has no stages.
func (s *Store) SetKPISteps(item any, steps []any) error {
	title, err := cleanText(item, "band", 400, true)
	if err != nil {
		return err
	}
	if len(steps) > 12 {
		return invalid("bosqichlar 12 tadan oshmasin")
	}
	clean := make([]string, 0, len(steps))
	for _, raw := range steps {
		name, err := cleanText(raw, "bosqich", 40, false)
		if err != nil {
			return err
		}
		if name != "" {
			clean = append(clean, name)
		}
	}
	data, err := json.Marshal(clean)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("insert into kpi_steps (item, steps) values (?, ?) on conflict (item) do update set steps = excluded.steps", title, string(data))
	return err
}

// ---------------------------------------------------------------- settings

// OxuOwner is the digital.oxu.uz account whose data this app may hold; "" until it is set.
func (s *Store) OxuOwner() (string, error) {
	var v string
	err := s.db.QueryRow("select value from settings where key = 'oxu_owner'").Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v, err
}

var ownerRe = regexp.MustCompile(`^\d{3,12}$`)

// SetOxuOwner sets the account. Data synced for another account is dropped.
func (s *Store) SetOxuOwner(code any) error {
	c, _ := code.(string)
	c = strings.TrimSpace(c)
	if !ownerRe.MatchString(c) {
		return invalid("ID faqat raqamlardan iborat bo'lsin")
	}
	return s.tx(func(tx *sql.Tx) error {
		var old string
		err := tx.QueryRow("select value from settings where key = 'oxu_owner'").Scan(&old)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if old != c {
			if _, err := tx.Exec("delete from oxu_snapshot"); err != nil {
				return err
			}
		}
		_, err = tx.Exec("insert into settings (key, value) values ('oxu_owner', ?) on conflict (key) do update set value = excluded.value", c)
		return err
	})
}

// CoursePlanHours is the planned hours of the group taught in this app; nil until it is entered.
func (s *Store) CoursePlanHours() (*float64, error) {
	var v float64
	err := s.db.QueryRow("select cast(value as real) from settings where key = 'course_plan_hours'").Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// SetCoursePlanHours saves the planned hours; null or an empty value clears them.
func (s *Store) SetCoursePlanHours(hours any) error {
	if hours == nil || hours == "" {
		_, err := s.db.Exec("delete from settings where key = 'course_plan_hours'")
		return err
	}
	var v float64
	switch t := hours.(type) {
	case float64:
		v = t
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		if err != nil {
			return invalid("soat raqam bo'lishi kerak")
		}
		v = parsed
	default:
		return invalid("soat raqam bo'lishi kerak")
	}
	if !(v >= 0 && v <= 2000) {
		return invalid("soat 0 va 2000 orasida bo'lsin")
	}
	_, err := s.db.Exec("insert into settings (key, value) values ('course_plan_hours', ?)"+
		" on conflict (key) do update set value = excluded.value", strconv.FormatFloat(v, 'f', -1, 64))
	return err
}

// Semester is when the teaching semester starts and how many weeks it lasts. A week has six
// working days (Sunday is off), so the owner's 15 weeks are 90 working days; the teaching load's
// pace ("how much should be done by today") is measured against them.
type Semester struct {
	Start string `json:"start"`
	Weeks int    `json:"weeks"`
}

// Semester returns the saved semester, or the owner's default: 14 September 2026, 15 weeks.
func (s *Store) Semester() (Semester, error) {
	out := Semester{Start: "2026-09-14", Weeks: 15}
	rows, err := s.db.Query("select key, value from settings where key in ('semester_start', 'semester_weeks')")
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return out, err
		}
		if k == "semester_start" {
			out.Start = v
		} else if n, err := strconv.Atoi(v); err == nil {
			out.Weeks = n
		}
	}
	return out, rows.Err()
}

// SetSemester saves the semester's first day (YYYY-MM-DD) and its length in weeks.
func (s *Store) SetSemester(start any, weeks any) error {
	date, err := cleanDate(start)
	if err != nil {
		return err
	}
	n := -1
	switch t := weeks.(type) {
	case float64:
		if t == float64(int(t)) {
			n = int(t)
		}
	case string:
		if v, err := strconv.Atoi(strings.TrimSpace(t)); err == nil {
			n = v
		}
	}
	if n < 4 || n > 30 {
		return invalid("haftalar 4 va 30 orasida bo'lsin")
	}
	return s.tx(func(tx *sql.Tx) error {
		if _, err := tx.Exec("delete from settings where key = 'semester_days'"); err != nil {
			return err
		}
		for k, v := range map[string]string{"semester_start": date, "semester_weeks": strconv.Itoa(n)} {
			if _, err := tx.Exec("insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value", k, v); err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------------------------------------------------------------- digital.oxu.uz snapshot

// SaveOxu replaces the data last synced from digital.oxu.uz (JSON).
func (s *Store) SaveOxu(data []byte) error {
	_, err := s.db.Exec("insert into oxu_snapshot (id, synced_at, data) values (1, ?, ?)"+
		" on conflict (id) do update set synced_at = excluded.synced_at, data = excluded.data", now(), string(data))
	return err
}

// Oxu returns the last synced JSON and when it was synced; nil data when nothing was synced yet.
func (s *Store) Oxu() ([]byte, float64, error) {
	var data string
	var at float64
	err := s.db.QueryRow("select data, synced_at from oxu_snapshot where id = 1").Scan(&data, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	return []byte(data), at, nil
}

// ---------------------------------------------------------------- students

// Student is a row of the students table with the totals over their attendance.
type Student struct {
	ID      int64    `json:"id"`
	Name    string   `json:"name"`
	Active  int64    `json:"active"`
	Lessons int64    `json:"lessons"`
	Came    int64    `json:"came"`
	Missed  int64    `json:"missed"`
	Retaken int64    `json:"retaken"`
	Points  float64  `json:"points"`
	Graded  int64    `json:"graded"`
	Owed    int64    `json:"owed"`
	Rate    *float64 `json:"rate"`
	Average *float64 `json:"average"`
}

// HistoryRow is one lesson in a student's history.
type HistoryRow struct {
	SessionID  int64    `json:"session_id"`
	Date       string   `json:"date"`
	Para       *int64   `json:"para"`
	StartedAt  float64  `json:"started_at"`
	Room       string   `json:"room"`
	Topic      string   `json:"topic"`
	Present    int64    `json:"present"`
	RetakeAt   *string  `json:"retake_at"`
	RetakeTime *string  `json:"retake_time"`
	RetakeRoom *string  `json:"retake_room"`
	Grade      *float64 `json:"grade"`
}

// StudentDetail is a student with their lesson history.
type StudentDetail struct {
	Student
	History []HistoryRow `json:"history"`
}

func (s *Store) AddStudents(names []any) (int, error) {
	added := 0
	err := s.tx(func(tx *sql.Tx) error {
		existing, err := list(tx, "select name from students", nil, func(r *sql.Rows) (string, error) {
			var n string
			err := r.Scan(&n)
			return n, err
		})
		if err != nil {
			return err
		}
		seen := make(map[string]bool, len(existing))
		for _, n := range existing {
			seen[strings.ToLower(n)] = true
		}
		for _, raw := range names {
			name, err := cleanText(raw, "ism", 120, false)
			if err != nil {
				return err
			}
			if name == "" || seen[strings.ToLower(name)] {
				continue
			}
			if _, err := tx.Exec("insert into students (name, created_at) values (?, ?)", name, now()); err != nil {
				return err
			}
			seen[strings.ToLower(name)] = true
			added++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return added, nil
}

// UpdateStudent changes the name and/or the active flag; nil means "leave as is".
func (s *Store) UpdateStudent(id int64, name, active any) error {
	return s.tx(func(tx *sql.Tx) error {
		if ok, err := exists(tx, "select 1 from students where id=?", id); err != nil {
			return err
		} else if !ok {
			return ErrNotFound
		}
		if name != nil {
			clean, err := cleanText(name, "ism", 120, true)
			if err != nil {
				return err
			}
			if dup, err := exists(tx, "select 1 from students where lower(name)=lower(?) and id<>?", clean, id); err != nil {
				return err
			} else if dup {
				return invalid("bunday ism allaqachon bor")
			}
			if _, err := tx.Exec("update students set name=? where id=?", clean, id); err != nil {
				return err
			}
		}
		if active != nil {
			flag := 0
			if Truthy(active) {
				flag = 1
			}
			if _, err := tx.Exec("update students set active=? where id=?", flag, id); err != nil {
				return err
			}
		}
		return nil
	})
}

const studentsSQL = `
    select s.id, s.name, s.active,
           count(a.session_id) as lessons,
           coalesce(sum(a.present), 0) as came,
           coalesce(sum(1 - a.present), 0) as missed,
           coalesce(sum(case when a.present = 0 and a.retake_at is not null then 1 else 0 end), 0) as retaken,
           round(coalesce(sum(a.grade), 0), 1) as points, count(a.grade) as graded
    from students s left join attendance a on a.student_id = s.id
    %s
    group by s.id order by s.active desc, s.name collate nocase`

func scanStudent(r *sql.Rows) (Student, error) {
	var st Student
	if err := r.Scan(&st.ID, &st.Name, &st.Active, &st.Lessons, &st.Came, &st.Missed, &st.Retaken, &st.Points, &st.Graded); err != nil {
		return st, err
	}
	st.Owed = st.Missed - st.Retaken
	if st.Lessons > 0 {
		rate := round(100.0*float64(st.Came)/float64(st.Lessons), 1)
		st.Rate = &rate
	}
	if st.Graded > 0 {
		avg := round(st.Points/float64(st.Graded), 2)
		st.Average = &avg
	}
	return st, nil
}

func (s *Store) Students() ([]Student, error) {
	return list(s.db, fmt.Sprintf(studentsSQL, ""), nil, scanStudent)
}

func (s *Store) Student(id int64) (*StudentDetail, error) {
	found, err := list(s.db, fmt.Sprintf(studentsSQL, "where s.id = ?"), []any{id}, scanStudent)
	if err != nil {
		return nil, err
	}
	if len(found) == 0 {
		return nil, ErrNotFound
	}
	history, err := list(s.db, `
        select se.id, se.date, se.para, se.started_at, se.room, se.topic, a.present, a.retake_at, a.retake_time, a.retake_room, a.grade
        from attendance a join sessions se on se.id = a.session_id
        where a.student_id = ? order by se.date desc, se.para desc`, []any{id}, func(r *sql.Rows) (HistoryRow, error) {
		var h HistoryRow
		err := r.Scan(&h.SessionID, &h.Date, &h.Para, &h.StartedAt, &h.Room, &h.Topic, &h.Present, &h.RetakeAt, &h.RetakeTime, &h.RetakeRoom, &h.Grade)
		return h, err
	})
	if err != nil {
		return nil, err
	}
	return &StudentDetail{Student: found[0], History: history}, nil
}

// ---------------------------------------------------------------- sessions

// Session is one para of a day on which attendance is taken.
type Session struct {
	ID         int64    `json:"id"`
	Date       string   `json:"date"`
	StartedAt  float64  `json:"started_at"`
	Room       string   `json:"room"`
	Topic      string   `json:"topic"`
	CreatedAt  float64  `json:"created_at"`
	FinishedAt *float64 `json:"finished_at"`
	Para       *int64   `json:"para"`
	Total      int64    `json:"total"`
	Came       int64    `json:"came"`
}

// SessionStudent is a student's mark within one lesson.
type SessionStudent struct {
	ID       int64    `json:"id"`
	Name     string   `json:"name"`
	Present  int64    `json:"present"`
	RetakeAt *string  `json:"retake_at"`
	Grade    *float64 `json:"grade"`
}

// SessionDetail is a lesson with its students.
type SessionDetail struct {
	Session
	Students []SessionStudent `json:"students"`
}

func freePara(q querier, day string) (*int, error) {
	taken, err := list(q, "select para from sessions where date=?", []any{day}, func(r *sql.Rows) (int64, error) {
		var p sql.NullInt64
		err := r.Scan(&p)
		return p.Int64, err
	})
	if err != nil {
		return nil, err
	}
	for _, p := range Paras {
		free := true
		for _, t := range taken {
			if int(t) == p {
				free = false
			}
		}
		if free {
			return &p, nil
		}
	}
	return nil, nil
}

// FreePara is the para to offer for a day: the first one not taken yet (nil when both are).
func (s *Store) FreePara(day any) (*int, error) {
	d, err := cleanDate(day)
	if err != nil {
		return nil, err
	}
	return freePara(s.db, d)
}

// StartSession starts taking attendance for one para of a day; everyone on the active list starts as "came".
// A nil para picks the first free one; a zero now means the current time.
func (s *Store) StartSession(day, room, topic, para any, startedAt float64) (int64, error) {
	d, err := cleanDate(day)
	if err != nil {
		return 0, err
	}
	r, err := cleanText(room, "xona", 40, false)
	if err != nil {
		return 0, err
	}
	t, err := cleanText(topic, "mavzu", 200, false)
	if err != nil {
		return 0, err
	}
	if startedAt == 0 {
		startedAt = now()
	}
	var id int64
	err = s.tx(func(tx *sql.Tx) error {
		var p int
		if para != nil {
			if p, err = cleanPara(para); err != nil {
				return err
			}
		} else {
			fp, err := freePara(tx, d)
			if err != nil {
				return err
			}
			if fp == nil {
				return invalid("bu kunda ikkala para ham bor")
			}
			p = *fp
		}
		if taken, err := exists(tx, "select 1 from sessions where date=? and para=?", d, p); err != nil {
			return err
		} else if taken {
			return invalid("bu kunda %d-para allaqachon bor", p)
		}
		res, err := tx.Exec("insert into sessions (date, para, started_at, room, topic, created_at) values (?,?,?,?,?,?)",
			d, p, startedAt, r, t, now())
		if err != nil {
			return err
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		_, err = tx.Exec("insert into attendance (session_id, student_id, present) select ?, id, 1 from students where active = 1", id)
		return err
	})
	return id, err
}

const sessionCols = "se.id, se.date, se.started_at, se.room, se.topic, se.created_at, se.finished_at, se.para"

func scanSession(r *sql.Rows) (Session, error) {
	var se Session
	err := r.Scan(&se.ID, &se.Date, &se.StartedAt, &se.Room, &se.Topic, &se.CreatedAt, &se.FinishedAt, &se.Para, &se.Total, &se.Came)
	return se, err
}

func (s *Store) Sessions() ([]Session, error) {
	return list(s.db, `
        select `+sessionCols+`, count(a.student_id) as total, coalesce(sum(a.present), 0) as came
        from sessions se left join attendance a on a.session_id = se.id
        group by se.id order by se.date desc, se.para desc, se.started_at desc`, nil, scanSession)
}

func (s *Store) Session(id int64) (*SessionDetail, error) {
	found, err := list(s.db, `
        select `+sessionCols+`, 0, 0 from sessions se where se.id = ?`, []any{id}, scanSession)
	if err != nil {
		return nil, err
	}
	if len(found) == 0 {
		return nil, ErrNotFound
	}
	students, err := list(s.db, `
        select st.id, st.name, a.present, a.retake_at, a.grade from attendance a join students st on st.id = a.student_id
        where a.session_id = ? order by st.name collate nocase`, []any{id}, func(r *sql.Rows) (SessionStudent, error) {
		var x SessionStudent
		err := r.Scan(&x.ID, &x.Name, &x.Present, &x.RetakeAt, &x.Grade)
		return x, err
	})
	if err != nil {
		return nil, err
	}
	d := &SessionDetail{Session: found[0], Students: students}
	d.Total = int64(len(students))
	for _, st := range students {
		d.Came += st.Present
	}
	return d, nil
}

// UpdateSession changes the day/para/room/topic; nil means "leave as is".
func (s *Store) UpdateSession(id int64, day, room, topic, para any) error {
	return s.tx(func(tx *sql.Tx) error {
		var sets []string
		var args []any
		if day != nil || para != nil {
			var curDay string
			var curPara sql.NullInt64
			err := tx.QueryRow("select date, para from sessions where id=?", id).Scan(&curDay, &curPara)
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			} else if err != nil {
				return err
			}
			newDay, newPara := curDay, int(curPara.Int64)
			if day != nil {
				if newDay, err = cleanDate(day); err != nil {
					return err
				}
			}
			if para != nil {
				if newPara, err = cleanPara(para); err != nil {
					return err
				}
			}
			if clash, err := exists(tx, "select 1 from sessions where date=? and para=? and id<>?", newDay, newPara, id); err != nil {
				return err
			} else if clash {
				return invalid("bu kunda %d-para allaqachon bor", newPara)
			}
			sets = append(sets, "date=?", "para=?")
			args = append(args, newDay, newPara)
		}
		if room != nil {
			clean, err := cleanText(room, "xona", 40, false)
			if err != nil {
				return err
			}
			sets = append(sets, "room=?")
			args = append(args, clean)
		}
		if topic != nil {
			clean, err := cleanText(topic, "mavzu", 200, false)
			if err != nil {
				return err
			}
			sets = append(sets, "topic=?")
			args = append(args, clean)
		}
		if ok, err := exists(tx, "select 1 from sessions where id=?", id); err != nil {
			return err
		} else if !ok {
			return ErrNotFound
		}
		if len(sets) > 0 {
			_, err := tx.Exec("update sessions set "+strings.Join(sets, ", ")+" where id=?", append(args, id)...)
			return err
		}
		return nil
	})
}

// FinishSession marks the attendance as taken (a zero finishedAt means now); a nil topic keeps the topic.
func (s *Store) FinishSession(id int64, topic any, finishedAt float64) error {
	if finishedAt == 0 {
		finishedAt = now()
	}
	return s.tx(func(tx *sql.Tx) error {
		if ok, err := exists(tx, "select 1 from sessions where id=?", id); err != nil {
			return err
		} else if !ok {
			return ErrNotFound
		}
		if _, err := tx.Exec("update sessions set finished_at=coalesce(finished_at, ?) where id=?", finishedAt, id); err != nil {
			return err
		}
		if topic != nil {
			clean, err := cleanText(topic, "mavzu", 200, false)
			if err != nil {
				return err
			}
			_, err = tx.Exec("update sessions set topic=? where id=?", clean, id)
			return err
		}
		return nil
	})
}

// Rooms are the rooms used for retakes before, most recent first: offered as choices.
func (s *Store) Rooms() ([]string, error) {
	return list(s.db, `
        select retake_room, max(retake_at || ' ' || retake_time) as last from attendance
        where retake_room is not null and retake_room <> '' group by retake_room order by last desc limit 20`, nil,
		func(r *sql.Rows) (string, error) {
			var room string
			var last sql.NullString
			err := r.Scan(&room, &last)
			return room, err
		})
}

func (s *Store) DeleteSession(id int64) error {
	return affected(s.db.Exec("delete from sessions where id=?", id))
}

func (s *Store) SetPresent(sessionID, studentID int64, present bool) error {
	p := 0
	if present {
		p = 1
	}
	// coming back to "present" also clears a retake that no longer applies, all of it
	return affected(s.db.Exec(
		"update attendance set present=?, retake_at=case when ? then null else retake_at end,"+
			" retake_time=case when ? then null else retake_time end, retake_room=case when ? then null else retake_room end,"+
			" retake_session_id=case when ? then null else retake_session_id end where session_id=? and student_id=?",
		p, p, p, p, p, sessionID, studentID))
}

// SetGrade sets a grade for the lesson (any number between -100 and 100, empty clears it).
func (s *Store) SetGrade(sessionID, studentID int64, grade any) error {
	value, err := parseGrade(grade)
	if err != nil {
		return err
	}
	var arg any
	if value != nil {
		arg = *value
	}
	return affected(s.db.Exec("update attendance set grade=? where session_id=? and student_id=?", arg, sessionID, studentID))
}

func (s *Store) SetAllPresent(sessionID int64) error {
	_, err := s.db.Exec("update attendance set present=1, retake_at=null, retake_time=null, retake_room=null, retake_session_id=null where session_id=?", sessionID)
	return err
}

// ---------------------------------------------------------------- retakes

// Retake is one missed lesson of a student.
type Retake struct {
	SessionID  int64   `json:"session_id"`
	StudentID  int64   `json:"student_id"`
	Name       string  `json:"name"`
	Active     int64   `json:"active"`
	Date       string  `json:"date"`
	Para       *int64  `json:"para"`
	Topic      string  `json:"topic"`
	RetakeAt   *string `json:"retake_at"`
	RetakeTime *string `json:"retake_time"`
	RetakeRoom *string `json:"retake_room"`
}

// Retakes lists every missed lesson with the totals.
type Retakes struct {
	Items   []Retake `json:"items"`
	Missed  int      `json:"missed"`
	Retaken int      `json:"retaken"`
	Owed    int      `json:"owed"`
}

func (s *Store) Retakes() (*Retakes, error) {
	items, err := list(s.db, `
        select a.session_id, a.student_id, st.name, st.active, se.date, se.para, se.topic,
               a.retake_at, a.retake_time, a.retake_room
        from attendance a join students st on st.id = a.student_id join sessions se on se.id = a.session_id
        where a.present = 0 order by se.date desc, se.para desc, st.name collate nocase`, nil, func(r *sql.Rows) (Retake, error) {
		var x Retake
		err := r.Scan(&x.SessionID, &x.StudentID, &x.Name, &x.Active, &x.Date, &x.Para, &x.Topic, &x.RetakeAt, &x.RetakeTime, &x.RetakeRoom)
		return x, err
	})
	if err != nil {
		return nil, err
	}
	out := &Retakes{Items: items, Missed: len(items)}
	for _, x := range items {
		if x.RetakeAt != nil {
			out.Retaken++
		}
	}
	out.Owed = out.Missed - out.Retaken
	return out, nil
}

// SetRetake records a retake of a missed lesson: on which day, at what time and where. done=false cancels it.
func (s *Store) SetRetake(sessionID, studentID int64, done bool, day, at, room any) error {
	var vals [3]any
	if done {
		if !Truthy(day) {
			day = time.Now().In(Tashkent()).Format("2006-01-02")
		}
		d, err := cleanDate(day)
		if err != nil {
			return err
		}
		t, err := cleanTime(at)
		if err != nil {
			return err
		}
		r, err := cleanText(room, "xona", 60, true)
		if err != nil {
			return err
		}
		vals = [3]any{d, t, r}
	}
	return affected(s.db.Exec(
		"update attendance set retake_at=?, retake_time=?, retake_room=?, retake_session_id=null"+
			" where session_id=? and student_id=? and present=0", vals[0], vals[1], vals[2], sessionID, studentID))
}

// ---------------------------------------------------------------- retake sessions

// RetakeSession is one sitting in which retakes are accepted.
type RetakeSession struct {
	ID         int64    `json:"id"`
	Date       string   `json:"date"`
	StartedAt  float64  `json:"started_at"`
	FinishedAt *float64 `json:"finished_at"`
	Room       string   `json:"room"`
	Accepted   int64    `json:"accepted"`
}

// RetakeItem is a missed lesson offered in a retake sitting.
type RetakeItem struct {
	SessionID       int64  `json:"session_id"`
	StudentID       int64  `json:"student_id"`
	Name            string `json:"name"`
	Date            string `json:"date"`
	Para            *int64 `json:"para"`
	Topic           string `json:"topic"`
	RetakeSessionID *int64 `json:"retake_session_id"`
}

// RetakeSessionDetail is a sitting with everything still owed plus what it accepted.
type RetakeSessionDetail struct {
	RetakeSession
	Items []RetakeItem `json:"items"`
}

// StartRetakeSession starts accepting retakes; the room comes at the end. A zero startedAt means now.
func (s *Store) StartRetakeSession(day any, startedAt float64) (int64, error) {
	d, err := cleanDate(day)
	if err != nil {
		return 0, err
	}
	if startedAt == 0 {
		startedAt = now()
	}
	res, err := s.db.Exec("insert into retake_sessions (date, started_at) values (?, ?)", d, startedAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) RetakeSessions() ([]RetakeSession, error) {
	return list(s.db, `
        select rs.id, rs.date, rs.started_at, rs.finished_at, rs.room, count(a.session_id) as accepted from retake_sessions rs
        left join attendance a on a.retake_session_id = rs.id
        group by rs.id order by rs.date desc, rs.started_at desc`, nil, func(r *sql.Rows) (RetakeSession, error) {
		var x RetakeSession
		err := r.Scan(&x.ID, &x.Date, &x.StartedAt, &x.FinishedAt, &x.Room, &x.Accepted)
		return x, err
	})
}

func (s *Store) RetakeSession(id int64) (*RetakeSessionDetail, error) {
	var d RetakeSessionDetail
	err := s.db.QueryRow("select id, date, started_at, finished_at, room from retake_sessions where id=?", id).
		Scan(&d.ID, &d.Date, &d.StartedAt, &d.FinishedAt, &d.Room)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, err
	}
	// everything still owed, plus what was accepted in this sitting (so a mistake can be undone)
	d.Items, err = list(s.db, `
        select a.session_id, a.student_id, st.name, se.date, se.para, se.topic, a.retake_session_id
        from attendance a join students st on st.id = a.student_id join sessions se on se.id = a.session_id
        where a.present = 0 and (a.retake_at is null or a.retake_session_id = ?)
        order by st.name collate nocase, se.date, se.para`, []any{id}, func(r *sql.Rows) (RetakeItem, error) {
		var x RetakeItem
		err := r.Scan(&x.SessionID, &x.StudentID, &x.Name, &x.Date, &x.Para, &x.Topic, &x.RetakeSessionID)
		return x, err
	})
	if err != nil {
		return nil, err
	}
	for _, x := range d.Items {
		if x.RetakeSessionID != nil && *x.RetakeSessionID == id {
			d.Accepted++
		}
	}
	return &d, nil
}

func (s *Store) AcceptRetake(retakeSessionID, sessionID, studentID int64, done bool) error {
	return s.tx(func(tx *sql.Tx) error {
		var day string
		err := tx.QueryRow("select date from retake_sessions where id=?", retakeSessionID).Scan(&day)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if done {
			return affected(tx.Exec(
				"update attendance set retake_at=?, retake_session_id=? where session_id=? and student_id=? and present=0"+
					" and (retake_at is null or retake_session_id=?)", day, retakeSessionID, sessionID, studentID, retakeSessionID))
		}
		return affected(tx.Exec(
			"update attendance set retake_at=null, retake_session_id=null where session_id=? and student_id=? and retake_session_id=?",
			sessionID, studentID, retakeSessionID))
	})
}

func (s *Store) FinishRetakeSession(id int64, room any, finishedAt float64) error {
	r, err := cleanText(room, "xona", 40, true)
	if err != nil {
		return err
	}
	if finishedAt == 0 {
		finishedAt = now()
	}
	return affected(s.db.Exec("update retake_sessions set room=?, finished_at=coalesce(finished_at, ?) where id=?", r, finishedAt, id))
}

func (s *Store) DeleteRetakeSession(id int64) error {
	return s.tx(func(tx *sql.Tx) error {
		if _, err := tx.Exec("update attendance set retake_at=null, retake_session_id=null where retake_session_id=?", id); err != nil {
			return err
		}
		return affected(tx.Exec("delete from retake_sessions where id=?", id))
	})
}
