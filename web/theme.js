// Runs before the page paints, so a chosen theme never flashes the other one.
try {
  var t = localStorage.getItem("theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (err) { /* follows the system */ }
