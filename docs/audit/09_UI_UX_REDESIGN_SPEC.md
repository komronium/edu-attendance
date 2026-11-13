# 09 · UI/UX redesign specification

## 0. Position

This is a **refinement** of the "Sokin" direction the owner approved on 2026-11-10 (`DESIGN.md`,
`docs/superpowers/specs/2026-11-10-ui-redesign-design.md`), not a new look. Fixed by the owner and kept:
Public Sans, the name "attendance", calm neutrals with one blue accent, red only for what needs action,
subject colours only in the timetable and load, no metaphors, Uzbek interface, desktop only, strict CSP,
no build step, decimals with a point.

Everything below either fixes a verified problem (`08_UI_UX_AUDIT.md`) or turns an existing ad-hoc value into a
token. Nothing adds decoration.

## 1. Design tokens

Keep every existing token name and value in `web/app.css:6-23` unless listed here.

### 1.1 Colour

| Token | Light | Dark | Change |
|---|---|---|---|
| `--bad-solid` | `#cf0f1f` | `#d93025` (was `#e0352b`) | white text reaches 4.78:1 (UX-10) |
| `--unknown` (new) | `#66666b` | `#a1a1a6` | text colour of the "Noma'lum" status; same as `--muted` by value, separate by meaning |
| `--unknown-soft` (new) | `#f2f2f5` | `#232326` | background of unknown/stale chips |
| `--stale` (new) | `var(--warn)` | `var(--warn)` | data older than 2 h |
| `--stale-soft` (new) | `var(--warn-soft)` | `var(--warn-soft)` | |

Semantic rule (add to `DESIGN.md`): **green = the site or the app confirmed it; red = needs action now;
amber = old or estimated; grey = not known.** No status is ever shown green on inference alone.

Dark values must be declared once: move them to a custom-property set applied by both selectors, e.g.

```css
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* only */ color-scheme: dark; } }
:root[data-theme="dark"], :root.dark-auto { /* the one block of dark values */ }
```

with `theme.js` adding `dark-auto` when no explicit theme is stored and the system is dark (it already runs
before paint). Acceptable alternative without touching `theme.js`: keep both selectors on **one** rule using
`:is()`/a selector list inside the media query is impossible, so if `theme.js` must stay untouched, keep the
duplication and add a comment plus a test that both blocks are textually identical.

### 1.2 Typography

Body stays 15 px / 1.5, Public Sans, tabular numerals.

| Token | Value | Use |
|---|---|---|
| `--t-xs` | 0.75 rem (12) | captions, table meta |
| `--t-sm` | 0.8125 rem (13) | secondary text, chips |
| `--t-md` | 0.9375 rem (15) | body |
| `--t-lg` | 1.0625 rem (17) | section titles |
| `--t-xl` | 2.125 rem (34) | page title |
| `--t-stat` (new) | 1.375 rem (22) | tile values (`.tile b`) |
| `--t-stat-lg` (new) | 2.5 rem (40) | card lead numbers (`.stat-big`, attendance count) |
| `--t-hero` (new) | 3.5 rem (56) | hero time, load percentage; 2.75 rem under 1240 px |

Replace the literal sizes 1.125, 1.25, 1.5, 1.625, 2, 2.375, 4 rem with the nearest token. Weights: 400 body,
500 labels, 600 titles and emphasised numbers, 700 page title and hero only.

### 1.3 Spacing, radius, elevation

- Spacing scale unchanged (`--s1 … --s6` = 4, 8, 12, 16, 24, 32). Add `--s7: 48px` for page padding.
- Radius: `--r-lg` 20 (cards), `--r-md` 12 (controls), `--r-sm` 8 (timetable cards, small controls),
  `--r-xs` 4 (new: bars, swatches, focus corners), `--r-full`. Replace literal 1–9 px radii with `--r-xs` or
  `--r-sm`; bars thinner than 6 px use `--r-full`.
- Shadows unchanged. Cards never get a border and a shadow together.

### 1.4 Density

`--row: 44px` (tables), `--row-compact: 40px` (roster), `--control: 38px` (buttons, inputs), `--control-sm: 30px`.

