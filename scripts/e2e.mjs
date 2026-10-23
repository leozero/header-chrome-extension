// End-to-end test: loads the extension in Chrome for Testing, configures rules
// and checks the headers received by a local echo server.
// Usage: npm run e2e   (needs Chrome for Testing, see scripts/lib/chrome.mjs)

import assert from 'node:assert/strict';
import http from 'node:http';
import { launch, sleep } from './lib/chrome.mjs';

const server = http.createServer((req, res) => {
  res.setHeader('X-Powered-By', 'node');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.headers));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const config = {
  enabled: true,
  rules: [
    {
      id: 'local',
      name: 'Local',
      enabled: true,
      pattern: '(^|\\.)localhost$',
      headers: [
        { id: 'h1', enabled: true, target: 'request', operation: 'set', name: 'Authorization', value: 'Bearer test-token' },
        { id: 'h2', enabled: false, target: 'request', operation: 'set', name: 'X-Disabled', value: '1' },
        { id: 'h3', enabled: true, target: 'response', operation: 'remove', name: 'X-Powered-By', value: '' },
        { id: 'h4', enabled: true, target: 'response', operation: 'set', name: 'X-Injected', value: 'yes' },
      ],
    },
    {
      id: 're2',
      name: 'Rejected by RE2',
      enabled: true,
      pattern: '^(?=foo)foo\\.com$',
      headers: [{ id: 'h5', enabled: true, target: 'request', operation: 'set', name: 'X-Bad', value: '1' }],
    },
  ],
};

let failed = false;
async function check(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    failed = true;
    console.log(`✖ ${name}\n  ${e.message.split('\n').join('\n  ')}`);
  }
}

const browser = await launch();
try {
  const ext = await browser.loadExtension();
  await browser.evaluate(ext.sw, `chrome.storage.local.set({ config: ${JSON.stringify(config)} })`);
  await sleep(1500);
  const bodyOf = async (url) => JSON.parse(await browser.evaluate(await browser.open(url), 'document.body.innerText'));

  await check('invalid RE2 rule is reported, the others still apply', async () => {
    const status = await browser.evaluate(ext.sw, `chrome.storage.local.get('status').then(s => s.status)`);
    assert.deepEqual(status.applied, ['local']);
    assert.match(status.errors.re2, /rejected by Chrome/);
    assert.equal(await browser.evaluate(ext.sw, 'chrome.action.getBadgeText({})'), '!');
  });

  const page = await browser.open(`http://localhost:${PORT}/`);
  await check('request headers on a top-level navigation', async () => {
    const headers = JSON.parse(await browser.evaluate(page, 'document.body.innerText'));
    assert.equal(headers.authorization, 'Bearer test-token');
    assert.equal(headers['x-disabled'], undefined);
  });

  await check('request and response headers on fetch()', async () => {
    const r = await browser.evaluate(
      page,
      `fetch('/api').then(async r => ({ auth: (await r.json()).authorization, poweredBy: r.headers.get('x-powered-by'), injected: r.headers.get('x-injected') }))`,
    );
    assert.deepEqual(r, { auth: 'Bearer test-token', poweredBy: null, injected: 'yes' });
  });

  await check('no headers for another host, even with the hostname in the URL', async () => {
    const headers = await bodyOf(`http://127.0.0.1:${PORT}/localhost?h=localhost`);
    assert.equal(headers.authorization, undefined);
  });

  await check('Basic auth helper through the settings UI', async () => {
    const options = await browser.open(`chrome-extension://${ext.id}/options/options.html`);
    await browser.evaluate(options, `document.querySelector('[data-haction=basic]:not([hidden])').click()`);
    await browser.evaluate(
      options,
      `document.querySelector('#basic-username').value = 'alice';
       document.querySelector('#basic-password').value = 'pa:ss wörd';
       document.querySelector('#basic-dialog [type=submit]').click()`,
    );
    await sleep(1500);
    const headers = await bodyOf(`http://localhost:${PORT}/basic`);
    assert.equal(headers.authorization, `Basic ${Buffer.from('alice:pa:ss wörd').toString('base64')}`);
  });

  await check('global switch off removes all rules', async () => {
    await browser.evaluate(ext.sw, `chrome.storage.local.set({ config: { ...${JSON.stringify(config)}, enabled: false } })`);
    await sleep(1000);
    assert.equal((await bodyOf(`http://localhost:${PORT}/off`)).authorization, undefined);
    assert.equal(await browser.evaluate(ext.sw, 'chrome.action.getBadgeText({})'), 'OFF');
  });
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
