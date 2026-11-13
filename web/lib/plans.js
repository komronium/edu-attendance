"use strict";
// Lesson plans: their stage, which topics of a class are taught, and the next topic to plan.
(function (root) {
  const Rules = root.Rules || require("./rules.js");
  const Timetable = root.Timetable || require("./timetable.js");
  const { COURSE, normTitle } = Rules;
  const { paraOver, sameClass } = Timetable;

  function planStage(p) { return !p ? "none" : p.ready ? "ready" : p.topic || p.items.length ? "planned" : "none"; }

  // topics of a class taught: a planned lesson whose para is over counts as taught unless its plan says
  // it was only partly done or moved; and the course group's finished lessons
  const planHeld = (p, t, now) => paraOver({ date: p.date, para: Number(p.para) }, t, now);

  const planTaught = (p, t, now) => p.outcome === "done" || (!p.outcome && planHeld(p, t, now));

  function coveredTopics(plans, info, sessions, t, now) {
    const out = new Set();
    for (const p of plans) if (planTaught(p, t, now) && p.topic && sameClass(p, info)) out.add(normTitle(p.topic));
    if (info.subject === COURSE.subject && info.group === COURSE.group) for (const s of sessions || []) if (s.finished_at && s.topic) out.add(normTitle(s.topic));
    return out;
  }

  // the first topic of the semester list that is neither taught nor already planned for this class
  function suggestTopic(plans, topics, info, sessions, t, now) {
    const done = coveredTopics(plans, info, sessions, t, now);
    const planned = new Set(plans.filter((p) => sameClass(p, info) && p.topic && !planHeld(p, t, now)).map((p) => normTitle(p.topic)));
    return (topics[info.subject] || []).find((t) => !done.has(normTitle(t)) && !planned.has(normTitle(t))) || "";
  }

  const Plans = { planStage, planHeld, planTaught, coveredTopics, suggestTopic };
  if (typeof module !== "undefined" && module.exports) module.exports = Plans; else root.Plans = Plans;
})(typeof self !== "undefined" ? self : this);