## 2. Layout

- Shell: sidebar `--sidebar` 236 px (208 px under 1240), content column max 1240 px, padding 44/48 px.
- Supported widths: **1024–1920**. Breakpoints: `≤ 1240` (existing "narrower desktops") and a new `≤ 1100`
  where two-column `split` layouts stack the rail under the content.
- Phone widths: only `body.login` and `body.public`.
- Page anatomy, top to bottom: page head (title, subtitle, actions) → **data-age line when applicable** → lead
  card → secondary cards → tables → collapsed explanations.

## 3. Components

| Component | Spec |
|---|---|
| Button | height 38; variants `primary` (accent fill), default (surface, 1 px `--control` border), `quiet` (text), `danger`/`danger-solid`; `small` 30; disabled 45 % opacity; one primary per view |
| Input / select / textarea | height 38, radius 12, 1 px `--control`; focus: 2 px accent ring; invalid: `--bad` border + message below in `--bad`, 13 px |
| Chip | pill, 13 px/500; kinds: default (grey), `ok`, `bad`, `warn`, `live` (accent-soft), **`unknown`** (new, grey with a `?` icon) |
| Card | radius 20, padding 24, shadow; `flush` for tables; **cards size to content**, never stretched to a sibling's height unless both are data-dense |
| Tile strip | joined strip with hairlines (existing) |
| Table | hairline rows, no filled header, 44 px rows, numeric columns right-aligned, group rows in 13 px/600 |
| Pace bar | existing; minimum width 96 px inside tables |
| Toast | bottom-centre, surface, 2.5 s for success; errors stay until dismissed and have a close button; success uses `role="status"` |
| Inline form error (new) | block above the action row inside sheets, `role="alert"`, `--bad` text on `--bad-soft`, radius 12 |
| Data-age line (new) | see §4.1 |
| Dialog / sheet | native `<dialog>`, width 540, radius 20, actions right-aligned, destructive action left-aligned; Esc closes; focus returns to the opener |
| Undo toast (new) | toast with a "Qaytarish" button, 10 s |

## 4. Page specifications

### 4.1 UX-02 · Data age and unknown status (with BUG-01)

1. **Current**: no age on pages; lessons after the sync show `✓ Olingan`.
2. **Problem**: inference shown as confirmation.
3. **Harm**: unsaved attendance goes unnoticed; lost bonus.
4. **Improvement**:
   - `ageLine(syncedAt, state)` component under the page head of `#/`, `#/jadval`, `#/reja`, `#/yuklama`,
     `#/ilmiy-kpi`, `#/ustama`:
     - age < 2 h: nothing.
     - 2 h ≤ age < 24 h: amber dot + `Ma'lumot 5 soat oldingi` + quiet button `Sinxronlash`.
     - age ≥ 24 h, or state `expired`/`wrong_account`: red icon + `Ma'lumot 5 kun oldingi. Shundan keyingi
       darslar holati noma'lum.` + primary button (`digital.oxu.uz ga kirish` if the helper is on, else link to
       Kabinet).
   - Timetable and home rows: a site lesson that ended after the snapshot shows `Noma'lum` (chip kind
     `unknown`, grey, `?` icon), card tint stays at the light "not taken" level.
   - Load: a third bucket `Noma'lum` (hours whose attendance state is unknown) next to `Davomatsiz`; the lead
     sentence adds `, shundan N soat holati noma'lum`.
   - Home tile "Olinmagan davomat": adds `· N ta noma'lum` when N > 0.
5. **Result**: nothing is green unless the last sync could have seen it.
6. **Implementation**: `11_NEXT_VERSION_SPEC.md` §3.1.
7. **Acceptance**: with a snapshot dated D, every site lesson dated after D renders `Noma'lum` on home and
   timetable; no element with class `ok` exists for such a lesson; load `done + noAtt + unknown = held`;
   the age line appears on the six pages with the correct wording at 3 h and at 3 days.

### 4.2 UX-01 · Timetable cards

