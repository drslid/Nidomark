// Renders the store images into docs/store: the promotional tiles (440×280 for the Chrome Web Store and Edge Add-ons,
// 1400×560 for their large slot) in English and French, and the screenshots at the size Opera's store prefers
// (800×500, from the 1280×800 screenshots written by `pnpm e2e`).
// Usage: node scripts/make-store-images.mjs   (CHROME_PATH=/path/to/chrome)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'store');
const font = fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'GoogleSans-latin.woff2')).toString('base64');

// Material Symbols "folder", as in lib/ui/icons.ts, and the mark of docs/assets/logo.svg.
const FOLDER = 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h207q16 0 30.5 6t25.5 17l57 57h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z';
const MARK = `<svg viewBox="0 0 160 160" width="100%" height="100%" aria-hidden="true">
  <rect x="3" y="3" width="154" height="154" rx="32" fill="#ffffff"/>
  <path d="M49.6 32H110.4V131.2L80 105.6L49.6 131.2Z" fill="#0f766e"/>
  <path d="M126.4 12.8L132.2 27.8L147.2 33.6L132.2 39.4L126.4 54.4L120.6 39.4L105.6 33.6L120.6 27.8Z" fill="#f59e0b"/>
</svg>`;

const TEXT = {
  en: { source: 'Your bookmarks', count: '470 bookmarks', tagline: 'Every bookmark in a clear folder, sorted by a small AI that never leaves your computer.', folders: ['Home', 'Tech', 'Leisure', 'News'] },
  fr: { source: 'Vos favoris', count: '470 favoris', tagline: 'Chaque favori dans un dossier clair, rangé par une petite IA qui ne quitte pas votre ordinateur.', folders: ['Maison', 'Tech', 'Loisirs', 'Actualités'] },
};
const COUNTS = [214, 167, 58, 31];

/**
 * A miniature of the review screen on Nidomark's teal: "your bookmarks" on the left, wires as thick as what they
 * carry, the folders they fill on the right. The tile adds the mark and the name; the large one, the promise.
 */
