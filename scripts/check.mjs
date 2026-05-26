import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import vm from 'node:vm';

const requiredFiles = [
  'index.html',
  'config.js',
  'sw.js',
  'manifest.json',
  'wrangler.toml',
  'icon-192.png',
  'icon-512.png',
  'worker/index.js',
  'worker/proxy.js',
];

for (const file of requiredFiles) {
  await access(file);
}

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
for (const field of ['name', 'short_name', 'description', 'id', 'start_url', 'scope', 'display', 'icons']) {
  if (!manifest[field]) {
    throw new Error(`manifest.json is missing "${field}"`);
  }
}
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  throw new Error('manifest.json should include at least two icons');
}

const html = await readFile('index.html', 'utf8');
for (const asset of ['./config.js', './manifest.json', './icon-192.png']) {
  if (!html.includes(asset)) {
    throw new Error(`index.html does not reference ${asset}`);
  }
}

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
for (const [index, script] of inlineScripts.entries()) {
  new vm.Script(script, { filename: `index.html inline script ${index + 1}` });
}

await nodeCheck('config.js');
await nodeCheck('sw.js');
await nodeCheck('worker/index.js');
await nodeCheck('worker/proxy.js');

function nodeCheck(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`node --check failed for ${file}`));
      }
    });
  });
}
