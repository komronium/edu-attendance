"use strict";

const TZ = "Asia/Tashkent";
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const view = document.getElementById("view");
const msgBox = document.getElementById("msg");
const confirmBox = document.getElementById("confirm");
const sheetBox = document.getElementById("sheet");

// official lesson times of the university
const PARA_TIMES = { 1: ["08:30", "09:50"], 2: ["10:00", "11:20"], 3: ["11:30", "12:50"], 4: ["13:20", "14:40"], 5: ["14:50", "16:10"], 6: ["16:20", "17:40"], 7: ["17:50", "19:10"], 8: ["19:20", "20:40"], 9: ["20:50", "22:10"] };
// the course group's fixed classes: Monday-Thursday, timetable paras 3 and 4.
// The lessons table stores them as para 1 and 2 of the day, so slotOf maps stored para -> timetable para.
const COURSE = { subject: "Algoritmlash", type: "Amaliy", group: "2-ATT-25", planHours: 200 /* estimate: the group is not in the site's load */, days: [1, 2, 3, 4], slotOf: { 1: 3, 2: 4 }, room: "K4 / 309" };
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
function shiftDay(iso, days) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); }
// one way to write a day everywhere it is read: "8-noyabr", with the year only when it is not this year
function dayText(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return d + "-" + MONTHS[m - 1] + (String(y) === today().slice(0, 4) ? "" : " " + y);
}
// what a date box holds while it is typed in: "08.11.2026"
function inputDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return String(d).padStart(2, "0") + "." + String(m).padStart(2, "0") + "." + y;
}
function weekday(iso) { const [y, m, d] = iso.split("-").map(Number); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; }
function longDay(iso) { const [, m, d] = iso.split("-").map(Number); return d + "-" + MONTHS[m - 1] + ", " + weekday(iso); }
function monthTitle(key) { const [y, m] = key.split("-").map(Number); const t = MONTHS[m - 1]; return t[0].toUpperCase() + t.slice(1) + " " + y; }
function relDay(iso) { const t = today(); return iso === t ? "bugun" : iso === shiftDay(t, -1) ? "kecha" : null; }
function timeText(ts) { return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts * 1000)); }
function nowTime() { return timeText(Date.now() / 1000); }
function fmtNum(v) { return String(Math.round(v * 100) / 100); }
function paraText(p) { return p ? (COURSE.slotOf[p] || p) + "-para" : ""; }
function pct(v) { return v === null || v === undefined ? "–" : (v === 100 ? "100" : v.toFixed(0)) + "%"; }
// a course lesson's attendance: taken, still being taken, or left unfinished after the para ended
const sessionEntry = (s) => ({ kind: "course", date: s.date, para: COURSE.slotOf[s.para] || s.para, appPara: s.para, session: s });
function sessionChip(s) {
  return s.finished_at ? chip("Olingan", "ok", "check") : paraOver(sessionEntry(s), today(), nowTime()) ? chip("Tugatilmagan", "warn") : chip("Olinmoqda", "live");
}
function span(s) { return s.finished_at ? timeText(s.started_at) + "–" + timeText(s.finished_at) : timeText(s.started_at); }
function retakeText(x) { return dayText(x.retake_at) + (x.retake_time ? " " + x.retake_time : "") + (x.retake_room ? ", " + x.retake_room : ""); }

/* ------------------------------------------------------------ small components */
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
// "5.11.2026", "05/11/2026" or "5.11" -> "2026-11-05"; anything that is not a real date -> ""
function parseDay(text) {
  const m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?$/.exec(text.trim());
  if (!m) return "";
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3] || today().slice(0, 4)), real = new Date(Date.UTC(y, mo - 1, d));
  if (real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d) return "";
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
// the browser draws type=date in its own locale, so people type dd.mm.yyyy and the calendar stays one click away
function dateField(name, value) {
  const native = h("input", { type: "date", name, value, class: "date-native", tabindex: "-1", "aria-hidden": "true" });
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
async function api(method, url, body) {
  const opts = { method, headers: { Accept: "application/json" }, cache: "no-store" };
  if (method !== "GET") { opts.headers["X-Requested-With"] = "attendance"; opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body || {}); }
  let r;
  try { r = await fetch(url, opts); } catch (err) { throw new Error("Server bilan aloqa yo'q, internetni tekshiring"); }
  if (r.status === 401) { location.href = "/login"; throw new Error("Kirish kerak"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Xato: " + r.status);
  return data;
}
let toastTimer;
function say(text, ok, hold) {   // hold: a progress note that stays until the next message
  clearTimeout(toastTimer);
  msgBox.textContent = text; msgBox.className = "toast" + (ok ? " ok" : ""); msgBox.hidden = !text;
  if (ok && !hold) toastTimer = setTimeout(() => { msgBox.hidden = true; }, 2500);
}
msgBox.addEventListener("click", () => say(""));
async function act(fn) {
  try { if (!msgBox.classList.contains("ok")) say(""); return await fn(); } catch (err) { say(err.message); return null; }   // a success toast outlives the next navigation
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
  sheetBox.querySelector("#sheet-title").textContent = title;
  sheetBox.querySelector("#sheet-body").replaceChildren(body);
  sheetBox.showModal();
}
async function refreshBadge() {
  const badge = document.getElementById("owed-badge");
  const groupBadge = document.getElementById("owed-badge-group");
  try { const { owed } = await api("GET", "/api/retakes"); badge.textContent = groupBadge.textContent = String(owed); badge.hidden = groupBadge.hidden = !owed; } catch (err) { badge.hidden = groupBadge.hidden = true; }
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
const COURSE_PAGES = ["lessons", "students", "retakes"];
const PAGE_TITLES = { home: "Bosh sahifa", schedule: "Dars jadvali", plans: "Dars rejasi", load: "Yuklama", kpi: "Ilmiy KPI", months: "Ustama", lessons: "Darslar", students: "Talabalar", retakes: "Qarzlar", notes: "Bildirishnomalar", cabinet: "Kabinet" };
function setCourseOpen(open, remember) {
  document.getElementById("course-group").classList.toggle("open", open);
  document.getElementById("course-items").hidden = !open;
  const toggle = document.getElementById("course-toggle");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Kurs bo'limlarini yopish" : "Kurs bo'limlarini ochish");
  if (remember) try { localStorage.setItem("courseOpen", open ? "1" : ""); } catch (err) { /* only a convenience */ }
}
document.getElementById("course-toggle").addEventListener("click", () => setCourseOpen(document.getElementById("course-items").hidden, true));
try { if (localStorage.getItem("courseOpen")) setCourseOpen(true); } catch (err) { /* starts closed */ }

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
    const inCourse = COURSE_PAGES.includes(nav);
    document.getElementById("course-group").classList.toggle("active", inCourse);
    if (inCourse) setCourseOpen(true);
    refreshBadge();
    const loading = setTimeout(() => show(skeleton()), 120);
    if (!subjectStyles.loaded) await loadStyles();
    const res = await act(() => fn(m[1] ? Number(m[1]) : null));
    clearTimeout(loading);
    if (res === null) show(h("div", { class: "card empty" }, h("p", { text: "Ma'lumotni yuklab bo'lmadi." }), h("button", { type: "button", text: "Qayta urinish", onclick: route })));
    return;
  }
  location.hash = "#/";
}
function skeleton() {
  return h("div", { class: "skeleton", role: "status", "aria-label": "Yuklanmoqda" }, h("i", { class: "s-title" }), h("i", { class: "s-sub" }), h("div", { class: "s-row" }, h("i"), h("i"), h("i")), h("i", { class: "s-block" }));
}
function show(...nodes) { view.replaceChildren(...nodes.flat(Infinity).filter(Boolean)); }

/* ------------------------------------------------------------ lessons (home) */
async function lessonsView() {
  const t = today();
  const [{ sessions }, { para: freePara }, debts] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/free-para?date=" + t), api("GET", "/api/retakes"), loadPlans()]);
  planCache.sessions = sessions;
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
    if (s.topic) return h("td", { class: "clip", text: s.topic });
    const planned = (planOf(sessionEntry(s)) || {}).topic;
    return planned ? h("td", { class: "clip muted", title: "Rejadagi mavzu, davomatda hali yozilmagan" }, planned, " ", chip("reja"))
      : h("td", { class: "clip" + (s.finished_at ? " warn-text" : " muted"), text: "Mavzu yozilmagan" });
  };
  const groups = [];
  for (const s of sessions) {
    const key = s.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push(g = { key, items: [] });
    g.items.push(s);
  }
  const table = sessions.length ? h("div", { class: "card flush" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Sana" }), h("th", { scope: "col", text: "Para" }), h("th", { scope: "col", text: "Mavzu" }), h("th", { scope: "col", text: "Vaqt" }), h("th", { scope: "col", class: "w-rate", text: "Davomat" }))),
    groups.map((g) => h("tbody", {},
      h("tr", { class: "group" }, h("th", { colspan: "5", scope: "colgroup", text: monthTitle(g.key) })),
      g.items.map((s) => linkRow("#/dars/" + s.id, [
        h("td", { class: "nowrap" }, h("a", { class: "strong", href: "#/dars/" + s.id, text: dayText(s.date) }), h("span", { class: "muted", text: "  " + (relDay(s.date) || weekday(s.date).slice(0, 3)) })),
        h("td", { class: "nowrap muted", text: paraText(s.para) }),
        topicCell(s),
        h("td", { class: "nowrap muted", text: span(s) }),
        h("td", { class: "w-rate" }, s.finished_at ? h("span", { class: "rate" }, meter(s.total ? 100 * s.came / s.total : 0), h("b", { text: s.came + "/" + s.total })) : sessionChip(s))]))))))
    : h("p", { class: "card empty", text: "Hali davomat olinmagan. O'ngdagi tugma bilan birinchisini boshlang." });

  show(pageHead("Darslar", COURSE.subject + " · " + COURSE.group),
    h("div", { class: "tiles" },
      tile("Darslar", sessions.length, sessions.length > finished.length ? sessions.length - finished.length + " tasi tugatilmagan" : "Hammasi tugatilgan"), tile("O'rtacha davomat", seats ? pct(100 * came / seats) : "–"),
      tile("Qolgan qarzlar", debts.owed), tile("Topshirilgan", debts.retaken)),
    h("div", { class: "split" }, h("div", {}, table), rail));
}

