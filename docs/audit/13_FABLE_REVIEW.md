# 13 · Independent Fable review

## How it was done

The instruction asked for `/advisor fable`. That is a user-typed command the auditing session cannot invoke
itself, so the review was run as the closest equivalent: a **separate Fable 5.2 agent with a fresh context**,
read-only, given the list of findings with file references and the proposed scope, and told to check each
against the code and to look for what was missed. It read the code itself (24 tool calls), re-ran `go vet`,
`go test -cover` and `-race` on two packages. It did not run a server or a browser, so it could not reproduce
the screenshot or curl evidence.

Every point it raised was then checked against the source by the auditor before being accepted.

## Verdicts and decisions

| Finding | Auditor | Reviewer | Decision | Reason |
|---|---|---|---|---|
| BUG-01 stale "taken" | P1 | Confirmed P1, **fix incomplete** | **Accepted, fix extended** | see M1, M2 below |
| BUG-02 stale renders | P1 | Overstated → P2 | **Accepted** | wrong page painted, no wrong data written |
| BUG-03 `cleanPara` | P2 | P3 | Accepted | the UI only sends integers |
| BUG-04 `SetAllPresent` | P2 | P3; check existence, not rows affected | Accepted | an empty roster also affects 0 rows |
| BUG-05 add student | P2 | P2 | Agreed | |
| BUG-06 session expiry | P2 | **Understated → P1** | **Accepted** | the 60 s background poll (`app.js:1932`) hits `api()`'s redirect, so the tab leaves by itself mid-lesson; the auditor had missed the poll's role |
| BUG-07 non-atomic writes (sent as BUG-10) | P2 | Overstated → P3 | Accepted, deferred | UI never sends both fields; KPI case self-heals |
| SEC-01 header trust | P1 | P2, exposure unproven | **Accepted** | app binds loopback; depends on nginx |
| SEC-02 logout (sent as SEC-02) | P2 | P3 | Accepted, deferred | single user, 12 h, SameSite=Strict |
| SEC-02 extension (sent as SEC-03) | P1 | P2 | **Accepted** | attacker must already serve from the owner's localhost |
| SEC-04 headers | P2 | P3, belongs in nginx | Accepted | covered by OPS-01 |
| ARCH-01 untested client logic | P1 | P2, **remedy oversized** | **Accepted** | `pace.js` pattern instead of ES modules |
| ARCH-02 duplicated constants | P1 | Overstated → P3 | **Accepted** | one test instead of `/api/config` |
| ARCH-03 untyped bodies | P2 | P3 | Accepted, deferred | PATCH "nil = leave as is" depends on the map |
| ARCH-05 `user_version` | P2 | P3 | Accepted, deferred | |
| ARCH-06 no semester scoping | P2 | **Understated → P1, dated** | **Accepted** | see M3 |
| DB-01 no backup | P0 | P1 | **Not accepted: stays P0** | see "Unresolved" |
| DB-03 unique index (sent as DB-02) | P2 | Overstated → P3 | **Accepted, removed from scope** | second writer gets `SQLITE_BUSY`, and old data may hold duplicates that would stop start-up |
| DB-02 import (sent as DB-05) | P2 | P3 once backup exists | Accepted | |
| PERF-01 | P2 | P3, harmless | Accepted | gzip only |
| REL-02 sync in request | P2 | P2, **remedy oversized** | **Accepted** | detach the context; no 202 |
| UX-01 timetable clipping | P1 | Not verified → P2 | **Not accepted: stays P1** | see "Unresolved" |
| Test coverage numbers | – | Confirmed (identical figures) | – | |

## What the reviewer found that the audit had missed

