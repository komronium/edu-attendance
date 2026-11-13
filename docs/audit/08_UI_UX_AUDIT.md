# 08 · UI/UX audit

## 1. How the interface was inspected

The app was **rendered and looked at**, not judged from source alone.

- Two local instances built from commit `a1d748f`: `attendance demo --no-login` (invented students and
  lessons, no site data) and `attendance run` on a **scratch copy** of the laptop dev database (real synced
  timetable, load, KPI and bonus data from 6 Nov; no students). No request went to digital.oxu.uz.
- Headless Chrome driven over the DevTools protocol by `screenshots/shoot.mjs.txt`: 51 captures across 13
  routes, light and dark, at 1440×900, 1280×720, 1024×768, and 390×844 for the public page.
- For each capture a script measured horizontal overflow, clipped text, text below 12 px, interactive targets
  under 24 px, unlabeled controls, console errors and contrast of text on **solid** backgrounds.
- 16 screenshots were examined by eye; 34 are stored in `docs/audit/screenshots/`.

**Limits, stated plainly**

- Not seen with real students (the dev database has none); roster findings come from 18 demo students.
- Hover, focus rings, transitions and keyboard flows were read from CSS/JS, not watched.
- Contrast on gradient or `color-mix` surfaces (the hero band, timetable cards) was **not** measured.
- The Chrome extension's badge and tab choreography were not run.
- No real phone, no screen reader, no Firefox/Safari.
- Screenshots named `real-*` contain the owner's own schedule; `real-kabinet` was left out because it shows the
  account ID. Decide before committing the folder.

## 2. Overall impression

The "Sokin" redesign of 10 November is coherent and above the usual standard for a personal tool: one clear
lead per page, quiet neutrals, a single accent, disciplined tables, consistent Uzbek terminology, real empty
states, a working dark theme, visible focus styles, skip link, `aria-current`, labelled dialogs. The audit
found **no reason to change the visual direction**. The problems are about truthfulness of status, behaviour at
laptop widths, density in the classroom view, and a number of small inconsistencies.

## 3. Findings

Each finding: current → problem → harm → recommendation. Requirements and acceptance criteria are in
`09_UI_UX_REDESIGN_SPEC.md` under the same ID.

### UX-01 · Timetable cards clip their status and room at laptop widths — P1

- **Current**: at 1280 px the last line of a card reads `K4 / 309  Olinmagar` (cut), future cards read
  `K4 / …  Reja yo'q`, subject names end `Bulutli texnolo…`; at 1024 px it is worse
  (`real-jadval-1280.png`, `real-jadval-1024.png`). At 1440 px names are still truncated
  (`Bulutli texnologi…`) while Friday's column is almost empty (`real-jadval.png`).
- **Problem**: six equal columns in `table-layout: fixed` (`app.css:230`), a fixed 86 px card height (`:240`),
  one-line name, and room + status forced onto one line.
- **Harm**: the status is the most important word on the card and it is the one that gets cut; the owner's
  classroom laptop is most likely 1366 or 1280 wide.
- **Recommendation**: status first and never truncated; room may wrap to its own line or drop to a tooltip
  below 1366 px; name may take two lines; card height becomes `min-height`.

### UX-02 · Data age is not visible where it matters; old data is presented as fact — P1

- **Current**: with a snapshot five days old, the timetable, home and load pages look exactly as with a fresh
  one. The only hints are a 12 px grey line at the bottom of the sidebar (`Sinxronlangan: 6-noyabr 12:00`) and a
  generic alert. Lessons after the sync show `✓ Olingan` (BUG-01).
- **Harm**: breaks the product's own principle 4; the owner may skip saving attendance on the site.
- **Recommendation**: every page fed by the site shows the snapshot age in its header when older than 2 h
  (amber) or 24 h (red), with a "Sinxronlash" action; unknown lessons get a neutral `Noma'lum` status.

### UX-03 · Home "attention" card: stretched, and the sync warning is said three times — P2

- **Current**: the attention card is stretched to the hero's height and is two-thirds empty
  (`real-home.png`, `demo-home.png`). "Avtomatik sinxronlash o'chiq" appears as a red urgent item, again in the
  sidebar, again on Kabinet. With no cookie ever entered (state `none`) it is still "urgent".
