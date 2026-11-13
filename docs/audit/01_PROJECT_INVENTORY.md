# 01 · Project inventory and inspection coverage

Audit date: 2026-11-11. Commit audited: `a1d748f` (branch `main`, clean tree, 23 commits).
No application file was modified by this audit; only `docs/audit/*.md` was added.

## 1. What the repository is

`attendance`: a single-user web tool for one university teacher. One Go binary serves a JSON API,
an embedded vanilla-JS single-page app and a SQLite database. A read-only scraper pulls the teacher's
data from `digital.oxu.uz`; a Chrome extension hands the site's session cookie to the app.

| Layer | Technology (verified) |
|---|---|
| Language / runtime | Go 1.27.3 (`go.mod`), no cgo for the Linux build |
| Storage | SQLite via `modernc.org/sqlite v1.61.1`, WAL, one connection (`SetMaxOpenConns(1)`) |
| HTML parsing | `golang.org/x/net v0.62.0` (`html` package) |
| Frontend | Vanilla JS, no build step, no framework, no npm dependencies; Public Sans self-hosted |
| Tests | `go test` (4 packages), `node --test` (1 file) |
| Build | `Makefile` (`build`, `linux`, `test`, `demo`, `run`, `clean`) |
| Deploy | systemd + nginx on a VPS (described in `README.md`; **no unit file or nginx config in the repo**) |
| CI | none |

## 2. File inventory (45 tracked files, 10 512 lines excluding fonts and `go.sum`)

| Path | Lines | Role | Read |
|---|---:|---|---|
| `main.go` | 230 | CLI (`run`, `set-password`, `demo`, `import`), embeds `web/`, HTTP server setup | full |
| `internal/auth/auth.go` | 172 | PBKDF2 password hash, HMAC session token, per-IP lockout | full |
| `internal/auth/auth_test.go` | 106 | tests | names only |
| `internal/server/server.go` | 788 | headers, login, static assets, all 51 API routes | full |
| `internal/server/public.go` | 124 | public student page `/q/{token}` | full |
| `internal/server/syncer.go` | 268 | background sync scheduler, cookie file | full |
| `internal/server/*_test.go` | 656 | tests | names only |
| `internal/store/store.go` | 1301 | schema, migrations, students, sessions, retakes, KPI, settings, snapshot | full |
| `internal/store/validate.go` | 161 | input cleaning (`Truthy`, `cleanText`, `cleanPara`, …) | full |
| `internal/store/plans.go` | 192 | lesson plans, course topics | full |
| `internal/store/share.go` | 97 | retake share token | full |
| `internal/store/styles.go` | 82 | subject colours | full |
| `internal/store/importer.go` | 288 | time zone, `Import`, demo `Seed` | full |
| `internal/store/*_test.go` | 567 | tests | names only |
| `internal/oxu/oxu.go` | 757 | scraper for digital.oxu.uz | full |
| `internal/oxu/changes.go` | 108 | sync diff → notifications | full |
| `internal/oxu/*_test.go` | 438 | tests | names only |
| `web/index.html` | 110 | SPA shell, sidebar, 3 dialogs | full |
| `web/app.js` | 2208 | the whole UI: 13 views, routing, all client-side business rules | full |
| `web/pace.js` | 88 | pure pace arithmetic | full |
| `web/theme.js` | 5 | pre-paint theme | full |
| `web/app.css` | 765 | all styles (61 KB) | tokens, media queries, timetable and login sections read; rest scanned by grep |
| `web/fonts/*` | – | Public Sans woff2 ×2 + licence | listed |
| `webtest/pace.test.js` | 90 | 11 tests for `pace.js` | names only |
| `extension/manifest.json` | 44 | MV3 manifest v2.0.2 | full |
| `extension/background.js` | 163 | service worker: cookie hand-off | full |
| `extension/bridge.js` | 22 | content script on app origins | full |
| `extension/site.js` | 29 | content script on digital.oxu.uz | full |
| `README.md`, `PRODUCT.md`, `DESIGN.md` | 257 | docs | full |
| `docs/superpowers/specs/2026-11-10-ui-redesign-design.md` | 52 | approved redesign spec | full |
| `docs/superpowers/plans/2026-11-10-ui-redesign.md` | 132 | its plan | full (long lines truncated at 400 chars) |
| `.impeccable/design.json`, `.impeccable/surfaces/web-app-css.md` | 20 | design tooling state | full |
| `skills-lock.json` | 125 | agent tooling lock | first 40 lines |
| `Makefile`, `go.mod`, `.gitignore` | 59 | build | full |

Untracked / ignored and present on the laptop: `bin/` (two binaries), `data/` (dev database,
`auth.json`, `oxu_cookie`, `first-password.txt`, `attendance.log`), `.claude/skills/`, `.superpowers/brainstorm/`.

## 3. Runtime surface

**Entry point**: `main.go` → `serve()` → `server.New()` + `Syncer.Run()` goroutine.

**HTTP routes** (all in `internal/server/server.go`):

