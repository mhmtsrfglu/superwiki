// Copies the version in package.json into the plugin manifests and prints it.
// The release workflow runs this after `npm version`, so every manifest names the same release.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const file of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  const path = join(root, file);
  const text = readFileSync(path, 'utf8');
  const next = text.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
  if (next === text && !text.includes(`"version": "${version}"`)) throw new Error(`${file} has no "version" field`);
  writeFileSync(path, next);
}
console.log(version);
