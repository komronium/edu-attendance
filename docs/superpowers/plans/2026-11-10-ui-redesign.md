# UI Redesign and Teaching-Load Pace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole app the "Sokin" look, rebuild the home, timetable and teaching-load pages, and show whether the teacher is ahead of or behind the semester.

**Architecture:** Pace arithmetic lives in a new dependency-free `web/pace.js` (browser global + CommonJS export) so it can be unit-tested with `node --test`. The semester (start date, length) is one more key in the `settings` table behind `GET/PUT /api/semester`. Views in `web/app.js` consume both; the look changes through tokens and components in `web/app.css`.

**Tech Stack:** Go 1.x + SQLite, vanilla JS (no build), CSS custom properties, `node --test` for the pure JS helpers.

**Spec:** `docs/superpowers/specs/2026-11-10-ui-redesign-design.md`. Mockups: `.superpowers/brainstorm/23286-1794347160/content/redesign-v1.html` (content) and `visual-directions.html`, variant `.A` (look).

## Global Constraints

- Strict CSP: no inline `style=""`/`<script>`, no third-party hosts. Dynamic sizes only via `el.style.setProperty("--x", v)`.
- Interface text is Uzbek; reuse existing terms (dars, para, davomat, yuklama, ustama, reja). Decimal comma in new pace numbers ("61,8%").
- Any sum that includes the course's estimated plan keeps the `~` prefix.
- Desktop only; light and dark themes both.
- Default semester: start `2026-09-14`, `90` calendar days; day 1 is the start date.
- No saturated multi-colour surfaces; subject colours stay limited to timetable and load.
- Starting attendance from the home page stays one click.

## Review Focus

1. Load not synced (`data.load` missing): home pace card and load page must show their empty states, not `NaN`.
2. Today before the semester start or after its end: day number clamps to 0..days, expected hours clamp to 0..plan, "days left" never negative.
3. Plan of 0 hours (a line or a whole type): percentages show "–", no division by zero.
4. No lessons this week / no finished course sessions: week bars and attendance card render an empty note.
5. All groups closed: pace comparison shows "–" rather than a verdict.

Tests for 2, 3 and 5 belong to Task 2 (`webtest/pace.test.js`); 1 and 4 are checked by screenshot in Task 8 with the demo database (which has no load).

---

### Task 1: Semester setting (store + API)

**Files:** Modify `internal/store/store.go` (next to `CoursePlanHours`), `internal/server/server.go` (next to `/api/course-plan`); Test `internal/store/store_test.go`.

**Interfaces — Produces:**
- `type Semester struct { Start string `json:"start"`; Days int `json:"days"` }`
- `func (s *Store) Semester() (Semester, error)` — defaults `{"2026-09-14", 90}` when unset.
- `func (s *Store) SetSemester(start string, days any) error` — settings keys `semester_start`, `semester_days`.
- `GET /api/semester` → `{"start":"2026-09-14","days":90}`; `PUT /api/semester` body `{start, days}` → `{"ok":true}`.

- [ ] **Step 1: failing test** `TestSemester` in `store_test.go`:
  - fresh store → `Semester()` equals `{Start:"2026-09-14", Days:90}`
  - `SetSemester("2027-02-08", 100.0)` then `Semester()` equals `{"2027-02-08", 100}`; `SetSemester("2027-02-08", "95")` → days 95
  - `wantInvalid(t, s.SetSemester("14.09.2026", 90.0), "sana noto'g'ri")`
  - `wantInvalid(t, s.SetSemester("2026-09-14", 5.0), "kunlar 30 va 200 orasida bo'lsin")`, same for `"abc"`
