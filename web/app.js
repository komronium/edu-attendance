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
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"],
  alert: ["M12 9v4", "M12 17h.01", "M10.300 3.900 2.400 18a2 2 0 0 0 1.700 3h15.800a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  up: ["m18 15-6-6-6 6"],
  down: ["m6 9 6 6 6-6"],
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
function dayText(iso) {
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
function say(text, ok) {
  clearTimeout(toastTimer);
  msgBox.textContent = text; msgBox.className = "toast" + (ok ? " ok" : ""); msgBox.hidden = !text;
  if (ok) toastTimer = setTimeout(() => { msgBox.hidden = true; }, 2500);
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
    const text = { expired: "Sinxronlash to'xtadi. Yangi cookie kiriting.", wrong_account: "Saytda boshqa hisob ochiq. Sinxronlash to'xtatildi.", none: "Avtomatik sinxronlash o'chiq." }[state];
    alertBox.textContent = text || ""; alertBox.hidden = !text; alertBox.classList.toggle("calm", state === "none");
    time.textContent = last ? "Sinxronlangan: " + stamp(last) : ""; time.hidden = !last;
  } catch (err) { /* keep the last state */ }
}

/* ------------------------------------------------------------ sidebar */
const COURSE_PAGES = ["lessons", "students", "retakes"];
const PAGE_TITLES = { home: "Bosh sahifa", schedule: "Dars jadvali", load: "Yuklama", kpi: "Ilmiy KPI", months: "Ustama", lessons: "Darslar", students: "Talabalar", retakes: "Qarzlar", notes: "Bildirishnomalar", cabinet: "Kabinet" };
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
  const [{ sessions }, { para: freePara }, debts] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/free-para?date=" + t), api("GET", "/api/retakes")]);
  const start = async (date, para) => {
    const res = await act(() => api("POST", "/api/sessions", { date, para }));
    if (res) location.hash = "#/dars/" + res.id;
  };
  const finished = sessions.filter((s) => s.finished_at);
  const seats = finished.reduce((n, s) => n + s.total, 0);
  const came = finished.reduce((n, s) => n + s.came, 0);
  const todays = sessions.filter((s) => s.date === t).sort((a, b) => a.para - b.para);
  const stale = sessions.filter((s) => !s.finished_at && s.date !== t);

  const paraSel = h("select", { name: "para" }, [1, 2].map((p) => h("option", { value: String(p), text: paraText(p) })));
  const dateIn = h("input", { name: "date", type: "date", value: t, required: true });
  const suggest = async () => {     // offer the para of that day that is still free
    try { const { para } = await api("GET", "/api/free-para?date=" + encodeURIComponent(dateIn.value)); if (para) paraSel.value = String(para); } catch (err) { /* keep the choice */ }
  };
  dateIn.addEventListener("change", suggest);
  suggest();

  const rail = h("aside", { class: "rail" },
    h("section", { class: "card today", "aria-labelledby": "today-h" },
      h("h2", { id: "today-h", text: "Bugun" }), h("p", { class: "sub", text: longDay(t) }),
      todays.length ? h("ul", { class: "plain" }, todays.map((s) => h("li", {}, h("a", { class: "today-item", href: "#/dars/" + s.id },
        h("span", { text: paraText(s.para) }), s.finished_at ? h("span", { class: "muted", text: s.came + " / " + s.total }) : chip("Olinmoqda", "live"))))) : null,
      freePara
        ? h("button", { type: "button", class: "primary wide", text: paraText(freePara) + " davomatini boshlash", onclick: () => start(t, freePara) })
        : h("p", { class: "muted", text: "Bugun ikkala para ham olingan." })),
    stale.length ? h("section", { class: "card notice", "aria-labelledby": "stale-h" },
      h("h2", { id: "stale-h", text: "Tugatilmagan davomat" }),
      h("ul", { class: "plain" }, stale.map((s) => h("li", {}, h("a", { class: "today-item", href: "#/dars/" + s.id }, h("span", { text: dayText(s.date) + ", " + paraText(s.para) }), h("span", { text: "Davom ettirish" })))))) : null,
    h("section", { class: "card", "aria-labelledby": "other-h" },
      h("h2", { id: "other-h", text: "Boshqa sana" }),
      h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); start(dateIn.value, Number(paraSel.value)); } },
        h("div", { class: "pair" }, field("Sana", dateIn), field("Para", paraSel)),
        h("button", { type: "submit", class: "wide", text: "Davomatni boshlash" }))));

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
        h("td", { class: "clip" + (s.topic ? "" : " muted"), text: s.topic || "Mavzu yozilmagan" }),
        h("td", { class: "nowrap muted", text: span(s) }),
        h("td", { class: "w-rate" }, s.finished_at ? h("span", { class: "rate" }, meter(s.total ? 100 * s.came / s.total : 0), h("b", { text: s.came + "/" + s.total })) : chip("Olinmoqda", "live"))]))))))
    : h("p", { class: "card empty", text: "Hali davomat olinmagan. O'ngdagi tugma bilan birinchisini boshlang." });

  show(pageHead("Darslar", COURSE.subject + " · " + COURSE.group),
    h("div", { class: "tiles" },
      tile("Olingan darslar", finished.length), tile("O'rtacha davomat", seats ? pct(100 * came / seats) : "–"),
      tile("Qolgan qarzlar", debts.owed), tile("Topshirilgan", debts.retaken)),
    h("div", { class: "split" }, h("div", {}, table), rail));
}

