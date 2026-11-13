# Design

Category standard, executed straight. The bar named by the owner: Apple Calendar and Reminders, Vercel, Stripe. No metaphors or themed worlds.

Direction "Sokin" (chosen 2026-11-10 from three mockups): soft, roomy cards and a blue accent, with the orderliness of hairline tables and small section labels. Rejected: a dark sidebar with saturated colour (too colourful) and pure black-and-white (too contrasty).

## Rule

One thing leads each screen: what to do next. Totals stay quiet.

## Colour

Tokens live at the top of `web/app.css`, for light and dark.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--bg` | #f5f5f7 | #0b0b0c | page ground |
| `--surface` | #ffffff | #161618 | cards, tables |
| `--side` | #ececef | #111113 | sidebar |
| `--text` / `--muted` | #1d1d1f / #66666b | #f5f5f7 / #a1a1a6 | text |
| `--ink` | #0068d6 | #5aa9ff | the one primary action (same as the accent) |
| `--accent` | #0068d6 | #5aa9ff | links, selection, meters |
| `--hero` | blue-lilac tint | deep blue tint | the next-lesson band on the home page only |
| `--bad` | #cf0f1f | #ff7168 | only what needs action; today in the timetable |

Subject colours (`--c1`..`--c8`) appear only in the timetable and the teaching load. Each is a clearly different hue: a 13% tint when attendance is open, 28% when taken, with the subject name in its own colour.

## Type

Public Sans, owner's choice, tabular digits. Page title 34px bold, -.025em. Section title 17px semibold. Body 15px. Small 13px and 12px.

## Shape and depth

Cards: 20px radius, 24px padding, a two-layer soft shadow, no border. Controls: 12px radius, 1px border at 3:1 or better. Tables: hairlines, no filled header. Sidebar: grouped under small uppercase labels (Hisobot, Kurs · group, Tizim); the current page is a white pill with the card shadow and a blue icon.

## Components

- `.today-card`: the home page lead. `.today-top` is the next lesson on the `--hero` tint (time, subject, countdown pill, plan state, actions); under it today's lessons as rows with a subject-colour edge; a footer line with today's totals and tomorrow's first lesson.
- `.sem-mark`: semester day, week and days left with a thin track, top right of the home page.
- `.home-stats`: three cards (semester pace with a ring, this week's bars, the course group's attendance), each linking to its page.
- `.pace-bar`: a track with a 2px `u` marker where the calendar says the plan should be today; `.pace-hero` and `.type-card` on the teaching load page use it.
- `.attention`: alert items first, bold with a red icon; the rest under a `Keyinroq` label.
- `.tiles`: totals as one joined strip with hairlines, never separate cards.
- `.slot`: a timetable card with a 3px left edge in the subject colour (10% tint, 22% when attendance is taken). Room and status share the last line; status is coloured text (green taken with the count, red missing, blue planned). A missing one also gets a thin red outline. `.up` rings the next lesson. The grid ends in a `Jami` row; the week's totals sit in the page sub-title.
- Teaching load pace: total % to one decimal with a point (55.2%; the owner wants a point everywhere), a verdict (`N soat orqadasiz` / `oldindasiz` / `Rejada` within one para), expected = plan × working days so far ÷ all working days. A week has six working days, Monday to Saturday; Sundays never count. The semester is a start date and a number of weeks, set in Kabinet (default 14 September, 15 weeks = 90 working days). Part-time groups (names like S1-KT-22) are measured on their own session instead: the first to the last timetable lesson of any line they are in, at least three weeks, in working days; before it nothing is expected, after it the whole plan. Closed groups count as expected and held in full; finished groups count normally, only their row hides the difference. Any sum with the course estimate keeps `~`.
- Plan state: `Reja yo'q` (muted), `Reja bor` (accent), `Tayyor` (ok, with a check). It takes the status line of a lesson still to come; a lesson that is over shows its attendance instead.
- Attendance state has one name per state on every page: `Olingan`, `Olinmoqda` (para still on), `Tugatilmagan` (para over, not finished), `Olinmagan` (never started).
- Dates read as `8-noyabr` (year only when not this year); date inputs keep `kk.oo.yyyy`.
- Toasts: white surface; red text only for errors.

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
