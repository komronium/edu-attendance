# 11 · Next-version technical specification

Target: the next release of `attendance`, built on commit `a1d748f`. Theme: **safe data, honest status,
classroom-proof**. Scope is exactly the items marked "yes" in `10_IMPROVEMENT_ROADMAP.md`.

## 1. What must remain unchanged

- Go + SQLite (modernc, one connection, WAL), one static binary, embedded `web/`, no cgo.
- Vanilla JS, **no build step, no npm dependencies, no framework**, classic scripts.
- CSP string in `server.go:30` byte-for-byte; no inline script/style; dynamic values via `style.setProperty`.
- The scraper stays GET-only, never opens attendance pages, never reads money columns, checks the owner ID
  before and after. All existing tests named for these promises must keep passing unmodified.
- Database files from the Python era and from today open without manual steps.
- `auth.json` format and the `expiry.hmac` cookie format (existing logins survive the upgrade).
- All existing routes and JSON shapes, except the six unused `/api/retake-sessions*` routes (removed).
- Uzbek interface text and terminology in `DESIGN.md`; the "Sokin" visual direction; decimals with a point.
- `COURSE` stays a constant in the client.
- `make test` stays runnable with only Go and Node installed.

## 2. Architecture after the change

```
web/
  index.html        scripts in order: theme.js (head, blocking) · lib/dates.js · lib/rules.js · pace.js ·
                    lib/timetable.js · lib/load.js · lib/ustama.js · lib/plans.js · lib/format.js · app.js
  lib/*.js          pure functions, no DOM, UMD wrapper identical to pace.js; tested by node --test
  app.js            h(), components, api(), render token, views, palette, theme, reminders
internal/
  auth              + sliding renewal helper, hash semaphore, rehash-on-login
  server            + /api/login (JSON), /api/backup, /api/semester/new, /api/sessions/{id}/students,
                      /api/sessions/{id}/restore; forwarded-header trust; gzip JSON; error codes
  store             + backup.go (raw read-only VACUUM INTO), sessions.deleted_at, NewSemester()
  oxu               + Data.Fetched per section; parseUnsaved returns (list, ok)
extension/          origin allow-list, options page, version 2.1.0
deploy/             nginx.conf.example, attendance.service.example, attendance-backup.{service,timer}.example
webtest/            one test file per lib file; golden/load.json
scripts/e2e.mjs     headless-Chrome smoke (make e2e)
```

## 3. Module-level changes

### 3.1 Honest status (BUG-01, UX-02) — the central change

**Server, `internal/oxu`**

```go
// Data gains (omitempty keeps old snapshots readable):
Fetched map[string]float64 `json:"fetched,omitempty"` // section → unix seconds of the last SUCCESSFUL read
// sections: "lessons", "unsaved", "load", "kpi", "periods", "months"
```

- In `Client.Sync`, when a step succeeds set `out.Fetched[name] = now`; when it fails keep the previous value
  (it is copied from `prev` with the rest). `Fetched` must be deep-copied from `prev`, not aliased.
- `parseUnsaved(doc) ([]Lesson, bool)`: `ok` is true when (a) at least one valid 8-cell row was parsed, or
  (b) the page carries the site's genuine "nothing unsaved" marker. Otherwise `unsaved()` returns an error
  (`"davomat holati sahifasi tanilmadi"`), which the existing `step` turns into a warning and keeps the old list.
  - **Open input**: the exact empty-state markup is unknown to this audit. The owner must save
    `/uqituvchi_saqlanmagan_darslar.asp` once when the list is empty and once when it is not; add both as
    fixtures. Until the marker is known, treat "page has the logged-in layout **and** contains the page's own
    heading text **and** no table" as empty, and anything else as unrecognised.
- Warnings are already persisted only in memory; additionally store them in the snapshot
  (`Warnings []string json:"warnings,omitempty"`) so the page can show "qisman yangilangan" after a restart.

**Client, `web/lib/timetable.js`**

