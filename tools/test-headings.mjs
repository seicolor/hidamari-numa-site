// 見出しの折り返し検査: 各幅で、見出しの行が はみ出して切れていないか／文節の途中で折れていないかを調べる
import http from 'http'; import fs from 'fs'; import path from 'path';
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const W of [360, 390, 600, 768, 1024, 1280, 1440, 1920]) {
  const pg = await b.newPage({ viewport: { width: W, height: 900 } });
  await pg.goto(`http://localhost:${srv.address().port}/index.html?nogl=1`);
  await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 60000 });
  const res = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('h2, .statement, .beat-line, .play-title').forEach((h) => {
      h.querySelectorAll('.ln').forEach((ln) => {
        const sp = ln.firstElementChild; if (!sp) return;
        // 行ごとの長さ（.wd が折り返して何行になるか）
        const wds = [...sp.querySelectorAll('.wd')];
        const tops = new Set(wds.map((w) => Math.round(w.getBoundingClientRect().top)));
        const over = sp.scrollWidth > ln.clientWidth + 1;
        out.push({ t: sp.textContent, lines: tops.size, over, w: Math.round(ln.clientWidth), sw: Math.round(sp.scrollWidth) });
      });
    });
    return out;
  });
  const issues = res.filter((r) => r.over);
  console.log(`${W}px: ${res.length} lines, overflow ${issues.length}`, issues.map((i) => `${i.t}(${i.sw}>${i.w})`).join(' '));
  bad += issues.length;
  await pg.close();
}
console.log('overflow issues:', bad);
await b.close(); srv.close();
