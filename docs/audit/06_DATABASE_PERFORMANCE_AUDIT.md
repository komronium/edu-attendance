# 06 · Database, performance and reliability audit

> Priorities and remedies in this document were revised after the independent review (`13_FABLE_REVIEW.md`).
> `10_IMPROVEMENT_ROADMAP.md` is the single authoritative list.

## 1. Schema (store.go:23-73 plus migrations :176-240)

```
students(id PK, name, active, created_at)
sessions(id PK, date, para, started_at, finished_at, room, topic, created_at)
attendance(session_id FK→sessions CASCADE, student_id FK→students CASCADE, present, grade,
           retake_at, retake_time, retake_room, retake_session_id FK→retake_sessions SET NULL,
           PK(session_id, student_id))            index: attendance_student(student_id)
retake_sessions(id PK, date, started_at, finished_at, room)        -- written only by `import`
lesson_plans(date, para, subject, grp, topic, items JSON, ready, outcome, updated_at, PK(date, para))
course_topics(subject PK, topics JSON)
cancelled_lessons(date, para, subject, PK(date, para, subject))
kpi_marks(period, item, done, updated_at, PK(period,item))   kpi_progress(period, item, step, …)
kpi_steps(item PK, steps JSON)   kpi_works(id PK, title, band, step, created_at)
notifications(id PK, kind, title, body, link, created_at, read_at)
settings(key PK, value)          oxu_snapshot(id=1, synced_at, data JSON)
```

Assessment: small, normalised where it matters, foreign keys on (`_pragma=foreign_keys(1)`), WAL,
`busy_timeout` 5 s, single connection that also serialises writers. Appropriate for the workload.

## 2. Data integrity and loss findings

### DB-01 · No backup mechanism — P0

- **Evidence**: no backup code, command, timer or documentation beyond "Back up the database first; never copy
  a laptop database over it" (`README.md`). `PRODUCT.md`: the VPS database "is the real record".
- **Risk**: one bad deploy, one `attendance import` on the wrong directory, one disk failure, and a semester of
  attendance, grades, retakes, plans and KPI tracking is gone. Nothing else in this audit has a comparable
  worst case, and the fix is small.
- **The documented manual procedure is itself unsafe**: the database runs in WAL mode (`store.go:85`), so
  copying only `attendance.sqlite3` from a running service can miss recent commits (reviewer finding).
- **Priority note**: the reviewer rates this P1 because nothing is actively losing data and the VPS may have
  its own backups (unknown). The auditor keeps P0: it is the only finding whose worst case is total loss of
  the record, and it must ship before any other change. Recorded as an open disagreement.
- **Remediation**: `attendance backup [--to DIR] [--keep N]` using `VACUUM INTO` (consistent under WAL, works
  while the service runs because it opens its own connection). The command must open the source **read-only
  and without running migrations** (not through `store.Open`, which migrates), and must create the file with
  mode 0600 (it holds names and grades); a systemd timer example (daily, keep 30);
  an automatic backup before any schema migration and before `import`; a documented restore procedure;
  recommend copying backups off the VPS.

### DB-02 · `import` wipes all lessons without confirmation — P3 (once backup exists)

`Import` (`importer.go:71-190`) deletes every row of `sessions` (attendance cascades) and `retake_sessions`.
It runs in one transaction, which is good, but there is no `--yes`, no dry run and no backup.
Remediation: backup first (DB-01), print what will be deleted, require `--yes`.

### DB-03 · No UNIQUE(date, para) on `sessions` — P3 (deferred)

Uniqueness is an `exists` check inside the transaction (`store.go:907-911`, `:993-997`). It is safe today only
because there is exactly one connection. A second process on the same file (the README warns about the old
Python service) or a future connection-pool change breaks it silently, and half the UI assumes one session
per (date, para) (`ctx.sessions.find`, `app.js:795`). Reviewer's correction, accepted: SQLite allows one
writer, so a second connection gets a busy error rather than a duplicate; and old data may already hold
duplicates (the legacy backfill assigns `min(n+1, 2)`, `store.go:214`; the importer inserts `lesson.Number`
unchecked), in which case creating the index would stop the service from starting. **Not in the next
version.** If done later: check for duplicates first and skip the index with a logged warning.

### DB-04 · Deleting a lesson is immediate and irreversible — P2

`DeleteSession` (`store.go:1069`) cascades to attendance, grades and retake records. The UI confirms once.
There is no undo and no trash. Remediation: soft delete (`deleted_at`) with a 30-day purge, or at minimum a
backup-backed "undo" toast for 10 s that re-creates the rows from the response of the delete call.

### DB-05 · No schema version — P3 (deferred)

See ARCH-05. Needed before DB-03 and any semester work.

### DB-06 · Unbounded tables — P3

`notifications` is read with `limit 100` but never pruned; `kpi_marks`/`kpi_progress` grow by month forever
(tiny). Remediation: delete read notifications older than 90 days during sync.

### DB-07 · JSON stored as text without validation on read — P3

`lesson_plans.items`, `course_topics.topics`, `kpi_steps.steps`, `settings.subject_styles`, `settings.retake_share`.
Read paths differ: `KPISteps` fails the whole request on one bad row (`store.go:446`), the others swallow the
error. Harmonise: skip the bad row and log.

### DB-08 · Indexing — no action

`attendance(student_id)` exists; primary keys cover every other lookup. `retake_session_id` is unindexed and
unused. With tens of students and hundreds of sessions, full scans cost microseconds.

### DB-09 · Time representation — P3

