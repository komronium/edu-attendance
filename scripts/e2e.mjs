// Browser smoke test: starts `attendance demo --no-login --with-site` and drives headless Chrome over
// the DevTools protocol (Node 22+, no npm packages). Every route in both themes at two widths, the
// timetable at five widths, and a few scripted flows. Exits 1 on any failure.
//
//   node scripts/e2e.mjs [path/to/attendance]        (make e2e)
//   E2E_SHOTS=dir   also save a screenshot of every page there
//   E2E_CHROME=...  the Chrome binary (default: google-chrome, then chromium)
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const binary = process.argv[2] || "bin/attendance";
const shots = process.env.E2E_SHOTS || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// checks that are known to fail until a planned task lands: they are reported, not fatal.
// Remove an entry when its task is done; the script says so when one starts passing.
const EXPECTED = {};

const ROUTES = ["#/", "#/jadval", "#/reja", "#/yuklama", "#/ilmiy-kpi", "#/ustama", "#/guruh", "#/dars/8", "#/guruh/talabalar", "#/talaba/1", "#/guruh/qarzlar", "#/guruh/mavzular", "#/bildirishnomalar", "#/sozlamalar", "#/darslar", "#/talabalar", "#/qarzlar", "#/kabinet"];
const SIZES = [[1280, 720], [1440, 900]];
const TIMETABLE_WIDTHS = [1024, 1280, 1366, 1440, 1920];

function chromeBinary() {
  if (process.env.E2E_CHROME) return process.env.E2E_CHROME;
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) if (spawnSync("which", [c]).status === 0) return c;
  throw new Error("no Chrome found; set E2E_CHROME");
}

async function waitFor(url) {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(url); if (r.ok) return r; } catch { /* not up yet */ } await sleep(100); }
  throw new Error("not reachable: " + url);
}

// ---------------------------------------------------------------- the app and the browser
const appPort = 20000 + Math.floor(Math.random() * 20000), cdpPort = appPort + 1;
const base = `http://127.0.0.1:${appPort}`;
const app = spawn(binary, ["demo", "--no-login", "--with-site", "--port", String(appPort)], { stdio: ["ignore", "ignore", "pipe"] });
let appLog = ""; app.stderr.on("data", (d) => { appLog += d; });
const profile = mkdtempSync(join(tmpdir(), "attendance-e2e-"));
const chrome = spawn(chromeBinary(), ["--headless=new", "--remote-debugging-port=" + cdpPort, "--user-data-dir=" + profile, "--no-first-run",
  "--disable-extensions", "--hide-scrollbars", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const stop = () => { app.kill(); chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp */ } };
process.on("exit", stop);

await waitFor(base + "/healthz");
await waitFor(`http://127.0.0.1:${cdpPort}/json/version`);
const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const waits = new Map(); const pageErrors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") pageErrors.push("console: " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") pageErrors.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") pageErrors.push("log: " + m.params.entry.text + " " + (m.params.entry.url || ""));
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; waits.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error("evaluate: " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");

async function open(hash, { w = 1440, h = 900, dark = false } = {}) {
  pageErrors.length = 0;
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: base + "/" + hash });
  // the view is drawn when the skeleton is gone and the h1 is there
  for (let i = 0; i < 60; i++) { await sleep(50); if (await evaluate(`!!document.querySelector("#view h1") && !document.querySelector("#view .skeleton")`)) break; }
  await sleep(150);
}

