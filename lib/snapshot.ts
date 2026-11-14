import type { BookmarkItem, FolderItem, Snapshot } from './types';

/** Subset of a bookmarks tree node, common to Chrome and Firefox, with Vivaldi's own flags. */
export interface TreeNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  folderType?: string;
  /** "bookmark", "folder" or "separator" (Firefox). */
  type?: string;
  syncing?: boolean;
  unmodifiable?: string;
  /** Vivaldi: the folder its bookmark bar shows. */
  bookmarkbar?: boolean;
  /** Vivaldi: a Speed Dial folder, shown on its start page. */
  speeddial?: boolean;
  /** Vivaldi: its trash. */
  trash?: boolean;
  children?: TreeNode[];
}

/** What the bookmarks API says of the roots beyond Chrome's, when it says more (Opera's getRootByName). */
export interface RootHints {
  /** "Other bookmarks" when it is not Chrome's root of that kind (Opera's, whose Chrome root is "Imported bookmarks"). */
  otherId?: string;
  /** More roots to sort, in this order. */
  extraIds?: string[];
  /** The browser names its root folders itself, in its own language. */
  liveTitles?: boolean;
}

export type RootKind = 'bar' | 'other' | 'mobile' | 'extra';

/** Permanent folders: `folderType` (Chrome 134+), else the well-known ids of Chrome and Firefox. */
function permanentKind(node: TreeNode): RootKind | null {
  switch (node.folderType) {
    case 'bookmarks-bar': return 'bar';
    case 'other': return 'other';
    case 'mobile': return 'mobile';
  }
  switch (node.id) {
    case '1': case 'toolbar_____': return 'bar';
    case '2': case 'unfiled_____': return 'other';
    case '3': case 'mobile______': return 'mobile';
    // Firefox's Bookmarks Menu, where it files new bookmarks by default.
    case 'menu________': return 'extra';
  }
  return null;
}

/** What a root folder of the snapshot is. */
export function rootKindOf(snapshot: Snapshot, id: string | undefined): RootKind {
  return id === snapshot.barId ? 'bar' : id === snapshot.otherId ? 'other' : id === snapshot.mobileId ? 'mobile' : 'extra';
}

/** A folder kept by the browser for a feature of its own: Vivaldi's Speed Dials and trash. */
const isFeatureFolder = (node: TreeNode) => node.speeddial === true || node.trash === true;

/** Vivaldi shows in its bar a folder of the user's choice, "Bookmarks bar" inside its Bookmarks root by default. */
function flaggedBar(tops: TreeNode[]): TreeNode | undefined {
  // A root shown as the bar is Chrome's own layout.
  if (tops.some((top) => top.bookmarkbar === true)) return undefined;
  const search = (node: TreeNode): TreeNode | undefined => {
    for (const child of node.children ?? []) {
      if (child.url !== undefined || isFeatureFolder(child)) continue;
      if (child.bookmarkbar === true) return child;
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const top of tops) {
    const found = isFeatureFolder(top) ? undefined : search(top);
    if (found) return found;
  }
  return undefined;
}

/**
 * Folders that hold the bar Vivaldi shows or a Speed Dial (Vivaldi can make any folder one), at any depth below a
 * root: they stay where they are, with what they hold. Moved into the backup, they would take the feature with them.
 */
function holders(roots: TreeNode[], bar: TreeNode | undefined): Set<string> {
  const out = new Set<string>();
  const visit = (node: TreeNode, ancestors: string[]) => {
    for (const child of node.children ?? []) {
      if (child.url !== undefined) continue;
      if (isFeatureFolder(child) || child === bar) {
        for (const id of ancestors) out.add(id);
        continue;
      }
      visit(child, [...ancestors, child.id]);
    }
  };
  for (const root of roots) if (!isFeatureFolder(root)) visit(root, []);
  return out;
}

/**
 * The bookmarks Nidomark can sort, and where the browser keeps them. The roots of the browser's own features (Opera's
 * Speed Dial, Pinboards and trash, Vivaldi's Speed Dials and trash) are not read: neither sorted nor counted.
 */
export function buildSnapshot(tree: TreeNode[], takenAt = Date.now(), hints: RootHints = {}): Snapshot {
  const snapshot: Snapshot = { takenAt, bookmarks: new Map(), folders: new Map() };
  const root = tree[0];
  if (!root) return snapshot;
  const tops = root.children ?? [];
  const bar = flaggedBar(tops);
  const held = holders(bar ? [...tops, bar] : tops, bar);

  const walk = (node: TreeNode, path: string[], depth: number, inBar: boolean, isRoot: boolean, locked: boolean, parentId: string | undefined) => {
    // Before Chrome 134 managed bookmarks are only recognisable by `unmodifiable`; it applies to the whole subtree.
    const unmodifiable = locked || !!node.unmodifiable || node.folderType === 'managed' || held.has(node.id);
    const folder: FolderItem = {
      id: node.id, parentId: node.parentId ?? parentId, index: node.index, title: node.title, path, depth,
      folderType: node.folderType, isRoot, inBar, bookmarkIds: [], folderIds: [], syncing: node.syncing, unmodifiable,
    };
    snapshot.folders.set(node.id, folder);
    for (const child of node.children ?? []) {
      // A Firefox separator comes with the address "data:": it is neither a bookmark nor a folder.
      if (child.type === 'separator') {
        (folder.separators ??= []).push({ id: child.id, index: child.index ?? 0, url: child.url });
        continue;
      }
      // Vivaldi's bar is read as a root of its own, below.
      if (isFeatureFolder(child) || child === bar) continue;
      if (child.url !== undefined) {
        const b: BookmarkItem = {
          id: child.id, parentId: node.id, index: child.index ?? 0, title: child.title, url: child.url,
          dateAdded: child.dateAdded, syncing: child.syncing, folderPath: isRoot ? [] : [...path, node.title], inBar,
          unmodifiable: unmodifiable || !!child.unmodifiable,
        };
        snapshot.bookmarks.set(child.id, b);
        folder.bookmarkIds.push(child.id);
      } else {
        folder.folderIds.push(child.id);
        walk(child, isRoot ? [] : [...path, node.title], depth + 1, inBar, false, unmodifiable, node.id);
      }
    }
  };

  for (const top of tops) {
    let kind: RootKind | null = top.id === hints.otherId ? 'other' : hints.extraIds?.includes(top.id) ? 'extra' : permanentKind(top);
    // Opera's other "other bookmarks" is its Imported bookmarks; Vivaldi's root shown as "Bookmarks" holds its bar.
    if ((kind === 'other' && hints.otherId && top.id !== hints.otherId) || (kind === 'bar' && bar)) kind = 'extra';
    if (isFeatureFolder(top) || (!kind && !top.unmodifiable && top.folderType !== 'managed')) continue;
    if (kind === 'bar') snapshot.barId ??= top.id;
    if (kind === 'other') snapshot.otherId ??= top.id;
    if (kind === 'mobile') snapshot.mobileId ??= top.id;
    if (kind === 'extra') (snapshot.extraRootIds ??= []).push(top.id);
    walk(top, [], 0, kind === 'bar', true, false, root.id);
  }
  if (bar) {
    snapshot.barId = bar.id;
    walk(bar, [], 0, true, true, false, bar.parentId);
  }
  const order = hints.extraIds ?? [];
  snapshot.extraRootIds?.sort((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity));
  if (hints.liveTitles) snapshot.liveRootTitles = true;
  return snapshot;
}
