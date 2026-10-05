// ヒーローで糸をたらして、ウキの絵（浮いているところ・沈むところ）を撮る
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
await pg.goto(`http://localhost:${srv.address().port}/index.html?q=0&sc=0.3`);
await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 120000 });
await pg.click('[data-enter="quiet"]'); await pg.waitForTimeout(5000);
await pg.mouse.click(700, 690);
const t0 = Date.now(); let shots = 0;
while (Date.now() - t0 < 90000 && shots < 3) {
  const h = await pg.textContent('#hero-hint-t');
  if (shots === 0 && h.includes('見つめ')) { await pg.waitForTimeout(600); await pg.screenshot({ path: 'tools/_logs/fl_float.png', clip: { x: 340, y: 430, width: 700, height: 420 } }); shots++; }
  if (shots === 1 && h.includes('動いた')) { await pg.screenshot({ path: 'tools/_logs/fl_tick.png', clip: { x: 340, y: 430, width: 700, height: 420 } }); shots++; }
  if (shots === 2 && h.includes('いま')) { await pg.screenshot({ path: 'tools/_logs/fl_bite.png', clip: { x: 340, y: 430, width: 700, height: 420 } }); shots++; }
  await pg.waitForTimeout(120);
}
console.log('shots', shots);
await b.close(); srv.close();
