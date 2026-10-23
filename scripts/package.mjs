// Zips extension/ into dist/header-injector-vX.Y.Z.zip, ready to be loaded
// in Chrome or uploaded to the Chrome Web Store.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(`${root}extension/manifest.json`, 'utf8'));
const out = `${root}dist/header-injector-v${version}.zip`;

mkdirSync(`${root}dist`, { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, '.', '-x', '.*', '-x', '*/.*'], { cwd: `${root}extension`, stdio: 'inherit' });
console.log(`created ${out.slice(root.length)}`);
