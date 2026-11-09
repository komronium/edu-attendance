package store

import (
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
)

// Share is the students' link to their retakes: a secret anyone holding the link can use, and the
// heading the page shows (the subject and group, as the owner's app names them).
type Share struct {
	Token string         `json:"token"`
	Title string         `json:"title"`
	Paras map[string]int `json:"paras,omitempty"` // the app's para 1, 2 as the timetable numbers them
}

// RetakeShare returns the current link; nil when sharing is off.
func (s *Store) RetakeShare() (*Share, error) {
	var raw string
	err := s.db.QueryRow("select value from settings where key = 'retake_share'").Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var sh Share
	if err := json.Unmarshal([]byte(raw), &sh); err != nil || sh.Token == "" {
		return nil, nil
	}
	return &sh, nil
}

// NewRetakeShare makes a fresh secret, so a link given out before stops working.
func (s *Store) NewRetakeShare(title, paras any) (*Share, error) {
	t, err := cleanText(title, "sarlavha", 120, false)
	if err != nil {
		return nil, err
	}
	raw := make([]byte, 18)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	sh := &Share{Token: base64.RawURLEncoding.EncodeToString(raw), Title: t, Paras: map[string]int{}}
	if m, ok := paras.(map[string]any); ok {
		for k, v := range m {
			if n, ok := v.(float64); ok && n >= 1 && n <= 8 && len(sh.Paras) < 8 {
				sh.Paras[k] = int(n)
			}
		}
	}
	js, _ := json.Marshal(sh)
	_, err = s.db.Exec("insert into settings (key, value) values ('retake_share', ?) on conflict (key) do update set value = excluded.value", string(js))
	return sh, err
}

// StopRetakeShare turns the link off.
func (s *Store) StopRetakeShare() error {
	_, err := s.db.Exec("delete from settings where key = 'retake_share'")
	return err
}

// CheckRetakeShare reports whether token opens the students' page.
func (s *Store) CheckRetakeShare(token string) (*Share, bool) {
	sh, err := s.RetakeShare()
	if err != nil || sh == nil || token == "" {
		return nil, false
	}
	return sh, subtle.ConstantTimeCompare([]byte(sh.Token), []byte(token)) == 1
}

// Para is how the page numbers an app para.
func (sh *Share) Para(p int64) int64 {
	if n, ok := sh.Paras[strconv.FormatInt(p, 10)]; ok {
		return int64(n)
	}
	return p
}

// ShortName turns "Karimov Aziz Akmal o'g'li" into "Karimov A.": the student knows themselves,
// the page does not carry the full name.
func ShortName(full string) string {
	parts := strings.Fields(full)
	if len(parts) == 0 {
		return ""
	}
	if len(parts) == 1 {
		return parts[0]
	}
	first := []rune(parts[1])
	return parts[0] + " " + strings.ToUpper(string(first[0])) + "."
}
