# 10 · Improvement roadmap

The single authoritative list. Priorities and remedies here are **after** the independent review
(`13_FABLE_REVIEW.md`); where an earlier document's text differs, this one wins.

- **P0** critical: do first, before anything else ships.
- **P1** high: in the next version, non-negotiable.
- **P2** medium: in the next version.
- **P3** low: in the next version only where marked "in"; otherwise deferred.

Complexity: S ≤ half a day, M ≈ 1–2 days, L ≈ 3–5 days (one engineer who knows the code).

## Summary table

| ID | Pri | Category | Title | Cx | In next version |
|---|---|---|---|---|---|
| DB-01 | P0 | Data safety | Backup command, timer, restore doc | M | yes |
| BUG-01 | P1 | Bug fix | Honest status for lessons the last sync could not have seen | L | yes |
| UX-02 | P1 | UI/UX | Data-age line and "Noma'lum" status | M | yes (with BUG-01) |
| BUG-06 | P1 | Bug fix | Sliding session + re-login prompt instead of redirect | M | yes |
| BUG-12 | P1 | Bug fix | Bound generated course lessons to the semester | S | yes |
| FEAT-01 | P1 | Feature | "Yangi semestr": archive and start over | M | yes |
| UX-01 | P1 | UI/UX | Timetable cards never clip status (1024–1920) | M | yes |
| OPS-01 | P1 | Operations | Example nginx + systemd config in the repo | S | yes |
| ARCH-01 | P2 | Architecture | Pure logic into `web/lib/*.js` with tests | L | yes |
| BUG-02 | P2 | Bug fix | Render token; no stale view overwrites | M | yes |
| UX-08 | P2 | UI/UX | Re-render keeps scroll, focus, open details | S | yes (with BUG-02) |
| BUG-05 / FEAT-03 | P2 | Feature | Add a student to an existing lesson | M | yes |
| BUG-10 | P2 | Bug fix | Per-row guard on attendance toggles | S | yes |
| SEC-01 | P2 | Security | Header trust, count-before-hash, hash concurrency cap | M | yes |
| SEC-02 | P2 | Security | Extension: pin app origins | M | yes |
| REL-02 | P2 | Reliability | Sync detached from the request; 3 pages at a time | S | yes |
| UX-03 | P2 | UI/UX | Home attention card sizing; sync state `none` not urgent | S | yes |
| UX-04 | P2 | UI/UX | Roster density, header, quiet grade cells | M | yes |
| UX-05 | P2 | UI/UX | Load page: explanations into a disclosure | S | yes |
| UX-06 / BUG-08 | P2 | UI/UX | Kurs rejasi: one row per subject | S | yes |
| UX-07 | P2 | UI/UX | Inline errors in sheets | M | yes |
| UX-09 / DB-04 | P2 | Data safety | Soft delete + undo for lessons | M | yes |
| TEST-01 | P2 | Testing | `demo --with-site` + browser smoke script (`make e2e`) | M | yes |
| BUG-03, BUG-04 | P3 | Bug fix | `cleanPara` integers only; `SetAllPresent` 404 | S | yes |
| BUG-09 | P3 | Bug fix | Syncer state edge cases | S | yes |
| BUG-11, BUG-13 | P3 | Bug fix | Favicon, 404 route, history year, carry-over overflow | S | yes |
| UX-10…UX-14, UX-16, UX-17, A11Y-1, A11Y-4 | P3 | UI/UX | Token, contrast and small consistency fixes | M | yes |
| SEC-05, SEC-07, SEC-08 | P3 | Security | 600k iterations + rehash; DB 0600; no `--no-login` on public bind | S | yes |
| DB-02, DB-06 | P3 | Data safety | `import` backs up + `--yes`; prune old notifications | S | yes |
| REL-01, REL-03 | P3 | Reliability | Background-sync log line; health check touches DB | S | yes |
| ARCH-02 | P3 | Architecture | Test that JS and Go para times agree | S | yes |
| ARCH-07 | P3 | Architecture | Remove unused retake-sittings routes and methods | S | yes |
| ARCH-10 | P3 | Tooling | CI workflow; `-race`; `govulncheck` | S | yes |
| CQ-04 | P3 | Code quality | Machine-readable error codes (`code`) | S | yes |
| PERF-01 | P3 | Performance | gzip JSON over 1 KB | S | yes |
| BUG-07 | P3 | Bug fix | Atomic compound writes | S | deferred |
| SEC-03 | P3 | Security | Logout revocation (session epoch) | M | deferred |
| SEC-04 | P3 | Security | HSTS etc. in the app | S | deferred (covered by OPS-01 in nginx) |
| SEC-06 | P3 | Security | Share-link expiry | S | deferred |
| ARCH-03, ARCH-04, ARCH-05 | P3 | Architecture | Typed bodies, store split, `user_version` | L | deferred |
| DB-03 | P3 | Database | UNIQUE(date, para) | S | deferred |
| UX-15 | P3 | UI/UX | Palette actions | S | optional |
| FEAT-02 | P3 | Feature | CSV export of attendance and grades | M | optional future |
| FEAT-04 | P3 | Feature | Web Push with the tab closed | L | optional future |
| FEAT-05 | P3 | Feature | Course definition editable in Kabinet | M | optional future |

