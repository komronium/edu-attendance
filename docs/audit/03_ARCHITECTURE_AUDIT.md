# 03 · Architecture audit

> Priorities and remedies in this document were revised after the independent review (`13_FABLE_REVIEW.md`).
> `10_IMPROVEMENT_ROADMAP.md` is the single authoritative list.

## 1. Current architecture (verified)

```
Chrome extension ──cookie──▶ browser tab (web/app.js) ──fetch JSON──▶ internal/server ──▶ internal/store ──▶ SQLite
   (extension/)                 │  all view + business logic            │  routes, auth,       (one connection)
                                │  web/pace.js (pure arithmetic)        │  static, public page
                                                                        └▶ Syncer ──▶ internal/oxu ──GET──▶ digital.oxu.uz
                                                                             (30 min)   (HTML parsing)
main.go: CLI, embeds web/, wires auth + store + server
```

Dependency direction is clean: `main → server → {auth, store, oxu}`; `store` and `oxu` do not know each
other; `server/syncer.go` is the only place that joins them. No import cycles, no global mutable state on
the Go side apart from the time-zone `sync.Once`.

**What is good and must be kept**

- One static binary, no runtime dependencies, embedded assets with ETag and pre-compressed gzip (`server.go:88-111`).
- Strict CSP with no inline script or style (`server.go:30`); dynamic sizes go through `style.setProperty`.
- The scraper is isolated, read-only, defensively written and the best-tested package (91.6 %).
- The owner-account guard is layered: checked before and after a sync (`oxu.go:233`, `:310`), the snapshot is
  tagged, and `Syncer.Snapshot` hides a mismatching snapshot (`syncer.go:86-99`).
- Injectable seams for tests: `Config.OxuSync`, `Syncer.now`, `Client.now`, `newClient(base, …)`.
- Size is proportionate: about 2 900 lines of Go for the whole backend. **No rewrite is justified.**

## 2. Findings

### ARCH-01 · Business rules live in an untested 2 208-line browser file — P2

- **Evidence**: `web/app.js` holds routing, rendering **and** the product's core arithmetic: `computeLoad`
  (`:1229`), `lessonContext`/`entriesFor` (`:779`, `:790`), `courseGaps`/`nextEntry` (`:807`, `:815`),
  `sessionWindows` (`:1212`), `ustamaOpen`/`ustamaFigure` (`:1713`, `:1723`), `subjectColors` (`:726`),
  `coveredTopics`/`suggestTopic`/`carryOver` (`:889-929`), `noteLessons` (`:1897`), `parseDay` (`:105`),
  `sameWork` (`:1606`). Only `web/pace.js` (88 lines) is under test.
- **Why it matters**: these functions decide what the owner is told about money-relevant facts (hours taught,
  attendance missing, bonus open). The last five commits are all corrections to this arithmetic. They cannot
  be tested because they share a file with DOM code and read globals (`today()`, `nowTime()`, `planCache`,
  `subjectStyles`).
- **Recommendation**: follow the pattern `web/pace.js` already proves: classic scripts that are also loadable
  by `node --test` (browser global + `module.exports`). Move the pure functions to `web/lib/*.js` with explicit
  `today`/`now` parameters. **Not** ES modules: module scripts are deferred, which would reorder the
  extension's `ready` handshake and add a revalidation request per file (review finding). Views stay in
  `app.js`. See `11_NEXT_VERSION_SPEC.md` §4.

### ARCH-02 · Domain constants duplicated across Go and JS — P3

- **Evidence**: para times in `web/app.js:12` and `internal/oxu/changes.go:19`; the course in `web/app.js:15`,
  `store/validate.go:26`, `store/importer.go:251-276`; month names in three files.
- **Risk**: the server's "attendance missing" notification and the client's status use two copies of the
  timetable; a change to one silently disagrees with the other. The course definition must be edited in
  JavaScript and redeployed when the semester changes.
- **Recommendation**: the values are identical today and change about never, and `PRODUCT.md` accepts the
  hard-coded course. A `/api/config` endpoint is not worth its cost. Add one Go test that parses `PARA_TIMES`
  out of `web/app.js` and asserts its end times equal `paraEnd`.

### ARCH-03 · Untyped request bodies end to end — P3 (deferred)

- **Evidence**: `server.body()` returns `map[string]any` (`server.go:323`); store methods take `any`
  (`StartSession(day, room, topic, para any, …)`, `SetLessonPlan` with eight `any` parameters). Validation
  lives in the storage layer and keeps Python-compat helpers (`Truthy`, `str` returning `"True"`).
