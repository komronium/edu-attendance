package server

import (
	"os"
	"testing"

	"attendance/internal/auth"
)

// Tests check behaviour, not the cost of PBKDF2: with the production 600 000 rounds every login
// takes about 0.2 s (several seconds under -race).
func TestMain(m *testing.M) {
	auth.Iterations = 2000
	os.Exit(m.Run())
}
