# 14 · Test and acceptance criteria

Every criterion is checkable by a command, a test or a stated observation. "e2e" means `make e2e`
(`scripts/e2e.mjs`, headless Chrome against `attendance demo --no-login --with-site`).

## 1. Automated tests to add

### Go

| ID | Package | Asserts |
|---|---|---|
| T-BAK-1 | store | `Backup` produces a file that `store.Open` reads with the same row counts in every table |
| T-BAK-2 | store | backup of a database with uncheckpointed WAL writes contains those writes |
| T-BAK-3 | store | the source file's bytes and mtime are unchanged; no `-wal` growth caused by the backup |
| T-BAK-4 | store | file mode is 0600; `keep=2` after three backups leaves the two newest |
| T-BAK-5 | store | backing up an **old-schema** database does not add columns to the source |
| T-BAK-6 | store | `Open` on a database missing `deleted_at` creates a backup before altering |
| T-BAK-7 | server | `GET /api/backup` returns `last` ≈ newest file's time, `null` when none |
| T-CLI-1 | main | flags before and after operands parse the same |
| T-CLI-2 | main | `dbPath` prefers `attendance.sqlite3`, falls back to `davomat.sqlite3` |
| T-CLI-3 | main | `import` without `--yes` exits non-zero and changes nothing |
| T-OXU-1 | oxu | each successful section sets `Fetched[name]` to the sync time |
| T-OXU-2 | oxu | a failed "davomat holati" step keeps the previous `Unsaved` **and** its previous `Fetched["unsaved"]` |
| T-OXU-3 | oxu | `Fetched` in the result is not the same map as `prev.Fetched` |
| T-OXU-4 | oxu | unsaved page without table and without the empty marker → warning, old list kept |
| T-OXU-5 | oxu | genuine empty page → empty list, `Fetched` advanced |
| T-AUTH-1 | server | `X-Real-IP` from a non-loopback `RemoteAddr` is ignored (lockout keys on the peer) |
| T-AUTH-2 | server | `X-Real-IP` from a loopback peer is honoured |
| T-AUTH-3 | server | `X-Forwarded-Proto: https` from a non-loopback peer does not set `Secure` |
| T-AUTH-4 | auth | 20 parallel wrong logins from one address: at most 5 reach the hash |
| T-AUTH-5 | auth | more than 2 concurrent hashes → `429` |
| T-AUTH-6 | auth | 1 000 distinct failing addresses, then time advance past the window → map is empty |
| T-AUTH-7 | auth | a 240 000-iteration `auth.json` logs in and is rewritten at 600 000 with the same secret |
| T-AUTH-8 | auth | `Renew` returns a fresh token only in the second half of the lifetime |
| T-AUTH-9 | server | an authenticated request late in the lifetime gets `Set-Cookie`; early does not |
| T-AUTH-10 | server | `POST /api/login` sets the cookie; wrong password → 401 JSON; needs the custom header |
| T-DEL-1 | store | deleted session is absent from `Sessions`, `Session`, `Student` history, `Retakes`, students' totals |
| T-DEL-2 | store | restore returns identical `SessionDetail` |
| T-DEL-3 | store | a new session can take a deleted session's slot; restoring the old one then fails with a validation error |
| T-DEL-4 | store | sessions deleted more than 30 days ago are purged at open |
| T-DEL-5 | store | source scan: every `from sessions` / `join sessions` has `deleted_at is null` or is allow-listed |
| T-ROSTER-1 | store | adding a student to a session creates one row; repeating is a no-op |
| T-ROSTER-2 | server | unknown session or student → 404 |
| T-ROSTER-3 | store | `Session().Missing` lists active students not on the roster, and only those |
| T-SEM-1 | store | `NewSemester` sets start/weeks, archives all active students, keeps sessions |
| T-SEM-2 | server | the route refuses when the backup fails; nothing changes |
| T-SEM-3 | store | invalid start or weeks → validation error, nothing changes |
| T-SEM-4 | server | after a new semester, starting a session has an empty roster until students are added |
| T-SYNC-1 | server | cancelling the request context mid-sync: the sync completes and the snapshot is saved |
| T-SYNC-2 | server | a second sync during a detached one returns `oxu_busy` |
| T-SYNC-3 | server | `Forget` during a run: final state is `none`, not `ok` |
| T-SYNC-4 | oxu | weeks fetched concurrently come back in week order; at most 3 in flight (count in the test server) |
| T-SYNC-5 | server | every sync error carries the documented `code` |
| T-VAL-1 | store | `cleanPara(1.9)`, `cleanPara(true)` → validation error; `1`, `2`, `"2"` accepted |
| T-VAL-2 | store | `SetAllPresent` on a missing id → `ErrNotFound`; on an empty roster → nil |
| T-SEC-1 | main | `demo --no-login --bind 0.0.0.0` → error |
| T-SEC-2 | store | database file mode is 0600 after `Open` |
| T-NOTE-1 | store | read notifications older than 90 days are pruned; unread ones are kept |
| T-HEALTH-1 | server | `/healthz` returns `db:true`; closing the DB → 503 |
| T-GZIP-1 | server | JSON ≥ 1 KB is gzipped when accepted, with `Vary`; small bodies are not |
| T-CONST-1 | oxu | `PARA_TIMES` end times in `web/lib/dates.js` equal `paraEnd` |

