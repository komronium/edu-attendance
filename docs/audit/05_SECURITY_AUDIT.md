# 05 · Security audit

> Priorities and remedies in this document were revised after the independent review (`13_FABLE_REVIEW.md`).
> `10_IMPROVEMENT_ROADMAP.md` is the single authoritative list.

Threat model: a single-owner app on the public internet behind nginx. Assets: the owner's password and
session; the **digital.oxu.uz session cookie** (it opens the owner's university account); students' names,
absences and grades. Adversaries: internet scanners and password guessers; a student who wants to see or
change records; another web page or local process on the owner's laptop.

Probes were run only against scratch instances on `127.0.0.1`. Production (nginx, TLS, file permissions) was
**not inspected**; findings that depend on it say so.

## 1. What is done well (verified)

| Control | Evidence |
|---|---|
| Password stored as salted PBKDF2-SHA256, constant-time compare | `auth.go:49-55`, `:103-113` |
| Session cookie HttpOnly, SameSite=Strict, Secure behind HTTPS | `server.go:177-182` |
| CSRF: every mutation needs a custom header a cross-site form cannot send, plus SameSite=Strict | `server.go:233`; `TestMutationsNeedSessionAndHeader` |
| Strict CSP, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `frame-ancestors 'none'` | `server.go:30`, `:141-145` |
| No HTML injection sinks: DOM built with `textContent`/`createElement`; no `innerHTML` anywhere | `h()` in `app.js:18-32`; `grep innerHTML` → 0 |
| Server-rendered pages use `html/template` | `public.go:45` |
| SQL is parameterised everywhere; the only string-built SQL uses fixed fragments | `store.go:1023`, `:234` |
| Request bodies capped (200 KB JSON, 4 KB form), scraped pages capped (4 MB) | `server.go:46-47`, `oxu.go:26` |
| Scraper never follows redirects, only GETs, only keeps links to one known path | `oxu.go:161-163`, `:360-371` |
| Site cookie: file mode 0600, never logged, never returned by the API, kept only if it works | `syncer.go:258-268`; `TestStatusNeverContainsTheCookie` |
| Owner-account guard before and after each sync | `oxu.go:233`, `:310` |
| Public share token: 144 bits from `crypto/rand`, constant-time compare, `noindex`, `no-store`, short names only | `share.go:45-52`, `:72-78`; `public.go:73-77` |
| Static path lookup is a map of embedded files: no traversal | `server.go:264-266` |
| Secrets not in git | history grep for `auth.json`, `oxu_cookie`, `*.sqlite3`, `.env`: none |

## 2. Findings

### SEC-01 · Login lockout trusts a client-supplied header — P2 (conditional on proxy config)

- **Evidence**: `clientIP` (`server.go:184-193`) returns `X-Real-IP` if present, from any peer.
  `Auth.Locked/Fail` key on that string (`auth.go:116-138`).
- **Verified locally**: seven wrong passwords with seven different `X-Real-IP` values → seven `401`, never
  `429`; with one value the sixth is `429`.
- **Exposure**: if nginx does `proxy_set_header X-Real-IP $remote_addr;` the header is overwritten and the
  internet cannot spoof it. If it does not (or the app is ever bound to a public address), password guessing
  is unlimited at about 25 guesses/second/connection (one PBKDF2 takes ≈ 40 ms, measured). The opposite
  misconfiguration (no header at all) makes every client `127.0.0.1`, so anyone can lock the owner out for
  15 minutes with five requests. **The nginx config is not in the repo: unverified.**
- **Also**: `failures` is an unbounded map; entries are pruned only when the same key is checked again. The
  lockout is check-then-act: `login` calls `Locked`, hashes for tens of milliseconds, then `Fail`, so parallel
  requests all pass the check and the real limit is the attacker's parallelism (reviewer finding, confirmed).
- **Remediation** (revised after review):
  1. Trust `X-Real-IP`/`X-Forwarded-Proto` only when the TCP peer is loopback. This is on by default, because
     the documented deployment is nginx on the same host; no new flag, so nothing changes for the live unit.
  2. Count the attempt **before** hashing (reserve a slot under the mutex), and allow at most 2 concurrent
     password hashes (a semaphore); excess requests get `429`.
  3. **No global hard lockout**: with one user it would let anyone lock the owner out. Rate limiting by address
     belongs in nginx (`limit_req` on `/login`).
  4. Prune all expired entries on every `Fail`.
  5. Commit `deploy/nginx.conf.example` and `deploy/attendance.service.example` (OPS-01): SEC-01, SEC-04 and
     REL-02 all hinge on configuration nobody can currently review.

### SEC-02 · The extension hands the university session to any page on localhost — P2

- **Evidence**: `extension/manifest.json` injects `bridge.js` into `http://127.0.0.1/*` and
  `http://localhost/*` (match patterns ignore the port). `bridge.js:12` accepts
  `{source:"attendance-app", type:"ready"}` from the page; `background.js` `ready()` (`:137-145`) then stores
  that tab's origin as *the app* (`chrome.storage.local.app`) and `deliver()` posts the pending cookie into the
  page, where any script can read it (`bridge.js:19-21`).
- **Scenario**: any web page served from localhost on any port (a dev server of an unrelated project, a
  malicious npm package's preview page, a local tool) posts the `ready` message. On the owner's next login to
  digital.oxu.uz the extension delivers the session cookie to that page, and may open that origin in a
  background tab on later logins.
- **Not verified in a browser** (deliberately not run against the owner's profile); the logic is read from code.
- **Severity note**: the attacker must already serve a page from the owner's own localhost, and the README
  documents "any port" as intended; hence P2, not P1. The fix is cheap.
- **Remediation** (revised after review): in `background.js`, check the **sender tab's origin** against an
  allow-list before `ready`, `start`, `result` and `deliver()`: `https://davomat.lidersement.uz`,
  `http://127.0.0.1:8766`, `http://localhost:8766`, plus origins the owner adds on a small options page (needed
  for `make demo` on another port). The remembered app origin may only ever be one of these. A nonce handshake
  was considered and rejected as oversized for this threat.

### SEC-03 · Logout does not end the session; sessions cannot be revoked — P3

- **Evidence**: `/logout` only clears the cookie (`server.go:206-208`); the token is `expiry.HMAC(expiry)`
  (`auth.go:153-172`). **Verified**: after `/logout` the same token still returns `200` on `/api/students`.
  Logout is a `GET`, so any page can log the owner out with an `<img>`.
- **Impact**: a copied or leaked cookie is valid for up to 12 h and the owner has no way to cut it short except
  `set-password`, which rotates the secret.
- **Remediation**: add a server-side `session_epoch` (integer in `auth.json` or `settings`); sign
  `expiry.epoch`; logout (POST with the CSRF header) and "log out everywhere" increment the epoch. Keep
  accepting epoch-less tokens only until their expiry for backward compatibility (≤ 12 h after deploy).
  Note: this ends the documented compatibility with the Python-era cookie format; do it only if time allows.

### SEC-04 · Transport hardening depends entirely on the proxy — P3 (unverified)

No `Strict-Transport-Security`, `Permissions-Policy` or `Cross-Origin-Opener-Policy` is sent by the app.
`Secure` on the cookie depends on `ATTENDANCE_SECURE_COOKIE=1` or a truthful `X-Forwarded-Proto` (same trust
issue as SEC-01). Remediation: send HSTS when the request is known to be HTTPS; add
`Permissions-Policy: camera=(), microphone=(), geolocation=()` and `Cross-Origin-Opener-Policy: same-origin`;
document `ATTENDANCE_SECURE_COOKIE=1` as mandatory in production; refuse to start with
`--bind` other than loopback unless `ATTENDANCE_SECURE_COOKIE=1` or an explicit `--insecure` is given.

### SEC-05 · Password policy and hashing cost — P3

Minimum length 6 (`main.go:112`); 240 000 PBKDF2-SHA256 iterations (`auth.go:24`); current OWASP guidance for
PBKDF2-HMAC-SHA256 is 600 000. The generated password is strong (80 bits). Remediation: minimum 10 characters
for a chosen password; new hashes at 600 000 (the stored `iterations` field already makes this
backward-compatible); re-hash on next successful login.

### SEC-06 · Public retake page has no expiry and no throttle — P3

The token is unguessable, so brute force is not the concern. The concerns are: the link lives until the owner
rotates it; it is posted in a group chat (`shareSheet` text), so it is effectively semi-public; it shows
surname + initial, dates missed and topics for the whole group. This is a deliberate design; note it and offer
an optional expiry date on the share, and a `Cache-Control: private, no-store` (already `no-store`).

### SEC-07 · Data at rest — P3 (unverified in production)

`auth.json` and `oxu_cookie` are 0600; directories are created 0750; the SQLite file takes the process umask
(not set explicitly). The laptop data directory contains `first-password.txt` in clear text (ignored by git).
Remediation: `os.Chmod` the database to 0600 after open; never write the generated password to a file;
check the VPS for a leftover `first-password.txt`.

### SEC-08 · Demo mode — P3

`demo --no-login` disables authentication (`auth.NoLogin`). It only applies to a throw-away temp database and
the flag is ignored outside `demo` (`main.go:190`). Risk only if someone runs `demo --no-login --bind 0.0.0.0`.
Remediation: refuse `--no-login` with a non-loopback bind.

### SEC-09 · Dependency vulnerabilities — not assessed

`govulncheck` is not installed and installing tools was out of scope. Direct dependencies are two
(`golang.org/x/net`, `modernc.org/sqlite`). Add `govulncheck ./...` to `make test` or CI.

## 3. Checked and found sound

- **Injection**: no SQL, HTML, header or path injection found. The site cookie is rejected if it contains
  CR/LF (`oxu.go:155`).
- **Authorization**: one role; every `/api/*` route and every non-public asset requires the session
  (`server.go:213-218`, `:229`). `isPublic` exposes only CSS, `theme.js` and fonts.
- **Information exposure**: errors return generic Uzbek messages; internals go to the log; the health check
  returns `{ok:true}` only. A wrong-account sync reveals the other account's numeric ID to the owner only.
- **Notifications**: links and bodies are generated server-side; the client sets `location.hash` from them.
- **`postMessage`**: both sides check `e.source === window` and `e.origin === location.origin`
  (`app.js:1466`, `bridge.js:9`); the weakness is the origin allow-list (SEC-02), not the message check.

## 4. Severity summary

| ID | Title | Priority | Depends on unverified config |
|---|---|---|---|
| SEC-01 | Lockout trusts `X-Real-IP`; check-then-act | P2 | yes (nginx) |
| SEC-02 | Extension delivers site cookie to any localhost page | P2 | no |
| SEC-03 | Logout does not revoke | P3 | no |
| SEC-04 | HSTS / Secure cookie rely on proxy | P3 | yes |
| OPS-01 | No reviewable nginx/systemd configuration in the repo | P1 | – |
| SEC-05 | Password length and PBKDF2 cost | P3 | no |
| SEC-06 | Public link never expires | P3 | no |
| SEC-07 | File permissions, clear-text first password | P3 | yes |
| SEC-08 | `--no-login` with public bind | P3 | no |
| SEC-09 | No vulnerability scan | P3 | – |
