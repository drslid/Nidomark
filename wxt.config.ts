import { defineConfig } from 'wxt';

/** Files of the model shipped as parts (see the build:publicAssets hook). */
const PARTED_FILES = ['onnx/model_quantized.onnx', 'tokenizer.json'].map((f) => `models/Xenova/multilingual-e5-small/${f}`);

/** Firefox add-on id: stable across versions, it ties the add-on to its listing and to the user's data. */
export const GECKO_ID = 'nidomark@drslid.github.io';

export default defineConfig({
  // Manifest V3 everywhere: one set of permissions and APIs for Chrome, Edge, Opera and Firefox.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // "favicon" exposes the browser's favicon cache to extension pages (Chromium only). In Firefox, a session rule
    // keeps the sites Nidomark reads from erasing their cookies (lib/platform.ts, guardSiteData); this permission
    // shows no warning and acts only where the user granted access to sites.
    permissions: browser === 'firefox' ? ['bookmarks', 'storage', 'declarativeNetRequestWithHostAccess'] : ['bookmarks', 'storage', 'favicon'],
    optional_permissions: ['history'],
    // Asked for at the first analysis, only to read the bookmarked pages themselves (no cookies, nothing sent).
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: '__MSG_actionTitle__' },
    // WebAssembly is needed by ONNX Runtime; all code is packaged, nothing is loaded remotely.
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            // Nothing is collected or sent: Firefox shows it in its own consent prompt (Firefox 140+).
            gecko: { id: GECKO_ID, strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
          },
        }
      : { minimum_chrome_version: '116' }),
  }),
  zip: {
    // The sources Firefox's reviewers rebuild the add-on from (docs/REVIEWERS.md). They hold the model in its parts and
    // ONNX Runtime's files, as packaged, so that the build needs nothing but npm; the whole model files, the site and
    // the store images are left out.
    excludeSources: ['public/models/**/onnx/model_quantized.onnx', 'public/models/**/tokenizer.json', 'website/**', 'docs/assets/**', 'docs/store/**'],
  },
  hooks: {
    // The model and its tokenizer ship in parts, under the 100 MB a file may weigh in Firefox's add-on store and the
    // 5 MB of JSON it checks (scripts/fetch-model.mjs); the whole files stay in public/ for the scripts run in Node.
    'build:publicAssets': (_wxt, files) => {
      // Paths come with the system's separator (backslashes on Windows).
      const dest = (f: (typeof files)[number]) => f.relativeDest.replaceAll('\\', '/');
      for (const whole of PARTED_FILES) {
        const i = files.findIndex((f) => dest(f) === whole);
        if (i < 0) continue;
        if (!files.some((f) => dest(f) === `${whole}.parts.json`)) throw new Error('The model parts are missing: run `pnpm fetch-model`');
        files.splice(i, 1);
      }
    },
  },
  vite: () => ({
    worker: { format: 'es' },
    plugins: [
      {
        // ONNX Runtime references its .wasm with `new URL(..., import.meta.url)`, which makes Vite emit a hashed copy.
        // The extension loads the copy in /ort/ (see scripts/fetch-model.mjs), so drop the duplicate (27 MB).
        name: 'drop-duplicate-ort-wasm',
        generateBundle(_options: unknown, bundle: Record<string, unknown>) {
          for (const file of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(file)) delete bundle[file];
        },
      },
    ],
  }),
});