### JavaScript (`node --test webtest/*.test.js`)

| ID | Asserts |
|---|---|
| T-FMT-1 | `parseDay`: `5.11`, `05/11/2026`, `31.02.2026` (→ ""), `5-11-2026` |
| T-FMT-2 | `noteLessons`: newline form, legacy `; ` form with `va yana N ta`, non-lesson body |
| T-FMT-3 | `fmtRoom`, `fmtType`, `canonSubject("A(B)")`, `shortSubject` word cutting and trailing conjunctions |
| T-RULES-1 | `isSirtqi` for `S1-KT-22`, `S1-KT-22, S3-KT-22`, `K4-ATT-25`, mixed list |
| T-RULES-2 | `sameWork`: equal after normalising; containment only from 15 characters |
| T-TT-1 | `entriesFor`: course lessons on Mon–Thu only, not before the first session, plus any session on another day |
| T-TT-2 | cancelled lessons are excluded for both kinds |
| T-TT-3 | `courseGaps`: finished sessions excluded; unfinished and never-started included; para not yet over excluded |
| T-TT-4 | `nextEntry`: the running lesson first; skips finished ones; looks 14 days ahead |
| T-TT-5 | **no course entry after `semester.end` or before `semester.start`**; `courseGaps` is empty for dates after the end |
| T-STATUS-1 | para not over → `coming` |
| T-STATUS-2 | on the unsaved list → `missing`, even when the data is 10 days old |
| T-STATUS-3 | not on the list, read after the para ended → `taken` |
| T-STATUS-4 | not on the list, read before the para ended (same day) → `unknown` |
| T-STATUS-5 | lesson dated after the read → `unknown` |
| T-STATUS-6 | `fetched` absent → falls back to `synced_at` |
| T-STATUS-7 | `unsaved` section never read → `unknown` for every past lesson |
| T-LOAD-1 | golden: `computeLoad`+`loadPace` on `golden/load-input.json` equals `load-output.json` (captured before the move) |
| T-LOAD-2 | per line `done + noAtt + unknown === heldLessons * 2`; closed group plan = held |
| T-LOAD-3 | part-time window: first–last lesson, minimum 21 days, shared across a combined lecture line |
| T-LOAD-4 | independent study (`mustaqil`) excluded and reported separately |
| T-UST-1 | `ustamaFigure`: site month → approved sum; unopened month → sum of ticked maxima |
| T-UST-2 | `ustamaOpen`: excludes ticked, skipped (-1), graded, and "graded by others" items; days left at month end = 0 |
| T-UST-3 | `periodKey("2026 — Oktabr") === "2026-10"`; unknown label → "" |
| T-PLAN-1 | `suggestTopic`: first topic neither taught nor already planned for the class |
| T-PLAN-2 | `mergeCarryOver`: no duplicates (case-insensitive), order new-then-existing, reports `dropped` beyond 20 |
| T-PLAN-3 | `nextOfClass`: same subject **and** group, later date or later para the same day |

