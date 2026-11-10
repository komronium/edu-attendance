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

    # or with your own data:
    ./bin/attendance set-password --generate --data ./data
    ./bin/attendance run --data ./data

Commands: `run` (default), `set-password`, `demo`, `import FILE`. Run `attendance help` for the flags.

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

It works on `http://localhost`, `http://127.0.0.1` (any port) and the live site. For another address,
add that origin to `host_permissions` and `content_scripts[0].matches` in `extension/manifest.json`
and reload the extension. Only pages on those origins receive the cookie.

## Lesson plans

"Dars rejasi" (`#/reja`) holds the teacher's own preparation for every lesson, the site's too: a
topic, a few points and "Reja bor" / "Tayyor". A plan is keyed by date and timetable para
(`lesson_plans`), so it exists before any attendance. Starting attendance takes the plan's topic.
After the lesson its outcome is marked ("O'tildi", "Qisman", "Keyingi darsga qoldi"); unticked points
move to the next lesson of the same subject and group. Each subject can have a semester topic list
(`course_topics`); the page shows how many are taught and, as an estimate, how many teaching days behind.

## Build and test

    make test
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
binary over and restart the service. Back up the database first; never copy a laptop database over it.

Production data (the sqlite db and `auth.json`) is intentionally NOT in this repo.

## Timetable

The Dars jadvali page shows a week: lessons from the last sync, plus Algoritmlash for 2-ATT-25
(`COURSE` in `web/app.js`: Monday-Thursday, paras 3 and 4, room K4 / 309), whose attendance is taken in
this app. Those classes are generated, not stored: a lesson row is created only when attendance is
started from its card. Other lessons open their attendance page on digital.oxu.uz in a new tab;
each subject has its own colour: full when attendance is taken, lighter when it is not or the
lesson is still ahead. A past site lesson counts as taken when it is not on the site's unsaved list.
The lessons table keeps them as para 1 and 2 of the day, shown as 3 and 4 everywhere.

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
- `internal/store` - SQLite storage, validation, `import` and the demo seed
- `internal/auth` - password hash and signed session cookie
- `internal/server` - login, JSON API, static files
- `internal/oxu` - read-only scraper for digital.oxu.uz
- `web/` - single-page UI (`index.html`, `app.js`, `app.css`)
