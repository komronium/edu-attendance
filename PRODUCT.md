# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, a teacher (stajyor-o'qituvchi) at Osiyo Xalqaro Universiteti. It is a personal tool, shaped around their own groups, schedule and habits, not a product for other teachers. Hard-coding what is true only for them is acceptable.

## Product Purpose

One fast place for a teacher's working life, instead of the university's slow, scattered site. It holds the timetable, attendance, teaching load, scientific KPI, the monthly bonus (ustama), and what still needs doing.

Success means nothing slips: no lost bonus from unsaved attendance or unfinished items, no forgotten lesson, retake or deadline, no time wasted hunting through the site, and an accurate record of the teacher's own that does not depend on the site.

## Positioning

It joins two things the university site cannot: official data read from digital.oxu.uz, and the teacher's private progress on work the site only sees once it is finished (a paper being written, an item done but not yet graded).

## Operating Context

Used at four moments, all of them real:

- During a lesson, in the classroom on a laptop, marking attendance fast with students in the room.
- Right before a lesson, as a quick glance: what is next, which room, which group.
- At the desk later: catching up, saving attendance on the site, retakes, reviewing load.
- At the end of the month: checking bonus items, KPI and what is missing before grading closes.

Desktop only. Phone layouts are out of scope by the owner's decision.

## Capabilities and Constraints

- Go server, SQLite, one binary, vanilla JS with no build step. Strict CSP: no inline scripts or styles, no third-party hosts.
- Interface language is Uzbek.
- digital.oxu.uz has no API. Data is read from its pages with the owner's own session cookie, read-only. Login has a robot check and stays manual. Sessions can die at any time, so stale data must be visible.
- The app must never write to the site, and never hold data from any account but the owner's (ID checked on every sync). Salary figures are never read.
- Terms: dars, para (1 to 9, with fixed university times), guruh, davomat, qarz, yuklama, ustama, Ilmiy KPI, band, Kurs (the 2-ATT-25 group's section).
- 2-ATT-25 attendance is taken in this app (Algoritmlash, Monday to Thursday, paras 3 and 4, K4 / 309). All other lessons are taken on the site. 2-ATT-25 is not in the site's load, so its plan hours are the owner's estimate.
- Hosted at https://davomat.lidersement.uz on the VPS. Its database is the real record (students, lessons, attendance); ./data on the laptop is only for development.

## Brand Commitments

Name: attendance (lowercase), chosen over "davomat". Typeface: Public Sans, chosen by the owner after trying several; it has tabular digits and Uzbek characters. Direction chosen by the owner: refined and calm, simple, clean, solid, modern. Visual references chosen by the owner: Apple Calendar and Reminders, Vercel, Stripe. No metaphors or themed worlds.

## Evidence on Hand

Real synced data from the owner's account: 54 lessons, the semester's load, 15 KPI items, 17 monthly bonus items. Students in demo mode are invented. Never present estimates as site figures.

## Product Principles

1. Show what needs attention first. The next action should never need searching for.
2. Be honest about certainty. Separate what the site confirmed, what the owner marked, and what is estimated.
3. Fast in the classroom. During a lesson every extra click or wait costs attention that belongs to students.
4. Nothing silently wrong. Stale data, a dead session or the wrong account must be obvious, never quietly accepted.
5. Read-only toward the university. The owner's records stay the owner's; official records change only by hand on the site.
