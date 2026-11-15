# Development

## Requirements

- Node.js 22 or later and pnpm (`corepack enable` installs the version pinned in `package.json`).
- A browser to load the extension: Chrome 116 or later, Edge, Brave, Opera or Vivaldi; Firefox 142 or later.

## First build

```bash
pnpm install
pnpm fetch-model
pnpm build           # Chrome, Edge, Brave, Opera, Vivaldi
pnpm build:firefox   # Firefox
```

`pnpm fetch-model` downloads `Xenova/multilingual-e5-small` at a pinned revision and checks the SHA-256 (large files) and git blob hashes (small files) published by Hugging Face. It then cuts the model and its tokenizer into parts of 40 MB at most (see [Browsers](#browsers)), and copies the ONNX Runtime WebAssembly files from `node_modules` into `public/ort`. These files are not committed: the model is larger than GitHub's 100 MB file limit. `package.json` pins `onnxruntime-web` to a release (1.31.1) instead of the development build Transformers.js asks for, because Firefox's add-on store accepts released libraries only. The worker bundles ONNX Runtime's build without an embedded copy of that glue (export condition `onnxruntime-web-use-extern-wasm`, in `wxt.config.ts`): the glue is loaded from `/ort/`.

Load `.output/chrome-mv3` from the extensions page (`chrome://extensions`, `edge://extensions`…) → **Developer mode** → **Load unpacked**, and `.output/firefox-mv3` from `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** (its `manifest.json`). After a rebuild, reload the extension.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev`, `pnpm dev:firefox` | Development build with hot reload in a new Chrome or Firefox window |
| `pnpm check` | Type check and unit tests |
| `pnpm build`, `pnpm build:firefox` | Production build in `.output/chrome-mv3` (Chrome, Edge, Brave, Opera, Vivaldi) or `.output/firefox-mv3` |
| `pnpm zip`, `pnpm zip:firefox`, `pnpm zip:all` | Packages for the stores; the Firefox one comes with the sources archive its reviewers rebuild it from ([REVIEWERS.md](REVIEWERS.md)) |
| `pnpm e2e` | End-to-end tests in Chrome: real analysis, review and editing, rebuild, second sort, undo; site reading and Analyze again against a local server; the interface in Arabic (right to left), Japanese, Hindi and German; the root folders of each browser (`roots.mjs`). `CHROME_PATH` runs them in Edge, Brave, Opera or Vivaldi, `E2E_LANGS=ar,ja` chooses languages |
| `pnpm e2e:firefox` | End-to-end tests in Firefox 142 or later (`FIREFOX_PATH=/path/to/firefox`): analysis, apply with the Bookmarks Menu and separators, undo; and a site answering with Clear-Site-Data, which must not erase its data |
| `pnpm eval` | Prints how the classifier files the fictitious collection (`--detail` lists the differences with the reference) |
| `pnpm eval:big` | Sorts the large messy collection (440 bookmarks) and measures what a user sees: bookmarks under their subject, places per subject, folders twice under one parent (`--tree` prints the tree, `--wrong` the misfiled bookmarks); computes its missing vectors with the model |
| `pnpm fixtures` | Recomputes the test vectors with the packaged model, after changing how texts are built |
| `pnpm examples` | Recomputes the vectors of the category examples (`lib/data/examples.ts`) |
| `pnpm icons` | Regenerates the icons from `scripts/make-icons.mjs`, and the 300×300 logo for Edge Add-ons |
| `pnpm store-images` | Renders the promotional tiles (440×280, 1400×560) and Opera's 800×500 screenshots into `docs/store` |

`scripts/eval-grid.ts` (grid search of the categorizer options) helps tuning; run it with `pnpm exec jiti scripts/eval-grid.ts`. `pnpm eval --pages --detail` prints where each bookmark goes and why.

## How a proposal is built

1. **Scope** (`lib/categorize.ts`, `scopeCandidates`): every bookmark inside the chosen folders, the whole tree by default, the shortcuts of the bookmarks bar included. Root folders and the folders right inside them can be chosen or left out (`pruneScope`). Nidomark's backup folders and managed bookmarks are never sorted. Only web pages are embedded; other links (bookmarklets, browser pages) are filed apart. **Duplicates** (`lib/duplicates.ts`) are copies of the same page (scheme, `www.`, trailing slash and tracking parameters ignored, fragment kept); a copy outside the sort is always kept, otherwise the copy with the most telling title.
2. **Features** for each bookmark (`lib/features.ts`): host, port, path words, private or remote-access host, known self-hosted application, vague title, cleaned title and use signals. With the optional history permission, a vague title is replaced by the real page title stored by the browser, and the visits of each site (host and port, typed visits counting twice) are summed for quick access.
3. **Embeddings** (`lib/pipeline.ts`, `lib/embed.worker.ts`): the bookmarks to sort, the usage descriptions, the category descriptions and the folder names. The typical bookmarks of each category (`lib/data/examples.ts`) are embedded in advance (`lib/data/example-vectors.ts`). Vectors are cached in IndexedDB.
4. **Rules first** (`lib/taxonomy.ts`): an address only reachable at home, a dead site (when sites are checked), adult content (known site, address, explicit title, rating meta tag), the user's earlier corrections (by address, then by site), more than 1,000 known sites and hosts, typical addresses (`.gouv.fr`, regional banks, school portals, webmail), and pages about self-hosted applications.
5. **The model** for the rest: the nearest labelled bookmarks (the built-in examples and the bookmarks of this collection recognised by a rule) vote, weighted by their closeness; the similarity to the category description and the keywords found add to it. A category is chosen when it leads the second by a margin; otherwise the bookmark is "unclear". When the leading category is at least part of the way there (`guessMin`) and the title is not vague, it is kept as a suggestion for the bookmark to check.
6. **Pages** (`lib/site.ts`): when allowed, unclear bookmarks are read (16 at a time, 2 per site, no cookies, 128 KB at most) and scored again on the page text; every bookmark can also be checked for dead sites (16 KB). 404 and 410 mean removed, parking pages and default server pages mean abandoned; bot checks (403 or 503 with a challenge) and maintenance pages mean alive. Failures are retried once; if nearly everything fails the computer is considered offline and nothing is reported dead. Then every bookmark still to check is tested: read if it was not, and when its page says too little (under 40 characters), the home page of its site is read and merged with it.
7. **New tree** (`categorize`, layout section): every bookmark gets a place; nothing stays where it was.
   - **Quick access:** the most visited sites (one icon per site, its shortest address), else the shortcuts of the bar, at the start of the bookmarks bar; bookmarklets of the bar stay there. Only when the bar itself is sorted.
   - **Groups and categories:** a folder per group, the most used first, with a subfolder per category from two bookmarks (streaming, adult content and dead sites always get one), or a folder named after the category when it is the only one of its group. The user's names are reused, including the names given to folders of an earlier sort (kept in `knownFolders`).
   - **Third level:** a category of 10 bookmarks or more is split by site or by title word, from 4 bookmarks, 6 subfolders at most.
   - **The user's folders:** recognised by name (categories, groups, catch-alls, folders organised by use such as "Read later"); a folder whose bookmarks belong together ("Wedding 2025") is recreated with its subfolders, under the category or group holding 60 % of it, else in "My folders".
   - **Out of the bar:** adult content, dead sites, "To check" and browser links go to Other bookmarks.
   - **Folders of earlier sorts** left out of a partial sort take what belongs to them (`existingId`): nothing is created again, and a category they lack becomes a new subfolder of its group.
   - **Suggestions:** every bookmark to check gets up to three categories, the model's lean first; a page still unclear follows the other bookmarks of its site when at least two of them agree.
8. **Review** (`lib/plan.ts`, `newTree`; `lib/edit.ts`): the user's decisions (moves, names, folders moved, made or deleted, display per folder, bookmarks removed) are applied to the proposal as one tree, used both by the screen and by the plan. A loop made by moving a folder below itself is cut. **Analyze again** (`reanalyze` in `lib/analyze.ts`) runs the classifier once more with the corrections of the review as learned choices and the pages not read yet, then `mergeAnalysis` files the folder's bookmarks in the tree under review.
9. **Plan** (`lib/plan.ts`, `buildRebuildPlan`): the new folders are created, every bookmark is recreated in its folder (quick access first, so that its icons come first), then the previous tree is moved, item by item and in order, into a dated backup folder in Other bookmarks (`archiveSources`). Nothing is deleted. Copies and moves are journaled by batches of 50 written before the changes; after an interruption, a pending copy is recognised by its address and title among the new children of its folder. Undo runs in reverse: it puts every original back at its exact place, removes a copy only if it is unchanged and its original still exists, removes the folders left empty, and skips anything changed since. Journals of 0.2 (backup copy, moves, removals, renames) can still be undone.

The unit tests replay this pipeline on the fictitious collection of the feasibility study (50 bookmarks, 3 of them duplicates), with vectors computed by the packaged model (`tests/fixtures/e5-pipeline-vectors.json`), with and without history, pages and in both languages. With pages, all 50 bookmarks land where the hand-made reference expects them; without pages, 48 do, and the 2 the title cannot explain go to "To check". A second, larger collection (`tests/fixtures/big/collection.json`, 440 bookmarks written by hand: nested folders, a reading list, an old Firefox import, YouTube videos, GitHub repositories and Reddit threads on every subject, stores, tech blogs, home services, adult sites, duplicates) checks coherence: at least 88 % of the bookmarks under their subject (91 % today), at most 1.85 places per subject (1.77), never two folders of the same name under one parent. Its vectors are stored on 8 bits (`tests/fixtures/big/vectors.json`). The plan tests rebuild the tree in an in-memory bookmarks API, undo it, and interrupt it at eight points to check that undo still restores the exact tree. The end-to-end test sorts the collection in Chrome, sorts the result again (the same tree comes back) and undoes everything. `tests/e2e/chromium/sites.mjs` checks site reading in Chrome against a local server: pages, home pages, dead and parked sites, bot checks, no cookies, parallel requests. `tests/e2e/chromium/roots.mjs` sorts a collection where Opera and Vivaldi file bookmarks and checks that their Speed Dials, Pinboards, trash and Vivaldi's bar folder stay where they are. `tests/e2e/firefox/smoke.mjs` drives Firefox through Marionette, Firefox's own remote protocol (`tests/e2e/firefox/marionette.mjs`): WebDriver BiDi cannot open `moz-extension://` pages, Marionette can open them in a tab from Firefox's chrome context. The default options come from `scripts/eval-grid.ts` and `pnpm eval:big` (`NIDO_OPTS='{"knnWeight":2}' pnpm eval:big` tries others). They are tuned on these two collections and must be checked on real ones.

## Browsers

One code base, built once per browser by WXT. What differs is kept in three places:

- **`wxt.config.ts`**: the manifest. Manifest V3 everywhere (WXT would build Firefox in V2). Chromium browsers get the `favicon` permission and `minimum_chrome_version`. Firefox gets its add-on id (`nidomark@drslid.github.io`), `strict_min_version` 142 (the linter checks it against Firefox for Android too), `data_collection_permissions: none` (shown as "no data collected" in its install prompt) and `declarativeNetRequestWithHostAccess`.
- **`lib/platform.ts`**: behaviour. It covers the favicon cache (Chromium) or letter badges (Firefox), and the root folders' names: Firefox and Opera name them in their own language. It also reads Opera's roots through `bookmarks.getRootByName`.
  - `guardSiteData` protects the sites Nidomark reads. A site can answer with `Clear-Site-Data` to erase its cookies and storage. Chromium browsers refuse it for a request without cookies, and log it ("The request's credentials mode prohibits modifying cookies and other local data"). Firefox obeys it.
  - So, before reading any page in Firefox, a session rule strips that header from the answers to Nidomark's own requests.
- **`lib/snapshot.ts`**: the root folders of each browser. Only these are read:

| Browser | Sorted | Never read |
| --- | --- | --- |
| Chrome, Edge, Brave | Bookmarks bar, Other bookmarks, Mobile bookmarks | |
| Firefox | Bookmarks Toolbar, Bookmarks Menu, Other Bookmarks, Mobile Bookmarks; separators go to the backup | |
| Opera | Bookmarks bar, Unsorted bookmarks, Imported bookmarks (Chrome's "other" root), Other bookmarks (`user_root`, where the backup goes) | Speed Dial, Pinboards, trash |
| Vivaldi | The bar (a folder flagged `bookmarkbar`, inside the Bookmarks root, emptied and filled but never moved), the rest of Bookmarks, Other bookmarks | Speed Dial folders (`speeddial`), trash |

Only these roots are read: a copy kept in a trash or a Speed Dial is no duplicate of a bookmark being sorted. Opera and Vivaldi move to their trash what an extension removes, so the copies an undo removes wait there.

The model and its tokenizer ship in parts of 40 MB at most, joined in memory by `lib/embed.worker.ts`. Firefox's add-on store refuses files over 100 MB and does not parse JSON files over 5 MB. `wxt.config.ts` leaves the whole files out of the packages.

Safari is out of reach for now: its extensions have no bookmarks API.

## Project layout

```text
entrypoints/app/        Organizer page (index.html, main.ts, style.css)
entrypoints/background.ts
lib/                    Logic, without UI; platform.ts holds what differs between browsers
lib/ui/                 Views built with a small h() helper: review.ts (canvas, connectors, drop targets),
                        sheet.ts (side sheet), menus.ts, dialogs.ts, dnd.ts, views.ts, settings.ts
lib/data/               Public Suffix List (MPL-2.0), category examples
lib/data/names/         Folder names in each language (lib/names.ts picks the closest one)
public/_locales/        Messages in 21 languages; "{1}" placeholders are replaced by lib/i18n.ts
public/fonts/           Google Sans (OFL-1.1): latin, latin-ext, vietnamese, cyrillic, arabic, devanagari and bengali
                        subsets; Chinese, Japanese and Korean use the system fonts
scripts/                fetch-model.mjs, make-icons.mjs, make-store-images.mjs, fixture-vectors.ts and evaluation tools
tests/                  Vitest unit tests, fixtures (collection, model vectors), translations (i18n.test.ts)
tests/e2e/chromium/     smoke.mjs: review and editing; sites.mjs: site reading and Analyze again;
                        locales.mjs: other languages and right to left; roots.mjs: Opera's and Vivaldi's folders
tests/e2e/firefox/      smoke.mjs, sites.mjs (Clear-Site-Data) and their Marionette client
```

## Conventions

- TypeScript strict mode, no UI framework, no runtime dependency besides Transformers.js.
- Every user-facing string goes through `t()` and exists in all 21 languages: `tests/i18n.test.ts` checks the keys, the `{1}` placeholders, the store limits and that nothing is left in English. Messages with a number avoid plural forms ("Restored: {1}"), which differ from one language to another.
- The interface follows the browser's language (`i18n`), Arabic right to left (`@@bidi_dir`): the stylesheet uses logical properties (`inset-inline-start`, `padding-inline`) only. Messages say "your browser", never a browser's name.
- Colours, radii and elevation come from the Material 3 tokens at the top of `entrypoints/app/style.css`; [DESIGN.md](../DESIGN.md) describes the system.
- Interactive elements carry a `data-focus` key so that re-rendering keeps keyboard focus.
