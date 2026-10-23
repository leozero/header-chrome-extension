// Generates the Chrome Web Store screenshots and promo tiles in store/images/
// from the real extension UI loaded with demo rules.
// Usage: npm run store-assets   (needs Chrome for Testing, see scripts/lib/chrome.mjs)

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep } from './lib/chrome.mjs';

const OUT = new URL('../store/images/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const save = (name, png) => {
  writeFileSync(new URL(name, OUT), png);
  console.log(`wrote store/images/${name}`);
};
const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
// Vector version of the icon drawn by scripts/generate-icons.mjs, crisp at any size.
const ICON_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>
  <rect x="2" y="2" width="96" height="96" rx="22" fill="url(#g)"/>
  <circle cx="27" cy="30" r="7.5" fill="#ffd666"/>
  <g stroke="#fff" stroke-width="11" stroke-linecap="round"><path d="M45.5 30h27M25.5 50h49M25.5 70h31"/></g>
</svg>`;

const DEMO_CONFIG = {
  enabled: true,
  rules: [
    {
      id: 'staging',
      name: 'Staging API',
      enabled: true,
      pattern: '^api\\.staging\\.acme\\.dev$',
      headers: [
        { id: 's1', enabled: true, target: 'request', operation: 'set', name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiJ9.demo.token' },
        { id: 's2', enabled: true, target: 'request', operation: 'set', name: 'X-Client', value: 'header-injector' },
      ],
    },
    {
      id: 'preview',
      name: 'Preview environments',
      enabled: true,
      pattern: '(^|\\.)preview\\.acme\\.dev$',
      headers: [{ id: 'p1', enabled: true, target: 'request', operation: 'set', name: 'Authorization', value: 'Basic ZGVtbzpzM2NyZXQ=' }],
    },
    {
      id: 'local',
      name: 'Local dev',
      enabled: true,
      pattern: '^localhost$|^127\\.0\\.0\\.1$',
      headers: [
        { id: 'l1', enabled: true, target: 'request', operation: 'set', name: 'X-Debug', value: '1' },
        { id: 'l2', enabled: true, target: 'response', operation: 'set', name: 'Access-Control-Allow-Origin', value: '*' },
        { id: 'l3', enabled: true, target: 'response', operation: 'remove', name: 'Content-Security-Policy', value: '' },
      ],
    },
    {
      id: 'prod',
      name: 'Production (read-only)',
      enabled: false,
      pattern: '^api\\.acme\\.com$',
      headers: [{ id: 'r1', enabled: true, target: 'request', operation: 'set', name: 'X-Read-Only', value: 'true' }],
    },
  ],
};

// Shared look of the composed images.
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; color: #fff;
         background: radial-gradient(circle at 15% 0%, #3b82f6 0%, #1d4ed8 45%, #172554 100%); }
  .shot { border-radius: 14px; box-shadow: 0 30px 80px rgb(2 6 23 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.12); display: block; }
`;

function frame({ title, subtitle, image, imageWidth }) {
  return `<!doctype html><html><head><style>${BASE_CSS}
    body { width: 1280px; height: 800px; display: flex; flex-direction: column; align-items: center; padding-top: 52px; }
    h1 { font-size: 40px; font-weight: 750; letter-spacing: -0.02em; }
    p { margin-top: 10px; font-size: 20px; color: rgb(255 255 255 / 0.8); }
    .shot { margin-top: 38px; width: ${imageWidth}px; }
  </style></head><body>
    <h1>${title}</h1><p>${subtitle}</p>
    <img class="shot" src="${image}">
  </body></html>`;
}

