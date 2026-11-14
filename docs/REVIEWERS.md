# Building Nidomark from source (for add-on reviewers)

Nidomark is built with [WXT](https://wxt.dev) and TypeScript; Vite bundles and minifies it. This archive holds the sources the add-on is built from, the lockfile, and the files it ships unchanged: the model and the WebAssembly files of ONNX Runtime.

## Requirements

- Linux, macOS or Windows
- Node.js 22 or later (tested with 22 and 24)
- pnpm 10.8.0 (`corepack enable`, or `npm install -g pnpm@10.8.0`)
- About 600 MB of free disk space, dependencies included

## Build

```bash
pnpm install --frozen-lockfile
pnpm zip:firefox
```

`pnpm zip:firefox` builds `.output/firefox-mv3/` and writes `.output/nidomark-<version>-firefox.zip`, which matches the submitted package. Every dependency comes from npm, as pinned by `pnpm-lock.yaml`.

## Files shipped unchanged

- **The model**, in `public/models/Xenova/multilingual-e5-small/`.
  - It is [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78) at revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`: the 8-bit ONNX export of [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) (MIT).
  - The model (118 MB) and its tokenizer (17 MB of JSON) are cut into parts of at most 40 MB (`model_quantized.onnx.0`…, `tokenizer.json.0`). That keeps every file under the 100 MB limit, and no large JSON file needs parsing.
  - Each `.parts.json` gives the size and SHA-256 of the whole file. `lib/embed.worker.ts` joins the parts in memory through the Transformers.js custom cache.
  - To check them against Hugging Face, run `pnpm fetch-model`. It downloads the pinned revision, verifies the SHA-256 that Hugging Face publishes, and writes the same parts (`scripts/fetch-model.mjs`).
- **ONNX Runtime Web**: `public/ort/ort-wasm-simd-threaded.asyncify.mjs` and `.wasm` are copied unchanged from [onnxruntime-web 1.31.1](https://www.npmjs.com/package/onnxruntime-web/v/1.31.1) (Microsoft, MIT), `node_modules/onnxruntime-web/dist/`.
  - `@huggingface/transformers` 4.3.2 asks for a development build of `onnxruntime-web`. `package.json` overrides it with the 1.31.1 release.

## Third-party libraries

- [@huggingface/transformers 4.3.2](https://www.npmjs.com/package/@huggingface/transformers/v/4.3.2) (Apache-2.0) runs the model. It is bundled by Vite into the worker (`assets/embed.worker-*.js`).
- [onnxruntime-web 1.31.1](https://www.npmjs.com/package/onnxruntime-web/v/1.31.1) (MIT) comes in two parts: its JavaScript is bundled the same way, and its WebAssembly files sit unchanged in `ort/`.

## Linter warnings

`DANGEROUS_EVAL` and `UNSAFE_VAR_ASSIGNMENT` come from ONNX Runtime Web, unchanged:

- The Emscripten glue in `ort/ort-wasm-simd-threaded.asyncify.mjs` uses the `Function` constructor.
- The worker imports that local glue file with a computed path (`/ort/…`).

The extension pages' CSP allows only packaged scripts and WebAssembly (`script-src 'self' 'wasm-unsafe-eval'`). No code is loaded from the network.

`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` does not apply: Firefox for Android has no bookmarks API, so the add-on is for Firefox on a computer only.

## Data and network

Nothing is collected or sent (`data_collection_permissions: none`).

- **Optional host permissions** (`http://*/*`, `https://*/*`), asked for at the user's first analysis. The add-on requests the bookmarked pages themselves, without cookies (`credentials: 'omit'`), to read their title, description and headings when the bookmark's title is not enough, and to find bookmarks whose site no longer answers. Nothing is sent with these requests and their content stays on the device.
- **Optional `history`**: the visits of each bookmarked site are counted on the device to put the most visited sites first.

## Permissions

- `bookmarks`: the add-on sorts the user's bookmarks into a new tree after the user approves it. The previous tree is moved into a backup folder, and the sort can be undone.
- `storage`: settings, the journal that makes a sort undoable, and the choices the user taught.
- `declarativeNetRequestWithHostAccess`: one session rule, installed before the add-on requests any page (`guardSiteData` in `lib/platform.ts`). It removes the `Clear-Site-Data` response header from the answers to the add-on's own requests, and only those (`initiatorDomains`: its own internal host, `resourceTypes: ['xmlhttprequest']`).
  - Why: Firefox applies that header even to a request made without credentials. A site that answers signed-out visitors with `Clear-Site-Data: "cookies", "storage"` would otherwise sign the user out and erase its local data, merely because the add-on checked a bookmark. Chromium browsers refuse the header in that case.
  - `tests/e2e/firefox/sites.mjs` checks it against a local site.
