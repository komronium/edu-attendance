"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Dates = require("../web/lib/dates.js");
const Rules = require("../web/lib/rules.js");
const T = require("../web/lib/timetable.js");
const Ustama = require("../web/lib/ustama.js");
const Plans = require("../web/lib/plans.js");
const Format = require("../web/lib/format.js");
const Load = require("../web/lib/load.js");

test("parseDay reads what people type and refuses days that do not exist", () => {
  assert.equal(Dates.parseDay("5.11", "2026-11-11"), "2026-11-05");
  assert.equal(Dates.parseDay("05/11/2026", "2026-11-11"), "2026-11-05");
  assert.equal(Dates.parseDay("5-11-2027", "2026-11-11"), "2027-11-05");
  assert.equal(Dates.parseDay("31.02.2026", "2026-11-11"), "");
  assert.equal(Dates.parseDay("abc", "2026-11-11"), "");
});

test("dates read as 8-noyabr, with the year only when it is not this year", () => {
  assert.equal(Dates.dayText("2026-11-08", "2026-11-11"), "8-noyabr");
  assert.equal(Dates.dayText("2025-11-08", "2026-11-11"), "8-noyabr 2025");
  assert.equal(Dates.relDay("2026-11-10", "2026-11-11"), "kecha");
  assert.equal(Dates.relDay("2026-11-09", "2026-11-11"), null);
  assert.equal(Dates.periodKey("2026 — Oktabr"), "2026-10");
  assert.equal(Dates.periodKey("nimadir"), "");
});

test("site names are read the way the pages show them", () => {
  assert.equal(Rules.fmtRoom("4-o'quv bino, 306-informatika xonasi"), "K4 / 306");
  assert.equal(Rules.fmtRoom("Sport zal"), "Sport zal");
  assert.equal(Rules.fmtType("Ma`ruza"), "Ma'ruza");
  assert.equal(Rules.canonSubject("Informatika(Axborot texnologiyalari)"), "Axborot texnologiyalari");
  assert.ok(Rules.isSirtqi("S1-KT-22, S3-KT-22"));
  assert.ok(!Rules.isSirtqi("S1-KT-22, K4-ATT-25"));
  assert.ok(Rules.sameWork("Raqamli davomat: tahlil!", "raqamli davomat tahlil"));
  assert.ok(!Rules.sameWork("Davomat", "Davomat tahlili"), "short titles must match exactly");
  assert.ok(Rules.sameWork("Talabalar davomatini raqamli kuzatish", "Talabalar davomatini raqamli kuzatish usullari"));
});

test("a lesson notice lists its lessons, in both the new and the old body format", () => {
  const n = Format.noteLessons({ body: "10.11.2026, 6-para: Bulutli · S1-KT-22\n11.11.2026, 3-para: Fan" });
  assert.deepEqual(n.list.map((l) => [l.iso, l.para, l.subject, l.group]), [["2026-11-10", 6, "Bulutli", "S1-KT-22"], ["2026-11-11", 3, "Fan", ""]]);
  assert.equal(Format.noteLessons({ body: "10.11.2026, 6-para: A · G; 11.11.2026, 1-para: B · H va yana 3 ta" }).more, 3);
  assert.deepEqual(Format.noteLessons({ body: "Oddiy matn" }).list, []);
  assert.equal(Format.h1(-12.04), "−12");
  assert.equal(Format.pct1(55.25), "55.3%");
});

const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
const sem = { start: "2026-09-14", weeks: 15 };
const session = (id, date, para, finished) => ({ id, date, para, finished_at: finished ? 1 : null, total: 10, came: 9 });

test("course lessons: Monday to Thursday, paras 3 and 4, from the first lesson on", () => {
  const ctx = T.lessonContext([session(1, "2026-11-10", 1, true)], null, new Set(), sem);
  const course = T.entriesFor(week, ctx).filter((e) => e.kind === "course");
  assert.deepEqual([...new Set(course.map((e) => e.date))], ["2026-11-10", "2026-11-11", "2026-11-12"]);
  assert.deepEqual([...new Set(course.map((e) => e.para))], [3, 4]);
  // a lesson held on another day (Saturday) still shows up
  const sat = T.lessonContext([session(1, "2026-11-10", 1, true), session(2, "2026-11-14", 1, true)], null, new Set(), sem);
  assert.ok(T.entriesFor(week, sat).some((e) => e.date === "2026-11-14" && e.session && e.session.id === 2));
});

test("cancelled lessons leave the timetable", () => {
  const lesson = { date: "2026-11-11", para: "6", subject: "Fan(Boshqa fan)", group: "G" };
  const cancelled = new Set([T.cancelKey("2026-11-11", 6, "Boshqa fan"), T.cancelKey("2026-11-11", 3, Rules.COURSE.subject)]);
  const ctx = T.lessonContext([session(1, "2026-11-09", 1, true)], { lessons: [lesson] }, cancelled, sem);
  const day = T.entriesFor(["2026-11-11"], ctx);
  assert.deepEqual(day.map((e) => e.kind + e.para), ["course4"]);
});

