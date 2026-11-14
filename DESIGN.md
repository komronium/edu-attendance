# Design

Category standard, executed straight. The bar named by the owner: Apple Calendar and Reminders, Vercel, Stripe. No metaphors or themed worlds.

Direction (2026-11-13, at the owner's request): the design language of the owner's ai-business-copilot app. A navy sidebar, blue-grey surfaces, one brand blue, flat 12px cards with a hairline border, small uppercase table headers, heavy numbers. It replaces "Sokin" (2026-11-10: soft shadowed cards, a light sidebar), which had rejected a dark sidebar *with saturated colour*; this navy is muted and carries no colour of its own.

## Rule

One thing leads each screen: what to do next. Totals stay quiet.

## Colour

Tokens live at the top of `web/app.css`, for light and dark.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--bg` | #f4f6f8 | #0b1620 | page ground |
| `--surface` / `--surface-2` / `--surface-3` | #ffffff / #eef2f5 / #f8fafb | #12202d / #1d3144 / #172838 | cards; hovers, tracks, segmented controls; table header band |
| `--line` / `--line-strong` / `--control` | #e2e8ee / #cbd5de / #7d8d9f | #24384a / #34506a / #5c7790 | hairlines; button borders (the label names a button); input and select borders (3:1 or better) |
| `--side` | #0c2136 | #081019 | sidebar, always navy (`--nav-*` for its text, hover, current page, accent) |
| `--text` / `--muted` | #0f2233 / #4a5d6e | #e8eef4 / #a9b8c6 | text |
| `--ink` = `--accent` | #1f5fbf | #6ba6f5 | the one primary action, links, selection, meters |
| `--ok` / `--warn` / `--bad` | #0e7c66 / #925a08 / #b4432f | #45c4a6 / #e3a84a / #ee8a76 | taken; attention; only what needs action |

Inside `.sidebar` the shared tokens are re-pointed to the navy ones, so a control placed there needs no rules of its own.

Subject colours (`--c1`..`--c8`) appear only in the timetable and the teaching load. Each is a clearly different hue: a 13% tint when attendance is open, 28% when taken, with the subject name in its own colour.

## Type

Public Sans, owner's choice, tabular digits. Page title 24px extra-bold, -.02em; big numbers extra-bold. Section title 17px semibold. Body 15px. Small 13px and 12px.

## Shape and depth

Cards: 12px radius, 24px padding, a 1px hairline (drawn as `--shadow`), no shadow. Dialogs: 16px radius, a deep shadow over a dark scrim. Controls: 8px radius; inputs and selects a 1px border at 3:1 or better, buttons a lighter one that darkens on hover; selects draw their own chevron. Loading rows shimmer. Tables: hairlines; the header is a light band with 12px uppercase labels (not the timetable, whose header is the days). Sidebar: navy, grouped under small uppercase labels (Hisobot, Kurs · group, Tizim); the current page is a lighter navy row with a 3px blue bar at the left edge.

## Components

- `.today-card`: the home page lead. `.today-top` is the next lesson on a plain surface (time, subject, countdown pill, plan state, actions; no eyebrow label: the pill says whether it is now, next or over, red when over); under it today's lessons as rows with a subject-colour edge; a footer line with today's totals and tomorrow's first lesson.
- `.sem-mark`: semester day, week and days left with a thin track, top right of the home page.
- `.home-stats`: three cards (semester pace with a ring, this week's bars, the course group's attendance), each linking to its page.
- `.pace-bar`: a track with a 2px `u` marker where the calendar says the plan should be today; `.pace-hero` and `.type-card` on the teaching load page use it.
- `.attention`: alert items first, bold with a red icon; the rest under a `Keyinroq` label.
- `.tiles`: totals as one joined strip with hairlines, never separate cards.
- `.slot`: a timetable card with a 3px left edge in the subject colour (10% tint, 22% when attendance is taken). Room and status share the last line; status is coloured text (green taken with the count, red missing, blue planned). A missing one also gets a thin red outline. `.up` rings the next lesson. The grid ends in a `Jami` row; the week's totals sit in the page sub-title.
- Teaching load pace: total % to one decimal with a point (55.2%; the owner wants a point everywhere), a verdict (`N soat orqadasiz` / `oldindasiz` / `Rejada` within one para), expected = plan × working days so far ÷ all working days. A week has six working days, Monday to Saturday; Sundays never count. The semester is a start date and a number of weeks, set in Kabinet (default 14 September, 15 weeks = 90 working days). Part-time groups (names like S1-KT-22) are measured on their own session instead: the first to the last timetable lesson of any line they are in, at least three weeks, in working days; before it nothing is expected, after it the whole plan. Closed groups count as expected and held in full; finished groups count normally, only their row hides the difference. Any sum with the course estimate keeps `~`.
- `.day-strip` (Dars rejasi): the next seven days with lessons as a row of day buttons (`.day-pick`: weekday, date, `k / n tayyor`); the pressed one opens below as one table. Green when all are ready, red with an alert when the day has a clash. It replaces a folded "Keyingi kunlar" list.
- Plan rows say the action, not the absence: a lesson without a plan shows `Rejalash` (accent, plan icon), never "Reja yo'q" and "Mavzu yozilmagan" on every row. The syllabus's next topic is offered once per class as a dashed `.suggest` button that writes it in one click. Rows take the focus: ↑/↓ walk, Enter opens.
- Clashes (two lessons on one para): `.clash-notice` (a red card naming each clash), `.clash-badge` ("Ustma-ust" pill), a red-ringed timetable cell, a faint red row in plans. Red because a person cannot teach two groups at once: it always needs action.
- Plan state: `Reja yo'q` (muted), `Reja bor` (accent), `Tayyor` (ok, with a check). On a timetable card only `Reja bor` and `Tayyor` are shown; no plan leaves the line empty. It takes the status line of a lesson still to come; a lesson that is over shows its attendance instead.
- Attendance state has one name per state on every page: `Olingan`, `Olinmoqda` (para still on), `Tugatilmagan` (para over, not finished), `Olinmagan` (never started).
- Dates read as `8-noyabr` (year only when not this year); date inputs keep `kk.oo.yyyy`.
- Toasts: dark (the text colour as the ground); an error has a red edge on the left.

## Honest status

Green means the site or the app confirmed it; red needs action now; amber is old or estimated; grey is not known.
Nothing is shown green on inference alone. A site lesson that ended after the last read of the site's unsaved
list has the state `Noma'lum` (`.state-line.unknown`, `.chip.unknown`: grey, italic): it counts as held, not as
taken. `.age-line` sits under the page head of every page fed by the site: nothing under two hours, a quiet line
after that, a red one after a day (with `Sinxronlash`), and "Qisman yangilangan" when a sync failed in part.

## Dense where it matters

The lesson roster is for roll call: 40 px rows, an empty grade box drawn only when pointed at or focused, and two
columns from 1400 px for groups over 16 so the whole list is on one screen. Timetable cards give the status its own
line and never cut it: names take two lines, the room is what gives way. Errors raised in a sheet appear in the
sheet (`#sheet-error`, `aria-invalid` on the field), not in a toast behind the backdrop. A redraw of the same page
keeps the scroll position, the open sections and the focus.

## Motion

150 ms state changes only. No entrance animation. Reduced motion is respected.
