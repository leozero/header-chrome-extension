// Minimal Chrome DevTools Protocol driver (no dependencies) used by the E2E
// test and the store screenshots. Loads the unpacked extension through
// `Extensions.loadUnpacked`, which requires a pipe transport.
//
// Needs a Chrome that allows unpacked extensions from the command line:
// Chrome for Testing or Chromium (set CHROME_PATH), not branded Chrome.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = fileURLToPath(new URL('../../extension', import.meta.url));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  // Chrome for Testing installed by Playwright or Puppeteer.
  const candidates = [];
  for (const cache of [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]) {
    if (!existsSync(cache)) continue;
    for (const dir of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(
        join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(cache, dir, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(cache, dir, 'chrome-linux64/chrome'),
        join(cache, dir, 'chrome-linux/chrome'),
      );
    }
  }
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('Chrome for Testing not found: set CHROME_PATH (e.g. `npx @puppeteer/browsers install chrome@stable`)');
  return found;
}

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'header-injector-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      // GitHub's Ubuntu runners do not allow Chrome's user namespace sandbox.
      ...(process.env.CI ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );

  // Messages are NUL-terminated JSON: we write on fd 3, Chrome writes on fd 4.
  let seq = 0;
  let buffer = '';
  const pending = new Map();
  proc.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString();
    let i;
    while ((i = buffer.indexOf('\0')) !== -1) {
      const msg = JSON.parse(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
      const p = pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      proc.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });

  async function evaluate(sessionId, expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  /** Opens a tab and returns its CDP session id. */
  async function open(url, { width = 1280, height = 800, scale = 1, colorScheme, beforeLoad } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
    if (colorScheme) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: colorScheme }] }, sessionId);
    }
    if (beforeLoad) await send('Page.addScriptToEvaluateOnNewDocument', { source: beforeLoad }, sessionId);
    await send('Page.navigate', { url }, sessionId);
    await sleep(800);
    return sessionId;
  }

  async function screenshot(sessionId, clip) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip && { clip: { ...clip, scale: 1 } }) }, sessionId);
    return Buffer.from(data, 'base64');
  }

  async function setContent(sessionId, html) {
    const { frameTree } = await send('Page.getFrameTree', {}, sessionId);
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId);
    await evaluate(sessionId, 'Promise.all([...document.images].map(i => i.decode())).then(() => document.fonts.ready).then(() => 1)');
  }

  /** Loads the unpacked extension; returns its id and its service worker session. */
  async function loadExtension(path = EXTENSION_DIR) {
    const { id } = await send('Extensions.loadUnpacked', { path });
    for (let i = 0; i < 50; i++) {
      const { targetInfos } = await send('Target.getTargets');
      const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`));
      if (sw) {
        const { sessionId } = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
        return { id, sw: sessionId };
      }
      await sleep(100);
    }
    throw new Error('Extension service worker did not start');
  }

  async function close() {
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }

  return { send, evaluate, open, screenshot, setContent, loadExtension, close };
}
