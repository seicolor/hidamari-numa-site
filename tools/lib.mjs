// ゲーム（ひだまり沼）の画面を、ヘッドレスChromiumで撮るための道具。
// 環境変数: GAME_DIR（ゲームのリポジトリ） / PLAYWRIGHT（playwrightの場所） / CHROME（Chromiumの実行ファイル）
import http from 'http'; import fs from 'fs'; import path from 'path';
const PW = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
export const GAME = process.env.GAME_DIR || '/home/user/fishing_inaka';
export const RAW = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/_raw');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2' };
export function serve() {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(GAME, p);
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end('nf'); return; }
      // 撮影用: デバッグハンドルに env / resize を足す（ゲーム側のファイルは変えない）
      if (p === '/src/main.js') d = Buffer.from(d.toString().replace('window.__g = { daily,', 'window.__g = { env, resize, daily,'));
      // 撮影用: 宣伝の絵では色収差を弱める
      if (p === '/src/postfx.js') d = Buffer.from(d.toString().replace('c * r2 * 0.012', 'c * r2 * 0.0025'));
      r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(d);
    });
  }).listen(0);
  return { srv, port: srv.address().port };
}
export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openGame(browser, port, qs, { w = 1600, h = 900, dpr = +(process.env.DPR || 1.5), ui = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.logs = [];
  page.on('pageerror', (e) => page.logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?noadapt=1&ts=0&dtmax=0.1&${qs}`, { timeout: 900000 });
  await page.waitForFunction(() => window.__g && !document.querySelector('#startbtn').disabled, null, { timeout: 900000 });
  await page.evaluate((ui) => { __g.start(); __g.player.mouseLook = false; if (!ui) document.getElementById('ui').style.display = 'none'; }, ui);
  return page;
}
export const frames = (page, n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
export const look = (page, yaw, pitch, fov = 62) => page.evaluate(([y, p, f]) => { __g.player.baseYaw = y; __g.player.basePitch = p; __g.player.fov = __g.player.targetFov = f; }, [yaw, pitch, fov]);
export const shot = async (page, name, opt = {}) => { await page.screenshot({ path: path.join(RAW, name + '.png'), timeout: 900000, ...opt }); console.log('shot', name); };