- **Harm**: empty space on the page's most valuable row; a permanent red item trains the eye to ignore red.
- **Recommendation**: the card takes its content height and the freed space shows the day's lessons list
  beside the hero (or the card caps at content and aligns to top); state `none` is informational, `expired`
  and `wrong_account` are urgent; the sidebar keeps the single persistent indicator.

### UX-04 · Lesson roster is not dense enough for the classroom — P2

- **Current**: 48 px rows; 18 students need 1 224 px; at 1280×720 nine rows are visible
  (`demo-dars-1280.png`). Every row carries a bordered grade box showing `–`. The page title is the date; the
  para, the start **timestamp** (`3-para · 19:54`) and the state chip sit apart from each other.
- **Harm**: scrolling during roll call; visual noise from 18–30 identical empty boxes; the header answers
  "when did I click start" rather than "which lesson is this".
- **Recommendation**: 40 px rows by default and a two-column roster at ≥ 1440 px for groups over 16; grade
  input rendered as plain `–` text until hovered/focused or filled; header: `Algoritmlash · 2-ATT-25` as title,
  `11-noyabr, chorshanba · 3-para · 11:30–12:50 · K4 / 309` as subtitle with the state chip next to the title.

### UX-05 · Teaching-load page ends in a wall of small explanatory text — P2

- **Current**: three paragraphs, about 170 words, at 13 px under the table (`real-yuklama.png`); table
  mini-bars are 46 px wide with a 2 px marker; the same definitions are also in column tooltips.
- **Harm**: the definitions are important exactly once; afterwards they push the page 200 px longer and make
  it look unfinished.
- **Recommendation**: a collapsed "Qanday hisoblanadi?" disclosure with a short definition list; bars at
  least 96 px in the table.

### UX-06 · "Kurs rejasi" repeats one subject nine times — P2

See BUG-08 (`real-reja.png`). One row per subject; groups as secondary text.

### UX-07 · Form errors appear only in a toast — P2

- **Current**: every failure goes to `#msg`, a toast at the bottom (`say()`, `app.js:154`). Error toasts stay
  until clicked; inside a modal sheet the toast is outside the dialog's top layer context and may sit behind
  the backdrop. Fields are not marked invalid (only the date field sets `aria-invalid`).
- **Harm**: in a sheet the user may not see why "Saqlash" did nothing.
- **Recommendation**: sheet forms show the error inline above the action row (`role="alert"`), and mark the
  offending field when the server names it; toasts remain for page-level results.

### UX-08 · Whole-page re-render after small actions loses position — P2

Accepting a retake, ticking a bonus stage, saving a subject colour or changing a filter re-runs the view and
replaces `#view` (ARCH-08). Scroll position, focus and open `<details>` are lost; on the bonus page a stage
click near the bottom jumps the reader. Recommendation: preserve `scrollY`, focused element (by a stable
`data-key`) and open details across same-route re-renders.

### UX-09 · Destructive actions have a confirm but no undo — P2

Deleting a lesson removes its attendance, grades and retakes for good (DB-04); "Hammasi keldi" wipes retake
records. Confirms are well worded. Recommendation: undo toast for lesson deletion (10 s).

### UX-10 · Dark theme: white on `--bad-solid` is 4.46:1 — P3

Measured on the sidebar badge and the `Kelmadi` button (`#fff` on `#e0352b`, 12–13 px). Needs ≥ 4.5.
Use `#d93025` (4.78:1).

### UX-11 · Type and radius scales leak — P3

Five size tokens exist (`--t-xs … --t-xl`) but ten display sizes are written literally (1.125, 1.25, 1.375,
1.5, 1.625, 2, 2.375, 2.5, 2.75, 3.5, 4 rem). Radii 1, 2, 3, 4, 5, 6, 9 px appear next to the three tokens.
Dark tokens are duplicated in two blocks. Recommendation: add display tokens and `--r-xs`; one source for the
dark values.

### UX-12 · Small targets — P3

Inline row links are 17 px tall, sort buttons 22×24, the plan-hours button 32×23, the "o'zgartirish" link
15 px. Rows themselves are clickable, so this is minor on a desktop; raise the three standalone ones to 28 px.

### UX-13 · Bonus history has no year — P3

Two "Fevral" entries (`real-ustama.png`). Show the year when the list spans more than one, or group by
academic year.

### UX-14 · Missing favicon and app identity — P3

`/favicon.ico` 404 on every load; no `theme-color`; the tab shows a blank icon. Use the existing check-mark
logo as an SVG favicon.

