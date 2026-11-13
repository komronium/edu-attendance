"use strict";
// pure logic lives in web/lib (tested by node --test); the page binds it to today and the clock
const { TZ, WEEKDAYS, MONTHS, PARA_TIMES, shiftDay, dowOf, weekday, longDay, shortDate, monthTitle, capital, inputDay, periodKey, periodTitle } = Dates;
const { COURSE, HOURS_PER_PARA, canonSubject, fmtRoom, fmtType, isSirtqi, normTitle, sameWork, plainName, workSteps, defaultSteps, GRADED_BY_OTHERS, SKIPPED } = Rules;
const { cancelKey, entriesFor, paraOver, courseGaps, nextEntry, entryInfo, sameClass, nextOfClass } = Timetable;
const { PARA_SLACK, needPct, total, sessionWindows } = Load;
const { ustamaFigure } = Ustama;
const { planStage } = Plans;
const { fmtNum, pct, hrs, h1, pct1, signed, noteLessons } = Format;
function dayText(iso) { return Dates.dayText(iso, today()); }
function relDay(iso) { return Dates.relDay(iso, today()); }
function parseDay(text) { return Dates.parseDay(text, today()); }
// this semester's debts only: an earlier semester's are kept, but are not what needs doing now
const inSemesterNow = (iso) => !semesterNow.start || iso >= semesterNow.start;
function thisSemester(r) {
  const items = r.items.filter((x) => inSemesterNow(x.date)), retaken = items.filter((x) => x.retake_at).length;
  return { ...r, items, missed: items.length, retaken, owed: items.length - retaken, older: r.items.length - items.length };
}
const lessonContext = (sessions, data, cancelled, semester = semesterNow) => Timetable.lessonContext(sessions, data, cancelled, semester);
const computeLoad = (data, sessions, coursePlan, cancelled) => Load.computeLoad(data, sessions, coursePlan, cancelled, semesterNow, today(), nowTime());
const loadPace = (data, sessions, coursePlan, cancelled, semester) => Load.loadPace(data, sessions, coursePlan, cancelled, semester, today(), nowTime());
const ustamaOpen = (data, marks, month, progress) => Ustama.ustamaOpen(data, marks, month, progress, today());
const planHeld = (p) => Plans.planHeld(p, today(), nowTime());
const planTaught = (p) => Plans.planTaught(p, today(), nowTime());
const coveredTopics = (info, sessions) => Plans.coveredTopics([...planCache.plans.values()], info, sessions, today(), nowTime());
const suggestTopic = (info, sessions) => Plans.suggestTopic([...planCache.plans.values()], planCache.topics, info, sessions || planCache.sessions, today(), nowTime());

const view = document.getElementById("view");
const msgBox = document.getElementById("msg");
const confirmBox = document.getElementById("confirm");
const sheetBox = document.getElementById("sheet");

const SITE = "https://digital.oxu.uz";

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ------------------------------------------------------------ icons */
const ICONS = {
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  back: ["m15 18-6-6 6-6"],
  forward: ["m9 18 6-6-6-6"],
  plus: ["M12 5v14", "M5 12h14"],
  calendar: ["M8 2v4", "M16 2v4", "M3 10h18", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"],
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"],
  alert: ["M12 9v4", "M12 17h.01", "M10.300 3.900 2.400 18a2 2 0 0 0 1.700 3h15.800a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  up: ["m18 15-6-6-6 6"],
  down: ["m6 9 6 6 6-6"],
  dot: ["M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"],
  plan: ["M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z", "M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2", "m9 14 2 2 4-4"],
};
function icon(name) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "icon" })) svg.setAttribute(k, v);
  for (const d of ICONS[name]) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

/* ------------------------------------------------------------ formatting */
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); }
function timeText(ts) { return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts * 1000)); }
function nowTime() { return timeText(Date.now() / 1000); }
function paraText(p) { return p ? (COURSE.slotOf[p] || p) + "-para" : ""; }
// a course lesson's attendance: taken, still being taken, or left unfinished after the para ended
const sessionEntry = (s) => ({ kind: "course", date: s.date, para: COURSE.slotOf[s.para] || s.para, appPara: s.para, session: s });
function sessionChip(s) {
  return s.finished_at ? chip("Olingan", "ok", "check") : paraOver(sessionEntry(s), today(), nowTime()) ? chip("Tugatilmagan", "warn") : chip("Olinmoqda", "live");
}
function span(s) { return s.finished_at ? timeText(s.started_at) + "–" + timeText(s.finished_at) : timeText(s.started_at); }
function retakeText(x) { return dayText(x.retake_at) + (x.retake_time ? " " + x.retake_time : "") + (x.retake_room ? ", " + x.retake_room : ""); }

/* ------------------------------------------------------------ small components */
// How old the site's data on a page is. Nothing while it is under two hours old; a quiet line under a
// day; a red one after that, when the session has most likely died. A sync that failed in part says so.
const AGE_SOON = 2 * 3600, AGE_OLD = 24 * 3600;
function ageLine(data, section, note) {
  if (!data) return null;
  const at = (data.fetched && data.fetched[section]) || 0, age = at ? Date.now() / 1000 - at : Infinity;
  const partial = (data.warnings || []).map((w) => w.split(":")[0]);
  if (age < AGE_SOON && !partial.length) return null;
  const old = age >= AGE_OLD;
  const text = !at ? "Bu ma'lumot hali o'qilmagan." : age < AGE_SOON ? "" : age < AGE_OLD ? "Ma'lumot " + Math.floor(age / 3600) + " soat oldingi."
    : "Ma'lumot " + Math.floor(age / 86400) + " kun oldingi" + " (" + stamp(at) + ").";
  return h("p", { class: "age-line" + (old ? " old" : ""), role: "status" }, icon(old ? "alert" : "clock"),
    text ? h("span", { text: text + (old && note ? " " + note : "") }) : null,
    partial.length ? h("span", { class: "muted", text: "Qisman yangilangan: " + partial.join(", ") + " o'qilmadi." }) : null,
    h("a", { href: "#/kabinet", text: "Sinxronlash" }));
}
const withAge = (data, section, note, head) => [head, ageLine(data, section, note)];

function chip(text, kind, iconName) { return h("span", { class: "chip" + (kind ? " " + kind : "") }, iconName ? icon(iconName) : null, text); }
function meter(value) {          // value 0..100; a thin single-hue mark, the number is always printed next to it
  const fill = h("i");
  if (value !== null && value !== undefined) fill.style.setProperty("--v", value);
  return h("span", { class: "meter", "aria-hidden": "true" }, fill);
}
function tile(label, value, note) { return h("div", { class: "tile" }, h("span", { class: "label", text: label }), h("b", { text: String(value) }), note ? h("span", { class: "note", text: note }) : null); }
function pageHead(title, sub, ...actions) {
  return h("header", { class: "page-head" }, h("div", {}, h("h1", { text: title }), sub ? h("p", { class: "sub" }, sub) : null), actions.length ? h("div", { class: "head-actions" }, actions) : null);
}
function back(href, text) { return h("a", { class: "back", href }, icon("back"), text); }
// the browser draws type=date in its own locale, so people type dd.mm.yyyy and the calendar stays one click away
function dateField(name, value) {
  const native = h("input", { type: "date", name, value, class: "date-native", tabindex: "-1", "aria-hidden": "true", "aria-label": "Sana" });
  const text = h("input", { type: "text", inputmode: "numeric", value: inputDay(value), placeholder: "kk.oo.yyyy", maxlength: "10", autocomplete: "off", required: true });
  let sent = value;   // the date listeners last heard about; typing only tells them once the field is left
  const read = () => {
    const iso = parseDay(text.value);
    text.setCustomValidity(iso ? "" : "Sanani kk.oo.yyyy ko'rinishida yozing");   // blocks submit even before the field is left
    if (iso) native.value = iso;
    return iso;
  };
  text.addEventListener("input", () => { if (read()) text.removeAttribute("aria-invalid"); });
  text.addEventListener("blur", () => {
    const iso = read();
    text.toggleAttribute("aria-invalid", !iso);
    if (!iso) return;
    text.value = inputDay(iso);
    if (iso !== sent) { sent = iso; native.dispatchEvent(new Event("change")); }
  });
  native.addEventListener("change", () => { if (native.value) { sent = native.value; text.value = inputDay(native.value); read(); text.removeAttribute("aria-invalid"); } });
  const box = h("div", { class: "date-field" }, text, native,
    h("button", { type: "button", class: "date-pick", "aria-label": "Kalendarni ochish", onclick: () => { try { native.showPicker(); } catch (err) { text.focus(); } } }, icon("calendar")));
  box.input = native;
  return box;
}
function field(label, control, cls) { return h("label", { class: "field" + (cls ? " " + cls : "") }, h("span", { text: label }), control); }
function linkRow(href, cells, cls) {   // a table row that opens a page; the first link stays the keyboard target
  return h("tr", { class: "link" + (cls ? " " + cls : ""), onclick: (e) => { if (!e.target.closest("a, button, input")) location.hash = href; } }, cells);
}

/* ------------------------------------------------------------ data */
// A session that ended while the page was open: one password prompt over the page, shared by every
// request that found it so; what was being typed stays where it is. Resolves once logged in again.
let relogin = null;
function reloginPrompt() {
  if (relogin) return relogin;
  const box = document.getElementById("relogin"), form = box.querySelector("form"), input = form.elements.password, err = box.querySelector(".login-error");
  relogin = new Promise((resolve) => {
    err.textContent = ""; input.value = "";
    const submit = async (e) => {
      e.preventDefault();
      let r = null;
      try {
        r = await fetch("/api/login", { method: "POST", headers: { "X-Requested-With": "attendance", "Content-Type": "application/json" }, body: JSON.stringify({ password: input.value }) });
      } catch (x) { /* shown below */ }
      if (r && r.ok) { form.removeEventListener("submit", submit); box.close(); relogin = null; resolve(); return; }
      err.textContent = r ? ((await r.json().catch(() => ({}))).error || "Xato: " + r.status) : "Server bilan aloqa yo'q";
      input.select();
    };
    form.addEventListener("submit", submit);
    box.showModal();
    input.focus();
  });
  return relogin;
}
document.getElementById("relogin").addEventListener("cancel", (e) => e.preventDefault());   // only the password closes it

async function api(method, url, body, retried) {
  const opts = { method, headers: { Accept: "application/json" }, cache: "no-store" };
  if (method !== "GET") { opts.headers["X-Requested-With"] = "attendance"; opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body || {}); }
  let r;
  try { r = await fetch(url, opts); } catch (err) { throw new Error("Server bilan aloqa yo'q, internetni tekshiring"); }
  if (r.status === 401 && !retried) { await reloginPrompt(); return api(method, url, body, true); }
  if (r.status === 401) throw new Error("Kirish kerak");
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error || "Xato: " + r.status); err.code = data.code || ""; err.field = data.field || ""; throw err; }
  return data;
}
let toastTimer;
// While a sheet is open an error is shown in it, above its buttons: a toast at the bottom of the page
// can sit behind the dialog's backdrop. field names the control to mark and focus, when the server knows it.
function sheetError(text, field) {
  const box = document.getElementById("sheet-error");
  box.textContent = text; box.hidden = !text;
  sheetBox.querySelectorAll("[aria-invalid]").forEach((x) => { x.removeAttribute("aria-invalid"); x.removeAttribute("aria-describedby"); });
  const el = text && field ? sheetBox.querySelector('[name="' + field + '"]') : null;
  if (el) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", "sheet-error"); el.focus(); }
}
function say(text, ok, hold, field) {   // hold: a progress note that stays until the next message
  if (sheetBox.open && !ok) { msgBox.hidden = true; return sheetError(text, field); }
  clearTimeout(toastTimer);
  msgBox.textContent = text; msgBox.className = "toast" + (ok ? " ok" : ""); msgBox.hidden = !text;
  msgBox.setAttribute("role", ok ? "status" : "alert");   // a result is polite, an error interrupts
  if (ok && !hold) toastTimer = setTimeout(() => { msgBox.hidden = true; }, 2500);
}
msgBox.addEventListener("click", () => say(""));
// a done thing that can still be taken back: the toast carries the button for ten seconds
function sayUndo(text, undo) {
  say(text, true, true);
  msgBox.append(" ", h("button", { type: "button", class: "quiet toast-undo", text: "Qaytarish", onclick: async (e) => {
    e.stopPropagation();
    if (await act(undo)) say("Qaytarildi", true);
  } }));
  toastTimer = setTimeout(() => { msgBox.hidden = true; }, 10000);
}
async function act(fn) {
  try { if (!msgBox.classList.contains("ok")) say(""); if (sheetBox.open) sheetError(""); return await fn(); } catch (err) { say(err.message, false, false, err.field); return null; }   // a success toast outlives the next navigation
}
function ask(message, okText, danger) {
  return new Promise((resolve) => {
    confirmBox.querySelector("#confirm-text").textContent = message;
    const ok = confirmBox.querySelector("[value=ok]");
    ok.textContent = okText || "Ha";
    ok.className = danger ? "danger-solid" : "primary";
    confirmBox.returnValue = "";
    confirmBox.addEventListener("close", () => resolve(confirmBox.returnValue === "ok"), { once: true });
    confirmBox.showModal();
  });
}
function openSheet(title, body) {
  sheetError("");
  sheetBox.querySelector("#sheet-title").textContent = title;
  sheetBox.querySelector("#sheet-body").replaceChildren(body);
  sheetBox.showModal();
}
async function refreshBadge() {
  const badge = document.getElementById("owed-badge");
  if (!semesterNow.loaded) await loadSemester();   // the badge counts this semester's debts only
  try { const { owed } = thisSemester(await api("GET", "/api/retakes")); badge.textContent = String(owed); badge.hidden = !owed; } catch (err) { badge.hidden = true; }
  refreshNotes();
  try {
    const { state, last_sync: last } = await api("GET", "/api/oxu/status");
    const alertBox = document.getElementById("sync-alert"), time = document.getElementById("sync-time");
    const text = { expired: "Sinxronlash to'xtadi. Yangi cookie kiriting.", wrong_account: "Saytda boshqa hisob ochiq. Sinxronlash to'xtatildi.", none: "Avtomatik sinxronlash o'chiq.", error: "Sinxronlash xato berdi. Kabinetni tekshiring." }[state];
    alertBox.textContent = text || ""; alertBox.hidden = !text; alertBox.classList.toggle("calm", state === "none");
    time.textContent = last ? "Sinxronlangan: " + (new Date(last * 1000).toLocaleDateString("en-CA", { timeZone: TZ }) === today() ? "bugun " + timeText(last) : stamp(last)) : ""; time.hidden = !last;
  } catch (err) { /* keep the last state */ }
}

/* ------------------------------------------------------------ sidebar */
const PAGE_TITLES = { home: "Bosh sahifa", schedule: "Dars jadvali", plans: "Dars rejasi", load: "Yuklama", kpi: "Ilmiy KPI", months: "Ustama", lessons: "Darslar", students: "Talabalar", retakes: "Qarzlar", notes: "Bildirishnomalar", cabinet: "Kabinet" };
document.getElementById("course-name").textContent = COURSE.group;

