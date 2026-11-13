# 12 · Implementation tasks

Ordered, each small enough for one commit. Every task names its finding, files, steps and the check that
proves it (IDs refer to `14_TEST_AND_ACCEPTANCE_CRITERIA.md`). Read `11_NEXT_VERSION_SPEC.md` first; section
numbers below point into it.

Ground rules for the implementer:

- Run `make test` before and after every task. Never weaken an existing test to make it pass.
- No new dependencies (Go modules or npm). No build step. CSP unchanged.
- Uzbek UI strings: reuse the terms in `DESIGN.md`. New strings are given below; keep them.
- Work on a branch; one commit per task; do not touch `data/`.
- Before the first task, read the dev notes in `README.md`, `PRODUCT.md`, `DESIGN.md`.

## Phase 0 · Safety net

**T01 · Backup command** (DB-01, §3.4)
- Files: new `internal/store/backup.go`, `internal/store/backup_test.go`; `main.go` (command `backup`, flags
  `--to`, `--keep`, usage text); `README.md`.
- Steps: write the failing tests (AC-DB-01 a–e); implement `store.Backup` with a raw read-only connection;
  wire the CLI; document backup and restore in README, and replace the "copy the file" advice.
- Check: T-BAK-1…5.

**T02 · Automatic backups** (DB-01, DB-02)
- Files: `main.go` (`importSpec`: `--yes`, backup first), `internal/store/store.go` (`migrate`: detect missing
  columns → backup → alter; skip for `:memory:`), `internal/server/server.go` (`GET /api/backup`).
- Check: T-BAK-6, T-BAK-7, T-CLI-3.

**T03 · Deployment examples** (OPS-01)
- Files: new `deploy/nginx.conf.example`, `deploy/attendance.service.example`,
  `deploy/attendance-backup.service.example`, `deploy/attendance-backup.timer.example`; README "Deploy".
- Check: AC-OPS-01 (review checklist).

**T04 · Demo with invented site data + smoke script** (TEST-01)
- Files: `internal/store/importer.go` (`SeedSite()` writing an invented `oxu_snapshot` and owner `000000`:
  3 subjects, lectures and practicals, one part-time group, one closed group, 2 unsaved lessons, KPI bands,
  2 bonus periods, months), `main.go` (`demo --with-site`), new `scripts/e2e.mjs` (start from
  `docs/audit/screenshots/shoot.mjs.txt`), `Makefile` (`e2e` target).
- The script: launches the demo on a free port, visits all 13 routes × 2 themes × {1280×720, 1440×900}, plus
  1024 and 1920 for `#/jadval`, asserts the checks in AC-E2E, writes PNGs to a temp dir.
- Check: `make e2e` exits 0 on the unchanged UI (record the baseline failures it finds: UX-01 clipping is
  expected to fail until T17; mark it `expected-fail` with the task number).

## Phase 1 · Dated and core correctness

**T05 · Bound course lessons to the semester** (BUG-12, §3.3)
- Files: `web/app.js` (`lessonContext`, `entriesFor`, all callers incl. `lessonReminder`, `classContext`,
  `cabinetView`).
- Check: T-TT-5 (written in T07 against the lib; until then verify by e2e with a semester that ended).

**T06 · Extract pure logic, part 1: dates, rules, format** (ARCH-01, §3.6)
- Files: new `web/lib/dates.js`, `web/lib/rules.js`, `web/lib/format.js`; `web/index.html`; `web/app.js`;
  new `webtest/dates.test.js`, `rules.test.js`, `format.test.js`; `internal/server/server_test.go` if it lists
  assets.
- Steps: move functions verbatim; replace hidden `today()` calls with a parameter; destructure at the top of
  `app.js`. No behaviour change.
- Check: T-FMT-*, T-RULES-*; e2e unchanged.

**T07 · Extract part 2: timetable, load, ustama, plans** (ARCH-01)
- Files: new `web/lib/timetable.js`, `load.js`, `ustama.js`, `plans.js` and their tests;
  new `webtest/golden/load-input.json`, `load-output.json`.
- Steps: **before moving**, capture `computeLoad` + `loadPace` output for the `--with-site` snapshot with a
  fixed `today`/`now` into the golden file (run the current code in Node via a temporary harness); move; the
  golden test must pass byte-for-byte.
- Check: T-LOAD-1 (golden), T-TT-1…5, T-UST-*, T-PLAN-*.

