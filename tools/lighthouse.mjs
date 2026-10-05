// Lighthouse（アクセシビリティ・SEO・ベストプラクティス・性能）。AUDIT_DIR に lighthouse を入れておく（npm i lighthouse chrome-launcher）
// 使い方: node tools/lighthouse.mjs [mobile|desktop]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const AUDIT = process.env.AUDIT_DIR || '/tmp/audit';
const require = createRequire(AUDIT + '/');
const lighthouse = (await import(require.resolve('lighthouse'))).default;
const chromeLauncher = await import(require.resolve('chrome-launcher'));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' }); r.end(d); }); }).listen(0);
const chrome = await chromeLauncher.launch({ chromePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', chromeFlags: ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const form = process.argv[2] === 'desktop' ? 'desktop' : 'mobile';
const flags = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] };
const config = form === 'desktop' ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false }, throttlingMethod: 'simulate' } } : undefined;
const res = await lighthouse(`http://localhost:${srv.address().port}/index.html`, flags, config);
const lhr = res.lhr;
console.log(form, Object.entries(lhr.categories).map(([k, v]) => `${k}:${Math.round(v.score * 100)}`).join('  '));
const a = lhr.audits;
for (const id of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive', 'total-byte-weight']) if (a[id]) console.log(' ', id, a[id].displayValue);
const bad = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'manual');
console.log('--- under 0.9 ---');
bad.forEach((x) => console.log(` ${x.id} (${x.score}) ${x.title}${x.displayValue ? ' — ' + x.displayValue : ''}`));
fs.writeFileSync(`tools/_logs/lighthouse-${form}.json`, JSON.stringify({ cats: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, v.score])), bad: bad.map((x) => ({ id: x.id, score: x.score, title: x.title, items: (x.details && x.details.items || []).slice(0, 6) })) }, null, 1));
await chrome.kill(); srv.close();