/* ------------------------------------------------------------ one lesson */
// names compared the way they are typed: no case, no apostrophe variants
const plainName = (x) => x.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").trim();

async function lessonView(id) {
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
    const toggle = async () => {
      const next = !st.present;
      if (next && st.retake_at && !(await ask(st.name + " qarzni topshirgan. «Keldi» qilinsa, topshirish yozuvi o'chadi.", "Keldi qilish", true))) return;
      st.present = next ? 1 : 0; if (next) st.retake_at = null; paint(); updateCount();
      const ok = await act(() => api("PUT", "/api/sessions/" + id + "/students/" + st.id, { present: next }));
      if (!ok) { st.present = next ? 0 : 1; paint(); updateCount(); } else refreshBadge();
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
      h("button", { type: "button", class: "wide", text: !plan ? "Reja tuzish" : paraOver(entry, today(), nowTime()) && !plan.outcome ? "Natijani belgilash" : "Rejani ochish", onclick: () => openPlan(entry, () => lessonView(id)) })),
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
        if (!(await ask(dayText(s.date) + " davomati o'chirilsinmi? Buni qaytarib bo'lmaydi.", "O'chirish", true))) return;
        if (await act(() => api("DELETE", "/api/sessions/" + id))) location.hash = "#/darslar";
      } })));

  show(back("#/darslar", "Darslar"),
    pageHead(longDay(s.date), [paraText(s.para), " · ", span(s), s.room ? " · " + s.room : ""], sessionChip(s)),
    h("div", { class: "split" },
      h("div", {}, s.students.length ? h("div", { class: "roster-find" }, field("Talabani topish", find), found) : null,
        s.students.length ? h("div", { class: "card flush" }, h("table", { class: "roster" },
        h("caption", { class: "sr-only", text: "Talabalar: qatorni bosib keldi yoki kelmadi qiling" }),
        h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "n", text: "#" }), h("th", { scope: "col", text: "Talaba" }), h("th", { scope: "col", class: "w-state", text: "Holat" }), h("th", { scope: "col", class: "w-grade", text: "Baho" }))),
        h("tbody", {}, rows, noMatch)))
        : h("p", { class: "card empty" }, "Ro'yxatda talaba yo'q. ", h("a", { href: "#/talabalar", text: "Talabalarni qo'shing" }))),
      rail));
}

/* ------------------------------------------------------------ students */
const sf = { key: "owed", dir: -1, q: "" };
const STUDENT_COLS = [["name", "Ism"], ["lessons", "Darslar"], ["came", "Keldi"], ["missed", "Qoldirdi"], ["retaken", "Topshirdi"], ["owed", "Qarz"], ["rate", "Davomat"], ["points", "Ball"], ["average", "O'rtacha"]];

