// attendance is an attendance tracker for a university teacher. One binary: the server, the web page
// (embedded) and the SQLite database driver.
package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"attendance/internal/auth"
	"attendance/internal/server"
	"attendance/internal/store"
)

//go:embed web
var webFiles embed.FS

const usage = `usage: attendance [command] [flags]

commands:
  run           start the server (default)
  set-password  set the login password (ATTENDANCE_PASSWORD env, or --generate)
  demo          start with throw-away invented data, password "demo"
  import FILE   replace lessons/attendance/retakes with a JSON spec (stop the service first)

flags (all commands):
  --data DIR    data directory (env ATTENDANCE_DATA, default /var/lib/attendance)
  --bind ADDR   listen address (env ATTENDANCE_BIND, default 127.0.0.1)
  --port N      listen port (env ATTENDANCE_PORT, default 8766)
env: ATTENDANCE_SECURE_COOKIE=1 when served over HTTPS`

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	args := os.Args[1:]
	command := "run"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command, args = args[0], args[1:]
	}
	if command == "help" {
		fmt.Println(usage)
		return
	}
	flags := flag.NewFlagSet("attendance", flag.ExitOnError)
	flags.Usage = func() { fmt.Fprintln(os.Stderr, usage) }
	dataDir := flags.String("data", envOr("ATTENDANCE_DATA", "/var/lib/attendance"), "data directory")
	bind := flags.String("bind", envOr("ATTENDANCE_BIND", "127.0.0.1"), "listen address")
	port := flags.Int("port", func() int { n, _ := strconv.Atoi(envOr("ATTENDANCE_PORT", "8766")); return n }(), "listen port")
	generate := flags.Bool("generate", false, "set-password: generate a random password")
	noLogin := flags.Bool("no-login", false, "demo only: skip the password (for screenshots)")
	var operands []string // flags may come before or after them, e.g. `import FILE --data DIR`
	for {
		flags.Parse(args)
		if flags.NArg() == 0 {
			break
		}
		operands, args = append(operands, flags.Arg(0)), flags.Args()[1:]
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if err := run(command, operands, *dataDir, *bind, *port, *generate, *noLogin); err != nil {
		fmt.Fprintln(os.Stderr, "attendance:", err)
		os.Exit(1)
	}
}

func run(command string, rest []string, dataDir, bind string, port int, generate, noLogin bool) error {
	switch command {
	case "set-password":
		return setPassword(dataDir, generate)
	case "import":
		if len(rest) != 1 {
			return errors.New("usage: attendance import FILE")
		}
		return importSpec(dataDir, rest[0])
	case "run", "demo":
		return serve(command == "demo", dataDir, bind, port, noLogin)
	}
	return fmt.Errorf("unknown command %q\n\n%s", command, usage)
}

func setPassword(dataDir string, generate bool) error {
	password := os.Getenv("ATTENDANCE_PASSWORD")
	if generate {
		raw := make([]byte, 10)
		if _, err := rand.Read(raw); err != nil {
			return err
		}
		password = base64.RawURLEncoding.EncodeToString(raw)
	}
	if len(password) < 6 {
		return errors.New("set ATTENDANCE_PASSWORD (6+ characters) or use --generate")
	}
	if err := auth.Create(filepath.Join(dataDir, "auth.json"), password); err != nil {
		return err
	}
	if generate {
		fmt.Println("password:", password)
	} else {
		fmt.Println("password saved")
	}
	return nil
}

// dbPath is the database file in the data directory. Databases made before the project was renamed
// are called davomat.sqlite3; such a file is kept and used as is.
func dbPath(dir string) string {
	current := filepath.Join(dir, "attendance.sqlite3")
	legacy := filepath.Join(dir, "davomat.sqlite3")
	if _, err := os.Stat(current); err != nil {
		if _, err := os.Stat(legacy); err == nil {
			return legacy
		}
	}
	return current
}

func importSpec(dataDir, file string) error {
	raw, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var spec store.ImportSpec
	if err := json.Unmarshal(raw, &spec); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	db, err := store.Open(dbPath(dataDir))
	if err != nil {
		return err
	}
	defer db.Close()
	res, err := db.Import(&spec)
	if err != nil {
		return err
	}
	out, _ := json.Marshal(res)
	fmt.Println(string(out))
	return nil
}

func serve(demo bool, dataDir, bind string, port int, noLogin bool) error {
	if demo {
		tmp, err := os.MkdirTemp("", "attendance-demo-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(tmp)
		dataDir = tmp
		if err := auth.Create(filepath.Join(dataDir, "auth.json"), "demo"); err != nil {
			return err
		}
	} else if _, err := os.Stat(filepath.Join(dataDir, "auth.json")); err != nil {
		return errors.New("no password yet: run `attendance set-password --generate` first")
	}
	db, err := store.Open(dbPath(dataDir))
	if err != nil {
		return err
	}
	defer db.Close()
	if demo {
		if err := db.Seed(); err != nil {
			return err
		}
	}
	a, err := auth.Load(filepath.Join(dataDir, "auth.json"))
	if err != nil {
		return err
	}
	a.NoLogin = demo && noLogin

	web, err := fs.Sub(webFiles, "web")
	if err != nil {
		return err
	}
	handler, err := server.New(server.Config{Store: db, Auth: a, Web: web, SecureCookie: os.Getenv("ATTENDANCE_SECURE_COOKIE") == "1", CookieFile: filepath.Join(dataDir, "oxu_cookie")})
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              net.JoinHostPort(bind, strconv.Itoa(port)),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      75 * time.Second, // a sync reads the whole semester
		IdleTimeout:       120 * time.Second,
	}
	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		return err
	}
	if demo {
		fmt.Printf("demo: http://%s/   password: demo\n", srv.Addr)
	}
	slog.Info("attendance listening", "addr", srv.Addr)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go handler.Syncer().Run(ctx)
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}