**T08 · Per-section freshness in the scraper** (BUG-01 server half, §3.1)
- Files: `internal/oxu/oxu.go`, `oxu_test.go`, `internal/server/syncer.go` (persist warnings in the snapshot).
- Steps: tests first: failed "davomat holati" step keeps the old `fetched.unsaved`; successful steps advance
  theirs; `Fetched` is not aliased with `prev`; unrecognised unsaved page → warning + old list; recognised empty
  page → empty list.
- **Needs from the owner**: two saved copies of the unsaved-lessons page (empty and non-empty). Without them
  implement the heading-based rule in §3.1 and leave a clearly marked constant for the marker text.
- Check: T-OXU-1…5.

**T09 · Three-valued status in the client** (BUG-01 client half, UX-02)
- Files: `web/lib/timetable.js` (`siteStatus`, `ctx.status`), `web/lib/load.js` (`unknown` bucket),
  `web/pace.js` (`summary` includes `unknown` in `held`), `web/app.js` (`siteCard`, home `gaps`, timetable
  `isMissing`, load view column and sentence, `ageLine`), `web/app.css` (`.chip.unknown`, `.age-line`, tokens),
  `DESIGN.md`.
- Strings: `Noma'lum`; `Ma'lumot {n} soat oldingi`; `Ma'lumot {n} kun oldingi. Shundan keyingi darslar holati
  noma'lum.`; `Qisman yangilangan: {bo'lim}`.
- Check: T-STATUS-1…7, AC-BUG-01, e2e with a stale snapshot (`demo --with-site --stale-days 3`).

## Phase 2 · Sessions, login, rendering

**T10 · Login hardening** (SEC-01, SEC-05, §3.2)
- Files: `internal/auth/auth.go`, `auth_test.go`, `internal/server/server.go`, `server_test.go`, `main.go`
  (min length 10 for a chosen password).
- Check: T-AUTH-1…7.

**T11 · Sliding session and in-page re-login** (BUG-06)
- Files: `internal/auth/auth.go` (`Renew`, lifetime), `internal/server/server.go` (`authed` renews;
  `POST /api/login`), `web/index.html` (`#relogin` dialog), `web/app.js` (`api()`, interval control).
- Check: T-AUTH-8…10, AC-BUG-06, E2E-5.

**T12 · Render token and place-keeping** (BUG-02, UX-08, §3.6)
- Files: `web/app.js` (all views, handlers, `message` listener).
- Steps: introduce `render`; convert views one at a time (home, timetable, plans, load, KPI, bonus, lessons,
  lesson, students, student, retakes, Kabinet, notifications); add `data-key`s.
- Check: AC-BUG-02, AC-UX-08, E2E-2, E2E-6.

**T13 · Roster toggle guard** (BUG-10)
- Files: `web/app.js` (`lessonView`). Check: E2E-3.

## Phase 3 · Classroom and data features

**T14 · Soft delete and undo** (UX-09, DB-04, §3.5)
- Files: `internal/store/store.go` (+ query filter test), `store_test.go`, `internal/server/server.go`,
  `web/app.js` (undo toast).
- Check: T-DEL-1…5, AC-UX-09.

**T15 · Add a student to a lesson** (BUG-05, FEAT-03)
- Files: `internal/store/store.go`, tests, `internal/server/server.go`, `web/app.js` (`lessonView`).
- Check: T-ROSTER-1…3, E2E-4.

**T16 · New semester** (FEAT-01, §3.3)
- Files: `internal/store/store.go` (`NewSemester`), tests, `internal/server/server.go`, `web/app.js`
  (Kabinet dialog; "Oldingi semestrlar" folds in `lessonsView`, `retakesView`; badge and tile filters).
- Check: T-SEM-1…4, AC-FEAT-01.

**T17 · Timetable cards** (UX-01, `09_…` §4.2)
- Files: `web/app.css` (timetable section, ≤ 1240 and new ≤ 1100 rules), `web/app.js` (`cardLines`, `state`).
- Check: AC-UX-01 (e2e clipping assertion now passes at 1024, 1280, 1366, 1440, 1920, both themes).

**T18 · Roster layout** (UX-04, §4.4)
- Files: `web/app.js` (`lessonView` header, two-column split), `web/app.css`.
- Check: AC-UX-04.

## Phase 4 · Sync and extension

**T19 · Sync robustness** (REL-02, BUG-09, CQ-04, REL-01, §3.7)
- Files: `internal/server/syncer.go`, `syncer_test.go`, `internal/oxu/oxu.go` (pool of 3), `server.go`
  (error codes), `web/app.js` (`err.code`).
