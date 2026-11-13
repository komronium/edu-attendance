# 07 · Testing audit

## 1. What exists (run on 2026-11-11, all green)

| Suite | Command | Result | Statement coverage |
|---|---|---|---|
| `internal/auth` | `go test` | pass, 5 tests | 81.4 % |
| `internal/oxu` | `go test` | pass, 19 tests | 91.6 % |
| `internal/server` | `go test` | pass, 19 tests | 70.2 % |
| `internal/store` | `go test` | pass, 22 tests | 76.2 % |
| `main` | – | no tests | 0 % |
| `webtest/pace.test.js` | `node --test` | pass, 11 tests | covers `web/pace.js` (88 lines) only |
| `go vet ./...` | part of `make test` | clean | – |

`web/app.js` (2 208 lines), `web/theme.js`, `extension/*` (214 lines): **no tests**.
There are no browser, end-to-end, visual or accessibility tests. There is no CI.

## 2. Strengths

- Tests are named after behaviour and product promises: `TestSalaryNeverEntersTheData`,
  `TestSyncNeverOpensAttendancePages`, `TestAnotherPersonsSessionIsRefused`,
  `TestAccountChangingDuringSyncIsRefused`, `TestCookieIsKeptOnlyAfterItWorks`,
  `TestStatusNeverContainsTheCookie`, `TestDataOfAnotherAccountIsHidden`, `TestOpensDatabaseWithOldSchema`,
  `TestReadsPythonPasswordHash`.
- The scraper is tested against an `httptest` server through the real HTTP client.
- The server tests exercise real handlers with an in-memory database.
- The pace arithmetic has boundary tests (before the semester, zero plan, closed groups).

## 3. Gaps, ordered by risk

| # | Gap | Why it matters | Required tests (IDs used in `14_TEST_AND_ACCEPTANCE_CRITERIA.md`) |
|---|---|---|---|
| G1 | Teaching-load computation `computeLoad`, `sessionWindows`, `loadPace` | money-relevant numbers; five recent corrective commits | T-LOAD-* |
| G2 | Timetable generation `lessonContext`, `entriesFor`, `courseGaps`, `nextEntry`, `paraOver` | drives the home hero and every "missing attendance" count | T-TT-* |
| G3 | Site-lesson status with respect to snapshot age (BUG-01) | currently wrong; needs a regression test | T-STATUS-* |
| G4 | Bonus figures `ustamaOpen`, `ustamaFigure`, `periodKey` | end-of-month decisions | T-UST-* |
| G5 | Plan logic `coveredTopics`, `suggestTopic`, `carryOver`, `nextOfClass` | silent data movement between lessons | T-PLAN-* |
| G6 | Parsers `parseDay`, `noteLessons`, `fmtRoom`, `canonSubject`, `shortSubject`, `sameWork` | pure, easy, currently untested | T-FMT-* |
| G7 | Login hardening: header trust, global throttle, logout revocation, sliding renewal | SEC-01, SEC-03, BUG-06 | T-AUTH-* |
| G8 | Validation edges: `cleanPara(1.9)`, `SetAllPresent` on a missing id, compound PUT atomicity | BUG-03, BUG-04, BUG-07 | T-VAL-* |
| G9 | Syncer races: `Forget` during a run, cancelled request, concurrent `Now` | BUG-09, REL-02 | T-SYNC-* |
| G10 | Schema change safety: adding `sessions.deleted_at` to old databases, backup taken first | the one migration in the next version (`user_version` and the unique index are deferred) | T-BAK-5, T-BAK-6, T-DEL-* |
| G11 | `main.go`: flag parsing order, `dbPath` legacy fallback, `set-password` length rule | 0 % today | T-CLI-* |
| G12 | End-to-end classroom flow in a real browser | the product's most time-critical path | E2E-1…E2E-6 |
| G13 | Extension message flow | SEC-02; cannot be unit-tested without a harness | manual script M-EXT-* |
| G14 | Scraper against real saved pages | fixtures are hand-written; site markup drift is the top operational risk | T-OXU-FIXTURE (owner supplies sanitised pages) |
| G15 | Rendering regressions | the UI changes often | screenshot script S-* (already prototyped in this audit) |

## 4. Recommended test architecture (no new runtime dependencies)

1. **Go**: keep the standard library `testing`. Add table tests for the new auth and config code. Add
   `go test -race ./...` to `make test`.
2. **JS pure logic**: `node --test` against `web/lib/*.js` once ARCH-01 lands (classic scripts in the
   `pace.js` pattern, not ES modules). They must not touch
   `document`/`window` and must take `today`/`now` as arguments. Target: every exported function in `web/lib`
   has a test; aim for ≥ 85 % line coverage with `node --test --experimental-test-coverage`.
3. **Browser smoke**: one Node script driving headless Chrome over the DevTools protocol (no Playwright, no
   npm install; Node ≥ 22 has `fetch` and `WebSocket` built in). It starts `attendance demo --no-login` on a
   free port, visits every route in both themes at 1280×720 and 1440×900, asserts no console errors, no
   horizontal overflow, no clipped text in `.slot`, and saves screenshots. Run by `make e2e`, not by default
   `make test` (it needs Chrome).
4. **Fixtures for site-fed pages**: `attendance demo` has no site snapshot, so timetable, load, KPI and bonus
   render empty. Add `demo --with-site` that seeds an invented `oxu_snapshot` (no real data) so these pages can
   be tested and screenshotted.
5. **CI**: one workflow: `go vet`, `go test -race`, `node --test`, `govulncheck`.

## 5. Critical failure scenarios that must have a test before release

1. Snapshot older than a lesson → that lesson is **not** shown or counted as "taken".
2. Sync finishes while another page is open → the open page is not replaced.
3. Spoofed `X-Real-IP` from a non-loopback peer → ignored; lockout still triggers.
4. Logout → the old token is rejected.
5. Database from the Python era and from v1 (today) → opens, migrates, keeps every row; a backup file exists.
6. A backup taken by a newer binary never alters or migrates the live database.
7. Client disconnects during a manual sync → the sync still completes and is stored.
8. A foreign localhost origin sends `ready` to the extension bridge → no cookie is delivered (manual).

## 6. Regression risks of the proposed work

| Change | Main regression risk | Guard |
|---|---|---|
| Moving pure logic out of `app.js` into `web/lib/*.js` | script order in `index.html`, a function left behind | browser smoke over all 13 routes; byte-identical numbers on a fixed snapshot before/after (golden JSON of `computeLoad`) |
| Unknown status for stale lessons | hours "disappear" from the load until the next sync; owner confusion | explicit "noma'lum" bucket in the UI and tests that totals still add up |
| Typed request structs | error texts change; clients sending strings for numbers break | keep messages; table tests replaying today's accepted payload shapes |
| Detached sync context | a sync outliving its request while another starts | existing `errBusy` guard; T-SYNC-2 |
| Soft-delete column | every session query must exclude deleted rows | T-DEL-*; grep for `from sessions` |