/* ------------------------------------------------------------ routes */
const routes = [
  [/^#?\/?$/, homeView, "home"],
  [/^#\/jadval$/, scheduleView, "schedule"],
  [/^#\/reja$/, plansView, "plans"],
  [/^#\/darslar$/, lessonsView, "lessons"],
  [/^#\/yuklama$/, loadView, "load"],
  [/^#\/ilmiy-kpi$/, kpiView, "kpi"],
  [/^#\/(?:ustama|oylik-kpi)$/, monthsView, "months"],
  [/^#\/dars\/(\d+)$/, lessonView, "lessons"],
  [/^#\/talabalar$/, studentsView, "students"],
  [/^#\/talaba\/(\d+)$/, studentView, "students"],
  [/^#\/qarzlar$/, retakesView, "retakes"],
  [/^#\/kabinet$/, cabinetView, "cabinet"],
  [/^#\/bildirishnomalar$/, notesView, "notes"],
];
async function route() {
  const hash = location.hash || "#/";
  for (const [re, fn, nav] of routes) {
    const m = re.exec(hash);
    if (!m) continue;
    document.querySelectorAll(".tabs a").forEach((a) => {
      if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = (PAGE_TITLES[nav] ? PAGE_TITLES[nav] + " · " : "") + "attendance";
    refreshBadge();
    const arg = m[1] ? Number(m[1]) : null;
    const here = () => { const r = routeOf(location.hash); return !!r && r[0] === fn && r[1] === arg; };
    const loading = setTimeout(() => { if (here()) view.replaceChildren(skeleton()); }, 120);
    if (!subjectStyles.loaded) await loadStyles();
    if (!semesterNow.loaded) await loadSemester();
    const res = await act(() => fn(arg));
    clearTimeout(loading);
    if (res === null && here()) show(h("div", { class: "card empty" }, h("p", { text: "Ma'lumotni yuklab bo'lmadi." }), h("button", { type: "button", text: "Qayta urinish", onclick: route })));
    return;
  }
  document.title = "Sahifa topilmadi · attendance";
  show(pageHead("Sahifa topilmadi"), h("div", { class: "card empty" }, h("p", { text: "Bunday sahifa yo'q." }), h("a", { class: "button primary", href: "#/", text: "Bosh sahifa" })));
}
function skeleton() {
  return h("div", { class: "skeleton", role: "status", "aria-label": "Yuklanmoqda" }, h("i", { class: "s-title" }), h("i", { class: "s-sub" }), h("div", { class: "s-row" }, h("i"), h("i"), h("i")), h("i", { class: "s-block" }));
}
// The view a hash belongs to, as [function, argument], or null.
function routeOf(hash) {
  for (const [re, fn] of routes) { const m = re.exec(hash || "#/"); if (m) return [fn, m[1] ? Number(m[1]) : null]; }
  return null;
}
// A view's own show: it paints only while the page is still that view, and only for the newest run of
// it. A view that finishes late (a sync of a minute, a slow request) never covers the page the owner
// went to meanwhile, and an older run never covers a newer one.
let paintGen = 0;
function painter(fn, arg) {
  const gen = ++paintGen;
  const live = () => { const r = routeOf(location.hash); return gen === paintGen && !!r && r[0] === fn && (arg === undefined || r[1] === arg); };
  const paint = (...nodes) => { if (live()) show(...nodes); };
  paint.live = live;
  return paint;
}

// what identifies an element across a redraw of the same page
const placeKey = (el) => el.dataset.key || el.tagName + "|" + (el.getAttribute("aria-label") || (el.tagName === "DETAILS" ? el.querySelector("summary")?.textContent : el.textContent) || "").trim().slice(0, 80);
let shownHash = null;
// Replaces the page. Drawn again on the same page (after a save), it keeps the scroll position, the open
// sections and the focus; a new page starts at the top (the hashchange handler).
function show(...nodes) {
  const here = location.hash || "#/", same = shownHash === here;
  const keep = same ? { y: window.scrollY, open: new Set([...view.querySelectorAll("details[open]")].map(placeKey)),
    focus: view.contains(document.activeElement) && document.activeElement !== view ? placeKey(document.activeElement) : null } : null;
  view.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
  shownHash = here;
  if (!keep) return;
  for (const d of view.querySelectorAll("details")) if (keep.open.has(placeKey(d))) d.open = true;
  if (keep.focus) {
    const el = [...view.querySelectorAll("button, a, input, select, textarea, summary")].find((x) => placeKey(x) === keep.focus);
    if (el) el.focus({ preventScroll: true });
  }
  window.scrollTo(0, keep.y);
}

/* ------------------------------------------------------------ lessons (home) */
async function lessonsView() {
  const show = painter(lessonsView, null);   // paints only while this is still the page
  const t = today();
  const [{ sessions: allSessions }, { para: freePara }, allDebts] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/free-para?date=" + t), api("GET", "/api/retakes"), loadPlans()]);
  planCache.sessions = allSessions;
  // this semester's lessons lead; earlier ones stay one click away
  const sessions = allSessions.filter((s) => inSemesterNow(s.date)), older = allSessions.filter((s) => !inSemesterNow(s.date));
  const debts = thisSemester(allDebts);
  const start = async (date, para) => {
    const topic = (planCache.plans.get(planKey(date, COURSE.slotOf[para] || para)) || {}).topic || "";
    const res = await act(() => api("POST", "/api/sessions", { date, para, room: COURSE.room, topic }));
    if (res) location.hash = "#/dars/" + res.id;
  };
  const finished = sessions.filter((s) => s.finished_at);
  const seats = finished.reduce((n, s) => n + s.total, 0);
  const came = finished.reduce((n, s) => n + s.came, 0);
  const todays = sessions.filter((s) => s.date === t).sort((a, b) => a.para - b.para);
  const stale = sessions.filter((s) => !s.finished_at && s.date !== t);

  const paraSel = h("select", { name: "para" }, [1, 2].map((p) => h("option", { value: String(p), text: paraText(p) })));
  const dateBox = dateField("date", t), dateIn = dateBox.input;
  const suggest = async () => {     // offer the para of that day that is still free
    try { const { para } = await api("GET", "/api/free-para?date=" + encodeURIComponent(dateIn.value)); if (para) paraSel.value = String(para); } catch (err) { /* keep the choice */ }
  };
  dateIn.addEventListener("change", suggest);
  suggest();

  const rail = h("aside", { class: "rail" },
    h("section", { class: "card today", "aria-labelledby": "today-h" },
      h("h2", { id: "today-h", text: "Bugun" }), h("p", { class: "sub", text: longDay(t) }),
      todays.length ? h("ul", { class: "plain" }, todays.map((s) => h("li", {}, h("a", { class: "today-item", href: "#/dars/" + s.id },
        h("span", { text: paraText(s.para) }), s.finished_at ? h("span", { class: "muted", text: s.came + " / " + s.total }) : sessionChip(s))))) : null,
      freePara
        ? h("button", { type: "button", class: "primary wide", text: paraText(freePara) + " davomatini boshlash", onclick: () => start(t, freePara) })
        : h("p", { class: "muted", text: "Bugun ikkala para ham olingan." })),
    stale.length ? h("section", { class: "card notice", "aria-labelledby": "stale-h" },
      h("h2", { id: "stale-h", text: "Tugatilmagan davomat" }),
      h("ul", { class: "plain" }, stale.map((s) => h("li", {}, h("a", { class: "today-item", href: "#/dars/" + s.id }, h("span", { text: dayText(s.date) + ", " + paraText(s.para) }), h("span", { text: "Davom ettirish" })))))) : null,
    h("section", { class: "card", "aria-labelledby": "other-h" },
      h("h2", { id: "other-h", text: "Boshqa sana" }),
      h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); start(dateIn.value, Number(paraSel.value)); } },
        h("div", { class: "pair" }, field("Sana", dateBox), field("Para", paraSel)),
        h("button", { type: "submit", class: "wide", text: "Davomatni boshlash" }))));

  // a lesson without a topic is a gap in the record: the plan's topic is offered, otherwise it is flagged
  const topicCell = (s) => {
    if (s.topic) return h("td", { class: "topic", text: s.topic });
    const planned = (planOf(sessionEntry(s)) || {}).topic;
    return planned ? h("td", { class: "topic muted", title: "Rejadagi mavzu, davomatda hali yozilmagan" }, planned, " ", chip("reja"))
      : h("td", { class: "topic" + (s.finished_at ? " warn-text" : " muted"), text: "Mavzu yozilmagan" });
  };
  const tableOf = (list) => {
  const groups = [];
  for (const s of list) {
    const key = s.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push(g = { key, items: [] });
    g.items.push(s);
  }
  return list.length ? h("div", { class: "card flush" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Sana" }), h("th", { scope: "col", text: "Para" }), h("th", { scope: "col", text: "Mavzu" }), h("th", { scope: "col", class: "num", text: "Keldi" }))),
    groups.map((g) => h("tbody", {},
      h("tr", { class: "group" }, h("th", { colspan: "4", scope: "colgroup", text: monthTitle(g.key) })),
      g.items.map((s) => linkRow("#/dars/" + s.id, [
        h("td", { class: "nowrap" }, h("a", { class: "strong", href: "#/dars/" + s.id, text: dayText(s.date) }), h("span", { class: "muted", text: "  " + (relDay(s.date) || weekday(s.date).slice(0, 3)) })),
        h("td", { class: "nowrap muted", text: paraText(s.para) }),
        topicCell(s),
        h("td", { class: "num nowrap" }, s.finished_at ? h("b", { class: "came" + (s.total && s.came / s.total < 0.8 ? " low" : ""), title: (s.total - s.came) + " ta talaba kelmadi", text: s.came + "/" + s.total }) : sessionChip(s))]))))))
    : h("p", { class: "card empty", text: "Hali davomat olinmagan. O'ngdagi tugma bilan birinchisini boshlang." });
  };
  const table = [tableOf(sessions),
    older.length ? h("details", { class: "fold-line older", "data-key": "older-lessons" }, h("summary", { text: "Oldingi semestrlar (" + older.length + " ta dars)" }), tableOf(older)) : null];

  show(pageHead("Darslar", COURSE.subject + " · " + COURSE.group),
    h("div", { class: "tiles" },
      tile("Darslar", sessions.length, sessions.length > finished.length ? sessions.length - finished.length + " tasi tugatilmagan" : "Hammasi tugatilgan"), tile("O'rtacha davomat", seats ? pct(100 * came / seats) : "–"),
      tile("Qolgan qarzlar", debts.owed), tile("Topshirilgan", debts.retaken)),
    h("div", { class: "split" }, h("div", {}, table), rail));
}

/* ------------------------------------------------------------ one lesson */

async function lessonView(id) {
  const show = painter(lessonView, id);   // paints only while this is still the page
  const [s] = await Promise.all([api("GET", "/api/sessions/" + id), loadPlans()]);
  const entry = sessionEntry(s), plan = planOf(entry);
  const big = h("b", { class: "big-count" });
  const bar = h("span", { class: "meter tall", "aria-hidden": "true" }, h("i"));
  const absentList = h("div", { class: "absent-list" });
  const status = h("div", { role: "status", "aria-live": "polite" }, big, bar, absentList);
  const updateCount = () => {
    const total = s.students.length, came = s.students.filter((x) => x.present).length;
    const away = s.students.filter((x) => !x.present);
    big.replaceChildren(String(came), h("span", { class: "muted", text: " / " + total + " keldi" }));
    bar.firstChild.style.setProperty("--v", total ? 100 * came / total : 0);
    absentList.replaceChildren(...(away.length
      ? [h("p", { class: "label", text: "Kelmadi: " + away.length }), h("ul", { class: "plain" }, away.map((x) => h("li", { text: x.name })))]
      : [h("p", { class: "muted", text: "Hamma keldi" })]));
  };

  const paints = [];
  const grades = [];
  const finder = [];
  const rows = s.students.map((st, i) => {
    const btn = h("button", { type: "button", class: "state" });
    const tag = chip("Topshirgan");
    const grade = h("input", { class: "grade", type: "text", inputmode: "decimal", value: st.grade ?? "", placeholder: "–", "aria-label": st.name + " bahosi", autocomplete: "off" });
    grades.push(grade);
    grade.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); (grades[i + 1] || grade).focus(); } });
    grade.addEventListener("change", async () => {
      const res = await act(() => api("PUT", "/api/sessions/" + id + "/students/" + st.id, { grade: grade.value.trim() }));
      if (res) { st.grade = grade.value.trim() === "" ? null : Number(grade.value.replace(",", ".")); grade.classList.add("saved"); setTimeout(() => grade.classList.remove("saved"), 900); }
      else grade.value = st.grade ?? "";
    });
    let busy = false;   // one change per student at a time: quick clicks cannot reach the server out of order
    const toggle = async () => {
      if (busy) return;
      busy = true;
      try {
        const was = { present: st.present, retake_at: st.retake_at }, next = !st.present;
        if (next && st.retake_at && !(await ask(st.name + " qarzni topshirgan. «Keldi» qilinsa, topshirish yozuvi o'chadi.", "Keldi qilish", true))) return;
        st.present = next ? 1 : 0; if (next) st.retake_at = null; paint(); updateCount();
        const ok = await act(() => api("PUT", "/api/sessions/" + id + "/students/" + st.id, { present: next }));
        if (!ok) { Object.assign(st, was); paint(); updateCount(); } else refreshBadge();
      } finally { busy = false; }
    };
    btn.addEventListener("click", toggle);
    const tr = h("tr", { class: "tap", onclick: (e) => { if (!e.target.closest("button, input")) toggle(); } },
      h("td", { class: "n muted", text: String(i + 1) }),
      h("td", {}, h("span", { class: "strong", text: st.name }), " ", tag),
      h("td", { class: "w-state" }, btn),
      h("td", { class: "w-grade" }, grade));
    const paint = () => {
      btn.setAttribute("aria-pressed", String(!!st.present));
      btn.setAttribute("aria-label", st.name + ": " + (st.present ? "keldi" : "kelmadi"));
      btn.replaceChildren(icon(st.present ? "check" : "x"), st.present ? "Keldi" : "Kelmadi");
      tag.hidden = !st.retake_at;
      tr.classList.toggle("absent", !st.present);
    };
    paints.push(paint);
    paint();
    finder.push({ name: plainName(st.name), tr, toggle });
    return tr;
  });
  updateCount();

  // typing narrows the roster, Enter marks the first match and leaves the box ready for the next name
  const noMatch = h("tr", { hidden: true }, h("td", { colspan: "4", class: "muted roster-none" }));
  const found = h("p", { class: "sr-only", role: "status" });
  const find = h("input", { id: "roster-find", type: "search", autocomplete: "off", spellcheck: "false", placeholder: "Ismni yozing, Enter bilan belgilang" });
  const narrow = () => {
    const q = plainName(find.value);
    const hits = finder.filter((x) => !q || x.name.includes(q));
    finder.forEach((x) => { x.tr.hidden = !hits.includes(x); x.tr.classList.remove("hit"); });
    if (q && hits.length) hits[0].tr.classList.add("hit");
    noMatch.hidden = !q || hits.length > 0;
    noMatch.firstChild.textContent = "«" + find.value.trim() + "» topilmadi. Familiyaning boshini yozib ko'ring.";
    found.textContent = q ? hits.length + " ta talaba topildi" : "";
    return hits;
  };
  find.addEventListener("input", narrow);
  find.addEventListener("keydown", async (e) => {
    if (e.key === "Escape" && find.value) { e.preventDefault(); e.stopPropagation(); find.value = ""; narrow(); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const hit = find.value.trim() ? narrow()[0] : null;
    if (!hit) return;
    await hit.toggle();
    find.value = ""; narrow(); find.focus();
  });

  const topic = h("input", { name: "topic", value: s.topic || (plan && plan.topic) || "", maxlength: "200", autocomplete: "off", placeholder: "Masalan: Sikllar" });
  const finishBtn = h("button", { type: "button", class: "primary wide", text: s.finished_at ? "Saqlash" : "Davomatni tugatish", onclick: async () => {
      finishBtn.disabled = true;
      const ok = await act(() => api("POST", "/api/sessions/" + id + "/finish", { topic: topic.value }));
      finishBtn.disabled = false;
      if (ok) { location.hash = "#/darslar"; say(s.finished_at ? "Saqlandi" : "Davomat olindi", true); }
    } });
  topic.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finishBtn.click(); } });
  const allPresent = async () => {
    const absent = s.students.filter((st) => !st.present), passed = absent.filter((st) => st.retake_at).length;
    if (absent.length && !(await ask(absent.length + " ta talaba «kelmadi» turibdi" + (passed ? ", " + passed + " tasining topshirish yozuvi bor" : "") + ". Hammasi «keldi» qilinsa, bu belgilar o'chadi.", "Hammasi keldi", true))) return;
    if (!(await act(() => api("POST", "/api/sessions/" + id + "/all-present")))) return;
    s.students.forEach((st) => { st.present = 1; st.retake_at = null; });
    paints.forEach((p) => p()); updateCount(); refreshBadge();
  };

  const rail = h("aside", { class: "rail sticky" },
    h("section", { class: "card stack", "aria-label": "Davomat holati" }, status, field("Mavzu", topic), finishBtn,
      s.students.length ? h("button", { type: "button", class: "wide", text: "Hammasi keldi", onclick: allPresent }) : null),
    h("section", { class: "card stack plan-card", "aria-labelledby": "plan-h" },
      h("div", { class: "plan-card-head" }, h("h2", { id: "plan-h", text: "Dars rejasi" }), plan && plan.outcome ? chip(OUTCOMES[plan.outcome], plan.outcome === "done" ? "ok" : "warn") : planChip(plan)),
      plan && plan.items.length ? h("ul", { class: "plain plan-list" }, plan.items.map((x) => h("li", { class: x.done ? "done" : null }, icon(x.done ? "check" : "dot"), h("span", { text: x.text })))) : null,
      h("button", { type: "button", class: "wide", text: !plan ? "Reja tuzish" : "Rejani ochish", onclick: () => openPlan(entry, () => lessonView(id)) })),
    h("details", { class: "card fold" }, h("summary", { text: "Dars sozlamalari" }),
      h("form", { class: "stack", onsubmit: async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          if (await act(() => api("PATCH", "/api/sessions/" + id, { date: fd.get("date"), para: Number(fd.get("para")) }))) lessonView(id);
        } },
        h("div", { class: "pair" }, field("Sana", dateField("date", s.date)),
          field("Para", h("select", { name: "para" }, [1, 2].map((p) => h("option", { value: String(p), selected: s.para === p, text: paraText(p) }))))),
        h("button", { type: "submit", class: "wide", text: "Sanani saqlash" })),
      h("button", { type: "button", class: "danger wide", text: "Davomatni o'chirish", onclick: async () => {
        if (!(await ask(dayText(s.date) + ", " + paraText(s.para) + " davomati o'chirilsinmi? Baholar va qayta topshirishlar ham ketadi.", "O'chirish", true))) return;
        if (!(await act(() => api("DELETE", "/api/sessions/" + id)))) return;
        location.hash = "#/darslar";
        sayUndo(dayText(s.date) + " davomati o'chirildi.", async () => {
          await api("POST", "/api/sessions/" + id + "/restore");
          refreshBadge();
          location.hash = "#/dars/" + id;
          return true;
        });
      } })));

  // the lesson as the classroom knows it: what and who, then when and where
  const slotTimes = PARA_TIMES[COURSE.slotOf[s.para] || s.para];
  const when = s.finished_at ? "olindi " + span(s) : "boshlandi " + timeText(s.started_at);
  // a big group in two columns on a wide screen, so the whole list fits without scrolling
  const half = s.students.length > 16 ? Math.ceil(rows.length / 2) : rows.length;
  const rosterTable = (list, extra, i) => h("table", { class: "roster" },
    h("caption", { class: "sr-only", text: i ? "Talabalar, davomi" : "Talabalar: qatorni bosib keldi yoki kelmadi qiling" }),
    h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "n", text: "#" }), h("th", { scope: "col", text: "Talaba" }), h("th", { scope: "col", class: "w-state", text: "Holat" }), h("th", { scope: "col", class: "w-grade", text: "Baho" }))),
    h("tbody", {}, list, extra));
  show(back("#/darslar", "Darslar"),
    pageHead(COURSE.subject + " · " + COURSE.group,
      [capital(longDay(s.date)), paraText(s.para), slotTimes ? slotTimes.join("–") : null, s.room || null, when].filter(Boolean).join(" · "), sessionChip(s)),
    h("div", { class: "split" },
      h("div", {}, s.students.length ? h("div", { class: "roster-find" }, field("Talabani topish", find), found) : null,
        s.students.length ? h("div", { class: "card flush roster-cols" + (half < rows.length ? " two" : "") },
          rosterTable(rows.slice(0, half), noMatch, 0), half < rows.length ? rosterTable(rows.slice(half), null, 1) : null)
        : h("p", { class: "card empty" }, "Ro'yxatda talaba yo'q. ", h("a", { href: "#/talabalar", text: "Talabalarni qo'shing" })),
        (s.missing || []).length ? h("p", { class: "roster-missing" }, (s.missing.length === 1 ? s.missing[0].name + " bu dars ro'yxatida yo'q. " : s.missing.length + " ta faol talaba bu dars ro'yxatida yo'q. "),
          h("button", { type: "button", class: "quiet", text: "Ro'yxatga qo'shish", onclick: () => addLate(id, s.missing) })) : null),
      rail));
}

// students added (or back from the archive) after the lesson started: put them on its list
function addLate(id, missing) {
  const add = async (st, present, btn) => {
    btn.disabled = true;
    if (await act(() => api("POST", "/api/sessions/" + id + "/students", { student_id: st.id, present }))) {
      btn.closest("li").remove();
      if (!sheetBox.querySelector(".late li")) sheetBox.close();
      lessonView(id);
      if (!present) refreshBadge();
    } else btn.disabled = false;
  };
  openSheet("Ro'yxatga qo'shish", h("div", { class: "stack" },
    h("p", { class: "sub", text: "Dars boshlangandan keyin qo'shilgan talabalar. Kelganini yoki kelmaganini belgilang." }),
    h("ul", { class: "plain late" }, missing.map((st) => h("li", {}, h("span", { class: "strong", text: st.name }),
      h("span", { class: "late-acts" },
        h("button", { type: "button", class: "small", text: "Keldi", onclick: (e) => add(st, true, e.currentTarget) }),
        h("button", { type: "button", class: "small", text: "Kelmadi", onclick: (e) => add(st, false, e.currentTarget) }))))),
    h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }))));
}

/* ------------------------------------------------------------ students */
const sf = { key: "owed", dir: -1, q: "" };
const STUDENT_COLS = [["name", "Ism"], ["lessons", "Darslar"], ["came", "Keldi"], ["missed", "Qoldirdi"], ["retaken", "Topshirdi"], ["owed", "Qarz"], ["rate", "Davomat"], ["points", "Ball"], ["average", "O'rtacha"]];

async function studentsView() {
  const show = painter(studentsView, null);   // paints only while this is still the page
  const { students } = await api("GET", "/api/students");
  const active = students.filter((s) => s.active).length;
  const tbody = h("tbody");
  const head = h("tr");
  const nothing = h("p", { class: "card empty", hidden: true, text: "Bu ism bo'yicha hech kim topilmadi." });
  const table = h("div", { class: "card flush" }, h("table", { class: "students" }, h("thead", {}, head), tbody));

  const render = () => {
    const q = sf.q.trim().toLowerCase();
    const cmp = (a, b) => {
      if (sf.key === "name") return sf.dir * a.name.localeCompare(b.name);
      const x = a[sf.key], y = b[sf.key];
      if (x === y) return a.name.localeCompare(b.name);
      if (x === null) return 1;            // no value yet always goes last
      if (y === null) return -1;
      return sf.dir * (x - y);
    };
    const list = students.filter((s) => !q || s.name.toLowerCase().includes(q)).sort((a, b) => b.active - a.active || cmp(a, b));
    head.replaceChildren(...STUDENT_COLS.map(([key, text], i) => h("th", { scope: "col", class: (i ? "num" : "") + (key === "rate" ? " w-rate" : ""), "aria-sort": sf.key === key ? (sf.dir > 0 ? "ascending" : "descending") : null },
      h("button", { type: "button", class: "sort", onclick: () => { if (sf.key === key) sf.dir = -sf.dir; else { sf.key = key; sf.dir = key === "name" ? 1 : -1; } render(); } },
        text, sf.key === key ? icon(sf.dir > 0 ? "up" : "down") : null))));
    tbody.replaceChildren(...list.map((s) => linkRow("#/talaba/" + s.id, [
      h("td", {}, h("a", { class: "strong", href: "#/talaba/" + s.id, text: s.name }), s.active ? null : [" ", chip("Arxiv")]),
      h("td", { class: "num", text: String(s.lessons) }),
      h("td", { class: "num", text: String(s.came) }),
      h("td", { class: "num" + (s.missed ? "" : " muted"), text: String(s.missed) }),
      h("td", { class: "num" + (s.retaken ? "" : " muted"), text: String(s.retaken) }),
      h("td", { class: "num" }, s.owed ? h("span", { class: "badge", text: String(s.owed) }) : h("span", { class: "muted", text: "0" })),
      h("td", { class: "num w-rate" }, h("span", { class: "rate" }, meter(s.rate), h("b", { text: pct(s.rate) }))),
      h("td", { class: "num" + (s.graded ? "" : " muted"), text: s.graded ? fmtNum(s.points) : "–" }),
      h("td", { class: "num" + (s.average === null ? " muted" : ""), text: s.average === null ? "–" : fmtNum(s.average) })], s.active ? null : "off")));
    table.hidden = !list.length;
    nothing.hidden = list.length > 0;
  };

  const addStudents = () => {
    const area = h("textarea", { name: "names", rows: "8", spellcheck: "false", placeholder: "Abdullayev Jasur\nKarimova Madina" });
    openSheet("Talaba qo'shish", h("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        const names = area.value.split("\n").map((x) => x.trim()).filter(Boolean);
        if (!names.length) return say("Kamida bitta ism yozing");
        const res = await act(() => api("POST", "/api/students", { names }));
        if (res) { sheetBox.close(); say(res.added + " ta talaba qo'shildi" + (res.added < names.length ? " (takrorlanganlari o'tkazib yuborildi)" : ""), true); studentsView(); }
      } },
      field("Har qatorda bitta ism", area),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Qo'shish" }))));
  };

  const search = h("input", { type: "search", value: sf.q, placeholder: "Ism bo'yicha qidirish", autocomplete: "off", "aria-label": "Ism bo'yicha qidirish" });
  search.addEventListener("input", () => { sf.q = search.value; render(); });
  render();
  show(pageHead("Talabalar", COURSE.group + " · " + active + " ta faol" + (students.length > active ? ", " + (students.length - active) + " ta arxivda" : ""),
      h("div", { class: "searchbox" }, icon("search"), search),
      h("button", { type: "button", class: "primary", onclick: addStudents }, icon("plus"), "Talaba qo'shish")),
    students.length ? [table, nothing] : h("p", { class: "card empty", text: "Ro'yxat bo'sh. «Talaba qo'shish» tugmasi bilan boshlang." }));
}

async function studentView(id) {
  const show = painter(studentView, id);   // paints only while this is still the page
  const s = await api("GET", "/api/students/" + id);
  const nameInput = h("input", { name: "name", value: s.name, maxlength: "120", required: true });
  const stateOf = (r) => r.present ? h("span", { class: "muted", text: "Keldi" }) : r.retake_at ? chip("Topshirdi", "ok", "check") : chip("Qarz", "bad", "x");

  show(back("#/talabalar", "Talabalar"),
    pageHead(s.name, s.active ? "Faol talaba" : "Arxivda"),
    h("div", { class: "tiles" }, tile("Davomat", pct(s.rate), s.came + " / " + s.lessons + " dars"), tile("Qoldirdi", s.missed), tile("Topshirdi", s.retaken), tile("Qolgan qarz", s.owed),
      s.graded ? tile("O'rtacha baho", fmtNum(s.average), "Jami ball: " + fmtNum(s.points)) : null),
    h("div", { class: "split" },
      h("div", {}, s.history.length ? h("div", { class: "card flush" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Sana" }), h("th", { scope: "col", text: "Para" }), h("th", { scope: "col", text: "Mavzu" }), h("th", { scope: "col", text: "Holat" }), h("th", { scope: "col", class: "num", text: "Baho" }), h("th", { scope: "col", text: "Qayta topshirish" }))),
        h("tbody", {}, s.history.map((r) => linkRow("#/dars/" + r.session_id, [
          h("td", { class: "nowrap" }, h("a", { class: "strong", href: "#/dars/" + r.session_id, text: dayText(r.date) })),
          h("td", { class: "nowrap muted", text: paraText(r.para) }),
          h("td", { class: "clip" + (r.topic ? "" : " muted"), text: r.topic || "Mavzu yozilmagan" }),
          h("td", {}, stateOf(r)),
          h("td", { class: "num" + (r.grade === null ? " muted" : ""), text: r.grade === null ? "–" : fmtNum(r.grade) }),
          h("td", { class: "nowrap muted", text: !r.present && r.retake_at ? retakeText(r) : "–" })])))))
        : h("p", { class: "card empty", text: "Hali darsda qatnashmagan." })),
      h("aside", { class: "rail sticky" },
        h("section", { class: "card", "aria-labelledby": "edit-h" }, h("h2", { id: "edit-h", text: "Tahrirlash" }),
          h("form", { class: "stack", onsubmit: async (e) => {
              e.preventDefault();
              if (await act(() => api("PATCH", "/api/students/" + id, { name: nameInput.value }))) { say("Saqlandi", true); studentView(id); }
            } },
            field("Ism", nameInput), h("button", { type: "submit", class: "wide", text: "Ismni saqlash" })),
          h("button", { type: "button", class: (s.active ? "danger " : "") + "wide gap", text: s.active ? "Arxivga olish" : "Arxivdan qaytarish", onclick: async () => {
            if (s.active && !(await ask(s.name + " arxivga olinsinmi? Yangi darslarda ro'yxatda chiqmaydi, eski davomati saqlanadi.", "Arxivga olish", true))) return;
            if (await act(() => api("PATCH", "/api/students/" + id, { active: !s.active }))) studentView(id);
          } })))));
}

