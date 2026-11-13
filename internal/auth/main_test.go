package auth

import (
	"os"
	"testing"
)

// The cost of new hashes is a production setting; tests only need it to be a working one.
func TestMain(m *testing.M) {
	Iterations = 2000
	os.Exit(m.Run())
}
