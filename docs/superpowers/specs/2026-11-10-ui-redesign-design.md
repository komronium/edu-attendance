# UI redesign and teaching-load pace: design

Date: 2026-11-10. Approved by the owner in chat ("boshlayver").

## Intent

The owner finds the home page unpleasant and short on useful information, the timetable not good-looking, and the teaching-load page missing the numbers they actually ask themselves: how many lecture and practical hours are done, what percentage, and whether they are ahead of or behind where the semester should be today. The whole interface should feel better designed, without becoming colourful or high-contrast.

## What the owner decided

- Visual direction **A, "Sokin"**: soft cards, generous spacing, blue accent, light tinted lead card. From direction B only its orderliness (hairline tables, small section labels). Direction C (dark sidebar, saturated colour) was rejected as too colourful; B's pure black-and-white was too contrasty.
- Home page content as in the mockup (`.superpowers/brainstorm/*/content/redesign-v1.html`, `visual-directions.html`).
- Teaching load must show: lecture hours and %, practical hours and %, total % to one decimal, the hours that should have been taught by today, the difference, and the share of that expected amount achieved.
- Semester: starts 14 September, lasts 90 days.
- Extra useful statistics and warnings are welcome.

## Calls made by the builder (not the owner's words)

- Timetable keeps the grid layout (mockup 2A), not day columns.
- Owner's correction (2026-11-10): "90 days" are working days, 15 weeks × 6 (Monday to Saturday, Sundays not counted). The owner enters weeks. Expected hours = plan × (working days so far ÷ weeks × 6), where 14 September is working day 1.
- Semester start and number of weeks are editable in Kabinet and stored on the server (default 2026-09-14, 15 weeks).
- Closed groups (plan = hours held) are left out of the pace comparison.
- Lesson-start reminder is a Chrome notification fired by the open page 15 minutes before a para, like the existing notifications ("sahifa ochiq turganda").
- Sidebar is regrouped under small labels (Hisobot, Kurs, Tizim); the Kurs collapse toggle goes away, its three pages are always listed.
- Primary action colour becomes the blue accent (was near-black) to match direction A.

## Goals

1. **Style, whole app.** Update tokens and shared components in `web/app.css` so every page takes the new look: radius 18–20px cards with a softer two-layer shadow, slightly larger padding, accent-coloured primary button, pill chips, grouped sidebar. Light and dark themes both. Existing pages (KPI, Ustama, Darslar, Talabalar, Qarzlar, Dars rejasi, Kabinet, Bildirishnomalar) keep their content.
2. **Home.** Header shows the date and a semester marker (day N of 90, week, days left, thin track). Lead card: next lesson on a soft tinted band with time, subject, countdown and actions; under it today's lessons as compact rows with status; footer line with today's totals and tomorrow's first lesson. Attention card: urgent items first, then a "Shu hafta" group. Row of three cards: semester pace (ring, hours, behind/ahead, lecture and practical lines), this week (hours taught vs scheduled, per-day bars, required vs current weekly pace), course attendance (average %, change from last week, students at risk). Bottom tile strip: Ustama, Ilmiy ball, hours this month, missing attendance.
3. **Timetable.** Same grid, restyled: subject colour as a left edge, status as coloured text (green taken, red missing), attendance count on taken course lessons, weekly summary in the header (lessons, hours, held, missing), per-day totals under the grid, empty para rows compressed.
4. **Teaching load.** Lead card: total % (one decimal), verdict line ("12,9 soat orqadasiz" / "oldindasiz"), bar with a "should be here today" marker, done / left / plan. Three cards: Ma'ruza, Amaliy (hours, %, difference from expected; any other type gets its own card), and "Oxirigacha" (days left, required weekly hours, current weekly hours). Forecast list: projected hours at semester end at the current pace, whether the scheduled lessons close the gap, the line furthest behind, hours without saved attendance. The subject table gains "%" to one decimal, "Bugungacha kerak" and "Farq" columns; existing columns and the editable course plan stay.
5. **Warnings.** New attention items: load behind plan by more than one para; students who missed 25%+ of course lessons; the existing Ustama item stays. Chrome reminder 15 minutes before a lesson.

## Non-goals

Phone layouts, writing to digital.oxu.uz, new pages, changing sync, changing how hours are counted.

## Anti-goals

- Saturated or multi-colour surfaces; hard black-on-white contrast.
- Presenting estimates as site figures: anything that includes the course's estimated plan keeps the `~` mark; pace numbers are labelled as computed.
- Breaking the strict CSP (no inline styles or scripts, no third-party hosts).
- Slowing the classroom flow: starting attendance from the home page stays one click.

## Constraints

Go + SQLite, vanilla JS without a build step, Uzbek interface, Public Sans, desktop only. Dynamic sizes are set through `style.setProperty` on custom properties, as the code does today. `DESIGN.md` is updated to describe the new look.

## Left to the builder

Exact token values, component markup, how the pace helpers are factored, test coverage for the new store setting, wording of new Uzbek strings (consistent with existing terms).