/* ------------------------------------------------------------ retakes (debts) */
const rf = { status: "owed", day: "", student: "", older: false };
async function retakesView() {
  const show = painter(retakesView, null);   // paints only while this is still the page
  const [all, { rooms }] = await Promise.all([api("GET", "/api/retakes"), api("GET", "/api/rooms")]);
  const current = thisSemester(all), r = rf.older ? all : current;
  const days = [...new Set(r.items.map((x) => x.date))].sort().reverse();
  const items = r.items.filter((x) =>
    (rf.status === "all" || (rf.status === "owed" ? !x.retake_at : x.retake_at)) &&
    (!rf.day || x.date === rf.day) && (!rf.student || x.student_id === Number(rf.student)));

  // master list: everyone with a missed lesson, the most owed first
  const people = new Map();
  for (const x of r.items) {
    if (!people.has(x.student_id)) people.set(x.student_id, { id: x.student_id, name: x.name, owed: 0 });
    if (!x.retake_at) people.get(x.student_id).owed++;
  }
  const pick = (idValue) => () => { rf.student = idValue; retakesView(); };
  const master = h("aside", { class: "card flush master", "aria-label": "Talabalar" }, h("ul", { class: "plain" },
    h("li", {}, h("button", { type: "button", class: "pick", "aria-pressed": String(!rf.student), onclick: pick("") }, h("span", { text: "Hamma talabalar" }), h("span", { class: "muted", text: String(r.owed) }))),
    [...people.values()].sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name)).map((p) => h("li", {},
      h("button", { type: "button", class: "pick", "aria-pressed": String(String(p.id) === String(rf.student)), onclick: pick(String(p.id)) },
        h("span", { text: p.name }), p.owed ? h("span", { class: "badge", text: String(p.owed) }) : h("span", { class: "muted", text: "0" }))))));

  const accept = (x) => {
    const f = h("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const ok = await act(() => api("PUT", "/api/retakes/" + x.session_id + "/" + x.student_id, { done: true, date: fd.get("date"), time: fd.get("time"), room: fd.get("room") }));
        if (ok) { sheetBox.close(); say(x.name + ": qabul qilindi", true); retakesView(); refreshBadge(); }
      } },
      h("p", { class: "muted", text: dayText(x.date) + ", " + paraText(x.para) + (x.topic ? ": " + x.topic : "") }),
      h("div", { class: "pair" }, field("Topshirgan kuni", dateField("date", today())),
        field("Vaqti", h("input", { name: "time", type: "text", inputmode: "numeric", value: nowTime(), placeholder: "14:30", maxlength: "5", pattern: "([01]\\d|2[0-3]):[0-5]\\d", title: "Vaqtni 24 soatlik ko'rinishda yozing, masalan 14:30", autocomplete: "off", required: true }))),
      field("Joyi", h("input", { name: "room", list: "rooms", value: rooms[0] || "", maxlength: "60", required: true, autocomplete: "off" })),
      h("datalist", { id: "rooms" }, rooms.map((v) => h("option", { value: v }))),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Qabul qilish" })));
    openSheet(x.name, f);
  };

  const seg = (key, text) => h("button", { type: "button", class: "seg", "aria-pressed": String(rf.status === key), text, onclick: () => { rf.status = key; retakesView(); } });
  const daySel = h("select", { "aria-label": "Qoldirilgan sana", onchange: (e) => { rf.day = e.target.value; retakesView(); } },
    h("option", { value: "", text: "Hamma sanalar" }), days.map((d) => h("option", { value: d, selected: d === rf.day, text: dayText(d) + " " + weekday(d).slice(0, 3) })));

  const rows = items.map((x) => h("tr", { class: x.active ? null : "off" },
    h("td", {}, h("a", { class: "strong person", href: "#/talaba/" + x.student_id, text: x.name })),
    h("td", { class: "nowrap" }, h("a", { href: "#/dars/" + x.session_id, text: dayText(x.date) }), h("span", { class: "muted", text: "  " + paraText(x.para) })),
    h("td", { class: "clip muted", text: x.topic || "–" }),
    x.retake_at
      ? h("td", { class: "right nowrap" }, h("span", { class: "muted", text: retakeText(x) + "  " }),
          h("button", { type: "button", class: "quiet", text: "Bekor qilish", "aria-label": x.name + ": qabulni bekor qilish", onclick: async () => {
            if (!(await ask(x.name + ", " + dayText(x.date) + " " + paraText(x.para) + ": qabul bekor qilinsinmi?", "Qabulni bekor qilish", true))) return;
            if (await act(() => api("PUT", "/api/retakes/" + x.session_id + "/" + x.student_id, { done: false }))) { retakesView(); refreshBadge(); }
          } }))
      : h("td", { class: "right" }, h("button", { type: "button", class: "small", text: "Qabul qilish", onclick: () => accept(x) }))));

  const shareBtn = h("button", { type: "button", text: "Talabalar uchun havola", onclick: () => shareSheet() });
  show(pageHead("Qarzlar", COURSE.group + " · qoldirilgan darslar va ularni qayta topshirish", shareBtn),
    h("div", { class: "tiles" }, tile("Jami qoldirilgan", r.missed), tile("Topshirilgan", r.retaken), tile("Qolgan", r.owed)),
    h("div", { class: "split left" }, master,
      h("div", { class: "stack" },
        h("div", { class: "toolbar" }, h("div", { class: "seg-row", role: "group", "aria-label": "Holat" }, seg("owed", "Qolgan"), seg("done", "Topshirilgan"), seg("all", "Hammasi")),
          current.older ? h("button", { type: "button", class: "seg older-toggle", "aria-pressed": String(rf.older), title: "Oldingi semestrlarning qarzlari ham", text: "Oldingi semestrlar (" + current.older + ")", onclick: () => { rf.older = !rf.older; retakesView(); } }) : null, daySel),
        rows.length ? h("div", { class: "card flush" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Talaba" }), h("th", { scope: "col", text: "Dars" }), h("th", { scope: "col", text: "Mavzu" }), h("th", { scope: "col", class: "right", text: "Qayta topshirish" }))),
          h("tbody", {}, rows)))
          : h("p", { class: "card empty", text: rf.status === "owed" ? "Bu tanlovda qarz yo'q." : "Bu tanlovda hech narsa yo'q." }))));
}

// the students' read-only copy of this page, behind a secret link the owner hands out
async function shareSheet() {
  const { share } = await api("GET", "/api/retake-share");
  const make = async () => {
    const res = await act(() => api("POST", "/api/retake-share", { title: COURSE.subject + " · " + COURSE.group, paras: COURSE.slotOf }));
    if (res) { say(share ? "Yangi havola tayyor, eskisi endi ochilmaydi" : "Havola tayyor", true); shareSheet(); }
  };
  if (!share) {
    return openSheet("Talabalar uchun havola", h("div", { class: "stack" },
      h("p", { text: "Talabalar havola orqali kimda nechta qarz borligini, qaysi kunlar va qaysi mavzular ekanini ko'radi. O'zgartira olmaydi." }),
      h("p", { class: "sub", text: "Ismlar qisqa ko'rinadi (Karimov A.). Havolani faqat guruhga bering: uni bilgan har kim sahifani ochadi." }),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "button", class: "primary", text: "Havola yaratish", onclick: make }))));
  }
  const url = location.origin + "/q/" + share.token;
  const input = h("input", { type: "text", readonly: true, value: url, "aria-label": "Havola", onfocus: (e) => e.target.select() });
  const copy = h("button", { type: "button", class: "primary", text: "Nusxa olish", onclick: async () => {
    try { await navigator.clipboard.writeText(url); say("Havola nusxalandi", true); } catch (err) { input.select(); say("Havolani belgilab, Ctrl+C bosing"); }
  } });
  openSheet("Talabalar uchun havola", h("div", { class: "stack" },
    h("p", { class: "sub", text: "Shu havolani guruh chatiga yuboring. Sahifa har ochilganda hozirgi holatni ko'rsatadi; ismlar qisqa." }),
    h("div", { class: "sync-row" }, input, copy),
    h("p", {}, h("a", { href: url, target: "_blank", rel: "noopener", text: "Talaba ko'radigan sahifani ochish" })),
    h("div", { class: "dialog-actions" },
      h("button", { type: "button", class: "quiet", text: "O'chirish", onclick: async () => {
        if (!(await ask("Havola o'chirilsinmi? Talabalar sahifani ocha olmay qoladi.", "O'chirish", true))) return;
        if (await act(() => api("DELETE", "/api/retake-share"))) { say("Havola o'chirildi", true); sheetBox.close(); }
      } }),
      h("button", { type: "button", text: "Yangi havola", title: "Eski havola ishlamay qoladi", onclick: async () => {
        if (await ask("Yangi havola yaratilsinmi? Eskisi endi ochilmaydi.", "Yangi havola")) make();
      } }))));
  input.select();
}

/* ------------------------------------------------------------ timetable */
const jw = { offset: 0 };    // weeks from the current one

// the timetable cell is narrow: its status shows the short form, so the room is never cut off
const SHORT_STATE = { "Davomatni boshlash": "Boshlash" };
function state(text, iconName, cls) {
  const short = SHORT_STATE[text];
  return h("span", { class: "state-line" + (cls ? " " + cls : "") }, iconName ? icon(iconName) : null,
    short ? [h("span", { class: "full", text }), h("span", { class: "short", "aria-hidden": "true", text: short })] : text);
}

// a card has the subject's colour: full when attendance is taken, a lighter shade otherwise
function cardLines(subject, type, group, room, status) {   // room and status share the last line: a week should fit one screen
  const meta = [type, group].filter(Boolean).join(" · ");
  // the timetable shows the short name on one line; the home page has the room for the whole name
  return [h("b", { title: subject }, h("span", { class: "name-full", text: subject }), h("span", { class: "name-short", text: shortSubject(subject) })), h("small", { text: meta, title: meta }),
    room || status ? h("span", { class: "slot-foot" }, room ? h("small", { text: room, title: room }) : null, status) : null];
}
async function setCancelled(e, cancelled) {
  const subject = e.kind === "site" ? canonSubject(e.lesson.subject) : e.subject || COURSE.subject;
  if (await act(() => api("PUT", "/api/cancelled", { date: e.date, para: e.para, subject, cancelled }))) scheduleView();
}
// "the lesson did not happen": takes it off the timetable and out of the teaching load
function withCancel(card, e) {
  const name = e.kind === "site" ? e.lesson.subject : COURSE.subject;
  return h("div", { class: "slot-wrap" }, card, h("button", { type: "button", class: "slot-x", title: "Dars bo'lmadi", "aria-label": name + ", " + shortDate(e.date) + ", " + e.para + "-para: dars bo'lmadi", onclick: async () => {
    if (await ask(shortDate(e.date) + ", " + e.para + "-para: dars bo'lmadimi? Jadvaldan olinadi va yuklamaga kirmaydi.", "Dars bo'lmadi", true)) setCancelled(e, true);
  } }, icon("x")));
}

async function startCourse(e) {
  const t = today(), label = shortDate(e.date) + ", " + e.para + "-para";
  if (e.date !== t && !(await ask(label + " uchun davomat boshlansinmi? Hamma «keldi» bo'lib turadi.", "Boshlash"))) return;
  const res = await act(() => api("POST", "/api/sessions", { date: e.date, para: e.appPara, room: COURSE.room, topic: (planOf(e) || {}).topic || "" }));
  if (res) location.hash = "#/dars/" + res.id;
}
function courseCard(e, color) {
  const t = today(), s = e.session, over = paraOver(e, t, nowTime());
  const lines = (status) => cardLines(COURSE.subject, COURSE.type, COURSE.group, COURSE.room, status);
  if (s) return h("a", { class: "slot " + color + (s.finished_at ? " taken" : ""), href: "#/dars/" + s.id },
    lines(s.finished_at ? state(s.came + "/" + s.total, "check", "ok") : over ? state("Tugatilmagan", null, "bad") : state("Olinmoqda", null, "active")));
  const label = shortDate(e.date) + ", " + e.para + "-para";
  if (e.date > t) return h("button", { type: "button", class: "slot " + color, "aria-label": COURSE.subject + ", " + label + ": dars rejasi", onclick: () => openPlan(e, route) }, lines(planState(planOf(e))));
  return h("button", { type: "button", class: "slot " + color, "aria-label": COURSE.subject + ", " + label + ": davomatni boshlash", onclick: () => startCourse(e) },
    lines(over ? state("Olinmagan", null, "bad") : state("Davomatni boshlash", null, "active")));
}
// how far through the para the clock is, drawn across today's cell
function nowLine(p, now) {
  const mins = (x) => { const [a, b] = x.split(":").map(Number); return a * 60 + b; };
  const [from, to] = PARA_TIMES[p].map(mins);
  const line = h("i", { class: "now-line", title: "Hozir " + now });
  line.style.setProperty("--p", Math.round(100 * (mins(now) - from) / (to - from)));
  return line;
}
// a lesson still to come opens its plan; one that is over opens the site, where its attendance is taken
function siteCard(l, ctx, color, e) {
  const st = Timetable.siteStatus(l, ctx, today(), nowTime());
  const taken = st === "taken", coming = e && st === "coming";
  // "Noma'lum": the lesson ended after the site's list was last read, so the app cannot know
  const status = coming ? planState(planOf(e)) : taken ? state("Olingan", "check", "ok") : st === "missing" ? state("Olinmagan", null, "bad") : st === "unknown" ? state("Noma'lum", null, "unknown") : null;
  const lines = cardLines(l.subject, fmtType(l.type), l.group, fmtRoom(l.room), status);
  const cls = "slot " + color + (taken ? " taken" : "");
  if (coming) return h("button", { type: "button", class: cls, "aria-label": l.subject + ", " + shortDate(l.date) + ", " + l.para + "-para: dars rejasi", onclick: () => openPlan(e, route) }, lines);
  return l.url ? h("a", { class: cls, href: SITE + l.url, target: "_blank", rel: "noopener", title: "digital.oxu.uz da ochish" }, lines) : h("div", { class: cls }, lines);
}