```js
// status of a site lesson; pure
// unsavedKeys: Set<"date|para"> or null when the section was never read
// fetchedAt:   unix seconds of the last successful read of the "unsaved" section, or 0
// now:         { date: "YYYY-MM-DD", time: "HH:MM", unix }   (Tashkent)
function siteStatus(lesson, unsavedKeys, fetchedAt, now) -> "coming" | "missing" | "taken" | "unknown"
```

Rules, in this order:

1. para not over at `now` → `coming`.
2. `unsavedKeys` has the lesson → `missing` (always, whatever the age).
3. `fetchedAt === 0` or `unsavedKeys === null` → `unknown`.
4. the read happened **after the lesson's para ended** (compare `fetchedAt` with the para's end as a Tashkent
   timestamp) → `taken`.
5. otherwise → `unknown`.

Fallback for snapshots written before this version (`fetched` absent): use `synced_at` for every section.

`lessonContext(sessions, data, cancelled, syncedAt)` exposes `ctx.status(lesson)`; `siteCard`,
`scheduleView.isMissing`, home `gaps`, and `computeLoad` use it and nothing else.

`computeLoad` line shape gains `unknown` (hours): `held = done + noAtt + unknown`; `done` counts only `taken`.
`Pace.summary` treats `unknown` as held (the lesson took place) — add it to `held` there, and expose
`unknownTotal` for the UI. Totals must satisfy `done + noAtt + unknown === heldLessons * 2` per line.

**UI**: `ageLine()` component and the `unknown` chip per `09_…` §4.1. Thresholds: 2 h amber, 24 h red,
measured against `fetched.unsaved` on timetable/home/load, `fetched.kpi` on Ilmiy KPI, `fetched.periods` on
Ustama.

### 3.2 Sessions and login (BUG-06, SEC-01, SEC-05)

```go
// internal/auth
const SessionSeconds = 7 * 24 * 3600          // idle lifetime
func (a *Auth) Renew(token string) (fresh string, ok bool) // ok when valid and less than half the lifetime remains
func (a *Auth) TryHash() (release func(), ok bool)         // semaphore of 2
func (a *Auth) Attempt(ip string) bool                     // locked? else record the attempt NOW; Succeed() clears
func (a *Auth) NeedsRehash() bool                          // rec.Iterations < Iterations (now 600_000)
```

- `server.authed` → after a valid check call `Renew`; if `ok`, `setCookie` with the fresh token. Token format
  unchanged, so cookies issued by the old binary stay valid until their own expiry.
- `login`: `Attempt(ip)` before hashing (returns false → `429`); `TryHash()` (false → `429` with
  `Retry-After: 1`); on success, if `NeedsRehash()`, rewrite `auth.json` with the same secret and a new
  salt/hash at 600 000.
- `clientIP(r)` and the HTTPS test read `X-Real-IP` / `X-Forwarded-Proto` **only if** `r.RemoteAddr` is a
  loopback address.
- New `POST /api/login` (JSON `{password}` → `{ok:true}` + cookie; same throttling; requires the
  `X-Requested-With` header). The HTML form at `/login` stays.
- Client `api()`: on `401` do **not** navigate. Set `authLost = true`, stop the two intervals, open a
  `<dialog id="relogin">` ("Sessiya tugadi. Parolni kiriting.") that posts to `/api/login`; on success clear
  the flag, restart intervals, and retry the failed call once. Concurrent 401s share one dialog (one promise).
  Page load without a session still redirects server-side as today.

### 3.3 Semester bounds and "new semester" (BUG-12, FEAT-01)

- `entriesFor(dates, ctx)`: generate a course entry for a date only if `ctx.semester.start <= date <=
  ctx.semester.end` (or a session exists that day). `lessonContext` takes `semester` (`{start, weeks}`) and
  computes `end` with `Pace.semester`. Every caller passes it: home, timetable, plans, load, Kabinet, reminder,
  `classContext`.
- `POST /api/semester/new {start, weeks, plan_hours?}` → `store.NewSemester`: in one transaction set
  `semester_start`, `semester_weeks`, optional `course_plan_hours`, and `update students set active = 0`.
  The handler takes a backup first and refuses if the backup fails.