function page(kind, lang) {
  const t = TEXT[lang];
  const wide = kind === 'marquee';
  // Base coordinates: 440×280 for the tile, 700×280 for the large one (rendered at twice the size).
  const W = wide ? 700 : 440;
  const card = wide ? { x: 348, w: 124 } : { x: 24, w: 128 };
  const chip = wide ? { x: 528, w: 148 } : { x: 252, w: 164 };
  const top = wide ? 52 : 76;
  const chips = COUNTS.map((n, i) => ({ n, name: t.folders[i], y: top + i * 46 }));
  const cy = top + (chips.length * 46 - 8) / 2;
  const x0 = card.x + card.w;
  const wires = chips.map((c) => {
    const y1 = c.y + 19;
    const dx = (chip.x - x0) * 0.55;
    return `<path d="M${x0} ${cy} C${x0 + dx} ${cy}, ${chip.x - dx} ${y1}, ${chip.x} ${y1}" stroke-width="${(1.2 + Math.sqrt(c.n) * 0.4).toFixed(1)}"/>`;
  }).join('');
  const rings = [[x0, cy], ...chips.map((c) => [chip.x, c.y + 19])].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2"/>`).join('');
  const brand = wide
    ? `<div class="brand wide"><div class="mark">${MARK}</div><div class="word"><span>nido</span><span class="mk">mark</span></div></div>
       <p class="tagline">${t.tagline}</p>`
    : `<div class="brand"><div class="mark">${MARK}</div><div class="word"><span>nido</span><span class="mk">mark</span></div></div>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Google Sans'; font-weight: 400 700; src: url(data:font/woff2;base64,${font}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W * (wide ? 2 : 1)}px; height: ${280 * (wide ? 2 : 1)}px; overflow: hidden; background: #0f766e; }
  .tile { position: relative; width: ${W}px; height: 280px; transform: scale(${wide ? 2 : 1}); transform-origin: 0 0;
    font-family: 'Google Sans', sans-serif; color: #ffffff; -webkit-font-smoothing: antialiased; }
  .brand { position: absolute; left: 24px; top: 22px; display: flex; align-items: center; gap: 10px; }
  .brand .mark { width: 34px; height: 34px; }
  .brand .word { font-size: 27px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  .brand.wide { left: 40px; top: 70px; gap: 14px; }
  .brand.wide .mark { width: 48px; height: 48px; }
  .brand.wide .word { font-size: 40px; }
  .mk { color: #9ef2e6; }
  .tagline { position: absolute; left: 40px; top: 140px; width: 268px; font-size: 17px; line-height: 1.45; color: #d9f7f2; text-wrap: balance; }
  svg.wires { position: absolute; inset: 0; overflow: visible; }
  svg.wires path { fill: none; stroke: #9ef2e6; stroke-opacity: 0.6; stroke-linecap: round; }
  svg.wires circle { fill: #0f766e; stroke: #ffffff; stroke-width: 1.5; }
  .card { position: absolute; left: ${card.x}px; top: ${cy - 40}px; width: ${card.w}px; height: 80px; background: #ffffff; color: #191c1c;
    border-radius: 14px; padding: 12px 12px 0; box-shadow: 0 6px 18px rgb(0 32 29 / 0.28); }
  .card b { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; }
  .card small { display: block; font-size: 11px; color: #3f4948; margin-top: 2px; }
  .letters { display: flex; margin-top: 8px; }
  .letters i { width: 20px; height: 20px; border-radius: 50%; background: #cce8e3; color: #00504a; border: 2px solid #ffffff;
    font: 600 10px/16px 'Google Sans', sans-serif; text-align: center; font-style: normal; margin-inline-end: -6px; }
  .chip { position: absolute; left: ${chip.x}px; width: ${chip.w}px; height: 38px; background: #ffffff; color: #191c1c; border-radius: 12px;
    display: flex; align-items: center; gap: 9px; padding: 0 12px 0 6px; box-shadow: 0 4px 12px rgb(0 32 29 / 0.22); }
  .chip .ic { width: 26px; height: 26px; border-radius: 8px; background: #9ef2e6; display: grid; place-items: center; flex: none; }
  .chip .ic svg { width: 16px; height: 16px; fill: #00504a; }
  .chip span { font-size: 13.5px; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip em { font-style: normal; font-size: 12px; color: #3f4948; font-variant-numeric: tabular-nums; }
  </style></head><body><div class="tile">
  ${brand}
  <svg class="wires" viewBox="0 0 ${W} 280" width="${W}" height="280">${wires}${rings}</svg>
  <div class="card"><b>${t.source}</b><small>${t.count}</small><div class="letters"><i>G</i><i>W</i><i>M</i><i>S</i></div></div>
  ${chips.map((c) => `<div class="chip" style="top:${c.y}px"><div class="ic"><svg viewBox="0 -960 960 960"><path d="${FOLDER}"/></svg></div><span>${c.name}</span><em>${c.n}</em></div>`).join('')}
  </div></body></html>`;
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-first-run', '--disable-gpu'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nidomark-store-'));
try {
  const tab = await browser.newPage();
  for (const lang of ['en', 'fr']) {
    for (const [kind, width, height] of [['promo', 440, 280], ['marquee', 1400, 560]]) {
      const file = path.join(tmp, `${kind}-${lang}.html`);
      fs.writeFileSync(file, page(kind, lang));
      await tab.setViewport({ width, height, deviceScaleFactor: 1 });
      await tab.goto(`file://${file}`);
      await tab.evaluate(() => document.fonts.ready);
      await tab.screenshot({ path: path.join(OUT, `${kind}-${width}x${height}-${lang}.png`) });
    }
  }
  // Opera prefers 612×408 and takes 800×600 at most: the screenshots, scaled down whole.
  fs.mkdirSync(path.join(OUT, 'opera'), { recursive: true });
  await tab.setViewport({ width: 800, height: 500, deviceScaleFactor: 1 });
  for (const name of fs.readdirSync(OUT).filter((f) => /^store-.*\.png$/.test(f))) {
    const file = path.join(tmp, `${name}.html`);
    const data = fs.readFileSync(path.join(OUT, name)).toString('base64');
    fs.writeFileSync(file, `<!doctype html><style>*{margin:0}img{display:block;width:800px;height:500px}</style><img src="data:image/png;base64,${data}">`);
    await tab.goto(`file://${file}`);
    await tab.screenshot({ path: path.join(OUT, 'opera', name) });
  }
  console.log('store images written to docs/store');
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
