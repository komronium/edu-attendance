"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Pace = require("../web/pace.js");

test("the semester counts working days, Monday to Saturday", () => {
  // 15 weeks from Monday 14 September: 90 working days, the last one Saturday 26 December
  const first = Pace.semester("2026-09-14", 15, "2026-09-14");
  assert.equal(first.day, 1); assert.equal(first.total, 90); assert.equal(first.left, 89); assert.equal(first.week, 1); assert.equal(first.end, "2026-12-26");
  const now = Pace.semester("2026-09-14", 15, "2026-11-10");   // Tuesday of week 9: 8 weeks × 6 + 2
  assert.equal(now.day, 50); assert.equal(now.week, 9); assert.equal(now.left, 40);
  assert.equal(Pace.semester("2026-09-14", 15, "2026-09-20").day, 6);   // a Sunday adds nothing
  assert.equal(Pace.semester("2026-09-14", 15, "2026-09-21").day, 7);
  const before = Pace.semester("2026-09-14", 15, "2026-09-01");
  assert.equal(before.day, 0); assert.equal(before.week, 0); assert.equal(before.frac, 0);
  const after = Pace.semester("2026-09-14", 15, "2027-01-15");
  assert.equal(after.day, 90); assert.equal(after.left, 0); assert.equal(after.week, 15); assert.equal(after.frac, 1);
  assert.equal(Pace.semester("2026-09-14", 15, "2026-11-10").frac, 50 / 90);
});

test("summary compares what was held with what the day asks for", () => {
  const s = Pace.summary([{ plan: 120, done: 70, noAtt: 4, closed: false }, { plan: 220, done: 136, noAtt: 0, closed: false }], 0.656);
  assert.equal(s.plan, 340); assert.equal(s.held, 210); assert.equal(s.left, 130);
  assert.equal(Pace.fmt1(s.pct), "61,8");
  assert.equal(Pace.fmt1(s.expected), "223,0");
  assert.equal(Pace.fmt1(s.diff), "-13,0");
  assert.equal(Pace.fmt1(s.ofExpected), "94,2");
});

test("no plan gives no percentage", () => {
  const s = Pace.summary([{ plan: 0, done: 0, noAtt: 0 }], 0.5);
  assert.equal(s.pct, null); assert.equal(s.expected, null); assert.equal(s.diff, null); assert.equal(s.ofExpected, null);
});

test("closed groups neither help nor hurt the comparison", () => {
  const closed = Pace.summary([{ plan: 10, done: 10, noAtt: 0, closed: true }], 0.5);
  assert.equal(closed.expected, null); assert.equal(closed.diff, null); assert.equal(closed.pct, 100);
  const mixed = Pace.summary([{ plan: 10, done: 10, noAtt: 0, closed: true }, { plan: 100, done: 40, noAtt: 0 }], 0.5);
  assert.equal(mixed.expected, 60); assert.equal(mixed.diff, -10); assert.equal(mixed.held, 50);   // the closed 10 are both expected and held
});

test("a finished group counts with the hours it taught ahead", () => {
  const mixed = Pace.summary([{ plan: 16, done: 16, noAtt: 0, finished: true }, { plan: 16, done: 4, noAtt: 0 }], 0.5);
  assert.equal(mixed.expected, 16); assert.equal(mixed.diff, 4);
});

test("before the semester starts nothing is expected", () => {
  const s = Pace.summary([{ plan: 100, done: 0, noAtt: 0 }], 0);
  assert.equal(s.expected, 0); assert.equal(s.diff, 0); assert.equal(s.ofExpected, null);
});

test("groups lines by lesson type in first-seen order", () => {
  const m = Pace.byType([{ type: "Amaliy", plan: 1 }, { type: "Ma'ruza", plan: 2 }, { type: "Amaliy", plan: 3 }]);
  assert.deepEqual([...m.keys()], ["Amaliy", "Ma'ruza"]);
  assert.equal(m.get("Amaliy").length, 2);
});

test("weekly pace counts six working days a week", () => {
  const w = Pace.weekly(210, 130, 50, 90);
  assert.equal(Pace.fmt1(w.current), "25,2");    // 210 / 50 × 6
  assert.equal(Pace.fmt1(w.required), "19,5");   // 130 / 40 × 6
  assert.equal(Math.round(w.projected), 378);    // 210 + 210 / 50 × 40
  assert.equal(Pace.weekly(10, 5, 90, 90).required, null);
  const early = Pace.weekly(0, 100, 0, 90);
  assert.equal(early.current, null); assert.equal(early.projected, null);
});

test("one decimal with a comma", () => {
  assert.equal(Pace.fmt1(null), "–");
  assert.equal(Pace.fmt1(61.75), "61,8");
  assert.equal(Pace.fmt1(100), "100,0");
  assert.equal(Pace.fmt1(-0.04), "0,0");
});
