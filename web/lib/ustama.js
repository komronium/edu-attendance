"use strict";
// The monthly bonus: which of the month's items are still open, and the month's figure.
(function (root) {
  const Dates = root.Dates || require("./dates.js");
  const Rules = root.Rules || require("./rules.js");
  const { periodKey } = Dates;
  const { GRADED_BY_OTHERS, SKIPPED } = Rules;

  // the month's own items that are neither ticked nor graded yet, and the days left to finish them
  function ustamaOpen(data, marks, month, progress, t) {
    const periods = (data && data.periods) || [];
    const sitePeriod = periods.find((p) => periodKey(p.label) === month), template = sitePeriod || periods[periods.length - 1];
    const ticked = new Set(marks.filter((m) => m.period === month).map((m) => m.item));
    const skipped = new Set((progress || []).filter((p) => p.period === month && p.step === SKIPPED).map((p) => p.item));
    const open = ((template && template.items) || []).filter((i) => Number(i.max) > 0 && !GRADED_BY_OTHERS.test(i.title) && !ticked.has(i.title) && !skipped.has(i.title) && !(sitePeriod && i.graded > 0));
    const [y, m, d] = t.split("-").map(Number);
    return { count: open.length, points: open.reduce((n, i) => n + Number(i.max), 0), days: new Date(y, m, 0).getDate() - d };
  }

  // the month's figure as the Ustama page heads it: approved by the site once it has opened the month, else what the ticked items would bring
  function ustamaFigure(data, marks, month) {
    const periods = (data && data.periods) || [];
    const sitePeriod = periods.find((p) => periodKey(p.label) === month), template = sitePeriod || periods[periods.length - 1];
    const items = (template && template.items) || [];
    const ticked = new Set(marks.filter((m) => m.period === month).map((m) => m.item));
    const pending = items.filter((i) => Number(i.max) > 0 && !GRADED_BY_OTHERS.test(i.title) && ticked.has(i.title) && !(sitePeriod && i.graded > 0)).reduce((n, i) => n + Number(i.max), 0);
    const approved = sitePeriod ? items.reduce((n, i) => n + (Number(i.value) || 0), 0) : 0;
    return { onSite: !!sitePeriod, known: items.length > 0, approved, pending, value: sitePeriod ? approved : pending };
  }

  const Ustama = { ustamaOpen, ustamaFigure };
  if (typeof module !== "undefined" && module.exports) module.exports = Ustama; else root.Ustama = Ustama;
})(typeof self !== "undefined" ? self : this);