- Lists: `lessonsView` and `retakesView` split rows at `semester.start`; older rows go into
  `<details>Oldingi semestrlar (N)</details>`. The sidebar debt badge and the home tile count debts whose lesson
  date is `>= semester.start`. `Retakes` API unchanged (client filters).
- Kabinet "Yangi semestr" dialog text states: students will be archived (not deleted), old lessons stay under
  "Oldingi semestrlar", and the group/subject/days are changed in `web/app.js` (`COURSE`).

### 3.4 Backup (DB-01)

```go
// internal/store/backup.go
// Backup writes a consistent copy of the database at src into dir and returns its path.
// It never runs migrations and never writes to src.
func Backup(src, dir string, keep int) (path string, err error)
```

- Open `src` with `file:<src>?mode=ro&_pragma=busy_timeout(5000)` via `sql.Open("sqlite", …)` directly;
  `VACUUM INTO ?`; `os.Chmod(path, 0o600)`; copy `auth.json` next to it as `auth-<stamp>.json` (0600); delete
  the oldest files beyond `keep` (match `attendance-*.sqlite3` only).
- CLI: `attendance backup [--to DIR] [--keep 30]`; default dir `<data>/backups`. Prints the path.
- Called automatically by `import`, `NewSemester`, and by `store.Open` when `migrate()` is about to add a
  column (detect first, back up, then alter). A failed automatic backup aborts the operation.
- `GET /api/backup` → `{last: <unix or null>, dir}` (reads the directory listing).
- `import` requires `--yes`; without it prints the counts it would delete and exits 1.

### 3.5 Lessons: soft delete, add student, validation (UX-09, FEAT-03, BUG-03, BUG-04)

- Column `sessions.deleted_at real` (nullable), added by the column-sniff pattern.
- **Every** query reading `sessions` adds `deleted_at is null` (`Sessions`, `Session`, `freePara`,
  `StartSession`/`UpdateSession` clash checks, `Student` history, `Retakes`, `Rooms`, students aggregate join).
  Add a test that greps `store/*.go` for `from sessions` / `join sessions` and fails when a query lacks the
  filter, with an explicit allow-list (`Import`, purge, restore).
- `DELETE /api/sessions/{id}` sets `deleted_at`; `POST /api/sessions/{id}/restore` clears it (fails with a
  validation error if the slot was taken meanwhile). Rows deleted more than 30 days ago are purged at start-up.
- `POST /api/sessions/{id}/students {student_id, present}` → `insert or ignore into attendance`; `404` if either
  id is unknown; `GET /api/sessions/{id}` adds `missing: [{id, name}]` (active students not on the roster).
- `cleanPara`: floats must be integral; booleans rejected. `SetAllPresent`: `ErrNotFound` when the session does
  not exist, inside one transaction.

### 3.6 Client structure (ARCH-01, BUG-02, UX-08, BUG-10)

Files and what moves (names stay the same unless noted; every function takes `today`/`now` explicitly where it
currently calls `today()`/`nowTime()`):

| File | Functions |
|---|---|
| `lib/dates.js` | `shiftDay`, `dowOf`, `parseDay`, `inputDay`, `dayText(iso, today)`, `longDay`, `shortDate`, `weekday`, `monthTitle`, `periodKey`, `periodTitle`, constants `WEEKDAYS`, `MONTHS`, `PARA_TIMES` |
| `lib/rules.js` | `canonSubject`, `fmtRoom`, `fmtType`, `isSirtqi`, `isClosedGroup`, `isLecture`, `isIndependent`, `GRADED_BY_OTHERS`, `workSteps`, `defaultSteps`, `normTitle`, `sameWork`, `plainName`, `HOURS_PER_PARA` |
| `lib/timetable.js` | `paraOver`, `lessonContext`, `entriesFor`, `courseGaps`, `nextEntry`, `siteStatus`, `cancelKey` (takes `COURSE` as a parameter) |
| `lib/load.js` | `computeLoad`, `sessionWindows`, `loadPace`, `total`, `verdictText`, `needPct` |
| `lib/ustama.js` | `ustamaOpen`, `ustamaFigure` |
| `lib/plans.js` | `planStage`, `planTaught`, `coveredTopics`, `suggestTopic`, `nextOfClass`, `mergeCarryOver` (the pure part of `carryOver`; returns `{items, dropped}`) |
| `lib/format.js` | `fmtNum`, `pct`, `hrs`, `h1`, `pct1`, `signed`, `noteLessons`, `shortSubject(name, styles)` |

