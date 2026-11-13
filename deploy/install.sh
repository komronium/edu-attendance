#!/usr/bin/env bash
# Runs ON the server, as root, from the staging directory scripts/deploy.sh fills. It:
#   1. backs up the live database with the new binary (read-only on the live file; safe while running)
#   2. installs the new binary (the old one stays as attendance.prev) and the hardened systemd unit
#   3. restarts the service and checks /healthz; on failure it puts the old binary and unit back
#   4. installs and enables the daily backup timer, and runs one backup through it as a test
#   5. prints the live nginx site, for the nginx changes (they are not made here)
set -euo pipefail

stage=${STAGE:-/tmp/attendance-deploy}
bin=/opt/attendance/attendance
units=/etc/systemd/system
data=/var/lib/davomat # StateDirectory=davomat with DynamicUser: really /var/lib/private/davomat
health=http://127.0.0.1:8766/healthz
keep=/root/attendance-rollback/$(date +%Y%m%d-%H%M%S)

say() { printf '\n== %s\n' "$*"; }
healthy() {
	for _ in $(seq 1 15); do
		if systemctl is-active -q attendance && curl -fsS -m 3 "$health" >/dev/null 2>&1; then return 0; fi
		sleep 1
	done
	return 1
}

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
for f in attendance-linux-amd64 attendance.service.example attendance-backup.service.example attendance-backup.timer.example; do
	[ -f "$stage/$f" ] || { echo "missing $stage/$f" >&2; exit 1; }
done
chmod 755 "$stage" "$stage/attendance-linux-amd64"

say "new binary: $("$stage/attendance-linux-amd64" version)"
say "live binary: $("$bin" version 2>/dev/null || echo 'older than the version command')"

say "1. backup of the live database (as the service user)"
systemd-run --wait --pipe --quiet -p DynamicUser=yes -p User=davomat -p StateDirectory=davomat \
	-p UMask=0077 -E ATTENDANCE_DATA=$data "$stage/attendance-linux-amd64" backup --keep 0

say "2. rollback copies in $keep"
mkdir -p "$keep"
cp -a "$bin" "$keep/attendance"
cp -a "$units/attendance.service" "$keep/attendance.service"

rollback() {
	say "!! the new version did not come up healthy; putting the old one back"
	journalctl -u attendance -n 30 --no-pager || true
	cp -a "$keep/attendance" "$bin"
	cp -a "$keep/attendance.service" "$units/attendance.service"
	systemctl daemon-reload
	systemctl restart attendance
	if healthy; then echo "old version is running again"; else echo "!! the old version is not healthy either: check now" >&2; fi
	exit 1
}

say "unit changes (live -> new)"
diff -u "$units/attendance.service" "$stage/attendance.service.example" || true

cp -a "$bin" "$bin.prev"
install -m 755 "$stage/attendance-linux-amd64" "$bin.new"
mv -f "$bin.new" "$bin"
install -m 644 "$stage/attendance.service.example" "$units/attendance.service"
systemctl daemon-reload

say "3. restart and health check"
systemctl restart attendance || rollback
healthy || rollback
curl -fsS "$health"; echo
journalctl -u attendance -n 3 --no-pager -o cat

say "4. daily backup timer"
install -m 644 "$stage/attendance-backup.service.example" "$units/attendance-backup.service"
install -m 644 "$stage/attendance-backup.timer.example" "$units/attendance-backup.timer"
systemctl daemon-reload
if systemctl start attendance-backup.service; then
	systemctl enable --now attendance-backup.timer
	systemctl list-timers attendance-backup.timer --no-pager
	ls -l /var/lib/private/davomat/backups | tail -4
else
	journalctl -u attendance-backup -n 20 --no-pager || true
	echo "!! the backup unit failed; the timer was NOT enabled (the app itself is updated and running)" >&2
fi

say "data directory"
ls -l /var/lib/private/davomat

say "5. live nginx site (for the next step; nothing was changed)"
for f in $(grep -rlE 'davomat|8766' /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/*.conf 2>/dev/null); do
	echo "---- $f"
	cat "$f"
done
nginx -T 2>/dev/null | grep -nE 'limit_req_zone|include .*(conf\.d|sites-enabled)' | head

say "done"
