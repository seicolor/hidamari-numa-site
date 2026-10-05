// 釣りの遊びの通し試験: 糸をたらす → ウキが沈むのを待つ → クリックで合わせる → カード → 図鑑の数
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text()); });
await pg.goto(`http://localhost:${srv.address().port}/index.html?q=0&sc=0.3`);
await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 120000 });
await pg.click('[data-enter="sound"]');   // 音あり（ヘッドレスでも AudioContext が動くか）
await pg.waitForTimeout(3500);
const hint = () => pg.textContent('#hero-hint-t');
console.log('hint0:', await hint());
// 早すぎる合わせ
await pg.mouse.click(640, 640);
await pg.waitForTimeout(1200);
console.log('hint after cast:', await hint());
await pg.mouse.click(640, 640);
await pg.waitForTimeout(500);
console.log('hint after early click:', await hint(), '|', await pg.textContent('#hero-log'));
await pg.waitForTimeout(1500);
// 本番
let got = false;
for (let round = 0; round < 6 && !got; round++) {
  await pg.mouse.click(600 + round * 40, 620 + round * 10);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const h = await hint();
    if (h.includes('いま')) { await pg.mouse.click(600 + round * 40, 620 + round * 10); break; }
    if (h.includes('逃げ')) break;
    await pg.waitForTimeout(150);
  }
  await pg.waitForTimeout(2500);
  got = await pg.evaluate(() => !document.getElementById('catch').hidden);
  console.log('round', round, 'catch card:', got, 'hint:', await hint());
}
if (got) {
  await pg.waitForTimeout(2200);
  await pg.screenshot({ path: 'tools/_logs/t_catch.png' });
  console.log('caught:', await pg.textContent('#catch-n'), await pg.textContent('#catch-size'), '|', await pg.textContent('#catch-new'));
  await pg.click('#catch-close');
  await pg.waitForTimeout(800);
  console.log('zukan counter:', await pg.textContent('#zukan-n'), 'localStorage:', await pg.evaluate(() => localStorage.getItem('hnm.zukan.v1')));
  console.log('focus after close:', await pg.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
}
console.log('errors:', errs.length);
await b.close(); srv.close();