// One colour per subject, the same on every page and every week. A subject keeps the colour it was
// first given (saved on the server), so a new subject in the load never reshuffles the others; the
// owner can change it, and a short name for the timetable, by clicking the subject under the timetable.
const COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const COLOR_NAMES = { c1: "Ko'k", c2: "To'q sariq", c3: "Yashil", c4: "Binafsha", c5: "Pushti", c6: "Firuza", c7: "Oltin", c8: "Qizil" };
const FIRST_COLORS = { [COURSE.subject]: "c1", "Tibbiyotda axborot texnologiyalar": "c2" };   // the owner's own picks, used when a subject is first seen
const subjectStyles = { loaded: false, map: {} };
async function loadStyles() {
  try { subjectStyles.map = (await api("GET", "/api/subject-styles")).styles; subjectStyles.loaded = true; } catch (err) { /* colours fall back to name order */ }
}
function subjectColors(data) {
  const all = [...((data && data.lessons) || []), ...((data && data.unsaved) || []), ...((data && data.load && data.load.items) || [])];
  const subjects = [COURSE.subject, ...[...new Set(all.map((l) => canonSubject(l.subject)))].sort((a, b) => a.localeCompare(b))];
  const map = subjectStyles.map, fresh = {};
  const used = (c) => Object.values(map).filter((x) => x.color === c).length + Object.values(fresh).filter((x) => x.color === c).length;
  const give = (name, color) => { fresh[name] = { color, short: "" }; };
  if (!Object.keys(map).length) {
    // the first time: keep every colour as it was shown until now (name order), and give the owner's
    // picks by swapping with whichever subject had that colour
    subjects.forEach((name, i) => give(name, COLORS[i % 8]));
    for (const [name, color] of Object.entries(FIRST_COLORS)) {
      if (!fresh[name]) continue;
      const other = Object.keys(fresh).find((n) => n !== name && fresh[n].color === color);
      if (other) fresh[other].color = fresh[name].color;
      fresh[name].color = color;
    }
  }
  for (const name of subjects) if (!map[name] && !fresh[name] && FIRST_COLORS[name] && !used(FIRST_COLORS[name])) give(name, FIRST_COLORS[name]);
  for (const name of subjects) if (!map[name] && !fresh[name]) give(name, COLORS.reduce((best, c) => (used(c) < used(best) ? c : best), COLORS[0]));   // the least used colour, in palette order
  if (Object.keys(fresh).length && subjectStyles.loaded) {
    Object.assign(map, fresh);
    api("PUT", "/api/subject-styles", { styles: fresh }).catch(() => {});   // fixed from now on
  }
  return (name) => (map[canonSubject(name)] || fresh[canonSubject(name)] || { color: "c1" }).color;
}
// the timetable's name for a subject: the owner's short name, else whole words up to about 24 letters
function shortSubject(name) {
  const style = subjectStyles.map[canonSubject(name)];
  if (style && style.short) return style.short;
  const words = canonSubject(name).split(/\s+/), out = [];
  for (const w of words) { if (out.length && (out.join(" ") + " " + w).length > 24) break; out.push(w); }
  while (out.length > 1 && /^(va|bilan|uchun|hamda)$/i.test(out[out.length - 1])) out.pop();
  return out.join(" ") + (out.length < words.length ? "…" : "");
}
function editSubject(name, after) {
  const subj = canonSubject(name), cur = subjectStyles.map[subj] || { color: "c1", short: "" };
  let color = cur.color;
  const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Rang" });
  const draw = () => swatches.replaceChildren(...COLORS.map((c) => h("button", { type: "button", class: "swatch " + c, role: "radio", "aria-checked": String(c === color), "aria-label": COLOR_NAMES[c], title: COLOR_NAMES[c] + (Object.entries(subjectStyles.map).some(([n, x]) => n !== subj && x.color === c) ? ": boshqa fanda ham bor" : ""), onclick: () => { color = c; draw(); } }, h("i"))));
  draw();
  const short = h("input", { name: "short", value: cur.short, maxlength: "40", autocomplete: "off", placeholder: shortSubject(subj) });
  openSheet(subj, h("form", { class: "stack", onsubmit: async (e) => {
      e.preventDefault();
      const style = { color, short: short.value.trim() };
      if (!(await act(() => api("PUT", "/api/subject-styles", { styles: { [subj]: style } })))) return;
      subjectStyles.map[subj] = style; sheetBox.close(); say("Saqlandi", true); if (after) after();
    } },
    h("div", { class: "field" }, h("span", { text: "Rang" }), swatches),
    field("Jadvaldagi qisqa nomi", short),
    h("p", { class: "sub", text: "Bo'sh qolsa, nomning boshi bitta qatorga sig'guncha olinadi. Boshqa sahifalarda to'liq nomi turadi." }),
    h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Saqlash" }))));
}

// the semester the course lessons are generated in; loaded once, and again when Kabinet saves it
const semesterNow = { loaded: false, start: "", weeks: 0, end: "" };
async function loadSemester() {
  try {
    const { start, weeks } = await api("GET", "/api/semester");
    Object.assign(semesterNow, { loaded: true, start, weeks, end: Pace.semester(start, weeks, start).end });
  } catch (err) { /* without it the course lessons are not bounded */ }
}

// the site lists a lesson as "unsaved" from the morning of its day; it is only missing once its para has ended
const lessonOver = (l) => paraOver({ date: l.date, para: Number(l.para) }, today(), nowTime());
// the home page's lead: the next lesson at a size that reads from across the room, with its action
// note: replaces the countdown, for a lesson that is over but still needs its attendance finished
function nextHero(e, t, now, action, note) {
  const times = PARA_TIMES[e.para], onDay = e.date === t, isNow = onDay && times && times[0] <= now && now <= times[1];
  const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const span = (n) => [n >= 60 ? Math.floor(n / 60) + " soat" : "", n % 60 ? (n % 60) + " daqiqa" : ""].filter(Boolean).join(" ");
  const days = Math.round((Date.parse(e.date) - Date.parse(t)) / 864e5);
  const when = note ? note : isNow ? "Tugashiga " + span(mins(times[1]) - mins(now))
    : onDay && times ? span(mins(times[0]) - mins(now)) + "dan keyin"
    : days === 1 ? "Ertaga" : days + " kundan keyin";
  const [date, weekday] = longDay(e.date).split(", ");   // on another day the date leads, not the hour
  const site = e.kind === "site", plan = planOf(e);
  const label = note ? "Tugatilmagan dars" : isNow ? "Hozirgi dars" : "Keyingi dars";
  return h("section", { class: "today-top" + (isNow || note ? " live" : "") + (onDay ? "" : " later"), "aria-label": label },
    h("span", { class: "eyebrow", text: label }),
    h("div", { class: "hero-time" }, h("b", { text: onDay ? (times ? times[0] : e.para + "-para") : date }),
      h("span", { text: onDay ? e.para + "-para" : [capital(weekday), times && times[0], e.para + "-para"].filter(Boolean).join(" · ") })),
    h("div", { class: "hero-body" },
      h("h2", { text: site ? e.lesson.subject : COURSE.subject }),
      h("p", { class: "hero-meta", text: (site ? [fmtType(e.lesson.type), e.lesson.group, fmtRoom(e.lesson.room)] : [COURSE.type, COURSE.group, COURSE.room]).filter(Boolean).join(" · ") }),
      h("p", { class: "hero-line" }, h("span", { class: "hero-when", text: when }),
        note ? null : [planState(plan), plan && plan.topic ? h("span", { class: "hero-topic", text: plan.topic }) : null])),
    h("div", { class: "hero-act" },
      note ? null : h("button", { type: "button", text: plan ? "Rejani ochish" : "Reja tuzish", onclick: () => openPlan(e, homeView) }), action));
}
function nextBand(e, t, now, action) {
  const times = PARA_TIMES[e.para], isNow = e.date === t && times && times[0] <= now && now <= times[1];
  return h("section", { class: "card next", "aria-label": "Keyingi dars" },
    h("span", { class: "label", text: isNow ? "Hozirgi dars" : "Keyingi dars" }),
    h("b", { text: e.kind === "site" ? e.lesson.subject : COURSE.subject + " · " + COURSE.type + " · " + COURSE.group }),
    h("span", { class: "muted", text: [capital(relDay(e.date) || longDay(e.date)), e.para + "-para", times ? times.join("–") : "", e.kind === "site" ? fmtRoom(e.lesson.room) : COURSE.room].filter(Boolean).join(" · ") }),
    action || null);
}

/* ------------------------------------------------------------ lesson plans */
// The teacher's own preparation for each lesson: a topic, a few points, and whether they are ready.
// A teacher gives one lesson per para, so date + timetable para name the lesson, for site lessons too.
const planCache = { plans: new Map(), topics: {}, sessions: [] };
const planKey = (date, para) => date + "|" + Number(para);
async function loadPlans() {
  const { plans, topics } = await api("GET", "/api/plans");
  planCache.plans = new Map(plans.map((p) => [planKey(p.date, p.para), p]));
  planCache.topics = topics;
  return planCache;
}
const planOf = (e) => planCache.plans.get(planKey(e.date, e.para)) || null;
const STAGES = { none: "Reja yo'q", planned: "Reja bor", ready: "Tayyor" };
const OUTCOMES = { done: "O'tildi", partial: "Qisman o'tildi", moved: "Keyingi darsga qoldi" };
function planState(p) {
  const st = planStage(p);
  return state(STAGES[st], st === "ready" ? "check" : null, st === "ready" ? "ok" : st === "planned" ? "active" : null);
}
function planChip(p) {
  const st = planStage(p);
  return chip(STAGES[st], st === "ready" ? "ok" : st === "planned" ? "live" : null, st === "ready" ? "check" : null);
}

async function classContext() {   // the timetable as the other pages see it, for finding the next lesson of a class
  const [{ sessions }, { data }, { items }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled")]);
  return lessonContext(sessions, data, new Set(items.map((c) => cancelKey(c.date, c.para, c.subject))));
}
const savePlan = (e, p) => {
  const info = entryInfo(e);
  return api("PUT", "/api/plans", { date: e.date, para: e.para, subject: info.subject, group: info.group, topic: p.topic, items: p.items, ready: p.ready, outcome: p.outcome });
};
// points not reached go to the next lesson of the same class, after what is already planned there
async function carryOver(e, p) {
  const left = p.items.filter((x) => !x.done);
  if (!left.length) return "";
  const next = nextOfClass(e, await classContext());
  if (!next) return "Keyingi dars jadvalda topilmadi, bandlar shu darsda qoldi.";
  const there = planOf(next) || { topic: "", items: [], ready: false, outcome: "" };
  const have = new Set(there.items.map((x) => x.text.toLowerCase()));
  const add = left.filter((x) => !have.has(x.text.toLowerCase())).map((x) => ({ text: x.text, done: false }));
  if (!add.length && there.topic) return "";
  await savePlan(next, { ...there, topic: there.topic || p.topic, items: [...add, ...there.items].slice(0, 20), ready: add.length ? false : there.ready });
  return add.length + " ta band " + shortDate(next.date) + ", " + next.para + "-para ga o'tkazildi.";
}

// the plan of one lesson, in a sheet: before the lesson the points and "ready", after it the outcome
function openPlan(e, after, sessions) {
  const info = entryInfo(e), t = today(), over = paraOver(e, t, nowTime());
  const saved = planOf(e);
  const p = saved ? { ...saved, items: saved.items.map((x) => ({ ...x })) } : { topic: "", items: [], ready: false, outcome: "" };
  const listId = "plan-topics";
  const syllabus = planCache.topics[info.subject] || [];
  const topic = h("input", { name: "topic", value: p.topic, maxlength: "200", autocomplete: "off", list: syllabus.length ? listId : null, placeholder: "Masalan: Sikllar" });
  const idea = !p.topic ? suggestTopic(info, sessions) : "";
  const hint = idea ? h("button", { type: "button", class: "quiet hint-topic", onclick: () => { topic.value = idea; hint.remove(); itemIn.focus(); } }, "Kurs rejasi bo'yicha keyingisi: ", h("b", { text: idea })) : null;

  const list = h("ul", { class: "plain plan-items" });
  const drawItems = () => list.replaceChildren(...p.items.map((x, i) => {
    const text = h("input", { value: x.text, maxlength: "200", autocomplete: "off", "aria-label": (i + 1) + "-band" });
    text.addEventListener("input", () => { x.text = text.value; });
    const tick = over ? h("input", { type: "checkbox", checked: x.done, "aria-label": x.text + ": o'tildi", onchange: (ev) => { x.done = ev.target.checked; } }) : h("span", { class: "plan-n", text: (i + 1) + "." });
    return h("li", {}, tick, text, h("button", { type: "button", class: "icon-btn", "aria-label": x.text + " bandini o'chirish", onclick: () => { p.items.splice(i, 1); drawItems(); itemIn.focus(); } }, icon("x")));
  }));
  const itemIn = h("input", { maxlength: "200", autocomplete: "off", placeholder: p.items.length ? "Yana band, Enter" : "Nima o'tasiz? Har birini Enter bilan qo'shing", "aria-label": "Yangi band" });
  const addItem = () => {
    const v = itemIn.value.trim();
    if (!v) return false;
    if (p.items.length >= 20) { say("Bandlar 20 tadan oshmasin"); return true; }
    p.items.push({ text: v, done: false }); itemIn.value = ""; itemIn.placeholder = "Yana band, Enter"; drawItems(); return true;
  };
  itemIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); addItem(); } });
  drawItems();

  const seg = (options, value, set) => {
    const row = h("div", { class: "seg-row", role: "group" });
    const draw = (v) => row.replaceChildren(...options.map(([k, label]) => h("button", { type: "button", class: "seg", "aria-pressed": String(v === k), onclick: () => { set(v === k && over ? "" : k); draw(v === k && over ? "" : k); } }, label)));
    draw(value);
    return row;
  };
  const readyRow = seg([[false, "Reja bor"], [true, "Tayyor"]], p.ready, (v) => { p.ready = !!v; });
  const outcomeRow = over ? seg(Object.entries(OUTCOMES), p.outcome, (v) => { p.outcome = v; }) : null;

  const save = async () => {
    addItem();
    p.topic = topic.value.trim();
    p.items = p.items.map((x) => ({ text: x.text.trim(), done: x.done })).filter((x) => x.text);
    if (p.outcome === "done") p.items.forEach((x) => { x.done = true; });
    if (!(await act(() => savePlan(e, p)))) return;
    let note = "";
    if (p.outcome === "partial" || p.outcome === "moved") note = (await act(() => carryOver(e, p))) || "";
    sheetBox.close();
    say(["Reja saqlandi.", note].filter(Boolean).join(" "), true);
    await loadPlans();
    if (after) after();
  };
  const form = h("form", { class: "stack plan-form", onsubmit: (ev) => { ev.preventDefault(); save(); } },
    h("p", { class: "sub", text: [info.type, info.group, info.room].filter(Boolean).join(" · ") }),
    field("Mavzu", topic), hint,
    syllabus.length ? h("datalist", { id: listId }, syllabus.map((x) => h("option", { value: x }))) : null,
    h("div", { class: "field" }, h("span", { text: over ? "Bandlar: o'tilganini belgilang" : "Nima o'taman" }), list, itemIn),
    over ? h("div", { class: "field" }, h("span", { text: "Dars natijasi" }), outcomeRow,
      h("small", { class: "muted", text: "«Qisman» yoki «keyingi darsga qoldi»da belgilanmagan bandlar keyingi darsga o'tadi." }))
      : h("div", { class: "field" }, h("span", { text: "Tayyorlik" }), readyRow),
    h("div", { class: "dialog-actions" },
      info.url ? h("a", { class: "button quiet push-left", href: SITE + info.url, target: "_blank", rel: "noopener", text: "Saytda ochish" }) : null,
      h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }),
      h("button", { type: "submit", class: "primary", title: "Ctrl+Enter", text: "Saqlash" })));
  // Ctrl+Enter saves from anywhere in the sheet, also when the focus is on a toggle or nowhere
  const onKey = (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); } };
  sheetBox.addEventListener("keydown", onKey);
  sheetBox.addEventListener("close", () => sheetBox.removeEventListener("keydown", onKey), { once: true });
  openSheet(capital(relDay(e.date) || shortDate(e.date)) + ", " + e.para + "-para · " + info.name, form);
  (p.topic ? itemIn : topic).focus();
}

// the plans page: the current lesson day, the rest of the week folded, and each class against its topic list
const PLAN_DAYS = 7;
async function plansView() {
  const show = painter(plansView, null);   // paints only while this is still the page
  const [{ sessions }, { data }, { items: cancelledList }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled"), loadPlans()]);
  const t = today(), now = nowTime();
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const ctx = lessonContext(sessions, data, cancelled);
  planCache.sessions = sessions;
  const redraw = () => plansView();
  const byTime = (a, b) => a.date.localeCompare(b.date) || a.para - b.para;
  const coming = entriesFor([...Array(PLAN_DAYS).keys()].map((i) => shiftDay(t, i)), ctx).filter((e) => !paraOver(e, t, now)).sort(byTime);
  // today while it still has lessons, else the next day that has them; a lesson that is over leaves
  const lead = coming.length ? coming[0].date : null;
  const current = coming.filter((e) => e.date === lead), later = coming.filter((e) => e.date !== lead);
  const ready = current.filter((e) => planStage(planOf(e)) === "ready").length;

  const dayTitle = (d) => (relDay(d) ? capital(relDay(d)) + ", " : d === shiftDay(t, 1) ? "Ertaga, " : "") + longDay(d);

  // which lesson of its kind each one is this semester: "5-amaliy", "3-ma'ruza"; every para counts, a cancelled one does not
  const start = (data && data.load && data.load.start) || ctx.firstDay || t;
  const lastDay = shiftDay(t, PLAN_DAYS - 1);
  const span = [];
  for (let d = start; d <= lastDay && span.length < 240; d = shiftDay(d, 1)) span.push(d);
  const all = entriesFor(span, ctx).sort(byTime);
  const kindKey = (e) => { const i = entryInfo(e); return i.subject + "|" + i.group + "|" + i.type; };
  const entryKey = (e) => e.date + "|" + e.para + "|" + e.kind;
  const counts = new Map(), number = new Map();
  for (const e of all) { const k = kindKey(e), n = (counts.get(k) || 0) + 1; counts.set(k, n); number.set(entryKey(e), n); }
  const planned = new Map();   // the load's paras per class, when the site gives them
  for (const item of (data && data.load && data.load.items) || []) planned.set(canonSubject(item.subject) + "|" + item.group + "|" + fmtType(item.type), Number(item.hours) / HOURS_PER_PARA);
  const ordinal = (e) => {
    const n = number.get(entryKey(e)), info = entryInfo(e);
    if (!n || !info.type) return null;
    const of = planned.get(kindKey(e));
    return h("span", { class: "ordinal", title: of ? "Semestrda " + of + " ta " + info.type.toLowerCase() : null, text: n + "-" + info.type.toLowerCase() });
  };

  const colorOf = subjectColors(data);
  const row = (e, action) => {
    const p = planOf(e), info = entryInfo(e), n = p ? p.items.length : 0;
    const open = () => openPlan(e, redraw, sessions);
    return h("tr", { class: "tap", onclick: (ev) => { if (!ev.target.closest("button")) open(); } },
      h("td", { class: "nowrap strong para" }, e.para + "-para", PARA_TIMES[e.para] ? h("small", { class: "muted", text: PARA_TIMES[e.para][0] + "–" + PARA_TIMES[e.para][1] }) : null),
      h("td", { class: "lesson" }, h("span", { class: "key " + colorOf(info.name) }, h("i"), info.name),
        h("small", {}, ordinal(e), info.group ? h("span", { class: "muted", text: info.group }) : null)),
      h("td", { class: "topic" + (p && p.topic ? "" : " muted") }, p && p.topic ? p.topic : "Mavzu yozilmagan",
        n ? h("small", { class: "muted", text: n + " ta band" }) : null),
      h("td", { class: "right nowrap" }, action || h("button", { type: "button", class: "quiet", onclick: open }, planChip(p))));
  };
  // one heading per day, the lessons under it in para order
  const table = (list) => {
    const days = [...new Set(list.map((x) => x.date))];
    return h("div", { class: "card flush" }, h("table", { class: "plans" }, days.map((d) => h("tbody", {},
      h("tr", { class: "group" + (d === t ? " today" : "") }, h("th", { colspan: "4", scope: "colgroup" }, h("span", { text: dayTitle(d) }), h("small", { text: list.filter((x) => x.date === d).length + " ta dars" }))),
      list.filter((x) => x.date === d).sort((a, b) => a.para - b.para).map((x) => x.row)))));
  };

  // every class taught this semester, with how far its topic list has got
  const days = [];
  for (let d = start; d <= t && days.length < 200; d = shiftDay(d, 1)) days.push(d);
  const classes = new Map();
  for (const e of [...entriesFor(days, ctx), ...coming]) {
    const info = entryInfo(e), key = info.subject + "|" + info.group;
    if (!classes.has(key)) classes.set(key, { info, days: new Set() });
    if (paraOver(e, t, now)) classes.get(key).days.add(e.date);   // a double para is usually one topic: days are counted
  }
  const editTopics = (info) => {
    const area = h("textarea", { rows: "12", spellcheck: "false", placeholder: "Kirish\nO'zgaruvchilar va turlar\nShart operatorlari" });
    area.value = (planCache.topics[info.subject] || []).join("\n");
    openSheet(info.subject + ": semestr mavzulari", h("form", { class: "stack", onsubmit: async (ev) => {
        ev.preventDefault();
        const topics = area.value.split("\n").map((x) => x.trim()).filter(Boolean);
        if (await act(() => api("PUT", "/api/course-topics", { subject: info.subject, topics }))) { sheetBox.close(); say("Mavzular saqlandi", true); redraw(); }
      } },
      field("Har qatorda bitta mavzu, o'tiladigan tartibda", area),
      h("p", { class: "sub", text: "Mavzu «o'tildi» deb belgilangan rejalardan" + (info.subject === COURSE.subject ? " va davomatda yozilgan mavzulardan" : "") + " hisoblanadi. Bir xil guruhdagi barcha fanlar uchun bitta ro'yxat." }),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Saqlash" }))));
    area.focus();
  };
  // one row per subject: the topic list belongs to the subject, its groups only differ in how far they are
  const bySubject = new Map();
  for (const c of classes.values()) {
    if (!bySubject.has(c.info.subject)) bySubject.set(c.info.subject, []);
    bySubject.get(c.info.subject).push(c);
  }
  const courseRows = [...bySubject.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([subject, group]) => {
    const list = planCache.topics[subject] || [];
    const shown = group.map((c) => ({ ...c, name: c.info.group.replace(/_yopildi.*/i, "") }));
    // each group's lag; the subject row shows the one furthest behind and says which it is
    const lag = shown.map((c) => {
      const done = coveredTopics(c.info, sessions);
      return { c, taught: list.filter((x) => done.has(normTitle(x))).length, held: c.days.size };
    }).map((x) => ({ ...x, behind: x.held - x.taught }));
    const worst = lag.reduce((m, x) => (x.behind > m.behind ? x : m), lag[0]);
    const best = lag.reduce((m, x) => (x.taught > m.taught ? x : m), lag[0]);
    const groups = shown.map((c) => c.name).filter(Boolean), few = groups.slice(0, 3);
    const info = group[0].info;
    return h("tr", {},
      h("td", {}, h("b", { text: info.name }), groups.length ? h("small", { class: "muted block", text: few.join(", ") + (groups.length > 3 ? " +" + (groups.length - 3) : "") }) : null),
      list.length ? [h("td", { class: "w-rate" }, h("span", { class: "rate" }, meter(100 * best.taught / list.length), h("b", { text: best.taught + " / " + list.length }))),
        h("td", { class: "muted" + (worst.behind > 0 ? " warn-text" : ""), text: worst.behind > 0 ? "~" + worst.behind + " dars orqada" + (group.length > 1 ? ": " + worst.c.name : "") : worst.held ? "Reja bo'yicha" : "Hali dars bo'lmagan" })]
        : [h("td", { class: "muted", colspan: "2", text: "Mavzular ro'yxati kiritilmagan" })],
      h("td", { class: "right" }, h("button", { type: "button", class: "quiet", text: list.length ? "Mavzular" : "Kiritish", onclick: () => editTopics(info) })));
  });

  const asRows = (list) => list.map((e) => ({ date: e.date, para: e.para, row: row(e) }));
  const leadTitle = !lead ? "Kelgusi darslar" : lead === t ? "Bugungi darslar" : lead === shiftDay(t, 1) ? "Ertangi darslar" : capital(weekday(lead)) + "dagi darslar";
  show(withAge(data, "lessons", "Shundan keyin o'tgan darslar holati noma'lum.", pageHead("Dars rejasi", !current.length ? "Keyingi " + PLAN_DAYS + " kunda dars yo'q" : capital(dayTitle(lead)) + " · " + current.length + " ta dars" + (ready === current.length ? ", hammasiga tayyor" : ready ? ", " + ready + " tasiga tayyor" : ", hali tayyor emas"))),
    h("section", { "aria-labelledby": "next-h", class: "stack" }, h("h2", { id: "next-h", class: "section-title", text: leadTitle }),
      current.length ? table(asRows(current)) : h("p", { class: "card empty", text: "Keyingi " + PLAN_DAYS + " kunda dars yo'q." })),
    later.length ? h("details", { class: "fold-line later-days" }, h("summary", { text: "Keyingi kunlar: " + later.length + " ta dars" }), table(asRows(later))) : null,
    h("section", { "aria-labelledby": "course-h", class: "stack" }, h("h2", { id: "course-h", class: "section-title", text: "Kurs rejasi" }),
      h("p", { class: "sub", text: "O'tilgan mavzular semestr ro'yxatiga qarab. «Orqada» taxminiy: bir dars kuni bir mavzu deb hisoblanadi." }),
      courseRows.length ? h("div", { class: "card flush" }, h("table", {}, h("tbody", {}, courseRows))) : h("p", { class: "card empty", text: "Bu semestrda dars topilmadi." })));
}

async function scheduleView() {
  const show = painter(scheduleView, null);   // paints only while this is still the page
  const [{ sessions }, { data, synced_at }, { items: cancelledList }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled"), loadPlans()]);
  planCache.sessions = sessions;
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const t = today(), now = nowTime();
  const ctx = lessonContext(sessions, data, cancelled);
  const { unsavedList, unsaved } = ctx;
  const colorOf = subjectColors(data);
  const thisMonday = shiftDay(t, -((dowOf(t) + 6) % 7));
  const monday = shiftDay(thisMonday, jw.offset * 7);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => shiftDay(monday, i));

  const weekEntries = (list) => entriesFor(list, ctx);
  const entries = weekEntries(days);
  const shownDays = days.filter((d, i) => i < 5 || entries.some((e) => e.date === d));   // weekends only when there is a lesson
  const paras = entries.length ? entries.map((e) => e.para) : [3, 4];
  const rows = [];
  for (let p = Math.min(...paras); p <= Math.max(...paras); p++) rows.push(p);

  const nowPara = (p) => PARA_TIMES[p] && PARA_TIMES[p][0] <= now && now <= PARA_TIMES[p][1];
  const nextUp = nextEntry(ctx, t, now);
  const next = nextUp && !days.includes(nextUp.date) ? nextBand(nextUp, t, now) : null;   // in this week the grid itself marks it
  const mark = (node, e) => {
    if (!nextUp || e.date !== nextUp.date || e.para !== nextUp.para || e.kind !== nextUp.kind) return node;
    const slot = node.matches(".slot") ? node : node.querySelector(".slot");
    slot.classList.add("up"); slot.title = "Keyingi dars";
    return node;
  };

  const move = (n, label) => async () => {   // the buttons are redrawn, so the keyboard focus is put back
    jw.offset = n === 0 ? 0 : jw.offset + n;
    await scheduleView();
    const again = document.querySelector('[aria-label="' + label + '"]');
    if (again) again.focus({ preventScroll: true });
  };
  const range = shortDate(monday) + " – " + shortDate(shownDays[shownDays.length - 1]);
  const count = entries.length;
  const isMissing = (e) => paraOver(e, t, now) && (e.kind === "course" ? !(e.session && e.session.finished_at) : !!(unsaved && unsaved.has(e.date + "|" + e.para)));
  const held = entries.filter((e) => paraOver(e, t, now)).length, missingNow = entries.filter(isMissing).length;
  const semester = await api("GET", "/api/semester"), weekNo = Pace.semester(semester.start, semester.weeks, monday).week;
  const unknownNow = entries.filter((e) => e.kind === "site" && Timetable.siteStatus(e.lesson, ctx, t, now) === "unknown").length;
  const summary = h("p", { class: "week-sum" },
    h("span", {}, h("b", { text: String(count) }), " ta dars"), h("span", {}, h("b", { text: String(count * HOURS_PER_PARA) }), " soat"),
    h("span", {}, h("b", { text: String(held) }), " ta o'tildi"),
    missingNow ? h("span", { class: "neg" }, h("b", { text: String(missingNow) }), " ta davomatsiz") : null,
    unknownNow ? h("span", { class: "muted", title: "Sinxronlangandan keyin o'tgan darslar: davomati saytda olinganmi, noma'lum" }, h("b", { text: String(unknownNow) }), " ta noma'lum") : null);
  const dayTotal = (d) => { const n = entries.filter((e) => e.date === d).length; return h("td", { class: d === t ? "today" : null, text: n ? n + " dars · " + n * HOURS_PER_PARA + " soat" : "–" }); };
  const table = h("div", { class: "card flush" }, h("table", { class: "timetable" },
    h("caption", { class: "sr-only", text: "Haftalik dars jadvali" }),
    h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "para-col", text: "Para" }),
      shownDays.map((d) => h("th", { scope: "col", class: d === t ? "today" : d < t ? "past" : null }, h("span", { text: capital(weekday(d)) }), h("small", { text: d === t ? "Bugun, " + shortDate(d) : shortDate(d) }))))),
    h("tfoot", {}, h("tr", {}, h("th", { scope: "row", class: "para-col", text: "Jami" }), shownDays.map(dayTotal))),
    h("tbody", {}, rows.map((p) => h("tr", { class: entries.some((e) => e.para === p) ? null : "quiet" },
      h("th", { scope: "row", class: "para-col" }, h("span", { text: p + "-para" }), PARA_TIMES[p] ? h("small", { text: PARA_TIMES[p].join("–") }) : null),
      shownDays.map((d) => h("td", { class: (d === t ? "today" : "") + (d === t && nowPara(p) ? " now" : "") },
        d === t && nowPara(p) ? nowLine(p, now) : null,
        entries.filter((e) => e.date === d && e.para === p).map((e) => mark(e.kind === "site" ? withCancel(siteCard(e.lesson, ctx, colorOf(e.lesson.subject), e), e) : e.session ? courseCard(e, colorOf(COURSE.subject)) : withCancel(courseCard(e, colorOf(COURSE.subject)), e), e)))))))));

  const noSite = !entries.some((e) => e.kind === "site");
  const inWeek = [...new Set(entries.map((e) => e.kind === "site" ? e.lesson.subject : COURSE.subject))].sort((a, b) => colorOf(a).localeCompare(colorOf(b)));   // the same order every week
  const legend = h("div", { class: "legend" }, inWeek.map((n) => h("button", { type: "button", class: "key " + colorOf(n), title: "Rang va qisqa nomni o'zgartirish", onclick: () => editSubject(n, scheduleView) }, h("i"), n)),
    h("span", { class: "muted hint", text: "To'q rang: davomat olingan. Kelgusi darsni bosing: reja va tayyorlik." }));
  // this semester's gaps are what needs attention; older ones stay available below them
  const start = (data && data.load && data.load.start) || "";
  const live = (unsavedList || []).filter((l) => lessonOver(l) && !cancelled.has(cancelKey(l.date, l.para, l.subject)));
  const current = live.filter((l) => l.date >= start), older = live.filter((l) => l.date < start);
  const missingRow = (l) => h("tr", {},
    h("td", { class: "nowrap strong", text: dayText(l.date) }), h("td", { class: "nowrap muted", text: l.para + "-para" }), h("td", { class: "clip", text: l.subject }),
    h("td", { class: "nowrap muted", text: l.group }),
    h("td", { class: "right" }, l.url ? h("a", { href: SITE + l.url, target: "_blank", rel: "noopener", text: "Saytda ochish" }) : null));
  const pending = courseGaps(ctx, t, now), open = current.length + pending.length;
  const pendingRow = (e) => h("tr", {},
    h("td", { class: "nowrap strong", text: dayText(e.date) }), h("td", { class: "nowrap muted", text: e.para + "-para" }), h("td", { class: "clip", text: COURSE.subject }),
    h("td", { class: "nowrap muted", text: COURSE.group }),
    h("td", { class: "right" }, e.session ? h("a", { href: "#/dars/" + e.session.id, text: "Tugatish" }) : h("button", { type: "button", class: "quiet", text: "Davomatni boshlash", onclick: () => startCourse(e) })));
  const fold = () => { const i = icon("forward"); i.classList.add("fold-icon"); return i; };
  const missing = live.length || pending.length ? h("details", { class: "card flush missing" + (open ? "" : " calm") },
    h("summary", {}, open ? [icon("x"), h("b", { text: open + " ta darsda davomat olinmagan" }), older.length ? h("span", { class: "muted", text: "oldingi semestrlarda yana " + older.length + " ta" }) : null, fold()]
      : [icon("check"), h("b", { text: ctx.firstDay ? "Bu semestrda hamma davomat olingan" : "Saytdagi darslarda hamma davomat olingan" }), h("span", { class: "muted", text: "oldingi semestrlarda " + older.length + " ta olinmagan" }), fold()]),
    h("table", {}, h("tbody", {}, pending.map(pendingRow), current.map(missingRow),
      older.length ? h("tr", { class: "group" }, h("th", { colspan: "5", scope: "colgroup", text: "Oldingi semestrlar" })) : null, older.map(missingRow)))) : null;
  const weekCancelled = cancelledList.filter((c) => days.includes(c.date));
  const undo = weekCancelled.length ? h("details", { class: "fold-line undo" }, h("summary", { text: weekCancelled.length + " ta dars bo'lmagan deb belgilangan" }),
    h("ul", { class: "plain" }, weekCancelled.map((c) => h("li", {}, h("span", { text: shortDate(c.date) + ", " + c.para + "-para · " + c.subject }),
      h("button", { type: "button", class: "quiet", text: "Qaytarish", onclick: async () => { if (await act(() => api("PUT", "/api/cancelled", { date: c.date, para: c.para, subject: c.subject, cancelled: false }))) scheduleView(); } }))))) : null;

  show(withAge(data, "unsaved", "Shundan keyin o'tgan darslar holati noma'lum.", pageHead("Dars jadvali", [range + (weekNo > 0 && monday <= Pace.semester(semester.start, semester.weeks, monday).end ? " · " + weekNo + "-hafta" : ""), summary],
      h("button", { type: "button", "aria-label": "Oldingi hafta", onclick: move(-1, "Oldingi hafta") }, icon("back")),
      h("button", { type: "button", text: "Bu hafta", disabled: jw.offset === 0, onclick: move(0, "Keyingi hafta") }),
      h("button", { type: "button", "aria-label": "Keyingi hafta", onclick: move(1, "Keyingi hafta") }, icon("forward")))),
    jw.offset === 0 ? next : null,
    open ? missing : null,
    data && !unsavedList ? h("p", { class: "sub" }, "Davomat olingan yoki olinmaganini ko'rish uchun ", h("a", { href: "#/kabinet", text: "Kabinetda qayta sinxronlang" }), ".") : null,
    table,
    legend,
    open ? null : missing,
    undo,
    noSite ? h("p", { class: "sub" }, !synced_at ? ["Universitet darslari hali yo'q. ", h("a", { href: "#/kabinet", text: "Kabinetda sinxronlang" }), "."]
      : ["Bu hafta uchun saytdan darslar yo'q. ", h("a", { href: "#/kabinet", text: "Kabinet" })]) : null);
}

