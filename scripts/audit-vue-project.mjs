// Check source ownership and local assets without touching runtime data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const text = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(item => {
  const relative = directory + '/' + item.name;
  return item.isDirectory() ? walk(relative) : [relative];
});
const source = [...walk('frontend'), ...walk('static'), ...walk('backend')].filter(file => /\.(?:vue|js|css|html|json|py|webmanifest)$/.test(file) && !file.startsWith('static/vendor/') && !file.startsWith('static/vue/'));
const references = new Set();
for (const file of source) {
  for (const match of text(file).matchAll(/["'`(]\/static\/([A-Za-z0-9_.\/-]+)/g)) references.add('static/' + match[1]);
}
for (const file of references) assert(fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile(), 'Missing referenced asset: ' + file);
const runtimeFiles = walk('static').filter(file => !file.startsWith('static/vendor/') && !file.startsWith('static/vue/') && /\.(?:js|css|json|svg|png|webmanifest)$/.test(file));
const specialEntries = new Set(['static/sw.js']);
const unreferenced = runtimeFiles.filter(file => !references.has(file) && !specialEntries.has(file));
assert.deepEqual(unreferenced, [], 'Unreferenced static files should be removed or explicitly documented');

const reached = new Set();
function visit(file) {
  if (reached.has(file)) return;
  reached.add(file);
  for (const match of text(file).matchAll(/(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
  }
}
visit('frontend/main.js');
const components = walk('frontend/components').filter(file => file.endsWith('.vue'));
assert.deepEqual(components.filter(file => !reached.has(file)), [], 'Every shipped Vue component must be reachable from the entry');
for (const file of source.filter(file => file.startsWith('static/') && file.endsWith('.js'))) {
  assert(!/\b(?:innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment)\b/.test(text(file)), 'HTML rendering belongs in Vue: ' + file);
  assert(!/<(?:div|section|form|button|article|header|aside|nav|ul|li|svg|span|p|h[1-6])(?:\s|>)/i.test(text(file)), 'Retired string-based UI renderer remains: ' + file);
}
const html = text('static/index.html');
assert.equal((html.match(/src="\/static\/vue\/app\.js\?v=/g) || []).length, 1);
assert(/<body>\s*<noscript>[\s\S]*?<\/noscript>\s*<\/body>/.test(html), 'The document must delegate the interface shell to Vue');
console.log(JSON.stringify({ ok: true, vueComponents: components.length, referencedAssets: references.size, unreferencedStaticFiles: 0, legacyHtmlRenderers: 0 }));
