package store

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// ValidationError is a user-facing problem with the input (HTTP 400).
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func invalid(format string, args ...any) error {
	return &ValidationError{Msg: fmt.Sprintf(format, args...)}
}

// ErrNotFound means the addressed row does not exist (HTTP 404).
var ErrNotFound = errors.New("topilmadi")

// Paras are the lessons of a day.
var Paras = []int{1, 2}

// Truthy mirrors how the JSON body values were read as booleans: null, false, 0 and "" are false.
func Truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		return t != ""
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	}
	return true
}

// str is `str(value or "")`: falsy values become the empty string.
func str(v any) string {
	if !Truthy(v) {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case bool:
		return "True"
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	}
	return fmt.Sprint(v)
}

func cleanText(v any, field string, limit int, required bool) (string, error) {
	text := strings.Join(strings.Fields(str(v)), " ")
	if required && text == "" {
		return "", invalid("%s bo'sh bo'lmasligi kerak", field)
	}
	if utf8.RuneCountInString(text) > limit {
		return "", invalid("%s %d belgidan oshmasin", field, limit)
	}
	return text, nil
}

func cleanPara(v any) (int, error) {
	const msg = "para 1 yoki 2 bo'lishi kerak"
	var n int
	switch t := v.(type) {
	case float64:
		n = int(t)
	case int:
		n = t
	case int64:
		n = int(t)
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(t))
		if err != nil {
			return 0, invalid(msg)
		}
		n = parsed
	case bool:
		if t {
			n = 1
		}
	default:
		return 0, invalid(msg)
	}
	if n != 1 && n != 2 {
		return 0, invalid(msg)
	}
	return n, nil
}

var timeRe = regexp.MustCompile(`^([01]?\d|2[0-3]):[0-5]\d$`)

func cleanTime(v any) (string, error) {
	text := strings.TrimSpace(str(v))
	if !timeRe.MatchString(text) {
		return "", invalid("vaqt soat:daqiqa ko'rinishida bo'lsin, masalan 14:50")
	}
	hh, mm, _ := strings.Cut(text, ":")
	h, _ := strconv.Atoi(hh)
	return fmt.Sprintf("%02d:%s", h, mm), nil
}

func cleanDate(v any) (string, error) {
	s, ok := v.(string)
	if !ok {
		return "", invalid("sana noto'g'ri")
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return "", invalid("sana noto'g'ri")
	}
	return t.Format("2006-01-02"), nil
}

// parseGrade returns nil for "no grade" (null or empty string).
func parseGrade(v any) (*float64, error) {
	var f float64
	switch t := v.(type) {
	case nil:
		return nil, nil
	case string:
		if t == "" {
			return nil, nil
		}
		parsed, err := strconv.ParseFloat(strings.TrimSpace(strings.ReplaceAll(t, ",", ".")), 64)
		if err != nil {
			return nil, invalid("baho raqam bo'lishi kerak")
		}
		f = parsed
	case float64:
		f = t
	default:
		return nil, invalid("baho raqam bo'lishi kerak")
	}
	f = round(f, 2)
	if !(f >= -100 && f <= 100) { // also rejects NaN
		return nil, invalid("baho -100 va 100 orasida bo'lsin")
	}
	return &f, nil
}

// round rounds to the given number of decimals, ties to even on the exact binary value (like Python's round).
func round(x float64, digits int) float64 {
	r, err := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	if err != nil {
		return x
	}
	return r
}
