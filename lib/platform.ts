import { browser } from 'wxt/browser';
import { type RootHints, type TreeNode, buildSnapshot } from './snapshot';
import type { Snapshot } from './types';

/**
 * What differs between the browsers Nidomark runs in. Everything else is the same code, built once per browser by
 * WXT (`pnpm build` for Chrome, Edge, Opera, Brave and Vivaldi; `pnpm build:firefox` for Firefox). The manifest
 * differences (permissions, Firefox's add-on id) live in wxt.config.ts, and Vivaldi's bar and Speed Dials, told by
 * flags of its bookmarks API, in snapshot.ts.
 */

/** The build targets Firefox. */
export const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

/** Chrome lets extension pages read its favicon cache (the "favicon" permission); Firefox has no such cache. */
export const HAS_FAVICON_CACHE = !IS_FIREFOX;

/** Id of the session rule installed by guardSiteData. */
const SITE_DATA_RULE = 1;

/**
 * A site can ask the browser to erase its cookies and storage with the Clear-Site-Data header. Chromium browsers refuse
 * when the request carries no cookies, as Nidomark's do; Chrome says so in the console ("The request's credentials
 * mode prohibits modifying cookies and other local data"). Firefox obeys, which would sign you out of a site Nidomark
 * only checked, so in Firefox the answers to Nidomark's own requests lose that header before Firefox reads it.
 */
export async function guardSiteData(): Promise<void> {
  if (!IS_FIREFOX) return;
  const initiator = new URL(browser.runtime.getURL('/')).host;
  const rule = {
    id: SITE_DATA_RULE,
    priority: 1,
    action: { type: 'modifyHeaders', responseHeaders: [{ header: 'clear-site-data', operation: 'remove' }] },
    condition: { initiatorDomains: [initiator], resourceTypes: ['xmlhttprequest'] },
  };
  type Rules = Parameters<typeof browser.declarativeNetRequest.updateSessionRules>[0];
  await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [SITE_DATA_RULE], addRules: [rule] } as unknown as Rules);
}

type GetRootByName = (name: string, callback: (node?: { id: string }) => void) => void;

/**
 * Opera names its roots in its bookmarks API (help.opera.com/en/extensions/getrootbyname/): "Other bookmarks" is a
 * root of its own, new bookmarks go to "Unsorted bookmarks", and Chrome's other root is its "Imported bookmarks".
 * Its Speed Dial, Pinboards and trash are roots too; buildSnapshot leaves out every root it is not told about.
 */
async function rootHints(): Promise<RootHints> {
  // Firefox names its roots in its own language ("Barre personnelle"); Chrome's API does not translate them.
  if (IS_FIREFOX) return { liveTitles: true };
  const getRootByName = (browser.bookmarks as unknown as { getRootByName?: GetRootByName }).getRootByName;
  if (typeof getRootByName !== 'function') return {};
  const rootId = (name: string) =>
    new Promise<string | undefined>((resolve) => {
      try {
        getRootByName.call(browser.bookmarks, name, (node) => {
          void browser.runtime.lastError;
          resolve(node?.id);
        });
      } catch {
        resolve(undefined);
      }
    });
  const [other, unsorted, imported] = await Promise.all(['user_root', 'unsorted', 'other'].map(rootId));
  if (!other) return {};
  return { otherId: other, extraIds: [unsorted, imported].filter((id): id is string => !!id), liveTitles: true };
}

/** The bookmarks as they are now, with what this browser says of its roots. */
export async function readSnapshot(): Promise<Snapshot> {
  const [tree, hints] = await Promise.all([browser.bookmarks.getTree(), rootHints()]);
  return buildSnapshot(tree as TreeNode[], Date.now(), hints);
}