Each file uses the wrapper from `pace.js` (`(function (root) { … root.X = X; if (module) module.exports = X })`)
and exposes one global (`Dates`, `Rules`, `Timetable`, `Load`, `Ustama`, `Plans`, `Format`). `app.js`
destructures them at the top so call sites barely change.

Render token:

```js
let renderId = 0;
async function route() {
  const id = ++renderId, alive = () => id === renderId;
  const render = { alive, show: (...n) => { if (alive()) show(...n); }, rerender: () => keepPlace(() => fn(arg, render)) };
  …
  await fn(arg, render);
}
```

- Every view signature becomes `view(arg, render)` and uses `render.show`; every handler that currently calls
  the view function again calls `render.rerender()`.
- `keepPlace(fn)`: remember `scrollY`, `document.activeElement?.dataset.key`, the set of open
  `details[data-key]`; after `fn` resolves restore them. Give stable `data-key` values to stage buttons, filter
  buttons, details, and row actions.
- The `message` listener and `finish()` in Kabinet call `route()` only if the hash is still `#/kabinet`;
  otherwise they only toast and refresh the badge.
- Roster toggle: a per-row `busy` flag; clicks while busy are ignored; the rollback restores the value read
  before the click.

### 3.7 Sync robustness (REL-02, BUG-09, CQ-04)

- `Syncer.run`: `ctx = context.WithoutCancel(ctx)` before `fetch`; the 70 s timeout stays.
- `Client.lessons`: fetch weeks with a worker pool of 3, keep the output ordered by week.
- `run()` sets `state = "ok"` only if `s.cookie != ""` (or `replacing`); `Status()` reads the DB before locking.
- API errors gain `code`: `oxu_session`, `oxu_wrong_account`, `oxu_no_owner`, `oxu_no_cookie`, `oxu_busy`,
  `oxu_unreachable`, `validation`, `not_found`, `unauthorized`. The client's early-cookie check uses
  `err.code === "oxu_session"`.
- One `slog.Info("oxu background sync", "ok", …, "took", …, "warnings", n)` per run.

### 3.8 Extension (SEC-02)

```js
const DEFAULT_ORIGINS = ["https://davomat.lidersement.uz", "http://127.0.0.1:8766", "http://localhost:8766"];
async function allowed(url) { const o = new URL(url).origin; return (await origins()).includes(o); }
```

- `onMessage`: for `start`, `ready`, `result` drop the message unless `allowed(sender.tab.url)`; `page` only
  from `https://digital.oxu.uz`.
- `ready()` stores the origin only if allowed; `appOrigin()` falls back to the default when the stored value is
  no longer allowed; `loggedIn()` filters `chrome.tabs.query` results through `allowed`.
- `options.html` + `options.js`: a textarea of extra origins (validated as `http://localhost:<port>` or
  `http://127.0.0.1:<port>` or `https://…`), saved in `chrome.storage.local.origins`.
- `manifest.json`: `"options_page"`, version `2.1.0`. Host permissions unchanged.
- README: demo on another port needs its origin added on the options page.

### 3.9 UI changes

Per `09_UI_UX_REDESIGN_SPEC.md`. Files: `web/app.css` (tokens, timetable, roster, toasts, sheet error slot,
age line, unknown chip), `web/app.js` (views), `web/index.html` (favicon link, theme-color, relogin dialog,
script tags), `internal/server/public.go` (date format, filter box, `/public.js`), `internal/server/server.go`
(`isPublic` adds `/public.js` and `/favicon.svg`), `DESIGN.md` (new rules and tokens),
`.impeccable/design.json` (regenerate or delete; it is stale).