---

## Essential fixes and data safety

### DB-01 · Backup — P0

- **Problem**: the VPS SQLite file is the only copy of the real record; no backup code or schedule exists; the
  README's "copy the file" advice is unsafe under WAL.
- **Evidence**: no backup code in the repo; `README.md` Deploy section; `store.go:85` (WAL).
- **Affected files**: `main.go`, new `internal/store/backup.go`, `README.md`, new `deploy/attendance-backup.{service,timer}.example`.
- **Solution**: `attendance backup [--to DIR] [--keep N]` → `VACUUM INTO 'DIR/attendance-YYYYMMDD-HHMMSS.sqlite3'`
  through a **separate read-only connection that does not run migrations**; file mode 0600; keep the newest N
  (default 30); also copies `auth.json`. Automatic call before `import`, before `new-semester`, and before a
  start-up that adds a column. `GET /api/backup` returns the newest backup's time for Kabinet.
- **Benefit**: bounded worst case for every other change.
- **Complexity**: M. **Dependencies**: none. **Must ship first.**
- **Risks**: a backup binary newer than the service must not migrate the live file (hence the raw read-only
  connection); disk growth (rotation).
- **Acceptance**: see `14_…` AC-DB-01.

### BUG-01 + UX-02 · Honest status — P1

- **Problem**: lessons that ended after the data was read are shown and counted as "attendance taken"; a
  partial sync or a changed page layout produces the same false green.
- **Evidence**: `web/app.js:701-711`, `:1141`, `:1229-1245`, `:2021`; `internal/oxu/oxu.go:232-315`, `:389-417`;
  `store.go:624`; screenshots `real-home.png`, `real-jadval.png`.
- **Affected files**: `internal/oxu/oxu.go`, `internal/oxu/oxu_test.go`, `web/app.js` (→ `web/lib/timetable.js`,
  `web/lib/load.js`), `web/app.css`, `DESIGN.md`.
- **Solution**: per-section `fetched` timestamps in `oxu.Data`; positive empty-state detection in
  `parseUnsaved`; three-valued status (`taken` / `missing` / `unknown`); data-age line on six pages.
  Contract in `11_…` §3.1; design in `09_…` §4.1.
- **Benefit**: restores the product's core promise.
- **Complexity**: L. **Dependencies**: ARCH-01 (do the logic move first so the fix lands in tested code).
- **Risks**: over-marking as unknown hides real red alerts → rule: a lesson on the unsaved list is always
  `missing`. The site's empty-state markup is **not known to the auditor**: the owner must supply the page.
