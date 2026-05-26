import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const distDir = 'dist';
const staticFiles = [
  'index.html',
  'config.js',
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

await writeFile(
  `${distDir}/_headers`,
  [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
    '/index.html',
    '  Cache-Control: no-cache',
    '',
    '/icon-*.png',
    '  Cache-Control: public, max-age=604800',
    '',
  ].join('\n'),
);

console.log(`Built ${staticFiles.length} files into ${distDir}/`);