// ---------------------------------------------------------------- checks inside the page
const PAGE_CHECKS = `(() => {
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const parse = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p[3] === undefined ? 1 : p[3] }; };
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== "none") return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) return c.a < 1 ? null : c.rgb; } return [255, 255, 255]; };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden], .sr-only, dialog:not([open])"); };
  const out = { contrast: [], small: [], unlabeled: [] };
  const de = document.documentElement;
  out.overflow = de.scrollWidth > innerWidth ? [de.scrollWidth + " > " + innerWidth] : [];
  const h1s = [...document.querySelectorAll("h1")].filter(visible);
  out.h1 = h1s.length === 1 ? [] : [h1s.length + " visible h1"];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    if (fs < 12) out.small.push(fs + "px " + el.className + " «" + el.textContent.trim().slice(0, 24) + "»");
    const fg = parse(cs.color), bg = bgOf(el);
    if (fg && bg && fg.a === 1) {
      const a = lum(fg.rgb), b = lum(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const big = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
      if (ratio < (big ? 3 : 4.5)) out.contrast.push(ratio.toFixed(2) + " " + el.tagName.toLowerCase() + "." + el.className + " «" + el.textContent.trim().slice(0, 24) + "»");
    }
  }
  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")) {
    if (!visible(el) && !(el.tagName === "INPUT" && el.getAttribute("tabindex") !== "-1" && el.offsetParent)) continue;
    const name = el.getAttribute("aria-label") || el.textContent.trim() || el.title || el.labels?.length || el.getAttribute("aria-labelledby") || el.placeholder;
    if (!name) out.unlabeled.push(el.tagName.toLowerCase() + "." + el.className);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
})()`;
const CLIP_CHECK = `[...document.querySelectorAll(".timetable .slot .state-line")].filter((s) => {
  const slot = s.closest(".slot"), a = s.getBoundingClientRect(), b = slot.getBoundingClientRect();
  return s.scrollWidth > s.clientWidth + 1 || a.right > b.right + 0.5 || a.bottom > b.bottom + 0.5;
}).map((s) => s.closest(".slot").getAttribute("aria-label") || s.textContent.trim())`;

// ---------------------------------------------------------------- run
const failures = [], expectedSeen = new Set();
function report(check, where, items) {
  if (!items.length) return;
  if (EXPECTED[check]) { expectedSeen.add(check); console.log(`  expected (${EXPECTED[check]}) ${check} @ ${where}: ${items.slice(0, 3).join(" | ")}`); return; }
  failures.push(`${check} @ ${where}: ${items.slice(0, 5).join(" | ")}`);
}
async function shot(name) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const m = await evaluate(`({ h: Math.min(document.documentElement.scrollHeight, 4000), w: innerWidth })`);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.w, height: m.h, scale: 1 } });
  writeFileSync(join(shots, name + ".png"), Buffer.from(r.result.data, "base64"));
}

