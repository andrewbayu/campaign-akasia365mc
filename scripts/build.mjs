import { mkdir, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
// Fixed workspace-owned target; do not recursively copy the repository or secrets.
if (output !== resolve(root, 'dist')) throw new Error('Invalid output directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'privacy.html', '365mc-logo.svg', 'jibangi-v01.png', 'awards', 'cases', 'logos', 'reels', 'assets']) await cp(resolve(root, name), resolve(output, name), { recursive: true });
console.log('Built public site from explicit asset allowlist into dist.');
