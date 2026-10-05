// ページの見直し用: 指定した位置までスクロールして撮影し、コンソールの異常も集める
// 使い方: node tools/review.mjs <prefix> <W> <H> '<[["hero",0],["noon",0.5,"vh"]]>' [season] [sound]
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end('nf'); console.log('404', p); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const port = srv.address().port;
const [prefix, W, H, targetsJson, season, snd] = process.argv.slice(2);
const targets = JSON.parse(targetsJson);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const mobile = +W < 700;
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
const pg = await ctx.newPage();
const logs = [];
pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) { logs.push(m.type() + ' ' + m.text()); console.log('console', m.type(), m.text()); } });
pg.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, e.stack ? e.stack.split('\n')[1] : ''); });
await pg.goto(`http://localhost:${port}/index.html${process.env.QS || ''}`);
await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 120000 });
if (season) await pg.evaluate((s) => { const h = window.__hnm; h.world.season = s; document.documentElement.dataset.season = s; h.world.sw = ['spring', 'summer', 'autumn', 'winter'].map((x) => (x === s ? 1 : 0)); }, season);
await pg.screenshot({ path: `tools/_logs/${prefix}_gate.png` });
await pg.click(snd === 'sound' ? '[data-enter="sound"]' : '[data-enter="quiet"]');
await pg.waitForTimeout(+(process.env.ENTER_WAIT || 3500));
if (process.env.PRE) { await pg.evaluate(process.env.PRE); await pg.waitForTimeout(1500); }
for (const t of targets) {
  const [id, off = 0, unit = 'vh', wait = 1800] = t;
  await pg.evaluate(([id, off, unit]) => { const el = document.getElementById(id); const y = el ? el.getBoundingClientRect().top + scrollY : 0; window.scrollTo(0, y + (unit === 'vh' ? off * innerHeight : off)); }, [id, off, unit]);
  await pg.waitForTimeout(wait);
  await pg.screenshot({ path: `tools/_logs/${prefix}_${id}_${off}.png` });
  console.log('shot', `${prefix}_${id}_${off}`);
}
console.log('LOGS', logs.length);
await b.close(); srv.close();
