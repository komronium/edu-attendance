// When the teacher is logged in on digital.oxu.uz, in any tab, the session cookie is handed to the
// attendance page, which sends it to its own server for the sync (owner-ID check included).
// This file never talks to a server itself.
//
// Which attendance page: an open one, else the one used last (remembered when it loads), else the
// hosted one. When none is open it is opened in the background and closed again after the sync.
// If it asks for the app password first, the cookie waits until the app is logged in.
const SITE = "https://digital.oxu.uz/";
const DEFAULT_APP = "https://davomat.lidersement.uz/";
const APP_URLS = ["http://127.0.0.1/*", "http://localhost/*", "https://davomat.lidersement.uz/*"];
const SAME_COOKIE_QUIET = 6 * 3600e3; // the same session is not sent again for six hours after it worked

// Only these origins are ever treated as the attendance app: the session cookie of the university is
// handed to a page of one of them and to nothing else. The manifest lets the bridge run on any localhost
// port, so another page there could pretend to be the app; the exact origin (with its port) is checked here,
// against the tab's real address. More origins (a demo on another port) are added on the options page.
const DEFAULT_ORIGINS = ["https://davomat.lidersement.uz", "http://127.0.0.1:8766", "http://localhost:8766"];
async function origins() {
  const { origins: extra = [] } = await chrome.storage.local.get("origins");
  return [...DEFAULT_ORIGINS, ...extra];
}
async function allowed(url) {
  try { return (await origins()).includes(new URL(url).origin); } catch (err) { return false; }
}
const SITE_ORIGIN = new URL(SITE).origin;

// kept in storage: a service worker is stopped when idle
const get = async (k) => (await chrome.storage.session.get(k))[k] ?? null;
const set = (k, v) => (v === null ? chrome.storage.session.remove(k) : chrome.storage.session.set({ [k]: v }));
// flow: {app, site, opened} tab ids: app is the attendance tab, site the tab the app button opened,
//       opened is true when this file opened the app tab and should close it
// pending: {cookie, sig, at}: a cookie waiting for a logged-in attendance page
// last: {sig, at, ok}: the last cookie sent

// a short trail of what happened, without cookie values, for finding out why a sync did not come
async function trace(event, data) {
  try {
    const { trace: list = [] } = await chrome.storage.local.get("trace");
    list.push([new Date().toISOString(), event, data ?? null]);
    await chrome.storage.local.set({ trace: list.slice(-40) });
  } catch (err) { /* only a diagnostic */ }
}

async function appOrigin() {
  const { app } = await chrome.storage.local.get("app");
  return app && (await allowed(app)) ? app : DEFAULT_APP;   // an address that is no longer allowed is forgotten
}
const tabExists = (id) => (id ? chrome.tabs.get(id).then(() => true, () => false) : Promise.resolve(false));

function badge(text, color, title) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: "attendance: " + title });
}

function signature(cookies) { // the session part only, so an analytics cookie changing does not count
  return cookies.filter((c) => /session/i.test(c.name)).map((c) => c.name + "=" + c.value).sort().join(";") ||
    cookies.map((c) => c.name + "=" + c.value).sort().join(";");
}

// the app button: open the site (or bring the open site tab forward); the result returns focus to the app
async function start(appTab) {
  const flow = (await get("flow")) || {};
  if (await tabExists(flow.site)) {
    await set("flow", { ...flow, app: appTab, opened: false });
    await chrome.tabs.update(flow.site, { active: true });
    return;
  }
  const tab = await chrome.tabs.create({ url: SITE, active: true });
  await set("flow", { app: appTab, site: tab.id, opened: false });
}

// a digital.oxu.uz tab found the session logged in
// pageCookie: the site tab's document.cookie. The cookies API also sees HttpOnly cookies, but Chrome
// leaves out a cookie first set in a cross-site context (has_cross_site_ancestor), which is how the
// site's ASP session cookie can end up; the session cookie is not HttpOnly, so the page has it.
async function loggedIn(siteTab, pageCookie) {
  let cookies = await chrome.cookies.getAll({ url: SITE }); // includes HttpOnly ones
  if (!cookies.length) cookies = await chrome.cookies.getAll({ url: SITE, partitionKey: {} }).catch(() => []);
  if (!cookies.length && pageCookie) {
    cookies = pageCookie.split(";").map((x) => x.trim()).filter((x) => x.includes("="))
      .map((x) => ({ name: x.slice(0, x.indexOf("=")), value: x.slice(x.indexOf("=") + 1) }));
  }
  trace("cookies", { n: cookies.length, names: cookies.map((c) => c.name), fromPage: !!pageCookie });
  if (!cookies.length) return;
  const sig = signature(cookies);
  const flow = (await get("flow")) || {};
  const asked = flow.site === siteTab; // the app button opened this tab: the teacher wants a sync now
  const last = await get("last");
  if (!asked && last && last.sig === sig && last.ok && Date.now() - last.at < SAME_COOKIE_QUIET) return trace("skip", "already synced"); // already synced
  const pending = await get("pending");
  if (pending && pending.sig === sig && Date.now() - pending.at < 20000) return trace("skip", "being sent"); // being sent right now
  await set("pending", { cookie: cookies.map((c) => c.name + "=" + c.value).join("; "), sig, at: Date.now() });
  badge("…", "#0066cc", "sinxronlanmoqda");

  // every open attendance tab, the remembered address first; one opened before the extension was
  // last reloaded has lost its bridge and does not answer, so the next one is tried
  const origin = await appOrigin();
  const found = await chrome.tabs.query({ url: APP_URLS });
  const open = [];
  for (const t of found) if (await allowed(t.url)) open.push(t);
  open.sort((a, b) => b.url.startsWith(origin) - a.url.startsWith(origin));
  const tabs = [...new Set([(await tabExists(flow.app)) ? flow.app : null, ...open.map((t) => t.id)].filter(Boolean))];
  trace("targets", { flowApp: flow.app ?? null, tabs, asked });
  for (const app of tabs) {
    if (await deliver(app)) {
      await set("flow", { ...flow, app, opened: !!flow.opened && flow.app === app });
      return;
    }
  }
  const tab = await chrome.tabs.create({ url: (await appOrigin()) + "#/kabinet", active: false });
  await set("flow", { ...flow, app: tab.id, opened: true });
  // the new tab says "ready" once it is loaded and logged in; deliver() runs then
}

