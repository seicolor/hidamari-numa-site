// 使い方: node tools/shot-test.mjs "h=7&s=0" out.png [w] [h]
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = +(process.argv[4] || 1440), H = +(process.argv[5] || 900);
const pg = await b.newPage({ viewport: { width: W, height: H } });
pg.on('console', (m) => console.log('console', m.type(), m.text()));
pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const t0 = Date.now();
await pg.goto(`http://localhost:${port}/tools/shader-test.html?${process.argv[2] || ''}`);
await pg.waitForFunction(() => window.ready || document.title.startsWith('FAIL'), null, { timeout: 300000 });
console.log('title', await pg.title(), (Date.now() - t0) + 'ms');
await pg.screenshot({ path: process.argv[3] || 'tools/_logs/t.png' });
await b.close(); srv.close();
