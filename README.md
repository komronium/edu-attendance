# edu-attendance

Attendance tracker for a university teacher: students, lessons (2 "paras" a day), who attended,
missed-lesson debts with retake dates, and grades.

Go + SQLite, one static binary. The web page (vanilla JS, no build step, Public Sans self-hosted in
`web/fonts/`) is embedded in it. The interface text is Uzbek and the layout is designed for desktop.

The first page is a dashboard of today. `Ctrl+K` (or `/`) opens search over pages and students, the
left and right arrows change the timetable week, and up and down move through a lesson's roster.
Light, dark or automatic theme is chosen in the sidebar.

## Run locally

    make demo                                   # throw-away demo data, no login: http://127.0.0.1:8766/
    ./bin/attendance demo --no-login --with-site   # also an invented timetable, load, KPI and bonus
    ./bin/attendance demo --no-login --with-site --stale-days 3   # ... as if the last sync were 3 days old

    # or with your own data:
    ./bin/attendance set-password --generate --data ./data
    ./bin/attendance run --data ./data

Commands: `run` (default), `set-password`, `demo`, `import FILE --yes`, `backup`. Run `attendance help` for the flags.

Environment (each has a matching flag): `ATTENDANCE_DATA` (default `/var/lib/attendance`),
`ATTENDANCE_BIND` (default `127.0.0.1`), `ATTENDANCE_PORT` (default `8766`),
`ATTENDANCE_PASSWORD` (for `set-password`), `ATTENDANCE_SECURE_COOKIE=1` (when served over HTTPS).

## Login to digital.oxu.uz (Chrome extension)

Install the extension once: `chrome://extensions` → turn on Developer mode → Load unpacked → choose
the `extension/` folder (after an update, press the reload arrow on its card).

Then just open digital.oxu.uz in any tab and log in by hand (login, password and the robot check
stay manual). Once the site answers as logged in, the extension reads the session cookie (including
the HttpOnly one a page script cannot see) and hands it to an attendance tab, which sends it through
the usual sync request, so the owner-ID check still applies. If no attendance tab is open, the one
used last (default: the live site) is opened in the background and closed after the sync; if it asks
for the app password first, the cookie waits until you have logged in there. The toolbar icon shows
`…` while syncing, `✓` when done and `!` when something needs you. The same session is not sent
twice within six hours. The Kabinet button "digital.oxu.uz ga kirish" still works and syncs at once.
Without the extension the cookie can still be pasted by hand.

The session cookie is handed only to an attendance page whose exact address (port included) is allowed:
`https://davomat.lidersement.uz`, `http://127.0.0.1:8766` and `http://localhost:8766`. Any other page on
localhost, whatever its port, is ignored, so an unrelated local site cannot pose as the app. To use another
address (for example `make demo` on another port), add it on the extension's options page (the extension's
card in `chrome://extensions` → Details → Extension options). `127.0.0.1` and `localhost` work on any port
once listed; another host also needs its origin in `host_permissions` and `content_scripts[0].matches` in
`extension/manifest.json`, and a reload of the extension.

### Checking the extension by hand

The extension cannot be tested from the command line. After changing it, in a throw-away Chrome profile
(not your own), with the app on `http://127.0.0.1:8766`:

