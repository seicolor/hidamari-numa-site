// キーボードだけで、釣りが遊べるか（水面ボタンにフォーカス → Enter で投げる → 「いま」で Enter）
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(`http://localhost:${srv.address().port}/index.html?q=0&sc=0.3`);
await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 120000 });
// 入口: キーボードで「静かに入る」へ
await pg.keyboard.press('Tab'); await pg.keyboard.press('Tab');
const f1 = await pg.evaluate(() => document.activeElement.textContent.trim());
console.log('focused in gate:', f1);
await pg.focus('[data-enter="quiet"]'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(3500);
// 本文へ（ヒーロー）からタブで、水面ボタンへ
let reached = false;
for (let i = 0; i < 20; i++) { await pg.keyboard.press('Tab'); const id = await pg.evaluate(() => document.activeElement.id); if (id === 'water-hit') { reached = true; break; } }
console.log('tab reaches water button:', reached);
await pg.keyboard.press('Enter');
const t0 = Date.now(); let strikes = 0, final = '';
while (Date.now() - t0 < 100000) {
  const h = await pg.textContent('#hero-hint-t');
  if (h.includes('いま')) { await pg.keyboard.press('Enter'); strikes++; break; }
  if (h.includes('逃げ')) break;
  await pg.waitForTimeout(100);
}
await pg.waitForTimeout(5000);
const opened = await pg.evaluate(() => !document.getElementById('catch').hidden);
console.log('struck with Enter:', strikes, 'catch card opened:', opened, '| log:', await pg.textContent('#hero-log'));
if (opened) { await pg.keyboard.press('Tab'); await pg.keyboard.press('Tab'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(800); console.log('closed by Esc:', await pg.evaluate(() => document.getElementById('catch').hidden)); }
console.log('page errors:', errs.length);
await b.close(); srv.close();