| # | Finding | Checked by the auditor | Outcome |
|---|---|---|---|
| M1 | A partial sync keeps the old `Unsaved` list but stamps a fresh `synced_at`; a fix keyed on `synced_at` would be fooled | Yes: `oxu.go:236-239` copies `prev`, a failed step keeps the old value, `store.go:624` stamps `now()` | Added to BUG-01: per-section `fetched` times |
| M2 | `parseUnsaved` cannot tell "nothing missing" from "page layout changed" | Yes: `oxu.go:389-417`, and its own comment says an empty list has no table at all | Added to BUG-01: positive empty-state detection; needs the real page from the owner |
| M3 | Course lessons are generated with no end date; after the semester every Mon–Thu adds false alerts | Yes: `app.js:790-801`, `:807-813` | New **BUG-12, P1**, and FEAT-01 raised to P1 |
| M4 | Rapid attendance toggles can leave the wrong record | Already recorded as BUG-10 at P3 | Raised to **P2** |
| M5 | The README's manual backup is unsafe under WAL | Yes: `store.go:85` | Added to DB-01 |
| M6 | Lockout is check-then-act; parallel requests exceed the limit; shared key lets anyone lock the owner out | Yes: `server.go:240-256` | Added to SEC-01: count before hashing, hash semaphore |
| M7 | `carryOver` silently drops points past 20 | Yes: `app.js:926` | New BUG-13, P3 |
| M8 | Quiet-retry flow matches Uzbek error text | Already recorded as CQ-04 | Kept, in scope |
| M9 | Unused retake-sessions API; notifications never pruned | Already recorded (ARCH-07, DB-06) | – |
| M10 | `first-password.txt` in the dev data directory | Already recorded (SEC-07) | – |

## Scope changes made because of the review

**Cut**: `/api/config`; ES modules; `202` + polling; nonce handshake for the extension; a global login
lockout; session-epoch logout revocation; `user_version`; the unique index; CSV export (moved to optional).

**Added**: sliding session and in-page re-login (P1); per-section freshness and empty-state marker;
semester bounds and "Yangi semestr" as P1; per-row toggle guard; `deploy/` examples (OPS-01, P1); backup
details (read-only source, no migration, 0600, restore drill).

**Regression warnings adopted into the spec**

- Backup must not go through `store.Open` (it migrates) → raw read-only connection (spec §3.4).
- Unknown status must never hide a real red: a lesson on the unsaved list is `missing` at any data age
  (spec §3.1, rule 2; test T-STATUS-2).
- Keep the `expiry.hmac` token format so existing logins and the Python-era compatibility survive (spec §3.2).
- Forwarded headers trusted from loopback **by default**, no new flag, so the live unit keeps working (§3.2).
- Extension allow-list checked against the sender's origin, with an options page so `make demo` still works (§3.8).
- Classic scripts only: `theme.js` stays blocking, the `ready` handshake keeps its timing (§2, §3.6).

## Rejected reviewer recommendations

| Recommendation | Why not |
|---|---|
| Downgrade DB-01 to P1 | see below |
| Downgrade UX-01 to P2 | see below |
| Treat route cancellation as too risky because every view must be touched with no browser tests behind it | The risk is real, so the order was changed instead of the scope: the smoke script (T04) comes first and guards the view changes (T12) |

## Unresolved disagreements

1. **DB-01 priority.** Reviewer: P1, because nothing is failing now and the VPS may already be backed up.
   Auditor: P0. The roadmap's P0 means "ship before anything else", and every later task (a schema column, a
   new-semester action that archives students, an import that deletes lessons) raises the cost of having no
   backup. Whether the provider takes snapshots is unknown to both. If the owner confirms tested off-server
   backups exist, P1 is right; the task order does not change either way.
2. **UX-01 priority.** Reviewer could not see the page and reasons from CSS (`flex: none` on the status) that
   clipping should only occur in very narrow columns. The auditor has screenshots at 1280 and 1024 px showing
   `Olinmagar` and `K4 / …` (`screenshots/real-jadval-1280.png`, `real-jadval-1024.png`). Which CSS rule cuts
   the status was not traced; the implementer should find it first. It stays P1 because 1280–1366 px is the likely classroom
   width; M-CLASS on the real laptop will settle it.
3. **Session lifetime.** The reviewer asked for sliding renewal without naming a lifetime; the spec proposes 7
   days idle. This is a question for the owner (spec §10.4).

## Limits of this review

One reviewer, same model family as the auditor, no browser, no production access. It is a second reading of
the code, not an external penetration test or a usability study.