for (const hash of ROUTES) {
  for (const [w, h] of SIZES) {
    for (const dark of [false, true]) {
      const where = `${hash} ${w}x${h}${dark ? " dark" : ""}`;
      await open(hash, { w, h, dark });
      const r = await evaluate(PAGE_CHECKS);
      report("console", where, [...pageErrors]);
      for (const k of ["overflow", "h1", "small", "contrast", "unlabeled"]) report(k, where, r[k]);
      const title = await evaluate("document.title");
      if (!/· attendance$|^attendance$/.test(title)) report("title", where, [title]);
      await shot((hash.replace(/[#/]+/g, "-").replace(/^-|-$/g, "") || "home") + `-${w}${dark ? "-dark" : ""}`);
    }
  }
  process.stdout.write(".");
}
console.log();
for (const w of TIMETABLE_WIDTHS) {
  for (const dark of [false, true]) {
    await open("#/jadval", { w, h: 900, dark });
    report("timetable-clip", `#/jadval ${w}${dark ? " dark" : ""}`, await evaluate(CLIP_CHECK));
  }
}

// flows: each returns a list of problems
const FLOWS = {
  // E2E-1: start today's course lesson from its page, mark two absent by typing, finish
  async "take attendance"() {
    await open("#/darslar");
    const id = await evaluate(`(async () => {
      const r = await fetch("/api/sessions", { method: "POST", headers: { "X-Requested-With": "attendance", "Content-Type": "application/json" }, body: JSON.stringify({ date: "2030-01-07", para: 1 }) });
      return (await r.json()).id; })()`);
    await open("#/dars/" + id);
    const total = await evaluate(`document.querySelectorAll("table.roster tbody tr.tap").length`);
    for (const name of ["Karimova", "Saidov"]) {
      await evaluate(`(() => { const f = document.getElementById("roster-find"); f.value = ${JSON.stringify(name)}; f.dispatchEvent(new Event("input")); f.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
      await sleep(250);
    }
    const s = await evaluate(`fetch("/api/sessions/${id}").then((r) => r.json())`);
    const away = s.students.filter((x) => !x.present).map((x) => x.name);
    const out = [];
    if (away.length !== 2) out.push("absent after typing two names: " + JSON.stringify(away));
    if (total !== s.students.length) out.push(`roster shows ${total} rows, lesson has ${s.students.length}`);
    await evaluate(`fetch("/api/sessions/${id}", { method: "DELETE", headers: { "X-Requested-With": "attendance" } })`);
    return out;
  },
  // BUG-01: with a sync made just now every ended site lesson is known; none reads "Noma'lum" and no age line shows
  async "fresh data is not unknown"() {
    await open("#/jadval");
    const out = [];
    const unknown = await evaluate(`document.querySelectorAll(".state-line.unknown").length`);
    if (unknown) out.push(unknown + " lessons marked unknown on fresh data");
    if (await evaluate(`!!document.querySelector(".age-line")`)) out.push("age line shown on fresh data");
    if (!(await evaluate(`document.querySelectorAll(".state-line.ok").length`))) out.push("no site lesson shows as taken");
    return out;
  },
  // E2E-5, BUG-06: a session that ends while a sheet is being filled asks for the password in place
  async "session ends in place"() {
    const port2 = appPort + 2, base2 = `http://127.0.0.1:${port2}`;
    const second = spawn(binary, ["demo", "--port", String(port2)], { stdio: "ignore" });
    try {
      await waitFor(base2 + "/healthz");
      await send("Page.navigate", { url: base2 + "/login" }); await sleep(400);
      await evaluate(`fetch("/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "password=demo" }).then((r) => r.status)`);
      await send("Page.navigate", { url: base2 + "/#/talabalar" }); await sleep(900);
      await evaluate(`(() => { document.querySelector(".head-actions button.primary").click(); document.querySelector("#sheet textarea").value = "Yangi Talaba"; })()`);
      await send("Network.deleteCookies", { name: "session", url: base2 });
      await evaluate(`window.__p = api("GET", "/api/students").then(() => "resolved", (e) => "failed: " + e.message); true`);
      await sleep(300);
      const out = [];
      const state = await evaluate(`({ hash: location.hash, path: location.pathname, open: document.getElementById("relogin").open, kept: document.querySelector("#sheet textarea")?.value })`);
      if (!state.open) out.push("no password prompt");
      if (state.path !== "/" || state.hash !== "#/talabalar") out.push("page left: " + state.path + state.hash);
      if (state.kept !== "Yangi Talaba") out.push("typed text lost");
      await evaluate(`(() => { const f = document.querySelector("#relogin form"); f.elements.password.value = "demo"; f.requestSubmit(); })()`);
      await sleep(600);
      const after = await evaluate(`window.__p`);
      if (after !== "resolved") out.push("the waiting request did not go through: " + after);
      if (await evaluate(`document.getElementById("relogin").open`)) out.push("prompt still open");
      if (await evaluate(`document.querySelector("#sheet textarea")?.value`) !== "Yangi Talaba") out.push("typed text lost after login");
      return out;
    } finally { second.kill(); }
  },
  // E2E-2, BUG-02: a view that finishes after the owner went to another page does not cover it
  async "late view does not cover the page"() {
    await open("#/kabinet");
    await evaluate(`(() => { setTimeout(() => cabinetView(), 400); location.hash = "#/talabalar"; return true; })()`);
    await sleep(1200);
    const h = await evaluate(`document.querySelector("#view h1")?.textContent`);
    return h === "Talabalar" ? [] : ["the page shows «" + h + "» instead of Talabalar"];
  },
  // E2E-6, UX-08: a save that redraws the page keeps the scroll position and the focus
  async "redraw keeps the place"() {
    await open("#/ustama", { w: 1280, h: 720 });
    const before = await evaluate(`(async () => {
      const b = [...document.querySelectorAll(".track button:not([disabled])")].pop();
      b.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 100));
      b.focus(); const y = scrollY, label = b.getAttribute("title") + "|" + b.textContent; b.click();
      return { y, label: b.textContent };
    })()`);
    await sleep(900);
    const after = await evaluate(`({ y: scrollY, focus: document.activeElement?.textContent || "", tag: document.activeElement?.tagName })`);
    const out = [];
    if (Math.abs(after.y - before.y) > 4) out.push(`scroll moved from ${before.y} to ${after.y}`);
    if (after.tag !== "BUTTON" || after.focus !== before.label) out.push(`focus on ${after.tag} «${after.focus}», want «${before.label}»`);
    return out;
  },
  // E2E-3, BUG-10: five quick clicks on one student leave the server and the screen in agreement
  async "quick clicks agree"() {
    await open("#/dars/8");
    const r = await evaluate(`(async () => {
      const row = document.querySelector("table.roster tbody tr.tap"), btn = row.querySelector("button.state");
      for (let i = 0; i < 5; i++) btn.click();
      await new Promise((r) => setTimeout(r, 800));
      const shown = btn.getAttribute("aria-pressed") === "true";
      const s = await (await fetch("/api/sessions/8")).json();
      const name = row.querySelector(".strong").textContent;
      return { shown, server: !!s.students.find((x) => x.name === name).present };
    })()`);
    return r.shown === r.server ? [] : [`screen says present=${r.shown}, server ${r.server}`];
  },
  // UX-09: a deleted lesson comes back whole from the toast
  async "delete and undo"() {
    await open("#/dars/7");
    const before = await evaluate(`fetch("/api/sessions/7").then((r) => r.text())`);
    await evaluate(`(async () => { window.ask = async () => true; [...document.querySelectorAll("button")].find((b) => b.textContent === "Davomatni o'chirish").click(); })()`);
    await sleep(700);
    const out = [];
    if (await evaluate(`location.hash`) !== "#/darslar") out.push("not back on the lessons list");
    if ((await evaluate(`fetch("/api/sessions/7").then((r) => r.status)`)) !== 404) out.push("the lesson still opens after delete");
    const undo = await evaluate(`!!document.querySelector("#msg .toast-undo")`);
    if (!undo) return [...out, "no undo button in the toast"];
    await evaluate(`document.querySelector("#msg .toast-undo").click()`);
    await sleep(800);
    const after = await evaluate(`fetch("/api/sessions/7").then((r) => r.text())`);
    if (after !== before) out.push("the restored lesson differs");
    if (await evaluate(`location.hash`) !== "#/dars/7") out.push("not taken to the restored lesson");
    return out;
  },
  // E2E-4, BUG-05: a student added after the lesson started can be put on its list, absent
  async "late student joins the lesson"() {
    await open("#/talabalar");
    await evaluate(`fetch("/api/students", { method: "POST", headers: { "X-Requested-With": "attendance", "Content-Type": "application/json" }, body: JSON.stringify({ names: ["Kechikkan Talaba"] }) })`);
    await open("#/dars/8");
    const out = [];
    if (!(await evaluate(`!!document.querySelector(".roster-missing button")`))) return ["no offer to add the late student"];
    await evaluate(`document.querySelector(".roster-missing button").click()`);
    await sleep(200);
    await evaluate(`[...document.querySelectorAll("#sheet .late li")].find((li) => li.textContent.includes("Kechikkan")).querySelectorAll("button")[1].click()`);
    await sleep(800);
    const s = await evaluate(`fetch("/api/sessions/8").then((r) => r.json())`);
    const st = s.students.find((x) => x.name === "Kechikkan Talaba");
    if (!st || st.present) out.push("not on the list as absent: " + JSON.stringify(st));
    if (await evaluate(`!![...document.querySelectorAll("table.roster .strong")].find((x) => x.textContent === "Kechikkan Talaba")`) !== true) out.push("not shown on the roster");
    const debts = await evaluate(`fetch("/api/retakes").then((r) => r.json())`);
    if (!debts.items.some((x) => x.name === "Kechikkan Talaba")) out.push("the absence is not a debt");
    return out;
  },
  // FEAT-01: a new semester archives the students and folds the old lessons; run last, it changes the demo
  async "zz new semester"() {
    await open("#/kabinet");
    const t = await evaluate(`today()`);
    await evaluate(`(async () => { window.ask = async () => true; [...document.querySelectorAll("button")].find((b) => b.textContent === "Yangi semestr").click();
      await new Promise((r) => setTimeout(r, 200));
      const f = document.querySelector("#sheet form"); const d = f.querySelector(".date-field input[type=text]"); d.value = ${JSON.stringify("")} + inputDay(shiftDay(today(), 1)); d.dispatchEvent(new Event("blur"));
      f.requestSubmit(); })()`);
    await sleep(1200);
    const out = [];
    const students = await evaluate(`fetch("/api/students").then((r) => r.json())`);
    if (students.students.some((x) => x.active)) out.push("students still active");
    await open("#/darslar");
    if (!(await evaluate(`!!document.querySelector("details.older")`))) out.push("no fold for earlier lessons");
    await sleep(300);
    if ((await evaluate(`document.getElementById("owed-badge").hidden`)) !== true) out.push("the debts badge still counts the old semester: " + await evaluate(`JSON.stringify({ sem: semesterNow, badge: document.getElementById("owed-badge").textContent })`));
    await open("#/qarzlar");
    if (!(await evaluate(`!!document.querySelector(".older-toggle")`))) out.push("no way to see earlier debts");
    return out;
  },
  // UX-07: a rejected form shows its error inside the sheet, marks the field, and shows no toast
  async "error inside the sheet"() {
    await open("#/qarzlar");
    await evaluate(`document.querySelector("button.small").click()`);
    await sleep(200);
    await evaluate(`(() => { const t = document.querySelector('#sheet [name="time"]'); t.removeAttribute("pattern"); t.value = "25:99"; document.querySelector("#sheet form").requestSubmit(); })()`);
    await sleep(500);
    const r = await evaluate(`({ err: document.getElementById("sheet-error").textContent, hidden: document.getElementById("sheet-error").hidden, invalid: document.activeElement?.getAttribute("name") + "/" + document.activeElement?.getAttribute("aria-invalid"), open: document.getElementById("sheet").open, toast: !document.getElementById("msg").hidden })`);
    const out = [];
    if (r.hidden || !/vaqt/.test(r.err)) out.push("no message in the sheet: " + JSON.stringify(r));
    if (r.invalid !== "time/true") out.push("field not marked and focused: " + r.invalid);
    if (!r.open) out.push("the sheet closed");
    if (r.toast) out.push("a toast was shown as well");
    return out;
  },
  // UX-16: the students' page offers a name filter once the list is long, and the list works without it
  async "public page filter"() {
    await open("#/qarzlar");
    const token = await evaluate(`(async () => {
      const H = { "X-Requested-With": "attendance", "Content-Type": "application/json" };
      const st = (await (await fetch("/api/students")).json()).students.filter((x) => x.active);
      for (const x of st) await fetch("/api/sessions/8/students/" + x.id, { method: "PUT", headers: H, body: JSON.stringify({ present: false }) });
      return (await (await fetch("/api/retake-share", { method: "POST", headers: H, body: JSON.stringify({ title: "T" }) })).json()).share.token;
    })()`);
    const out = [];
    await send("Page.navigate", { url: base + "/q/" + token }); await sleep(600);
    const total = await evaluate(`document.querySelectorAll(".public-list > section").length`);
    if (total < 11) out.push("only " + total + " students on the page");
    if (await evaluate(`document.getElementById("public-find").hidden`)) out.push("filter not shown");
    await evaluate(`(() => { const i = document.querySelector("#public-find input"); i.value = "karimov"; i.dispatchEvent(new Event("input")); })()`);
    const shown = await evaluate(`[...document.querySelectorAll(".public-list > section")].filter((c) => !c.hidden).map((c) => c.querySelector("h2 span").textContent)`);
    if (shown.length !== 1 || !/Karimova/.test(shown[0])) out.push("filter shows " + JSON.stringify(shown));
    await evaluate(`(() => { const i = document.querySelector("#public-find input"); i.value = "zzz"; i.dispatchEvent(new Event("input")); })()`);
    if (await evaluate(`document.getElementById("public-none").hidden`)) out.push("no 'not found' note");
    // put the demo back
    await open("#/qarzlar");
    await evaluate(`fetch("/api/sessions/8/all-present", { method: "POST", headers: { "X-Requested-With": "attendance" } })`);
    await evaluate(`fetch("/api/retake-share", { method: "DELETE", headers: { "X-Requested-With": "attendance" } })`);
    return out;
  },
  // UX-15: typing "dav" in the palette offers to start today's course lesson, and Enter does it
  async "palette starts attendance"() {
    await open("#/");
    const id = await evaluate(`(async () => {
      const H = { "X-Requested-With": "attendance", "Content-Type": "application/json" };
      const ss = (await (await fetch("/api/sessions")).json()).sessions;
      for (const x of ss.filter((x) => x.date === today())) await fetch("/api/sessions/" + x.id, { method: "DELETE", headers: H });
      return true; })()`);
    await send("Page.reload"); await sleep(900);
    await evaluate(`document.getElementById("open-palette").click()`);
    await sleep(700);
    await evaluate(`(() => { const i = document.getElementById("palette-input"); i.value = "dav"; i.dispatchEvent(new Event("input")); })()`);
    const first = await evaluate(`document.querySelector("#palette-list li a span")?.textContent`);
    // today's lesson is offered only while there is one still to take; the sync action is always there
    const offered = await evaluate(`(async () => { const { sessions } = await (await fetch("/api/sessions")).json();
      const e = nextEntry(lessonContext(sessions, null, new Set()), today(), nowTime()); return !!e && e.kind === "course" && e.date === today(); })()`);
    const out = [];
    if (offered) {
      if (!/^Davomatni (boshlash|davom ettirish)/.test(first || "")) return ["first palette item for 'dav' is «" + first + "»"];
      await evaluate(`document.getElementById("palette-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
      await sleep(900);
      const hash = await evaluate(`location.hash`);
      if (!/^#\/dars\/\d+$/.test(hash)) out.push("Enter did not open a lesson: " + hash);
    } else if (/^Davomatni/.test(first || "")) out.push("a lesson is offered but none is on today");
    await open("#/");
    await evaluate(`document.getElementById("open-palette").click()`);
    await sleep(500);
    await evaluate(`(() => { const i = document.getElementById("palette-input"); i.value = "sinx"; i.dispatchEvent(new Event("input")); })()`);
    await sleep(300);
    if (!(await evaluate(`[...document.querySelectorAll("#palette-list span")].some((x) => x.textContent === "Hozir sinxronlash")`))) out.push("no sync action in the palette");
    return out;
  },
  // BUG-12: once the semester is over no course lesson is generated, and none is reported missing
  async "semester bounds"() {
    await open("#/");
    return evaluate(`(async () => {
      const t = today(), out = [];
      const inside = lessonContext([], null, new Set(), { start: shiftDay(t, -20), end: shiftDay(t, 20) });
      const over = lessonContext([{ date: shiftDay(t, -30), para: 1, finished_at: 1, total: 1, came: 1 }], null, new Set(), { start: shiftDay(t, -40), end: shiftDay(t, -1) });
      const week = [...Array(14).keys()].map((i) => shiftDay(t, i - 7));
      if (!entriesFor(week, inside).some((e) => e.kind === "course")) out.push("no course lessons inside the semester");
      if (entriesFor(week.filter((d) => d >= t), over).some((e) => e.kind === "course")) out.push("course lessons generated after the semester");
      const gaps = courseGaps(over, t, "23:59").filter((e) => e.date > shiftDay(t, -1));
      if (gaps.length) out.push(gaps.length + " missing-attendance items after the semester ended");
      return out;
    })()`);
  },
};
// the new-semester flow archives every student and moves the semester: it runs after all the others
{ const last = FLOWS["zz new semester"]; delete FLOWS["zz new semester"]; FLOWS["zz new semester"] = last; }
for (const [name, fn] of Object.entries(FLOWS)) {
  try { report("flow", name, await fn()); } catch (err) { report("flow", name, [String(err)]); }
}

for (const check of Object.keys(EXPECTED)) if (!expectedSeen.has(check)) console.log(`note: "${check}" passes now: remove it from EXPECTED`);
ws.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n  ` + failures.join("\n  "));
  if (appLog.includes("level=ERROR")) console.log("\nserver log:\n" + appLog);
  process.exit(1);
}
console.log(`e2e ok: ${ROUTES.length} routes × ${SIZES.length} sizes × 2 themes, timetable at ${TIMETABLE_WIDTHS.length} widths, ${Object.keys(FLOWS).length} flow(s)` + (shots ? `; screenshots in ${shots}` : ""));
process.exit(0);
