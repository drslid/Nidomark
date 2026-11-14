// End-to-end test in Firefox: reading sites never lets a site erase its own data. A site can ask the browser to erase
// its cookies and storage with the Clear-Site-Data header; Chromium browsers refuse it for a request without cookies,
// Firefox does not, so Nidomark strips the header from the answers to its own requests (lib/platform.ts).
// The test site first proves that it can erase its data (a normal visit does), then Nidomark analyzes bookmarks
// pointing to it, with dead sites checked, and its cookie and storage must still be there.
// Needs Firefox 140 or later: FIREFOX_PATH=/path/to/firefox pnpm e2e:firefox (after pnpm build:firefox).
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchFirefox } from './marionette.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXT = path.join(ROOT, '.output', 'firefox-mv3');
const FIREFOX = process.env.FIREFOX_PATH ?? 'firefox';
const ID = 'nidomark@drslid.github.io';
const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const APP = `moz-extension://${UUID}/app.html`;
// Resolved to this computer and treated as a secure origin by the test profile: Clear-Site-Data applies to it.
const HOST = 'www.nidomark-csd.org';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  console.log(`✓ ${msg}`);
};
const version = Number(/(\d+)\./.exec(execFileSync(FIREFOX, ['--version']).toString())?.[1] ?? 0);
if (version < 140) throw new Error(`Firefox ${version} is too old: Nidomark needs Firefox 140 or later (set FIREFOX_PATH)`);

const seen = [];
const server = http.createServer((req, res) => {
  seen.push({ path: req.url, cookie: req.headers.cookie ?? '' });
  const html = (head, body) => res.end(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`);
  switch (req.url) {
    case '/set':
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'session=1; Path=/; Max-Age=3600; SameSite=Lax' });
      return html('<title>Signed in</title>', '<script>localStorage.setItem("draft", "kept")</script>');
    case '/check':
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      return html('<title>check</title>', '<script>document.title = `${document.cookie || "-"} ${localStorage.getItem("draft") ?? "-"}`</script>');
    // The answers a signed-out visitor gets: erase everything, on the page itself or on the way to the login page.
    case '/board':
      res.writeHead(200, { 'content-type': 'text/html', 'clear-site-data': '"cookies", "storage"' });
      return html('<title>Design board – Sign in</title><meta name="description" content="Sign in to see this design board.">', '<h1>Sign in</h1>');
    case '/project':
      res.writeHead(302, { location: '/login', 'clear-site-data': '"cookies", "storage"' });
      return res.end();
    case '/login':
      res.writeHead(200, { 'content-type': 'text/html' });
      return html('<title>Sign in</title>', '<h1>Sign in</h1>');
    default:
      res.writeHead(404, { 'content-type': 'text/html' });
      return html('<title>Not found</title>', '');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const SITE = `http://${HOST}:${server.address().port}`;

const ff = await launchFirefox({
  executable: FIREFOX,
  prefs: {
    'extensions.webextensions.uuids': JSON.stringify({ [ID]: UUID }),
    'intl.locale.requested': 'en-US',
    'network.dns.localDomains': HOST,
    'dom.securecontext.allowlist': HOST,
  },
});
try {
  assert((await ff.installAddon(EXT)) === ID, `Firefox ${version} installs the add-on`);
  const handle = async () => { const r = await ff.send('WebDriver:GetWindowHandle'); return typeof r === 'string' ? r : r.value; };
  const site = await handle();
  const state = async () => {
    await ff.send('WebDriver:SwitchToWindow', { handle: site, focus: true });
    await ff.navigate(`${SITE}/check`);
    return ff.run(() => document.title);
  };

  // The site really erases its data when it is visited as usual.
  await ff.navigate(`${SITE}/set`);
  assert((await state()) === 'session=1 kept', 'the site has a cookie and stored data');
  await ff.navigate(`${SITE}/board`);
  assert((await state()) === '- -', 'a visit to the site lets it erase its cookie and its data (Clear-Site-Data applies)');
  await ff.navigate(`${SITE}/set`);
  assert((await state()) === 'session=1 kept', 'the site has a cookie and stored data again');

  // Access to sites, granted as the browser's prompt would at the first analysis.
  await ff.send('Marionette:SetContext', { value: 'chrome' });
  await ff.send('WebDriver:ExecuteScript', {
    script: `const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
      return ExtensionPermissions.add(arguments[0], { permissions: [], origins: ['http://*/*', 'https://*/*'] }, WebExtensionPolicy.getByID(arguments[0]).extension).then(() => true);`,
    args: [ID],
  });
  await ff.send('Marionette:SetContext', { value: 'content' });

  await ff.openTab(APP);
  const waitFor = async (sel, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (await ff.run((s) => !!document.querySelector(s), sel)) return true;
    throw new Error(`Timeout waiting for ${sel}`);
  };
  const click = (sel) => ff.run((s) => document.querySelector(s).click(), sel);
  await waitFor('[data-focus="analyze"]');
  await ff.run(async (base) => {
    const folder = await browser.bookmarks.create({ parentId: 'unfiled_____', title: 'Design' });
    for (const [title, url] of [['Design board', `${base}/board`], ['Old project', `${base}/project`], ['MDN Web Docs', 'https://developer.mozilla.org/']]) {
      await browser.bookmarks.create({ parentId: folder.id, title, url });
    }
  }, SITE);

  // Sites read and dead sites checked; the history stays off, so that no prompt opens.
  await click('[data-focus="more-options"]');
  await waitFor('#opt-read');
  for (const [id, on] of [['opt-read', true], ['opt-dead', true], ['opt-history', false]]) {
    if ((await ff.run((x) => document.getElementById(x).checked, id)) !== on) await click(`#${id}`);
  }
  const mark = seen.length;
  await click('[data-focus="analyze"]');
  await waitFor('.actionbar [data-focus="apply"], [role="alert"]', 600000);
  assert(!(await ff.run(() => !!document.querySelector('.center[role="alert"]'))), 'the analysis reads the sites');
  const asked = seen.slice(mark);
  console.log('requests of the analysis:', JSON.stringify(asked));
  assert(['/board', '/project'].every((p) => asked.some((s) => s.path === p)) && asked.every((s) => s.cookie === ''), `Nidomark requested both pages, without cookies (${asked.length} requests)`);
  assert((await state()) === 'session=1 kept', 'the site could not erase its cookie nor its data in answer to Nidomark');
  console.log('FIREFOX SITES E2E OK');
} finally {
  await ff.close();
  server.close();
}
