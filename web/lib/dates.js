"use strict";
// Days, months and the university's lesson times. Dates are ISO strings (YYYY-MM-DD) in Tashkent time;
// "today" is always passed in, never read from the clock here.
(function (root) {

  const TZ = "Asia/Tashkent";

  const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

  const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

  // official lesson times of the university
  const PARA_TIMES = { 1: ["08:30", "09:50"], 2: ["10:00", "11:20"], 3: ["11:30", "12:50"], 4: ["13:20", "14:40"], 5: ["14:50", "16:10"], 6: ["16:20", "17:40"], 7: ["17:50", "19:10"], 8: ["19:20", "20:40"], 9: ["20:50", "22:10"] };

  function shiftDay(iso, days) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); }

  function dowOf(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

  function weekday(iso) { const [y, m, d] = iso.split("-").map(Number); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; }

  function longDay(iso) { const [, m, d] = iso.split("-").map(Number); return d + "-" + MONTHS[m - 1] + ", " + weekday(iso); }

  function shortDate(iso) { const [, m, d] = iso.split("-").map(Number); return d + "-" + MONTHS[m - 1]; }

  function monthTitle(key) { const [y, m] = key.split("-").map(Number); const t = MONTHS[m - 1]; return t[0].toUpperCase() + t.slice(1) + " " + y; }

  function capital(t) { return t[0].toUpperCase() + t.slice(1); }

  // one way to write a day everywhere it is read: "8-noyabr", with the year only when it is not this year
  function dayText(iso, today) {
    const [y, m, d] = iso.split("-").map(Number);
    return d + "-" + MONTHS[m - 1] + (String(y) === today.slice(0, 4) ? "" : " " + y);
  }

  // what a date box holds while it is typed in: "08.11.2026"
  function inputDay(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return String(d).padStart(2, "0") + "." + String(m).padStart(2, "0") + "." + y;
  }

  function relDay(iso, t) { return iso === t ? "bugun" : iso === shiftDay(t, -1) ? "kecha" : null; }

  // "5.11.2026", "05/11/2026" or "5.11" -> "2026-11-05"; anything that is not a real date -> ""
  function parseDay(text, today) {
    const m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?$/.exec(text.trim());
    if (!m) return "";
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3] || today.slice(0, 4)), real = new Date(Date.UTC(y, mo - 1, d));
    if (real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d) return "";
    return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  // "2026 — Oktabr" -> "2026-10"
  function periodKey(label) {
    const m = /(\d{4})[^\p{L}]+(\p{L}+)/u.exec(label || "");
    const i = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
    return i < 0 ? "" : m[1] + "-" + String(i + 1).padStart(2, "0");
  }

  function periodTitle(key) { const [y, m] = key.split("-").map(Number); return capital(MONTHS[m - 1]) + " " + y; }

  const Dates = { TZ, WEEKDAYS, MONTHS, PARA_TIMES, shiftDay, dowOf, weekday, longDay, shortDate, monthTitle, capital, dayText, inputDay, relDay, parseDay, periodKey, periodTitle };
  if (typeof module !== "undefined" && module.exports) module.exports = Dates; else root.Dates = Dates;
})(typeof self !== "undefined" ? self : this);