test("missing course attendance: every ended lesson without finished attendance, newest first", () => {
  const ctx = T.lessonContext([session(1, "2026-11-09", 1, true), session(2, "2026-11-10", 2, false)], null, new Set(), sem);
  assert.deepEqual(T.courseGaps(ctx, "2026-11-11", "12:00").map((e) => e.date + "|" + e.para),
    ["2026-11-10|4", "2026-11-10|3", "2026-11-09|4"]);   // 11-noyabr 3-para ends 12:50: not yet missing
  assert.deepEqual(T.courseGaps(ctx, "2026-11-11", "13:00")[0].date + "|" + T.courseGaps(ctx, "2026-11-11", "13:00")[0].para, "2026-11-11|3");
});

test("the next lesson is the one running now, else the next one not taken", () => {
  const ctx = T.lessonContext([session(1, "2026-11-09", 1, true), session(2, "2026-11-11", 1, true)], null, new Set(), sem);
  const at = (now) => { const e = T.nextEntry(ctx, "2026-11-11", now); return e.date + "|" + e.para; };
  assert.equal(at("11:40"), "2026-11-11|4");   // 3-para is on but already taken
  assert.equal(at("13:30"), "2026-11-11|4");
  assert.equal(at("15:00"), "2026-11-12|3");
});

test("no course lesson is generated outside the semester", () => {
  const ctx = T.lessonContext([session(1, "2026-09-14", 1, true)], null, new Set(), sem);
  const after = ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"];
  assert.equal(T.entriesFor(after, ctx).length, 0);
  assert.equal(T.courseGaps(ctx, "2026-12-31", "23:59").filter((e) => e.date > "2026-12-26").length, 0);
  assert.ok(T.entriesFor(["2026-12-21"], ctx).length > 0, "the last week still has lessons");
});

const period = (label, items) => ({ label, items });
const item = (title, max, value, graded) => ({ title, max: String(max), min: "0", value: value === undefined ? "" : String(value), graded: graded || 0, criteria: [] });

test("bonus: open items leave out ticked, skipped, graded and others' items", () => {
  const data = { periods: [period("2026 — Noyabr", [item("Ochiq dars", 5), item("Maqola", 5), item("Kontent", 5, 5, 1), item("Metodik", 5), item("Rektor ustamasi", 15), item("Kechikish", 0)])] };
  const marks = [{ period: "2026-11", item: "Ochiq dars" }];
  const progress = [{ period: "2026-11", item: "Metodik", step: Rules.SKIPPED }];
  assert.deepEqual(Ustama.ustamaOpen(data, marks, "2026-11", progress, "2026-11-11"), { count: 1, points: 5, days: 19 });
  assert.equal(Ustama.ustamaOpen(data, marks, "2026-11", progress, "2026-11-30").days, 0);
  const fig = Ustama.ustamaFigure(data, marks, "2026-11");
  assert.deepEqual([fig.onSite, fig.approved, fig.pending, fig.value], [true, 5, 5, 5]);
  // a month the site has not opened is tracked on the latest list: its figure is the ticked items
  const dec = Ustama.ustamaFigure(data, [{ period: "2026-12", item: "Maqola" }], "2026-12");
  assert.deepEqual([dec.onSite, dec.value], [false, 5]);
});

test("plans: a topic counts as taught once its lesson is over, unless it was only partly done", () => {
  const info = { subject: "Fan", group: "G" };
  const plans = [
    { date: "2026-11-10", para: 3, subject: "Fan", group: "G", topic: "Kirish", outcome: "" },
    { date: "2026-11-10", para: 4, subject: "Fan", group: "G", topic: "Sikllar", outcome: "partial" },
    { date: "2026-11-12", para: 3, subject: "Fan", group: "G", topic: "Massivlar", outcome: "" },
    { date: "2026-11-10", para: 5, subject: "Fan", group: "H", topic: "Funksiyalar", outcome: "" },
  ];
  assert.deepEqual([...Plans.coveredTopics(plans, info, [], "2026-11-11", "10:00")], ["kirish"]);
  const topics = { Fan: ["Kirish", "Sikllar", "Massivlar", "Funksiyalar"] };
  assert.equal(Plans.suggestTopic(plans, topics, info, [], "2026-11-11", "10:00"), "Sikllar");
  assert.equal(Plans.planStage({ topic: "", items: [], ready: false }), "none");
  assert.equal(Plans.planStage({ topic: "x", items: [], ready: false }), "planned");
  assert.equal(Plans.planStage({ topic: "", items: [], ready: true }), "ready");
});

