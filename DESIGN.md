# Design

Category standard, executed straight. The bar named by the owner: Apple Calendar and Reminders, Vercel, Stripe. No metaphors or themed worlds. The full reasoning, screens and build order are in `docs/REDESIGN.md` (2026-11-14); this file is what the code follows.

## Rule

One thing leads each screen: what to do next. Totals stay quiet. A number or a warning is said once, in full, on its own page; elsewhere it is one link.

## Structure

Sidebar, seven items: Bugun · Jadval · (Hisobot) Yuklama, Ustama, Ilmiy KPI · (Kurs) the course group, with its debt count · (Tizim) Sozlamalar. Pages that share one item get a `.subnav` row above the title: Jadval (Setka | Ro'yxat), the course (Darslar | Talabalar | Qarzlar | Mavzular), Sozlamalar (Sayt va semestr | Bildirishnomalar). Old addresses (`#/reja`, `#/darslar`, `#/kabinet`, …) stay as aliases. The theme is chosen in Sozlamalar → Ko'rinish or from Ctrl K.

A page is: title with one context line and at most one primary button; the age line if the site's data is old; the lead (the one next step); the main object; folded detail.

## Colour

Tokens live in `web/css/tokens.css`, light and dark; the dark values are written once under `data-theme="dark"`, which `theme.js` sets before first paint (saved choice, else the system). Components use token names, never literals.

| Token | Job |
|---|---|
| `--bg` / `--bg-side` / `--bg-sunk` / `--bg-raise` | page; sidebar; hover, tracks, table header, segments; floating surfaces |
| `--line` / `--line-strong` / `--control` | hairlines; button borders; input and select borders (3:1 or better) |
| `--text` / `--muted` | text (17.9:1 / 6.0:1 on white) |
| `--accent` | the one primary action, links, selection, meters |
| `--ok` / `--warn` / `--bad` and `*-soft` | taken or confirmed; old or estimated; needs action now |
| `--c1`..`--c8` | subject colours: only the timetable and the teaching load |

Red is only for what can be acted on now. A problem is one `.notice-line` (icon, lead word, where), never a tinted banner; ten identical problems are one count. Colour is never the only signal: an icon or a word goes with it.

## Type, space, shape

Public Sans, tabular digits, six sizes: `--t-hero` 40, `--t-title` 24, `--t-head` 17, `--t-body` 15, `--t-small` 13, `--t-micro` 12 (table headers, sidebar labels, uppercase). A 4px grid (`--s1`..`--s8`). Radii 6 / 10 / 14. Cards keep a 1px hairline and no shadow; shadow is for floating surfaces only.

## Components

- `.facts-strip` / `.fact`: totals as one quiet row, each a link to its page. Replaces stat cards and tiles on the home page and the load page.
- `.month-lead`: the lead of Ustama and Ilmiy KPI: one big figure and one sentence.
- `.notice-line` (`.bad`, `.warn`): one-line notices. A clash is `Ustma-ust: <when> <what>`; several fold into a list.
- `.subnav`: the tabs of a shared sidebar item, with a count where one matters.
- Roll call (`.roster`): a present student is a quiet check; an absent one is red with the word *Kelmadi*; the grade column is drawn only when someone has a grade or the teacher turns it on; two columns from 1200px for groups over 16. Arrows walk rows, Ctrl+Enter finishes.
- `.today-card` (home lead): the next lesson, today's list as rows with a subject-colour edge, a footer. `.attention` is titled *Navbat*; alerts lead, the rest under *Keyinroq*.
- `.slot` (timetable card): a 3px subject-colour edge, 10% tint, 22% when taken; status is coloured text, no red ring. `.pace-bar`: a track with a 2px marker where the calendar says the plan should be.
- `.day-strip` (Ro'yxat): the next seven days with lessons as day buttons; the pressed one opens below.
- Plan rows say the action: `Rejalash`, never "no plan" on every row. States keep one name each: `Olingan`, `Olinmoqda`, `Tugatilmagan`, `Olinmagan`, `Noma'lum`; `Reja yo'q`, `Reja bor`, `Tayyor`.
- Dates read as `8-noyabr`; date inputs keep `kk.oo.yyyy`. Decimals use a point (`55.2%`). Estimates keep `~`.
- Toasts are dark with a red left edge for errors. Errors in a sheet appear in the sheet (`#sheet-error`).

## Honest status

Green means the site or the app confirmed it; red needs action now; amber is old or estimated; grey is not known. Nothing is green on inference alone. A site lesson that ended after the last read of the site's unsaved list is `Noma'lum` (grey, italic): it counts as held, not as taken. `.age-line` sits under the page head of every page fed by the site: nothing under two hours, a quiet line after that, a red one after a day (with *Sinxronlash*), and *Qisman yangilangan* when a sync failed in part.

## Teaching load pace

Total % to one decimal with a point, a verdict (`N soat orqadasiz` / `oldindasiz` / `Rejada` within one para), expected = plan × working days so far ÷ all working days. A week has six working days, Monday to Saturday. The semester is a start date and a number of weeks, set in Sozlamalar (default 14 September, 15 weeks = 90 working days). Part-time groups (S1-KT-22 …) are measured on their own session; closed groups count as expected and held in full; finished groups count normally. Any sum with the course estimate keeps `~`.

## Motion

120–180 ms state changes only. No entrance animation. Marking attendance is instant. Reduced motion is respected.
