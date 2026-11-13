"use strict";
// The pure logic moved out of app.js must compute exactly what it did inside it. expected.json was
// recorded from the old app.js in a browser (demo --with-site, fixed dates); input.json is what it read.
const test = require("node:test");
const assert = require("node:assert/strict");
const Timetable = require("../web/lib/timetable.js");
const Load = require("../web/lib/load.js");
const Ustama = require("../web/lib/ustama.js");
const input = require("./golden/input.json");
const cases = require("./golden/expected.json");

// the recording predates per-section read times: as then, the unsaved list counts as read after every
// lesson. Lines now also carry "unknown" hours, which must all be 0 here and are left out of the comparison.
input.data.fetched = { unsaved: 4e9 };
const roundtrip = (v) => JSON.parse(JSON.stringify(v, (k, x) => {
  if (k === "unknown") { assert.equal(x, 0); return undefined; }
  return x;
}));
for (const c of cases) {
  test(`same results as before the move on ${c.today} ${c.now}`, () => {
    const cancelled = new Set(input.cancelled.map((x) => Timetable.cancelKey(x.date, x.para, x.subject)));
    const sem = input.semester;
    assert.deepEqual(roundtrip(Load.loadPace(input.data, input.sessions, input.coursePlan, cancelled, sem, c.today, c.now)), c.load);
    const ctx = Timetable.lessonContext(input.sessions, input.data, cancelled, sem);
    const span = [];
    for (let d = sem.start; d <= require("../web/lib/dates.js").shiftDay(c.today, 14); d = require("../web/lib/dates.js").shiftDay(d, 1)) span.push(d);
    assert.deepEqual(Timetable.entriesFor(span, ctx).map((e) => ({ kind: e.kind, date: e.date, para: e.para, session: e.session ? e.session.id : null })), c.entries);
    assert.deepEqual(Timetable.courseGaps(ctx, c.today, c.now).map((e) => e.date + "|" + e.para), c.gaps);
    const next = Timetable.nextEntry(ctx, c.today, c.now);
    assert.equal(next ? next.date + "|" + next.para + "|" + next.kind : null, c.next);
    const month = c.today.slice(0, 7);
    assert.deepEqual(Ustama.ustamaOpen(input.data, input.marks, month, input.progress, c.today), c.ustamaOpen);
    assert.deepEqual(Ustama.ustamaFigure(input.data, input.marks, month), c.ustamaFigure);
  });
}