- [ ] **Step 2:** `go test ./internal/store -run TestSemester` → FAIL (undefined).
- [ ] **Step 3:** implement both methods (date check with the store's existing date validator) and the two handlers.
- [ ] **Step 4:** `make test` → PASS.
- [ ] **Step 5:** commit `Semester start and length setting`.

### Task 2: Pace helpers

**Files:** Create `web/pace.js`, `webtest/pace.test.js`; Modify `web/index.html` (script tag before `app.js`), `Makefile` (`test` also runs `node --test webtest/`).

**Interfaces — Produces** (global `Pace`, also `module.exports`):
- `Pace.dayNumber(startISO, days, todayISO) -> int` — 1 on the start date, clamped to `0..days`.
- `Pace.fraction(startISO, days, todayISO) -> number` — `dayNumber / days`.
- `Pace.summary(lines, fraction) -> { plan, held, left, pct, expected, diff, ofExpected }` — `lines` are `computeLoad` lines (`{plan, done, noAtt, closed}`); `held = done + noAtt`; closed lines are excluded from `expected`/`diff` (their plan equals held); `pct`, `ofExpected` are `null` when the divisor is 0; `expected`, `diff` are `null` when no open line has a plan.
- `Pace.byType(lines) -> Map<type, lines[]>` in first-seen order.
- `Pace.weekly(held, left, dayNumber, days) -> { current, required, projected }` — hours per 7 days so far, hours per 7 days needed for the rest (`null` when no days left), `held + current/7 * daysLeft`.
- `Pace.fmt1(v) -> string` — one decimal, decimal comma, `"–"` for `null`.

- [ ] **Step 1: failing tests** (`node:test`, `node:assert`):
  - `dayNumber("2026-09-14", 90, "2026-09-14") === 1`; `"2026-11-10"` → `58`; `"2026-09-01"` → `0`; `"2027-01-01"` → `90`
  - `summary([{plan:120,done:70,noAtt:4,closed:false},{plan:220,done:136,noAtt:0,closed:false}], 0.656)` → `plan 340, held 210, left 130`, `fmt1(pct) === "61,8"`, `fmt1(expected) === "223,0"`, `fmt1(diff) === "-13,0"`, `fmt1(ofExpected) === "94,2"`
  - `summary([{plan:0,done:0,noAtt:0}], 0.5).pct === null`
  - `summary([{plan:10,done:10,noAtt:0,closed:true}], 0.5)` → `expected === null`, `diff === null`
  - `weekly(210, 130, 59, 90)` → `fmt1(current) === "24,9"`, `fmt1(required) === "29,4"`, `Math.round(projected) === 320`; `weekly(10, 5, 90, 90).required === null`
  - `fmt1(null) === "–"`, `fmt1(61.75) === "61,8"`
- [ ] **Step 2:** `node --test webtest/` → FAIL.
- [ ] **Step 3:** implement `web/pace.js`.
- [ ] **Step 4:** `make test` → PASS.
- [ ] **Step 5:** commit `Pace helpers for the teaching load`.

### Task 3: Look and shell

**Files:** Modify `web/app.css` (tokens, controls, frame, cards, chips, tiles), `web/index.html` (sidebar groups), `web/app.js` (remove the Kurs collapse: `setCourseOpen`, `course-toggle`; keep `owed-badge`), `internal/server/server.go` only if the login page markup needs the new classes.

- [ ] **Step 1:** tokens. Light: `--bg #f5f5f7`, `--surface #fff`, `--side #ececef`, `--line #ececf0`, `--muted #6e6e73`, `--accent #0071e3`, `--accent-soft #e3f0fd`, `--ink` = accent (`--ink-text #fff`), `--ok #1d8a44`, `--bad #d70015`, `--warn #9a5b00`, `--r-lg 20px`, `--r-md 12px`, `--shadow 0 1px 2px rgb(0 0 0/.04), 0 8px 24px rgb(0 0 0/.04)`, card padding 24px. Dark: keep the current dark ground, `--ink` = dark accent with dark text, shadow `0 1px 2px rgb(0 0 0/.5)`. Add `--hero` (light `linear-gradient(135deg,#eaf3fe,#f4f0ff)`, dark `linear-gradient(135deg,#13243a,#1d1a33)`).
- [ ] **Step 2:** sidebar: `nav.tabs` holds Bosh sahifa, Dars jadvali, Dars rejasi; then `<p class="nav-label">Hisobot</p>` Yuklama, Ilmiy KPI, Ustama; `Kurs · 2-ATT-25` Darslar, Talabalar, Qarzlar (badge `#owed-badge`); `Tizim` Bildirishnomalar, Kabinet. Active item: white surface with the card shadow. Remove `#course-group`, `#owed-badge-group` and their JS.
- [ ] **Step 3:** verify: `make demo`, screenshot `#/`, `#/darslar`, `#/talabalar`, `#/qarzlar`, `#/reja`, `#/ilmiy-kpi`, `#/ustama`, `#/kabinet`, `#/bildirishnomalar`, `/login` in light and dark; no console errors, nothing clipped.
- [ ] **Step 4:** commit `Sokin look: tokens, grouped sidebar`.

### Task 4: Teaching load page

**Files:** Modify `web/app.js` (`loadView`), `web/app.css` (teaching load section).

**Interfaces — Consumes:** `Pace.*`, `GET /api/semester`. **Produces:** `loadPace(data, sessions, coursePlan, cancelled, semester) -> { lines, all, types: [{type, sum}], day, days, daysLeft, weekly, est }` in `app.js`, reused by the home page (Task 5); `paceBar(pct, expectedPct)` and `verdictText(diff)` (`"12,9 soat orqadasiz"`, `"3,0 soat oldindasiz"`, `"Rejada"` within ±1 para, `""` when `null`).

- [ ] **Step 1:** implement `loadPace` and the page per spec goal 4: lead card (big % + verdict + sentence, bar with marker, done/left/plan), type cards + "Oxirigacha", forecast list (omit lines that do not apply), table with added columns `%` (one decimal), `Bugungacha kerak`, `Farq`; keep `Davomatsiz`, `Jadvalda`, the editable course plan, the notes. Semester line in the page sub-title with a link to Kabinet.
- [ ] **Step 2:** verify against a copy of `./data` run with `demo`-style no-login is not available, so: copy `data/attendance.sqlite3` to the scratchpad, run `attendance run --data <copy>` with a fresh `set-password`, log in with headless Chrome, screenshot `#/yuklama` light and dark. Numbers must add up: type cards sum to the lead card; `Farq` column sums to the lead difference (open lines).
- [ ] **Step 3:** commit `Yuklama: lecture and practical split, semester pace, forecast`.

### Task 5: Home page

**Files:** Modify `web/app.js` (`homeView`, `nextHero`), `web/app.css` (home section).

**Interfaces — Consumes:** `loadPace`, `GET /api/students` (`lessons`, `missed`, `active`), sessions (`came`, `total`, `finished_at`, `date`).

- [ ] **Step 1:** header semester marker; lead card (tinted band + today's compact rows + footer); attention card with `Shu hafta` group (urgent = existing "alert" items; the rest go under the group label).
- [ ] **Step 2:** three cards: `Semestr sur'ati` (ring via two SVG circles, `stroke-dasharray` set as attributes), `Bu hafta` (bars Mon..Fri(+Sat/Sun when lessons exist): held hours solid, upcoming soft), `Davomat · <group>` (mean of `came/total` over finished sessions, last 7 days vs the 7 before, students with `missed/lessons >= .25` and `lessons >= 4`). Each has an empty note when its data is missing.
- [ ] **Step 3:** tile strip: Ustama, Ilmiy ball, `Bu oy o'tildi`, `Olinmagan davomat`.
- [ ] **Step 4:** verify with demo and with the real-data copy, light and dark; "Davomatni boshlash" still one click.
- [ ] **Step 5:** commit `Home: today card, semester pace, week and attendance`.

### Task 6: Timetable

**Files:** Modify `web/app.js` (`scheduleView`, `cardLines`/`state` only as needed), `web/app.css` (timetable section).

- [ ] **Step 1:** slot: 3px left edge in the subject colour, status as plain coloured text (`ok` green, `warn` → red for missing attendance, accent for plan/active), no pill; taken course lessons show `came/total`.
- [ ] **Step 2:** header summary (`N ta dars · N soat · N ta o'tildi · N ta davomatsiz`), per-day totals row (`tfoot`), `tr.quiet` rows 44px high, today column lightly tinted.
- [ ] **Step 3:** verify demo + real copy, light and dark, previous/next week, a week with no lessons.
- [ ] **Step 4:** commit `Timetable: clearer status, weekly and daily totals`.

### Task 7: Warnings, reminder, Kabinet, docs

**Files:** Modify `web/app.js` (`homeView` tasks, `cabinetView`, a `lessonReminder()` next to `refreshNotes`), `DESIGN.md`, `README.md` (one line on the reminder), `.gitignore` (`.superpowers/`).

- [ ] **Step 1:** attention items: `Yuklama N soat orqada` (when `diff <= -2`), `N talaba darslarning 25% dan ko'pini qoldirgan` → `#/talabalar`.
- [ ] **Step 2:** `lessonReminder()`: every 60 s, when `Notification.permission === "granted"` and a lesson today starts in 15 minutes or less and has not been announced (`localStorage` key `reminded` = `date|para`), show `"<Fan> 15 daqiqadan keyin"` with group and room; click focuses the window and opens `#/`.
- [ ] **Step 3:** Kabinet: "Semestr" card with start date (existing `dateField`) and days, saved to `PUT /api/semester`.
- [ ] **Step 4:** rewrite `DESIGN.md` to the new tokens/components; commit `Pace and absence warnings, lesson reminder, semester in Kabinet`.

### Task 8: Whole-app check

- [ ] `make test` passes.
- [ ] Screenshots of every route in both themes, demo and real-data copy, reviewed for clipping, contrast (text ≥ 4.5:1), and the Review Focus items 1 and 4.
- [ ] Fix what the review finds; commit.
