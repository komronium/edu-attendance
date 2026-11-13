"use strict";
// Numbers as the pages print them: hours and percentages with one decimal and a point, and the
// lines of a lesson notice.
(function (root) {
  const Pace = root.Pace || require("../pace.js");

  function fmtNum(v) { return String(Math.round(v * 100) / 100); }

  function pct(v) { return v === null || v === undefined ? "–" : (v === 100 ? "100" : v.toFixed(0)) + "%"; }

  const hrs = (v) => String(Math.round(v * 10) / 10);

  // hours and percentages of the pace: one decimal with a point; whole hours lose the ".0"
  const h1 = (v) => Pace.fmt1(v).replace(/\.0$/, "").replace("-", "−");

  const pct1 = (v) => (v === null || v === undefined ? "–" : Pace.fmt1(v) + "%");

  const signed = (v) => (v === null ? "–" : (v > 0 ? "+" : "") + h1(v));

  // A notice lists its lessons one per line, "10.11.2026, 6-para: Subject · Group". Older notices joined them with "; "
  // and ended with "va yana N ta"; both are read, so every notice shows its lessons as separate rows.
  function noteLessons(n) {
    const lines = (n.body || "").includes("\n") ? n.body.split("\n") : (n.body || "").split("; ");
    const list = [];
    let more = 0;
    for (let line of lines) {
      line = line.trim();
      const tail = /\s+va yana (\d+) ta$/.exec(line);
      if (tail) { more = Number(tail[1]); line = line.slice(0, tail.index); }
      const m = /^(\d{2})\.(\d{2})\.(\d{4}), (\d+)-para: (.+)$/.exec(line);
      if (!m) return { list: [], more: 0 };   // not a lesson notice: the plain text is shown
      const cut = m[5].lastIndexOf(" · ");
      list.push({ iso: m[3] + "-" + m[2] + "-" + m[1], para: Number(m[4]), subject: cut < 0 ? m[5] : m[5].slice(0, cut), group: cut < 0 ? "" : m[5].slice(cut + 3) });
    }
    return { list, more };
  }

  const Format = { fmtNum, pct, hrs, h1, pct1, signed, noteLessons };
  if (typeof module !== "undefined" && module.exports) module.exports = Format; else root.Format = Format;
})(typeof self !== "undefined" ? self : this);
