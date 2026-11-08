# Design

Category standard, executed straight. The bar named by the owner: Apple Calendar and Reminders, Vercel, Stripe. No metaphors or themed worlds.

## Rule

One thing leads each screen: what to do next. Totals stay quiet.

## Colour

Tokens live at the top of `web/app.css`, for light and dark.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--bg` | #f5f5f7 | #0b0b0c | page ground |
| `--surface` | #ffffff | #161618 | cards, tables |
| `--side` | #ebebee | #111113 | sidebar |
| `--text` / `--muted` | #1d1d1f / #66666b | #f5f5f7 / #a1a1a6 | text |
| `--ink` | #1d1d1f | #f5f5f7 | the one primary action |
| `--accent` | #0066cc | #5aa9ff | links, selection, meters |
| `--bad` | #cf0f1f | #ff7168 | only what needs action; today in the timetable |

Subject colours (`--c1`..`--c8`) appear only in the timetable and the teaching load. Each is a clearly different hue: a 13% tint when attendance is open, 28% when taken, with the subject name in its own colour.

## Type

Public Sans, owner's choice, tabular digits. Page title 34px bold, -.025em. Section title 17px semibold. Body 15px. Small 13px and 12px.

## Shape and depth

Cards: 14px radius, one soft shadow, no border. Controls: 9px radius, 1px border at 3:1 or better. Tables: hairlines, no filled header. Sidebar selection is a neutral grey, not a colour.

## Components

- `.hero-next`: the home page lead, large time (the date when the lesson is on another day), subject, countdown, action.
- `.attention`: ranked list, alert items first and bold with a red icon.
- `.tiles`: totals as one joined strip with hairlines, never separate cards.
- `.slot`: a timetable card. Room and status share the last line so a week fits one screen. `.up` rings the next lesson; the band above the grid shows only when that lesson is in another week.
- `.load-sums`: done, left and planned hours, course and site together, with `~` whenever the estimate is in the sum.
- Plan state: `Reja yo'q` (muted), `Reja bor` (accent), `Tayyor` (ok, with a check). It takes the status line of a lesson still to come; a lesson that is over shows its attendance instead.
- Attendance state has one name per state on every page: `Olingan`, `Olinmoqda` (para still on), `Tugatilmagan` (para over, not finished), `Olinmagan` (never started).
- Dates read as `8-noyabr` (year only when not this year); date inputs keep `kk.oo.yyyy`.
- Toasts: white surface; red text only for errors.

## Motion

150 ms state changes only. No entrance animation. Reduced motion is respected.