/* ------------------------------------------------------------ one lesson */
async function lessonView(id) {
  const s = await api("GET", "/api/sessions/" + id);
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
    return tr;
  });
  updateCount();

  const topic = h("input", { name: "topic", value: s.topic, maxlength: "200", autocomplete: "off", placeholder: "Masalan: Sikllar" });
  const finishBtn = h("button", { type: "button", class: "primary wide", text: s.finished_at ? "Saqlash" : "Davomatni tugatish", onclick: async () => {
      finishBtn.disabled = true;
      const ok = await act(() => api("POST", "/api/sessions/" + id + "/finish", { topic: topic.value }));
      finishBtn.disabled = false;
      if (ok) { location.hash = "#/darslar"; say(s.finished_at ? "Saqlandi" : "Davomat olindi", true); }
    } });
  topic.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finishBtn.click(); } });
  const allPresent = async () => {
    if (!(await act(() => api("POST", "/api/sessions/" + id + "/all-present")))) return;
    s.students.forEach((st) => { st.present = 1; st.retake_at = null; });
    paints.forEach((p) => p()); updateCount(); refreshBadge();
  };

  const rail = h("aside", { class: "rail sticky" },
    h("section", { class: "card stack", "aria-label": "Davomat holati" }, status, field("Mavzu", topic), finishBtn,
      s.students.length ? h("button", { type: "button", class: "wide", text: "Hammasi keldi", onclick: allPresent }) : null),
    h("details", { class: "card fold" }, h("summary", { text: "Dars sozlamalari" }),
      h("form", { class: "stack", onsubmit: async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          if (await act(() => api("PATCH", "/api/sessions/" + id, { date: fd.get("date"), para: Number(fd.get("para")) }))) lessonView(id);
        } },
        h("div", { class: "pair" }, field("Sana", h("input", { name: "date", type: "date", value: s.date, required: true })),
          field("Para", h("select", { name: "para" }, [1, 2].map((p) => h("option", { value: String(p), selected: s.para === p, text: paraText(p) }))))),
        h("button", { type: "submit", class: "wide", text: "Sanani saqlash" })),
      h("button", { type: "button", class: "danger wide", text: "Davomatni o'chirish", onclick: async () => {
        if (!(await ask(dayText(s.date) + " davomati o'chirilsinmi? Buni qaytarib bo'lmaydi.", "O'chirish", true))) return;
        if (await act(() => api("DELETE", "/api/sessions/" + id))) location.hash = "#/darslar";
      } })));

  show(back("#/darslar", "Darslar"),
    pageHead(longDay(s.date), [paraText(s.para), " · ", span(s), s.room ? " · " + s.room : ""], s.finished_at ? chip("Olingan", "ok", "check") : chip("Olinmoqda", "live")),
    h("div", { class: "split" },
      h("div", {}, s.students.length ? h("div", { class: "card flush" }, h("table", { class: "roster" },
        h("caption", { class: "sr-only", text: "Talabalar: qatorni bosib keldi yoki kelmadi qiling" }),
        h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "n", text: "#" }), h("th", { scope: "col", text: "Talaba" }), h("th", { scope: "col", class: "w-state", text: "Holat" }), h("th", { scope: "col", class: "w-grade", text: "Baho" }))),
        h("tbody", {}, rows)))
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
      h("div", { class: "pair" }, field("Topshirgan kuni", h("input", { name: "date", type: "date", value: today(), required: true })),
        field("Vaqti", h("input", { name: "time", type: "time", value: nowTime(), required: true }))),
      field("Joyi", h("input", { name: "room", list: "rooms", value: rooms[0] || "", maxlength: "60", required: true, autocomplete: "off" })),
      h("datalist", { id: "rooms" }, rooms.map((v) => h("option", { value: v }))),
      h("div", { class: "dialog-actions" }, h("button", { type: "button", text: "Yopish", onclick: () => sheetBox.close() }), h("button", { type: "submit", class: "primary", text: "Qabul qilish" })));
    openSheet(x.name, f);
  };

  const seg = (key, text) => h("button", { type: "button", class: "seg", "aria-pressed": String(rf.status === key), text, onclick: () => { rf.status = key; retakesView(); } });
  const daySel = h("select", { "aria-label": "Qoldirilgan sana", onchange: (e) => { rf.day = e.target.value; retakesView(); } },
    h("option", { value: "", text: "Hamma sanalar" }), days.map((d) => h("option", { value: d, selected: d === rf.day, text: dayText(d) + " " + weekday(d).slice(0, 3) })));

  const rows = items.map((x) => h("tr", { class: x.active ? null : "off" },
    h("td", {}, h("a", { class: "strong", href: "#/talaba/" + x.student_id, text: x.name })),
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
function cardLines(subject, type, group, room) {
  return [h("b", { text: subject }), h("small", { text: [type, group].filter(Boolean).join(" · ") }), room ? h("small", { text: room }) : null];
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

function courseCard(e, color) {
  const t = today(), s = e.session;
  const lines = cardLines(COURSE.subject, COURSE.type, COURSE.group, COURSE.room);
  if (s) return h("a", { class: "slot " + color + (s.finished_at ? " taken" : ""), href: "#/dars/" + s.id }, lines,
    s.finished_at ? state("Olingan · " + s.came + "/" + s.total, "check") : state("Olinmoqda", null, "active"));
  if (e.date > t) return h("div", { class: "slot " + color }, lines, state("Rejada"));
  const label = shortDate(e.date) + ", " + e.para + "-para";
  return h("button", { type: "button", class: "slot " + color, "aria-label": COURSE.subject + ", " + label + ": davomatni boshlash", onclick: async () => {
      if (e.date !== t && !(await ask(label + " uchun davomat boshlansinmi? Hamma «keldi» bo'lib turadi.", "Boshlash"))) return;
      const res = await act(() => api("POST", "/api/sessions", { date: e.date, para: e.appPara, room: COURSE.room }));
      if (res) location.hash = "#/dars/" + res.id;
    } }, lines, e.date === t ? state("Davomatni boshlash", null, "active") : state("Olinmagan"));
}
// how far through the para the clock is, drawn across today's cell
function nowLine(p, now) {
  const mins = (x) => { const [a, b] = x.split(":").map(Number); return a * 60 + b; };
  const [from, to] = PARA_TIMES[p].map(mins);
  const line = h("i", { class: "now-line", title: "Hozir " + now });
  line.style.setProperty("--p", Math.round(100 * (mins(now) - from) / (to - from)));
  return line;
}
function siteCard(l, unsaved, color) {
  const t = today(), past = l.date < t;
  const taken = unsaved && past && !unsaved.has(l.date + "|" + Number(l.para));
  // without status data a past lesson simply shows no status line
  const status = l.date > t ? state("Rejada") : taken ? state("Olingan", "check") : unsaved && past ? state("Olinmagan") : null;
  const lines = [cardLines(l.subject, fmtType(l.type), l.group, fmtRoom(l.room)), status];
  const cls = "slot " + color + (taken ? " taken" : "");
  return l.url ? h("a", { class: cls, href: SITE + l.url, target: "_blank", rel: "noopener", title: "digital.oxu.uz da ochish" }, lines) : h("div", { class: cls }, lines);
}

// the load spells some subjects "Name(Other name)" while the schedule uses the name in brackets
function canonSubject(name) { const m = /\(([^()]+)\)\s*$/.exec(name || ""); return (m ? m[1] : name || "").trim(); }

// one fixed colour per subject, the same on every page: the group's own subject first, the rest in name order
function subjectColors(data) {
  const all = [...((data && data.lessons) || []), ...((data && data.unsaved) || []), ...((data && data.load && data.load.items) || [])];
  const subjects = [COURSE.subject, ...[...new Set(all.map((l) => canonSubject(l.subject)))].sort((a, b) => a.localeCompare(b))];
  return (name) => "c" + (subjects.indexOf(canonSubject(name)) % 8 + 1);
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

async function scheduleView() {
  const [{ sessions }, { data, synced_at }, { items: cancelledList }] = await Promise.all([api("GET", "/api/sessions"), api("GET", "/api/oxu"), api("GET", "/api/cancelled")]);
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
  const nextUp = weekEntries([...Array(14).keys()].map((i) => shiftDay(t, i)))
    .filter((e) => (e.date > t || (PARA_TIMES[e.para] && PARA_TIMES[e.para][1] >= now)) && !(e.session && e.session.finished_at))
    .sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para)[0];
  const next = nextUp ? h("section", { class: "card next", "aria-label": "Keyingi dars" },
    h("span", { class: "label", text: nextUp.date === t && nowPara(nextUp.para) ? "Hozirgi dars" : "Keyingi dars" }),
    h("b", { text: nextUp.kind === "site" ? nextUp.lesson.subject : COURSE.subject + " · " + COURSE.type + " · " + COURSE.group }),
    h("span", { class: "muted", text: [capital(relDay(nextUp.date) || longDay(nextUp.date)), nextUp.para + "-para", PARA_TIMES[nextUp.para] ? PARA_TIMES[nextUp.para].join("–") : "", nextUp.kind === "site" ? fmtRoom(nextUp.lesson.room) : COURSE.room].filter(Boolean).join(" · ") })) : null;

  const move = (n) => () => { jw.offset = n === 0 ? 0 : jw.offset + n; scheduleView(); };
  const range = shortDate(monday) + " – " + shortDate(shownDays[shownDays.length - 1]);
  const count = entries.length;
  // the week with lessons today is built around today; any other week stays an even grid
  const staged = entries.some((e) => e.date === t);
  const table = h("div", { class: "card flush" }, h("table", { class: "timetable" + (staged ? " stage" : "") },
    h("caption", { class: "sr-only", text: "Haftalik dars jadvali" }),
    h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "para-col", text: "Para" }),
      shownDays.map((d) => h("th", { scope: "col", class: d === t ? "today" : null }, h("span", { text: capital(weekday(d)) }), h("small", { text: d === t ? "Bugun" : shortDate(d) }))))),
    h("tbody", {}, rows.map((p) => h("tr", { class: entries.some((e) => e.para === p) ? null : "quiet" },
      h("th", { scope: "row", class: "para-col" }, h("span", { text: p + "-para" }), PARA_TIMES[p] ? h("small", { text: PARA_TIMES[p].join("–") }) : null),
      shownDays.map((d) => h("td", { class: (d === t ? "today" : "") + (d === t && nowPara(p) ? " now" : "") },
        d === t && nowPara(p) ? nowLine(p, now) : null,
        entries.filter((e) => e.date === d && e.para === p).map((e) => slotCard(e)))))))));

  function slotCard(e) {
    const site = e.kind === "site", name = site ? e.lesson.subject : COURSE.subject;
    const card = site ? siteCard(e.lesson, unsaved, colorOf(name)) : courseCard(e, colorOf(name));
    // compact chips keep their full description on hover
    if (!card.title) card.title = site ? [name, fmtType(e.lesson.type), e.lesson.group, fmtRoom(e.lesson.room)].filter(Boolean).join(", ") : [name, COURSE.type, COURSE.group, COURSE.room].join(", ");
    return site || !e.session ? withCancel(card, e) : card;
  }
  const noSite = !entries.some((e) => e.kind === "site");
  const inWeek = [...new Set(entries.map((e) => e.kind === "site" ? e.lesson.subject : COURSE.subject))];
  const legend = h("div", { class: "legend" }, inWeek.map((n) => h("span", { class: "key " + colorOf(n) }, h("i"), n)),
    h("span", { class: "muted hint", text: "To'liq rang: davomat olingan. Och rang: olinmagan yoki rejada." }));
  // this semester's gaps are what needs attention; older ones stay available below them
  const start = (data && data.load && data.load.start) || "";
  const live = (unsavedList || []).filter((l) => !cancelled.has(cancelKey(l.date, l.para, l.subject)));
  const current = live.filter((l) => l.date >= start), older = live.filter((l) => l.date < start);
  const missingRow = (l) => h("tr", {},
    h("td", { class: "nowrap strong", text: dayText(l.date) }), h("td", { class: "nowrap muted", text: l.para + "-para" }), h("td", { class: "clip", text: l.subject }),
    h("td", { class: "nowrap muted", text: l.group }),
    h("td", { class: "right" }, l.url ? h("a", { href: SITE + l.url, target: "_blank", rel: "noopener", text: "Saytda ochish" }) : null));
  const missing = live.length ? h("details", { class: "card flush missing" + (current.length ? "" : " calm") },
    h("summary", {}, current.length ? [icon("x"), h("b", { text: current.length + " ta darsda davomat olinmagan" }), older.length ? h("span", { class: "muted", text: "oldingi semestrlarda yana " + older.length + " ta" }) : null]
      : [icon("check"), h("b", { text: "Bu semestrda hamma davomat olingan" }), h("span", { class: "muted", text: "oldingi semestrlarda " + older.length + " ta olinmagan" })]),
    h("table", {}, h("tbody", {}, current.map(missingRow),
      older.length ? h("tr", { class: "group" }, h("th", { colspan: "5", scope: "colgroup", text: "Oldingi semestrlar" })) : null, older.map(missingRow)))) : null;
  const weekCancelled = cancelledList.filter((c) => days.includes(c.date));
  const undo = weekCancelled.length ? h("details", { class: "fold-line undo" }, h("summary", { text: weekCancelled.length + " ta dars bo'lmagan deb belgilangan" }),
    h("ul", { class: "plain" }, weekCancelled.map((c) => h("li", {}, h("span", { text: shortDate(c.date) + ", " + c.para + "-para · " + c.subject }),
      h("button", { type: "button", class: "quiet", text: "Qaytarish", onclick: async () => { if (await act(() => api("PUT", "/api/cancelled", { date: c.date, para: c.para, subject: c.subject, cancelled: false }))) scheduleView(); } }))))) : null;

  show(pageHead("Dars jadvali", range + " · " + count + " ta dars",
      h("button", { type: "button", "aria-label": "Oldingi hafta", onclick: move(-1) }, icon("back")),
      h("button", { type: "button", text: "Bu hafta", disabled: jw.offset === 0, onclick: move(0) }),
      h("button", { type: "button", "aria-label": "Keyingi hafta", onclick: move(1) }, icon("forward"))),
    jw.offset === 0 ? next : null,
    missing,
    data && !unsavedList ? h("p", { class: "sub" }, "Davomat olingan yoki olinmaganini ko'rish uchun ", h("a", { href: "#/kabinet", text: "Kabinetda qayta sinxronlang" }), ".") : null,
    table,
    legend,
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
    const plan = Number(item.hours), closed = /yopildi/i.test(item.group);
    lines.push({ subject, type: fmtType(item.type), group: item.group.replace(/_yopildi.*/i, ""), plan, done, noAtt, closed, left: closed ? 0 : Math.max(0, plan - done - noAtt) });
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
  if (!load) return show(pageHead("Yuklama"), h("p", { class: "card empty" }, "Yuklama hali yo'q. ", h("a", { href: "#/kabinet", text: "Kabinetda sinxronlang" })));

  const { lines, independent, course, coursePlanHours } = computeLoad(data, sessions, coursePlan, cancelled);
  const all = total(lines), site = total(lines.filter((l) => !l.course));
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

  const planInput = () => {
    const input = h("input", { class: "plan-input", type: "text", inputmode: "numeric", value: coursePlanHours, "aria-label": COURSE.group + " reja soati", autocomplete: "off" });
    input.addEventListener("change", async () => { if (await act(() => api("PUT", "/api/course-plan", { hours: input.value.trim() }))) { say("Saqlandi", true); loadView(); } });
    return input;
  };
  const line = (l) => h("tr", { class: "line" + (l.closed ? " off" : "") },
    h("td", { class: "who" }, l.group, l.closed ? [" ", chip("Yopilgan")] : null, l.course ? [" ", chip("Taxminiy")] : null,
      !l.closed && !l.course && l.left === 0 ? [" ", chip("Tugagan", "ok", "check")] : null),
    h("td", { class: "nowrap muted", text: l.type }), numbers(l, l.course ? planInput() : null));
  const groups = [...new Set(lines.map((l) => l.subject))].map((name) => {
    const mine = lines.filter((l) => l.subject === name), t = total(mine);
    return h("tbody", { class: colorOf(name) },
      h("tr", { class: "subject-row" }, h("th", { scope: "rowgroup", colspan: "2" }, h("span", { class: "dot" }), name), numbers(t)),
      mine.map(line));
  });

  const legendKey = (cls, label, v) => h("span", { class: "key" }, h("i", { class: cls }), label, h("b", { text: hrs(v) + " soat" }));
  const hero = h("section", { class: "card hero-load", "aria-label": "Umumiy bajarilishi" },
    h("div", { class: "hero-top" },
      h("div", {}, h("span", { class: "label", text: "Semestr bajarilishi" }), h("b", { class: "big", text: all.plan ? pct(100 * (all.done + all.noAtt) / all.plan) : "–" })),
      h("div", { class: "parts" },
        h("span", {}, h("small", { text: "Saytdagi yuklama" }), h("b", { text: hrs(site.done + site.noAtt) + " / " + hrs(site.plan) + " soat" })),
        h("span", {}, h("small", { text: COURSE.group + " (taxminiy)" }), h("b", { text: hrs(course.done) + " / ~" + hrs(course.plan) + " soat" })))),
    stack(all, "tall"),
    h("div", { class: "legend" }, legendKey("k-done", "O'tilgan", all.done), legendKey("k-soft", "Davomatsiz", all.noAtt), legendKey("k-left", "Qolgan", all.left)));

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
      h("p", { text: "1 para = 2 soat. O'tilgan soatlar dars jadvalidan hisoblanadi, sayt bu raqamni bermaydi. Davomatsiz: dars vaqti o'tgan, lekin saytda davomat saqlanmagan. " + COURSE.group + " saytdagi yuklamada yo'q: rejasi taxminiy, o'tilgani shu ilovadagi tugatilgan darslardan." })));
}

