package auth

import (
	"os"
	"path/filepath"
	"testing"
)

// Vector produced by the original Python implementation (since removed). It guards compatibility with
// the auth.json files and session cookies that implementation wrote.
const (
	pySalt  = "00112233445566778899aabbccddeeff"
	pyHash  = "c165e6acf7e19582e592813f4f67d6814f5dd67104640a2a08eac71cda722ae6"
	pySec   = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	pyToken = "4102444800.1eea20bbec0c0082e47225ed34e7f91cd78cf43d6a60c9ea087928c7f287126b"
)

func pythonAuth(t *testing.T) *Auth {
	t.Helper()
	path := filepath.Join(t.TempDir(), "auth.json")
	json := `{"salt":"` + pySalt + `","hash":"` + pyHash + `","iterations":240000,"secret":"` + pySec + `"}`
	if err := os.WriteFile(path, []byte(json), 0o600); err != nil {
		t.Fatal(err)
	}
	a, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestReadsPythonPasswordHash(t *testing.T) {
	a := pythonAuth(t)
	if !a.CheckPassword("parol-123") {
		t.Fatal("password hashed by the Python version was rejected")
	}
	if a.CheckPassword("parol-124") || a.CheckPassword("") {
		t.Fatal("wrong password accepted")
	}
}

func TestAcceptsPythonSessionToken(t *testing.T) {
	a := pythonAuth(t)
	if !a.ValidSession(pyToken) {
		t.Fatal("cookie signed by the Python version was rejected")
	}
	if got := a.sign("4102444800"); got != pyToken[len("4102444800."):] {
		t.Fatalf("signature differs from Python: %s", got)
	}
}

func TestRejectsBadTokens(t *testing.T) {
	a := pythonAuth(t)
	for _, tok := range []string{"", "x", ".", "4102444800", "4102444800.", "4102444801." + pyToken[len("4102444800."):],
		"-1.abc", "abc.def", "1.00", a.NewSession() + "0"} {
		if a.ValidSession(tok) {
			t.Errorf("accepted %q", tok)
		}
	}
	// signed but expired
	if exp := "1000"; a.ValidSession(exp + "." + a.sign(exp)) {
		t.Error("accepted an expired token")
	}
	if !a.ValidSession(a.NewSession()) {
		t.Error("rejected a fresh token")
	}
}

func TestCreateAndLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "auth.json")
	if err := Create(path, "yangi-parol"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("auth.json must be 0600: %v %v", info, err)
	}
	a, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !a.CheckPassword("yangi-parol") || a.CheckPassword("boshqa") {
		t.Fatal("round trip failed")
	}
}

func TestLockout(t *testing.T) {
	a := pythonAuth(t)
	for i := 0; i < maxFailures-1; i++ {
		a.Fail("1.2.3.4")
	}
	if a.Locked("1.2.3.4") {
		t.Fatal("locked too early")
	}
	a.Fail("1.2.3.4")
	if !a.Locked("1.2.3.4") {
		t.Fatal("not locked after 5 failures")
	}
	if a.Locked("5.6.7.8") {
		t.Fatal("other address locked")
	}
	a.Succeed("1.2.3.4")
	if a.Locked("1.2.3.4") {
		t.Fatal("still locked after success")
	}
}
