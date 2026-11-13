# 04 · Code quality audit

> Priorities and remedies in this document were revised after the independent review (`13_FABLE_REVIEW.md`).
> `10_IMPROVEMENT_ROADMAP.md` is the single authoritative list.

Overall: careful, consistent, well-commented code with a clear voice. Comments explain *why*. Error handling
on the Go side is disciplined. The weaknesses are concentrated in the browser file and in loose typing.

## 1. Confirmed bugs

### BUG-01 · A site lesson newer than the last sync is shown as "attendance taken" — P1

- **Evidence**: `siteCard` (`web/app.js:701-711`): `taken = unsaved && past && !unsaved.has(date|para)`.
  `scheduleView.isMissing` (`:1141`), `computeLoad` (`:1229`, `noAtt`/`done`) and `homeView` `gaps` (`:2021`)
  use the same inference. None of them looks at `synced_at`.
- **Reproduced**: scratch copy of the dev database, last sync 6 Nov 12:00, opened on 11 Nov. Lessons of
  9, 10 and 11 Nov render `✓ Olingan` on the home page and timetable (`real-home.png`, `real-jadval.png`),
  although the app cannot know. The load page counts them as taught with attendance.
- **Impact**: the product's first promise is "no lost bonus from unsaved attendance". When the session has
  expired for a day or more, the app affirmatively says everything is saved. It contradicts product
  principles 2 ("be honest about certainty") and 4 ("nothing silently wrong").
- **Fix**: carry `synced_at` into `lessonContext`. A site lesson is *known* only if its date is ≤ the sync's
  Tashkent date and the sync happened after the para ended, or the lesson is on the unsaved list. Otherwise its
  status is `unknown` ("Noma'lum, sinxronlang"), it is not counted in `done`, and it is listed separately
  (`unknownHours`). A lesson that **is** on the unsaved list stays red whatever the data age.
- **Two further holes found by the reviewer and confirmed in code**:
  - *Partial sync*: when the "davomat holati" step fails, `Sync` keeps the previous `Unsaved` list
    (`oxu.go:236-239`, `:266-272`) but `SaveOxu` stamps a fresh `synced_at` (`store.go:624`). The global
    timestamp therefore lies about that section. The fix needs a per-section fetched-at time inside `oxu.Data`.
  - *Markup drift*: `parseUnsaved` (`oxu.go:389-417`) returns an empty list when no 8-cell table is found, which
    is also what a changed page layout produces; every past lesson then turns "Olingan ✓". It needs a positive
    marker for the genuine empty state, otherwise a warning that keeps the old list.
- Detailed contract in `11_NEXT_VERSION_SPEC.md` §3.1.

### BUG-02 · Stale asynchronous renders can overwrite the current page — P2

- **Evidence**: `route()` (`app.js:212-230`) awaits `fn()` and the view calls `show()` whenever its fetches
  resolve; there is no generation counter. Views are also re-invoked after awaits from event handlers:
  `cabinetView` `finish()` after a sync that can take a minute (`:1486-1490`), `retakesView()` after accept
  (`:567`), `lessonView(id)` after a settings save (`:423`), `monthsView()`, `kpiView()`, `studentView(id)`.
- **Scenario**: press "Hozir sinxronlash" in Kabinet, go to the lesson roster to take attendance; when the
  sync returns, `cabinetView()` replaces the roster with Kabinet while the hash still says `#/dars/…`.
- **Fix**: a render token: `route()` increments `renderId`; `show()` is replaced by a per-render `show` that
  drops calls whose token is stale; handlers call `rerender()` (which goes through the token) instead of the
  view function.

### BUG-03 · `cleanPara` accepts non-integers and booleans — P3

`validate.go:74-101`: `1.9` → `1` (verified: `POST /api/sessions {"para":1.9}` created para 1), `true` → `1`.
Fix: require `t == math.Trunc(t)`; drop the `bool` case.

