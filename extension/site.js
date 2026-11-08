// Runs on every digital.oxu.uz page. The teacher logs in by hand (login, password, robot check);
// this only notices that the session is now logged in and tells the background, which hands the
// session to the attendance app. Read-only: it asks /kabinet.asp, the page the sync reads first.
//
// The front page shows the login form even to someone logged in, so the page itself says nothing.
// A page with a login form is asked again every few seconds while the teacher types; any other page once.
const EVERY = 4000, TRIES = 150; // ten minutes for the login and the robot check

async function loggedIn() {
  const res = await fetch("/kabinet.asp", { redirect: "manual", cache: "no-store", credentials: "include" });
  if (!res.ok) return false; // a redirect comes back as an opaque response
  const page = await res.text();
  return page.includes('name="role"') && !page.includes('name="avtorizatsiya"');
}

const loginForm = () => !!document.querySelector('input[type="password"]');

(async () => {
  for (let i = 0; i < TRIES; i++) {
    // the first check runs in a background tab too; the repeated ones only while the tab is in view
    if ((i === 0 || !document.hidden) && (await loggedIn().catch(() => false))) {
      // the page's own cookies go along: the cookies API can miss the session cookie (see background.js)
      chrome.runtime.sendMessage({ type: "page", cookie: document.cookie }).catch(() => {});
      return;
    }
    if (!loginForm() && i > 0) return; // not logged in and no form to log in with: nothing to wait for
    await new Promise((done) => setTimeout(done, EVERY));
  }
})();