1. **Current**: fixed 86 px cards, one-line name, room and status share a line and clip at ≤ 1280 px.
2. **Problem / harm**: the status is cut off on the owner's likely laptop width.
3. **Improvement**:
   - Card grid rows: `name` (max 2 lines, `-webkit-line-clamp: 2`), `meta` (type · group, 1 line, ellipsis),
     `status` (own line, never truncated, `white-space: nowrap`).
   - Room moves to the meta line (`Amaliy · 2-ATT-25 · K4 / 309`); when the meta line overflows, the room is
     the part that is dropped first (render room in its own `<span class="room">` with `flex-shrink: 10`), and
     is always in the card's `title`.
   - `height: 86px` → `min-height: 78px`; rows grow together because cells are in one table row.
   - Columns: keep `table-layout: fixed`; para column 100 px (88 px ≤ 1240). Saturday column is shown only
     when it has a lesson (already the case).
   - Below 1100 px the short status forms are used: `Olingan` → `✓`, `Olinmagan` → `Olinmagan` (kept, red),
     `Reja yo'q` → `Reja yo'q`, with the full text in `aria-label`.
4. **Result**: at 1024, 1280, 1366, 1440 and 1920 px no status text is clipped.
5. **Acceptance**: automated check: for every `.timetable .slot .state-line`,
   `scrollWidth <= clientWidth`; for `.slot b`, at most two lines; screenshot review at the five widths in both
   themes.

### 4.3 UX-03 · Home

- Lead row: `today-card` and `attention` keep the 2:1 split; `attention` uses `align-self: start` and sizes to
  content.
- Sync state `none` (never configured) is listed under "Keyinroq" with the clock icon and the text
  `Sinxronlash sozlanmagan`; `expired`, `wrong_account`, `error` stay urgent.
- The urgent count badge counts urgent items only (already so); when zero items: `Hammasi joyida`.
- Bottom tile strip stays (four tiles). Kabinet loses its duplicate tiles (UX-17).
- **Acceptance**: with two attention items the card's height is under 240 px; in demo mode (state `none`) the
  badge shows no red count caused by sync.

### 4.4 UX-04 · Lesson roster

- Header: title `Algoritmlash · 2-ATT-25`; subtitle
  `11-noyabr, chorshanba · 3-para · 11:30–12:50 · K4 / 309`; state chip directly after the title. When the
  session is in progress the subtitle ends with `boshlandi 11:32` (the stored `started_at`).
- Rows: `--row-compact` (40 px). Columns: `#` 44 px, name flexible, state 132 px, grade 72 px.
- Grade cell: renders as plain centred `–` (muted) with no border; on row hover, focus within, or when it has a
  value, it shows the bordered input. Keyboard: Tab still reaches every grade input.
- At ≥ 1440 px **and** more than 16 students: the roster renders as two tables side by side (first half,
  second half) inside the same card, numbering continuous. The find box filters both.
- Rail (sticky) unchanged: count, absent list, topic, finish, all-present, plan card, settings.
- New row at the end of the roster: `+ Talaba qo'shish` → sheet listing active students not on this lesson
  (FEAT-03).
- **Acceptance**: 18 students fit without scrolling at 1440×900; at 1280×720 at least 12 rows are visible
  below the find box; the absent toggle, type-to-find + Enter and arrow-key navigation behave as before.

### 4.5 UX-05 · Teaching load

- The three note paragraphs move into `<details class="fold-line"><summary>Qanday hisoblanadi?</summary>` with
  a definition list: `Farq`, `Davomatsiz`, `Noma'lum`, `Jadvalda`, `Sirtqi guruhlar`, `Yopilgan guruhlar`,
  `1 para = 2 soat`, `2-ATT-25 rejasi taxminiy`. Each definition is one sentence.
- "Mustaqil ta'lim" line stays visible above the disclosure.
- Table: `Bajarilishi` column bar min-width 96 px; column order unchanged; new `Noma'lum` column only when a
  non-zero value exists.
- **Acceptance**: page height at 1440 px with the dev snapshot is under 1 900 px (was 2 076); every sentence
  removed from the visible page exists inside the disclosure.

### 4.6 UX-06 · Plans page, "Kurs rejasi"