/* ------------------------------------------------------------ teaching load */

function verdictText(diff) {
  if (diff === null || diff === undefined) return "";
  if (Math.abs(diff) < PARA_SLACK) return "Rejada";
  return h1(Math.abs(diff)) + " soat " + (diff < 0 ? "orqadasiz" : "oldindasiz");
}
const verdictClass = (diff) => (diff === null || diff === undefined || Math.abs(diff) < PARA_SLACK ? "" : diff < 0 ? " neg" : " pos");
// a track with what was held, and a mark where the calendar says it should be today
// soon: the part already in the timetable but not held yet, drawn striped after it
function paceBar(pct, need, cls, soon) {
  const v = Math.max(0, Math.min(100, pct || 0)), q = Math.max(0, Math.min(100 - v, soon || 0));
  const bar = h("span", { class: "pace-bar" + (cls ? " " + cls : ""), "aria-hidden": "true" }, h("i"), q ? h("s") : null, need === null || need === undefined ? null : h("u"));
  bar.style.setProperty("--v", v);
  if (q) bar.style.setProperty("--q", q);
  if (need !== null && need !== undefined) bar.style.setProperty("--need", Math.max(0, Math.min(100, need)));
  return bar;
}

async function loadView() {
  const show = painter(loadView, null);   // paints only while this is still the page
  const [{ data }, { sessions }, { hours: coursePlan }, { items: cancelledList }, semester] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/sessions"), api("GET", "/api/course-plan"), api("GET", "/api/cancelled"), api("GET", "/api/semester")]);
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const load = data && data.load;
  if (!load) return show(pageHead("Yuklama"), h("div", { class: "card empty" },
    h("p", { class: "strong", text: "Yuklama hali sinxronlanmagan" }),
    h("p", { text: "Semestr rejasi, o'tilgan va qolgan soatlar har fan bo'yicha shu yerda ko'rinadi. " + COURSE.group + " kursi soatlari sinxronlashsiz ham hisoblanadi." }),
    h("a", { class: "button primary", href: "#/kabinet", text: "Kabinetda sinxronlash" })));

  const P = loadPace(data, sessions, coursePlan, cancelled, semester);
  const { lines, independent, course, coursePlanHours, frac, all, est } = P;
  const site = total(lines.filter((l) => !l.course)), sums = total(lines);
  const colorOf = subjectColors(data);
  const quiet = (v) => (v ? "" : " muted");
  const settled = (l) => l.finished || l.closed;   // a group whose plan is done: its row shows no difference
  const diffCell = (l, sum) => h("td", { class: "num" + (settled(l) ? "" : verdictClass(sum.diff)), text: sum.diff === null || settled(l) ? "" : signed(sum.diff) });
  const rate = (l, sum) => h("span", { class: "rate" }, paceBar(sum.pct, settled(l) ? null : needPct(sum), null, sum.plan ? 100 * (l.queued || 0) * HOURS_PER_PARA / sum.plan : 0), h("b", { text: pct1(sum.pct) }));
  const numbers = (l, sum, planNode) => [
    h("td", { class: "num" }, planNode ?? hrs(l.plan)),
    h("td", { class: "num" + quiet(l.done), text: hrs(l.done) }),
    h("td", { class: "num" + quiet(l.noAtt), text: l.noAtt ? hrs(l.noAtt) : "–" }),
    sums.unknown ? h("td", { class: "num" + quiet(l.unknown), title: l.unknown ? "Sinxronlangandan keyin o'tgan: davomati olinganmi, noma'lum" : null, text: l.unknown ? hrs(l.unknown) : "–" }) : null,
    h("td", { class: "num" + quiet(l.left), text: hrs(l.left) }),
    h("td", { class: "num" + quiet(l.queued), title: l.queued ? l.queued + " ta dars jadvalda, hali o'tilmagan" : null, text: l.queued ? hrs(l.queued * HOURS_PER_PARA) : "–" }),
    h("td", { class: "w-rate" }, rate(l, sum)),
    diffCell(l, sum)];

  // the estimate reads as plain text; clicking its row turns it into a field. Enter or leaving saves, Esc cancels
  let editPlan = () => {};
  const planCell = () => {
    const shown = h("button", { type: "button", class: "plan-edit", text: hrs(coursePlanHours), title: "Tahrirlash", "aria-label": COURSE.group + " reja soatini tahrirlash", onclick: () => editPlan() });
    editPlan = () => {
      if (!shown.isConnected) return;
      const input = h("input", { class: "plan-input", type: "text", inputmode: "numeric", value: coursePlanHours, "aria-label": COURSE.group + " reja soati", autocomplete: "off" });
      let closed = false;
      const finish = async (save) => {
        if (closed) return;
        closed = true;
        const value = input.value.trim();
        const saved = save && value !== String(coursePlanHours) && await act(() => api("PUT", "/api/course-plan", { hours: value }));
        if (saved) { say("Saqlandi", true); return loadView(); }
        input.replaceWith(shown); shown.focus({ preventScroll: true });
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); else if (e.key === "Escape") { e.stopPropagation(); finish(false); } });
      input.addEventListener("blur", () => finish(true));
      shown.replaceWith(input); input.focus(); input.select();
    };
    return shown;
  };
  const line = (l) => h("tr", { class: "line" + (l.closed ? " off" : "") + (l.course ? " tap" : ""), onclick: l.course ? (e) => { if (!e.target.closest("input, button")) editPlan(); } : null },
    h("td", { class: "who" }, l.group, l.closed ? [" ", chip("Yopilgan")] : null, l.course ? [" ", chip("Taxminiy")] : null,
      l.sirtqi && !l.closed && !l.finished ? [" ", h("span", { class: "chip", title: l.window ? "O'qish davri: " + shortDate(l.window.first) + " – " + shortDate(l.window.last) + ". Farq shu davr ish kunlari bo'yicha." : "Hali dars bo'lmagan: farq 0 dan hisoblanadi.", text: "Sirtqi" + (l.window ? " · " + shortDate(l.window.first) + " – " + shortDate(l.window.last) : "") })] : null,
      !l.closed && !l.course && l.left === 0 ? [" ", chip("Tugagan", null, "check")] : null),
    h("td", { class: "nowrap muted", text: l.type }),
    numbers(l, Pace.summary([l], frac), l.course ? planCell() : l.closed && l.sitePlan !== l.plan ? h("span", { title: "Saytda " + hrs(l.sitePlan) + " soat", text: hrs(l.plan) }) : null));
  const groups = [...new Set(lines.map((l) => l.subject))].map((name) => {
    const mine = lines.filter((l) => l.subject === name);
    return h("tbody", { class: colorOf(name) },
      h("tr", { class: "subject-row" }, h("th", { scope: "rowgroup", colspan: "2" }, h("span", { class: "dot" }), name), numbers(total(mine), Pace.summary(mine, frac))),
      mine.map(line));
  });

  // ---- the lead: how much is done, and how that compares with today
  const kv = (label, value, cls) => h("div", { class: "kv" }, h("span", { text: label }), h("b", { class: cls || null }, value));
  const sum = (label, value, note) => h("div", { class: "pace-sum" }, h("span", { class: "label", text: label }), h("b", {}, value, h("small", { text: " soat" })), note ? h("span", { class: "note", text: note }) : null);
  const need = needPct(all);
  const hero = h("section", { class: "card pace-hero", "aria-label": "Umumiy yuklama" },
    h("div", { class: "pace-lead" },
      h("b", { class: "pace-big" }, Pace.fmt1(all.pct), h("small", { text: "%" })),
      all.diff === null ? h("p", { class: "muted", text: "Semestr rejasining bajarilgan qismi." }) : [
        h("p", { class: "verdict" + verdictClass(all.diff), text: verdictText(all.diff) }),
        h("p", { class: "muted", text: "Shu kungacha " + est + h1(all.expected) + " soat o'tilishi kerak edi, " + h1(all.held) + " soat o'tildi" + (all.ofExpected === null ? "." : ": kerakli miqdorning " + pct1(all.ofExpected) + ".") })]),
    h("div", { class: "pace-side" },
      paceBar(all.pct, need, "tall", all.plan ? 100 * sums.queued * HOURS_PER_PARA / all.plan : 0),
      h("div", { class: "pace-legend" }, h("span", {}, h("i", { class: "k-done" }), "O'tildi " + pct1(all.pct)),
        sums.queued ? h("span", {}, h("i", { class: "k-soon" }), "Jadvalda " + hrs(sums.queued * HOURS_PER_PARA) + " soat") : null,
        need === null ? null : h("span", {}, h("i", { class: "k-need" }), "Bugun bo'lishi kerak " + est + pct1(need))),
      h("div", { class: "pace-sums" },
        sum("O'tildi", h1(all.held), sums.noAtt || sums.unknown ? "shundan " + [sums.noAtt ? hrs(sums.noAtt) + " soat davomatsiz" : "", sums.unknown ? hrs(sums.unknown) + " soat noma'lum" : ""].filter(Boolean).join(", ") : null),
        sum("Qoldi", est + h1(all.left), sums.queued ? "shundan jadvalda " + hrs(sums.queued * HOURS_PER_PARA) + " soat" : null),
        sum("Jami reja", est + h1(all.plan), null)),
      h("p", { class: "pace-split muted" }, "Tizim " + hrs(site.done + site.noAtt) + " / " + hrs(site.plan) + " soat · Kurs, " + COURSE.group + " " + hrs(course.done) + " / " + est + hrs(course.plan) + " soat ", course.plan ? chip("Taxminiy") : null)));

  // ---- by lesson type, and the time that is left
  const typeCard = ({ type, sum: s, est: e }) => h("section", { class: "card type-card" },
    h("h2", { text: type || "Boshqa" }),
    h("b", { class: "stat-big" }, Pace.fmt1(s.pct), h("small", { text: "%" })),
    paceBar(s.pct, needPct(s)),
    kv("O'tildi", h1(s.held) + " / " + (e ? "~" : "") + h1(s.plan) + " soat"),
    kv("Bugungacha kerak edi", s.expected === null ? "–" : (e ? "~" : "") + h1(s.expected) + " soat"),
    kv("Farq", s.diff === null ? "–" : signed(s.diff) + " soat", verdictClass(s.diff).trim()));
  const W = P.weekly, timeBar = paceBar(100 * frac, null, "time");
  const restCard = h("section", { class: "card type-card" },
    h("h2", { text: "Oxirigacha" }),
    h("b", { class: "stat-big" }, String(P.daysLeft), h("small", { text: " ish kuni qoldi" })),
    timeBar,
    kv("Semestr", shortDate(semester.start) + " – " + shortDate(P.end) + ", " + P.weeks + " hafta"),
    kv("Kerakli sur'at", W.required === null ? "–" : "haftasiga " + est + h1(W.required) + " soat"),
    kv("Hozirgi sur'at", W.current === null ? "–" : "haftasiga " + h1(W.current) + " soat"));

  // ---- what follows from the numbers
  const facts = [];
  if (W.projected !== null && all.plan && P.daysLeft > 0) {
    const short = all.plan - W.projected;
    facts.push(short >= PARA_SLACK ? ["bad", "Shu sur'atda semestr oxirida " + est + h1(Math.min(all.plan, W.projected)) + " soat bo'ladi: " + est + h1(short) + " soat yetmaydi."]
      : ["ok", "Shu sur'atda reja semestr oxirigacha to'liq bajariladi."]);
  }
  if (all.left > 0) {
    const queuedHours = sums.queued * HOURS_PER_PARA, open = all.left - queuedHours;
    facts.push(open >= PARA_SLACK ? ["", "Jadvalda yana " + sums.queued + " ta dars bor (" + hrs(queuedHours) + " soat). Qolgan " + est + h1(open) + " soat hali jadvalga qo'yilmagan."]
      : ["", "Jadvaldagi " + sums.queued + " ta dars (" + hrs(queuedHours) + " soat) qolgan rejani yopadi."]);
  }
  const worst = lines.filter((l) => !l.closed && l.plan).map((l) => [l, Pace.summary([l], frac).diff]).sort((x, y) => x[1] - y[1])[0];
  if (worst && worst[1] <= -PARA_SLACK) facts.push(["bad", "Eng ko'p orqada: " + worst[0].subject + ", " + worst[0].group + " (" + worst[0].type + "), " + signed(worst[1]) + " soat."]);
  if (sums.noAtt) facts.push(["warn", h("span", {}, hrs(sums.noAtt) + " soat davomatsiz: dars o'tilgan, lekin saytda davomat saqlanmagan. ", h("a", { href: "#/jadval", text: "Jadvalda ko'rish" }))]);
  const factCard = facts.length ? h("section", { class: "card" }, h("h2", { text: "Bashorat" }),
    h("ul", { class: "plain facts" }, facts.map(([kind, text]) => h("li", { class: kind || null }, h("i", { class: "fact-dot" }), typeof text === "string" ? h("span", { text }) : text)))) : null;

  const extra = Object.entries(independent);
  show(withAge(data, "unsaved", "Shundan keyin o'tgan darslar holati noma'lum.", pageHead("Yuklama", [load.semester, load.position].filter(Boolean).join(" · "))),
    h("p", { class: "sem-line" }, h("b", { text: P.day + "-ish kuni" }), " / " + P.days + " · " + (P.week ? P.week + "-hafta / " + P.weeks + " · " : "") + shortDate(semester.start) + " – " + shortDate(P.end) + " · ", h("a", { href: "#/kabinet", text: "o'zgartirish" })),
    !load.start ? h("p", { class: "sub" }, "To'liq hisob uchun ", h("a", { href: "#/kabinet", text: "Kabinetda qayta sinxronlang" }), ": o'tilgan soatlar butun semestr jadvalidan olinadi.") : null,
    hero,
    h("div", { class: "type-cards" }, P.types.map(typeCard), restCard),
    factCard,
    h("div", { class: "card flush" }, h("table", { class: "load" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Fan va guruh" }), h("th", { scope: "col", text: "Turi" }),
        [["Reja"], ["O'tilgan"], ["Davomatsiz"], sums.unknown ? ["Noma'lum", "Dars o'tgan, lekin sinxronlangandan keyin: davomati olinganmi, noma'lum"] : null, ["Qolgan"], ["Jadvalda", "Jadvalda bor, hali o'tilmagan darslar, soatda"]].filter(Boolean).map(([x, tip]) => h("th", { scope: "col", class: "num", title: tip || null, text: x })),
        h("th", { scope: "col", class: "w-rate", text: "Bajarilishi" }),
        h("th", { scope: "col", class: "num", title: "O'tilgan soat minus shu kungacha o'tilishi kerak bo'lgan soat. Tugagan va yopilgan guruhlarda ko'rsatilmaydi.", text: "Farq" }))),
      groups)),
    h("div", { class: "notes" },
      extra.length ? h("p", {}, h("b", { text: "Mustaqil ta'lim: " + hrs(extra.reduce((n, [, v]) => n + v, 0)) + " soat" }), " (" + extra.map(([n, v]) => n + " " + hrs(v)).join(", ") + "). Jadvalga kirmaydi va hisobga qo'shilmagan.") : null,
      h("details", { class: "fold-line", "data-key": "how-load" }, h("summary", { text: "Qanday hisoblanadi?" }),
        h("dl", { class: "defs" }, [
          ["O'tilgan soat", "Dars jadvalidan hisoblanadi: 1 para = 2 soat. Sayt bu raqamni bermaydi."],
          ["Farq", "O'tilgan soat minus shu kungacha kerak bo'lgan soat. Kerakli soat = reja × (o'tgan ish kunlari ÷ semestr ish kunlari). Bu ilovaning hisobi, sayt raqami emas."],
          ["Ish kunlari", "Dushanba–shanba, yakshanbasiz. Semestr boshi va haftalar soni Kabinetda."],
          ["Davomatsiz", "Dars vaqti o'tgan, lekin saytda davomat saqlanmagan."],
          ["Noma'lum", "Dars oxirgi sinxronlashdan keyin o'tgan: davomati saytda olinganmi, hozircha noma'lum. O'tilgan soatga kiradi."],
          ["Jadvalda", "Jadvalda bor (och rangli kartalar), lekin hali o'tilmagan darslar, soatda."],
          ["Sirtqi guruhlar", "S1-KT-22 kabi guruhlar o'z o'qish davri bo'yicha o'lchanadi: birinchi darsidan jadvaldagi oxirgi darsigacha, kamida 3 hafta."],
          ["Yopilgan guruhlar", "Rejasi o'tilgan soatga teng olingan, taqqoslashga kirmaydi. Tugagan guruhlar kiradi, lekin qatorida farq ko'rsatilmaydi."],
          [COURSE.group, "Saytdagi yuklamada yo'q: rejasi taxminiy (~), o'tilgani shu ilovadagi tugatilgan darslardan."],
          ["Bajarilishi chizig'i", "To'q qism o'tilgani, yo'l-yo'l qism jadvaldagi hali o'tilmagan darslar, tik chiziqcha bugungi kerakli nuqta."],
        ].map(([term, text]) => [h("dt", { text: term }), h("dd", { text })])))));
}

