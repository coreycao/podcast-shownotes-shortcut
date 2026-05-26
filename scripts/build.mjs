import { cp, mkdir, rm } from 'node:fs/promises';

const distDir = 'dist';
const staticFiles = [
  'index.html',
  'app.css',
  'app.js',
  'config.js',
  'sanitize.js',
  'sw.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const file of staticFiles) {
  await cp(file, `${distDir}/${file}`);
}

console.log(`Built ${staticFiles.length} files into ${distDir}/`);
