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

// kept in storage: a service worker is stopped when idle
const get = async (k) => (await chrome.storage.session.get(k))[k] ?? null;
const set = (k, v) => (v === null ? chrome.storage.session.remove(k) : chrome.storage.session.set({ [k]: v }));
// flow: {app, site, opened} tab ids: app is the attendance tab, site the tab the app button opened,
//       opened is true when this file opened the app tab and should close it
// pending: {cookie, sig, at}: a cookie waiting for a logged-in attendance page
// last: {sig, at, ok}: the last cookie sent

async function appOrigin() {
  const { app } = await chrome.storage.local.get("app");
  return app || DEFAULT_APP;
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
async function loggedIn(siteTab) {
  const cookies = await chrome.cookies.getAll({ url: SITE }); // includes HttpOnly ones
  if (!cookies.length) return;
  const sig = signature(cookies);
  const flow = (await get("flow")) || {};
  const asked = flow.site === siteTab; // the app button opened this tab: the teacher wants a sync now
  const last = await get("last");
  if (!asked && last && last.sig === sig && last.ok && Date.now() - last.at < SAME_COOKIE_QUIET) return; // already synced
  const pending = await get("pending");
  if (pending && pending.sig === sig && Date.now() - pending.at < 20000) return; // being sent right now
  await set("pending", { cookie: cookies.map((c) => c.name + "=" + c.value).join("; "), sig, at: Date.now() });
  badge("…", "#0066cc", "sinxronlanmoqda");

  let app = (await tabExists(flow.app)) ? flow.app : null;
  if (!app) {
    const open = await chrome.tabs.query({ url: APP_URLS });
    const origin = await appOrigin();
    const best = open.find((t) => t.url.startsWith(origin)) || open[0];
    if (best) app = best.id;
  }
  if (app) {
    await set("flow", { ...flow, app, opened: !!flow.opened && flow.app === app });
    return deliver(app);
  }
  const tab = await chrome.tabs.create({ url: (await appOrigin()) + "#/kabinet", active: false });
  await set("flow", { ...flow, app: tab.id, opened: true });
  // the new tab says "ready" once it is loaded and logged in; deliver() runs then
}

async function deliver(appTab) {
  const pending = await get("pending");
  if (!pending) return;
  try {
    await chrome.tabs.sendMessage(appTab, { type: "cookie", cookie: pending.cookie });
  } catch (err) { // the tab is still loading, or not an attendance page after all: its "ready" will come
    console.log("attendance: app tab not reachable yet:", String(err));
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
  try { await chrome.storage.local.set({ app: new URL(tab.url).origin + "/" }); } catch (err) { /* keep the old one */ }
  const pending = await get("pending");
  if (!pending) return;
  if (Date.now() - pending.at > 30 * 60e3) { await set("pending", null); return; } // too old to trust
  const flow = (await get("flow")) || {};
  if (flow.app !== tab.id) {
    if (await tabExists(flow.app)) return; // the tab the cookie is meant for will say "ready" itself
    await set("flow", { ...flow, app: tab.id, opened: false });
  }
  deliver(tab.id);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !sender.tab) return;
  if (msg.type === "start") start(sender.tab.id);
  else if (msg.type === "page") loggedIn(sender.tab.id);
  else if (msg.type === "ready") ready(sender.tab);
  else if (msg.type === "result") result(sender.tab.id, msg.ok === true, msg.quiet === true);
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
