"use strict";
// The week as date + para entries: the course's generated lessons and the site's, which ones are
// over, missing, or next. Pure: the caller passes today and the clock.
(function (root) {
  const Pace = root.Pace || require("../pace.js");
  const Dates = root.Dates || require("./dates.js");
  const Rules = root.Rules || require("./rules.js");
  const { PARA_TIMES, shiftDay, dowOf } = Dates;
  const { COURSE, canonSubject, fmtType, fmtRoom } = Rules;

  const cancelKey = (date, para, subject) => date + "|" + Number(para) + "|" + canonSubject(subject);

  function lessonContext(sessions, data, cancelled, semester) {
    semester = semester || {};
    const semEnd = semester.end || (semester.start && semester.weeks ? Pace.semester(semester.start, semester.weeks, semester.start).end : "");
    const unsavedList = (data && data.unsaved) || null;
    const known = new Set(((data && data.lessons) || []).map((l) => l.date + "|" + Number(l.para)));
    return {
      sessions, cancelled, unsavedList,
      // when the unsaved list was last read: a lesson that ended after it is not known to be taken
      fetchedAt: (data && data.fetched && data.fetched.unsaved) || 0,
      // the course has lessons only within the semester: none are generated after it ends
      semStart: semester.start || "", semEnd,
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
        const inSemester = (!ctx.semStart || date >= ctx.semStart) && (!ctx.semEnd || date <= ctx.semEnd);
        if (session || (COURSE.days.includes(dowOf(date)) && inSemester && (!ctx.firstDay || date >= ctx.firstDay))) keep({ kind: "course", date, para, appPara, session });
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

  // subject, group and the rest of a timetable entry, the same shape for site and course lessons
  function entryInfo(e) {
    return e.kind === "site"
      ? { subject: canonSubject(e.lesson.subject), name: e.lesson.subject, group: e.lesson.group || "", type: fmtType(e.lesson.type), room: fmtRoom(e.lesson.room), url: e.lesson.url }
      : { subject: COURSE.subject, name: COURSE.subject, group: COURSE.group, type: COURSE.type, room: COURSE.room };
  }

  const sameClass = (a, b) => a.subject === b.subject && a.group === b.group;

  function nextOfClass(e, ctx) {
    const info = entryInfo(e);
    return entriesFor([...Array(60).keys()].map((i) => shiftDay(e.date, i)), ctx)
      .filter((x) => (x.date > e.date || x.para > e.para) && sameClass(entryInfo(x), info))
      .sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para)[0] || null;
  }

  // a moment in Tashkent (UTC+5 all year) as unix seconds
  const tashkentUnix = (iso, hhmm) => { const [y, m, d] = iso.split("-").map(Number), [hh, mm] = hhmm.split(":").map(Number); return Date.UTC(y, m - 1, d, hh - 5, mm) / 1000; };
  // when a lesson's para ends, as unix seconds; a lesson without a known para ends with its day
  const lessonEnd = (l) => { const p = PARA_TIMES[Number(l.para)]; return p ? tashkentUnix(l.date, p[1]) : tashkentUnix(shiftDay(l.date, 1), "00:00"); };

  // A site lesson's attendance as far as the app can know it:
  //   coming   the para has not ended
  //   missing  the site lists it as unsaved (whatever the age of that list: it needs action)
  //   taken    the site's list was read after the para ended and did not have it
  //   unknown  the list was never read, or not since the para ended
  function siteStatus(l, ctx, t, now) {
    if (!paraOver({ date: l.date, para: Number(l.para) }, t, now)) return "coming";
    if (ctx.unsaved && ctx.unsaved.has(l.date + "|" + Number(l.para))) return "missing";
    if (!ctx.unsaved || !ctx.fetchedAt) return "unknown";
    return ctx.fetchedAt >= lessonEnd(l) ? "taken" : "unknown";
  }

  // Lessons that fall on the same para of the same day: one teacher cannot be in two rooms at once.
  // Groups listed separately for one joint lesson (same subject, type and room) are not a clash.
  // Returns [{ date, para, entries }] in time order, one per clashing para.
  function clashes(entries) {
    const byPara = new Map();
    for (const e of entries) {
      const k = e.date + "|" + e.para;
      if (!byPara.has(k)) byPara.set(k, []);
      byPara.get(k).push(e);
    }
    const out = [];
    for (const list of byPara.values()) {
      const lessons = new Set(list.map((e) => { const i = entryInfo(e); return i.subject + "|" + i.type + "|" + i.room; }));
      if (lessons.size > 1) out.push({ date: list[0].date, para: list[0].para, entries: list });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.para - b.para);
  }
  const clashKey = (e) => e.date + "|" + e.para;

  const Timetable = { clashes, clashKey, siteStatus, lessonEnd, cancelKey, lessonContext, entriesFor, paraOver, courseGaps, nextEntry, entryInfo, sameClass, nextOfClass };
  if (typeof module !== "undefined" && module.exports) module.exports = Timetable; else root.Timetable = Timetable;
})(typeof self !== "undefined" ? self : this);
