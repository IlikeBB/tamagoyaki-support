import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await build({ configFile: fileURLToPath(new URL('frontend/vite.config.mjs', root)) });
const bundle = await readFile(new URL('static/vue/expeditions-page.js', root));
const version = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
const indexPath = new URL('static/index.html', root);
const index = await readFile(indexPath, 'utf8');
const pattern = /\/static\/vue\/expeditions-page\.js\?v=[A-Za-z0-9-]+/g;
if ([...index.matchAll(pattern)].length !== 1) throw new Error('Expected one Vue entry script.');
await writeFile(indexPath, index.replace(pattern, `/static/vue/expeditions-page.js?v=${version}`), 'utf8');

// Keep the runtime's third-party licenses with the published static artifact.
const notices = await Promise.all(['vue', '@vue/shared', '@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom'].map(async name => `${name}\n${await readFile(new URL(`node_modules/${name}/LICENSE`, root), 'utf8')}`));
await writeFile(new URL('static/vue/LICENSE.txt', root), notices.join('\n\n'), 'utf8');
console.log(`Vue entry version: ${version}`);