Timestamps are `REAL` Unix seconds; dates are `TEXT` ISO in Tashkent local time; `retake_time` is `TEXT`.
Consistent and sortable. One trap: `StartSession` trusts the client's `date`, so a laptop with a wrong clock
or time zone starts today's lesson on the wrong day; the client computes "today" in `Asia/Tashkent` via `Intl`
(`app.js:63`), which removes the time-zone half of the risk.

## 3. Transactions and concurrency

- `Store.tx` wraps multi-statement writes; rollback on error is correct. Single-statement writes run outside
  transactions, which is fine.
- With `SetMaxOpenConns(1)`, any code that queries `s.db` while holding a `tx` would deadlock. **Checked**: no
  such call exists today (`migrate` reads columns outside its transaction). Add a comment at `Store.tx`.
- Compound HTTP operations are not atomic (BUG-07).
- The sync writes the snapshot, then inserts notifications one by one outside a transaction
  (`syncer.go:243-250`); a crash between them loses notices for that sync only.

## 4. Performance

Measured on a laptop against local instances: every API call returns in 1–5 ms; page metrics collection after
load 80–320 ms. There is no performance problem today. Observations for efficiency and for slow links
(classroom Wi-Fi to a VPS):

### PERF-01 · Chatty, uncompressed API — P3

- **Evidence**: `homeView` issues 12 requests (`app.js:1998-2000`); every navigation adds 3 more from
  `refreshBadge` (`:179-193`); `/api/oxu` returns the full snapshot (36.7 KB on the dev database) and is fetched
  by home, timetable, plans, load, KPI, bonus, Kabinet and the reminder. `writeJSON` never compresses
  (`server.go:292-299`; verified: no `Content-Encoding` with `Accept-Encoding: gzip`). Only static assets are
  gzipped.
- **Impact**: on a 3G-grade link, home is about 60 KB over 15 requests per visit; the snapshot dominates.
- **Remediation**: only the cheapest step is worth doing: gzip JSON responses over 1 KB when the client
  accepts it. ETags, a client cache and an aggregate endpoint are not justified for one user.

### PERF-02 · Sync duration grows with the semester — P2 → see REL-02

`lessons()` fetches one page per week from the semester's lower bound to two weeks ahead
(`oxu.go:317-334`): about 12 pages in mid-November, about 22 by the end of the autumn semester, plus
`periods()` one page per month (`:558-591`), plus about 8 fixed pages, all sequential with a 10 s per-request
timeout and a 70 s total budget. Past weeks never change once their attendance is saved.
Remediation: fetch the week pages with a concurrency of 3. (Re-reading only recent weeks was considered and
rejected: a past week can still change when attendance is saved late or a lesson is moved.)

### PERF-03 · Client computation — no action

`entriesFor` is O(days × sessions) with a linear `find`; `plansView` walks up to 240 days. Sub-millisecond at
this scale.

### PERF-04 · Asset delivery — fine

`app.js` 171 KB raw, gzip `BestCompression` at start-up, `no-cache` + ETag → `304` on revisit. Fonts cached a
day. A split into modules (ARCH-01) will add requests; keep them few (≤ 12 files) and keep the ETag scheme.

## 5. Reliability and observability

### REL-01 · Logging is minimal — P3

`slog` text to stderr: listen, each manual sync, API 500s, panics. No access log, no request duration, no
background-sync success line (only failures, `syncer.go:137`). Remediation: one line per background sync
(result, duration, warnings count); a `--log-requests` flag for troubleshooting.

### REL-02 · Synchronous sync inside the request — P2

- **Evidence**: `POST /api/oxu/sync` → `Syncer.Replace/Now` → `fetch` with `context.WithTimeout(ctx, 70s)`
  derived from `r.Context()` (`server.go:671-703`, `syncer.go:223-255`). `WriteTimeout` is 75 s
  (`main.go:205`). nginx's default `proxy_read_timeout` is 60 s (**production value unverified**).
- **Failure mode**: a slow site late in the semester → the proxy answers `504` at 60 s, the client connection
  closes, `r.Context()` is cancelled, the scrape aborts, nothing is saved, and the syncer's state becomes
  `error`. The extension flow shows `!`.
- **Remediation** (revised after review): keep the request synchronous, because the extension flow relies on
  the answer, but run the scrape on a context **detached from the request** (`context.WithoutCancel`) so a
  dropped connection no longer aborts or mislabels it; fetch week pages three at a time (PERF-02); set
  `proxy_read_timeout 90s` in the example nginx config (OPS-01). A `202` + polling design was rejected as
  oversized.

### REL-03 · Health check does not touch the database — P3

`/healthz` returns `{ok:true}` unconditionally. Add a `select 1` and the age of the last successful sync.

### REL-04 · Graceful shutdown — fine

`SIGINT/SIGTERM` → `Shutdown` with 5 s; the syncer stops with the context; the DB closes via `defer`.

### REL-05 · Resource management — fine

Rows are closed (`list` helper), response bodies closed, HTTP timeouts set on both server and scraper,
panic recovery in `ServeHTTP`.

## 6. Migration safety (for the next version)

1. Ship DB-01 (backup) **before** any schema change.
2. The next version needs exactly one schema change: `sessions.deleted_at real` (soft delete). Add it with the
   existing column-sniff pattern (`alter table … add column`), which is idempotent and safe on old files.
3. Take an automatic backup at start-up when a column is about to be added.
4. Never drop `retake_sessions` or `retake_session_id`: old databases and `import` use them.
5. `user_version` (ARCH-05) and the unique index (DB-03) are deferred.