Coverage gate: `node --test --experimental-test-coverage` reports ≥ 85 % lines for `web/lib/` and `web/pace.js`.
Go: no package below its current figure (auth 81 %, oxu 91 %, server 70 %, store 76 %); `main` ≥ 30 %.

## 2. Browser checks (`make e2e`)

For every route × {light, dark} × {1280×720, 1440×900}:

| ID | Assertion |
|---|---|
| AC-E2E-1 | no console error, no failed request (including `/favicon`) |
| AC-E2E-2 | `documentElement.scrollWidth <= innerWidth` |
| AC-E2E-3 | exactly one visible `h1`; `document.title` starts with the page name |
| AC-E2E-4 | no visible text under 12 px; no solid-background text pair under 4.5:1 (3:1 for ≥ 24 px) |
| AC-E2E-5 | no visible form control without an accessible name |
| AC-E2E-6 | on `#/jadval` at 1024, 1280, 1366, 1440, 1920: every `.state-line` has `scrollWidth <= clientWidth` |

Scripted flows:

| ID | Flow | Pass when |
|---|---|---|
| E2E-1 | Home → "Davomatni boshlash" → mark two absent by typing a name + Enter → topic → finish | lesson list shows `16/18`; debts badge +2 |
| E2E-2 | Kabinet → start a (stubbed, 3 s) sync → navigate to `#/talabalar` | after the sync returns, the students page is still shown |
| E2E-3 | Roster → click one row's toggle 5 times within 300 ms | server state equals the UI state after settle |
| E2E-4 | Add a student → open today's started lesson → "Talaba qo'shish" → mark absent | student appears on the roster and in debts |
| E2E-5 | Delete the session cookie → wait for the next poll | URL unchanged; re-login dialog shown; after the password the pending call succeeds |
| E2E-6 | `#/ustama` → scroll to the last item → click a stage | `scrollY` changed by < 4 px; focus on the same button |

## 3. Acceptance criteria per finding

