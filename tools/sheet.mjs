// 使い方: node tools/sheet.mjs out.png "h=5.5&s=2" "h=7&s=0" ...   （シェーダーの見本帳。3列で並べる）
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = process.argv[2]; const cfgs = process.argv.slice(3);
const W = +(process.env.W || 720), H = +(process.env.H || 450);
const files = [];
for (let i = 0; i < cfgs.length; i++) {
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await pg.goto(`http://localhost:${port}/tools/shader-test.html?sc=1&ms=1&${cfgs[i]}`);
  await pg.waitForFunction(() => window.ready || document.title.startsWith('FAIL'), null, { timeout: 300000 });
  const f = `tools/_logs/sheet_${i}.png`; await pg.screenshot({ path: f }); files.push(f); await pg.close();
}
await b.close(); srv.close();
execFileSync('montage', [...files, '-tile', '3x', '-geometry', `${W}x${H}+4+4`, '-background', '#111', out]);
console.log('wrote', out);
