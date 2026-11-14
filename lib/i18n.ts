import { browser } from 'wxt/browser';
import type { RootKind } from './snapshot';

/** Translated message; "{1}", "{2}"… are replaced by the substitutions. */
export function t(key: string, ...subs: (string | number)[]): string {
  const msg = browser.i18n.getMessage(key as Parameters<typeof browser.i18n.getMessage>[0]) || key;
  return msg.replace(/\{(\d)\}/g, (_, n: string) => String(subs[Number(n) - 1] ?? ''));
}

/**
 * Name of a root folder as the browser shows it: its own title when it names its roots in its own language (Firefox,
 * Opera), else Chrome's words in the interface's language.
 */
export function rootFolderName(kind: RootKind, liveTitle: string, live = false): string {
  if (live && liveTitle) return liveTitle;
  const own = kind === 'bar' ? t('barFolder') : kind === 'other' ? t('otherFolder') : '';
  return own || liveTitle;
}

/** Text direction of the messages shown: right to left for Arabic (and Hebrew, Persian, Urdu if they come). */
export function uiDirection(): 'ltr' | 'rtl' {
  return /^(ar|he|fa|ur)\b/i.test(uiLanguage()) ? 'rtl' : 'ltr';
}

export function uiLanguage(): string {
  // Language of the message file actually in use, so that folder names always match the interface.
  return browser.i18n.getMessage('lang' as Parameters<typeof browser.i18n.getMessage>[0]) || browser.i18n.getUILanguage();
}
