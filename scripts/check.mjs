// Sanity checks run in CI: versions in sync (and matching the git tag on
// release) and every file referenced by the manifest exists.
// Usage: node scripts/check.mjs [vX.Y.Z]

import { existsSync, readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const pkg = read('package.json');
const manifest = read('extension/manifest.json');
const errors = [];

if (pkg.version !== manifest.version) {
  errors.push(`package.json (${pkg.version}) and manifest.json (${manifest.version}) versions differ`);
}

const tag = process.argv[2];
if (tag && tag !== `v${manifest.version}`) {
  errors.push(`tag ${tag} does not match manifest version v${manifest.version}`);
}

const files = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);
for (const file of files) {
  if (!existsSync(new URL(`../extension/${file}`, import.meta.url))) errors.push(`missing file: extension/${file}`);
}

if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}
console.log(`✔ manifest v${manifest.version} OK (${files.length} referenced files)`);
