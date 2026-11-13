.PHONY: build linux test vuln e2e check hooks demo run clean

# the commit the binary was built from, "-dirty" when the tree had changes; `attendance version` prints it
VERSION := $(shell git describe --always --dirty 2>/dev/null || echo dev)

build:
	go build -ldflags="-X main.version=$(VERSION)" -o bin/attendance .

linux:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.version=$(VERSION)" -o bin/attendance-linux-amd64 .

test:
	go vet ./...
	go test -race ./...
	node --test webtest/*.test.js

# known vulnerabilities in the code that is called (pinned: v1.1.4 crashes on Go 1.27 code)
vuln:
	go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...

e2e: build
	node scripts/e2e.mjs bin/attendance

# everything CI checks; the pre-push hook runs it
check: test vuln e2e

# use the repository's hooks (.githooks/pre-push runs `make check` before every push)
hooks:
	git config core.hooksPath .githooks

demo: build
	./bin/attendance demo --no-login

run: build
	./bin/attendance run --data ./data

clean:
	rm -rf bin
