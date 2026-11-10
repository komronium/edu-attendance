"use strict";
// The arithmetic behind "am I ahead or behind": how far the semester is, how many hours that asks
// for, and how the hours held compare. No DOM here, so it is tested with `node --test webtest/*.test.js`.
(function (root) {
  const DAY = 864e5;
  const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };

  // the start date is day 1; before it 0, after the last day the last day
  function dayNumber(start, days, today) {
    return Math.max(0, Math.min(days, Math.round((utc(today) - utc(start)) / DAY) + 1));
  }
  function fraction(start, days, today) { return days > 0 ? dayNumber(start, days, today) / days : 0; }

  // lines: { plan, done, noAtt, closed }. A closed group will not be taught again and its plan is what
  // it got: it is expected in full and held in full, so it neither helps nor hurts the comparison.
  function summary(lines, frac) {
    let plan = 0, held = 0, openPlan = 0, closedPlan = 0;
    for (const l of lines) {
      const p = l.plan || 0;
      plan += p; held += (l.done || 0) + (l.noAtt || 0);
      if (l.closed) closedPlan += p; else openPlan += p;
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

  // hours per week so far, hours per week the rest needs, and the total this pace ends on
  function weekly(held, left, day, days) {
    const current = day > 0 ? held / day * 7 : null, rest = days - day;
    return {
      current,
      required: rest > 0 ? left / rest * 7 : null,
      projected: current === null ? null : held + current / 7 * rest,
    };
  }

  function fmt1(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "–";
    const r = Math.round(v * 10) / 10;
    return (r === 0 ? 0 : r).toFixed(1).replace(".", ",");
  }

  const Pace = { dayNumber, fraction, summary, byType, weekly, fmt1 };
  if (typeof module !== "undefined" && module.exports) module.exports = Pace; else root.Pace = Pace;
})(typeof self !== "undefined" ? self : this);