- One row per subject. Under the name, groups as muted text, closed suffix stripped, at most three shown then
  `+N`. Progress and "behind" are computed over all groups of the subject as today (`coveredTopics` already
  matches by subject + group; show the least advanced group's figure and name it:
  `S9-KT-22: ~2 dars orqada`).
- **Acceptance**: with the dev snapshot the section has 4 rows (4 subjects), not 13.

### 4.7 UX-07 · Errors in sheets

- `openSheet` gains an error slot; `act()` called from within a sheet writes there instead of the toast.
- Server validation errors may carry `field`; the matching control gets `aria-invalid="true"` and
  `aria-describedby` pointing at the message.
- **Acceptance**: submitting the retake sheet with time `25:99` shows the message inside the sheet, focus moves
  to the time field, the sheet stays open, no toast is shown.

### 4.8 UX-08 · Re-render without losing place

- `rerender()` keeps `window.scrollY`, the `open` state of `<details data-key>`, and focus (element with the
  same `data-key`).
- **Acceptance**: on `#/ustama`, clicking a stage in the last item leaves `scrollY` within 4 px; focus stays on
  the same stage button.

### 4.9 UX-09 · Undo for lesson deletion

- After `DELETE /api/sessions/{id}` the toast reads `Davomat o'chirildi` with `Qaytarish` for 10 s; the server
  keeps the row soft-deleted for 30 days (`deleted_at`).
- **Acceptance**: delete then undo restores the session with identical attendance, grades and retakes
  (compare JSON of `GET /api/sessions/{id}` before and after).

### 4.10 Smaller items

| ID | Requirement | Acceptance |
|---|---|---|
| UX-10 | `--bad-solid` dark `#d93025` | contrast script reports no pair under 4.5:1 in both themes |
| UX-11 | display sizes and radii via tokens | `grep -c "font-size: [0-9]" web/app.css` = 0; literal radii only `0`, `50%`, `inherit` |
| UX-12 | sort buttons, plan-hours button, sem-line link ≥ 28 px tall | metrics script: no standalone control under 28 px |
| UX-13 | year shown in bonus history when months span two years | two "Fevral" rows read `Fevral 2026`, `Fevral 2025` |
| UX-14 | SVG favicon from the logo; `<meta name="theme-color">` light/dark | no 404 in the console on any page |
| UX-15 | palette actions: start today's lesson, sync now | typing `dav` offers `Davomatni boshlash` when a course lesson is now/next today |
| UX-16 | public page: date as `11-noyabr, 20:56`; name filter box when > 10 students; tile labels with units | filter hides non-matching cards; works with JS disabled (list still complete) |
| UX-17 | Kabinet: remove the four overview tiles; sections "Sinxronlash", "Semestr" (with "Yangi semestr", FEAT-01), "Zaxira nusxa" (date of the last backup) | screenshot |
| A11Y-1 | native date input gets `aria-label`; remove `aria-hidden` | metrics script: no unlabeled input |
| A11Y-4 | success toast `role="status"`, error toast `role="alert"` | DOM check |

## 5. Navigation and information architecture

Unchanged: three lead pages, then Hisobot, Kurs, Tizim. One addition only:

- Unknown hashes show an in-app "Sahifa topilmadi" card with a link home instead of redirecting silently.

## 6. Notifications and feedback

| Event | Surface |
|---|---|
| Save succeeded | toast 2.5 s, or inline "saved" flash for grade cells (existing) |
| Validation failed in a sheet | inline error (§4.7) |
| Network down | persistent toast with "Qayta urinish" |
| Session expired | re-login dialog over the current page (BUG-06), not a redirect |
| Sync running | Kabinet button spinner text + sidebar line `Sinxronlanmoqda…` |
| Data stale | data-age line (§4.1) |

## 7. States every view must have

Loading (existing skeleton after 120 ms), empty (existing, each with a next action), error (existing retry
card), **stale** (new), **unknown** (new), offline (new persistent toast).

## 8. Out of scope

A phone layout for the app shell; a new colour palette; illustrations; charts beyond the existing bars and
ring; drag-and-drop; a component framework.
