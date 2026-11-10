"use strict";
// The arithmetic behind "am I ahead or behind": how far the semester is, how many hours that asks
// for, and how the hours held compare. No DOM here, so it is tested with `node --test webtest/*.test.js`.
(function (root) {
  const DAY = 864e5;
  const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };

  const WORK_DAYS = 6;   // Monday to Saturday; Sunday is off
  const isSunday = (iso) => new Date(utc(iso)).getUTCDay() === 0;
  const shift = (iso, n) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);

  // where today is in a semester of `weeks` weeks: working days so far (today included unless it is
  // a Sunday), of how many, the calendar week, and the last working day
  function semester(start, weeks, today) {
    const total = weeks * WORK_DAYS, span = weeks * 7;
    const passed = Math.max(0, Math.min(span, Math.round((utc(today) - utc(start)) / DAY) + 1));   // calendar days, today included
    let day = Math.floor(passed / 7) * WORK_DAYS;
    for (let i = Math.floor(passed / 7) * 7; i < passed; i++) if (!isSunday(shift(start, i))) day++;
    day = Math.min(total, day);
    let end = shift(start, span - 1);
    while (isSunday(end)) end = shift(end, -1);
    return { day, total, left: total - day, frac: total ? day / total : 0, week: passed ? Math.ceil(passed / 7) : 0, weeks, end };
  }

  // lines: { plan, done, noAtt, closed, finished }. A closed group will not be taught again and its plan
  // is what it got; a finished one has taught its whole plan. Either is expected in full and held in
  // full, so it neither helps nor hurts the comparison.
  function summary(lines, frac) {
    let plan = 0, held = 0, openPlan = 0, closedPlan = 0;
    for (const l of lines) {
      const p = l.plan || 0;
      plan += p; held += (l.done || 0) + (l.noAtt || 0);
      if (l.closed || l.finished) closedPlan += p; else openPlan += p;
    }
    const expected = openPlan > 0 ? closedPlan + openPlan * Math.max(0, Math.min(1, frac)) : null;
    return {
      plan, held, left: Math.max(0, plan - held),
      pct: plan > 0 ? 100 * held / plan : null,
      expected,
      diff: expected === null ? null : held - expected,
      ofExpected: expected ? 100 * held / expected : null,
    };
  }

  function byType(lines) {
    const out = new Map();
    for (const l of lines) { if (!out.has(l.type)) out.set(l.type, []); out.get(l.type).push(l); }
    return out;
  }

  // hours per six-day week so far, per week the rest needs, and the total this pace ends on
  function weekly(held, left, day, total) {
    const rest = total - day, perDay = day > 0 ? held / day : null;
    return {
      current: perDay === null ? null : perDay * WORK_DAYS,
      required: rest > 0 ? left / rest * WORK_DAYS : null,
      projected: perDay === null ? null : held + perDay * rest,
    };
  }

  function fmt1(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "–";
    const r = Math.round(v * 10) / 10;
    return (r === 0 ? 0 : r).toFixed(1).replace(".", ",");
  }

  const Pace = { semester, summary, byType, weekly, fmt1, WORK_DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = Pace; else root.Pace = Pace;
})(typeof self !== "undefined" ? self : this);
