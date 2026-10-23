// Uploads the packaged zip to the Chrome Web Store and submits it for review,
// using the Chrome Web Store API v2. No dependencies.
// Usage: node scripts/publish-store.mjs [path/to/extension.zip]
//
// Environment:
//   CWS_PUBLISHER_ID, CWS_EXTENSION_ID      required
//   CWS_SERVICE_ACCOUNT_KEY                 service account JSON key (recommended), or
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET,
//   CWS_REFRESH_TOKEN                       OAuth client + refresh token
//   CWS_PUBLISH_TYPE                        DEFAULT_PUBLISH (default) or STAGED_PUBLISH
//
// See docs/PUBLISHING.md for the one-time setup.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
// Overridable for tests only.
const API = process.env.CWS_API_ORIGIN ?? 'https://chromewebstore.googleapis.com';
const TOKEN_URL = process.env.CWS_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';

const env = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function request(url, init, what) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) fail(`${what} failed (HTTP ${res.status}):\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
  return body;
}

function serviceAccountAssertion(key) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  return `${unsigned}.${signature}`;
}

async function accessToken() {
  let params;
  if (env.CWS_SERVICE_ACCOUNT_KEY) {
    let key;
    try {
      key = JSON.parse(env.CWS_SERVICE_ACCOUNT_KEY);
    } catch {
      fail('CWS_SERVICE_ACCOUNT_KEY is not valid JSON');
    }
    params = { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountAssertion(key) };
  } else if (env.CWS_CLIENT_ID && env.CWS_CLIENT_SECRET && env.CWS_REFRESH_TOKEN) {
    params = {
      grant_type: 'refresh_token',
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
    };
  } else {
    fail('No credentials: set CWS_SERVICE_ACCOUNT_KEY, or CWS_CLIENT_ID + CWS_CLIENT_SECRET + CWS_REFRESH_TOKEN');
  }
  const body = await request(TOKEN_URL, { method: 'POST', body: new URLSearchParams(params) }, 'Getting an access token');
  return body.access_token;
}

const { CWS_PUBLISHER_ID: publisher, CWS_EXTENSION_ID: extension } = env;
if (!publisher || !extension) fail('CWS_PUBLISHER_ID and CWS_EXTENSION_ID are required');
const publishType = env.CWS_PUBLISH_TYPE || 'DEFAULT_PUBLISH';
if (!['DEFAULT_PUBLISH', 'STAGED_PUBLISH'].includes(publishType)) fail(`Unknown CWS_PUBLISH_TYPE "${publishType}"`);

const { version } = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
const zipPath = process.argv[2] ?? `dist/header-injector-v${version}.zip`;
const zip = readFileSync(zipPath);
const item = `publishers/${encodeURIComponent(publisher)}/items/${encodeURIComponent(extension)}`;

const token = await accessToken();
const auth = { Authorization: `Bearer ${token}` };

console.log(`Uploading ${zipPath} (v${version}, ${zip.length} bytes)…`);
const upload = await request(
  `${API}/upload/v2/${item}:upload`,
  { method: 'POST', headers: { ...auth, 'Content-Type': 'application/zip' }, body: zip },
  'Upload',
);

let state = upload.uploadState;
for (let i = 0; state === 'IN_PROGRESS' && i < 60; i++) {
  await sleep(5000);
  const status = await request(`${API}/v2/${item}:fetchStatus`, { headers: auth }, 'Fetching the upload status');
  state = status.lastAsyncUploadState;
}
if (state !== 'SUCCEEDED') fail(`Upload did not succeed (state: ${state}):\n${JSON.stringify(upload, null, 2)}`);
console.log(`✔ Uploaded${upload.crxVersion ? ` version ${upload.crxVersion}` : ''}`);

const published = await request(
  `${API}/v2/${item}:publish`,
  { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ publishType }) },
  'Submitting for review',
);
for (const w of published.warningInfo?.warnings ?? []) console.warn(`⚠ ${w.reason}: ${w.description}`);
console.log(`✔ Submitted for review (${publishType}), state: ${published.state}`);
