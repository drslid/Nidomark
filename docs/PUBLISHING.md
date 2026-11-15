# Publishing

Nidomark is one extension in two packages: the Chrome package serves every Chromium browser, and Firefox has its own.

| Store | Serves | Package | Account | Review |
| --- | --- | --- | --- | --- |
| [Chrome Web Store](https://chrome.google.com/webstore/devconsole) | Chrome, and Brave, Vivaldi, Opera and Arc users | `nidomark-<version>-chrome.zip` | Google account, one-time registration fee | A few days, up to a few weeks |
| [Firefox Add-ons](https://addons.mozilla.org/developers/) | Firefox on a computer | `nidomark-<version>-firefox.zip` and `nidomark-<version>-sources.zip` | Mozilla account, free | Signed within 24 hours; manual review possible at any time |
| [Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/overview) | Edge | `nidomark-<version>-chrome.zip` | Microsoft Partner Center, free | Up to 7 business days |
| [Opera add-ons](https://addons.opera.com/developer/) | Opera | `nidomark-<version>-chrome.zip` | Opera account, free | Moderators, no announced delay |

- **Brave, Vivaldi and Arc** have no store of their own: they install extensions from the Chrome Web Store ([Brave](https://brave.com/learn/using-chrome-extensions-in-brave/), [Vivaldi](https://help.vivaldi.com/desktop/appearance-customization/extensions/), [Arc](https://arc.net/faq)).
- **Safari** is out of reach for now. Its extensions have no bookmarks API ([MDN compatibility data](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks#browser_compatibility)), and distributing one requires the Apple Developer Program.

## Each release

1. Update `version` in `package.json` and `website/package.json`.
2. Build and test:

   ```bash
   pnpm install --frozen-lockfile && pnpm fetch-model
   pnpm check && pnpm e2e
   pnpm build:firefox && FIREFOX_PATH=/path/to/firefox pnpm e2e:firefox
   pnpm zip:all
   ```

3. Publish the three files of `.output` in a GitHub release, then upload them to each store as described below.

Every store wants a higher version number for each update. `wxt submit` can upload to the Chrome Web Store, Firefox Add-ons and Edge Add-ons from the command line, once their API keys are created ([WXT publishing guide](https://wxt.dev/guide/essentials/publishing.html)). The keys stay out of the repository.

## Store kit

What every listing needs, ready to paste or upload.

### Listing texts

| Field | English | Français |
| --- | --- | --- |
| Summary | A small local AI recreates all your bookmarks in clear folders, your most visited sites first. Private, offline, free. | Une petite IA locale recrée tous vos favoris dans des dossiers clairs, vos sites préférés en tête. Privé, hors ligne, gratuit. |
| Category | Productivity | Productivité |

Description (English):

> Nidomark rebuilds your bookmarks into a clear tree and applies it only after you review it.
> A small multilingual AI runs inside your browser: your bookmarks never leave your computer, there is no account and no server.
> • Understands what each bookmark is about and what you use it for: home services, online tools, tutorials, articles, news, streaming.
> • Files every bookmark: your most visited sites as icons at the start of the bar, then a dozen folders, three levels at most.
> • Keeps your folders that make sense, sets dead links, duplicates and adult content apart, and explains each choice.
> • Lets you change everything before applying: drag bookmarks and folders, create, rename or delete folders, show a folder as an emoji or a name, and undo any change.
> • Suggests a folder for every bookmark it is unsure of, and analyzes a folder again when you ask.
> • Your previous tree is kept as it was in a dated backup; one click undoes the sort.
> • In 21 languages, chosen from your browser's.

Description (français) :

> Nidomark reconstruit vos favoris en une arborescence claire et ne l'applique qu'après votre vérification.
> Une petite IA multilingue fonctionne dans votre navigateur : vos favoris ne quittent jamais votre ordinateur, sans compte ni serveur.
> • Comprend de quoi parle chaque favori et à quoi il vous sert : services maison, outils en ligne, tutoriels, articles, actualités, streaming.
> • Range tous vos favoris : vos sites les plus visités en icônes au début de la barre, puis une douzaine de dossiers, trois niveaux au plus.
> • Garde vos dossiers qui ont du sens, met à part les liens morts, les doublons et les contenus adultes, et explique chaque choix.
> • Vous laisse tout modifier avant d'appliquer : glissez favoris et dossiers, créez, renommez ou supprimez des dossiers, affichez un dossier en emoji ou en nom, et annulez chaque changement.
> • Propose un dossier pour chaque favori incertain, et réanalyse un dossier à la demande.
> • Votre ancienne arborescence est gardée telle quelle dans une sauvegarde datée ; un clic annule le tri.
> • En 21 langues, choisie d'après celle de votre navigateur.

The extension's name and summary come from `_locales/<code>/messages.json` (`extName`, `extDescription`) in each of the 21 languages. The stores take the detailed description and the images per language: English and French at least.

### Images

All images are in [`docs/store`](store). `pnpm e2e` (with `E2E_LANG=en` for English) writes the screenshots, and `pnpm store-images` renders the tiles and Opera's sizes. The screenshots show the test collection, so they say "Fictional sample collection".

| Image | File | Chrome Web Store | Edge | Firefox | Opera |
| --- | --- | --- | --- | --- | --- |
| Icon 128×128 | in the package (`icon/128.png`) | required | | from the package | from the package |
| Logo 300×300 | `logo-300.png` | | required | | |
| Screenshots 1280×800 | `store-1-start-<lang>.png` … `store-4-done-<lang>.png` | 1 to 5, at least one | up to 6 | recommended | |
| Screenshots 800×500 | `opera/store-*.png` | | | | 612×408 preferred, 800×600 at most |
| Small promo tile 440×280 | `promo-440x280-<lang>.png` | recommended | optional | | |
| Large tile 1400×560 | `marquee-1400x560-<lang>.png` | optional | optional | | |

The Chrome Web Store lists extensions that have a small promo tile before the ones that do not ([images](https://developer.chrome.com/docs/webstore/images)).

### Privacy answers (Chrome Web Store, Edge)

- **Single purpose:** organize the user's bookmarks into folders.
- **`bookmarks`:** read the bookmarks to build the proposal; after the user approves, create the new folders and bookmarks, and move the previous tree into a backup folder.
- **`storage`:** keep the settings, the undo journal and the original names of icon-only bookmarks.
- **`favicon`:** show site icons in the review screen and the bookmarks bar preview.
- **`history` (optional, requested at the first analysis while "Put the most visited sites first" is on):** count the visits of each bookmarked site to put the most used ones first, and read page titles already stored by the browser to understand vague bookmark titles. Read locally, never stored or sent.
- **Host permissions `http://*/*`, `https://*/*` (optional, requested at the first analysis):** request the bookmarked pages themselves, without cookies, to read their title and description when the bookmark title is not enough, and to find bookmarks whose site no longer answers. No other request is made; nothing is sent.
- **Remote code:** no. The model and the WebAssembly runtime are packaged with the extension.
- **Data usage:** no user data is collected or transmitted.

## Chrome Web Store

1. **Register as a developer**, once. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), accept the developer agreement, pay the one-time registration fee, give a publisher name and verify the contact email ([register](https://developer.chrome.com/docs/webstore/register), [account](https://developer.chrome.com/docs/webstore/set-up-account)). A new publisher can have two published extensions.
2. **New item**: upload `nidomark-<version>-chrome.zip` (2 GB at most).
3. **Store listing**: description, category Productivity, language, images (see above), the website <https://drslid.github.io/Nidomark/> and the support page <https://github.com/drslid/Nidomark/issues>.
4. **Privacy**: the answers above, "No, I am not using remote code", and the privacy policy <https://drslid.github.io/Nidomark/reference/privacy/>. Disclosure is required even when everything stays on the device ([user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).
5. **Distribution**: public, all regions. Submit for review. Most reviews take a few days; broad host permissions can make them longer, even optional ones ([review process](https://developer.chrome.com/docs/webstore/review-process)). After approval, the item is published, or can be published within 30 days.

## Firefox Add-ons

1. **Create a Mozilla account** and set a display name in the [Developer Hub](https://addons.mozilla.org/developers/). There is no fee.
2. **Submit a New Add-on** → **On this site** (listed), then upload `nidomark-<version>-firefox.zip` ([submitting](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)). Choose **Firefox** only: Firefox for Android has no bookmarks API.
3. **Source code**: answer **Yes**, then upload `nidomark-<version>-sources.zip`. The code is bundled and minified, so the sources are required for every version ([source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)). The archive holds the lockfile, the model in parts, the ONNX Runtime files and [REVIEWERS.md](REVIEWERS.md). Two commands rebuild the same package.
4. **Listing**: name, summary, description, categories (Bookmarks, Productivity), license MIT, support site <https://github.com/drslid/Nidomark/issues>, homepage <https://drslid.github.io/Nidomark/>, privacy policy <https://drslid.github.io/Nidomark/reference/privacy/>, screenshots.
5. **Notes for reviewers**:

   > Nidomark sorts the user's bookmarks with a small embedding model run locally (Transformers.js 4.3.2, ONNX Runtime Web 1.31.1, multilingual-e5-small 8-bit). Nothing is collected or sent. The optional host permissions are used only to fetch the bookmarked pages themselves, without cookies, when the user enables "Read sites". Build instructions are in docs/REVIEWERS.md: `pnpm install --frozen-lockfile && pnpm zip:firefox`. The model and the ONNX Runtime WebAssembly files are shipped unchanged; the model is split in parts of 40 MB (joined in memory) to stay under the 100 MB file limit. The two linter warnings come from ONNX Runtime Web 1.31.1: DANGEROUS_EVAL is in its unchanged glue file ort/ort-wasm-simd-threaded.asyncify.mjs, and UNSAFE_VAR_ASSIGNMENT is its loader importing that packaged file. declarativeNetRequestWithHostAccess serves one session rule that removes the Clear-Site-Data header from the answers to the add-on's own requests: Firefox would otherwise let a site erase its cookies and storage in answer to a cookieless check (see docs/REVIEWERS.md).

6. Signing usually takes less than 24 hours; Mozilla can review any version manually later.

From the command line, `web-ext sign --channel listed --upload-source-code .output/nidomark-<version>-sources.zip` does the same with API keys created at <https://addons.mozilla.org/developers/addon/api/key/> ([web-ext sign](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign)).

## Edge Add-ons

1. **Create a Partner Center account** for Microsoft Edge, as an individual, which is verified faster than a company. There is no registration fee ([developer account](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)).
2. **Create new extension**, then upload `nidomark-<version>-chrome.zip`: Edge runs Chrome's Manifest V3 extensions as they are ([porting](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)). `tests/e2e/chromium/roots.mjs` passes in Edge.
3. **Availability**: public, all markets.
4. **Properties**: category Productivity, privacy policy, website and support links (as above).
5. **Store listings**, per language: description, logo `logo-300.png`, tiles and screenshots (see Images).
6. Fill in the privacy answers, then **Publish**. Certification takes up to seven business days ([publishing](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)).

## Opera add-ons

1. Sign in with an Opera account at <https://addons.opera.com/developer/upload/>.
2. Upload the Chrome package. If the form asks for a `.crx` file, pack the unzipped folder in `opera://extensions` → **Developer mode** → **Pack extension**. Keep the `.pem` key it creates: updates must be signed with it.
3. Opera reviews readable code: the package is minified, so give the link to the sources, `https://github.com/drslid/Nidomark/releases` ([acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/)).
4. Category Productivity, description, the screenshots of `docs/store/opera` and the privacy policy.

Opera users can also install Nidomark from the Chrome Web Store. Nidomark sorts Opera's Bookmarks bar, Unsorted bookmarks, Imported bookmarks and Other bookmarks, and leaves its Speed Dial, Pinboards and trash as they are.