- **Acceptance**: AC-BUG-01.

### BUG-06 · Session expiry — P1

- **Problem**: after 12 h an open tab redirects itself to `/login` within 60 s, mid-lesson; open sheets lose input.
- **Evidence**: `auth.go:25`, `app.js:143-152`, `:1932`.
- **Affected files**: `internal/auth/auth.go`, `internal/server/server.go`, `web/app.js`, tests.
- **Solution**: sliding renewal (any authenticated request with less than half the lifetime left gets a fresh
  cookie; lifetime raised to 7 days idle); on `401` the page stays, background polls stop, a re-login dialog
  posts the password to a JSON login endpoint and resumes.
- **Complexity**: M. **Dependencies**: none.
- **Risks**: token format must stay `expiry.hmac` so existing cookies keep working.
- **Acceptance**: AC-BUG-06.

### BUG-12 · Lessons generated past the semester — P1 (must be live before 28 December 2026)

- **Problem / Evidence**: `entriesFor` (`app.js:790-801`) and `courseGaps` (`:807-813`) have no end date.
- **Solution**: course lessons are generated only within `[semester.start, semester.end]`.
- **Complexity**: S. **Dependencies**: none (uses `Pace.semester(...).end`).
- **Risks**: `entriesFor` callers that do not yet receive the semester (reminder, plans, Kabinet) must all pass it.
- **Acceptance**: AC-BUG-12.

### FEAT-01 · New semester — P1

- **Problem**: no way to start a semester without mixing or destroying the previous one (ARCH-06).
- **Solution**: Kabinet → "Yangi semestr": backup; set start and weeks; archive all active students; optional
  new plan hours. No schema change: lists and statistics already key on dates; "Darslar" and "Qarzlar" show the
  current semester with earlier ones folded under "Oldingi semestrlar". Changing the group name, subject or
  days still means editing `COURSE` in `web/app.js` (accepted by `PRODUCT.md`); the dialog says so.
- **Affected files**: `internal/store` (one transactional method), `internal/server/server.go` (one route),
  `web/app.js` (Kabinet, lessons, retakes views).
- **Complexity**: M. **Dependencies**: DB-01, BUG-12.
- **Risks**: archived students keep their debts; the Qarzlar badge must count current-semester debts only.
- **Acceptance**: AC-FEAT-01.

### OPS-01 · Reviewable deployment files — P1

- **Problem**: three findings (SEC-01, SEC-04, REL-02) depend on an nginx config nobody can read.
- **Solution**: `deploy/nginx.conf.example` (`proxy_set_header X-Real-IP $remote_addr; X-Forwarded-Proto $scheme;`
  `proxy_read_timeout 90s;` `limit_req` on `/login`; HSTS; gzip), `deploy/attendance.service.example`
  (`ATTENDANCE_SECURE_COOKIE=1`, `UMask=0077`, `ProtectSystem=strict`, `ReadWritePaths=`), backup timer.
  README checklist: compare the live files against these.
- **Complexity**: S. **Acceptance**: AC-OPS-01.

## Security improvements

### SEC-01 — P2

- **Solution**: forwarded headers honoured only from a loopback peer; attempt counted before hashing; at most
  2 concurrent hashes; prune expired entries. No global lockout.
- **Affected**: `internal/server/server.go:184-193`, `:240-256`; `internal/auth/auth.go:116-145`; tests.
- **Risks**: none for the documented deployment (nginx on loopback).
- **Acceptance**: AC-SEC-01.

### SEC-02 — P2

- **Solution**: allow-list of app origins checked against the sender tab in `extension/background.js`; options
  page for extra local origins; manifest version 2.1.0.
- **Risks**: a wrong list breaks `make demo` and the background-tab flow; test manually (M-EXT).
- **Acceptance**: AC-SEC-02.

### SEC-05, SEC-07, SEC-08 — P3 (in)

