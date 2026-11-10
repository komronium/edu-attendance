"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Pace = require("../web/pace.js");

test("day number counts the start date as day 1 and stays inside the semester", () => {
  assert.equal(Pace.dayNumber("2026-09-14", 90, "2026-09-14"), 1);
  assert.equal(Pace.dayNumber("2026-09-14", 90, "2026-11-10"), 58);
  assert.equal(Pace.dayNumber("2026-09-14", 90, "2026-09-01"), 0);
  assert.equal(Pace.dayNumber("2026-09-14", 90, "2027-01-01"), 90);
  assert.equal(Pace.fraction("2026-09-14", 90, "2026-10-28"), 0.5);
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

test("before the semester starts nothing is expected", () => {
  const s = Pace.summary([{ plan: 100, done: 0, noAtt: 0 }], 0);
  assert.equal(s.expected, 0); assert.equal(s.diff, 0); assert.equal(s.ofExpected, null);
});

test("groups lines by lesson type in first-seen order", () => {
  const m = Pace.byType([{ type: "Amaliy", plan: 1 }, { type: "Ma'ruza", plan: 2 }, { type: "Amaliy", plan: 3 }]);
  assert.deepEqual([...m.keys()], ["Amaliy", "Ma'ruza"]);
  assert.equal(m.get("Amaliy").length, 2);
});

test("weekly pace: so far, needed, and where it ends", () => {
  const w = Pace.weekly(210, 130, 59, 90);
  assert.equal(Pace.fmt1(w.current), "24,9");
  assert.equal(Pace.fmt1(w.required), "29,4");
  assert.equal(Math.round(w.projected), 320);
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
