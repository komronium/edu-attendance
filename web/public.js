"use strict";
// The students' page: with a long list, a box to find your own name. Without this script the whole
// list is simply shown.
(function () {
  const cards = [...document.querySelectorAll(".public-list > section")];
  const box = document.getElementById("public-find");
  if (!box || cards.length <= 10) return;
  const input = box.querySelector("input"), none = document.getElementById("public-none");
  const plain = (x) => x.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").trim();
  box.hidden = false;
  input.addEventListener("input", () => {
    const q = plain(input.value);
    let shown = 0;
    for (const c of cards) {
      const hit = !q || plain(c.querySelector("h2 span").textContent).includes(q);
      c.hidden = !hit;
      if (hit) shown++;
    }
    none.hidden = shown > 0;
  });
})();