const browser = await launch();
try {
  const ext = await browser.loadExtension();
  await browser.evaluate(ext.sw, `chrome.storage.local.set({ config: ${JSON.stringify(DEMO_CONFIG)} })`);
  await sleep(1500);
  const optionsUrl = `chrome-extension://${ext.id}/options/options.html`;

  // Raw UI captures, at 2x for crisp downscaling.
  async function captureOptions(colorScheme, { test = true, basicDialog = false } = {}) {
    const s = await browser.open(optionsUrl, { width: 1100, height: 640, scale: 2, colorScheme });
    if (test) {
      await browser.evaluate(
        s,
        `(() => { const i = document.querySelector('[data-role=test]');
          i.value = 'https://api.staging.acme.dev/v1/users'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
      );
    }
    if (basicDialog) {
      await browser.evaluate(s, `document.querySelectorAll('[data-haction=basic]:not([hidden])')[1].click()`);
      await browser.evaluate(s, `document.querySelector('#basic-reveal').click()`);
    }
    await sleep(300);
    return browser.screenshot(s);
  }

  const light = await captureOptions('light');
  const dialog = await captureOptions('light', { test: false, basicDialog: true });
  const dark = await captureOptions('dark');

  // The popup reads the active tab: pretend it is a page of the staging API.
  const popupSession = await browser.open(`chrome-extension://${ext.id}/popup/popup.html`, {
    width: 340,
    height: 600,
    scale: 2,
    colorScheme: 'light',
    beforeLoad: `chrome.tabs.query = async () => [{ url: 'https://api.staging.acme.dev/dashboard' }];`,
  });
  const popupHeight = await browser.evaluate(popupSession, 'document.body.scrollHeight');
  const popup = await browser.screenshot(popupSession, { x: 0, y: 0, width: 340, height: popupHeight });

  const composer = await browser.open('about:blank', { width: 1280, height: 800 });
  const render = async (html, name) => {
    await browser.setContent(composer, html);
    save(name, await browser.screenshot(composer));
  };

  await render(
    frame({
      title: 'Headers per host, matched by regex',
      subtitle: 'Authorization, API keys, CORS… on request or response, with a built-in URL tester',
      image: dataUrl(light),
      imageWidth: 1100,
    }),
    'screenshot-1-rules.png',
  );
  await render(
    frame({
      title: 'Basic auth without the Base64',
      subtitle: 'Type a username and password, get the Authorization header',
      image: dataUrl(dialog),
      imageWidth: 1100,
    }),
    'screenshot-2-basic-auth.png',
  );
  await render(
    `<!doctype html><html><head><style>${BASE_CSS}
      body { width: 1280px; height: 800px; display: flex; align-items: center; justify-content: center; gap: 90px; }
      h1 { font-size: 42px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.15; }
      ul { margin-top: 26px; padding: 0; list-style: none; font-size: 21px; line-height: 2; color: rgb(255 255 255 / 0.85); }
      li::before { content: '✓'; margin-right: 12px; color: #fcd34d; font-weight: 700; }
      .shot { width: 400px; }
    </style></head><body>
      <div><h1>Everything one<br>click away</h1>
        <ul><li>Global on / off switch</li><li>Toggle each rule</li><li>See the rules matching this site</li><li>Create a rule for the current site</li></ul></div>
      <img class="shot" src="${dataUrl(popup)}">
    </body></html>`,
    'screenshot-3-popup.png',
  );
  await render(
    frame({
      title: 'Light and dark themes',
      subtitle: 'Follows your system, masks sensitive values, flags invalid rules',
      image: dataUrl(dark),
      imageWidth: 1100,
    }),
    'screenshot-4-dark.png',
  );

  const promo = (width, height, iconSize, titleSize, tagSize, extra = '') => `<!doctype html><html><head><style>${BASE_CSS}
      body { width: ${width}px; height: ${height}px; display: flex; align-items: center; justify-content: center; gap: ${iconSize / 3}px; }
      svg { flex: none; width: ${iconSize}px; height: ${iconSize}px;
            filter: drop-shadow(0 ${iconSize / 12}px ${iconSize / 6}px rgb(2 6 23 / 0.45)); }
      svg rect { stroke: rgb(255 255 255 / 0.35); stroke-width: 1.2; }
      h1 { font-size: ${titleSize}px; font-weight: 800; letter-spacing: -0.02em; }
      p { margin-top: 6px; font-size: ${tagSize}px; color: rgb(255 255 255 / 0.82); }
      code { font: 600 ${tagSize * 0.85}px ui-monospace, Menlo, monospace; color: #fcd34d; }
    </style></head><body>${ICON_SVG}<div><h1>Header Injector</h1>${extra}</div></body></html>`;

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 440, height: 280, deviceScaleFactor: 1, mobile: false }, composer);
  await render(promo(440, 280, 84, 34, 16, '<p>HTTP headers by hostname regex</p>'), 'promo-small-440x280.png');

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 560, deviceScaleFactor: 1, mobile: false }, composer);
  await render(
    promo(1400, 560, 190, 76, 30, '<p>Add, override or remove HTTP headers<br>on hosts matching a regex</p><p><code>^api\\.staging\\.acme\\.dev$ → Authorization: Bearer …</code></p>'),
    'promo-marquee-1400x560.png',
  );
} finally {
  await browser.close();
}
