// 魚の絵（透明な背景）を、ゲームの3Dモデルから撮る。ゲーム全体は起動せず、モデルと thumbs.js だけを使う。
// 出力: assets/_raw/fish_<id>.png / koi_shaded.png / koi_wire.png
import http from 'http'; import fs from 'fs'; import path from 'path';
import { GAME, RAW, launch } from './lib.mjs';
const HTML = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script>
<style>@font-face{font-family:"Shippori Mincho";font-weight:600;src:url(/__font/ShipporiMincho-SemiBold.ttf)}@font-face{font-family:"Shippori Mincho";font-weight:700;src:url(/__font/ShipporiMincho-Bold.ttf)}@font-face{font-family:"Shippori Mincho";font-weight:400;src:url(/__font/ShipporiMincho-Regular.ttf)}</style>
<canvas id="c" width="64" height="64"></canvas>
<script type="module">
import * as THREE from 'three';
import { SPECIES, SPECIES_ORDER } from '/src/species.js';
import { renderFishCanvas } from '/src/thumbs.js';
import { makeGyotaku } from '/src/gyotaku.js';
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, alpha: true });
renderer.setSize(64, 64, false);
window.ids = SPECIES_ORDER;
window.draw = (id, W, H, wire) => {
  const orig = renderer.render.bind(renderer);
  if (wire) { const m = new THREE.MeshBasicMaterial({ color: 0xd9fbef, wireframe: true, transparent: true, opacity: 0.85 }); renderer.render = (s, c) => { s.overrideMaterial = m; orig(s, c); }; }
  try { return renderFishCanvas(renderer, SPECIES[id], W, H).toDataURL('image/png'); } finally { renderer.render = orig; }
};
window.gyo = async (id, cm) => { const sp = SPECIES[id]; const fc = renderFishCanvas(renderer, sp, 1600, 1000); const cv = await makeGyotaku(fc, { sp, cm, date: new Date(2026, 9, 5) }); return cv.toDataURL('image/png'); };
window.ready = true;
</script>`;
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/__font/')) { fs.readFile(path.join(RAW, '../fonts-src', p.slice(8)), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': 'font/ttf' }); r.end(d); }); return; }
  if (p === '/__fish.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(HTML); return; }
  fs.readFile(path.join(GAME, p), (e, d) => { if (e) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
}).listen(0);
const port = srv.address().port;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`http://localhost:${port}/__fish.html`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const ids = await page.evaluate(() => window.ids);
const save = (name, url) => { fs.writeFileSync(path.join(RAW, name + '.png'), Buffer.from(url.split(',')[1], 'base64')); console.log('saved', name); };
const only = process.argv[2];
if (only === 'gyotaku') { await page.evaluate(() => document.fonts.load('700 40px "Shippori Mincho"', 'ひだまり沼令和釣')); for (const [id, cm] of [['koi', 63.4], ['nishiki', 51.2], ['funa', 27.8]]) save('gyotaku_' + id, await page.evaluate(([id, cm]) => window.gyo(id, cm), [id, cm])); await browser.close(); srv.close(); console.log('finished'); process.exit(0); }
for (const id of ids) save('fish_' + id, await page.evaluate(([id]) => window.draw(id, 1200, 750, false), [id]));
save('koi_shaded', await page.evaluate(() => window.draw('koi', 1200, 750, false)));
save('koi_wire', await page.evaluate(() => window.draw('koi', 1200, 750, true)));
await browser.close(); srv.close();
console.log('finished');