/* ------------------------------------------------------------ cabinet (digital.oxu.uz) */
function stamp(ts) { return dayText(new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: TZ })) + " " + timeText(ts); }

// Login through the Chrome extension (extension/): the button asks it to open the site, and once the
// teacher is logged in it posts the session cookie back here. It goes through the same sync request
// as a pasted cookie, so the owner-ID check and the "only a working cookie is kept" rule still apply.
const helperOn = () => document.documentElement.dataset.oxuHelper === "1";
window.addEventListener("message", async (e) => {
  const m = e.data;
  if (e.source !== window || e.origin !== location.origin || !m || m.source !== "attendance-helper" || m.type !== "cookie") return;
  say("Cookie olindi. Tekshirilmoqda va sinxronlanmoqda, bir daqiqagacha kuting…", true, true);
  let res = null;
  try { res = await api("POST", "/api/oxu/sync", { cookie: m.cookie }); } catch (err) {
    // the site tab hands over its cookie on every page, also before the login: that one is no error
    const early = err.code === "oxu_session";   // a cookie the site does not accept (yet)
    window.postMessage({ source: "attendance-app", type: "result", ok: false, quiet: early }, location.origin);
    say(early ? "Sayt hali kirishni tasdiqlamadi, kutilmoqda…" : err.message, early, early);
    return;
  }
  window.postMessage({ source: "attendance-app", type: "result", ok: true }, location.origin);
  if (res.warnings.length) say("Qisman yangilandi. " + res.warnings.join("; ")); else say("Ma'lumotlar yangilandi", true);
  route();   // redraws the page, and the badge with it
});

window.postMessage({ source: "attendance-app", type: "ready" }, location.origin);

async function cabinetView() {
  const show = painter(cabinetView, null);   // paints only while this is still the page
  const [{ data, synced_at }, st, backup] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/oxu/status"), api("GET", "/api/backup")]);
  const finish = async (res) => {
    if (!res) return cabinetView();
    await cabinetView(); refreshBadge();
    if (res.warnings.length) say("Qisman yangilandi. " + res.warnings.join("; ")); else say("Ma'lumotlar yangilandi", true);
  };
  const cookie = h("input", { name: "cookie", type: "password", autocomplete: "off", required: true, placeholder: "ASPSESSIONID...=...", "aria-label": "digital.oxu.uz sessiya cookie" });
  const save = h("button", { type: "submit", class: st.has_cookie && st.state !== "expired" ? null : "primary", text: "Saqlash" });
  const cookieForm = h("form", { class: "stack", onsubmit: async (e) => {
      e.preventDefault();
      save.disabled = true; save.textContent = "Tekshirilmoqda…";
      const res = await act(() => api("POST", "/api/oxu/sync", { cookie: cookie.value }));
      cookie.value = ""; save.disabled = false; save.textContent = "Saqlash";
      finish(res);
    } },
    h("p", { class: "sub", text: helperOn()
      ? "Yoki cookie'ni qo'lda kiriting: saytga kiring, F12 → Network → istalgan so'rov → Request Headers → Cookie qiymatini shu yerga qo'ying."
      : "Chrome kengaytmasi (extension/ papkasi) o'rnatilsa, cookie o'zi olinadi. Qo'lda: saytga kiring, F12 → Network → istalgan so'rov → Request Headers → Cookie qiymatini shu yerga qo'ying." }),
    h("p", { class: "sub", text: "Faqat ishlaydigan cookie saqlanadi." }),
    h("div", { class: "sync-row" }, cookie, save));
  const needsCookie = !st.has_cookie || st.state === "expired" || st.state === "wrong_account";
  const now = h("button", { type: "button", class: needsCookie ? null : "primary", text: "Hozir sinxronlash", disabled: !st.owner || !st.has_cookie || st.state === "expired", onclick: async () => {
      now.disabled = true; now.textContent = "Sinxronlanmoqda…";
      finish(await act(() => api("POST", "/api/oxu/sync", {})));
    } });
  const login = !helperOn() || !st.owner ? null : h("button", { type: "button", class: needsCookie ? "primary" : null, text: "digital.oxu.uz ga kirish", title: "Saytda o'zingiz login qilasiz, cookie o'zi olinadi", onclick: () => {
      say("digital.oxu.uz ochildi: u yerda login qiling, qolganini o'zi qiladi", true, true);
      window.postMessage({ source: "attendance-app", type: "login" }, location.origin);
    } });
  const STATES = {
    none: ["", st.owner ? "Cookie kiritilmagan" : "ID raqamingizni kiriting", st.owner ? "Avtomatik sinxronlash uchun cookie kiriting." : "Boshqa odamning ma'lumoti tushmasligi uchun avval o'z hisobingizni belgilang."],
    ok: ["ok", "Avtomatik sinxronlash ishlayapti", "Kunduzi har 30 daqiqada, 22:00–08:00 oralig'ida har 5 soatda."],
    error: ["warn", "Oxirgi urinish o'xshamadi", "Sayt bilan aloqa bo'lmadi. Keyingi vaqtda yana urinib ko'radi."],
    expired: ["bad", "Sessiya tugadi, sinxronlash to'xtadi", helperOn() ? "«digital.oxu.uz ga kirish» tugmasini bosing va saytda login qiling." : "digital.oxu.uz ga qayta kiring va quyida yangi cookie kiriting."],
    wrong_account: ["bad", "Boshqa hisob aniqlandi", "Sessiya ID " + st.wrong_id + " hisobiga tegishli, ma'lumot olinmadi. O'z hisobingizga qaytsangiz, sinxronlash o'zi davom etadi."],
  };
  const [kind, titleText, hint] = STATES[st.state] || STATES.none;
  const ownerInput = h("input", { name: "code", inputmode: "numeric", value: st.owner, required: true, autocomplete: "off", placeholder: "Masalan: 123456", "aria-label": "Mening ID raqamim" });
  const saveOwner = async (e) => {
    e.preventDefault();
    if (st.owner && ownerInput.value.trim() !== st.owner && !(await ask("ID o'zgartirilsinmi? Avvalgi hisobning sinxronlangan ma'lumotlari o'chiriladi.", "O'zgartirish", true))) return;
    if (await act(() => api("PUT", "/api/oxu/owner", { code: ownerInput.value }))) { say("Saqlandi", true); cabinetView(); }
  };
  const ownerRow = h("form", { class: "stack", onsubmit: saveOwner },
    h("p", { class: "sub", text: "Sinxronlash faqat shu ID hisobidan olinadi. ID ni saytdagi Kabinet sahifasida «Maxsus kod» sifatida ko'rasiz." }),
    h("div", { class: "sync-row" }, ownerInput, h("button", { type: "submit", class: st.owner ? null : "primary", text: "ID ni saqlash" })));
  const form = h("section", { class: "card sync" + (st.state === "expired" ? " alert" : ""), "aria-label": "digital.oxu.uz bilan sinxronlash" },
    h("div", { class: "sync-head" },
      h("div", {}, h("h2", {}, h("span", { class: "state-dot " + kind }), titleText), h("p", { class: "sub", text: hint })),
      h("div", { class: "sync-actions" }, login, now)),
    st.next_sync || st.last_sync ? h("p", { class: "times" }, st.last_sync ? ["Oxirgi: ", h("b", { text: stamp(st.last_sync) })] : null,
      st.next_sync ? ["   Keyingi: ", h("b", { text: stamp(st.next_sync) })] : null) : null,
    st.warnings.length ? h("p", { class: "times", text: "Ogohlantirish: " + st.warnings.join("; ") }) : null,
    st.owner ? h("p", { class: "times" }, "Hisob: ", h("b", { text: "ID " + st.owner })) : ownerRow,
    !st.owner ? null : needsCookie ? cookieForm : h("details", { class: "fold-line" }, h("summary", { text: "Cookie'ni almashtirish" }), cookieForm, ownerRow,
      h("button", { type: "button", class: "quiet", text: "Saqlangan cookie'ni o'chirish", onclick: async () => {
        if (!(await ask("Saqlangan cookie o'chirilsinmi? Avtomatik sinxronlash to'xtaydi.", "O'chirish", true))) return;
        if (await act(() => api("DELETE", "/api/oxu/cookie"))) cabinetView();
      } })));
  const head = pageHead("Kabinet", synced_at ? "digital.oxu.uz ma'lumotlari" : "Hali sinxronlanmagan");
  const semesterCard = [await semesterForm(), backupCard(backup)];
  if (!data) return show(head, form, semesterCard, h("p", { class: "card empty", text: "Jadval, yuklama va KPI o'z bo'limlarida ko'rinadi. Yuqorida birinchi sinxronlashni bajaring." }));

  show(head, form, semesterCard);
}
// when the database was last copied; a copy is made by `attendance backup` (see README), not by this page
function backupCard(b) {
  const age = b.last ? (Date.now() / 1000 - b.last) / 86400 : null;
  const text = age === null ? "Zaxira nusxa hali olinmagan." : "Oxirgi zaxira nusxa: " + stamp(b.last) + (age > 2 ? " (" + Math.floor(age) + " kun oldin)" : "") + ".";
  return h("section", { class: "card", "aria-labelledby": "backup-h" }, h("h2", { id: "backup-h", text: "Zaxira nusxa" }),
    h("p", { class: "sub" + (age === null || age > 2 ? " warn-text" : ""), text: text }),
    h("p", { class: "sub", text: "Ma'lumotlar bazasi serverda yagona nusxa. Kundalik nusxa uchun README dagi «Backup and restore» bo'limiga qarang." }));
}
// the calendar the teaching load's pace is measured against; the site does not give it
async function semesterForm() {
  const sem = await api("GET", "/api/semester");
  const start = dateField("start", sem.start);
  const weeks = h("input", { name: "weeks", type: "text", inputmode: "numeric", value: String(sem.weeks), autocomplete: "off", required: true });
  const end = () => {
    const iso = start.input.value, n = Number(weeks.value);
    if (!iso || !(n >= 1 && n <= 60)) return "";
    const S = Pace.semester(iso, n, iso);
    return n * Pace.WORK_DAYS + " ish kuni (yakshanbalar hisobga olinmaydi) · oxirgi kun: " + longDay(S.end);
  };
  const endLine = h("p", { class: "sub", text: end() });
  start.input.addEventListener("change", () => { endLine.textContent = end(); });
  weeks.addEventListener("input", () => { endLine.textContent = end(); });
  return h("section", { class: "card" }, h("h2", { text: "Semestr" }),
    h("p", { class: "sub", text: "Yuklamadagi \"shu kungacha qancha o'tilishi kerak edi\" hisobi shu ish kunlariga qarab olinadi: haftada 6 kun, dushanbadan shanbagacha." }),
    h("form", { class: "semester-form", onsubmit: async (e) => {
        e.preventDefault();
        if (await act(() => api("PUT", "/api/semester", { start: start.input.value, weeks: weeks.value.trim() }))) { await loadSemester(); say("Saqlandi", true); }
      } },
      field("Boshlanishi", start), field("Haftalar soni", weeks),
      h("button", { type: "submit", class: "primary", text: "Saqlash" })),
    endLine,
    h("div", { class: "new-semester" },
      h("p", { class: "sub", text: "Semestr tugadimi? Yangisini boshlang: talabalar arxivga o'tadi, darslar va qarzlar «Oldingi semestrlar» ostida qoladi." }),
      h("button", { type: "button", text: "Yangi semestr", onclick: () => newSemesterSheet(sem) })));
}

