// アクセシビリティの自動検査（axe-core）。AUDIT_DIR に axe-core を入れておく（npm i axe-core）
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const AUDIT = process.env.AUDIT_DIR || '/tmp/audit';
const require = createRequire(AUDIT + '/');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
const pg = await b.newPage({ viewport: { width: W, height: H } });
await pg.goto(`http://localhost:${srv.address().port}/index.html?q=0&sc=0.3`);
await pg.waitForSelector('#gate-actions:not([hidden])', { timeout: 120000 });
console.log('--- gate open ---');
await pg.evaluate(axeSrc);
const run = async (label) => {
  const res = await pg.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 3).join(' | ')) })); });
  console.log(label, 'violations:', res.length);
  for (const v of res) { console.log(` [${v.impact}] ${v.id} (${v.n}) ${v.help}`); v.nodes.forEach((n) => console.log('    ', n.slice(0, 260))); }
};
await run('gate');
await pg.click('[data-enter="quiet"]');
await pg.waitForTimeout(4000);
// 全体を一度スクロールして、あらわれを済ませる
const total = await pg.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += 700) { await pg.evaluate((y) => scrollTo(0, y), y); await pg.waitForTimeout(260); }
await pg.evaluate(() => { document.querySelectorAll('.rv,.ln,.statement,.sec-title,.beat-line,.play-title,.beat-sub,.gp').forEach((e) => e.classList.add('in')); });
await pg.evaluate(() => scrollTo(0, 0)); await pg.waitForTimeout(1500);
await run('page');
await b.close(); srv.close();
