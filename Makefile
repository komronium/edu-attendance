.PHONY: build linux test e2e demo run clean

build:
	go build -o bin/attendance .

linux:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/attendance-linux-amd64 .

test:
	go vet ./...
	go test -race ./...
	node --test webtest/*.test.js

e2e: build
	node scripts/e2e.mjs bin/attendance

demo: build
	./bin/attendance demo --no-login

run: build
	./bin/attendance run --data ./data

clean:
	rm -rf bin