1. Load the unpacked `extension/` folder, open the app and log in. Nothing happens yet.
2. Open any other page on localhost, on another port, that runs `window.postMessage({source:"attendance-app",type:"ready"}, location.origin)`
   in its console. Log in on digital.oxu.uz: the app tab syncs, and that other page receives nothing
   (the extension's service worker trace, under `chrome.storage.local.trace`, shows `refused`).
3. With no app tab open, log in on digital.oxu.uz again after six hours or from another profile state: the
   hosted app opens in the background, syncs and closes. The toolbar icon shows `…`, then `✓`.
4. Add `http://127.0.0.1:8791` on the options page, run `./bin/attendance demo --port 8791`, open it, and log in
   to digital.oxu.uz: that demo receives the cookie.
5. Remove that address again: the demo no longer does.

## Lesson plans

"Dars rejasi" (`#/reja`) holds the teacher's own preparation for every lesson, the site's too: a
topic, a few points and "Reja bor" / "Tayyor". A plan is keyed by date and timetable para
(`lesson_plans`), so it exists before any attendance. Starting attendance takes the plan's topic.
After the lesson its outcome is marked ("O'tildi", "Qisman", "Keyingi darsga qoldi"); unticked points
move to the next lesson of the same subject and group. Each subject can have a semester topic list
(`course_topics`); the page shows how many are taught and, as an estimate, how many teaching days behind.

## Build and test

    make test       # go vet, go test -race, node --test (pure logic in web/lib and web/pace.js)
    make e2e        # headless Chrome against the demo: every page, both themes, several widths, key flows
    make build      # ./bin/attendance
    make linux      # ./bin/attendance-linux-amd64, for the VPS (no cgo, no runtime needed)

## Deploy

Copy the binary to the server and run it under systemd with `ATTENDANCE_DATA` pointing at the data
directory. This replaces the old Python version, whose data directory keeps working as is:
`auth.json` and the database are read unchanged, and logged-in browsers stay logged in. A database
file named `davomat.sqlite3` is still used if there is no `attendance.sqlite3` next to it.
Stop the old service before starting the new one: both must not write the same database.

Live at https://davomat.lidersement.uz: `attendance.service` runs `/opt/attendance/attendance` on
127.0.0.1:8766 behind nginx, with its data in `/var/lib/davomat`. To update, run `make linux`, copy the
binary over, run `attendance backup` with it, and restart the service. Never copy a laptop database over it.

`deploy/` holds example nginx and systemd files. Check the live ones against them:

1. nginx overwrites `X-Real-IP` with `$remote_addr` (the login lockout counts per that address). Live: yes.
2. nginx sets `X-Forwarded-Proto $scheme`, or the unit sets `ATTENDANCE_SECURE_COOKIE=1` (or both). Live: both.
3. nginx `proxy_read_timeout` is at least 90s (a manual sync is allowed 70 s; real ones took 14-19 s on 2026-11-12). Live: not set (60 s default).
4. nginx limits `/login` (`limit_req`) and sends HSTS. Live: neither.
5. the unit sets `UMask=0077`; the data directory is owned by the service user only. Live: no UMask; the files are 0644, but the directory above is root-only (0700), so nobody else can reach them.
6. the backup timer is enabled, and the copies are also kept somewhere other than the server. Live: there is no backup of this database at all.

## Backup and restore

    attendance backup --data /var/lib/davomat            # -> /var/lib/davomat/backups/attendance-*.sqlite3
    attendance backup --data /var/lib/davomat --to DIR --keep 10

A backup is a consistent copy taken through SQLite (`VACUUM INTO`), safe while the service runs, together
with `auth.json`; files are 0600 and the newest 30 are kept by default. Do not copy `attendance.sqlite3` by
hand while the service runs: the latest changes may still be in the `-wal` file next to it. Copies are also
made automatically before `import` and before a new version adds a column to the database.
`deploy/attendance-backup.timer.example` runs it daily.

To restore: stop the service, move `attendance.sqlite3`, `attendance.sqlite3-wal` and
`attendance.sqlite3-shm` aside, copy the chosen backup to `attendance.sqlite3` (owner only, `chmod 600`),
start the service.

Production data (the sqlite db and `auth.json`) is intentionally NOT in this repo.

## Timetable

The Dars jadvali page shows a week: lessons from the last sync, plus Algoritmlash for 2-ATT-25
(`COURSE` in `web/lib/rules.js`: Monday-Thursday, paras 3 and 4, room K4 / 309), whose attendance is taken in
this app. Those classes are generated, not stored: a lesson row is created only when attendance is
started from its card. Other lessons open their attendance page on digital.oxu.uz in a new tab;
each subject has its own colour: full when attendance is taken, lighter when it is not or the
lesson is still ahead. A past site lesson counts as taken when it is not on the site's unsaved list.
The lessons table keeps them as para 1 and 2 of the day, shown as 3 and 4 everywhere.

### What the app knows about a site lesson

Whether attendance was saved on the site is learned only by reading the site's "unsaved" list, so a lesson
that ended after the last read is neither "Olingan" nor "Olinmagan": it shows **Noma'lum**, is counted as
held but not as taken, and a red line on the page says how old the data is. A lesson on the unsaved list
stays "Olinmagan" however old the data is. Each part of the synced data (timetable, unsaved list, load, KPI,
bonus) records when it was last read successfully, so a sync that failed in part does not make the old
part look fresh; an unsaved-lessons page that no longer looks like the expected table keeps the old list
and warns.

## New semester

Kabinet → Semestr → "Yangi semestr": a database copy is made first, the new start and length are saved,
every student is archived (not deleted), and the earlier lessons and debts stay under "Oldingi semestrlar".
The course's lessons are generated only inside the semester's dates, so none appear after it ends. The
group, subject and days are still the `COURSE` constant in `web/lib/rules.js`.

## Sessions

A login lasts 12 hours from the last request: an open page renews it. If it ends anyway, the page asks for
the password in place and carries on, nothing typed is lost. Behind nginx on the same host, `X-Real-IP` and
`X-Forwarded-Proto` are believed only when the connection comes from the proxy; a login lockout is counted
per address before the password is checked, and only two passwords are checked at once.

## Deleted lessons

Deleting a lesson hides it with its attendance, grades and retakes; "Qaytarish" in the toast brings it back
whole, and it is purged 30 days later. A student added after a lesson started is offered under its roster.

## Cancelled lessons

A lesson that did not happen can be marked on its timetable card (`cancelled_lessons`). It leaves the
timetable and is not counted in the teaching load, and can be restored below the timetable.

## Teaching load

The Yuklama page shows planned, taught and remaining hours per subject and group. Planned hours come
from the site's load. The site has no taught-hours figure, so they are counted from the semester's
schedule at 2 hours per para, which matches the site's plans exactly for finished subjects. Hours held
but listed as unsaved on the site are shown separately. A closed group's plan is taken as the hours it
actually got, with the site's figure in a tooltip. Mustaqil ta'lim is not scheduled and is not
counted. 2-ATT-25 is not in the site's load: its taught hours are finished lessons in this app, and
its planned hours default to an estimate of 200 (`COURSE.planHours`) and can be changed on the page.
The Jadvalda column counts lessons that are in the timetable but not held yet (the lighter cards); it is a
lesson count, not hours. Attendance counts as missing only once the lesson's para has ended, on the page
and in notifications.

## Scientific KPI

The Ilmiy KPI page tracks works before they reach the site: add a work with its KPI item and step it
through its stages (`kpi_works`). The last stage means ready to upload. When a work with the same
title appears on the site after a sync, it is linked and shows the site's status.

## Monthly bonus

The Ustama page tracks the monthly bonus item by item. Ticks are your own record (`kpi_marks`,
per month). Scores and grading come from `Mening reytingim` on the site at the next sync: an item with
a grading history is Tasdiqlandi. A month the site has not opened yet can still be tracked, on the
latest list of items. Three items are graded by others at the end of the month and have no tick.
Items can also have your own stages ("Yozildi > Topshirildi > Tizimga yuklandi"),
editable on the page: the last stage ticks the item. Money shown on that page is never read.

## Notifications

Each sync is compared with the previous one: new or removed upcoming lessons and newly unsaved
attendance become notices (`internal/oxu/changes.go`). They appear on the Bildirishnomalar page, and as
Chrome notifications once allowed there. Chrome ones need the app open in a tab; with the tab closed
they would need a push service.

## digital.oxu.uz sync

The Kabinet page is the sync box and an overview of the sections fed from digital.oxu.uz: Dars
jadvali, Yuklama, Ilmiy KPI and Oylik KPI. The site has no API, so `internal/oxu` parses its HTML with GET requests only. You log
in to the site yourself and paste your session cookie into the page: login has a robot check and is
not automated. A cookie that works is kept in `oxu_cookie` in the data directory (mode 0600, never
logged, never sent to the page) and the site is read every 30 minutes, every 5 hours from 22:00 to
08:00 (constants in `internal/server/syncer.go`). When the session dies, syncing stops and the page
asks for a new cookie. A browser keeps the same session cookie when another person logs in, so every
sync reads the account id (`Maxsus kod`) first and again at the end, and refuses anything but the
owner set on the Kabinet page; if the id cannot be read nothing is saved, and synced data is tagged
with its account and hidden if it does not match. Treat that file like a password while the session is valid. Salary columns
are never read. The result is kept as one JSON snapshot in the `oxu_snapshot` table.

## Layout

- `main.go` - command line, embeds `web/`
- `internal/store` - SQLite storage, validation, backups, `import` and the demo seed
- `internal/auth` - password hash and signed session cookie
- `internal/server` - login, JSON API, static files
- `internal/oxu` - read-only scraper for digital.oxu.uz
- `internal/demo` - the invented site data for `demo --with-site`
- `web/` - single-page UI: `index.html`, `app.js` (views), `app.css`; `web/lib/` and `web/pace.js` hold the
  pure logic (the course, timetable, load, bonus, plans) as scripts that `node --test` also loads
- `extension/` - the Chrome extension
- `deploy/` - example nginx, systemd and backup-timer files
- `scripts/e2e.mjs` - the browser smoke test (`make e2e`)
