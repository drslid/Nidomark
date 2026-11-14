// Minimal Marionette client (Firefox's WebDriver classic protocol): enough to install a temporary add-on, open its
// pages and run scripts in them. WebDriver BiDi, which Puppeteer speaks, may not navigate to moz-extension:// pages;
// Marionette opens them from Firefox's own (chrome) context, which needs MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1.
// Protocol: https://firefox-source-docs.mozilla.org/testing/marionette/Protocol.html
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export async function launchFirefox({ executable, prefs = {}, headless = true }) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nido-ff-profile-'));
  const all = {
    'marionette.port': port, 'browser.shell.checkDefaultBrowser': false, 'browser.startup.homepage_override.mstone': 'ignore',
    'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.reportingpolicy.firstRun': false, 'browser.aboutwelcome.enabled': false,
    'app.update.disabledForTesting': true, 'network.proxy.type': 0, ...prefs,
  };
  fs.writeFileSync(path.join(profile, 'user.js'), Object.entries(all).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
  const proc = spawn(executable, [...(headless ? ['--headless'] : []), '--marionette', '--no-remote', '--profile', profile], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MOZ_CRASHREPORTER_DISABLE: '1', MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  let socket;
  for (let i = 0; i < 120 && !socket; i++) {
    socket = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1', () => resolve(s));
      s.on('error', () => resolve(undefined));
    });
    if (!socket) await new Promise((r) => setTimeout(r, 250));
  }
  if (!socket) throw new Error(`Marionette did not start: ${stderr.slice(-500)}`);
  let buf = Buffer.alloc(0);
  const waiting = new Map();
  let greeted;
  const greeting = new Promise((r) => { greeted = r; });
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const colon = buf.indexOf(':');
      if (colon < 0) return;
      const len = Number(buf.subarray(0, colon).toString());
      if (buf.length < colon + 1 + len) return;
      const msg = JSON.parse(buf.subarray(colon + 1, colon + 1 + len).toString());
      buf = buf.subarray(colon + 1 + len);
      if (!Array.isArray(msg)) { greeted(msg); continue; }
      const [, id, error, result] = msg;
      const w = waiting.get(id);
      waiting.delete(id);
      if (error) w?.reject(new Error(`${error.error}: ${error.message}`)); else w?.resolve(result);
    }
  });
  await greeting;
  let seq = 0;
  const send = (name, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    const body = JSON.stringify([0, id, name, params]);
    socket.write(`${Buffer.byteLength(body)}:${body}`);
  });
  await send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
  return {
    send,
    /** Runs `fn(...args)` in the current page; a returned promise is awaited. */
    run: async (fn, ...args) => (await send('WebDriver:ExecuteScript', { script: `return (${fn}).apply(null, arguments);`, args })).value,
    navigate: (url) => send('WebDriver:Navigate', { url }),
    /** Opens an extension page in a new tab from Firefox's own (chrome) context, then works in that tab. */
    openTab: async (url) => {
      const handles = async () => { const r = await send('WebDriver:GetWindowHandles'); return Array.isArray(r) ? r : (r?.value ?? []); };
      const before = new Set(await handles());
      await send('Marionette:SetContext', { value: 'chrome' });
      await send('WebDriver:ExecuteScript', {
        script: `const win = Services.wm.getMostRecentWindow('navigator:browser');
          win.gBrowser.selectedTab = win.gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
        args: [url],
      });
      await send('Marionette:SetContext', { value: 'content' });
      let handle;
      for (let i = 0; i < 40 && !handle; i++) {
        const now = await handles();
        handle = now.find((h) => !before.has(h));
        if (!handle) await new Promise((r) => setTimeout(r, 250));
      }
      if (!handle) throw new Error('no new tab');
      await send('WebDriver:SwitchToWindow', { handle, focus: true });
      // The tab starts on about:blank: wait for the page itself, loaded.
      for (let i = 0; i < 80; i++) {
        const r = await send('WebDriver:GetCurrentURL').catch(() => null);
        const now = typeof r === 'string' ? r : r?.value;
        if (now === url) {
          const ready = await send('WebDriver:ExecuteScript', { script: 'return document.readyState', args: [] }).catch(() => null);
          if ((ready?.value ?? ready) === 'complete') return;
        }
        await new Promise((r2) => setTimeout(r2, 250));
      }
      throw new Error(`the page did not load: ${url}`);
    },
    installAddon: async (dir) => (await send('Addon:Install', { path: dir, temporary: true })).value,
    /** The visible part of the page, as a PNG. */
    screenshot: async () => {
      const r = await send('WebDriver:TakeScreenshot', { full: false, hash: false });
      return Buffer.from(typeof r === 'string' ? r : r.value, 'base64');
    },
    close: async () => {
      try { await send('Marionette:Quit', { flags: ['eForceQuit'] }); } catch { /* already gone */ }
      socket.destroy();
      proc.kill();
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}