- **Consequence**: the compiler checks nothing between handler and SQL; odd inputs pass (BUG-03); the store
  cannot be reused with typed callers; unknown JSON fields are silently ignored.
- **Recommendation**: typed request structs decoded with `DisallowUnknownFields` in the handler, typed store
  signatures. Do it per endpoint group, starting with sessions and plans. Keep error messages byte-identical
  (tests assert on them).

### ARCH-04 · `store.go` mixes eight domains in 1 301 lines — P3

Splitting has already begun (`plans.go`, `share.go`, `styles.go`). Finish it mechanically: `kpi.go`,
`settings.go`, `students.go`, `sessions.go`, `retakes.go`, `notifications.go`. No behaviour change.

### ARCH-05 · Migrations by column sniffing, no schema version — P3 (deferred until a migration needs it)

- **Evidence**: `migrate()` (`store.go:176-240`) runs `create table if not exists`, then checks
  `pragma_table_info` for five columns and runs a data backfill on every start.
- **Risk**: any future change that is not "add a nullable column" (a unique index, a new NOT NULL column, a
  table split for semesters) has no ordered, once-only place to live.
- **Recommendation**: `PRAGMA user_version` with an ordered list of migration functions; version 1 = today's
  schema as-is (so the Python-era file still opens); a file copy before any migration that raises the version.

### ARCH-06 · No semester or course scoping — P1 (dated: the semester ends 26 December 2026)

- **Evidence**: `students`, `sessions`, `attendance` have no course or term column; `COURSE` is a constant;
  `store.Semester()` defaults to `2026-09-14`; `Import` hard-codes `2026-09-14` as `created_at`
  (`importer.go:87`).
- **Consequence**: when the spring semester starts the owner must either wipe the data (losing the record the
  product exists to keep) or see autumn students mixed with spring ones.
- **Dated failure (found by the reviewer, confirmed in code)**: `entriesFor` (`app.js:790`) generates Mon–Thu
  course lessons with no upper bound and `courseGaps` (`:807`) walks from the first session to today, so after
  the semester ends every teaching day adds two false "davomat olinmagan" items to the home page (BUG-12).
- **Recommendation**: bound generated lessons to the semester and add an archive operation, not
  multi-tenancy. See BUG-12 and FEAT-01 in the roadmap.

### ARCH-07 · Abandoned "retake sittings" slice — P3

Six routes, six store methods, one table and one column (`attendance.retake_session_id`) with no UI
(`01_PROJECT_INVENTORY.md` §4). Either build the screen or delete the routes and methods; keep the table and
column (dropping them is a risky migration with no benefit). Recommendation: **delete the routes and methods**,
keep `Import` support.

### ARCH-08 · Client state and rendering model — P2

- **Evidence**: every view refetches all its data and replaces the whole `#view` (`show()`, `app.js:234`);
  in-page actions re-run the whole view function (`retakesView()`, `monthsView()`, `kpiView()`), which resets
  scroll and focus. Module-level mutable caches (`planCache`, `subjectStyles`, `reminderCtx`, `sf`, `rf`, `jw`,
  `kf`). No guard against an older async render finishing after a newer one (BUG-02).
- **Recommendation**: a ten-line render token in `route()` and scroll/focus preservation on same-route
  re-render. No framework, no client cache.

### ARCH-09 · Sync is synchronous inside an HTTP request — P2

`POST /api/oxu/sync` blocks for the whole scrape (up to `syncTimeout` 70 s under a 75 s `WriteTimeout`). The
scrape is sequential and grows by one page per semester week (`oxu.go:321-333`). See REL-02 in
`06_DATABASE_PERFORMANCE_AUDIT.md`.

### ARCH-10 · No CI, no lint configuration — P3

`make test` runs `go vet`, `go test`, `node --test`. Nothing runs them automatically; there is no
`staticcheck`/`govulncheck` step. A single GitHub Actions workflow (or a pre-push hook) is enough.

## 3. Scalability

Not a goal. One user, tens of students, hundreds of lessons. SQLite with one connection is the right choice.
The only growth axes that matter are **time** (more semesters, ARCH-06; more weeks per sync, ARCH-09) and
**code size in `app.js`** (ARCH-01).

## 4. Unnecessary abstractions

None found. The code is direct. The `querier` interface and generic `list[T]` helper in `store.go` are
justified by use.