| ID | Criterion |
|---|---|
| AC-DB-01 | (a) `attendance backup --data D` on a running service writes `D/backups/attendance-*.sqlite3`, mode 0600, and prints its path; (b) `PRAGMA integrity_check` on it returns `ok`; (c) restoring it per README yields the same counts; (d) `--keep N` holds; (e) README no longer advises copying the live file |
| AC-BUG-01 | with a snapshot whose `fetched.unsaved` is T: no lesson that ended after T has class `ok` or text `Olingan` anywhere; lessons on the unsaved list are red at any age; load totals add up (T-LOAD-2); the age line shows on six pages with the right wording at 3 h and 3 days; a partial sync shows `Qisman yangilangan` |
| AC-BUG-06 | an idle tab at expiry does not navigate; typing in an open sheet survives re-login; a cookie issued by the previous binary is accepted |
| AC-BUG-12 | with the semester ended yesterday: home shows no new "davomat olinmagan" item for today; timetable shows no generated course card after the end date; an existing session after the end still shows |
| AC-FEAT-01 | after "Yangi semestr": a backup exists; all students are `Arxiv`; Darslar lists only the new semester with a fold "Oldingi semestrlar (N)"; the debt badge counts only new-semester debts; old lessons and student histories open as before |
| AC-OPS-01 | `deploy/` holds the four example files; README has a 6-line checklist; the nginx example sets `X-Real-IP`, `X-Forwarded-Proto`, `proxy_read_timeout 90s`, `limit_req` for `/login`, HSTS |
| AC-ARCH-01 | `web/app.js` contains no definition of the functions listed in spec §3.6; `web/lib/*.js` reference neither `document` nor `window` (grep); golden test passes; e2e unchanged |
| AC-BUG-02 | E2E-2 passes; grep finds no direct call of a `…View(` function from an event handler |
| AC-UX-08 | E2E-6 passes; open `<details>` on `#/yuklama` and `#/reja` stay open after an in-page save |
| AC-SEC-01 | T-AUTH-1…6 pass; curl with rotating `X-Real-IP` directly against a non-loopback bind gets `429` on the 6th attempt |
| AC-SEC-02 | M-EXT-1…5 pass |
| AC-REL-02 | T-SYNC-1, T-SYNC-4 pass; a sync of 25 stubbed week pages at 2 s each finishes under 25 s |
| AC-UX-01 | AC-E2E-6 passes; subject names use at most two lines; reviewed screenshots at five widths, two themes |
| AC-UX-03 | attention card height < 240 px with two items; in demo (sync state `none`) the urgent badge is not red because of sync |
| AC-UX-04 | 18 students fit at 1440×900 without scrolling; ≥ 12 rows visible at 1280×720; header reads subject · group; grade inputs remain reachable by Tab |
| AC-UX-05 | load page height at 1440 px with the `--with-site` snapshot is at least 150 px shorter than before; all definitions exist inside the disclosure |
| AC-UX-06 | "Kurs rejasi" has one row per subject; no `_yopildi` text anywhere on the page |
| AC-UX-07 | invalid time in the retake sheet: message inside the sheet, field focused and `aria-invalid`, no toast |
| AC-UX-09 | delete + undo within 10 s restores an identical session (JSON equality) |
| AC-UX-10…17 | per the table in `09_…` §4.10 |

## 4. Manual scripts

**M-EXT (extension, in a throw-away Chrome profile, never the owner's)**

1. Load unpacked; open `http://127.0.0.1:8766` (app) and log in → badge idle; origin stored.
2. Open a page on `http://localhost:5173` that posts `{source:"attendance-app",type:"ready"}` → stored origin
   unchanged; no cookie message reaches that page after a site login.
3. Log in on digital.oxu.uz → the app tab syncs; badge `✓`.
4. With no app tab open → the remembered app opens in the background, syncs, closes.
5. Add `http://127.0.0.1:8791` on the options page → `make demo` on that port receives the cookie.

**M-RESTORE (once per release)**: stop a copy of the service, replace its database with the newest backup,
start, compare counts on Darslar, Talabalar, Qarzlar with the original.

**M-CLASS (on the classroom laptop, real width)**: take attendance for a full lesson with the real group;
note any scroll during roll call, any clipped text on the timetable.

## 5. Non-functional gates

- `make test` (vet, `go test -race`, `node --test`) green; `govulncheck ./...` reports no known vulnerability
  in called code.
- Binary size within 10 % of today's Linux build (15.5 MB).
- Home page at 1440×900: ≤ 16 requests, all JSON over 1 KB gzipped.
- No new runtime dependency; `go.mod` direct requirements unchanged.
- CSP header identical to today's string.

## 6. Release checklist (definition of done)

1. All tasks T01–T31 merged; traceability table in `12_…` fully ticked.
2. §1, §2, §5 pass on the release commit.
3. §4 manual scripts performed and noted in the release commit message.
4. Screenshots of all routes, both themes, 1280 and 1440, reviewed by a person; none shows clipping, overlap
   or an unintended empty state.
5. Upgrade rehearsal on a **copy** of the production data directory: old binary's cookie still logs in;
   `deleted_at` added after an automatic backup; rollback to the old binary works.
6. `README.md` and `DESIGN.md` describe the shipped behaviour; `.impeccable/design.json` is current or removed.
7. `git diff a1d748f --stat` touches nothing under `data/`, and the six removed routes are the only removed API.
