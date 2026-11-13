# 00 · Executive summary

Audit of `attendance` at commit `a1d748f`, 2026-11-11. Audit and documentation only: **no application file
was changed**. Everything here is in `docs/audit/`.

## Verdict

A small, well-made personal tool in good condition. About 2 900 lines of Go and 2 300 lines of browser
JavaScript, a clean dependency structure, a careful read-only scraper, strict CSP, sensible tests on the
server side (70–92 % per package, all passing), and a coherent interface redesigned the day before this
audit. **Nothing justifies a rewrite, a framework or a build step.**

Its weaknesses are few but sit exactly where the product makes its promises:

1. **The only copy of the real record has no backup** (DB-01, P0). The documented manual copy is unsafe under WAL.
2. **The app can say "attendance taken" about a lesson it has no information on** (BUG-01, P1): any site lesson
   that ended after the last successful read is shown green and counted as done. Seen on screen with a
   five-day-old snapshot. A partial sync or a change in the site's page layout causes the same false green.
3. **The session ends by itself after 12 hours and throws the open tab to the login page within a minute**,
   including during roll call (BUG-06, P1).
4. **After the semester ends (26 December 2026) the home page will fill with false "attendance missing"
   alerts**, and there is no way to start a new semester without mixing or destroying the old one
   (BUG-12, FEAT-01, P1).
5. **The timetable clips the status word at laptop widths** (UX-01, P1; screenshots at 1280 and 1024 px).
6. **The money-relevant arithmetic lives in an untested 2 200-line browser file** (ARCH-01, P2); the last five
   commits were corrections to it.
7. Security is sound in design; the gaps are a login lockout that trusts a client header and is
   check-then-act (SEC-01), and a browser extension that would hand the university session to any page served
   from localhost (SEC-02). Both P2. Three findings depend on an nginx configuration that is not in the repo.

## Maturity

| Area | State |
|---|---|
| Backend code | solid, small, idiomatic |
| Scraper | the strongest part; defensive and well tested |
| Frontend code | works, readable in the small, monolithic and untested in the large |
| Security | good defaults; two medium findings; production config unreviewed |
| Data safety | **weak**: no backup, hard delete, destructive import |
| Tests | good on Go, 4 % of the JavaScript, no browser tests, no CI |
| UI/UX | coherent and calm; truthfulness of status and laptop-width behaviour need work |
| Operations | manual deploy, no reviewable server config, minimal logging |

## Most valuable work, in order

1. `attendance backup` + timer + restore note (one to two days; removes the only catastrophic risk).
2. Three-valued lesson status (taken / missing / unknown) with per-section data age, and a visible data-age
   line on the six pages fed by the site.
3. Sliding session with an in-page re-login instead of a redirect.
4. Bound generated lessons to the semester; "Yangi semestr" action.
5. Move the pure logic out of `app.js` into small tested files (same pattern as the existing `pace.js`).
6. Timetable cards that never clip their status between 1024 and 1920 px; denser lesson roster.
7. Login and extension hardening; example nginx and systemd files in the repo.

## Proposed next-version scope

"Safe data, honest status, classroom-proof": 31 ordered tasks (`12_IMPLEMENTATION_TASKS.md`), roughly four to
five working weeks for one engineer. One schema change (a nullable `sessions.deleted_at`), five new API
routes, six unused routes removed, no new dependency. The visual direction approved on 10 November stays;
the UI work is refinement.

Deliberately **not** in scope: typed request bodies, schema versioning, a unique index, logout revocation,
CSV export, Web Push, a phone layout, anything multi-user.

## What was and was not inspected

- **Inspected**: every non-test source file in full; test names and coverage; the test suite run; 51 rendered
  screens in headless Chrome (both themes, three widths) on demo data and on a scratch copy of the laptop dev
  database; local probes of login lockout, logout, validation and response headers.
- **Not inspected**: the production server, its nginx/systemd/TLS setup and database; the live university
  site; the extension inside a real Chrome profile; test assertions line by line; every CSS rule; dependency
  vulnerabilities (no scanner installed); behaviour with real students on the roster.

## Independent review

A separate Fable agent re-read the code against the findings (`13_FABLE_REVIEW.md`). It confirmed the facts,
lowered seven priorities, raised two, rejected four proposed remedies as oversized, and found three real
problems the audit had missed (partial-sync freshness, the undetectable empty page, the end-of-semester
alerts). All were verified and adopted. Two disagreements on priority remain and are recorded.

## Questions only the owner can answer

1. Do tested, off-server backups of the VPS already exist?
2. What does the live nginx config send for `X-Real-IP`, `X-Forwarded-Proto` and `proxy_read_timeout`?
3. What does the site's unsaved-lessons page look like when the list is empty? (A saved copy is needed.)
4. Is a 7-day idle session acceptable on the classroom laptop?
5. Will next semester's course keep the same group, subject and days?

## Documents

| File | Content |
|---|---|
| `01_PROJECT_INVENTORY.md` | files, routes, tables, dead code, coverage of this audit |
| `02_PRODUCT_ANALYSIS.md` | purpose, workflows, rules, limitations |
| `03_ARCHITECTURE_AUDIT.md` | structure and ARCH findings |
| `04_CODE_QUALITY_AUDIT.md` | BUG and CQ findings |
| `05_SECURITY_AUDIT.md` | SEC findings |
| `06_DATABASE_PERFORMANCE_AUDIT.md` | DB, PERF, REL findings |
| `07_TESTING_AUDIT.md` | existing tests, gaps |
| `08_UI_UX_AUDIT.md` | rendered-interface findings |
| `09_UI_UX_REDESIGN_SPEC.md` | tokens, components, page specifications |
| `10_IMPROVEMENT_ROADMAP.md` | **authoritative** prioritised list |
| `11_NEXT_VERSION_SPEC.md` | implementation-ready specification |
| `12_IMPLEMENTATION_TASKS.md` | 31 ordered tasks with traceability |
| `13_FABLE_REVIEW.md` | independent review, decisions, disagreements |
| `14_TEST_AND_ACCEPTANCE_CRITERIA.md` | tests, acceptance criteria, release checklist |
| `screenshots/` | 34 captures and the capture script (`real-*` show the owner's own schedule) |
