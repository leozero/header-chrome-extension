// Copies package.json's version into extension/manifest.json.
// Run automatically by `npm version <patch|minor|major>`.

import { readFileSync, writeFileSync } from 'node:fs';

const pkgUrl = new URL('../package.json', import.meta.url);
const manifestUrl = new URL('../extension/manifest.json', import.meta.url);

const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  // Chrome only accepts 1-4 dot-separated integers (no "-beta" suffixes).
  console.error(`Version "${version}" is not valid for a Chrome extension (expected X.Y.Z)`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
manifest.version = version;
writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest.json -> ${version}`);
