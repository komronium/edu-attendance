#!/usr/bin/env bash
# Build and deploy to the server: scripts/deploy.sh [ssh-host]   (default host: vps, from ~/.ssh/config)
# What happens on the server, and how it rolls back, is in deploy/install.sh.
# The restart takes the site away for a few seconds: not during a lesson.
set -euo pipefail
cd "$(dirname "$0")/.."
host=${1:-vps}
stage=/tmp/attendance-deploy

if [ -n "$(git status --porcelain)" ]; then
	echo "the working tree has changes: commit them first, so the version names what is deployed" >&2
	exit 1
fi
make linux
ssh "$host" "rm -rf $stage && mkdir -p $stage"
scp -q bin/attendance-linux-amd64 deploy/attendance.service.example deploy/attendance-backup.service.example \
	deploy/attendance-backup.timer.example "$host:$stage/"
ssh "$host" "STAGE=$stage bash -s" <deploy/install.sh