- Check: T-SYNC-1…5, AC-REL-02.

**T20 · Extension origin allow-list** (SEC-02, §3.8)
- Files: `extension/background.js`, new `extension/options.html`, `extension/options.js`,
  `extension/manifest.json`, `README.md`.
- Check: manual M-EXT-1…5.

## Phase 5 · Remaining UI

**T21 · Home attention card and sync state wording** (UX-03) — `web/app.js`, `web/app.css`. AC-UX-03.
**T22 · Load page disclosure** (UX-05) — `web/app.js` (`loadView`), `web/app.css`. AC-UX-05.
**T23 · Kurs rejasi rows** (UX-06/BUG-08) — `web/app.js` (`plansView`). AC-UX-06.
**T24 · Inline errors in sheets** (UX-07) — `web/app.js` (`openSheet`, `act`), `web/app.css`,
`internal/store/validate.go` + `server.go` (optional `field` in validation errors). AC-UX-07.
**T25 · Tokens and small fixes** (UX-10…14, UX-16, UX-17, A11Y-1, A11Y-4, BUG-11, BUG-13) — `web/app.css`,
`web/app.js`, `web/index.html`, new `web/favicon.svg`, new `web/public.js`, `internal/server/public.go`,
`server.go` (`isPublic`), `DESIGN.md`; delete or regenerate `.impeccable/design.json`. AC-UX-10…17.

## Phase 6 · Clean-up and gates

**T26 · Small backend fixes** (BUG-03, BUG-04, SEC-07, SEC-08, DB-06, REL-03, PERF-01)
- Files: `internal/store/validate.go`, `store.go`, `main.go`, `internal/server/server.go` (+ tests).
- Check: T-VAL-1…3, T-SEC-1…2, T-NOTE-1, T-HEALTH-1, T-GZIP-1.

**T27 · Remove dead retake-sittings API** (ARCH-07)
- Files: `internal/server/server.go` (six routes), `internal/store/store.go` (`StartRetakeSession`,
  `RetakeSessions`, `RetakeSession`, `AcceptRetake`, `FinishRetakeSession`, `DeleteRetakeSession` and their
  types), tests that exercise them. Keep the table, the column, `Import`, and `SetPresent`/`SetRetake` clearing
  `retake_session_id`.
- Check: `make test`; grep shows no remaining reference.

**T28 · Cross-language constant test** (ARCH-02)
- File: `internal/oxu/changes_test.go`: read `../../web/lib/dates.js`, extract `PARA_TIMES`, compare end times
  with `paraEnd`. Check: T-CONST-1.

**T29 · CI and race** (ARCH-10)
- Files: `Makefile` (`go test -race ./...`), new `.github/workflows/test.yml` (vet, test -race, node --test,
  `govulncheck` via `go run golang.org/x/vuln/cmd/govulncheck@latest`). Only if the repo is hosted on GitHub;
  otherwise a `scripts/pre-push` hook with the same commands.

**T30 · Documentation**
- `README.md` (backup, new semester, extension options, deploy checklist, new routes), `DESIGN.md` (status
  colour rule, new tokens, age line, unknown chip, roster density), `PRODUCT.md` unchanged.

**T31 · Release verification**
- Run everything in `14_…` §6 (release checklist), including the screenshot review in both themes and the
  restore drill.

## Traceability

| Finding | Task(s) |
|---|---|
| DB-01, DB-02 | T01, T02 |
| OPS-01 | T03 |
| TEST-01 | T04 |
| BUG-12 | T05 |
| ARCH-01 | T06, T07 |
| BUG-01, UX-02 | T08, T09 |
| SEC-01, SEC-05 | T10 |
| BUG-06 | T11 |
| BUG-02, UX-08 | T12 |
| BUG-10 | T13 |
| UX-09, DB-04 | T14 |
| BUG-05, FEAT-03 | T15 |
| FEAT-01, ARCH-06 | T16 |
| UX-01 | T17 |
| UX-04 | T18 |
| REL-02, BUG-09, CQ-04, REL-01, PERF-02 | T19 |
| SEC-02 | T20 |
| UX-03 | T21 |
| UX-05 | T22 |
| UX-06, BUG-08 | T23 |
| UX-07 | T24 |
| UX-10…14, UX-16, UX-17, A11Y, BUG-11, BUG-13 | T25 |
| BUG-03, BUG-04, SEC-07, SEC-08, DB-06, REL-03, PERF-01 | T26 |
| ARCH-07 | T27 |
| ARCH-02 | T28 |
| ARCH-10 | T29 |
