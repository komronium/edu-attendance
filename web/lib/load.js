"use strict";
// Teaching load: planned, held and remaining hours per subject, group and type, and the pace against
// the semester's calendar. Pure: the caller passes the semester, today and the clock.
(function (root) {
  const Pace = root.Pace || require("../pace.js");
  const Dates = root.Dates || require("./dates.js");
  const Rules = root.Rules || require("./rules.js");
  const Timetable = root.Timetable || require("./timetable.js");
  const { PARA_TIMES, shiftDay } = Dates;
  const { COURSE, HOURS_PER_PARA, canonSubject, fmtType, isSirtqi } = Rules;
  const { lessonContext, entriesFor, paraOver, cancelKey, lessonEnd } = Timetable;

  const SESSION_MIN_DAYS = 21;   // a session is at least three weeks, even while the timetable shows less of it

  // a part-time group's session: the first to the last lesson in the timetable of any line it is in
  // (its lectures are shared with other groups of the same session), at least three weeks long
  function sessionWindows(lines) {
    const span = new Map();
    for (const l of lines) {
      if (!l.sirtqi || !l.last) continue;
      for (const g of l.group.split(/,\s*/)) {
        const w = span.get(g) || { first: l.first, last: l.last };
        span.set(g, { first: l.first < w.first ? l.first : w.first, last: l.last > w.last ? l.last : w.last });
      }
    }
    return (l) => {
      const ws = l.group.split(/,\s*/).map((g) => span.get(g)).filter(Boolean);
      if (!ws.length) return null;
      const first = ws.reduce((m, w) => (w.first < m ? w.first : m), ws[0].first), last = ws.reduce((m, w) => (w.last > m ? w.last : m), ws[0].last);
      const minEnd = shiftDay(first, SESSION_MIN_DAYS - 1);
      return { first, last: last > minEnd ? last : minEnd };
    };
  }

  function computeLoad(data, sessions, coursePlan, cancelled, semester, t, now) {
    const load = data.load;
    const start = load.start || "";
    const key = (l) => l.date + "|" + Number(l.para);
    const unsaved = new Set(((data.unsaved) || []).filter((l) => l.date >= start).map(key));
    const seen = new Set((data.lessons || []).map(key));
    const lessons = [...(data.lessons || []), ...((data.unsaved) || []).filter((l) => l.date >= start && !seen.has(key(l)))].filter((l) => !cancelled.has(cancelKey(l.date, l.para, l.subject)));
    const ended = (l) => { const p = PARA_TIMES[Number(l.para)]; return l.date < t || (l.date === t && p && p[1] <= now); };
    // a held lesson missing from the unsaved list counts as taken only if the list was read after it ended
    const fetchedAt = (data.fetched && data.fetched.unsaved) || 0, listRead = Array.isArray(data.unsaved);
    const known = (l) => listRead && fetchedAt >= lessonEnd(l);

    const lines = [], independent = {};
    for (const item of load.items) {
      const subject = canonSubject(item.subject);
      if (/mustaqil/i.test(item.type)) { independent[subject] = (independent[subject] || 0) + Number(item.hours); continue; }
      const mine = lessons.filter((l) => canonSubject(l.subject) === subject && l.group === item.group && l.type === item.type);
      const held = mine.filter(ended);
      const noAtt = held.filter((l) => unsaved.has(key(l))).length * HOURS_PER_PARA;
      const unknown = held.filter((l) => !unsaved.has(key(l)) && !known(l)).length * HOURS_PER_PARA;
      const done = held.length * HOURS_PER_PARA - noAtt - unknown;
      // a closed group will not be taught any more, so what it got is its plan; the site's figure stays for the tooltip
      const sitePlan = Number(item.hours), closed = /yopildi/i.test(item.group), plan = closed ? done + noAtt + unknown : sitePlan;
      // lessons in the timetable that have not been held yet (the lighter cards)
      const queued = closed ? 0 : mine.filter((l) => !ended(l)).length;
      const first = mine.reduce((m, l) => (l.date < m ? l.date : m), "9999-12-31"), last = mine.reduce((m, l) => (l.date > m ? l.date : m), "");
      const left = Math.max(0, plan - done - noAtt - unknown);
      const group = item.group.replace(/_yopildi.*/i, "");
      lines.push({ subject, type: fmtType(item.type), group, plan, sitePlan, done, noAtt, unknown, closed, queued, left, first, last, sirtqi: isSirtqi(group), finished: !closed && plan > 0 && left === 0 });
    }
    // the group taught in this app is not in the site's load: finished lessons here, planned hours entered by hand
    const courseDone = sessions.filter((s) => s.finished_at && s.date >= start).length * HOURS_PER_PARA;
    const coursePlanHours = coursePlan ?? COURSE.planHours;
    const courseFirst = sessions.map((x) => x.date).filter((d) => d >= start).sort()[0] || "9999-12-31";
    const course = { subject: COURSE.subject, type: COURSE.type, group: COURSE.group, plan: coursePlanHours, done: courseDone, noAtt: 0, unknown: 0, course: true, left: Math.max(0, coursePlanHours - courseDone), first: courseFirst };
    // its timetable is generated week after week: count as far as the site's schedule reaches (at least two weeks), never past the hours left
    const ctx = lessonContext(sessions, data, cancelled, semester);
    const lastSite = (data.lessons || []).reduce((m, l) => (l.date > m ? l.date : m), shiftDay(t, 13));
    const ahead = [];
    for (let d = t; d <= lastSite && ahead.length < 60; d = shiftDay(d, 1)) ahead.push(d);
    course.queued = Math.min(Math.ceil(course.left / HOURS_PER_PARA),
      entriesFor(ahead, ctx).filter((e) => e.kind === "course" && !paraOver(e, t, now) && !(e.session && e.session.finished_at)).length);
    lines.unshift(course);
    // within a subject: by the month its group started, lectures before practicals, then by the first lesson
    const lectureFirst = (l) => (/ma.ruza/i.test(l.type) ? 0 : 1);
    const order = [...new Set(lines.map((l) => l.subject))];
    lines.sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject) || a.first.slice(0, 7).localeCompare(b.first.slice(0, 7))
      || lectureFirst(a) - lectureFirst(b) || a.first.localeCompare(b.first) || a.group.localeCompare(b.group));

    return { lines, independent, course, coursePlanHours };
  }

  const total = (list) => ({
    plan: list.reduce((n, l) => n + (l.plan || 0), 0), done: list.reduce((n, l) => n + l.done, 0),
    noAtt: list.reduce((n, l) => n + l.noAtt, 0), unknown: list.reduce((n, l) => n + (l.unknown || 0), 0), left: list.reduce((n, l) => n + (l.left || 0), 0), queued: list.reduce((n, l) => n + (l.queued || 0), 0),
  });

  const PARA_SLACK = 2;   // within one para of the calendar counts as on plan

  // where today's mark sits on a bar of the whole plan
  const needPct = (sum) => (sum.expected === null || !sum.plan ? null : 100 * sum.expected / sum.plan);

  // the teaching load measured against the semester's calendar; the home page shows its summary
  function loadPace(data, sessions, coursePlan, cancelled, semester, t, now) {
    const base = computeLoad(data, sessions, coursePlan, cancelled, semester, t, now);
    const S = Pace.semester(semester.start, semester.weeks, t), day = S.day, frac = S.frac;
    const sessionWindow = sessionWindows(base.lines);
    for (const l of base.lines) {   // a part-time group is measured on its own session
      const w = sessionWindow(l);
      if (l.sirtqi) { l.window = w; l.frac = w ? Pace.windowFraction(w.first, w.last, t) : 0; }
    }
    const all = Pace.summary(base.lines, frac);
    const lecturesFirst = (a, b) => /ma.ruza/i.test(b[0]) - /ma.ruza/i.test(a[0]);
    const types = [...Pace.byType(base.lines)].sort(lecturesFirst).map(([type, list]) => ({ type, sum: Pace.summary(list, frac), est: list.some((l) => l.course && l.plan) }));
    return { ...base, frac, day, days: S.total, daysLeft: S.left, week: S.week, weeks: S.weeks, end: S.end, all, types,
      weekly: Pace.weekly(all.held, all.left, day, S.total), est: base.course.plan ? "~" : "" };
  }

  const Load = { SESSION_MIN_DAYS, sessionWindows, computeLoad, total, PARA_SLACK, needPct, loadPace };
  if (typeof module !== "undefined" && module.exports) module.exports = Load; else root.Load = Load;
})(typeof self !== "undefined" ? self : this);
