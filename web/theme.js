// Runs before the page paints, so a chosen theme never flashes the other one. data-theme is always set
// (the saved choice, else the system's), so the dark values live in one place: css/tokens.css.
(function () {
  var root = document.documentElement, dark = window.matchMedia("(prefers-color-scheme: dark)"), saved = null;
  try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") saved = t; } catch (err) { /* follows the system */ }
  function apply() { root.dataset.theme = saved || (dark.matches ? "dark" : "light"); }
  apply();
  // the page's switch (app.js) calls this; with no choice the page keeps following the system
  window.setTheme = function (v) {
    saved = v === "dark" || v === "light" ? v : null;
    try { if (saved) localStorage.setItem("theme", saved); else localStorage.removeItem("theme"); } catch (err) { /* this visit only */ }
    apply();
  };
  window.themeChoice = function () { return saved || "auto"; };
  if (dark.addEventListener) dark.addEventListener("change", apply);
})();