// the next semester: new dates, every student archived, the record kept (and backed up first)
function newSemesterSheet(sem) {
  const guess = Pace.semester(sem.start, sem.weeks, sem.start).end;
  const start = dateField("start", shiftDay(guess, 7 * 6));   // a winter break of about six weeks
  const weeks = h("input", { name: "weeks", type: "text", inputmode: "numeric", value: String(sem.weeks), autocomplete: "off", required: true });
  const hours = h("input", { name: "hours", type: "text", inputmode: "numeric", value: "", placeholder: "o'zgarmaydi", autocomplete: "off" });
  openSheet("Yangi semestr", h("form", { class: "stack", onsubmit: async (e) => {
      e.preventDefault();
      if (!(await ask("Yangi semestr " + dayText(start.input.value) + " dan boshlansinmi? Hamma talaba arxivga o'tadi; oldin zaxira nusxa olinadi.", "Boshlash", true))) return;
      const res = await act(() => api("POST", "/api/semester/new", { start: start.input.value, weeks: weeks.value.trim(), plan_hours: hours.value.trim() || null }));
      if (!res) return;
      sheetBox.close();
      await loadSemester();
      say("Yangi semestr boshlandi" + (res.backup ? ", zaxira nusxa olindi" : "") + ". Talabalarni «Talabalar» sahifasida qo'shing yoki arxivdan qaytaring.", true, true);
      route();
    } },
    h("div", { class: "pair" }, field("Boshlanishi", start), field("Haftalar soni", weeks)),
    field(COURSE.group + " reja soati", hours),
    h("ul", { class: "plain facts" },
      h("li", {}, h("span", { text: "Hamma talaba arxivga o'tadi: o'chirilmaydi, tarixi va qarzlari saqlanadi." })),
      h("li", {}, h("span", { text: "Oldingi darslar va qarzlar «Oldingi semestrlar» ostida ko'rinadi." })),
      h("li", {}, h("span", { text: "Guruh, fan va kunlar o'zgarsa, ularni web/lib/rules.js dagi COURSE da o'zgartirish kerak." }))),
    h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Boshlash" }))));
}

/* ------------------------------------------------------------ scientific KPI */
function needSync(title, show) { return show(pageHead(title), h("p", { class: "card empty" }, "Ma'lumot hali yo'q. ", h("a", { href: "#/kabinet", text: "Kabinetda sinxronlang" }))); }

async function kpiView() {
  const show = painter(kpiView, null);   // paints only while this is still the page
  const [{ data }, { works }, { steps: customSteps }] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/kpi-works"), api("GET", "/api/kpi-marks")]);
  const kpi = data && data.kpi;
  if (!kpi) return needSync("Ilmiy KPI", show);
  const score = kpi.bands.reduce((n, b) => n + (Number(b.score) || 0), 0);
  const approved = kpi.papers.filter((p) => /tasdiq/i.test(p.status)).length;
  const required = kpi.bands.filter((b) => b.min);
  const stepsOf = (w) => customSteps[w.band] ?? workSteps(w.band);
  const onSite = (w) => kpi.papers.find((p) => sameWork(p.title, w.title));
  const active = works.filter((w) => !onSite(w));
  const ready = active.filter((w) => { const n = stepsOf(w).length; return n > 0 && w.step >= n; });

  const addWork = () => {
    const title = h("textarea", { name: "title", rows: "3", required: true, maxlength: "400", placeholder: "Ish nomi" });
    const band = h("select", { name: "band" }, kpi.bands.map((b) => h("option", { value: b.name, text: b.name })));
    openSheet("Yangi ish", h("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        if (await act(() => api("POST", "/api/kpi-works", { title: title.value, band: band.value }))) { sheetBox.close(); say("Qo'shildi", true); kpiView(); }
      } },
      field("Ish nomi (saytga shu nom bilan yuklansa, avtomatik bog'lanadi)", title), field("KPI bandi", band),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Qo'shish" }))));
  };
  const editSteps = (w) => {
    const area = h("textarea", { rows: "5", spellcheck: "false" });
    area.value = stepsOf(w).join("\n");
    openSheet("Bosqichlar", h("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        const list = area.value.split("\n").map((x) => x.trim()).filter(Boolean);
        if (await act(() => api("PUT", "/api/kpi-steps", { item: w.band, steps: list }))) { sheetBox.close(); say("Saqlandi", true); kpiView(); }
      } },
      h("p", { class: "muted", text: w.band }), field("Har qatorda bitta bosqich, shu banddagi barcha ishlar uchun", area),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Saqlash" }))));
  };
  const setStep = async (w, step) => { if (await act(() => api("PATCH", "/api/kpi-works/" + w.id, { step }))) kpiView(); };
  const workRow = (w) => {
    const list = stepsOf(w), paper = onSite(w), now = paper ? list.length : Math.min(w.step, list.length);
    const status = paper ? chip("Saytda: " + paper.status, /tasdiq/i.test(paper.status) ? "ok" : "live", /tasdiq/i.test(paper.status) ? "check" : null)
      : list.length && now >= list.length ? chip("Yuklashga tayyor", "live") : now > 0 ? chip(list[now - 1]) : h("span", { class: "muted", text: "Boshlanmagan" });
    return h("li", { class: "work" },
      h("div", { class: "work-main" }, h("b", { text: w.title }), h("small", { text: w.band }),
        h("div", { class: "steps" }, h("ol", {}, list.map((name, n) => h("li", {},
          h("button", { type: "button", class: n < now ? "done" : n === now ? "current" : null, disabled: !!paper, "aria-pressed": String(n < now),
            onclick: () => setStep(w, n + 1 === now ? n : n + 1) }, n < now ? icon("check") : null, name)))),
          paper ? null : h("button", { type: "button", class: "step-edit", text: "tahrirlash", "aria-label": w.title + ": bosqichlarni tahrirlash", onclick: () => editSteps(w) }))),
      h("div", { class: "work-side" }, status,
        h("button", { type: "button", class: "step-edit", text: "o'chirish", "aria-label": w.title + ": o'chirish", onclick: async () => {
          if (!(await ask("«" + w.title.slice(0, 60) + "» ro'yxatdan o'chirilsinmi? Saytdagi ma'lumotga tegmaydi.", "O'chirish", true))) return;
          if (await act(() => api("DELETE", "/api/kpi-works/" + w.id))) kpiView();
        } })));
  };

  const inBand = (b) => active.filter((w) => w.band === b.name).length;
  const hasAny = (b) => Number(b.count) > 0 || inBand(b) > 0;
  const row = (b) => h("tr", { class: hasAny(b) ? null : "off" },
    h("td", { class: "strong" }, b.name, b.min ? [" ", chip("Talab: " + b.min, Number(b.count) >= Number(b.min) ? "ok" : null)] : null, inBand(b) ? [" ", chip(inBand(b) + " ta jarayonda", "live")] : null),
    h("td", { class: "num", text: b.weight }), h("td", { class: "num", text: b.count }), h("td", { class: "num strong", text: b.score }), h("td", { class: "num muted", text: b.limit }));
  const others = kpi.papers.filter((p) => !works.some((w) => sameWork(p.title, w.title)));

  show(withAge(data, "kpi", "Saytdagi keyingi o'zgarishlar bu yerda ko'rinmaydi.", pageHead("Ilmiy KPI", "Ishlaringiz jarayoni va to'plangan ball", h("button", { type: "button", class: "primary", onclick: addWork }, icon("plus"), "Yangi ish"))),
    h("div", { class: "tiles" }, tile("To'plangan ball", score.toFixed(2)), tile("Jarayonda", active.length), tile("Yuklashga tayyor", ready.length), tile("Saytda tasdiqlangan", approved),
      required.length ? tile("Minimal talablar", required.filter((b) => Number(b.count) >= Number(b.min)).length + " / " + required.length, "bajarilgan") : null),
    h("section", { class: "card flush", "aria-labelledby": "works-h" }, h("h2", { id: "works-h", class: "card-title", text: "Ishlarim" }),
      works.length ? h("ul", { class: "plain" }, works.map(workRow))
        : h("p", { class: "empty-line", text: "Hali ish qo'shilmagan. «Yangi ish» bilan boshlang: saytga yuklangunicha bo'lgan jarayonni shu yerda kuzatasiz." })),
    h("div", { class: "split" },
      h("div", { class: "card flush" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Band" }), ["Vazn", "Soni", "Ball", "Cheklov"].map((x) => h("th", { scope: "col", class: "num", text: x })))),
        h("tbody", {}, [...kpi.bands.filter(hasAny), ...kpi.bands.filter((b) => !hasAny(b))].map(row)))),
      h("aside", { class: "rail sticky" },
        h("section", { class: "card", "aria-labelledby": "papers-h" }, h("h2", { id: "papers-h", text: "Saytdagi ishlar" }),
          others.length ? h("ul", { class: "plain papers" }, others.map((p) => h("li", {},
            h("b", { text: p.title }), h("small", { text: p.band + " · " + p.date }), chip(p.status, /tasdiq/i.test(p.status) ? "ok" : /rad/i.test(p.status) ? "bad" : null, /tasdiq/i.test(p.status) ? "check" : null))))
            : h("p", { class: "muted small", text: "Saytdagi barcha ishlar yuqorida bog'langan." })))));
}

/* ------------------------------------------------------------ monthly KPI */
// the site's status is "Taxminiy Oy davom etmoqda -- ...": a short label, then an explanation
function monthState(m) { const [label, ...rest] = (m.status || "").split(/\s+/); return { label: label || "–", note: rest.join(" ").replace(/\s*--\s*/g, ": ") }; }

const kf = { month: "" };

async function monthsView() {
  const show = painter(monthsView, null);   // paints only while this is still the page
  const [{ data }, { marks, progress, steps: customSteps }] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/kpi-marks")]);
  const periods = (data && data.periods) || [], months = (data && data.months) || [];
  if (!periods.length && !months.length) return needSync("Ustama", show);

  const thisMonth = today().slice(0, 7);
  const keys = [...new Set([thisMonth, ...periods.map((p) => periodKey(p.label)).filter(Boolean)])].sort().reverse();
  const month = keys.includes(kf.month) ? kf.month : thisMonth;
  const sitePeriod = periods.find((p) => periodKey(p.label) === month);
  // a month the site has not opened yet is tracked on the latest list of items
  const template = sitePeriod || periods[periods.length - 1];
  const items = template ? template.items : [];
  const onSite = !!sitePeriod;
  const ticked = new Set(marks.filter((m) => m.period === month).map((m) => m.item));

  const earning = items.filter((i) => Number(i.max) > 0), penalties = items.filter((i) => Number(i.max) <= 0);
  const others = earning.filter((i) => GRADED_BY_OTHERS.test(i.title));
  const mineItems = earning.filter((i) => !others.includes(i));
  const graded = (i) => onSite && i.graded > 0;
  const approved = onSite ? items.reduce((n, i) => n + (Number(i.value) || 0), 0) : 0;
  const waiting = mineItems.filter((i) => ticked.has(i.title) && !graded(i));
  const pending = waiting.reduce((n, i) => n + Number(i.max), 0);
  const fined = onSite ? penalties.reduce((n, i) => n + (Number(i.value) || 0), 0) : 0;

  const reached = new Map(progress.filter((p) => p.period === month).map((p) => [p.item, p.step]));
  const skipped = (i) => !graded(i) && reached.get(i.title) === SKIPPED;
  const doable = mineItems.filter((i) => !skipped(i));
  const doneCount = doable.filter((i) => graded(i) || ticked.has(i.title)).length;
  const title = (i, cls) => i.criteria.length
    ? h("details", { class: "item" }, h("summary", { class: cls || null, text: i.title }), h("ul", {}, i.criteria.map((c) => h("li", { text: c }))))
    : h("span", { class: cls || null, text: i.title });

  const stepsOf = (i) => customSteps[i.title] ?? defaultSteps(i.title);
  const stepNow = (i) => { const n = stepsOf(i).length; return graded(i) ? n : skipped(i) ? 0 : Math.min(n, reached.get(i.title) ?? (ticked.has(i.title) ? n : 0)); };
  // finishing the last stage is the same as ticking the item, and stepping back from it unticks it
  const saveStep = async (i, step) => {
    const last = stepsOf(i).length;
    const ok = await act(async () => {
      await api("PUT", "/api/kpi-progress", { period: month, item: i.title, step, done: step === last });   // one request: the stage and the tick
      return true;
    });
    if (ok) monthsView();
  };
  const editSteps = (i) => {
    const area = h("textarea", { rows: "5", spellcheck: "false", placeholder: "Yozildi\nTopshirildi\nTizimga yuklandi" });
    area.value = stepsOf(i).join("\n");
    openSheet("Bosqichlar", h("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        const list = area.value.split("\n").map((x) => x.trim()).filter(Boolean);
        if (await act(() => api("PUT", "/api/kpi-steps", { item: i.title, steps: list }))) { sheetBox.close(); say("Saqlandi", true); monthsView(); }
      } },
      h("p", { class: "muted", text: i.title }), field("Har qatorda bitta bosqich, barcha oylar uchun", area),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Saqlash" }))));
  };
  // the stages as a track: done ones green with a check, the next one ringed, the rest quiet.
  // Clicking a done stage takes it (and the ones after it) back; any other marks up to it.
  const stepper = (i) => {
    const list = stepsOf(i), now = stepNow(i);
    if (!list.length) return null;
    return h("ol", { class: "track" + (skipped(i) ? " off" : ""), "aria-label": "Bosqichlar: " + now + " / " + list.length }, list.map((name, n) => {
      const state = n < now ? "done" : n === now ? "current" : "todo";
      return h("li", { class: state },
        h("button", { type: "button", disabled: graded(i) || skipped(i), "aria-pressed": String(n < now),
          title: n < now ? "Bekor qilish: «" + name + "» va keyingilari" : "Bajarildi deb belgilash" + (n > now ? " (oldingilari bilan)" : ""),
          onclick: () => saveStep(i, n < now ? n : n + 1) }, h("span", { class: "dot" }, n < now ? icon("check") : null), h("span", { class: "step-name", text: name })));
    }));
  };
  const skip = async (i, on) => {
    const ok = await act(async () => {
      await api("PUT", "/api/kpi-progress", { period: month, item: i.title, step: on ? SKIPPED : 0, ...(on ? { done: false } : {}) });
      return true;
    });
    if (ok) { say(on ? "«Bajarib bo'lmaydi» deb belgilandi" : "Band qaytarildi", true); monthsView(); }
  };
  // one name per state, the same as the toast and the home page use
  const statusOf = (i) => {
    const list = stepsOf(i), now = stepNow(i);
    if (graded(i)) return chip("Tasdiqlandi", "ok", "check");
    if (skipped(i)) return chip("Bajarib bo'lmaydi");
    if (ticked.has(i.title)) return chip("Saytda kutilmoqda", "live", "clock");
    if (now > 0) return chip("Jarayonda", "warn");
    return chip(list.length ? "Boshlanmagan" : "Bajarilmagan");
  };
  const progressCell = (i) => {
    const list = stepsOf(i), now = stepNow(i);
    if (graded(i)) return h("span", { class: "tick-done", title: "Tasdiqlandi" }, icon("check"));
    if (list.length) {
      return h("div", { class: "prog" + (now === list.length ? " full" : "") + (skipped(i) ? " off" : "") }, h("b", { text: now + "/" + list.length }),
        h("span", { class: "segs", "aria-hidden": "true" }, list.map((x, n) => h("i", { class: n < now ? "on" : null }))));
    }
    const box = h("input", { class: "check", type: "checkbox", "aria-label": i.title + ": bajardim", checked: ticked.has(i.title), disabled: skipped(i) });
    box.addEventListener("change", async () => {
      if (await act(() => api("PUT", "/api/kpi-marks", { period: month, item: i.title, done: box.checked }))) monthsView(); else box.checked = !box.checked;
    });
    return box;
  };
  const actions = (i) => {
    if (graded(i)) return null;
    const list = stepsOf(i), now = stepNow(i);
    const next = !skipped(i) && list.length && now < list.length
      ? h("button", { type: "button", class: "next-step", "aria-label": i.title + ": «" + list[now] + "» bajarildi", onclick: () => saveStep(i, now + 1) }, icon("check"), list[now]) : null;
    return h("div", { class: "row-actions" }, next,
      h("div", { class: "row-more" },
        skipped(i) ? h("button", { type: "button", class: "step-edit show", text: "Qaytarish", onclick: () => skip(i, false) })
          : h("button", { type: "button", class: "step-edit", text: "Bajarib bo'lmaydi", title: "Bu oy bajarilmaydi: ochiq bandlar va eslatmalardan chiqadi", onclick: () => skip(i, true) }),
        skipped(i) ? null : h("button", { type: "button", class: "step-edit", text: list.length ? "Bosqichlar" : "+ Bosqichlar", "aria-label": i.title + ": bosqichlarni tahrirlash", onclick: () => editSteps(i) })));
  };

  const earnRow = (i) => h("tr", { class: skipped(i) ? "off" : null },
    h("td", { class: "w-check" }, progressCell(i)),
    h("td", {}, title(i, "strong"), stepper(i)),
    h("td", { class: "status-cell" }, statusOf(i), actions(i)),
    h("td", { class: "num nowrap" }, graded(i) ? [h("b", { text: i.value }), h("span", { class: "muted", text: " / " + i.max })] : h("span", { class: "muted", text: skipped(i) ? "–" : i.max })));

  const otherRow = (i) => h("tr", {}, h("td", { class: "w-check" }, graded(i) ? h("span", { class: "tick-done", title: "Tasdiqlandi" }, icon("check")) : h("span", { class: "tick-wait", title: "Oy oxirida" }, icon("clock"))),
    h("td", {}, title(i, "strong")),
    h("td", { class: "nowrap" }, graded(i) ? chip("Tasdiqlandi", "ok") : h("span", { class: "muted", text: "Oy oxirida" })),
    h("td", { class: "num nowrap" }, graded(i) ? [h("b", { text: i.value }), h("span", { class: "muted", text: " / " + i.max })] : h("span", { class: "muted", text: i.max })));

  const hits = penalties.filter((i) => onSite && Number(i.value) < 0), clean = penalties.filter((i) => !hits.includes(i));
  const fines = h("section", { class: "card", "aria-labelledby": "fines-h" },
    h("div", { class: "rail-head" }, h("h2", { id: "fines-h", text: "Jarimalar" }), h("b", { class: fined < 0 ? "minus" : "muted", text: hrs(fined) + "%" })),
    hits.length ? h("ul", { class: "plain fines" }, hits.map((i) => h("li", {}, title(i), h("b", { class: "minus", text: i.value })))) : null,
    h("details", { class: "fold-line" }, h("summary", { text: onSite ? clean.length + " ta bandda jarima yo'q" : "Sayt hali baholamagan, " + clean.length + " ta band" }),
      h("ul", { class: "plain fines" }, clean.map((i) => h("li", {}, title(i, "muted"), h("span", { class: "muted nowrap", text: "gacha " + i.min }))))));
  // the site lists the months newest first without a year: count back from this one
  const monthYears = (() => {
    let y = Number(today().slice(0, 4)), prev = null;
    const idx = (m) => MONTHS.indexOf(m.month.split(/\s+/)[0].toLowerCase());
    const first = months.length ? idx(months[0]) : -1;
    if (first > Number(today().slice(5, 7)) - 1) y--;   // the newest row is a month of last year
    return months.map((m) => { const i = idx(m); if (prev !== null && i > prev) y--; prev = i; return y; });
  })();
  const spansYears = new Set(monthYears).size > 1;
  const history = months.length ? h("section", { class: "card", "aria-labelledby": "hist-h" }, h("h2", { id: "hist-h", text: "Oylar tarixi" }),
    h("ul", { class: "plain history" }, months.map((m, n) => h("li", {},
      h("span", { class: "strong", text: m.month + (spansYears ? " " + monthYears[n] : "") }), meter(Math.min(100, parseFloat(m.percent) || 0)), h("b", { text: m.percent }),
      h("small", { class: "muted", text: monthState(m).label }))))) : null;

  const fill = h("i"), soft = h("i", { class: "soft" });
  fill.style.setProperty("--v", Math.max(0, Math.min(100, approved)));
  soft.style.setProperty("--v", Math.max(0, Math.min(100 - Math.max(0, approved), pending)));
  const sel = h("select", { "aria-label": "Oy", onchange: (e) => { kf.month = e.target.value; monthsView(); } },
    keys.map((k) => h("option", { value: k, selected: k === month, text: periodTitle(k) })));
  const head = withAge(data, "periods", "Saytdagi keyingi o'zgarishlar bu yerda ko'rinmaydi.", pageHead("Ustama", "Oylik ustama foizi va uning bandlari", sel));
  if (!items.length) return show(head, h("p", { class: "sub" }, "Bandlarni ko'rish uchun ", h("a", { href: "#/kabinet", text: "Kabinetda qayta sinxronlang" }), "."), history);

  const left = month === thisMonth ? ustamaOpen(data, marks, month, progress) : null;
  const part = (cls, label, value) => h("span", {}, h("small", {}, cls ? h("i", { class: cls }) : null, label), h("b", { text: value }));
  show(head,
    h("section", { class: "card hero-load", "aria-label": "Oy natijasi" },
      h("div", { class: "hero-top" },
        h("div", {}, h("span", { class: "label", text: periodTitle(month) + (onSite ? ": tasdiqlangan ustama" : ": kutilayotgan ustama") }), h("b", { class: "big", text: hrs(onSite ? approved : pending) + "%" })),
        h("div", { class: "parts" },
          part(null, "Mening bandlarim", doneCount + " / " + doable.length + (doable.length < mineItems.length ? " · " + (mineItems.length - doable.length) + " tasi bajarilmaydi" : "")),
          onSite ? part("k-done", "Tasdiqlangan", hrs(approved) + "%") : null,
          part("k-soft", "Kutilmoqda", "+" + hrs(pending) + "%"),
          onSite ? part(null, "Hammasi tasdiqlansa", hrs(approved + pending) + "%") : part(null, "Sayt", "Ochilmagan"))),
      h("span", { class: "bars tall", "aria-hidden": "true" }, fill, soft),
      left && left.count ? h("p", { class: "sub", text: left.count + " ta band ochiq, " + hrs(left.points) + " ball. Oy tugashiga " + left.days + " kun qoldi." }) : null),
    h("div", { class: "split" },
      h("div", { class: "card flush" }, h("table", { class: "kpi-items" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "w-check", text: "Bajarildi" }), h("th", { scope: "col", text: "Ustama bandi" }), h("th", { scope: "col", text: "Holat" }), h("th", { scope: "col", class: "num", text: "Ball" }))),
        h("tbody", {}, h("tr", { class: "group" }, h("th", { colspan: "4", scope: "colgroup", text: "Men bajaradigan bandlar" })), mineItems.map(earnRow)),
        others.length ? h("tbody", {}, h("tr", { class: "group" }, h("th", { colspan: "4", scope: "colgroup", text: "Oy oxirida tasdiqlanadi" })), others.map(otherRow)) : null)),
      h("aside", { class: "rail sticky" }, fines, history)));
}

/* ------------------------------------------------------------ notifications */
const NOTE_ICONS = { lesson_added: "plus", lesson_removed: "x", attendance_missing: "alert" };
const canNotify = "Notification" in window;
function lastShown(set) {
  try { if (set !== undefined) localStorage.setItem("lastNote", String(set)); return Number(localStorage.getItem("lastNote")) || 0; } catch (err) { return 0; }
}
// the badge, and a Chrome notification for each notice not shown yet
async function refreshNotes() {
  let res;
  try { res = await api("GET", "/api/notifications"); } catch (err) { return; }
  const badge = document.getElementById("note-badge");
  badge.textContent = String(res.unread); badge.hidden = !res.unread;
  const newest = res.items.length ? res.items[0].id : 0, seen = lastShown();
  if (canNotify && Notification.permission === "granted" && seen) {
    res.items.filter((n) => n.id > seen && !n.read_at).reverse().forEach((n) => {
      const pop = new Notification(n.title, { body: n.body, tag: "note-" + n.id });
      pop.onclick = () => { window.focus(); if (n.link) location.hash = n.link; pop.close(); };
    });
  }
  if (newest > seen || !seen) lastShown(newest);
}
// every minute in view; every five minutes in a background tab (a sync, which makes the notices, runs
// every 30), so the Chrome pop-ups still come; at once when the tab comes back
const NOTES_HIDDEN_MS = 5 * 60000;
let notesAt = 0;
function pollNotes() {
  if (document.hidden && Date.now() - notesAt < NOTES_HIDDEN_MS) return;
  notesAt = Date.now();
  refreshNotes();
}
setInterval(pollNotes, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { notesAt = Date.now(); refreshNotes(); } });

// a Chrome reminder 15 minutes before a lesson, while the page is open; each lesson is announced once
const REMIND_MIN = 15;
let reminderCtx = null;
async function lessonReminder() {
  if (!canNotify || Notification.permission !== "granted") return;
  const t = today(), now = nowTime(), mins = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  try {
    if (!semesterNow.loaded) await loadSemester();
    if (!reminderCtx || reminderCtx.day !== t) {
      const [{ data }, { sessions }, { items }] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/sessions"), api("GET", "/api/cancelled")]);
      reminderCtx = { day: t, ctx: lessonContext(sessions, data, new Set(items.map((c) => cancelKey(c.date, c.para, c.subject)))) };
    }
  } catch (err) { return; }
  let done = "";
  try { done = localStorage.getItem("reminded") || ""; } catch (err) { /* reminders may repeat after a reload */ }
  for (const e of entriesFor([t], reminderCtx.ctx)) {
    const times = PARA_TIMES[e.para], key = t + "|" + e.para;
    if (!times || done.split(",").includes(key)) continue;
    const left = mins(times[0]) - mins(now);
    if (left < 0 || left > REMIND_MIN) continue;
    const site = e.kind === "site";
    const pop = new Notification((site ? e.lesson.subject : COURSE.subject) + ", " + left + " daqiqadan keyin", {
      body: [e.para + "-para, " + times[0], site ? e.lesson.group : COURSE.group, site ? fmtRoom(e.lesson.room) : COURSE.room].filter(Boolean).join(" · "), tag: "lesson-" + key });
    pop.onclick = () => { window.focus(); location.hash = "#/"; pop.close(); };
    done = [...done.split(",").filter((k) => k.startsWith(t)), key].join(",");
    try { localStorage.setItem("reminded", done); } catch (err) { /* see above */ }
  }
}
setInterval(lessonReminder, 60000);
lessonReminder();

async function notesView() {
  const show = painter(notesView, null);   // paints only while this is still the page
  const { items, unread } = await api("GET", "/api/notifications");
  const permission = canNotify ? Notification.permission : "unsupported";
  const enable = h("button", { type: "button", class: "primary", text: "Chrome bildirishnomalarini yoqish", onclick: async () => {
      const r = await Notification.requestPermission();
      if (r === "granted") { lastShown(items.length ? items[0].id : 0); new Notification("Bildirishnomalar yoqildi", { body: "Yangi xabarlar shu yerda ham chiqadi." }); say("Yoqildi", true); } else say("Chrome ruxsat bermadi. Sayt sozlamalaridan yoqing.");
      notesView();
    } });
  const notice = permission === "granted" ? h("p", { class: "sub", text: "Chrome bildirishnomalari yoqilgan. Ular sahifa ochiq turganda keladi." })
    : permission === "denied" ? h("p", { class: "sub", text: "Chrome bildirishnomalari bloklangan. Manzil satridagi belgi orqali ruxsat bering." })
    : permission === "default" ? h("section", { class: "card note-cta" }, h("div", {}, h("h2", { text: "Chrome orqali ham olish" }), h("p", { class: "sub", text: "Yangi yoki olib tashlangan darslar, olinmagan davomatlar va dars boshlanishiga 15 daqiqa qolgani haqida xabar keladi, sahifa ochiq turganda." })), enable) : null;
  const when = (ts) => { const iso = new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: TZ }); return capital(relDay(iso) || dayText(iso)) + ", " + timeText(ts); };
  show(pageHead("Bildirishnomalar", unread ? unread + " ta yangi" : "Hammasi o'qilgan"), notice,
    items.length ? h("ul", { class: "plain note-list" }, items.map((n) => {
      const lines = noteLessons(n);
      return h("li", { class: "card note" + (n.read_at ? "" : " unread") },
        h("a", { href: n.link || "#/", "aria-label": n.title },
          h("span", { class: "note-icon " + n.kind }, icon(NOTE_ICONS[n.kind] || "alert")),
          h("div", { class: "note-main" },
            h("div", { class: "note-head" }, h("b", { text: n.title }), h("small", { class: "muted nowrap", text: when(n.created_at) })),
            lines.list.length ? h("ul", { class: "plain note-lessons" }, lines.list.map((l) => h("li", {},
              h("span", { class: "nl-when" }, h("b", { text: shortDate(l.iso) }), h("small", { text: capital(weekday(l.iso)) })),
              h("span", { class: "nl-para" }, l.para + "-para", PARA_TIMES[l.para] ? h("small", { text: PARA_TIMES[l.para][0] }) : null),
              h("span", { class: "nl-what" }, h("b", { text: l.subject }), l.group ? h("small", { text: l.group }) : null))),
              lines.more ? h("li", { class: "nl-more muted", text: "va yana " + lines.more + " ta" }) : null)
              : n.body ? h("p", { class: "muted", text: n.body }) : null)));
    }))
      : h("p", { class: "card empty", text: "Hozircha xabar yo'q. Keyingi sinxronlashda o'zgarish bo'lsa, shu yerda chiqadi." }));
  if (unread) { await act(() => api("POST", "/api/notifications/read")); document.getElementById("note-badge").hidden = true; }
}