600 000 iterations for new hashes and rehash on login; `chmod 0600` on the database after open; refuse
`--no-login` unless the bind address is loopback.

## Architecture improvements

### ARCH-01 · Testable client logic — P2

- **Solution**: `web/lib/dates.js`, `rules.js`, `timetable.js`, `load.js`, `ustama.js`, `plans.js`, `format.js`
  as classic scripts in the `pace.js` pattern; `app.js` keeps views and wiring. Golden-file test proving
  `computeLoad` output is unchanged by the move.
- **Complexity**: L. **Dependencies**: none; **do before BUG-01**.
- **Risks**: script order; hidden globals (`today()`, `planCache`, `subjectStyles`).
- **Acceptance**: AC-ARCH-01.

### BUG-02 + UX-08 · Render token — P2

- **Solution**: `route()` owns a render id; views receive a `render` object (`show`, `rerender`, `alive`);
  handlers call `rerender()`; same-route re-render keeps scroll, focus, open details.
- **Risks**: every view is touched; guarded by TEST-01.
- **Acceptance**: AC-BUG-02, AC-UX-08.

### ARCH-02, ARCH-07, ARCH-10, CQ-04 — P3 (in)

One cross-language constant test; delete six dead routes and their store methods (keep table, column and
`Import`); CI; `{error, code}` in API errors with `code: "oxu_session"` replacing the message-prefix check at
`app.js:1471`.

## Performance and reliability

### REL-02 — P2

Detach the scrape from the request context; three week-pages at a time; `errBusy` guard unchanged.
**Acceptance**: AC-REL-02.

### PERF-01, REL-01, REL-03, DB-06 — P3 (in)

gzip JSON over 1 KB; one log line per background sync; `/healthz` runs `select 1` and reports snapshot age;
delete read notifications older than 90 days at sync time.

## UI/UX redesign

All specified in `09_UI_UX_REDESIGN_SPEC.md`; acceptance in `14_…`.

| ID | Pri | Spec section |
|---|---|---|
| UX-01 | P1 | §4.2 |
| UX-02 | P1 | §4.1 |
| UX-03 | P2 | §4.3 |
| UX-04 | P2 | §4.4 |
| UX-05 | P2 | §4.5 |
| UX-06 | P2 | §4.6 |
| UX-07 | P2 | §4.7 |
| UX-08 | P2 | §4.8 |
| UX-09 | P2 | §4.9 |
| UX-10…17, A11Y | P3 | §4.10 |

## New features

| ID | Pri | Justification |
|---|---|---|
| FEAT-01 New semester | P1 | dated failure without it (BUG-12), and the record must survive a semester change |
| FEAT-03 Add student to a lesson | P2 | today the only workaround is deleting the lesson and its marks (BUG-05) |
| TEST-01 `demo --with-site` | P2 | four pages cannot be tested or demonstrated without invented site data |

## Optional future enhancements (not in the next version)

FEAT-02 CSV export (no evidence the owner needs it yet); FEAT-04 Web Push (needs a push service; the README
already states the limit); FEAT-05 course editable in Kabinet; SEC-03 logout revocation; SEC-06 share expiry;
ARCH-03 typed request bodies; ARCH-04 store file split; ARCH-05 `user_version`; DB-03 unique index; BUG-07
atomic compound writes; UX-15 palette actions.

## Explicitly rejected

| Idea | Why |
|---|---|
| Rewrite, framework, bundler, TypeScript build | no evidence; contradicts owner constraints |
| ES modules | deferred execution reorders the extension handshake; more requests (review) |
| `/api/config` | duplication is two tables that never change; a test is enough |
| `202` + polling sync | the extension needs the synchronous answer |
| Global login lockout | lets anyone lock out the only user |
| Nonce handshake for the extension | oversized for a localhost-only threat |
| Phone layout for the app shell | owner decision |
| Multi-user / multi-course data model | owner decision; FEAT-01 covers the real need |
