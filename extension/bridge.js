// Runs on the attendance page and carries messages between it and the background. The page does the
// sync itself (its own server, its own login), so the cookie never goes anywhere else.
document.documentElement.dataset.oxuHelper = "1"; // the page shows its login button only when this is set

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
let appReady = false; // the app's script is loaded and logged in (not the password page)

window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const m = e.data;
  if (!m || m.source !== "attendance-app") return;
  if (m.type === "ready") { appReady = true; send({ type: "ready" }); } // the app is loaded and logged in: it can take a cookie
  else if (m.type === "login") send({ type: "start" });
  else if (m.type === "result") send({ type: "result", ok: m.ok === true, quiet: m.quiet === true });
});

// the answer tells the background whether this page took the cookie, so it can try another tab
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "cookie" || typeof msg.cookie !== "string") return;
  if (appReady) window.postMessage({ source: "attendance-helper", type: "cookie", cookie: msg.cookie }, location.origin);
  reply({ taken: appReady });
});