### UX-15 · Command palette covers pages and students only — P3

It cannot run the two most frequent actions. Add "Davomatni boshlash" (when a course lesson is now or next
today) and "Hozir sinxronlash".

### UX-16 · Public student page — P3

Works at 390 px with no overflow (`demo-public-mobile.png`) and reads well. Three small points: the date is
`11.11.2026 20:56 holatiga` while the app writes `11-noyabr`; with 30 students a student scrolls a long list
to find their name (add a filter box; needs one small script file, allowed by the CSP); the "Topshirilgan"
tile counts lessons while its neighbours count students and lessons, with no unit.

### UX-17 · Kabinet mixes three jobs — P3

Sync control, a four-tile overview that duplicates the home page, and the semester form
(`demo-kabinet.png`). The overview tiles add nothing the home page lacks. Remove them; Kabinet becomes
"Sinxronlash" + "Sozlamalar" (semester, course, backup status).

## 4. Accessibility review (code + automated metrics)

**Good**: `lang="uz"`; skip link; landmarks (`aside`, `nav[aria-label]`, `main`); one `h1` per view; tables
with `scope`; `aria-sort` on sortable headers; `aria-pressed` on toggles; `role="status"`/`aria-live` on the
attendance count; native `<dialog>` with labels; `prefers-reduced-motion` respected; `:focus-visible` ring;
no text under 12 px found; no horizontal overflow at any tested width; all automatically checked solid-colour
text pairs pass in light mode.

**Issues**

| ID | Issue | Evidence | Priority |
|---|---|---|---|
| A11Y-1 | The hidden native date input is focusable by assistive tech and unlabeled (`aria-hidden` + `tabindex=-1` on a real input) | `dateField`, `app.js:114`; flagged "unlabeled" on 6 pages | P3 |
| A11Y-2 | Clickable table rows (`tr.tap`, `tr.link`) are mouse-only; the keyboard path is the link or button inside, which exists, but the plans table row has only a chip button as its target | `app.js:1041` | P3 |
| A11Y-3 | Status in the timetable is colour + word (good) but "attendance taken" is also encoded only as a darker tint | `DESIGN.md` `.slot` | P3 |
| A11Y-4 | `#msg` uses `role="alert"` for success and error alike | `index.html:88` | P3: `role="status"` for success |
| A11Y-5 | Dark contrast 4.46:1 (UX-10) | measured | P3 |
| A11Y-6 | Single-letter global shortcut focuses the roster search; fine, but it is undocumented and cannot be turned off | `app.js:2194` | P3 |

## 5. Page-by-page notes

| Page | Verdict | Notes |
|---|---|---|
| Login | Good | centred card, error under the button, works in dark; no "show password" (acceptable) |
| Bosh sahifa | Good, with UX-02, UX-03 | hero reads from across a room; three stat cards are balanced; bottom tile strip repeats Kabinet |
| Dars jadvali | Good at 1440, **broken at ≤ 1280** (UX-01) | legend is also the colour editor (discoverable only by a tooltip); week navigation by arrow keys works |
| Dars rejasi | Good, with UX-06 | plan sheet is clear and keyboard-friendly (Enter adds, Ctrl+Enter saves) |
| Yuklama | Good, long (UX-05) | the lead card answers the owner's question in one glance; `~` marks estimates consistently |
| Ilmiy KPI | Good | stage buttons, site link-up by title |
| Ustama | Good | dense but legible; UX-08 and UX-13 apply |
| Darslar | Good | month groups, right rail to start a lesson |
| Dars (roster) | Functional, see UX-04 | type-to-find + Enter is excellent |
| Talabalar / Talaba | Good | sortable; nine numeric columns are a lot, but aligned and tabular |
| Qarzlar | Good | master list + filters; "Qabul qilish" sheet pre-fills date, time, room |
| Bildirishnomalar | Good | lessons listed one per line |
| Kabinet | Adequate (UX-17) | cookie instructions are technical but accurate |
| `/q/{token}` | Good on a phone (UX-16) | |

## 6. Responsiveness

Owner's decision: desktop only. The audit therefore asks for exactly this and no more:
correct layout from **1024 to 1920 px**; the app shell does not need to work on a phone; `/login` and
`/q/{token}` must work from 360 px (they do). At 390 px the app shell does not overflow but is unusable
(sidebar takes most of the width); that is accepted.
