// End-to-end test in Firefox: installs the Firefox build as a temporary add-on, sorts the fictitious collection with
// the local model, applies the new tree, then undoes it and checks that the tree is exactly what it was. Firefox's own
// ways are part of it: the Bookmarks Menu, separators, and the root folders' names.
// Needs Firefox 142 or later: FIREFOX_PATH=/path/to/firefox pnpm e2e:firefox (after pnpm build:firefox).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from '../../fixtures/corpus.js';
import { launchFirefox } from './marionette.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXT = path.join(ROOT, '.output', 'firefox-mv3');
const SHOTS = process.env.SCREENSHOTS ?? path.join(ROOT, '.output', 'screenshots');
const FIREFOX = process.env.FIREFOX_PATH ?? 'firefox';
const ID = 'nidomark@drslid.github.io';
// The add-on's address in this test profile, chosen in advance so the test can open its page.
const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const APP = `moz-extension://${UUID}/app.html`;
fs.mkdirSync(SHOTS, { recursive: true });

const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  console.log(`✓ ${msg}`);
};
const version = Number(/(\d+)\./.exec(execFileSync(FIREFOX, ['--version']).toString())?.[1] ?? 0);
if (version < 142) throw new Error(`Firefox ${version} is too old: Nidomark needs Firefox 142 or later (set FIREFOX_PATH)`);

const ff = await launchFirefox({ executable: FIREFOX, prefs: { 'extensions.webextensions.uuids': JSON.stringify({ [ID]: UUID }), 'intl.locale.requested': 'en-US' } });
try {
  assert((await ff.installAddon(EXT)) === ID, `Firefox ${version} installs the add-on`);
  await ff.openTab(APP);
  await ff.send('WebDriver:SetWindowRect', { width: 1280, height: 800 });
  const waitFor = async (sel, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (await ff.run((s) => !!document.querySelector(s), sel)) return true;
    throw new Error(`Timeout waiting for ${sel}`);
  };
  const click = (sel) => ff.run((s) => document.querySelector(s).click(), sel);
  await waitFor('[data-focus="analyze"]');
  await ff.run(() => {
    window.__errors = [];
    window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));
  });

  // The collection of the other tests, plus what only Firefox has: a separator in the bar and the Bookmarks Menu.
  await ff.run(async (items) => {
    const folders = { Barre: 'toolbar_____', Autres: 'unfiled_____' };
    for (const [key, parentId, title] of [['Barre/Outils', 'toolbar_____', 'Outils'], ['Autres/Domotique', 'unfiled_____', 'Domotique'], ['Autres/Recettes', 'unfiled_____', 'Recettes'], ['Autres/À lire', 'unfiled_____', 'À lire'], ['Autres/Divers', 'unfiled_____', 'Divers'], ['Autres/Mariage 2025', 'unfiled_____', 'Mariage 2025']]) {
      folders[key] = (await browser.bookmarks.create({ parentId, title })).id;
    }
    for (const b of items) await browser.bookmarks.create({ parentId: folders[b.folder], title: b.title, url: b.url });
    await browser.bookmarks.create({ parentId: 'toolbar_____', type: 'separator', index: 1 });
    await browser.bookmarks.create({ parentId: 'menu________', type: 'separator' });
    await browser.bookmarks.create({ parentId: 'menu________', title: 'MDN Web Docs', url: 'https://developer.mozilla.org/fr/' });
  }, corpus.map(({ folder, title, url }) => ({ folder, title, url })));
  const tree = () => ff.run(async () => {
    const out = [];
    const walk = (n) => { out.push([n.id, n.parentId, n.index, n.title, n.url ?? '', n.dateAdded, n.type]); (n.children ?? []).forEach(walk); };
    (await browser.bookmarks.getTree()).forEach(walk);
    return JSON.stringify(out.sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  });
  const before = await tree();
  const children = (id) => ff.run(async (x) => (await browser.bookmarks.getChildren(x)).map((n) => ({ id: n.id, title: n.title, type: n.type, url: n.url })), id);

  // Analysis with the model, in Firefox.
  await click('[data-focus="more-options"]');
  await waitFor('.scope .row-title');
  const scope = await ff.run(() => [...document.querySelectorAll('.scope .row-title')].map((e) => e.textContent ?? '').join(' | '));
  assert(/Bookmarks Menu/.test(scope) && /Bookmarks Toolbar/.test(scope), 'the Bookmarks Menu is part of the sort, under Firefox’s own names');
  const t0 = Date.now();
  await click('[data-focus="analyze"]');
  await waitFor('.actionbar [data-focus="apply"], [role="alert"]', 600000);
  assert(!(await ff.run(() => !!document.querySelector('.center[role="alert"]'))), `the local model runs in Firefox (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await new Promise((r) => setTimeout(r, 900));
  const nodes = await ff.run(() => [...document.querySelectorAll('.dests .node-top')].map((n) => ({ key: n.dataset.key, name: n.querySelector('.name')?.textContent ?? '', count: Number(n.dataset.count) })));
  console.log('nodes:', JSON.stringify(nodes));
  const labels = await ff.run(() => [...document.querySelectorAll('.dests-label > span:first-child')].map((e) => e.textContent));
  assert(labels.includes('Bookmarks Toolbar') && labels.includes('Other Bookmarks'), `folders are shown under Firefox’s root folders (${labels})`);
  assert(nodes.some((n) => /^Home$/.test(n.name) && n.count >= 12) && nodes.some((n) => n.key === 'review'), 'the collection is sorted as in Chrome');
  const apply = await ff.run(() => document.querySelector('.actionbar [data-focus="apply"]').textContent);
  fs.writeFileSync(path.join(SHOTS, 'firefox-review-en.png'), await ff.screenshot());

  // Apply: the old tree, separators and Bookmarks Menu included, goes into the backup.
  await click('.actionbar [data-focus="apply"]');
  await waitFor('[data-focus="undo"]', 120000);
  const bar = await children('toolbar_____');
  assert(bar.length > 3 && bar.every((n) => n.type !== 'separator'), `the new bar starts with quick access and its folders, no separator left (${bar.length} items, ${apply.trim()})`);
  assert((await children('menu________')).length === 0, 'the Bookmarks Menu is sorted too');
  const other = await children('unfiled_____');
  const backup = other.find((n) => /^Nidomark/.test(n.title));
  const kept = backup ? (await children(backup.id)).map((n) => n.title) : [];
  assert(kept.includes('Bookmarks Toolbar') && kept.includes('Bookmarks Menu') && kept.includes('Other Bookmarks'), `the backup keeps each root folder as it was (${kept})`);
  fs.writeFileSync(path.join(SHOTS, 'firefox-done-en.png'), await ff.screenshot());

  // Undo: exactly the same tree as before, ids, positions, dates and separators included.
  await click('[data-focus="undo"]');
  await waitFor('[data-focus="again"]', 120000);
  assert((await tree()) === before, 'undo restores exactly the same tree, separators included');
  const errors = await ff.run(() => window.__errors);
  assert(errors.length === 0, `no error in the page (${errors.join(' | ')})`);
  console.log('FIREFOX E2E OK');
} finally {
  await ff.close();
}
