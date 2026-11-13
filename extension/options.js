// The app origins the extension may hand the university session to, besides the built-in ones.
const BUILT_IN = ["https://davomat.lidersement.uz", "http://127.0.0.1:8766", "http://localhost:8766"];
const extra = document.getElementById("extra"), msg = document.getElementById("msg");
for (const o of BUILT_IN) document.getElementById("fixed").append(Object.assign(document.createElement("li"), { textContent: o }));

// an origin and nothing else: no path, no credentials; local addresses need their port
function clean(line) {
  let u;
  try { u = new URL(line.trim()); } catch (err) { return null; }
  const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.origin === "null" || u.origin + "/" !== u.href && u.origin !== u.href.replace(/\/$/, "")) return null;
  if (local ? u.protocol !== "http:" || !u.port : u.protocol !== "https:") return null;
  return u.origin;
}

chrome.storage.local.get("origins").then(({ origins = [] }) => { extra.value = origins.join("\n"); });
document.getElementById("save").addEventListener("click", async () => {
  const lines = extra.value.split("\n").map((x) => x.trim()).filter(Boolean), good = [];
  for (const l of lines) {
    const o = clean(l);
    if (!o) { msg.className = "err"; msg.textContent = "Noto'g'ri manzil: " + l; return; }
    if (!good.includes(o) && !BUILT_IN.includes(o)) good.push(o);
  }
  await chrome.storage.local.set({ origins: good });
  extra.value = good.join("\n");
  msg.className = "ok"; msg.textContent = "Saqlandi";
});
