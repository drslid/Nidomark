// End-to-end test of the browsers whose bookmarks are laid out differently from Chrome's: Vivaldi shows its bar from
// a folder inside its "Bookmarks" root and keeps Speed Dials and a trash among the bookmarks; Opera has roots of its
// own for unsorted bookmarks, "Other bookmarks", its Speed Dial, Pinboards and trash. Sorts a collection put where
// these browsers file bookmarks, checks that their own folders are left as they were, then undoes the sort.
// Works with Chrome, Edge and Brave too (Chrome's layout).
// Usage: pnpm build && CHROME_PATH=/path/to/vivaldi-bin node tests/e2e/chromium/roots.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { corpus } from '../../fixtures/corpus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXT = path.join(ROOT, '.output', 'chrome-mv3');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nidomark-roots-'));
const BACKUP = /^Nidomark (– sauvegarde du|backup –) /;

const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  console.log(`✓ ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  enableExtensions: [EXT],
  userDataDir: profile,
  args: ['--no-first-run', '--disable-gpu', '--lang=en'],
  pipe: true,
  protocolTimeout: 120000,
});

try {
  console.log(await browser.version());
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
  const sw = await swTarget.worker();
  const extId = new URL(swTarget.url()).host;
  for (let i = 0; i < 50 && !(await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.bookmarks)); i++) await sleep(200);
  // Vivaldi adds its default bookmarks and Speed Dials a moment after starting.
  await sleep(4000);

  // Where this browser keeps things, read from its own API: what the test expects Nidomark to do.
  const layout = await sw.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const all = [];
    const walk = (n) => { all.push(n); (n.children ?? []).forEach(walk); };
    walk(root);
    if (typeof chrome.bookmarks.getRootByName === 'function') {
      const id = (name) => new Promise((res) => chrome.bookmarks.getRootByName(name, (n) => { void chrome.runtime.lastError; res(n?.id); }));
      const [bar, unsorted, other, imported, speedDial, trash] = await Promise.all(['bookmarks_bar', 'unsorted', 'user_root', 'other', 'speed_dial', 'trash'].map(id));
      const sortable = [bar, unsorted, imported, other];
      return {
        browser: 'opera', bar, main: unsorted, other, trash, sortable,
        kept: root.children.map((n) => n.id).filter((x) => !sortable.includes(x)),
        names: [unsorted, imported, other].map((x) => all.find((n) => n.id === x)?.title),
        hidden: root.children.filter((n) => !sortable.includes(n.id)).map((n) => n.title),
        more: [[imported, 'MDN Web Docs', 'https://developer.mozilla.org/'], [other, 'Wikipédia', 'https://fr.wikipedia.org/']],
      };
    }
    const flagged = all.find((n) => n.bookmarkbar === true);
    if (flagged) {
      const trash = all.find((n) => n.trash === true);
      const dials = all.filter((n) => n.speeddial === true);
      return { browser: 'vivaldi', bar: flagged.id, barParent: flagged.parentId, main: '1', other: '2', trash: trash?.id, sortable: [flagged.id, '1', '2'], kept: [trash?.id, ...dials.map((n) => n.id)].filter(Boolean), names: [all.find((n) => n.id === '1')?.title], hidden: [trash?.title, ...dials.map((n) => n.title)] };
    }
    return { browser: 'chrome', bar: '1', main: '2', other: '2', sortable: ['1', '2'], kept: [], names: [], hidden: [] };
  });
  console.log('layout:', JSON.stringify(layout));

  // The collection goes where the browser files bookmarks: the visible bar, then Opera's Unsorted bookmarks or
  // Vivaldi's Bookmarks. A copy of a sorted bookmark waits in the trash.
  await sw.evaluate(async (items, l) => {
    const folders = { Barre: l.bar, Autres: l.main };
    for (const [key, parent, title] of [['Barre/Outils', 'Barre', 'Outils'], ['Autres/Domotique', 'Autres', 'Domotique'], ['Autres/Recettes', 'Autres', 'Recettes'], ['Autres/À lire', 'Autres', 'À lire'], ['Autres/Divers', 'Autres', 'Divers'], ['Autres/Mariage 2025', 'Autres', 'Mariage 2025']]) {
      folders[key] = (await chrome.bookmarks.create({ parentId: folders[parent], title })).id;
    }
    for (const b of items) await chrome.bookmarks.create({ parentId: folders[b.folder], title: b.title, url: b.url });
    for (const [parentId, title, url] of l.more ?? []) await chrome.bookmarks.create({ parentId, title, url });
    if (l.trash) await chrome.bookmarks.create({ parentId: l.trash, title: 'Le Monde (deleted)', url: 'https://www.lemonde.fr/' });
  }, corpus.map(({ folder, title, url }) => ({ folder, title, url })), layout);

  const snapshot = () => sw.evaluate(async () => {
    const out = [];
    const walk = (n) => { out.push([n.id, n.parentId, n.index, n.title, n.url ?? '', n.dateAdded]); (n.children ?? []).forEach(walk); };
    (await chrome.bookmarks.getTree()).forEach(walk);
    return JSON.stringify(out.sort((a, b) => a[0].localeCompare(b[0])));
  });
  const subtree = (ids) => sw.evaluate(async (list) => {
    const out = [];
    for (const id of list) {
      const walk = (n) => { out.push([n.id, n.parentId, n.index, n.title, n.url ?? '']); (n.children ?? []).forEach(walk); };
      (await chrome.bookmarks.getSubTree(id)).forEach(walk);
    }
    return JSON.stringify(out);
  }, ids);
  // Bookmarks Nidomark should sort: everything in the sortable roots, the browser's own folders aside.
  const expected = await sw.evaluate(async (l) => {
    let n = 0;
    const walk = (node) => {
      if (l.kept.includes(node.id)) return;
      if (node.url !== undefined) n++;
      (node.children ?? []).forEach(walk);
    };
    for (const id of l.sortable) for (const c of await chrome.bookmarks.getChildren(id)) if (!(id === l.main && c.id === l.bar)) walk((await chrome.bookmarks.getSubTree(c.id))[0]);
    return n;
  }, layout);
  const before = await snapshot();
  const keptBefore = await subtree(layout.kept);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`chrome-extension://${extId}/app.html`);
  await page.waitForSelector('[data-focus="analyze"]');
  const label = await page.$eval('[data-focus="analyze"]', (b) => b.textContent);
  assert(Number(label.replace(/\D/g, '')) === expected, `every bookmark to sort is counted, the browser's own folders aside (${label}, expected ${expected})`);
  await page.click('[data-focus="more-options"]');
  await page.waitForSelector('#opt-read');
  for (const id of ['opt-read', 'opt-dead', 'opt-history']) if (await page.$eval(`#${id}`, (e) => e.checked)) await page.click(`#${id}`);
  const picker = await page.$$eval('.scope .row-title', (els) => els.map((e) => e.textContent ?? ''));
  console.log('folders offered:', JSON.stringify(picker));
  assert(layout.names.every((x) => picker.includes(x)), `the browser's own roots are offered under its names (${layout.names})`);
  assert(!layout.hidden.some((x) => picker.includes(x)), `its Speed Dials, Pinboards and trash are not (${layout.hidden})`);
  if (layout.browser === 'vivaldi') {
    // The bar is a root inside Bookmarks: leaving Bookmarks out keeps the bar's own choice, and so does taking it back.
    const checked = (id) => page.$eval(`[data-focus="scope-${id}"]`, (e) => e.checked);
    const toggle = async (id, want) => {
      await page.click(`[data-focus="scope-${id}"]`);
      await page.waitForFunction((x, w) => document.querySelector(`[data-focus="scope-${x}"]`)?.checked === w, {}, id, want);
    };
    await toggle(layout.main, false);
    const barKept = await checked(layout.bar);
    await toggle(layout.main, true);
    assert(barKept && (await checked(layout.bar)), 'leaving Bookmarks out of the sort, or taking it back, keeps the bar chosen');
    const relabel = await page.$eval('[data-focus="analyze"]', (b) => b.textContent);
    assert(relabel === label, `the whole collection is chosen again (${relabel})`);
  }

  await page.click('[data-focus="analyze"]');
  await page.waitForSelector('.actionbar [data-focus="apply"], [role="alert"]', { timeout: 600000 });
  if (await page.$('.center[role="alert"]')) throw new Error(`analysis failed: ${await page.$eval('.center[role="alert"]', (e) => e.textContent)}`);
  await page.click('.actionbar [data-focus="apply"]');
  await page.waitForSelector('[data-focus="undo"]', { timeout: 120000 });

  assert((await subtree(layout.kept)) === keptBefore, 'Speed Dials, Pinboards and trash are exactly as they were');
  const state = await sw.evaluate(async (l) => {
    const [root] = await chrome.bookmarks.getTree();
    const all = [];
    const backup = (title) => /^Nidomark (– sauvegarde du|backup –) /.test(title);
    const walk = (n, inBackup) => { all.push({ ...n, inBackup }); (n.children ?? []).forEach((c) => walk(c, inBackup || backup(n.title))); };
    walk(root, false);
    const bar = all.find((n) => n.id === l.bar);
    return {
      barParent: bar?.parentId,
      barFlag: bar?.bookmarkbar,
      barItems: bar?.children?.length ?? 0,
      otherTitles: (await chrome.bookmarks.getChildren(l.other)).map((n) => n.title),
      left: (await Promise.all(l.sortable.filter((id) => id !== l.bar && id !== l.other).map((id) => chrome.bookmarks.getChildren(id)))).flat().filter((n) => n.id !== l.bar && !l.kept.includes(n.id) && !backup(n.title)).length,
      liveLeMonde: all.some((n) => n.url === 'https://www.lemonde.fr/' && !n.inBackup && n.parentId !== l.trash),
    };
  }, layout);
  console.log('after:', JSON.stringify(state));
  assert(state.otherTitles.some((x) => BACKUP.test(x)), "the previous tree is kept in the browser's Other bookmarks");
  assert(state.barItems > 0, 'the new tree starts in the bar the browser shows');
  if (layout.browser === 'vivaldi') assert(state.barParent === layout.barParent && state.barFlag === true, 'Vivaldi’s bar folder stays where it is, still shown as the bar');
  if (layout.browser !== 'chrome') assert(state.left === 0, 'Unsorted and Imported bookmarks (Opera), Bookmarks (Vivaldi): everything is sorted');
  if (layout.trash) assert(state.liveLeMonde, 'a copy in the trash is no reason to leave a bookmark out');

  // The done screen has its "Finish" button already: wait for the undo button to go once the undo is done.
  await page.click('[data-focus="undo"]');
  await page.waitForFunction(() => !document.querySelector('[data-focus="undo"]') && !!document.querySelector('[data-focus="again"]'), { timeout: 120000 });
  // Vivaldi moves what an extension removes to its trash: the copies the undo removes wait there.
  const split = (json) => {
    const rows = JSON.parse(json);
    const parent = new Map(rows.map((n) => [n[0], n[1]]));
    const inTrash = (id) => { for (let x = parent.get(id); x; x = parent.get(x)) if (x === layout.trash) return true; return false; };
    return { tree: JSON.stringify(rows.filter((n) => !inTrash(n[0]))), trash: rows.filter((n) => inTrash(n[0])) };
  };
  const [was, now] = [split(before), split(await snapshot())];
  if (now.tree !== was.tree) {
    const [x, y] = [JSON.parse(was.tree), JSON.parse(now.tree)].map((l) => new Map(l.map((n) => [n[0], JSON.stringify(n)])));
    for (const id of new Set([...x.keys(), ...y.keys()])) if (x.get(id) !== y.get(id)) console.log('  before', x.get(id) ?? '-', '\n  after ', y.get(id) ?? '-');
  }
  assert(now.tree === was.tree, 'undo restores exactly the same tree: same bookmarks, ids, positions and dates');
  const ids = new Set(JSON.parse(before).map((n) => n[0]));
  const added = now.trash.filter((n) => !ids.has(n[0]));
  // Positions in the trash shift as it fills: compare what is there.
  const same = (m, n) => JSON.stringify(m.filter((_, i) => i !== 2)) === JSON.stringify(n.filter((_, i) => i !== 2));
  assert(was.trash.every((n) => now.trash.some((m) => same(m, n))) && now.trash.length === was.trash.length + added.length, `the trash only gains the copies the undo removed (${added.length})`);
  assert(errors.length === 0, `no page error (${errors.join(' | ')})`);
  console.log('ROOTS E2E OK');
} finally {
  await browser.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