/* ------------------------------------------------------------ home */
const DAY_SHORT = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];
async function homeView() {
  const show = painter(homeView, null);   // paints only while this is still the page
  const [{ data }, { sessions }, { hours: coursePlan }, { items: cancelledList }, status, notes, debts, { works }, { steps: customSteps, marks, progress }, semester, { students }] = await Promise.all([
    api("GET", "/api/oxu"), api("GET", "/api/sessions"), api("GET", "/api/course-plan"), api("GET", "/api/cancelled"), api("GET", "/api/oxu/status"),
    api("GET", "/api/notifications"), api("GET", "/api/retakes"), api("GET", "/api/kpi-works"), api("GET", "/api/kpi-marks"), api("GET", "/api/semester"), api("GET", "/api/students"), loadPlans()]);
  const t = today(), now = nowTime();
  planCache.sessions = sessions;
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const ctx = lessonContext(sessions, data, cancelled);
  const colorOf = subjectColors(data);
  const entries = entriesFor([t], ctx).sort((a, b) => a.para - b.para);
  const tomorrow = shiftDay(t, 1);

  const lessonRow = (e) => {
    const times = PARA_TIMES[e.para], isNow = times && times[0] <= now && now <= times[1];
    return h("li", { class: "day-row" + (isNow ? " now" : "") + (paraOver(e, t, now) ? " over" : "") },
      h("div", { class: "day-time" }, h("b", { text: e.para + "-para" }), times ? h("small", { text: times[0] }) : null),
      e.kind === "site" ? siteCard(e.lesson, ctx, colorOf(e.lesson.subject), e) : courseCard(e, colorOf(COURSE.subject)));
  };
  const upcoming = nextEntry(ctx, t, now);
  const P = data && data.load ? loadPace(data, sessions, coursePlan, cancelled, semester) : null;
  const score = ((data && data.kpi && data.kpi.bands) || []).reduce((n, b) => n + (Number(b.score) || 0), 0);
  const bonusNow = ustamaFigure(data, marks, t.slice(0, 7));
  const stat = (href, label, value, note) => h("a", { class: "tile link", href }, h("span", { class: "label", text: label }), h("b", { text: String(value) }), note ? h("span", { class: "note", text: note }) : null);

  const start = (data && data.load && data.load.start) || "";
  const gaps = (ctx.unsavedList || []).filter((l) => l.date >= start && lessonOver(l) && !cancelled.has(cancelKey(l.date, l.para, l.subject))).length;
  const gapList = courseGaps(ctx, t, now), todo = gapList.length;
  const unknownSite = ctx.siteLessons.filter((l) => l.date >= start && !cancelled.has(cancelKey(l.date, l.para, l.subject)) && Timetable.siteStatus(l, ctx, t, now) === "unknown").length;
  // preparation: today's lessons still to come and tomorrow's
  const unplanned = entriesFor([t, tomorrow], ctx).filter((e) => !paraOver(e, t, now) && planStage(planOf(e)) === "none").sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para);
  const todayUnplanned = unplanned.filter((e) => e.date === t), tomorrowUnplanned = unplanned.filter((e) => e.date === tomorrow);
  const notReady = entries.filter((e) => !paraOver(e, t, now) && planStage(planOf(e)) === "planned").length;
  const paras = (list) => list.map((e) => e.para).join(", ") + "-para";
  const ready = works.filter((w) => { const n = (customSteps[w.band] ?? workSteps(w.band)).length; return n && w.step >= n; }).length;
  const syncText = { expired: "Sessiya tugadi, yangi cookie kerak", wrong_account: "Saytda boshqa hisob ochiq", none: "Avtomatik sinxronlash o'chiq", error: "Sinxronlash xato berdi, Kabinetni tekshiring" }[status.state];
  const bonus = ustamaOpen(data, marks, t.slice(0, 7), progress);
  // a student who has missed a quarter of the course's lessons is close to losing the subject
  const atRisk = students.filter((x) => x.active && x.lessons >= 4 && x.missed / x.lessons >= .25).length;
  const behind = P && P.all.diff !== null && P.all.diff <= -PARA_SLACK ? -P.all.diff : 0;
  const tasks = [   // [link, icon, text]; the alert ones lead
    // a sync that was never set up is a choice, not an emergency: it waits under "Keyinroq"
    syncText && status.state !== "none" ? ["#/kabinet", "alert", syncText] : null,
    todo ? ["#/jadval", "alert", COURSE.group + ": " + todo + " ta darsda davomat olinmagan"] : null,
    gaps ? ["#/jadval", "alert", "Saytda " + gaps + " ta darsda davomat olinmagan"] : null,
    todayUnplanned.length ? ["#/reja", "alert", "Bugun " + paras(todayUnplanned) + ": reja yo'q"] : null,
    notes.unread ? ["#/bildirishnomalar", "alert", notes.unread + " ta yangi bildirishnoma"] : null,
    bonus.count && bonus.days <= 7 ? ["#/ustama", "alert", "Ustama: " + bonus.count + " ta band ochiq, oy tugashiga " + bonus.days + " kun"] : null,
    notReady ? ["#/reja", "clock", "Bugun " + notReady + " ta darsga hali tayyor emassiz"] : null,
    tomorrowUnplanned.length ? ["#/reja", "clock", "Ertangi " + paras(tomorrowUnplanned) + ": reja yo'q"] : null,
    behind ? ["#/yuklama", "clock", "Yuklama rejadan " + P.est + h1(behind) + " soat orqada"] : null,
    bonus.count && bonus.days > 7 ? ["#/ustama", "clock", "Ustama: " + bonus.count + " ta band ochiq, oy tugashiga " + bonus.days + " kun"] : null,
    thisSemester(debts).owed ? ["#/qarzlar", "clock", thisSemester(debts).owed + " ta qarz topshirilmagan"] : null,
    atRisk ? ["#/talabalar", "clock", atRisk + " ta talaba darslarning 25% dan ko'pini qoldirgan"] : null,
    syncText && status.state === "none" ? ["#/kabinet", "clock", "Sinxronlash sozlanmagan: sayt ma'lumotlari yangilanmaydi"] : null,
    ready ? ["#/ilmiy-kpi", "check", ready + " ta ish saytga yuklashga tayyor"] : null,
  ].filter(Boolean);
  const urgent = tasks.filter((x) => x[1] === "alert"), later = tasks.filter((x) => x[1] !== "alert");
  const taskList = (list) => h("ul", { class: "plain tasks" }, list.map(([href, ic, text]) => h("li", { class: ic === "alert" ? "urgent" : null }, h("a", { href }, icon(ic), h("span", { text })))));

  const running = upcoming && upcoming.kind === "course" && upcoming.date === t && now >= PARA_TIMES[upcoming.para][0];
  const nextAction = !running ? null : upcoming.session ? h("button", { type: "button", class: "primary", text: "Davomatni davom ettirish", onclick: () => { location.hash = "#/dars/" + upcoming.session.id; } })
    : h("button", { type: "button", class: "primary", text: "Davomatni boshlash", onclick: () => startCourse(upcoming) });

  // today's lesson whose para ended with its attendance unfinished leads, unless the next one is about to start
  const mins = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const startsIn = upcoming && upcoming.date === t && PARA_TIMES[upcoming.para] ? mins(PARA_TIMES[upcoming.para][0]) - mins(now) : Infinity;
  const gap = !running && startsIn > 30 ? gapList.find((e) => e.date === t) : null;
  const gapAction = !gap ? null : gap.session ? h("button", { type: "button", class: "primary", text: "Davomatni tugatish", onclick: () => { location.hash = "#/dars/" + gap.session.id; } })
    : h("button", { type: "button", class: "primary", text: "Davomatni boshlash", onclick: () => startCourse(gap) });
  const siteLink = upcoming && upcoming.kind === "site" && upcoming.date === t && upcoming.lesson.url
    ? h("a", { class: "button primary", href: SITE + upcoming.lesson.url, target: "_blank", rel: "noopener", text: "Saytda ochish" }) : null;

  // ---- the day in one line under the list
  const lastEnd = entries.length && PARA_TIMES[entries[entries.length - 1].para] ? PARA_TIMES[entries[entries.length - 1].para][1] : "";
  const next = entriesFor([tomorrow], ctx).sort((a, b) => a.para - b.para);
  const dayFoot = h("p", { class: "today-foot" },
    h("span", { text: entries.length ? "Bugun " + entries.length + " ta dars · " + entries.length * HOURS_PER_PARA + " soat" + (lastEnd ? " · " + lastEnd + " da tugaydi" : "") : "Bugun dars yo'q" }),
    h("span", { text: next.length ? "Ertaga " + next.length + " ta dars" + (PARA_TIMES[next[0].para] ? ", birinchisi " + PARA_TIMES[next[0].para][0] + " da" : "") : "Ertaga dars yo'q" }));

  const todayCard = h("section", { class: "card today-card" },
    gap ? nextHero(gap, t, now, gapAction, gap.session ? "Dars tugadi, davomat tugatilmagan" : "Dars tugadi, davomat olinmagan")
      : upcoming ? nextHero(upcoming, t, now, nextAction || siteLink)
      : h("section", { class: "today-top empty" }, h("div", { class: "hero-body" }, h("h2", { text: "Yaqin kunlarda dars yo'q" }), h("p", { class: "hero-meta", text: "Jadval yangilansa, keyingi dars shu yerda chiqadi." }))),
    entries.length ? h("ul", { class: "plain day-list", "aria-label": "Bugungi jadval" }, entries.map(lessonRow)) : null,
    dayFoot);

  // ---- semester pace
  const kv = (label, value, cls) => h("div", { class: "kv" }, h("span", { text: label }), h("b", { class: cls || null }, value));
  const cardHead = (title, href) => h("h2", {}, href ? h("a", { class: "card-link", href }, title, icon("forward")) : title);
  const ring = (pct, need) => {
    const r = h("div", { class: "ring", role: "img", "aria-label": "Bajarildi " + pct1(pct) }, need === null ? null : h("i", { class: "ring-need" }), h("b", { text: pct1(pct) }));
    r.style.setProperty("--v", Math.max(0, Math.min(100, pct || 0)));
    if (need !== null) r.style.setProperty("--need", Math.max(0, Math.min(100, need)));
    return r;
  };
  const paceCard = h("section", { class: "card stat-card" }, cardHead("Semestr sur'ati", "#/yuklama"),
    !P ? h("p", { class: "stat-empty" }, "Yuklama hali sinxronlanmagan. ", h("a", { href: "#/kabinet", text: "Kabinet" }))
      : [h("div", { class: "ring-row" }, ring(P.all.pct, needPct(P.all)),
          h("div", {}, h("b", { class: "stat-big" }, h1(P.all.held), h("small", { text: " / " + P.est + h1(P.all.plan) + " soat" })),
            P.all.diff === null ? null : h("p", { class: "stat-delta" + verdictClass(P.all.diff), text: verdictText(P.all.diff) }))),
        P.all.expected === null ? null : kv("Bugungacha kerak edi", P.est + h1(P.all.expected) + " soat · " + pct1(needPct(P.all))),
        P.types.map(({ type, sum, est }) => kv(type || "Boshqa", h1(sum.held) + " / " + (est ? "~" : "") + h1(sum.plan) + " · " + pct1(sum.pct)))]);

  // ---- this week, day by day
  const monday = shiftDay(t, -((dowOf(t) + 6) % 7));
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => shiftDay(monday, i)), weekEntries = entriesFor(week, ctx);
  const perDay = week.map((d) => { const list = weekEntries.filter((e) => e.date === d), held = list.filter((e) => paraOver(e, t, now)).length * HOURS_PER_PARA; return { d, held, soon: list.length * HOURS_PER_PARA - held }; })
    .filter((x, i) => i < 5 || x.held + x.soon);
  const weekHeld = perDay.reduce((n, x) => n + x.held, 0), weekAll = perDay.reduce((n, x) => n + x.held + x.soon, 0), top = Math.max(HOURS_PER_PARA, ...perDay.map((x) => x.held + x.soon));
  const col = (x) => {
    const a = h("i", { class: "held" }), b = h("i", { class: "soon" });
    a.style.setProperty("--h", 100 * x.held / top); b.style.setProperty("--h", 100 * x.soon / top);
    return h("li", { class: x.d === t ? "today" : null, title: capital(weekday(x.d)) + ": " + (x.held + x.soon) + " soat" }, h("small", { text: x.held + x.soon ? String(x.held + x.soon) : "" }), h("div", { class: "wk-bar" }, x.soon ? b : null, x.held ? a : null), h("span", { text: DAY_SHORT[dowOf(x.d)] }));
  };
  const weekCard = h("section", { class: "card stat-card" }, cardHead("Bu hafta", "#/jadval"),
    !weekAll ? h("p", { class: "stat-empty", text: "Bu hafta jadvalda dars yo'q." })
      : [h("b", { class: "stat-big" }, String(weekHeld), h("small", { text: " / " + weekAll + " soat o'tildi" })),
        h("ul", { class: "plain wk", "aria-hidden": "true" }, perDay.map(col)),
        P && P.weekly.required !== null ? kv("Kerakli sur'at", "haftasiga " + P.est + h1(P.weekly.required) + " soat") : null,
        P && P.weekly.current !== null ? kv("Hozirgi sur'at", "haftasiga " + h1(P.weekly.current) + " soat") : null]);

  // ---- the course group's attendance
  const fin = sessions.filter((x) => x.finished_at && x.total > 0).sort((a, b) => b.date.localeCompare(a.date) || b.started_at - a.started_at);
  const rateOf = (list) => (list.length ? 100 * list.reduce((n, x) => n + x.came / x.total, 0) / list.length : null);
  const weekAgo = shiftDay(t, -7), twoAgo = shiftDay(t, -14);
  const recent = rateOf(fin.filter((x) => x.date > weekAgo)), before = rateOf(fin.filter((x) => x.date <= weekAgo && x.date > twoAgo));
  const change = recent !== null && before !== null ? recent - before : null;
  const attBar = paceBar(rateOf(fin), null);
  const attCard = h("section", { class: "card stat-card" }, cardHead("Davomat · " + COURSE.group, "#/talabalar"),
    !fin.length ? h("p", { class: "stat-empty", text: "Hali tugatilgan dars yo'q." })
      : [h("b", { class: "stat-big" }, Pace.fmt1(rateOf(fin)), h("small", { text: "% o'rtacha" })),
        change === null ? null : h("p", { class: "stat-delta" + (Math.abs(change) < .05 ? "" : change < 0 ? " neg" : " pos"), text: signed(change) + "% o'tgan haftaga nisbatan" }),
        attBar,
        kv("Oxirgi dars", fin[0].came + " / " + fin[0].total + " · " + (relDay(fin[0].date) || shortDate(fin[0].date))),
        kv("Tugatilgan darslar", fin.length + " ta"),
        kv("25% dan ko'p qoldirgan", atRisk ? atRisk + " ta talaba" : "yo'q", atRisk ? "neg" : null)]);

  const monthDays = []; for (let d = t.slice(0, 8) + "01"; d <= t; d = shiftDay(d, 1)) monthDays.push(d);
  const monthHours = entriesFor(monthDays, ctx).filter((e) => paraOver(e, t, now)).length * HOURS_PER_PARA;
  const monthName = capital(MONTHS[Number(t.slice(5, 7)) - 1]);
  const S = Pace.semester(semester.start, semester.weeks, t);
  const semMark = h("div", { class: "sem-mark" }, h("p", {}, h("b", { text: S.week ? S.week + "-hafta" : "Semestr boshlanmagan" }),
      S.week ? " / " + S.weeks + " · " + S.day + "-ish kuni / " + S.total + " · " + S.left + " kun qoldi" : ""),
    paceBar(100 * S.frac, null, "time"));
  show(withAge(data, "unsaved", "Shundan keyin o'tgan darslar holati noma'lum.", pageHead("Bugun", capital(longDay(t)), semMark)),
    h("div", { class: "lead" },
      todayCard,
      h("section", { class: "card attention", "aria-labelledby": "todo-h" }, h("h2", { id: "todo-h" }, "E'tibor talab qiladi", tasks.length ? h("span", { class: "badge" + (urgent.length ? "" : " calm"), text: String(urgent.length || tasks.length) }) : null),
        !tasks.length ? h("p", { class: "all-clear" }, icon("check"), "Hammasi joyida")
          : [urgent.length ? taskList(urgent) : null, later.length ? [urgent.length ? h("p", { class: "group-label", text: "Keyinroq" }) : null, taskList(later)] : null])),
    h("div", { class: "home-stats" }, paceCard, weekCard, attCard),
    h("div", { class: "tiles" },
      stat("#/ustama", "Ustama, " + monthName.toLowerCase(), bonusNow.known ? hrs(bonusNow.value) + "%" : "–", bonusNow.known ? (bonusNow.onSite ? "saytda tasdiqlangan" : "belgilangan bandlardan") + (bonus.count ? " · " + bonus.count + " ta ochiq" : "") : "Sinxronlanmagan"),
      stat("#/ilmiy-kpi", "Ilmiy ball", score.toFixed(2), works.length ? works.length + " ta ish kuzatuvda" : null),
      stat("#/yuklama", monthName + "da o'tildi", hrs(monthHours) + " soat", P ? "semestrda " + h1(P.all.held) + " soat" : null),
      stat("#/jadval", "Olinmagan davomat", todo + gaps, [todo ? COURSE.group + ": " + todo : null, gaps ? "saytda: " + gaps : null, unknownSite ? unknownSite + " ta noma'lum" : null].filter(Boolean).join(" · ") || "hammasi olingan")));
}

/* ------------------------------------------------------------ theme */
function paintTheme() {
  const now = document.documentElement.dataset.theme || "auto";
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === now)));
}
document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
  const v = b.dataset.themeSet;
  if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  try { if (v === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", v); } catch (err) { /* this visit only */ }
  paintTheme();
}));
paintTheme();

/* ------------------------------------------------------------ search and keyboard */
const palette = document.getElementById("palette"), paletteInput = document.getElementById("palette-input"), paletteList = document.getElementById("palette-list");
const PALETTE_PAGES = [["#/", "Bosh sahifa"], ["#/jadval", "Dars jadvali"], ["#/reja", "Dars rejasi"], ["#/yuklama", "Yuklama"], ["#/ilmiy-kpi", "Ilmiy KPI"], ["#/ustama", "Ustama"], ["#/darslar", "Darslar"], ["#/talabalar", "Talabalar"], ["#/qarzlar", "Qarzlar"], ["#/bildirishnomalar", "Bildirishnomalar"], ["#/kabinet", "Kabinet"]];
let paletteItems = [], paletteAt = 0;
function renderPalette() {
  const q = paletteInput.value.trim().toLowerCase();
  const shown = paletteItems.filter((x) => !q || x.text.toLowerCase().includes(q)).slice(0, 8);
  paletteAt = Math.min(paletteAt, Math.max(0, shown.length - 1));
  paletteList.replaceChildren(...(shown.length ? shown.map((x, i) => h("li", {}, h("a", { href: x.href || "#", class: i === paletteAt ? "on" : null, onclick: (e) => { palette.close(); if (x.run) { e.preventDefault(); x.run(); } } }, h("span", { text: x.text }), h("small", { class: "muted", text: x.kind }))))
    : [h("li", { class: "palette-none", text: "Hech narsa topilmadi" })]));
  return shown;
}
async function openPalette() {
  if (palette.open) return;
  paletteItems = PALETTE_PAGES.map(([href, text]) => ({ href, text, kind: "Sahifa" }));
  paletteInput.value = ""; paletteAt = 0; renderPalette(); palette.showModal();
  try { const { students } = await api("GET", "/api/students"); paletteItems.push(...students.map((s) => ({ href: "#/talaba/" + s.id, text: s.name, kind: "Talaba" }))); renderPalette(); } catch (err) { /* pages still work */ }
  paletteActions().then((list) => { paletteItems.unshift(...list); renderPalette(); }, () => { /* pages and students still work */ });
}
// the two things done most often, without leaving the keyboard: take attendance of the lesson that is
// on (or next today), and read the site now
async function paletteActions() {
  const out = [{ text: "Hozir sinxronlash", kind: "Amal", run: async () => {
    say("Sinxronlanmoqda…", true, true);
    const res = await act(() => api("POST", "/api/oxu/sync", {}));
    if (res) { say(res.warnings.length ? "Qisman yangilandi. " + res.warnings.join("; ") : "Ma'lumotlar yangilandi", !res.warnings.length); route(); refreshBadge(); }
  } }];
  const [{ sessions }, { data }, { items }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled"), loadPlans()]);
  const t = today(), ctx = lessonContext(sessions, data, new Set(items.map((c) => cancelKey(c.date, c.para, c.subject))));
  const next = nextEntry(ctx, t, nowTime());
  if (next && next.kind === "course" && next.date === t) {
    const label = next.para + "-para";
    out.unshift(next.session
      ? { text: "Davomatni davom ettirish · " + label, kind: "Amal", run: () => { location.hash = "#/dars/" + next.session.id; } }
      : { text: "Davomatni boshlash · " + label, kind: "Amal", run: () => startCourse(next) });
  }
  return out;
}
paletteInput.addEventListener("input", () => { paletteAt = 0; renderPalette(); });
paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = renderPalette().length; if (n) { paletteAt = (paletteAt + (e.key === "ArrowDown" ? 1 : n - 1)) % n; renderPalette(); } }
  if (e.key === "Enter") { e.preventDefault(); const x = renderPalette()[paletteAt]; if (x) { palette.close(); if (x.run) x.run(); else location.hash = x.href; } }
});
document.getElementById("open-palette").addEventListener("click", openPalette);
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (e.target.closest?.("input, textarea, select") || document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); openPalette(); return; }
  // on the roster, typing a name goes straight to the find box
  if (/^\p{L}$/u.test(e.key)) document.getElementById("roster-find")?.focus();
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && location.hash === "#/jadval") {
    e.preventDefault(); document.querySelector(e.key === "ArrowLeft" ? '[aria-label="Oldingi hafta"]' : '[aria-label="Keyingi hafta"]').click(); return;
  }
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.matches?.(".state")) {
    e.preventDefault();
    const all = [...document.querySelectorAll(".state")], i = all.indexOf(e.target);
    const next = all[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus();
  }
});

// every view starts at the top and moves focus to the content
window.addEventListener("hashchange", () => { if (sheetBox.open) sheetBox.close(); route(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
route();