- Public: `GET /healthz`, `GET|POST /login`, `GET /logout`, `GET /app.css`, `GET /theme.js`, `GET /fonts/*`, `GET /q/{token}`.
- Authenticated static: `/`, `/app.js`, `/pace.js`, anything else in `web/`.
- Authenticated API (51 handlers): students (4), sessions (9 incl. `free-para`, `rooms`), KPI marks/progress/steps (4),
  notifications (2), cancelled (2), plans + course topics (3), subject styles (2), KPI works (4), course plan (2),
  semester (2), oxu (5), retakes + share (5), retake sessions (6). **Verified unused by the UI: all six
  `/api/retake-sessions*` routes** (no reference in `web/app.js`).

**SQLite tables** (schema in `store.go:23-73`): `students`, `sessions`, `attendance`, `retake_sessions`,
`kpi_marks`, `kpi_progress`, `kpi_works`, `kpi_steps`, `notifications`, `cancelled_lessons`, `lesson_plans`,
`course_topics`, `settings` (key/value: `oxu_owner`, `course_plan_hours`, `semester_start`, `semester_weeks`,
`retake_share`, `subject_styles`), `oxu_snapshot` (single row, JSON).

**Files in the data directory**: `attendance.sqlite3` (or legacy `davomat.sqlite3`), `auth.json`, `oxu_cookie`.

**Environment**: `ATTENDANCE_DATA`, `ATTENDANCE_BIND`, `ATTENDANCE_PORT`, `ATTENDANCE_PASSWORD`, `ATTENDANCE_SECURE_COOKIE`.

**Background work**: `Syncer.Run` (1-minute ticker; sync every 30 min, 5 h at night); in the browser two
`setInterval` loops every 60 s (`refreshNotes`, `lessonReminder`).

**External integration**: `https://digital.oxu.uz` over GET only, pages listed in `oxu.go`
(`/kabinet.asp`, `/uqituvchi_dars_jadvali.asp?week=N`, `/uqituvchi_saqlanmagan_darslar.asp`, `/mening_yuklamam.asp`,
`/ilmiy/kpi_kabinet.asp`, `/ilmiy/kpi_natijalar.asp`, `/kpi/mening_reytingim.asp`, `/kpi/mening_kpi_oylar.asp`).

## 4. Dead code, duplication, drift (confirmed)

| Item | Evidence |
|---|---|
| Six unused API routes + four store methods | `/api/retake-sessions*` in `server.go:739-787`; `StartRetakeSession`, `RetakeSession(s)`, `AcceptRetake`, `FinishRetakeSession`, `DeleteRetakeSession` in `store.go:1207-1301`. Only `Import` writes `retake_sessions`. An abandoned "retake sitting" feature. |
| Stale design state file | `.impeccable/design.json` still says radius 14 px, ink `#1d1d1f`, accent `#0066cc`; `web/app.css` and `DESIGN.md` say 20 px, `#0068d6`. |
| Plan vs code | `docs/superpowers/plans/2026-11-10-ui-redesign.md` specifies decimal comma and "90 calendar days"; code uses a point and 15 six-day weeks (later commits `a1d748f`, `8508e38`). The plan is historical, not current. |
| Para end times twice | `PARA_TIMES` (`web/app.js:12`) and `paraEnd` (`internal/oxu/changes.go:19`). |
| Course definition three times | `COURSE` (`web/app.js:15`), `store.Paras = {1,2}` (`validate.go:26`), demo seed literals (`importer.go:251-276`). |
| Uzbek month names three times | `web/app.js:5`, `server/public.go:16`, `oxu/oxu.go:639`. |
| Dark-theme tokens twice | `web/app.css:25-37` and `:38-49` are the same block for two selectors. |
| Semester start in two meanings | `oxu.semesterStart` (15 Aug / 20 Jan lower bound, written to `load.start`) vs `settings.semester_start` (default `2026-09-14`). Intentional but undocumented in one place. |
| Comment drift | `app.css:4-5` comment says "near-black for the one primary action"; the token is blue. |

No `TODO`/`FIXME` markers exist. No unused Go dependency (both direct modules are imported).

## 5. Inspection checklist

| Area | Status | Notes |
|---|---|---|
| Go production code (2 919 lines) | **Fully read** | every non-test file |
| Go tests | **Partially** | test names and coverage numbers only; assertions not reviewed line by line |
| `web/app.js`, `pace.js`, `theme.js`, `index.html` | **Fully read** | |
| `web/app.css` | **Partially** | tokens, breakpoints, timetable, login, scale statistics; not every rule |
| Extension | **Fully read** | not executed in a browser |
| Docs | **Fully read** | |
| Test suite execution | **Done** | `go vet`, `go test ./...`, `node --test`: all pass |
| Rendered UI | **Done, headless** | 51 screenshots (see `08_UI_UX_AUDIT.md` §1) |
| Live security probes | **Done, local only** | against scratch instances on 127.0.0.1 |
| Production server, nginx, systemd, TLS | **Not inspected** | not in the repo; no access requested |
| Production database content | **Not inspected** | only a scratch copy of the laptop dev DB was opened |
| digital.oxu.uz live behaviour | **Not inspected** | no request was sent to the site |
| Extension in a real Chrome profile | **Not inspected** | deliberately avoided: it would alter the owner's extension state |
| Dependency vulnerability scan | **Not done** | `govulncheck` is not installed; installing tools was out of scope |
| Performance under load | **Not measured** | single-user tool; reasoning only |