// true when the tab's page took the cookie
async function deliver(appTab) {
  const pending = await get("pending");
  if (!pending) return false;
  try {
    const tab = await chrome.tabs.get(appTab);
    if (!(await allowed(tab.url))) { trace("refused", "deliver to " + (tab.url || "").slice(0, 40)); return false; }
    const answer = await chrome.tabs.sendMessage(appTab, { type: "cookie", cookie: pending.cookie });
    trace(answer && answer.taken ? "delivered" : "not taken", appTab);
    return !!(answer && answer.taken);
  } catch (err) { // no bridge in that tab: still loading, or opened before the extension was reloaded
    trace("deliver failed", { tab: appTab, err: String(err) });
    return false;
  }
}

// the attendance page tried the cookie. quiet: the site has not finished the login yet, keep waiting
async function result(appTab, ok, quiet) {
  const pending = await get("pending");
  await set("pending", null);
  if (quiet) { badge("", null, "digital.oxu.uz kirishi kutilmoqda"); return; }
  if (pending) await set("last", { sig: pending.sig, at: Date.now(), ok });
  badge(ok ? "✓" : "!", ok ? "#17753a" : "#cf0f1f", ok ? "sinxronlandi" : "sinxronlash o'xshamadi, attendance Kabinetini oching");
  if (ok) setTimeout(() => chrome.action.setBadgeText({ text: "" }), 8000);
  const flow = (await get("flow")) || {};
  if (flow.opened && flow.app === appTab) {
    if (ok) await chrome.tabs.remove(appTab).catch(() => {}); // opened only for this: closed again
    else await chrome.tabs.update(appTab, { active: true }).catch(() => {}); // the message is on that page
  } else if (!ok || flow.site) { // the app button flow: back to the app, with the result on screen
    const app = await chrome.tabs.get(appTab).catch(() => null);
    if (app) {
      await chrome.tabs.update(appTab, { active: true });
      await chrome.windows.update(app.windowId, { focused: true });
    }
  }
  if (ok && flow.site) await chrome.tabs.remove(flow.site).catch(() => {}); // the site tab the app button opened
  await set("flow", null);
}

// a page loaded and logged in: remember where the app lives, and hand it a waiting cookie
async function ready(tab) {
  if (!(await allowed(tab.url))) return trace("refused", "ready from " + (tab.url || "").slice(0, 40));
  try { await chrome.storage.local.set({ app: new URL(tab.url).origin + "/" }); } catch (err) { /* keep the old one */ }
  const pending = await get("pending");
  if (!pending) return;
  if (Date.now() - pending.at > 30 * 60e3) { await set("pending", null); return; } // too old to trust
  const flow = (await get("flow")) || {};
  if (!(await allowed(tab.url)) || !(await deliver(tab.id))) return;
  if (flow.app !== tab.id) await set("flow", { ...flow, app: tab.id, opened: false }); // the result comes from this tab
}

chrome.runtime.onMessage.addListener((msg, sender) => {   // no reply is ever sent, so this is not async
  if (!msg || !sender.tab) return;
  (async () => {
    // the cookie comes only from the university's own pages; the app's messages only from allowed origins
    const fromSite = (sender.tab.url || "").startsWith(SITE_ORIGIN + "/");
    if (msg.type === "page" ? !fromSite : !(await allowed(sender.tab.url))) return trace("refused", { type: msg.type, url: (sender.tab.url || "").slice(0, 40) });
    trace("msg", { type: msg.type, tab: sender.tab.id, url: (sender.tab.url || "").slice(0, 60), ok: msg.ok, quiet: msg.quiet });
    const run = { start: () => start(sender.tab.id), page: () => loggedIn(sender.tab.id, typeof msg.cookie === "string" ? msg.cookie : ""), ready: () => ready(sender.tab),
      result: () => result(sender.tab.id, msg.ok === true, msg.quiet === true) }[msg.type];
    if (run) await run();
  })().catch((err) => trace("error", { type: msg.type, err: String(err) }));
});

// a pending cookie whose app tab needs the app password: show it on the toolbar icon
chrome.tabs.onUpdated.addListener(async (id, info, tab) => {
  if (info.status !== "complete" || !tab.url || !/\/login(\?|$)/.test(new URL(tab.url).pathname)) return;
  const flow = await get("flow");
  if (flow && flow.app === id && (await get("pending"))) {
    badge("!", "#8f5400", "attendance ilovasiga kiring, keyin sinxronlash o'zi davom etadi");
    if (flow.opened) chrome.tabs.update(id, { active: true }).catch(() => {});
  }
});
