#!/usr/bin/env bash
# Copy the server's database backups to this machine (the off-server copy):
#   scripts/pull-backups.sh [ssh-host] [target-dir]   (defaults: vps, ~/attendance-backups)
# Only new files are copied, nothing is deleted on either side. The copies hold names and grades
# (and the password hash): the target directory is made owner-only.
set -euo pipefail
host=${1:-vps}
dir=${2:-$HOME/attendance-backups}
mkdir -p "$dir"
chmod 700 "$dir"
rsync -a --ignore-existing --chmod=F600 "$host:/var/lib/private/davomat/backups/" "$dir/"
newest=$(ls -1 "$dir"/attendance-*.sqlite3 2>/dev/null | tail -1)
echo "${newest:-no backup yet} ($(ls -1 "$dir"/attendance-*.sqlite3 2>/dev/null | wc -l) copies in $dir)"
