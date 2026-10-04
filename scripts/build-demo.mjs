// Builds the public demo: the viewer with the example vault baked in, as a static site in site/.
// Run after scripts/build.mjs. Deployed to GitHub Pages by .github/workflows/pages.yml.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vaultData, dataScript } from '../src/cli.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
mkdirSync(site, { recursive: true });

const data = vaultData(join(root, 'examples/demo/docs'));
data.name = 'Ladle (demo vault)';
data.config = { areas: { B: 'Backend', M: 'Mobile', W: 'Web' } };
writeFileSync(join(site, 'index.html'), readFileSync(join(root, 'skills/sw-init/assets/viewer.html')));
// Not under .sw/: static hosts may skip folders that start with a dot. The viewer looks for both names.
writeFileSync(join(site, 'sw-data.js'), dataScript(data));
console.log(`built site/ (${data.files.length} demo files)`);
