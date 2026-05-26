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
    "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    '',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
    '/index.html',
    '  Cache-Control: no-cache',
    '',
    '/config.js',
    '  Cache-Control: no-cache',
    '',
    '/manifest.json',
    '  Cache-Control: public, max-age=3600',
    '',
    '/icon-*.png',
    '  Cache-Control: public, max-age=604800',
    '',
  ].join('\n'),
);

console.log(`Built ${staticFiles.length} files into ${distDir}/`);