async function studentsView() {
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
const rf = { status: "owed", day: "", student: "" };
async function retakesView() {
  const [r, { rooms }] = await Promise.all([api("GET", "/api/retakes"), api("GET", "/api/rooms")]);
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

  show(pageHead("Qarzlar", COURSE.group + " · qoldirilgan darslar va ularni qayta topshirish"),
    h("div", { class: "tiles" }, tile("Jami qoldirilgan", r.missed), tile("Topshirilgan", r.retaken), tile("Qolgan", r.owed)),
    h("div", { class: "split left" }, master,
      h("div", { class: "stack" },
        h("div", { class: "toolbar" }, h("div", { class: "seg-row", role: "group", "aria-label": "Holat" }, seg("owed", "Qolgan"), seg("done", "Topshirilgan"), seg("all", "Hammasi")), daySel),
        rows.length ? h("div", { class: "card flush" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Talaba" }), h("th", { scope: "col", text: "Dars" }), h("th", { scope: "col", text: "Mavzu" }), h("th", { scope: "col", class: "right", text: "Qayta topshirish" }))),
          h("tbody", {}, rows)))
          : h("p", { class: "card empty", text: rf.status === "owed" ? "Bu tanlovda qarz yo'q." : "Bu tanlovda hech narsa yo'q." }))));
}

/* ------------------------------------------------------------ timetable */
const jw = { offset: 0 };    // weeks from the current one
function dowOf(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function shortDate(iso) { const [, m, d] = iso.split("-").map(Number); return d + "-" + MONTHS[m - 1]; }
function capital(t) { return t[0].toUpperCase() + t.slice(1); }

// "4-o'quv bino, 306-informatika xonasi" -> "K4 / 306"
function fmtRoom(r) { const m = /^(\d+)-o.quv bino,\s*([\d/]+)/.exec(r || ""); return m ? "K" + m[1] + " / " + m[2] : r || ""; }
function fmtType(t) { return /amaliy/i.test(t) ? "Amaliy" : /ma.ruza/i.test(t) ? "Ma'ruza" : t || ""; }
function state(text, iconName, cls) { return h("span", { class: "state-line" + (cls ? " " + cls : "") }, iconName ? icon(iconName) : null, text); }

// a card has the subject's colour: full when attendance is taken, a lighter shade otherwise
function cardLines(subject, type, group, room, status) {   // room and status share the last line: a week should fit one screen
  const meta = [type, group].filter(Boolean).join(" · ");
  // the timetable shows the short name on one line; the home page has the room for the whole name
  return [h("b", { title: subject }, h("span", { class: "name-full", text: subject }), h("span", { class: "name-short", text: shortSubject(subject) })), h("small", { text: meta, title: meta }),
    room || status ? h("span", { class: "slot-foot" }, room ? h("small", { text: room, title: room }) : null, status) : null];
}
const cancelKey = (date, para, subject) => date + "|" + Number(para) + "|" + canonSubject(subject);
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
    lines(s.finished_at ? state(s.came + "/" + s.total, "check") : over ? state("Tugatilmagan", null, "warn") : state("Olinmoqda", null, "active")));
  const label = shortDate(e.date) + ", " + e.para + "-para";
  if (e.date > t) return h("button", { type: "button", class: "slot " + color, "aria-label": COURSE.subject + ", " + label + ": dars rejasi", onclick: () => openPlan(e, route) }, lines(planState(planOf(e))));
  return h("button", { type: "button", class: "slot " + color, "aria-label": COURSE.subject + ", " + label + ": davomatni boshlash", onclick: () => startCourse(e) },
    lines(over ? state("Olinmagan", null, "warn") : state("Davomatni boshlash", null, "active")));
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
function siteCard(l, unsaved, color, e) {
  const t = today(), past = l.date < t;
  const taken = unsaved && past && !unsaved.has(l.date + "|" + Number(l.para));
  const coming = e && !paraOver(e, t, nowTime());
  // without status data a past lesson simply shows no status line
  const status = coming ? planState(planOf(e)) : taken ? state("Olingan", "check") : unsaved && past ? state("Olinmagan", null, "warn") : null;
  const lines = cardLines(l.subject, fmtType(l.type), l.group, fmtRoom(l.room), status);
  const cls = "slot " + color + (taken ? " taken" : "");
  if (coming) return h("button", { type: "button", class: cls, "aria-label": l.subject + ", " + shortDate(l.date) + ", " + l.para + "-para: dars rejasi", onclick: () => openPlan(e, route) }, lines);
  return l.url ? h("a", { class: cls, href: SITE + l.url, target: "_blank", rel: "noopener", title: "digital.oxu.uz da ochish" }, lines) : h("div", { class: cls }, lines);
}

// the load spells some subjects "Name(Other name)" while the schedule uses the name in brackets
function canonSubject(name) { const m = /\(([^()]+)\)\s*$/.exec(name || ""); return (m ? m[1] : name || "").trim(); }

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

function lessonContext(sessions, data, cancelled) {
  const unsavedList = (data && data.unsaved) || null;
  const known = new Set(((data && data.lessons) || []).map((l) => l.date + "|" + Number(l.para)));
  return {
    sessions, cancelled, unsavedList,
    firstDay: sessions.map((s) => s.date).sort()[0],
    unsaved: unsavedList && new Map(unsavedList.map((l) => [l.date + "|" + Number(l.para), l])),
    siteLessons: [...((data && data.lessons) || []), ...(unsavedList || []).filter((l) => !known.has(l.date + "|" + Number(l.para)))],
  };
}
// everything on the given days, as date+para entries; a lesson held on another day still shows up
function entriesFor(dates, ctx) {
  const out = [];
  const keep = (e) => { if (!ctx.cancelled.has(cancelKey(e.date, e.para, e.kind === "site" ? e.lesson.subject : COURSE.subject))) out.push(e); };
  for (const date of dates) {
    for (const [appPara, para] of Object.entries(COURSE.slotOf).map(([a, p]) => [Number(a), p])) {
      const session = ctx.sessions.find((s) => s.date === date && s.para === appPara);
      if (session || (COURSE.days.includes(dowOf(date)) && (!ctx.firstDay || date >= ctx.firstDay))) keep({ kind: "course", date, para, appPara, session });
    }
    for (const l of ctx.siteLessons) if (l.date === date) keep({ kind: "site", date, para: Number(l.para), lesson: l });
  }
  return out;
}

const paraOver = (e, t, now) => e.date < t || (e.date === t && !!PARA_TIMES[e.para] && PARA_TIMES[e.para][1] <= now);
// this app is the only record for the group, so every lesson that ended without finished attendance counts
function courseGaps(ctx, t, now) {
  if (!ctx.firstDay) return [];
  const dates = [];
  for (let d = ctx.firstDay; d <= t; d = shiftDay(d, 1)) dates.push(d);
  return entriesFor(dates, ctx).filter((e) => e.kind === "course" && paraOver(e, t, now) && !(e.session && e.session.finished_at))
    .sort((a, b) => b.date.localeCompare(a.date) || b.para - a.para);
}
// the lesson happening now, or the next one that has not been taken yet
function nextEntry(ctx, t, now) {
  return entriesFor([...Array(14).keys()].map((i) => shiftDay(t, i)), ctx)
    .filter((e) => (e.date > t || (PARA_TIMES[e.para] && PARA_TIMES[e.para][1] >= now)) && !(e.session && e.session.finished_at))
    .sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para)[0];
}
// the home page's lead: the next lesson at a size that reads from across the room, with its action
// note: replaces the countdown, for a lesson that is over but still needs its attendance finished
function nextHero(e, t, now, action, note) {
  const times = PARA_TIMES[e.para], onDay = e.date === t, isNow = onDay && times && times[0] <= now && now <= times[1];
  const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const span = (n) => (n >= 60 ? Math.floor(n / 60) + " soat " : "") + (n % 60 ? (n % 60) + " daqiqa" : "");
  const days = Math.round((Date.parse(e.date) - Date.parse(t)) / 864e5);
  const when = note ? note : isNow ? "Hozirgi dars, tugashiga " + span(mins(times[1]) - mins(now))
    : onDay && times ? "Keyingi dars, " + span(mins(times[0]) - mins(now)) + "dan keyin"
    : "Keyingi dars, " + (days === 1 ? "ertaga" : days + " kundan keyin");
  const [date, weekday] = longDay(e.date).split(", ");   // on another day the date leads, not the hour
  const site = e.kind === "site", plan = planOf(e);
  return h("section", { class: "hero-next" + (isNow || note ? " live" : "") + (onDay ? "" : " later"), "aria-label": note ? "Tugatilmagan dars" : isNow ? "Hozirgi dars" : "Keyingi dars" },
    h("div", { class: "hero-time" }, h("b", { text: onDay ? (times ? times[0] : e.para + "-para") : date }),
      h("span", { text: onDay ? e.para + "-para" : [capital(weekday), times && times[0], e.para + "-para"].filter(Boolean).join(" · ") })),
    h("div", { class: "hero-body" },
      h("h2", { text: site ? e.lesson.subject : COURSE.subject }),
      h("p", { class: "muted", text: (site ? [e.lesson.type, e.lesson.group, fmtRoom(e.lesson.room)] : [COURSE.type, COURSE.group, COURSE.room]).filter(Boolean).join(" · ") }),
      h("p", { class: "hero-when", text: when }),
      note ? null : h("p", { class: "hero-plan" }, planState(plan), plan && plan.topic ? h("span", { text: plan.topic }) : null,
        plan && plan.items.length ? h("span", { class: "muted", text: "· " + plan.items.length + " ta band" }) : null)),
    h("div", { class: "hero-act" }, action,
      note ? null : h("button", { type: "button", text: plan ? "Rejani ochish" : "Reja tuzish", onclick: () => openPlan(e, homeView) })));
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
// subject, group and the rest of a timetable entry, the same shape for site and course lessons
function entryInfo(e) {
  return e.kind === "site"
    ? { subject: canonSubject(e.lesson.subject), name: e.lesson.subject, group: e.lesson.group || "", type: fmtType(e.lesson.type), room: fmtRoom(e.lesson.room), url: e.lesson.url }
    : { subject: COURSE.subject, name: COURSE.subject, group: COURSE.group, type: COURSE.type, room: COURSE.room };
}
const sameClass = (a, b) => a.subject === b.subject && a.group === b.group;
function planStage(p) { return !p ? "none" : p.ready ? "ready" : p.topic || p.items.length ? "planned" : "none"; }
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

// topics of a class marked as taught: plans that ended "o'tildi", and the course group's finished lessons
function coveredTopics(info, sessions) {
  const out = new Set();
  for (const p of planCache.plans.values()) if (p.outcome === "done" && p.topic && sameClass(p, info)) out.add(normTitle(p.topic));
  if (info.subject === COURSE.subject && info.group === COURSE.group) for (const s of sessions || []) if (s.finished_at && s.topic) out.add(normTitle(s.topic));
  return out;
}
// the first topic of the semester list that is neither taught nor already planned for this class
function suggestTopic(info, sessions) {
  const done = coveredTopics(info, sessions || planCache.sessions);
  const planned = new Set([...planCache.plans.values()].filter((p) => sameClass(p, info) && p.topic && !p.outcome).map((p) => normTitle(p.topic)));
  return (planCache.topics[info.subject] || []).find((t) => !done.has(normTitle(t)) && !planned.has(normTitle(t))) || "";
}

async function classContext() {   // the timetable as the other pages see it, for finding the next lesson of a class
  const [{ sessions }, { data }, { items }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled")]);
  return lessonContext(sessions, data, new Set(items.map((c) => cancelKey(c.date, c.para, c.subject))));
}
function nextOfClass(e, ctx) {
  const info = entryInfo(e);
  return entriesFor([...Array(60).keys()].map((i) => shiftDay(e.date, i)), ctx)
    .filter((x) => (x.date > e.date || x.para > e.para) && sameClass(entryInfo(x), info))
    .sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para)[0] || null;
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

// the plans page: the coming week, what still needs an outcome, and each class against its topic list
const PLAN_DAYS = 7;
async function plansView() {
  const [{ sessions }, { data }, { items: cancelledList }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled"), loadPlans()]);
  const t = today(), now = nowTime();
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const ctx = lessonContext(sessions, data, cancelled);
  planCache.sessions = sessions;
  const redraw = () => plansView();
  const byTime = (a, b) => a.date.localeCompare(b.date) || a.para - b.para;
  const coming = entriesFor([...Array(PLAN_DAYS).keys()].map((i) => shiftDay(t, i)), ctx).filter((e) => !paraOver(e, t, now)).sort(byTime);
  const recent = entriesFor([...Array(14).keys()].map((i) => shiftDay(t, i - 13)), ctx)
    .filter((e) => paraOver(e, t, now) && planStage(planOf(e)) !== "none" && !planOf(e).outcome).sort((a, b) => byTime(b, a));
  const ready = coming.filter((e) => planStage(planOf(e)) === "ready").length;

  const when = (e) => capital(relDay(e.date) || (e.date === shiftDay(t, 1) ? "ertaga" : shortDate(e.date) + ", " + weekday(e.date).slice(0, 3)));
  const row = (e, action) => {
    const p = planOf(e), info = entryInfo(e), n = p ? p.items.length : 0;
    const open = () => openPlan(e, redraw, sessions);
    return h("tr", { class: "tap", onclick: (ev) => { if (!ev.target.closest("button")) open(); } },
      h("td", { class: "nowrap strong", text: when(e) }),
      h("td", { class: "nowrap muted", text: e.para + "-para" }),
      h("td", { class: "nowrap" }, h("span", { class: "key " + subjectColors(data)(info.name) }, h("i")), info.name, h("span", { class: "muted", text: info.group ? " · " + info.group : "" })),
      h("td", { class: "clip" + (p && p.topic ? "" : " muted"), text: p && p.topic ? p.topic : "–" }),
      h("td", { class: "nowrap muted num", text: n ? n + " ta band" : "" }),
      h("td", { class: "right nowrap" }, action || h("button", { type: "button", class: "quiet", onclick: open }, planChip(p))));
  };
  const table = (rows) => h("div", { class: "card flush" }, h("table", { class: "plans" }, h("tbody", {}, rows)));
  const outcomeBtn = (e) => h("button", { type: "button", class: "quiet", text: "Natijani belgilash", onclick: () => openPlan(e, redraw, sessions) });

  // every class taught this semester, with how far its topic list has got
  const start = (data && data.load && data.load.start) || ctx.firstDay || t;
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
  const courseRows = [...classes.values()].sort((a, b) => a.info.subject.localeCompare(b.info.subject) || a.info.group.localeCompare(b.info.group)).map(({ info, days: taughtDays }) => {
    const held = taughtDays.size;
    const list = planCache.topics[info.subject] || [];
    const done = coveredTopics(info, sessions);
    const taught = list.filter((x) => done.has(normTitle(x))).length;
    const behind = held - taught;
    return h("tr", {},
      h("td", { class: "nowrap" }, h("b", { text: info.name }), h("span", { class: "muted", text: info.group ? " · " + info.group : "" })),
      list.length ? [h("td", { class: "w-rate" }, h("span", { class: "rate" }, meter(100 * taught / list.length), h("b", { text: taught + " / " + list.length }))),
        h("td", { class: "muted" + (behind > 0 ? " warn-text" : ""), text: behind > 0 ? "~" + behind + " dars orqada" : held ? "Reja bo'yicha" : "Hali dars bo'lmagan" })]
        : [h("td", { class: "muted", colspan: "2", text: "Mavzular ro'yxati kiritilmagan" })],
      h("td", { class: "right" }, h("button", { type: "button", class: "quiet", text: list.length ? "Mavzular" : "Kiritish", onclick: () => editTopics(info) })));
  });

  show(pageHead("Dars rejasi", "Keyingi " + PLAN_DAYS + " kun · " + coming.length + " ta dars" + (!coming.length ? "" : ready ? ", " + ready + " tasiga tayyor" : ", hali birortasiga tayyor emas")),
    recent.length ? h("section", { "aria-labelledby": "res-h", class: "stack" }, h("h2", { id: "res-h", class: "section-title", text: "Natijasi belgilanmagan" }), table(recent.map((e) => row(e, outcomeBtn(e))))) : null,
    h("section", { "aria-labelledby": "next-h", class: "stack" }, h("h2", { id: "next-h", class: "section-title", text: "Kelgusi darslar" }),
      coming.length ? table(coming.map((e) => row(e))) : h("p", { class: "card empty", text: "Keyingi " + PLAN_DAYS + " kunda dars yo'q." })),
    h("section", { "aria-labelledby": "course-h", class: "stack" }, h("h2", { id: "course-h", class: "section-title", text: "Kurs rejasi" }),
      h("p", { class: "sub", text: "O'tilgan mavzular semestr ro'yxatiga qarab. «Orqada» taxminiy: bir dars kuni bir mavzu deb hisoblanadi." }),
      courseRows.length ? h("div", { class: "card flush" }, h("table", {}, h("tbody", {}, courseRows))) : h("p", { class: "card empty", text: "Bu semestrda dars topilmadi." })));
}

async function scheduleView() {
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
  const table = h("div", { class: "card flush" }, h("table", { class: "timetable" },
    h("caption", { class: "sr-only", text: "Haftalik dars jadvali" }),
    h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "para-col", text: "Para" }),
      shownDays.map((d) => h("th", { scope: "col", class: d === t ? "today" : d < t ? "past" : null }, h("span", { text: capital(weekday(d)) }), h("small", { text: d === t ? "Bugun, " + shortDate(d) : shortDate(d) }))))),
    h("tbody", {}, rows.map((p) => h("tr", { class: entries.some((e) => e.para === p) ? null : "quiet" },
      h("th", { scope: "row", class: "para-col" }, h("span", { text: p + "-para" }), PARA_TIMES[p] ? h("small", { text: PARA_TIMES[p].join("–") }) : null),
      shownDays.map((d) => h("td", { class: (d === t ? "today" : "") + (d === t && nowPara(p) ? " now" : "") },
        d === t && nowPara(p) ? nowLine(p, now) : null,
        entries.filter((e) => e.date === d && e.para === p).map((e) => mark(e.kind === "site" ? withCancel(siteCard(e.lesson, unsaved, colorOf(e.lesson.subject), e), e) : e.session ? courseCard(e, colorOf(COURSE.subject)) : withCancel(courseCard(e, colorOf(COURSE.subject)), e), e)))))))));

  const noSite = !entries.some((e) => e.kind === "site");
  const inWeek = [...new Set(entries.map((e) => e.kind === "site" ? e.lesson.subject : COURSE.subject))].sort((a, b) => colorOf(a).localeCompare(colorOf(b)));   // the same order every week
  const legend = h("div", { class: "legend" }, inWeek.map((n) => h("button", { type: "button", class: "key " + colorOf(n), title: "Rang va qisqa nomni o'zgartirish", onclick: () => editSubject(n, scheduleView) }, h("i"), n)),
    h("span", { class: "muted hint", text: "To'liq rang: davomat olingan. Kelgusi darsni bosing: reja va tayyorlik." }));
  // this semester's gaps are what needs attention; older ones stay available below them
  const start = (data && data.load && data.load.start) || "";
  const live = (unsavedList || []).filter((l) => !cancelled.has(cancelKey(l.date, l.para, l.subject)));
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

  show(pageHead("Dars jadvali", range + " · " + count + " ta dars",
      h("button", { type: "button", "aria-label": "Oldingi hafta", onclick: move(-1, "Oldingi hafta") }, icon("back")),
      h("button", { type: "button", text: "Bu hafta", disabled: jw.offset === 0, onclick: move(0, "Keyingi hafta") }),
      h("button", { type: "button", "aria-label": "Keyingi hafta", onclick: move(1, "Keyingi hafta") }, icon("forward"))),
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
const HOURS_PER_PARA = 2;    // checked against the site: 8 lessons = a 16-hour line
const hrs = (v) => String(Math.round(v * 10) / 10);

function computeLoad(data, sessions, coursePlan, cancelled) {
  const load = data.load;
  const t = today(), now = nowTime(), start = load.start || "";
  const key = (l) => l.date + "|" + Number(l.para);
  const unsaved = new Set(((data.unsaved) || []).filter((l) => l.date >= start).map(key));
  const seen = new Set((data.lessons || []).map(key));
  const lessons = [...(data.lessons || []), ...((data.unsaved) || []).filter((l) => l.date >= start && !seen.has(key(l)))].filter((l) => !cancelled.has(cancelKey(l.date, l.para, l.subject)));
  const ended = (l) => { const p = PARA_TIMES[Number(l.para)]; return l.date < t || (l.date === t && p && p[1] <= now); };

  const lines = [], independent = {};
  for (const item of load.items) {
    const subject = canonSubject(item.subject);
    if (/mustaqil/i.test(item.type)) { independent[subject] = (independent[subject] || 0) + Number(item.hours); continue; }
    const mine = lessons.filter((l) => canonSubject(l.subject) === subject && l.group === item.group && l.type === item.type);
    const held = mine.filter(ended);
    const noAtt = held.filter((l) => unsaved.has(key(l))).length * HOURS_PER_PARA;
    const done = held.length * HOURS_PER_PARA - noAtt;
    // a closed group will not be taught any more, so what it got is its plan; the site's figure stays for the tooltip
    const sitePlan = Number(item.hours), closed = /yopildi/i.test(item.group), plan = closed ? done + noAtt : sitePlan;
    lines.push({ subject, type: fmtType(item.type), group: item.group.replace(/_yopildi.*/i, ""), plan, sitePlan, done, noAtt, closed, left: Math.max(0, plan - done - noAtt) });
  }
  // the group taught in this app is not in the site's load: finished lessons here, planned hours entered by hand
  const courseDone = sessions.filter((s) => s.finished_at && s.date >= start).length * HOURS_PER_PARA;
  const coursePlanHours = coursePlan ?? COURSE.planHours;
  const course = { subject: COURSE.subject, type: COURSE.type, group: COURSE.group, plan: coursePlanHours, done: courseDone, noAtt: 0, course: true, left: Math.max(0, coursePlanHours - courseDone) };
  lines.unshift(course);

  return { lines, independent, course, coursePlanHours };
}
const total = (list) => ({
  plan: list.reduce((n, l) => n + (l.plan || 0), 0), done: list.reduce((n, l) => n + l.done, 0),
  noAtt: list.reduce((n, l) => n + l.noAtt, 0), left: list.reduce((n, l) => n + (l.left || 0), 0),
});

async function loadView() {
  const [{ data }, { sessions }, { hours: coursePlan }, { items: cancelledList }] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/sessions"), api("GET", "/api/course-plan"), api("GET", "/api/cancelled")]);
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const load = data && data.load;
  if (!load) return show(pageHead("Yuklama"), h("div", { class: "card empty" },
    h("p", { class: "strong", text: "Yuklama hali sinxronlanmagan" }),
    h("p", { text: "Semestr rejasi, o'tilgan va qolgan soatlar har fan bo'yicha shu yerda ko'rinadi. " + COURSE.group + " kursi soatlari sinxronlashsiz ham hisoblanadi." }),
    h("a", { class: "button primary", href: "#/kabinet", text: "Kabinetda sinxronlash" })));

  const { lines, independent, course, coursePlanHours } = computeLoad(data, sessions, coursePlan, cancelled);
  const site = total(lines.filter((l) => !l.course));
  const colorOf = subjectColors(data);
  const share = (v, plan) => (plan ? Math.min(100, 100 * v / plan) : 0);

  // taught, then held without attendance, on one track; the numbers are always printed next to it
  const stack = (l, cls) => {
    const a = h("i"), b = h("i", { class: "soft" });
    a.style.setProperty("--v", share(l.done, l.plan));
    b.style.setProperty("--v", share(l.noAtt, l.plan));
    return h("span", { class: "bars" + (cls ? " " + cls : ""), "aria-hidden": "true" }, a, b);
  };
  const progress = (l) => h("span", { class: "rate" }, stack(l), h("b", { text: l.plan ? pct(100 * (l.done + l.noAtt) / l.plan) : "–" }));
  const quiet = (v) => (v ? "" : " muted");
  const numbers = (l, planNode) => [
    h("td", { class: "num" }, planNode ?? hrs(l.plan)),
    h("td", { class: "num" + quiet(l.done), text: hrs(l.done) }),
    h("td", { class: "num" + quiet(l.noAtt), text: hrs(l.noAtt) }),
    h("td", { class: "num" + quiet(l.left), text: hrs(l.left) }),
    h("td", { class: "w-rate" }, progress(l))];

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
      !l.closed && !l.course && l.left === 0 ? [" ", chip("Tugagan", null, "check")] : null),
    h("td", { class: "nowrap muted", text: l.type }),
    numbers(l, l.course ? planCell() : l.closed && l.sitePlan !== l.plan ? h("span", { title: "Saytda " + hrs(l.sitePlan) + " soat", text: hrs(l.plan) }) : null));
  const groups = [...new Set(lines.map((l) => l.subject))].map((name) => {
    const mine = lines.filter((l) => l.subject === name), t = total(mine);
    return h("tbody", { class: colorOf(name) },
      h("tr", { class: "subject-row" }, h("th", { scope: "rowgroup", colspan: "2" }, h("span", { class: "dot" }), name), numbers(t)),
      mine.map(line));
  });

  const all = total(lines), est = course.plan ? "~" : "";   // the course plan is an estimate, and so is any sum with it
  const held = (l) => l.done + l.noAtt;
  const sum = (label, value, note) => h("div", { class: "load-sum" }, h("span", { class: "label", text: label }), h("b", {}, value, h("small", { text: " soat" })), note ? h("span", { class: "note", text: note }) : null);
  const part = (label, l, mark, chipNode) => h("tr", {},
    h("th", { scope: "row" }, label, chipNode ? [" ", chipNode] : null),
    h("td", { class: "num" }, h("b", { text: hrs(held(l)) })), h("td", { class: "num" }, h("b", { text: mark + hrs(l.left) })), h("td", { class: "num muted", text: mark + hrs(l.plan) }),
    h("td", { class: "w-rate" }, progress(l)));
  const hero = h("section", { class: "card hero-load", "aria-label": "Umumiy yuklama" },
    h("div", { class: "load-sums" },
      sum("O'tilgan", hrs(held(all)), all.noAtt ? "shundan " + hrs(all.noAtt) + " soat davomatsiz" : "kurs va tizim birga"),
      sum("Qolgan", est + hrs(all.left), est ? "kurs rejasi taxminiy" : "kurs va tizim birga"),
      sum("Jami reja", est + hrs(all.plan), all.plan ? pct(100 * held(all) / all.plan) + " bajarildi" : null)),
    stack(all, "tall"),
    h("table", { class: "load-parts" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "sr-only", text: "Bo'lim" }), ["O'tilgan", "Qolgan", "Reja"].map((x) => h("th", { scope: "col", class: "num", text: x })), h("th", { scope: "col", class: "w-rate", text: "Bajarilishi" }))),
      h("tbody", {}, part("Tizim", site, ""), part("Kurs, " + COURSE.group, course, est, chip("Taxminiy")))));

  const extra = Object.entries(independent);
  show(pageHead("Yuklama", [load.semester, load.position].filter(Boolean).join(" · ")),
    !load.start ? h("p", { class: "sub" }, "To'liq hisob uchun ", h("a", { href: "#/kabinet", text: "Kabinetda qayta sinxronlang" }), ": o'tilgan soatlar butun semestr jadvalidan olinadi.") : null,
    hero,
    h("div", { class: "card flush" }, h("table", { class: "load" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Fan va guruh" }), h("th", { scope: "col", text: "Turi" }),
        ["Reja", "O'tilgan", "Davomatsiz", "Qolgan"].map((x) => h("th", { scope: "col", class: "num", text: x })), h("th", { scope: "col", class: "w-rate", text: "Bajarilishi" }))),
      groups)),
    h("div", { class: "notes" },
      extra.length ? h("p", {}, h("b", { text: "Mustaqil ta'lim: " + hrs(extra.reduce((n, [, v]) => n + v, 0)) + " soat" }), " (" + extra.map(([n, v]) => n + " " + hrs(v)).join(", ") + "). Jadvalga kirmaydi va hisobga qo'shilmagan.") : null,
      h("p", { text: "1 para = 2 soat. O'tilgan soatlar dars jadvalidan hisoblanadi, sayt bu raqamni bermaydi. Davomatsiz: dars vaqti o'tgan, lekin saytda davomat saqlanmagan. Yopilgan guruhlarda reja o'tilgan soatga teng olingan. " + COURSE.group + " saytdagi yuklamada yo'q: rejasi taxminiy, o'tilgani shu ilovadagi tugatilgan darslardan." })));
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
    const early = err.message.startsWith("Sessiya tugagan");   // the server's text for a cookie the site does not accept
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
  const [{ data, synced_at }, st] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/oxu/status")]);
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
  if (!data) return show(head, form, h("p", { class: "card empty", text: "Jadval, yuklama va KPI o'z bo'limlarida ko'rinadi. Yuqorida birinchi sinxronlashni bajaring." }));

  // an overview: every synced section, one click away
  const t = today(), monday = shiftDay(t, -((dowOf(t) + 6) % 7)), sunday = shiftDay(monday, 6);
  const weekLessons = (data.lessons || []).filter((l) => l.date >= monday && l.date <= sunday).length;
  const bands = (data.kpi && data.kpi.bands) || [];
  const score = bands.reduce((n, b) => n + (Number(b.score) || 0), 0);
  const current = (data.months || [])[0];
  const card = (href, label, value, note) => h("a", { class: "tile link", href }, h("span", { class: "label", text: label }), h("b", { text: String(value) }), h("span", { class: "note", text: note }));
  show(head, form,
    h("div", { class: "overview" },
      card("#/jadval", "Dars jadvali", weekLessons + " ta dars", "Saytdan, shu hafta"),
      card("#/yuklama", "Yuklama", (data.load ? data.load.total : "–") + " soat", data.load ? data.load.semester : "Yo'q"),
      card("#/ilmiy-kpi", "Ilmiy KPI", score.toFixed(2) + " ball", ((data.kpi && data.kpi.papers.length) || 0) + " ta ish"),
      card("#/ustama", "Ustama", current ? current.percent : "–", current ? current.month + ", " + monthState(current).label.toLowerCase() : "Yo'q")));
}