test("load: closed groups count what they got; independent study is left out", () => {
  const data = { lessons: [
    { date: "2026-09-15", para: "6", subject: "Fan", type: "Amaliy", group: "A1_yopildi_20.09.2026" },
    { date: "2026-11-10", para: "6", subject: "Fan", type: "Amaliy", group: "B1" },
    { date: "2026-11-12", para: "6", subject: "Fan", type: "Amaliy", group: "B1" },
  ], unsaved: [{ date: "2026-11-10", para: "6", subject: "Fan", type: "Amaliy", group: "B1" }], fetched: { unsaved: 4e9 },
  load: { start: "2026-08-15", items: [
    { group: "A1_yopildi_20.09.2026", subject: "Fan", type: "Amaliy", hours: "16" },
    { group: "B1", subject: "Fan", type: "Amaliy", hours: "20" },
    { group: "B1", subject: "Fan", type: "Mustaqil ta'lim", hours: "40" },
  ] } };
  const L = Load.computeLoad(data, [], null, new Set(), sem, "2026-11-11", "12:00");
  const closed = L.lines.find((l) => l.closed), open = L.lines.find((l) => l.group === "B1");
  assert.deepEqual([closed.plan, closed.sitePlan, closed.done], [2, 16, 2]);
  assert.deepEqual([open.plan, open.done, open.noAtt, open.queued], [20, 0, 2, 1]);
  assert.deepEqual(L.independent, { Fan: 40 });
  assert.equal(L.lines[0].course, true, "the course line leads");
});

test("a site lesson is taken only if the site's list was read after it ended", () => {
  const l = (date, para) => ({ date, para: String(para), subject: "Fan", group: "G" });
  const read = (iso, hhmm) => T.lessonEnd({ date: iso, para: "1" }) - (9 * 60 + 50) * 60 + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60;
  const ctx = (fetchedAt, unsaved) => T.lessonContext([], { lessons: [], unsaved, fetched: fetchedAt ? { unsaved: fetchedAt } : undefined }, new Set(), {});
  const fresh = ctx(read("2026-11-11", "15:00"), [l("2026-11-03", 6)]);
  assert.equal(T.siteStatus(l("2026-11-11", 6), fresh, "2026-11-11", "15:00"), "coming");
  assert.equal(T.siteStatus(l("2026-11-11", 3), fresh, "2026-11-11", "15:00"), "taken");      // ended 12:50, read 15:00
  assert.equal(T.siteStatus(l("2026-11-11", 5), fresh, "2026-11-11", "17:00"), "unknown");    // ended 16:10, read 15:00
  assert.equal(T.siteStatus(l("2026-11-12", 3), fresh, "2026-11-13", "09:00"), "unknown");    // after the read
  assert.equal(T.siteStatus(l("2026-11-03", 6), fresh, "2026-11-11", "15:00"), "missing");
  // a lesson on the list stays missing however old the list is
  const old = ctx(read("2026-11-05", "08:00"), [l("2026-11-03", 6)]);
  assert.equal(T.siteStatus(l("2026-11-03", 6), old, "2026-11-30", "12:00"), "missing");
  // never read
  assert.equal(T.siteStatus(l("2026-11-03", 3), ctx(0, null), "2026-11-11", "15:00"), "unknown");
  assert.equal(T.siteStatus(l("2026-11-03", 3), ctx(0, []), "2026-11-11", "15:00"), "unknown");
});

test("load: hours whose attendance is not known yet are held, but not done", () => {
  const ls = (date) => ({ date, para: "6", subject: "Fan", type: "Amaliy", group: "B1" });
  const data = { lessons: [ls("2026-11-02"), ls("2026-11-05"), ls("2026-11-09")], unsaved: [ls("2026-11-02")],
    fetched: { unsaved: T.lessonEnd(ls("2026-11-06")) }, load: { start: "2026-08-15", items: [{ group: "B1", subject: "Fan", type: "Amaliy", hours: "20" }] } };
  const line = Load.computeLoad(data, [], null, new Set(), sem, "2026-11-11", "12:00").lines.find((l) => l.group === "B1");
  assert.deepEqual([line.noAtt, line.done, line.unknown, line.left], [2, 2, 2, 14]);
  const P = Load.loadPace(data, [], null, new Set(), sem, "2026-11-11", "12:00");
  assert.equal(P.lines.find((l) => l.group === "B1").done + 2 + 2, 6);
  assert.equal(Load.total(P.lines).unknown, 2);
});

test("two lessons on one para are a clash; one joint lesson for several groups is not", () => {
  const algo = { date: "2026-11-16", para: "4", subject: "Algoritmlash", type: "Amaliy", group: "A-1", room: "K4 / 306" };
  const cloud = { date: "2026-11-16", para: "4", subject: "Bulutli texnologiyalar", type: "Amaliy", group: "S5-KT-22", room: "K4 / 309" };
  const joint = [{ date: "2026-11-17", para: "6", subject: "Bulutli texnologiyalar", type: "Ma'ruza", group: "S5-KT-22", room: "K1 / 101" },
    { date: "2026-11-17", para: "6", subject: "Bulutli texnologiyalar", type: "Ma'ruza", group: "S8-KT-22", room: "K1 / 101" }];
  const ctx = T.lessonContext([], { lessons: [algo, cloud, ...joint] }, new Set(), {});
  const found = T.clashes(T.entriesFor(["2026-11-16", "2026-11-17"], ctx).filter((e) => e.kind === "site"));
  assert.deepEqual(found.map((c) => c.date + "|" + c.para + "|" + c.entries.length), ["2026-11-16|4|2"]);
  assert.equal(T.clashKey(found[0].entries[0]), "2026-11-16|4");
});