## 4. Database changes

| Change | How | Reversible |
|---|---|---|
| `sessions.deleted_at real` | `alter table … add column` when missing, after an automatic backup | column can be ignored by an older binary (it would show deleted lessons again) |
| `settings` keys | none new | – |
| `oxu_snapshot.data` | JSON gains `fetched`, `warnings` | older binary ignores unknown JSON fields |

No table is dropped. `retake_sessions` and `attendance.retake_session_id` stay.

## 5. API changes

| Route | Change |
|---|---|
| `POST /api/login` | new |
| `GET /api/backup` | new |
| `POST /api/semester/new` | new |
| `POST /api/sessions/{id}/students` | new |
| `POST /api/sessions/{id}/restore` | new |
| `GET /api/sessions/{id}` | adds `missing` |
| `DELETE /api/sessions/{id}` | soft delete |
| `GET /api/oxu` | `data.fetched`, `data.warnings` |
| `GET /healthz` | adds `db: true`, `snapshot_age_s` |
| all errors | add `code` (old `error` text unchanged) |
| JSON ≥ 1 KB | `Content-Encoding: gzip` when accepted; `Vary: Accept-Encoding` |
| `/api/retake-sessions*` (6) | removed |

## 6. Testing requirements

See `14_TEST_AND_ACCEPTANCE_CRITERIA.md`. Minimum: all existing tests pass unchanged except those asserting
removed routes; new Go tests for auth, backup, soft delete, new-semester, scraper `fetched` and empty marker;
`webtest/*.test.js` for each `lib` file; golden test for `computeLoad`; `make e2e` green.

## 7. Deployment and migration

1. On the VPS, with the **old** service still running: copy the new binary beside the old one and run
   `attendance-new backup --data /var/lib/davomat`. Verify the file opens (`attendance-new run --data <copy of
   backup dir> --port 9999` locally, or `sqlite3 … "pragma integrity_check"`). Copy it off the server.
2. Compare the live nginx and unit files with `deploy/*.example`; fix `X-Real-IP`, `X-Forwarded-Proto`,
   `proxy_read_timeout`, `ATTENDANCE_SECURE_COOKIE=1`.
3. Stop the service, swap the binary, start. First start adds `sessions.deleted_at` after its own backup.
4. Install the backup timer. Reload the extension (2.1.0).
5. Log in once (rehash to 600 000 happens silently). Existing browser sessions stay valid.
6. Rollback: stop, restore the previous binary; the database is forward-compatible (extra column and JSON
   fields are ignored); soft-deleted lessons reappear under the old binary.

## 8. Backward compatibility

- Old cookies: valid until their embedded expiry. Old `auth.json`: read as is; rewritten only on rehash, same
  fields.
- Old snapshots: `fetched` missing → `synced_at` used for all sections.
- Old extension (2.0.2) with the new server: still works (the server API it depends on is unchanged).
- New extension with the old server: works.

## 9. Implementation order (dependencies)

1. DB-01 backup → 2. OPS-01 → 3. BUG-12 → 4. ARCH-01 (+ golden test) → 5. BUG-01/UX-02 → 6. BUG-06 + SEC-01 →
7. BUG-02/UX-08 + BUG-10 → 8. UX-01 → 9. soft delete/undo + FEAT-03 → 10. FEAT-01 → 11. REL-02/BUG-09/CQ-04 →
12. SEC-02 → 13. remaining UX → 14. P3 batch → 15. TEST-01 and CI (start the e2e script at step 4 and extend it
as pages change). Details in `12_IMPLEMENTATION_TASKS.md`.

## 10. Open questions for the owner

1. The empty-state HTML of the unsaved-lessons page (§3.1).
2. The live nginx and systemd files (to settle SEC-01, SEC-04, REL-02).
3. Whether the VPS provider already takes snapshots, and where off-server backups should go.
4. Is a 7-day idle session acceptable on the classroom laptop, or should it stay 12 h with renewal?
5. Next semester: same group and subject, or a new `COURSE`?