/* ------------------------------------------------------------ cabinet (digital.oxu.uz) */
function stamp(ts) { return dayText(new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: TZ })) + " " + timeText(ts); }

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
    h("p", { class: "sub", text: "Saytga o'zingiz kiring, F12 → Network → istalgan so'rov → Request Headers → Cookie qiymatini shu yerga qo'ying. Faqat ishlaydigan cookie saqlanadi." }),
    h("div", { class: "sync-row" }, cookie, save));
  const now = h("button", { type: "button", class: "primary", text: "Hozir sinxronlash", disabled: !st.owner || !st.has_cookie || st.state === "expired", onclick: async () => {
      now.disabled = true; now.textContent = "Sinxronlanmoqda…";
      finish(await act(() => api("POST", "/api/oxu/sync", {})));
    } });
  const STATES = {
    none: ["", st.owner ? "Cookie kiritilmagan" : "ID raqamingizni kiriting", st.owner ? "Avtomatik sinxronlash uchun cookie kiriting." : "Boshqa odamning ma'lumoti tushmasligi uchun avval o'z hisobingizni belgilang."],
    ok: ["ok", "Avtomatik sinxronlash ishlayapti", "Kunduzi har 30 daqiqada, 22:00–08:00 oralig'ida har 5 soatda."],
    error: ["warn", "Oxirgi urinish o'xshamadi", "Sayt bilan aloqa bo'lmadi. Keyingi vaqtda yana urinib ko'radi."],
    expired: ["bad", "Sessiya tugadi, sinxronlash to'xtadi", "digital.oxu.uz ga qayta kiring va quyida yangi cookie kiriting."],
    wrong_account: ["bad", "Boshqa hisob aniqlandi", "Sessiya ID " + st.wrong_id + " hisobiga tegishli, ma'lumot olinmadi. O'z hisobingizga qaytsangiz, sinxronlash o'zi davom etadi."],
  };
  const [kind, titleText, hint] = STATES[st.state] || STATES.none;
  const needsCookie = !st.has_cookie || st.state === "expired" || st.state === "wrong_account";
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
      now),
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
          h("button", { type: "button", class: n < now ? "done" : n === now ? "next" : null, disabled: !!paper, "aria-pressed": String(n < now),
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
  // graded by others at the end of the month: nothing the teacher can tick
  const others = earning.filter((i) => /ma.suliyati|moddiy texnik|rektor ustamasi/i.test(i.title));
  const mineItems = earning.filter((i) => !others.includes(i));
  const graded = (i) => onSite && i.graded > 0;
  const approved = onSite ? items.reduce((n, i) => n + (Number(i.value) || 0), 0) : 0;
  const waiting = mineItems.filter((i) => ticked.has(i.title) && !graded(i));
  const pending = waiting.reduce((n, i) => n + Number(i.max), 0);
  const fined = onSite ? penalties.reduce((n, i) => n + (Number(i.value) || 0), 0) : 0;

  const doneCount = mineItems.filter((i) => graded(i) || ticked.has(i.title)).length;
  const title = (i, cls) => i.criteria.length
    ? h("details", { class: "item" }, h("summary", { class: cls || null, text: i.title }), h("ul", {}, i.criteria.map((c) => h("li", { text: c }))))
    : h("span", { class: cls || null, text: i.title });

  const reached = new Map(progress.filter((p) => p.period === month).map((p) => [p.item, p.step]));
  const stepsOf = (i) => customSteps[i.title] ?? defaultSteps(i.title);
  const stepNow = (i) => { const n = stepsOf(i).length; return graded(i) ? n : Math.min(n, reached.get(i.title) ?? (ticked.has(i.title) ? n : 0)); };
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
  const stepper = (i) => {
    const list = stepsOf(i), now = stepNow(i);
    if (!list.length) return null;
    return h("div", { class: "steps" }, h("ol", {}, list.map((name, n) => h("li", {},
      h("button", { type: "button", class: n < now ? "done" : n === now ? "next" : null, disabled: graded(i), "aria-pressed": String(n < now),
        // clicking the stage you are on steps back one
        onclick: () => saveStep(i, n + 1 === now ? n : n + 1) }, n < now ? icon("check") : null, name)))));
  };
  const editLink = (i) => graded(i) ? null : h("button", { type: "button", class: "step-edit", text: stepsOf(i).length ? "bosqichlarni tahrirlash" : "+ bosqichlar", "aria-label": i.title + ": bosqichlarni tahrirlash", onclick: () => editSteps(i) });

  const earnRow = (i) => {
    const mine = ticked.has(i.title);
    const list = stepsOf(i), now = stepNow(i);
    let mark = h("span", { class: "tick-done", title: "Tasdiqlandi" }, icon("check"));
    if (!graded(i)) {
      mark = h("input", { class: "check", type: "checkbox", "aria-label": i.title + ": bajardim", checked: mine });
      mark.addEventListener("change", async () => {
        if (list.length) return saveStep(i, mark.checked ? list.length : 0);
        if (await act(() => api("PUT", "/api/kpi-marks", { period: month, item: i.title, done: mark.checked }))) monthsView(); else mark.checked = !mark.checked;
      });
    }
    return h("tr", {}, h("td", { class: "w-check" }, mark), h("td", {}, title(i, "strong"), stepper(i)),
      h("td", { class: "nowrap status-cell" }, graded(i) ? chip("Tasdiqlandi", "ok") : mine ? chip("Kutilmoqda", "live") : now > 0 ? chip(list[now - 1]) : h("span", { class: "muted", text: "Bajarilmagan" }), editLink(i)),
      h("td", { class: "num nowrap" }, graded(i) ? [h("b", { text: i.value }), h("span", { class: "muted", text: " / " + i.max })] : h("span", { class: "muted", text: i.max })));
  };

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

  const part = (cls, label, value) => h("span", {}, h("small", {}, cls ? h("i", { class: cls }) : null, label), h("b", { text: value }));
  show(head,
    h("section", { class: "card hero-load", "aria-label": "Oy natijasi" },
      h("div", { class: "hero-top" },
        h("div", {}, h("span", { class: "label", text: periodTitle(month) + (onSite ? ": tasdiqlangan ustama" : ": kutilayotgan ustama") }), h("b", { class: "big", text: hrs(onSite ? approved : pending) + "%" })),
        h("div", { class: "parts" },
          part(null, "Mening bandlarim", doneCount + " / " + mineItems.length),
          onSite ? part("k-done", "Tasdiqlangan", hrs(approved) + "%") : null,
          part("k-soft", "Kutilmoqda", "+" + hrs(pending) + "%"),
          onSite ? part(null, "Hammasi tasdiqlansa", hrs(approved + pending) + "%") : part(null, "Sayt", "Ochilmagan"))),
      h("span", { class: "bars tall", "aria-hidden": "true" }, fill, soft)),
    h("div", { class: "split" },
      h("div", { class: "card flush" }, h("table", { class: "kpi-items" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "w-check", text: "Bajardim" }), h("th", { scope: "col", text: "Ustama bandi" }), h("th", { scope: "col", text: "Holat" }), h("th", { scope: "col", class: "num", text: "Ball" }))),
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
  const [{ data }, { sessions }, { hours: coursePlan }, { items: cancelledList }, status, notes, debts, { works }, { steps: customSteps }] = await Promise.all([
    api("GET", "/api/oxu"), api("GET", "/api/sessions"), api("GET", "/api/course-plan"), api("GET", "/api/cancelled"), api("GET", "/api/oxu/status"),
    api("GET", "/api/notifications"), api("GET", "/api/retakes"), api("GET", "/api/kpi-works"), api("GET", "/api/kpi-marks")]);
  const t = today(), now = nowTime();
  const cancelled = new Set(cancelledList.map((c) => cancelKey(c.date, c.para, c.subject)));
  const ctx = lessonContext(sessions, data, cancelled);
  const colorOf = subjectColors(data);
  const entries = entriesFor([t], ctx).sort((a, b) => a.para - b.para);

  const lessonRow = (e) => {
    const times = PARA_TIMES[e.para], isNow = times && times[0] <= now && now <= times[1];
    return h("li", { class: "day-row" + (isNow ? " now" : "") },
      h("div", { class: "day-time" }, h("b", { text: e.para + "-para" }), times ? h("small", { text: times.join("–") }) : null, isNow ? chip("Hozir", "live") : null),
      e.kind === "site" ? siteCard(e.lesson, ctx.unsaved, colorOf(e.lesson.subject)) : courseCard(e, colorOf(COURSE.subject)));
  };
  const upcoming = entriesFor([...Array(14).keys()].map((i) => shiftDay(t, i + 1)), ctx).sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para)[0];
  const load = data && data.load ? computeLoad(data, sessions, coursePlan, cancelled) : null;
  const sum = load ? total(load.lines) : null;
  const score = ((data && data.kpi && data.kpi.bands) || []).reduce((n, b) => n + (Number(b.score) || 0), 0);
  const period = ((data && data.periods) || []).slice(-1)[0];
  const stat = (href, label, value, note) => h("a", { class: "tile link", href }, h("span", { class: "label", text: label }), h("b", { text: String(value) }), note ? h("span", { class: "note", text: note }) : null);

  const start = (data && data.load && data.load.start) || "";
  const gaps = (ctx.unsavedList || []).filter((l) => l.date >= start && !cancelled.has(cancelKey(l.date, l.para, l.subject))).length;
  const todo = entries.filter((e) => e.kind === "course" && !e.session && PARA_TIMES[e.para][1] <= now).length;
  const ready = works.filter((w) => { const n = (customSteps[w.band] ?? workSteps(w.band)).length; return n && w.step >= n; }).length;
  const syncText = { expired: "Sessiya tugadi, yangi cookie kerak", wrong_account: "Saytda boshqa hisob ochiq", none: "Avtomatik sinxronlash o'chiq", error: "Oxirgi sinxronlash o'xshamadi" }[status.state];
  const tasks = [
    syncText ? ["#/kabinet", "alert", syncText] : null,
    todo ? ["#/jadval", "alert", "Bugun " + todo + " ta darsda davomat olinmagan"] : null,
    gaps ? ["#/jadval", "alert", "Saytda " + gaps + " ta darsda davomat olinmagan"] : null,
    debts.owed ? ["#/qarzlar", "clock", debts.owed + " ta qarz topshirilmagan"] : null,
    ready ? ["#/ilmiy-kpi", "check", ready + " ta ish saytga yuklashga tayyor"] : null,
    notes.unread ? ["#/bildirishnomalar", "alert", notes.unread + " ta yangi bildirishnoma"] : null,
  ].filter(Boolean);

  show(pageHead("Bugun", capital(longDay(t))),
    h("div", { class: "tiles" },
      stat("#/jadval", "Bugungi darslar", entries.length, upcoming && !entries.length ? "Keyingisi: " + shortDate(upcoming.date) : null),
      stat("#/yuklama", "Qolgan yuklama", sum ? hrs(sum.left) + " soat" : "–", sum ? pct(100 * (sum.done + sum.noAtt) / sum.plan) + " bajarildi" : "Sinxronlanmagan"),
      stat("#/ustama", "Ustama", period ? period.bonus || period.score + "%" : "–", period ? period.label.replace(/^\d+\D+/, "") : "Sinxronlanmagan"),
      stat("#/ilmiy-kpi", "Ilmiy ball", score.toFixed(2), works.length ? works.length + " ta ish kuzatuvda" : null)),
    h("div", { class: "split" },
      h("section", { class: "card", "aria-labelledby": "day-h" }, h("h2", { id: "day-h", text: "Bugungi jadval" }),
        entries.length ? h("ul", { class: "plain day-list" }, entries.map(lessonRow))
          : h("p", { class: "muted day-free", text: upcoming ? "Bugun dars yo'q. Keyingi dars: " + capital(longDay(upcoming.date)) + ", " + upcoming.para + "-para." : "Bugun dars yo'q." })),
      h("aside", { class: "rail" }, h("section", { class: "card", "aria-labelledby": "todo-h" }, h("h2", { id: "todo-h", text: "E'tibor talab qiladi" }),
        tasks.length ? h("ul", { class: "plain tasks" }, tasks.map(([href, ic, text]) => h("li", {}, h("a", { href }, icon(ic), h("span", { text })))))
          : h("p", { class: "all-clear" }, icon("check"), "Hammasi joyida")))));
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
const PALETTE_PAGES = [["#/", "Bosh sahifa"], ["#/jadval", "Dars jadvali"], ["#/yuklama", "Yuklama"], ["#/ilmiy-kpi", "Ilmiy KPI"], ["#/ustama", "Ustama"], ["#/darslar", "Darslar"], ["#/talabalar", "Talabalar"], ["#/qarzlar", "Qarzlar"], ["#/bildirishnomalar", "Bildirishnomalar"], ["#/kabinet", "Kabinet"]];
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
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
route();
