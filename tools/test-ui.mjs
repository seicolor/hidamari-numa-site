// 画面部品の通し試験: 季節の印・天気・音・音の層・予告編・コイの見くらべ・図鑑の横スクロール・ページ内リンク
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; let ok = 0, ng = 0;
pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text().slice(0, 200)); });
const check = (name, cond, extra = '') => { if (cond) ok++; else ng++; console.log(cond ? 'ok  ' : 'FAIL', name, extra); };
await pg.goto(`http://localhost:${srv.address().port}/index.html?q=0&sc=0.3`);
await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 120000 });
await pg.click('[data-enter="sound"]'); await pg.waitForTimeout(3500);
check('gate closed', await pg.evaluate(() => document.getElementById('gate').hidden || getComputedStyle(document.getElementById('gate')).visibility === 'hidden'));
check('sound on', await pg.evaluate(() => __hnm.sound.on));
check('audio ctx running', await pg.evaluate(() => !!(__hnm.sound.a)), '(headless)');
// 季節の印
await pg.click('.seal[data-s="winter"]'); await pg.waitForTimeout(400);
check('season winter', await pg.evaluate(() => document.documentElement.dataset.season === 'winter' && document.querySelector('.seal[data-s="winter"]').getAttribute('aria-pressed') === 'true'));
check('weather label snow-capable', true, await pg.textContent('#weather-l'));
await pg.click('#weather'); await pg.waitForTimeout(300);
check('weather on', await pg.evaluate(() => __hnm.world.rainT === 1), await pg.textContent('#weather-l'));
await pg.click('.seal[data-s="spring"]'); await pg.waitForTimeout(200);
await pg.click('#weather'); await pg.waitForTimeout(200);
check('weather off', await pg.evaluate(() => __hnm.world.rainT === 0), await pg.textContent('#weather-l'));
// 音ボタン
await pg.click('#sound'); await pg.waitForTimeout(500);
check('sound toggled off', await pg.evaluate(() => !__hnm.sound.on && document.getElementById('sound').dataset.on === 'false'));
await pg.click('#sound'); await pg.waitForTimeout(800);
check('sound toggled on', await pg.evaluate(() => __hnm.sound.on));
// ページ内リンク（魚拓へ）
await pg.click('.dots a[data-for="craft"]'); await pg.waitForTimeout(3500);
const y = await pg.evaluate(() => scrollY), cy = await pg.evaluate(() => document.getElementById('craft').getBoundingClientRect().top + scrollY);
check('anchor scroll', Math.abs(y - cy) < 60, `${Math.round(y)} vs ${Math.round(cy)}`);
// 音の層
await pg.click('label:has(input[data-mix="bugs"])'); await pg.waitForTimeout(200);
check('mix bugs off', await pg.evaluate(() => !document.querySelector('[data-mix="bugs"]').checked));
// コイの見くらべ
const box = await pg.locator('#koi-stage').boundingBox();
await pg.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await pg.mouse.down(); await pg.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 4 }); await pg.mouse.up();
const kx = await pg.evaluate(() => document.getElementById('koi-input').value);
check('koi slider drag', +kx < 30, kx);
// 図鑑の横スクロール
await pg.evaluate(() => document.getElementById('fish').scrollIntoView()); await pg.waitForTimeout(600);
const sl0 = await pg.evaluate(() => document.getElementById('rail').scrollLeft);
await pg.click('#rail-next'); await pg.waitForTimeout(1200);
const sl1 = await pg.evaluate(() => document.getElementById('rail').scrollLeft);
check('rail next', sl1 > sl0 + 100, `${sl0}→${sl1}`);
// 予告編
await pg.evaluate(() => document.getElementById('play').scrollIntoView()); await pg.waitForTimeout(800);
await pg.click('#btn-trailer'); await pg.waitForTimeout(1200);
check('trailer open', await pg.evaluate(() => !document.getElementById('trailer').hidden && !!document.getElementById('trailer-v').src));
check('sound muted for trailer', await pg.evaluate(() => !__hnm.sound.on));
await pg.keyboard.press('Escape'); await pg.waitForTimeout(900);
check('trailer closed by Esc', await pg.evaluate(() => document.getElementById('trailer').hidden));
await pg.waitForTimeout(800);
check('sound restored', await pg.evaluate(() => __hnm.sound.on));
// 夜: 花火・流れ星
await pg.evaluate(() => document.getElementById('night').scrollIntoView()); await pg.waitForTimeout(1500);
await pg.click('#btn-fw'); await pg.click('#btn-meteor'); await pg.waitForTimeout(1500);
check('wish shown', (await pg.textContent('#wish')).length > 3, await pg.textContent('#wish'));
console.log(`result: ${ok} ok, ${ng} failed, ${errs.length} page errors`);
await b.close(); srv.close();
