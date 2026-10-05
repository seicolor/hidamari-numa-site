// ひだまり沼 紹介ページ — 起動と、毎フレームの進行
import { createGL } from './gl.js';
import { world, measure, sections, update as updateWorld, setSeason } from './world.js';
import { initScroll } from './scroll.js';
import { createFishing } from './fishing.js';
import { createNight } from './night.js';
import { initCards } from './cards.js';
import { initUI } from './ui.js';
import { sound } from './sound.js';
import { $, $$, clamp, reduced, coarse } from './util.js';

window.__booted = true;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);
const body = document.body;
body.classList.add('is-loading');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 背景（WebGL） ----
const P = new URLSearchParams(location.search);   // ?q=0〜2 &sc=0.4 … 確認用に画質を指定できる
const small = coarse || innerWidth < 760;
const gl = P.has('nogl') ? { ok: false } : createGL($('#scene'), { quality: P.has('q') ? +P.get('q') : small ? 1 : 2, maxScale: small ? 1.25 : 1.5 });
if (gl.ok && P.has('sc')) { gl.scale = +P.get('sc'); gl.minScale = Math.min(gl.minScale, gl.scale); gl.resize(); }
if (gl.ok) gl.animate = !reduced; else document.documentElement.classList.add('no-gl');
if (!gl.ok) { gl.S = { season: [0, 0, 0, 0] }; gl.ripple = () => false; gl.render = () => {}; gl.resize = () => {}; gl.pointer = [0, 0]; }

// ---- 各部 ----
const scroll = initScroll();
let ui = null;
const fishing = createFishing({
  gl, frame: $('#hero-frame'), canvas: $('#rodfx'), hit: $('#water-hit'), hint: $('#hero-hint-t'), hintEl: $('#hero-hint'), log: $('#hero-log'),
  onCatch: (sp, cm, fresh) => ui.showCatch(sp, cm, fresh),
});
const night = createNight({ frame: $('.night-frame'), canvas: $('#nightfx'), btnFw: $('#btn-fw'), btnMeteor: $('#btn-meteor'), wishEl: $('#wish') });
const cards = initCards();
ui = initUI({ scroll, fishing, gl });

// WebGL が使えないときは、空の色だけを CSS のグラデーションで代わりに見せる
const toCss = (c, e = 1) => `rgb(${c.map((v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v * e)), 1 / 2.2))).join(',')})`;
const paintFallback = (k) => {
  const hz = Math.round((1 - gl.horizon || 0.56) * 100);
  $('#scene').style.background = `linear-gradient(${toCss(k.zen, k.exposure)} 0%, ${toCss(k.hor, k.exposure)} ${hz - 1}%, ${toCss(k.water.map((v, i) => v * 2.2 + k.hor[i] * 0.15), k.exposure)} ${hz}%, ${toCss(k.water, k.exposure)} 100%)`;
};

// 夜のことばは、季節で少し変わる
const nightLine = $('#night-h .ln:nth-child(2) > span');
let nightSeason = '';
const chunks = (...a) => a.map((s) => `<span class="wd">${s}</span>`).join('');
const nightText = { spring: chunks('ほたるが', '寄ってくる。'), summer: chunks('ほたるが', '寄ってくる。'), autumn: chunks('ほたるが', '寄ってくる。'), winter: chunks('雪の粒が、', 'ひかる。') };

