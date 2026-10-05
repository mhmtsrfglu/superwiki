// Builds the public demo: the viewer with the example vault baked in, as a static site in site/.
// Run after scripts/build.mjs. Deployed to GitHub Pages by .github/workflows/pages.yml.
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vaultData, dataScript } from '../src/cli.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
mkdirSync(site, { recursive: true });

const URL = 'https://mhmtsrfglu.github.io/superwiki/';
const TITLE = 'Superwiki: an LLM-maintained wiki and task tracker for Claude Code, Codex and Copilot';
const DESCRIPTION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).description;
// The same image is uploaded by hand as the repository's social preview on GitHub.
const PREVIEW = 'social-preview.png';
// The viewer a project gets has a bare head. Only the public demo is meant to be found and
// shared, so what search engines and link previews read is added here.
const VIEWER_TITLE = '<title>Superwiki viewer</title>';
const DEMO_HEAD = `<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="${URL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Superwiki">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${URL}">
<meta property="og:image" content="${URL}${PREVIEW}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">`;

const viewer = readFileSync(join(root, 'skills/sw-init/assets/viewer.html'), 'utf8');
if (!viewer.includes(VIEWER_TITLE)) throw new Error(`the viewer no longer has ${VIEWER_TITLE}; update scripts/build-demo.mjs`);

const data = vaultData(join(root, 'examples/demo/docs'));
data.name = 'Ladle (demo vault)';
data.config = { areas: { B: 'Backend', M: 'Mobile', W: 'Web' } };
writeFileSync(join(site, 'index.html'), viewer.replace(VIEWER_TITLE, () => DEMO_HEAD));
copyFileSync(join(root, 'assets', PREVIEW), join(site, PREVIEW));
// Not under .sw/: static hosts may skip folders that start with a dot. The viewer looks for both names.
writeFileSync(join(site, 'sw-data.js'), dataScript(data));
console.log(`built site/ (${data.files.length} demo files)`);
