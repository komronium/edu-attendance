"use strict";
// The owner's course and the rules that read meaning out of the site's names. Hard-coding what is
// true only for the owner is accepted (PRODUCT.md); it is kept here, in one place.
(function (root) {

  // the course group's fixed classes: Monday-Thursday, timetable paras 3 and 4.
  // The lessons table stores them as para 1 and 2 of the day, so slotOf maps stored para -> timetable para.
  const COURSE = { subject: "Algoritmlash", type: "Amaliy", group: "2-ATT-25", planHours: 200 /* estimate: the group is not in the site's load */, days: [1, 2, 3, 4], slotOf: { 1: 3, 2: 4 }, room: "K4 / 309" };

  const HOURS_PER_PARA = 2;    // checked against the site: 8 lessons = a 16-hour line

  // the load spells some subjects "Name(Other name)" while the schedule uses the name in brackets
  function canonSubject(name) { const m = /\(([^()]+)\)\s*$/.exec(name || ""); return (m ? m[1] : name || "").trim(); }

  // "4-o'quv bino, 306-informatika xonasi" -> "K4 / 306"
  function fmtRoom(r) { const m = /^(\d+)-o.quv bino,\s*([\d/]+)/.exec(r || ""); return m ? "K" + m[1] + " / " + m[2] : r || ""; }

  function fmtType(t) { return /amaliy/i.test(t) ? "Amaliy" : /ma.ruza/i.test(t) ? "Ma'ruza" : t || ""; }

  // part-time (sirtqi) groups, named S1-KT-22 and so on, study in a session of a few weeks, not the whole semester
  const isSirtqi = (group) => group.split(/,\s*/).every((g) => /^S\d/i.test(g.trim()));

  const normTitle = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  function sameWork(a, b) {
    const x = normTitle(a), y = normTitle(b);
    return x === y || (Math.min(x.length, y.length) >= 15 && (x.includes(y) || y.includes(x)));
  }

  // names compared the way they are typed: no case, no apostrophe variants
  const plainName = (x) => x.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").trim();

  // stages a work goes through before it can be uploaded; editable per item
  function workSteps(band) {
    if (/patent|dgu/i.test(band)) return ["Hujjatlar tayyorlandi", "Topshirildi", "Guvohnoma olindi"];
    if (/monografiya|darslik|qo.llanma/i.test(band)) return ["Yozildi", "Taqrizdan o'tdi", "Chop etildi"];
    if (/maqola|tezis|anjuman/i.test(band)) return ["Yozildi", "Topshirildi", "Qabul qilindi", "Chop etildi"];
    return ["Boshlandi", "Tayyor"];
  }

  // starting stages; each item's list can be edited on the page
  function defaultSteps(title) {
    if (/maqola/i.test(title)) return ["Yozildi", "Topshirildi", "Tizimga yuklandi"];
    if (/ochiq dars/i.test(title)) return ["Rejalashtirildi", "O'tildi", "Tizimga yuklandi"];
    if (/kontent/i.test(title)) return ["Tayyorlandi", "Tizimga yuklandi"];
    if (/metod/i.test(title)) return ["Tayyorlandi", "Joriy etildi", "Joylashtirildi"];
    if (/shogird|shogirt/i.test(title)) return ["Rejalashtirildi", "Bajarildi", "Tizimga yuklandi"];
    return [];
  }

  // graded by others at the end of the month: nothing the teacher can tick
  const GRADED_BY_OTHERS = /ma.suliyati|moddiy texnik|rektor ustamasi/i;

  const SKIPPED = -1;   // a progress value: the item cannot be done this month

  const Rules = { COURSE, HOURS_PER_PARA, canonSubject, fmtRoom, fmtType, isSirtqi, normTitle, sameWork, plainName, workSteps, defaultSteps, GRADED_BY_OTHERS, SKIPPED };
  if (typeof module !== "undefined" && module.exports) module.exports = Rules; else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
