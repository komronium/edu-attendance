.PHONY: build linux test demo run clean

build:
	go build -o bin/attendance .

linux:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/attendance-linux-amd64 .

test:
	go vet ./...
	go test ./...

demo: build
	./bin/attendance demo --no-login

run: build
	./bin/attendance run --data ./data

clean:
	rm -rf bin
