# 02 · Product analysis

Sources: `PRODUCT.md`, `README.md`, `DESIGN.md`, the code, and the rendered app. Statements marked
**(verified)** were checked in code or on screen; **(stated)** come from the docs only; **(assumed)** are inferences.

## 1. Problem and user

One user: the owner, a trainee teacher at Osiyo Xalqaro Universiteti **(stated)**. The university's site
(`digital.oxu.uz`) is slow and scattered, and money depends on it: unsaved attendance and unfinished monthly
items reduce the bonus (ustama). The app is "one fast place" that joins official data read from the site
with the teacher's private progress the site cannot see.

It is a personal tool. Hard-coding what is true only for the owner is an accepted decision, not a defect
(`PRODUCT.md`). Any recommendation in this audit that removes hard-coding is justified by maintenance cost
or by the semester changing, never by "multi-user readiness".

## 2. Operating moments (stated) and what serves them (verified)

| Moment | Screen | Critical property |
|---|---|---|
| During a lesson, on a laptop | `#/dars/{id}` roster | one click per absent student, type-to-find, no waiting |
| Right before a lesson | `#/` home hero | next lesson, room, countdown, one-click start |
| At the desk later | `#/jadval`, `#/qarzlar`, `#/yuklama` | what is unsaved on the site, retakes, load pace |
| End of month | `#/ustama`, `#/ilmiy-kpi` | open bonus items and days left |

## 3. Capabilities (all verified in code and UI)

1. **Course attendance** for one hard-coded group (`COURSE` in `web/app.js:15`: Algoritmlash, 2-ATT-25,
   Mon–Thu, timetable paras 3 and 4, room K4 / 309). Start a session, toggle present/absent, optional grade
   per student per lesson, topic, finish.
2. **Students**: bulk add by pasted names, rename, archive (no delete), per-student history and statistics.
3. **Debts and retakes**: every absence is a debt until a retake date/time/room is recorded; a secret public
   link (`/q/{token}`) shows students what they owe, with shortened names.
4. **Timetable**: a week grid merging generated course lessons with site lessons; site lessons deep-link to
   the site's attendance page; lessons can be marked "did not happen".
5. **Lesson plans**: topic + up to 20 points + ready flag per date/para; outcome after the lesson; unfinished
   points carry over to the next lesson of the same class; per-subject semester topic list with a rough
   "lessons behind" estimate.
6. **Teaching load**: planned vs taught hours per subject/group/type, pace against the semester calendar
   (six-day weeks), part-time groups measured on their own session window, forecast sentences.
7. **Scientific KPI**: site bands and papers, plus own works stepped through stages until uploaded.
8. **Monthly bonus (Ustama)**: site items with own ticks, custom stages, "cannot be done this month".
9. **Notifications**: diff of two syncs (lessons added/removed, attendance newly missing), in-app list,
   optional browser notifications and a 15-minute lesson reminder while a tab is open.
10. **Sync**: manual cookie paste or Chrome extension hand-off; background sync every 30 min / 5 h at night;
    owner-ID check before and after every sync; data of another account is never stored or shown.
11. **Search palette** (Ctrl+K or `/`) over pages and students; light/dark/auto theme.

## 4. Business rules worth knowing before changing anything

- A teacher has at most one lesson per (date, para); many keys rely on it (`lesson_plans` primary key,
  `planKey`, `unsaved` map keyed `date|para`).
- Course sessions are stored as para 1 or 2 and displayed as 3 or 4 (`COURSE.slotOf`).
- 1 para = 2 hours (`HOURS_PER_PARA`).
- Taught hours are **computed from the schedule**, not read from the site: a site lesson counts as held once
  its para's end time has passed; it counts as "without attendance" if it is on the site's unsaved list.
- A closed group (`_yopildi` in its name) has plan = hours held. A part-time group (all names match `^S\d`)
  is paced over its own first-to-last lesson window, minimum 21 days.
- Estimates carry `~`; the course's 200-hour plan is an owner estimate.
- Money columns of the site are never read (tested: `TestSalaryNeverEntersTheData`).
- The app never writes to the site (tested: `TestSyncNeverOpensAttendancePages`).

## 5. Limitations and gaps

| # | Limitation | Status |
|---|---|---|
| L1 | Status of site lessons is inferred from a snapshot that may be days old; a lesson newer than the snapshot is shown as "taken" | **Confirmed defect**, see BUG-01 |
| L2 | A student added after a lesson was started cannot be put on that lesson's roster | Confirmed (`StartSession` copies the roster once; no API) |
| L3 | Exactly one course group; a second group or the next semester's group shares the same students/sessions tables | Confirmed (no course or semester column) |
| L4 | No export of attendance or grades; `import` exists but is destructive | Confirmed |
| L5 | No backup facility | Confirmed |
| L6 | Notifications and reminders only fire while a tab is open | Stated in README, confirmed in code |
| L7 | The "retake sitting" workflow exists in the API and schema but has no UI | Confirmed dead code |
| L8 | Phone layouts are out of scope | Owner decision; the public `/q/` page and `/login` are the only pages that must work on a phone, and they do (screenshot-verified at 390 px) |
| L9 | Grades are per lesson only; there is no grade scheme, weighting or final mark | Confirmed; **no evidence the owner wants more** |
| L10 | Semester dates default to `2026-09-14`, 15 weeks, in code | Confirmed (`store.go:568`) |

## 6. Edge cases that the code handles well (verified)

Dead session stops the schedule and says so; wrong account is refused twice per sync; a failed section keeps
its previous value with a warning; empty lists are `[]` not `null`; before/after the semester the pace clamps;
zero-plan lines show `–`; marking a student present again clears the whole retake record after a confirm;
a bad new cookie never replaces a working one.

## 7. Operational requirements

- One process, one data directory, behind a TLS reverse proxy that must set `X-Forwarded-Proto` (or
  `ATTENDANCE_SECURE_COOKIE=1`) and **must overwrite `X-Real-IP`** (see SEC-01).
- The laptop database is for development only; the VPS database is the real record (`PRODUCT.md`).
- Server clock must be correct; all "today" logic uses `Asia/Tashkent` (embedded tzdata).