### BUG-04 · `SetAllPresent` succeeds for a session that does not exist — P3

`store.go:1099-1102` ignores `RowsAffected` (verified: `POST /api/sessions/99999/all-present` → `{"ok":true}`).
A session with zero students also affects zero rows, so check existence first, inside one transaction.

### BUG-05 · A student cannot be added to an existing session — P2

`StartSession` inserts the active roster once (`store.go:920`). A student added or un-archived later has no
attendance row for earlier or in-progress sessions and no endpoint creates one. In the classroom this means a
late-enrolled student cannot be marked on today's already-started lesson. Fix: `POST
/api/sessions/{id}/students {student_id, present}` (insert-or-ignore) and a "Talaba qo'shish" row under the
roster listing active students not on it.

### BUG-06 · Session expiry throws the owner out mid-work, without any action on their part — P1

Tokens live a fixed 12 h (`auth.go:25`, `NewSession`), never renewed. `api()` (`app.js:143-152`) does
`location.href = "/login"` on any 401, and the background poll `setInterval(refreshNotes, 60000)`
(`app.js:1932`) goes through `api()`. So within 60 s of expiry an open tab is redirected by itself, including
in the middle of roll call (raised from P2 by the reviewer; confirmed). A lesson plan or topic list being typed in an open sheet is lost.
Fix: sliding renewal (re-issue the cookie when less than half the lifetime is left) and, on 401, keep the page
and show a re-login prompt that returns to the same hash.

### BUG-07 · Non-atomic compound writes — P3

- `PUT /api/sessions/{sid}/students/{st}` applies `present` then `grade` as two statements (`server.go:479-499`).
- `monthsView` `saveStep` and `skip` send `kpi-progress` then `kpi-marks` as two HTTP requests
  (`app.js:1768-1777`, `:1801-1808`); a failure between them leaves a finished stage without its tick.
- **Fix**: one transaction per request; make `PUT /api/kpi-progress` own the tick (server derives `done` from
  `step == len(steps)`), or accept `{period,item,step,done}` in one call.

### BUG-08 · "Kurs rejasi" lists a subject once per group although topics are per subject — P3

`plansView` builds `classes` keyed `subject|group` (`app.js:1060-1065`) but `course_topics` is keyed by subject
only. Result on real data: nine rows for one subject, each with its own "Kiritish" button that edits the same
list (`real-reja.png`). The raw closed-group name `23-OHI-26_yopildi_24.09.2026` is shown. Fix: one row per
subject with its groups listed beneath; strip `_yopildi.*` as `computeLoad` already does.

### BUG-09 · Syncer state edge cases — P3

- `Forget()` during a running sync: `run()` later sets `state = "ok"` with an empty cookie (`syncer.go:162-221`).
- A manual sync whose client disconnects cancels `r.Context()`; the error falls into the generic branch and
  marks the saved cookie's state `error` (`:208-212`).
- `Status()` holds the mutex while doing two DB reads (`:102-118`).
- Fix: re-check `s.cookie != ""` before setting `ok`; treat `context.Canceled` as "no result"; read the DB
  before taking the lock. All three disappear if sync becomes a background job (REL-02).

### BUG-10 · Rapid toggles can land out of order — P2

`lessonView` `toggle()` (`app.js:344-350`) is optimistic with rollback but does not serialise requests per
student; two quick clicks issue two PUTs whose arrival order is not guaranteed. Fix: per-row in-flight guard
(ignore clicks while a request for that row is pending) or a per-row request queue.

### BUG-12 · False "attendance missing" alerts after the semester ends — P1 (from 28 December 2026)

`entriesFor` (`app.js:790-801`) creates a course lesson for every Mon–Thu on or after the first session, with
no end; `courseGaps` (`:807-813`) lists every such lesson up to today that has no finished session. Once the
15 weeks are over (26 December with the current settings) the home page gains two urgent items per teaching
day, forever, and `nextEntry` keeps announcing lessons that will not happen. Found by the reviewer; confirmed.
Fix: generate course lessons only for dates within `[semester.start, Pace.semester(...).end]`; sessions that
exist outside the range still show.

### BUG-13 · `carryOver` silently drops plan points beyond 20 — P3

`[...add, ...there.items].slice(0, 20)` (`app.js:926`) discards the tail without telling the user. Fix: refuse
the carry-over with a message naming how many points did not fit.

### BUG-11 · Small UI defects — P3

- `/favicon.ico` returns 404 on every page load (console error in all screenshots' metrics).
- Unknown hashes silently redirect to home (`route()`, last line).
- "Oylar tarixi" prints site month names without a year; two "Fevral" rows are indistinguishable (`real-ustama.png`).
- The "Bu hafta" button restores focus to "Keyingi hafta" (`move(0, "Keyingi hafta")`, `app.js:1190`): intended
  because the button becomes disabled, but a comment is missing and it reads as a typo.

## 2. Technical debt and quality observations

| ID | Observation | Evidence | Priority |
|---|---|---|---|
| CQ-01 | Very long lines (200–400 chars) and dense one-liners in `app.js` and `app.css` make diffs and review hard | throughout; e.g. `app.js:1158`, `:1235` | P3 |
| CQ-02 | Views are 100–150-line functions that fetch, compute and render | `homeView` 155 lines, `monthsView` 163, `loadView` 136 | P2 (solved by ARCH-01) |
| CQ-03 | Regex-driven domain rules scattered in views: `/yopildi/`, `/^S\d/`, `/ma.ruza/`, `/mustaqil/`, `GRADED_BY_OTHERS`, `workSteps`, `defaultSteps` | `app.js:1208`, `:1247`, `:1241`, `:1710`, `:1599`, `:1700` | P2: collect in one `rules.js` with tests |
| CQ-04 | Error identification by message prefix | `err.message.startsWith("Sessiya tugagan")` (`app.js:1471`) | P2: return a machine code `{error, code}` |
| CQ-05 | Ignored errors | `flags.Parse` result, `json.Marshal` in `NewRetakeShare`, `publicTmpl.Execute`, `gzip.NewWriterLevel` | P3 |
| CQ-06 | `Truthy`/`str` Python-compat semantics (`"True"`) kept after the port | `validate.go:29-61` | P3, goes away with ARCH-03 |
| CQ-07 | Silent truncation | `POST /api/students` drops names after 500 without saying so (`server.go:388`) | P3 |
| CQ-08 | No `gofmt`/lint gate, but the code is gofmt-clean and `go vet` passes | verified by running | – |
| CQ-09 | Hard-coded dates | `store.go:568`, `importer.go:87` | P2 (ARCH-06) |
| CQ-10 | `localStorage` keys un-namespaced: `theme`, `lastNote`, `reminded` | `theme.js`, `app.js:1915`, `:1947` | P3 |

## 3. Naming, readability, consistency

- Go naming is idiomatic. Two vocabularies coexist for the same thing: "session" in code and API
  (`/api/sessions`, `sessions` table) versus "dars/lesson" in the UI and comments; and "para" means both the
  stored 1–2 and the timetable 1–9. This is the main source of reader confusion; document it at the top of
  `store.go` and name the two `appPara` / `slot` consistently in JS (the code already does so in places).
- Uzbek user-facing strings are inline in both Go and JS. Acceptable for a single-language tool.
- API shape is consistent: `{error: "…"}` on failure, `{ok: true}` on success, arrays never `null` (tested).

## 4. Type safety

Go: weak at the HTTP boundary (ARCH-03), strong elsewhere. JS: none; mitigated only by tests, which cover
4 % of the JS. JSDoc typedefs for the five central shapes (`Entry`, `Line`, `Ctx`, `Plan`, `Session`) plus
`// @ts-check` in the new `web/lib/*.js` files give editor-level checking with no build step.