/* ------------------------------------------------------------ scientific KPI */
function needSync(title) { return show(pageHead(title), h("p", { class: "card empty" }, "Ma'lumot hali yo'q. ", h("a", { href: "#/kabinet", text: "Kabinetda sinxronlang" }))); }

// stages a work goes through before it can be uploaded; editable per item
function workSteps(band) {
  if (/patent|dgu/i.test(band)) return ["Hujjatlar tayyorlandi", "Topshirildi", "Guvohnoma olindi"];
  if (/monografiya|darslik|qo.llanma/i.test(band)) return ["Yozildi", "Taqrizdan o'tdi", "Chop etildi"];
  if (/maqola|tezis|anjuman/i.test(band)) return ["Yozildi", "Topshirildi", "Qabul qilindi", "Chop etildi"];
  return ["Boshlandi", "Tayyor"];
}
const normTitle = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function sameWork(a, b) {
  const x = normTitle(a), y = normTitle(b);
  return x === y || (Math.min(x.length, y.length) >= 15 && (x.includes(y) || y.includes(x)));
}

async function kpiView() {
  const [{ data }, { works }, { steps: customSteps }] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/kpi-works"), api("GET", "/api/kpi-marks")]);
  const kpi = data && data.kpi;
  if (!kpi) return needSync("Ilmiy KPI");
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

  show(pageHead("Ilmiy KPI", "Ishlaringiz jarayoni va to'plangan ball", h("button", { type: "button", class: "primary", onclick: addWork }, icon("plus"), "Yangi ish")),
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

// "2026 — Oktabr" -> "2026-10"
function periodKey(label) {
  const m = /(\d{4})[^\p{L}]+(\p{L}+)/u.exec(label || "");
  const i = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return i < 0 ? "" : m[1] + "-" + String(i + 1).padStart(2, "0");
}
function periodTitle(key) { const [y, m] = key.split("-").map(Number); return capital(MONTHS[m - 1]) + " " + y; }
const kf = { month: "" };

// starting stages; each item's list can be edited on the page
function defaultSteps(title) {
  if (/maqola/i.test(title)) return ["Yozildi", "Topshirildi", "Tizimga yuklandi"];
  if (/ochiq dars/i.test(title)) return ["Rejalashtirildi", "O'tildi", "Tizimga yuklandi"];
  if (/kontent/i.test(title)) return ["Tayyorlandi", "Tizimga yuklandi"];
  if (/metod/i.test(title)) return ["Tayyorlandi", "Joriy etildi", "Joylashtirildi"];
  if (/shogird|shogirt/i.test(title)) return ["Rejalashtirildi", "Bajarildi", "Tizimga yuklandi"];
  return [];
}

// graded by others at the end of the month: nothing the teacher can tick
const GRADED_BY_OTHERS = /ma.suliyati|moddiy texnik|rektor ustamasi/i;
// the month's own items that are neither ticked nor graded yet, and the days left to finish them
const SKIPPED = -1;   // a progress value: the item cannot be done this month
function ustamaOpen(data, marks, month, progress) {
  const periods = (data && data.periods) || [];
  const sitePeriod = periods.find((p) => periodKey(p.label) === month), template = sitePeriod || periods[periods.length - 1];
  const ticked = new Set(marks.filter((m) => m.period === month).map((m) => m.item));
  const skipped = new Set((progress || []).filter((p) => p.period === month && p.step === SKIPPED).map((p) => p.item));
  const open = ((template && template.items) || []).filter((i) => Number(i.max) > 0 && !GRADED_BY_OTHERS.test(i.title) && !ticked.has(i.title) && !skipped.has(i.title) && !(sitePeriod && i.graded > 0));
  const [y, m, d] = today().split("-").map(Number);
  return { count: open.length, points: open.reduce((n, i) => n + Number(i.max), 0), days: new Date(y, m, 0).getDate() - d };
}

async function monthsView() {
  const [{ data }, { marks, progress, steps: customSteps }] = await Promise.all([api("GET", "/api/oxu"), api("GET", "/api/kpi-marks")]);
  const periods = (data && data.periods) || [], months = (data && data.months) || [];
  if (!periods.length && !months.length) return needSync("Ustama");

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
      await api("PUT", "/api/kpi-progress", { period: month, item: i.title, step });
      if ((step === last) !== ticked.has(i.title)) await api("PUT", "/api/kpi-marks", { period: month, item: i.title, done: step === last });
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
      await api("PUT", "/api/kpi-progress", { period: month, item: i.title, step: on ? SKIPPED : 0 });
      if (on && ticked.has(i.title)) await api("PUT", "/api/kpi-marks", { period: month, item: i.title, done: false });
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
  const history = months.length ? h("section", { class: "card", "aria-labelledby": "hist-h" }, h("h2", { id: "hist-h", text: "Oylar tarixi" }),
    h("ul", { class: "plain history" }, months.map((m) => h("li", {},
      h("span", { class: "strong", text: m.month }), meter(Math.min(100, parseFloat(m.percent) || 0)), h("b", { text: m.percent }),
      h("small", { class: "muted", text: monthState(m).label }))))) : null;

  const fill = h("i"), soft = h("i", { class: "soft" });
  fill.style.setProperty("--v", Math.max(0, Math.min(100, approved)));
  soft.style.setProperty("--v", Math.max(0, Math.min(100 - Math.max(0, approved), pending)));
  const sel = h("select", { "aria-label": "Oy", onchange: (e) => { kf.month = e.target.value; monthsView(); } },
    keys.map((k) => h("option", { value: k, selected: k === month, text: periodTitle(k) })));
  const head = pageHead("Ustama", "Oylik ustama foizi va uning bandlari", sel);
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
setInterval(refreshNotes, 60000);

async function notesView() {
  const { items, unread } = await api("GET", "/api/notifications");
  const permission = canNotify ? Notification.permission : "unsupported";
  const enable = h("button", { type: "button", class: "primary", text: "Chrome bildirishnomalarini yoqish", onclick: async () => {
      const r = await Notification.requestPermission();
      if (r === "granted") { lastShown(items.length ? items[0].id : 0); new Notification("Bildirishnomalar yoqildi", { body: "Yangi xabarlar shu yerda ham chiqadi." }); say("Yoqildi", true); } else say("Chrome ruxsat bermadi. Sayt sozlamalaridan yoqing.");
      notesView();
    } });
  const notice = permission === "granted" ? h("p", { class: "sub", text: "Chrome bildirishnomalari yoqilgan. Ular sahifa ochiq turganda keladi." })
    : permission === "denied" ? h("p", { class: "sub", text: "Chrome bildirishnomalari bloklangan. Manzil satridagi belgi orqali ruxsat bering." })
    : permission === "default" ? h("section", { class: "card note-cta" }, h("div", {}, h("h2", { text: "Chrome orqali ham olish" }), h("p", { class: "sub", text: "Yangi yoki olib tashlangan darslar va olinmagan davomatlar haqida xabar keladi, sahifa ochiq turganda." })), enable) : null;
  const when = (ts) => { const iso = new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: TZ }); return capital(relDay(iso) || dayText(iso)) + ", " + timeText(ts); };
  show(pageHead("Bildirishnomalar", unread ? unread + " ta yangi" : "Hammasi o'qilgan"), notice,
    items.length ? h("ul", { class: "card flush plain notes" }, items.map((n) => h("li", { class: n.read_at ? null : "unread" },
      h("a", { href: n.link || "#/" }, h("span", { class: "note-icon " + n.kind }, icon(NOTE_ICONS[n.kind] || "alert")),
        h("span", { class: "note-text" }, h("b", { text: n.title }), n.body ? h("span", { class: "muted", text: n.body }) : null),
        h("small", { class: "muted nowrap", text: when(n.created_at) })))))
      : h("p", { class: "card empty", text: "Hozircha xabar yo'q. Keyingi sinxronlashda o'zgarish bo'lsa, shu yerda chiqadi." }));
  if (unread) { await act(() => api("POST", "/api/notifications/read")); document.getElementById("note-badge").hidden = true; }
}

/* ------------------------------------------------------------ home */
async function homeView() {
  const [{ data }, { sessions }, { hours: coursePlan }, { items: cancelledList }, status, notes, debts, { works }, { steps: customSteps, marks, progress }] = await Promise.all([
    api("GET", "/api/oxu"), api("GET", "/api/sessions"), api("GET", "/api/course-plan"), api("GET", "/api/cancelled"), api("GET", "/api/oxu/status"),
    api("GET", "/api/notifications"), api("GET", "/api/retakes"), api("GET", "/api/kpi-works"), api("GET", "/api/kpi-marks"), loadPlans()]);
  const t = today(), now = nowTime();
  planCache.sessions = sessions;
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const ctx = lessonContext(sessions, data, cancelled);
  const colorOf = subjectColors(data);
  const entries = entriesFor([t], ctx).sort((a, b) => a.para - b.para);

  const lessonRow = (e) => {
    const times = PARA_TIMES[e.para], isNow = times && times[0] <= now && now <= times[1];
    return h("li", { class: "day-row" + (isNow ? " now" : "") },
      h("div", { class: "day-time" }, h("b", { text: e.para + "-para" }), times ? h("small", { text: times.join("–") }) : null, isNow ? chip("Hozir", "live") : null),
      e.kind === "site" ? siteCard(e.lesson, ctx.unsaved, colorOf(e.lesson.subject), e) : courseCard(e, colorOf(COURSE.subject)));
  };
  const upcoming = nextEntry(ctx, t, now);
  const load = data && data.load ? computeLoad(data, sessions, coursePlan, cancelled) : null;
  const siteSum = load ? total(load.lines.filter((l) => !l.course)) : null, courseSum = load ? total(load.lines.filter((l) => l.course)) : null;
  const score = ((data && data.kpi && data.kpi.bands) || []).reduce((n, b) => n + (Number(b.score) || 0), 0);
  const period = ((data && data.periods) || []).slice(-1)[0];
  const stat = (href, label, value, note) => h("a", { class: "tile link", href }, h("span", { class: "label", text: label }), h("b", { text: String(value) }), note ? h("span", { class: "note", text: note }) : null);

  const start = (data && data.load && data.load.start) || "";
  const gaps = (ctx.unsavedList || []).filter((l) => l.date >= start && !cancelled.has(cancelKey(l.date, l.para, l.subject))).length;
  const gapList = courseGaps(ctx, t, now), todo = gapList.length;
  // preparation: today's lessons still to come and tomorrow's, and lessons over whose outcome is not marked
  const tomorrow = shiftDay(t, 1);
  const unplanned = entriesFor([t, tomorrow], ctx).filter((e) => !paraOver(e, t, now) && planStage(planOf(e)) === "none").sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para);
  const todayUnplanned = unplanned.filter((e) => e.date === t), tomorrowUnplanned = unplanned.filter((e) => e.date === tomorrow);
  const notReady = entriesFor([t], ctx).filter((e) => !paraOver(e, t, now) && planStage(planOf(e)) === "planned").length;
  const noOutcome = entriesFor([...Array(14).keys()].map((i) => shiftDay(t, i - 13)), ctx).filter((e) => paraOver(e, t, now) && planStage(planOf(e)) !== "none" && !planOf(e).outcome).length;
  const paras = (list) => list.map((e) => e.para).join(", ") + "-para";
  const ready = works.filter((w) => { const n = (customSteps[w.band] ?? workSteps(w.band)).length; return n && w.step >= n; }).length;
  const syncText = { expired: "Sessiya tugadi, yangi cookie kerak", wrong_account: "Saytda boshqa hisob ochiq", none: "Avtomatik sinxronlash o'chiq", error: "Sinxronlash xato berdi, Kabinetni tekshiring" }[status.state];
  const bonus = ustamaOpen(data, marks, t.slice(0, 7), progress);
  const tasks = [   // [link, icon, text]; the alert ones lead
    syncText ? ["#/kabinet", "alert", syncText] : null,
    todo ? ["#/jadval", "alert", COURSE.group + ": " + todo + " ta darsda davomat olinmagan"] : null,
    gaps ? ["#/jadval", "alert", "Saytda " + gaps + " ta darsda davomat olinmagan"] : null,
    todayUnplanned.length ? ["#/reja", "alert", "Bugun " + paras(todayUnplanned) + ": reja yo'q"] : null,
    notReady ? ["#/reja", "clock", "Bugun " + notReady + " ta darsga hali tayyor emassiz"] : null,
    tomorrowUnplanned.length ? ["#/reja", "clock", "Ertangi " + paras(tomorrowUnplanned) + ": reja yo'q"] : null,
    noOutcome ? ["#/reja", "clock", noOutcome + " ta darsning natijasi belgilanmagan"] : null,
    debts.owed ? ["#/qarzlar", "clock", debts.owed + " ta qarz topshirilmagan"] : null,
    ready ? ["#/ilmiy-kpi", "check", ready + " ta ish saytga yuklashga tayyor"] : null,
    bonus.count ? ["#/ustama", bonus.days <= 7 ? "alert" : "clock", "Ustama: " + bonus.count + " ta band ochiq, oy tugashiga " + bonus.days + " kun"] : null,
    notes.unread ? ["#/bildirishnomalar", "alert", notes.unread + " ta yangi bildirishnoma"] : null,
  ].filter(Boolean).sort((a, b) => (b[1] === "alert") - (a[1] === "alert"));

  const running = upcoming && upcoming.kind === "course" && upcoming.date === t && now >= PARA_TIMES[upcoming.para][0];
  const nextAction = !running ? null : upcoming.session ? h("button", { type: "button", class: "primary", text: "Davomatni davom ettirish", onclick: () => { location.hash = "#/dars/" + upcoming.session.id; } })
    : h("button", { type: "button", class: "primary", text: "Davomatni boshlash", onclick: () => startCourse(upcoming) });
  const periodMonth = period ? period.label.replace(/^\d+[^\p{L}]+/u, "") : "";
  const periodRow = ((data && data.months) || []).find((m) => m.month.toLowerCase() === periodMonth.toLowerCase());
  const periodNote = period ? periodMonth + (periodRow && /^taxminiy/i.test(periodRow.status) ? ", taxminiy" : "") : "Sinxronlanmagan";

  // today's lesson whose para ended with its attendance unfinished leads, unless the next one is about to start
  const mins = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const startsIn = upcoming && upcoming.date === t && PARA_TIMES[upcoming.para] ? mins(PARA_TIMES[upcoming.para][0]) - mins(now) : Infinity;
  const gap = !running && startsIn > 30 ? gapList.find((e) => e.date === t) : null;
  const gapAction = !gap ? null : gap.session ? h("button", { type: "button", class: "primary", text: "Davomatni tugatish", onclick: () => { location.hash = "#/dars/" + gap.session.id; } })
    : h("button", { type: "button", class: "primary", text: "Davomatni boshlash", onclick: () => startCourse(gap) });
  const siteLink = upcoming && upcoming.kind === "site" && upcoming.date === t && upcoming.lesson.url
    ? h("a", { class: "button", href: SITE + upcoming.lesson.url, target: "_blank", rel: "noopener", text: "Saytda ochish" }) : null;
  show(pageHead("Bugun", capital(longDay(t))),
    h("div", { class: "lead" },
      gap ? nextHero(gap, t, now, gapAction, gap.session ? "Dars tugadi, davomat tugatilmagan" : "Dars tugadi, davomat olinmagan")
        : upcoming ? nextHero(upcoming, t, now, nextAction || siteLink)
        : h("section", { class: "hero-next empty" }, h("div", { class: "hero-body" }, h("h2", { text: "Yaqin kunlarda dars yo'q" }), h("p", { class: "muted", text: "Jadval yangilansa, keyingi dars shu yerda chiqadi." }))),
      h("section", { class: "card attention", "aria-labelledby": "todo-h" }, h("h2", { id: "todo-h" }, "E'tibor talab qiladi", tasks.length ? h("span", { class: "badge" + (tasks[0][1] === "alert" ? "" : " calm"), text: String(tasks.length) }) : null),
        tasks.length ? h("ul", { class: "plain tasks" }, tasks.map(([href, ic, text]) => h("li", { class: ic === "alert" ? "urgent" : null }, h("a", { href }, icon(ic), h("span", { text })))))
          : h("p", { class: "all-clear" }, icon("check"), "Hammasi joyida"))),
    entries.length ? h("section", { class: "card", "aria-labelledby": "day-h" }, h("h2", { id: "day-h", text: "Bugungi jadval" }), h("ul", { class: "plain day-list" }, entries.map(lessonRow))) : null,
    h("div", { class: "tiles" },
      stat("#/jadval", "Bugungi darslar", entries.length),
      stat("#/yuklama", "Qolgan yuklama", siteSum ? (courseSum.plan ? "~" : "") + hrs(siteSum.left + courseSum.left) + " soat" : "–", siteSum ? (courseSum.plan ? "Tizim " + hrs(siteSum.left) + " · kurs ~" + hrs(courseSum.left) : "") : "Sinxronlanmagan"),
      stat("#/ustama", "Ustama", period ? period.bonus || period.score + "%" : "–", periodNote),
      stat("#/ilmiy-kpi", "Ilmiy ball", score.toFixed(2), works.length ? works.length + " ta ish kuzatuvda" : null)));
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
  paletteList.replaceChildren(...(shown.length ? shown.map((x, i) => h("li", {}, h("a", { href: x.href, class: i === paletteAt ? "on" : null, onclick: () => palette.close() }, h("span", { text: x.text }), h("small", { class: "muted", text: x.kind }))))
    : [h("li", { class: "palette-none", text: "Hech narsa topilmadi" })]));
  return shown;
}
async function openPalette() {
  if (palette.open) return;
  paletteItems = PALETTE_PAGES.map(([href, text]) => ({ href, text, kind: "Sahifa" }));
  paletteInput.value = ""; paletteAt = 0; renderPalette(); palette.showModal();
  try { const { students } = await api("GET", "/api/students"); paletteItems.push(...students.map((s) => ({ href: "#/talaba/" + s.id, text: s.name, kind: "Talaba" }))); renderPalette(); } catch (err) { /* pages still work */ }
}
paletteInput.addEventListener("input", () => { paletteAt = 0; renderPalette(); });
paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = renderPalette().length; if (n) { paletteAt = (paletteAt + (e.key === "ArrowDown" ? 1 : n - 1)) % n; renderPalette(); } }
  if (e.key === "Enter") { e.preventDefault(); const x = renderPalette()[paletteAt]; if (x) { palette.close(); location.hash = x.href; } }
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