// ---- 計測 ----
let nightSec = null, fishSec = null;
const doMeasure = () => { measure(); scroll.measure && scroll.measure(); fishing.resize(); night.resize(); gl.resize(); nightSec = sections().find((s) => s.id === 'night'); fishSec = sections().find((s) => s.id === 'fish'); };
let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(doMeasure, 120); });
new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(doMeasure, 160); }).observe(document.documentElement);
addEventListener('load', () => setTimeout(doMeasure, 50));
addEventListener('pointermove', (e) => { gl.pointer[0] = (e.clientX / innerWidth - 0.5) * 2; gl.pointer[1] = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

// ---- 毎フレーム ----
let last = performance.now(), frame = 0, nextAmb = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (document.hidden || body.classList.contains('is-loading')) { last = now; return; }   // 入口のあいだ（画面がかくれているあいだ）は、描かない
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
  const k = updateWorld(dt, gl);
  scroll.update();
  if (!gl.ok && frame % 12 === 0) paintFallback(k);
  const vh = innerHeight, y = scrollY;
  if (world.winVisible && now > nextAmb && !reduced) { nextAmb = now + 3500 + Math.random() * 4500; gl.ripple(0.1 + Math.random() * 0.8, 0.04 + Math.random() * (gl.horizon - 0.14), 0.25 + Math.random() * 0.35); }
  if (world.winVisible || frame % 20 === 0) gl.render(now);
  if (y < vh * 1.3) fishing.update(dt);
  night.visible = !!nightSec && y + vh > nightSec.top && y < nightSec.bottom;
  night.update(dt);
  if (fishSec && y + vh > fishSec.top && y < fishSec.bottom) cards.update(dt);
  sound.update(dt, k);
  ui.mixTick();
  if (ui.cursor && ui.cursor._step) ui.cursor._step();
  const s = world.season; if (nightSeason !== s) { nightSeason = s; nightLine.innerHTML = nightText[s]; }
}

// タブが裏にまわったら、タイトルでそっと呼びかける
const TITLE = document.title;
document.addEventListener('visibilitychange', () => { document.title = document.hidden ? 'また、釣りにきてね — ひだまり沼' : TITLE; });

// ---- 確認用: ?fps で、フレーム時間と描画の倍率を出す ----
if (P.has('fps')) {
  const hud = document.createElement('div'); hud.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:4px;pointer-events:none';
  document.body.appendChild(hud); let n = 0, t0 = performance.now();
  const loop = (t) => { n++; if (t - t0 > 1000) { hud.textContent = `${n} fps  scale ${(gl.scale || 0).toFixed(2)}  ${gl.canvas ? gl.canvas.width + 'x' + gl.canvas.height : ''}`; n = 0; t0 = t; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// ---- 入口 ----
const gate = $('#gate'), bar = $('#gate .gate-bar'), msg = $('#gate-msg'), acts = $('#gate-actions');
const gp = (v, t) => { gate.style.setProperty('--gp', v); if (t) msg.textContent = t; };

// 入口のあいだは、うしろの画面に、キーボードでも触れないように
const setInert = (on) => $$('#main, #nav, .dots, .foot, .skip').forEach((el) => { el.inert = on; });

async function boot() {
  setInert(true);
  gp(0.1);
  await Promise.race([Promise.all([document.fonts.load('500 1em "Shippori Mincho"'), document.fonts.load('italic 1em "Cormorant Garamond"')]), sleep(2600)]);
  gp(0.4, '空をひろげています');
  doMeasure();
  await Promise.race([gl.ready || Promise.resolve(), sleep(20000)]);   // シェーダーの用意（画面を止めずに待つ）
  if (!gl.ok) document.documentElement.classList.add('no-gl');
  setSeason(world.season);
  document.documentElement.dataset.season = world.season;
  updateWorld(1, gl);
  await sleep(60); gl.render(performance.now());
  gp(0.75, '水面をならしています');
  // 最初に見える画像（できれば）を先に読みこんでおく
  await Promise.race([sleep(900), Promise.all($$('.card img').slice(0, 2).map((im) => (im.decode ? im.decode().catch(() => {}) : null)))]);
  gp(1, '準備ができました');
  acts.hidden = false;
  const first = sound.remembered ? $('[data-enter="sound"]') : $('[data-enter="quiet"]');
  first && first.focus({ preventScroll: true });
  requestAnimationFrame(tick);
}

async function enter(withSound, ev) {
  const x = ev && ev.clientX ? ev.clientX : innerWidth / 2, y = ev && ev.clientY ? ev.clientY : innerHeight * 0.6;
  gate.style.setProperty('--gx', `${(x / innerWidth) * 100}%`); gate.style.setProperty('--gy', `${(y / innerHeight) * 100}%`);
  if (withSound) { await sound.enable(); } else { try { localStorage.setItem('hnm.sound', '0'); } catch (e) { /* なにもしない */ } }
  ui.paintSound();
  body.classList.add('is-ready');
  gate.classList.add('is-open');
  body.classList.remove('is-loading');
  setInert(false);
  // 水面に、はじめの波紋
  setTimeout(() => { gl.ripple(0.5, 0.18, 1.2); sound.a?.plip(0.6, 0); }, 700);
  setTimeout(() => { gate.hidden = true; const hs = $('#hero'); hs.tabIndex = -1; hs.focus({ preventScroll: true }); }, 1700);
}
// ページ内のリンクは、ゆっくりスクロール（動きをおさえる設定のときは、すぐ移動）
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { const el = document.querySelector(a.getAttribute('href')); if (!el) return; e.preventDefault(); el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); try { history.replaceState(null, '', a.getAttribute('href')); } catch (err) { /* 埋めこみ先では無視 */ } }));
$$('[data-enter]').forEach((b) => b.addEventListener('click', (e) => enter(b.dataset.enter === 'sound', e)));

boot();

// 動作確認用（コンソールから world などを触れるように）
window.__hnm = { world, gl, scroll, fishing, night, sound, enter };
