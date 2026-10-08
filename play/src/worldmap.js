// 旅の地図: ひだまりシリーズの釣り場をえらんで、移動する画面
// 夜の地球儀（陸は点の並び。昼と夜の境目は、いまの実際の時刻）。ピンを押して「出かける」と、紙飛行機が大円の上を飛ぶ。
// 釣り場を変えるとページを読み込み直すので、飛んでいる時間に読み込みの時間を重ねる。
//   出発（いまのページ）: いまの場所へ寄り、飛びはじめたところで次のページへ（URL は ?place=行き先&from=出発地）
//   到着（次のページ）: 同じところから飛行を続ける。読み込みの進みが、そのまま飛行機の進みになる。
//                      読み込みがおわると降りていき、景色が円く開いて「ようこそ」と、はんこが押される。
// このファイルは index.html から main.js より先に読み込む（重い three.js を待たずに、到着の続きを描きはじめるため）。
import { PLACE_ID, PLACES, PLACE_IDS, SOON, FIRST_VISIT, LAST_PLACE } from './place.js';
import { LAND } from './worlddots.js';

const D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap180 = (d) => ((((d + 540) % 360) + 360) % 360) - 180;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 飛行の進み（0〜1）: 0〜0.13 いまの場所へ寄る／0.13〜0.72 飛ぶ／0.72〜1 降りる。0.3 でページを読み込み直す
const P_ZOOM = 0.13, P_HAND = 0.3, P_FLY = 0.72;

// ---- 釣り場と、準備中のピン
const SPOTS = [
  ...PLACE_IDS.map((id) => ({ id, name: PLACES[id].title, ...PLACES[id].geo })),
  ...SOON.map((s, i) => ({ id: `soon${i}`, soon: true, ...s })),
];
const spot = (id) => SPOTS.find((s) => s.id === id);

// ---- 時刻（現地の時刻・時差）
function parts(tz, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t) => +p.find((x) => x.type === t).value;
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour') % 24, mi: g('minute') };
}
export function localHour(tz, d = new Date()) { try { const q = parts(tz, d); return q.h + q.mi / 60; } catch (e) { return d.getHours() + d.getMinutes() / 60; } }
function localTime(tz) { const h = localHour(tz), hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
function tzOffset(tz, d = new Date()) { try { const q = parts(tz, d); return Math.round((Date.UTC(q.y, q.mo - 1, q.d, q.h, q.mi) - d.getTime()) / 36e5); } catch (e) { return 0; } }
const partOfDay = (h) => (h < 4.5 ? '夜' : h < 10 ? '朝' : h < 15.5 ? '昼' : h < 18.5 ? '夕方' : '夜');
const ymd = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
function ago(ms) {
  if (!ms) return '—';
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(ms); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 864e5);
  return n <= 0 ? 'きょう' : n === 1 ? 'きのう' : n < 30 ? `${n}日前` : ymd(new Date(ms));
}

// ---- 太陽の真下（いまの時刻）・大円
function subsolar(d = new Date()) {
  const N = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return { lat: 23.44 * Math.sin((2 * Math.PI * (284 + N)) / 365), lon: -15 * (h - 12) };
}
function gcKm(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const vec = (lat, lon) => { const c = Math.cos(lat * D2R); return [c * Math.cos(lon * D2R), Math.sin(lat * D2R), c * Math.sin(lon * D2R)]; };
const toLL = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return { lat: Math.asin(v[1] / l) / D2R, lon: Math.atan2(v[2], v[0]) / D2R }; };
function slerp(a, b, t) {
  const w = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  if (w < 1e-5) return a.slice();
  const s = Math.sin(w), ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

// ---- 陸の点（Natural Earth を、点の並びにしたもの）
let DOT = null;
function dots() {
  if (DOT) return DOT;
  const la = [], lo = [], fi = [];
  for (const [lat, n, r] of LAND.g) for (let i = 0; i < r.length; i += 2) for (let j = r[i]; j < r[i] + r[i + 1]; j++) { la.push(lat); lo.push(-180 + ((j + 0.5) * 360) / n); fi.push(0); }
  for (const [reg, f] of [[LAND.j, 1], [LAND.h, 2]]) for (const [lat, dl, r] of reg.rows) for (let i = 0; i < r.length; i += 2) for (let j = r[i]; j < r[i] + r[i + 1]; j++) { la.push(lat); lo.push(reg.lon0 + (j + 0.5) * dl); fi.push(f); }
  const n = la.length, sLa = new Float32Array(n), cLa = new Float32Array(n), lon = new Float32Array(n), lat = new Float32Array(n), fine = new Uint8Array(n);
  for (let i = 0; i < n; i++) { sLa[i] = Math.sin(la[i] * D2R); cLa[i] = Math.cos(la[i] * D2R); lon[i] = lo[i] * D2R; lat[i] = la[i]; fine[i] = fi[i]; }
  DOT = { n, sLa, cLa, lon, lat, lonDeg: Float32Array.from(lo), fine };
  return DOT;
}

// ---- 記録（釣り場ごとのまとめ・旅のはんこ）
const K_SUM = 'hidamari-summary', K_STAMP = 'hidamari-stamps';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
function summaryOf(id) {
  const all = store.get(K_SUM) || {};
  if (all[id]) return all[id];
  // まとめがまだない（この地図ができる前に遊んだ）ときは、その釣り場の記録から数える
  const d = store.get(PLACES[id].saveKey);
  if (!d || !d.catches) return null;
  const c = d.catches;
  return { got: Object.keys(c).filter((k) => c[k] && c[k].count > 0 && k !== 'boot' && k !== 'nushi').length, total: 0, nushi: !!(c.nushi && c.nushi.count > 0), last: 0 };
}
export function writeSummary(sum) {
  const all = store.get(K_SUM) || {};
  all[PLACE_ID] = sum;
  store.set(K_SUM, all);
}

// ---- 点の色（昼〜夜の 8 段）
const DAYC = [214, 236, 246], NIGHTC = [64, 98, 124];
const BUCKETS = Array.from({ length: 8 }, (_, k) => { const t = k / 7; return `rgb(${Math.round(lerp(NIGHTC[0], DAYC[0], t))},${Math.round(lerp(NIGHTC[1], DAYC[1], t))},${Math.round(lerp(NIGHTC[2], DAYC[2], t))})`; });

class WorldMap {
  constructor() {
    this.el = null;
    this.isOpen = false;     // 地図が出ている（ゲームの操作を止める）
    this.covering = false;   // 地図が画面をすっかりおおっている（ゲームの描画を休める）
    this.mode = null;        // 'browse' | 'depart' | 'arrive'
    this.arriving = null;    // 到着の続きを再生しているとき { from }
    this.hooks = {};         // main.js から: summary() kept() onOpen() onClose() onTravel(id) onReveal() onStart()
    this.cam = { lat: 25, lon: -170, zoom: 1 };
    this.shiftX = 0; this.shiftY = 0;
    this.sel = null;
    this.travel = null;
    this.loadP = 0; this.loadText = ''; this.isLoaded = false; this.sceneOK = false;
    this.W = 0; this.H = 0; this.DPR = 1;
    this.running = false;
    this.stars = null;
    this.drag = null;
    this.calm = this._savedCalm();
    this._frame = this._frame.bind(this);
  }

  // 動きをおさえる設定（ゲームが読みこむ前は、その釣り場の記録と端末の設定から）
  _savedCalm() {
    const d = store.get(PLACES[PLACE_ID].saveKey);
    const c = d && d.settings ? d.settings.calm : null;
    let pr = false;
    try { pr = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
    return c == null ? pr : !!c;
  }

  // ---------------------------------------------------------------- 入口
  // URL に from= があれば、到着の続きを再生する
  boot() {
    if (FIRST_VISIT) { this.chooser(); return; }
    let from = null;
    try { from = new URLSearchParams(location.search).get('from'); } catch (e) { /* ignore */ }
    if (!from || !PLACES[from] || from === PLACE_ID) return;
    // 読み込み直したときに、もう一度再生しないように
    try { const u = new URL(location.href); u.searchParams.delete('from'); history.replaceState(history.state, '', u.toString()); } catch (e) { /* ignore */ }
    this.arriving = { from };
    this._build();
    const a = spot(from), b = spot(PLACE_ID);
    this.mode = 'arrive';
    this.isOpen = true;
    this.el.hidden = false;
    this.el.classList.add('in', 'busy', 'arrive');
    this.travel = { from: a, to: b, km: gcKm(a, b), t0: performance.now(), p: P_HAND, c0: null };
    this._camAt(P_HAND);
    this._tripPanel();
    this._updateWhere();
    this.xBtn.hidden = true;
    this.help.hidden = true;
    this.skipBtn.hidden = false;
    this._run();
  }

  // 開いたとき: どちらの釣り場から始めるかを、えらんでもらう。
  // 裏では前回の釣り場（はじめてなら既定）の読み込みが進んでいる。同じならそのまま、ちがう釣り場なら、そのページを開き直す
  chooser() {
    const el = document.createElement('div');
    el.id = 'wchoose';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'wcT');
    const card = (id) => {
      const P = PLACES[id], g = P.geo;
      return `<button type="button" class="wc-card${id === LAST_PLACE ? ' last' : ''}" data-id="${id}">
        <span class="wc-seal" aria-hidden="true">${esc(g.mark)}</span>
        ${id === LAST_PLACE ? '<span class="wc-last">前回の釣り場</span>' : ''}
        <span class="wc-nm">${esc(P.title)}</span>
        <span class="wc-rg">${esc(g.region)}</span>
        <span class="wc-ld">${P.lead}</span>
        <span class="wc-tm">現地 いま ${localTime(g.tz)}（${partOfDay(localHour(g.tz))}）</span>
        <span class="wc-go">ここから始める →</span>
      </button>`;
    };
    el.innerHTML = `
      <div class="wc-in">
        <div class="wc-k">ひだまりシリーズ</div>
        <h2 id="wcT">どちらの釣り場から始めますか</h2>
        <div class="wc-row">${PLACE_IDS.map(card).join('')}</div>
        <p class="wc-note">あとから、右上の「地図」で、いつでも行き来できます。図鑑や記録は、釣り場ごとに別です。</p>
      </div>`;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const first = el.querySelector('.wc-card.last') || el.querySelector('.wc-card');
    if (first) first.focus({ preventScroll: true });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.wc-card');
      if (!b || el.dataset.done) return;
      el.dataset.done = '1';
      const id = b.dataset.id;
      try { localStorage.setItem('hidamari-place', id); } catch (err) { /* ignore */ }
      if (id === PLACE_ID) {
        el.classList.remove('in');
        setTimeout(() => el.remove(), 500);
        return;
      }
      el.classList.add('going');
      const u = new URL(location.href);
      u.searchParams.set('place', id);
      location.assign(u.toString());
    });
  }

  open() {
    if (this.isOpen) return;
    this._build();
    this.mode = 'browse';
    this.isOpen = true;
    this.travel = null;
    Object.assign(this.cam, this._restView());
    this.shiftX = this.shiftY = 0;
    this.el.hidden = false;
    this.el.classList.remove('busy', 'arrive', 'revealing', 'fading', 'revealed', 'out');
    this.sky.hidden = false;
    this.arr.hidden = true;
    this.xBtn.hidden = false;
    this.help.hidden = false;
    this._updateWhere();
    this._run();
    void this.el.offsetWidth;
    this.el.classList.add('in');
    // ほかの釣り場がひとつなら、はじめから選んでおく（行き先の線が見える）
    const others = PLACE_IDS.filter((id) => id !== PLACE_ID);
    if (others.length === 1) this.select(others[0], true);
    this.xBtn.focus({ preventScroll: true });
    clearTimeout(this._cov);
    this._cov = setTimeout(() => { if (this.isOpen && this.mode !== 'arrive') this.covering = true; }, 480);
    this.hooks.onOpen && this.hooks.onOpen();
  }

  close() {
    if (!this.isOpen || this.mode !== 'browse') return;
    clearTimeout(this._cov);
    this.covering = false;
    this.isOpen = false;
    this.closeCard();
    this.el.classList.remove('in');
    setTimeout(() => { if (!this.isOpen) { this.el.hidden = true; this.running = false; } }, 480);
    this.hooks.onClose && this.hooks.onClose();
  }

  // 読み込みの進み（main.js の読み込み画面から）
  loading(p, text) {
    if (p > this.loadP) this.loadP = Math.min(1, p);
    if (text) this.loadText = text;
    if (this.mode === 'arrive') this._loadUI();
  }
  loaded() { this.isLoaded = true; this.loadP = 1; if (this.mode === 'arrive') this._loadUI(); }
  // 景色が描けた。景色を開くまでは、ゲームの描画を休めて、降りていく地図をなめらかに
  sceneReady() {
    this.sceneOK = true;
    if (this.mode === 'arrive' && this.travel && !this.travel.revealed) this.covering = true;
  }
  // 読み込みに失敗したとき（ゲームのエラー表示が見えるように、地図を消す）
  abort() {
    if (!this.el) return;
    this.isOpen = false; this.covering = false; this.running = false; this.mode = null;
    this.el.hidden = true;
  }

  // ---------------------------------------------------------------- 画面を組む
  _build() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'wmap';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '旅の地図');
    el.innerHTML = `
      <div class="wm-sky">
        <canvas class="wm-cv" aria-label="釣り場の地図。ドラッグで地球をまわせます"></canvas>
        <div class="wm-top"><b>旅の地図</b><span class="wm-where"></span><span class="wm-clock"></span></div>
        <button type="button" class="wm-x" aria-label="地図をとじる" title="とじる (Esc)">×</button>
        <div class="wm-pins"></div>
        <div class="wm-card off" role="group" aria-label="釣り場のくわしいこと"></div>
        <div class="wm-trip off" aria-live="polite"></div>
        <button type="button" class="wm-ghost wm-skip" hidden>とばす</button>
        <div class="wm-help">ドラッグで地球をまわす・ピンをえらぶ</div>
      </div>
      <div class="wm-arr" hidden>
        <svg class="wm-stamp" viewBox="0 0 200 200" aria-hidden="true"></svg>
        <div class="wm-tx off"></div>
      </div>`;
    document.body.append(el);
    this.el = el;
    const $ = (s) => el.querySelector(s);
    this.sky = $('.wm-sky'); this.cv = $('.wm-cv'); this.ctx = this.cv.getContext('2d');
    this.pinsEl = $('.wm-pins'); this.card = $('.wm-card'); this.trip = $('.wm-trip');
    this.skipBtn = $('.wm-skip'); this.xBtn = $('.wm-x'); this.help = $('.wm-help');
    this.whereEl = $('.wm-where'); this.clockEl = $('.wm-clock');
    this.arr = $('.wm-arr'); this.stampEl = $('.wm-stamp'); this.tx = $('.wm-tx');
    // ピン（文字をくっきり見せるため DOM で）
    this.pinEls = {};
    for (const s of SPOTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wm-pin' + (s.soon ? ' soon' : '');
      b.innerHTML = s.soon ? '<i></i><span class="lb"><b>準備中</b></span>' : `<i></i><span class="lb"><b>${esc(s.name)}</b><small>${esc(s.short)}</small></span>`;
      b.setAttribute('aria-label', s.soon ? '準備中の釣り場' : `${s.name}（${s.region}）`);
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this.mode === 'browse') this.select(s.id); });
      this.pinsEl.append(b);
      this.pinEls[s.id] = b;
    }
    this.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'close') this.closeCard();
      else if (b.dataset.x === 'go' && this.mode === 'browse') this.depart(this.sel);
    });
    this.xBtn.addEventListener('click', () => this.close());
    this.skipBtn.addEventListener('click', () => { if (this.travel) this.travel.skip = true; });
    // ドラッグで地球をまわす
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'browse') return;
      this.drag = { x: e.clientX, y: e.clientY, lat: this.cam.lat, lon: this.cam.lon, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    cv.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      const k = (0.32 / this.cam.zoom) * (400 / Math.max(200, Math.min(this.W, this.H)));
      this.cam.lon = d.lon - dx * k;
      this.cam.lat = clamp(d.lat + dy * k, -60, 70);
    });
    const up = () => { if (this.drag && !this.drag.moved) this.closeCard(); this.drag = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { this.drag = null; });
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' && this.mode === 'browse') {
        e.preventDefault();
        if (!this.card.classList.contains('off')) this.closeCard(); else this.close();
      } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.mode === 'arrive' && this.travel && this.travel.shown) {
        e.preventDefault();
        this._start();
      }
    });
    addEventListener('resize', () => { this._needResize = true; });
    this._resize();
  }

  _resize() {
    this._needResize = false;
    this.DPR = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(200, this.el.clientWidth || innerWidth);
    this.H = Math.max(200, this.el.clientHeight || innerHeight);
    this.cv.width = Math.round(this.W * this.DPR);
    this.cv.height = Math.round(this.H * this.DPR);
    this.stars = null;
    this._cardBox = null;
  }

  _run() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._frame);
  }

  _updateWhere() {
    const p = spot(PLACE_ID);
    this.whereEl.textContent = this.mode === 'arrive' ? `${this.travel.from.name}から、${p.name}へ` : `いまいる場所　${p.name}（${p.short}）`;
  }

  // 2つの釣り場がどちらも見える向き
  _restView() {
    const ids = PLACE_IDS.map(spot);
    let v = [0, 0, 0];
    for (const s of ids) { const q = vec(s.lat, s.lon); v = [v[0] + q[0], v[1] + q[1], v[2] + q[2]]; }
    const m = toLL(v);
    return { lat: m.lat - 4, lon: m.lon, zoom: 1 };
  }

  // ---------------------------------------------------------------- 地球儀（正射図法）
  _baseR() { return Math.min(this.W, this.H) * 0.43; }
  _proj(latS, latC, lonR, c) {
    const s0 = Math.sin(c.lat * D2R), c0 = Math.cos(c.lat * D2R), dl = lonR - c.lon * D2R, cd = Math.cos(dl);
    return [latC * Math.sin(dl), c0 * latS - s0 * latC * cd, s0 * latS + c0 * latC * cd];
  }
  _pt(lat, lon, c, alt = 0) {
    const p = this._proj(Math.sin(lat * D2R), Math.cos(lat * D2R), lon * D2R, c);
    const R = this._baseR() * c.zoom * (1 + alt);
    return { x: this.W / 2 + this.shiftX + p[0] * R, y: this.H / 2 + this.shiftY - p[1] * R, z: p[2] };
  }

  _drawGlobe(c, sun) {
    const ctx = this.ctx, W = this.W, H = this.H, D = dots();
    const R = this._baseR() * c.zoom, cx = W / 2 + this.shiftX, cy = H / 2 + this.shiftY;
    const bg = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.max(W, H) * 0.9);
    bg.addColorStop(0, '#0c1a2a'); bg.addColorStop(1, '#03070d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 星
    if (!this.stars) {
      const n = Math.round((W * H) / 1800);
      this.stars = [];
      for (let i = 0; i < n; i++) { const s = Math.sin(i * 91.7) * 43758.5, s2 = Math.sin(i * 17.3 + 4) * 23421.6; this.stars.push([(s - Math.floor(s)) * W, (s2 - Math.floor(s2)) * H, 0.3 + 0.7 * ((i * 0.618) % 1)]); }
    }
    ctx.fillStyle = '#cfe3f0';
    for (const [x, y, a] of this.stars) { ctx.globalAlpha = a * 0.55; ctx.fillRect(x, y, 1, 1); }
    ctx.globalAlpha = 1;
    // 大気のふち
    const ag = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.18);
    ag.addColorStop(0, 'rgba(110,200,240,.35)'); ag.addColorStop(1, 'rgba(110,200,240,0)');
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2); ctx.fill();
    // 海（昼夜の陰りを小さな絵に描いて、引きのばす）
    const sunV = this._proj(Math.sin(sun.lat * D2R), Math.cos(sun.lat * D2R), sun.lon * D2R, c);
    this._shadeOcean(sunV);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.oc, cx - R, cy - R, 2 * R, 2 * R);
    // 陸の点（明るさ 8 段に分けて、まとめて描く）
    const bx = this._bx || (this._bx = BUCKETS.map(() => []));
    for (const b of bx) b.length = 0;
    const s0 = Math.sin(c.lat * D2R), c0 = Math.cos(c.lat * D2R), L0 = c.lon * D2R;
    const fineA = ss(1.5, 2.6, c.zoom);
    const sz = clamp(R * 0.0118, 1.1, 3.4), szF = clamp(R * 0.0026, 0.9, 2.6), szH = clamp(R * 0.0011, 0.8, 2.2);
    const fl = this._fl || (this._fl = []);
    fl.length = 0;
    for (let i = 0; i < D.n; i++) {
      const f = D.fine[i];
      if (f && fineA <= 0.01) continue;
      // 細かい点がすっかり出たら、日本のあたりの粗い点は消す
      if (!f && fineA > 0.99 && D.lat[i] > 23.5 && D.lat[i] < 50.5 && D.lonDeg[i] > 116.5 && D.lonDeg[i] < 151.5) continue;
      const dl = D.lon[i] - L0, cd = Math.cos(dl), cl = D.cLa[i], sl = D.sLa[i];
      const z = s0 * sl + c0 * cl * cd;
      if (z <= 0.02) continue;
      const x = cl * Math.sin(dl), y = c0 * sl - s0 * cl * cd;
      const px = cx + x * R, py = cy - y * R;
      if (px < -4 || py < -4 || px > W + 4 || py > H + 4) continue;
      const l = x * sunV[0] + y * sunV[1] + z * sunV[2];
      const b = ss(-0.12, 0.25, l) * (0.55 + 0.45 * Math.sqrt(z));
      if (f) { fl.push(px, py, b, f); continue; }
      bx[Math.min(7, Math.floor(b * 8))].push(px, py);
    }
    for (let k = 0; k < 8; k++) {
      const a = bx[k];
      if (!a.length) continue;
      ctx.fillStyle = BUCKETS[k]; ctx.globalAlpha = 0.45 + 0.55 * (k / 7);
      for (let j = 0; j < a.length; j += 2) ctx.fillRect(a[j] - sz / 2, a[j + 1] - sz / 2, sz, sz);
    }
    for (let j = 0; j < fl.length; j += 4) {
      const k = Math.min(7, Math.floor(fl[j + 2] * 8)), s = fl[j + 3] === 2 ? szH : szF;
      ctx.fillStyle = BUCKETS[k]; ctx.globalAlpha = fineA * (0.5 + 0.5 * (k / 7));
      ctx.fillRect(fl[j] - s / 2, fl[j + 1] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  _shadeOcean(sunV) {
    const N = 150;
    if (!this.oc) {
      this.oc = document.createElement('canvas');
      this.oc.width = this.oc.height = N;
      this.octx = this.oc.getContext('2d');
      this.oimg = this.octx.createImageData(N, N);
    }
    const d = this.oimg.data;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = ((px + 0.5) / N) * 2 - 1, y = -(((py + 0.5) / N) * 2 - 1), r2 = x * x + y * y, i = (py * N + px) * 4;
      if (r2 > 1) { d[i + 3] = 0; continue; }
      const z = Math.sqrt(1 - r2);
      const l = x * sunV[0] + y * sunV[1] + z * sunV[2];
      const day = ss(-0.12, 0.22, l), rim = Math.pow(1 - z, 2.6), tw = Math.exp(-(((l + 0.02) / 0.07) ** 2)) * 0.22;
      const R = lerp(7, 22, day) + rim * 40 + tw * 60, G = lerp(18, 64, day) + rim * 110 + tw * 34, B = lerp(34, 96, day) + rim * 150 + tw * 10;
      const spec = Math.pow(Math.max(0, l * z), 22) * 60 * day;
      d[i] = Math.min(255, R + spec); d[i + 1] = Math.min(255, G + spec); d[i + 2] = Math.min(255, B + spec); d[i + 3] = 255;
    }
    this.octx.putImageData(this.oimg, 0, 0);
  }

  // ---------------------------------------------------------------- 航路と紙飛行機
  _routePts(a, b, n = 80) {
    const va = vec(a.lat, a.lon), vb = vec(b.lat, b.lon), out = [];
    const dist = Math.acos(clamp(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], -1, 1));
    for (let i = 0; i <= n; i++) { const t = i / n; out.push({ ...toLL(slerp(va, vb, t)), alt: 0.16 * Math.sin(Math.PI * t) * Math.min(1, dist / 1.2) }); }
    return out;
  }
  _drawRoute(a, b, c, prog, preview) {
    const ctx = this.ctx;
    const key = `${a.id}>${b.id}`;
    if (this._rk !== key) { this._rk = key; this._rp = this._routePts(a, b); }
    const P = this._rp, n = P.length - 1, upto = Math.floor(prog * n);
    const sp = P.map((q) => this._pt(q.lat, q.lon, c, q.alt));
    const R = this._baseR() * c.zoom, cx = this.W / 2 + this.shiftX, cy = this.H / 2 + this.shiftY;
    const vis = (p) => p.z > -0.05 || Math.hypot(p.x - cx, p.y - cy) > R;
    ctx.save();
    ctx.strokeStyle = preview ? 'rgba(255,198,110,.55)' : 'rgba(255,214,140,.95)';
    ctx.lineWidth = preview ? 1.4 : 2.2;
    if (preview) ctx.setLineDash([3, 5]);
    ctx.shadowColor = 'rgba(255,190,100,.8)'; ctx.shadowBlur = preview ? 0 : 10;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= (preview ? n : upto); i++) {
      const p = sp[i];
      if (!vis(p)) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
    }
    if (!preview && prog > 0 && prog < 1) {
      const t = prog * n - upto, p0 = sp[upto], p1 = sp[Math.min(n, upto + 1)];
      if (pen && vis(p1)) ctx.lineTo(lerp(p0.x, p1.x, t), lerp(p0.y, p1.y, t));
    }
    ctx.stroke();
    ctx.restore();
    if (preview || prog <= 0 || prog >= 1) return;
    const i0 = Math.min(n - 1, upto), t = prog * n - i0, p0 = sp[i0], p1 = sp[i0 + 1];
    this._drawPlane(lerp(p0.x, p1.x, t), lerp(p0.y, p1.y, t), Math.atan2(p1.y - p0.y, p1.x - p0.x));
  }
  _drawPlane(x, y, ang) {
    const ctx = this.ctx, s = Math.max(9, Math.min(this.W, this.H) * 0.024);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.shadowColor = 'rgba(255,220,160,.9)'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.8, -s * 0.62); ctx.lineTo(-s * 0.42, 0); ctx.lineTo(-s * 0.8, s * 0.62); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(20,40,60,.35)';
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.42, 0); ctx.lineTo(-s * 0.8, s * 0.62); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _placePins(c, hideAll) {
    for (const s of SPOTS) {
      const el = this.pinEls[s.id];
      if (hideAll) { el.hidden = true; continue; }
      const q = this._pt(s.lat, s.lon, c);
      const ok = q.z > 0.08 && q.x > -40 && q.x < this.W + 10 && q.y > -20 && q.y < this.H + 20;
      el.hidden = !ok;
      if (ok) el.style.transform = `translate(${(q.x - 9).toFixed(1)}px, ${(q.y - 9).toFixed(1)}px)`;
      el.classList.toggle('cur', s.id === PLACE_ID);
    }
  }

  // ---------------------------------------------------------------- カード
  select(id, noFocus) {
    const s = spot(id);
    if (!s) return;
    this.sel = id;
    const c = this.card;
    if (s.soon) {
      c.innerHTML = `<div class="nm">準備中</div><div class="rg">これから増える釣り場です。いまは、まだ出かけられません。</div><div class="row"><span></span><button type="button" class="wm-ghost" data-x="close">とじる</button></div>`;
    } else {
      const here = id === PLACE_ID;
      const sum = here && this.hooks.summary ? this.hooks.summary() : summaryOf(id);
      const st = (store.get(K_STAMP) || {})[id];
      const kept = !here && this.hooks.kept ? this.hooks.kept() : 0;
      const zukan = sum ? (sum.total ? `${sum.got} / ${sum.total} 種` : `${sum.got} 種`) : 'まだ来ていません';
      c.innerHTML = `
        <div class="nm">${esc(s.name)}</div>
        <div class="rg">${esc(s.region)}</div>
        <dl>
          <dt>現地 いま</dt><dd>${localTime(s.tz)}（${partOfDay(localHour(s.tz))}）</dd>
          <dt>図鑑</dt><dd>${zukan}</dd>
          <dt>ぬし</dt><dd>${sum ? (sum.nushi ? '釣った' : 'まだ') : '—'}</dd>
          ${here ? '' : `<dt>最後に来た日</dt><dd>${sum && sum.last ? ago(sum.last) : '—'}</dd>`}
          <dt>旅のはんこ</dt><dd>${st ? `押した（${esc(st.first)}${st.n > 1 ? `・${st.n}回` : ''}）` : 'まだ'}</dd>
        </dl>
        ${here ? '' : `<div class="ex">着くと、現地のいまの時刻から始まります。${kept ? `びくの魚（${kept}匹）は、出かけるときに逃がします。` : ''}</div>`}
        <div class="row">${here ? '<span class="here">いま、ここにいます</span><button type="button" class="wm-ghost" data-x="close">とじる</button>' : '<button type="button" class="wm-ghost" data-x="close">とじる</button><button type="button" class="wm-go" data-x="go">出かける →</button>'}</div>`;
    }
    c.classList.remove('off');
    this._cardBox = null;
    this.help.classList.add('dim');
    if (!noFocus) (c.querySelector('[data-x="go"]') || c.querySelector('[data-x="close"]')).focus({ preventScroll: true });
  }
  closeCard() {
    if (!this.card) return;
    this.card.classList.add('off');
    this.sel = null;
    this.help.classList.remove('dim');
  }

  // ---------------------------------------------------------------- 旅
  depart(toId) {
    const from = spot(PLACE_ID), to = spot(toId);
    if (!to || to.soon || toId === PLACE_ID) return;
    this.closeCard();
    this.mode = 'depart';
    clearTimeout(this._cov);
    this.covering = true;
    this.el.classList.add('busy');
    this.xBtn.hidden = true;
    this.help.hidden = true;
    this.travel = { from, to, km: gcKm(from, to), t0: performance.now(), p: 0, dur: this.calm ? 0.5 : 1.6, c0: { ...this.cam } };
    this._tripPanel();
    this.skipBtn.hidden = false;
  }

  _tripPanel() {
    const { from, to } = this.travel;
    const dt = tzOffset(to.tz) - tzOffset(from.tz);
    const crossDL = Math.sign(from.lon) !== Math.sign(to.lon) && Math.abs(from.lon) + Math.abs(to.lon) > 180;
    this.trip.innerHTML = `
      <div class="route"><b>${esc(from.name)}</b><span class="ar">${esc(from.short)}</span><span class="ar">→</span><b>${esc(to.name)}</b><span class="ar">${esc(to.short)}</span></div>
      <div class="facts"><span>きょり <em class="km">0</em> km</span><span>時差 <em>${dt > 0 ? '+' : ''}${dt} 時間</em></span>${crossDL ? '<span>日付変更線をこえます</span>' : ''}<span>現地 いま <em>${localTime(to.tz)}</em></span></div>
      <div class="ld"><div class="track"><i></i></div><span class="ldt">${this.mode === 'arrive' ? '次の釣り場を読み込んでいます' : '出発します'}</span></div>`;
    this.trip.classList.remove('off');
    this._km = this.trip.querySelector('.km');
    this._bar = this.trip.querySelector('.track i');
    this._ldt = this.trip.querySelector('.ldt');
    this._loadUI();
  }
  _loadUI() {
    if (!this._bar || this.mode !== 'arrive') return;
    this._bar.style.width = `${Math.round(100 * this.loadP)}%`;
    const t = this.isLoaded ? '読み込みおわり　まもなく到着します' : this.loadText ? `読み込み中　${this.loadText}` : '次の釣り場を読み込んでいます';
    if (this._ldt.textContent !== t) this._ldt.textContent = t;
  }

  // 飛行の進み p から、カメラ（地球儀の向きと大きさ）と、航路の進み
  _camAt(p) {
    const tr = this.travel, { from, to } = tr, c = this.cam;
    if (this.calm) {
      // 動きをおさえる: 地図は動かさず、線だけを伸ばす
      if (!tr.rest) tr.rest = this._restView();
      Object.assign(c, tr.rest);
      return clamp((p - P_ZOOM) / (P_FLY - P_ZOOM));
    }
    if (p < P_ZOOM) {
      const t = ease(p / P_ZOOM), c0 = tr.c0 || c;
      c.lat = lerp(c0.lat, from.lat - 6, t); c.lon = c0.lon + wrap180(from.lon - c0.lon) * t; c.zoom = lerp(c0.zoom, 1.7, t);
      return 0;
    }
    if (p < P_FLY) {
      const t = ease((p - P_ZOOM) / (P_FLY - P_ZOOM));
      const ll = toLL(slerp(vec(from.lat, from.lon), vec(to.lat, to.lon), t));
      c.lat = ll.lat - 6 * (1 - Math.sin(Math.PI * t) * 0.6); c.lon = ll.lon;
      c.zoom = 1.7 - 0.75 * Math.sin(Math.PI * t);
      return t;
    }
    const t = ease((p - P_FLY) / (1 - P_FLY));
    c.lat = lerp(to.lat - 6, to.lat, t); c.lon = to.lon; c.zoom = lerp(1.7, 7.5, t * t);
    return 1;
  }

  _stepTravel(now, dt) {
    const tr = this.travel;
    if (this.mode === 'depart') {
      tr.p = tr.skip ? P_HAND : Math.min(P_HAND, (((now - tr.t0) / 1000) / tr.dur) * P_HAND);
      if (tr.p >= P_HAND && !tr.sent) {
        tr.sent = true;
        this.skipBtn.hidden = true;
        if (this._ldt) this._ldt.textContent = '次の釣り場を読み込んでいます';
        if (this.hooks.onTravel) this.hooks.onTravel(tr.to.id);
      }
      if (this._bar) this._bar.style.width = '0%';
    } else if (this.mode === 'arrive' && !tr.revealed) {
      // 読み込みの進みが、そのまま飛行機の進み。止まって見えないよう、少しずつは進む
      const creep = 0.25 * (1 - Math.exp(-(now - tr.t0) / 5000));
      const target = this.isLoaded ? 1 : P_HAND + (P_FLY - P_HAND) * Math.max(this.loadP, creep);
      // 速さの上限（読み込みがすぐおわっても、飛ぶところは見せる）
      const vmax = tr.skip ? 4 : tr.p < P_FLY ? (P_FLY - P_HAND) / (this.calm ? 0.9 : 2.2) : (1 - P_FLY) / (this.calm ? 0.5 : 1.35);
      tr.p = Math.min(target, tr.p + vmax * dt);
      if (tr.p >= 1 && this.sceneOK) this._reveal();
    }
    const prog = this._camAt(tr.p);
    if (this._km) this._km.textContent = Math.round(tr.km * prog).toLocaleString('ja-JP');
    return prog;
  }

  // 到着: 景色が、ピンのところから円く開く
  _reveal() {
    const tr = this.travel;
    tr.revealed = true;
    this.covering = false;
    this.skipBtn.hidden = true;
    this.trip.classList.add('off');
    this.hooks.onReveal && this.hooks.onReveal();
    const q = this._pt(tr.to.lat, tr.to.lon, this.cam);
    this.sky.style.setProperty('--x', `${q.x}px`);
    this.sky.style.setProperty('--y', `${q.y}px`);
    this.sky.style.setProperty('--r', '0px');
    this.el.classList.add('revealed');
    const R1 = Math.hypot(this.W, this.H);
    const done = () => { this.sky.hidden = true; this.running = false; this._welcome(); };
    if (this.calm) {
      this.el.classList.add('fading');
      setTimeout(done, 650);
      return;
    }
    this.el.classList.add('revealing');
    const t0 = performance.now();
    const grow = (now) => {
      const t = clamp((now - t0) / 900);
      this.sky.style.setProperty('--r', `${(ease(t) * R1).toFixed(1)}px`);
      if (t < 1) requestAnimationFrame(grow); else done();
    };
    requestAnimationFrame(grow);
  }

  _welcome() {
    const tr = this.travel, to = tr.to;
    const h = localHour(to.tz);
    this.arr.hidden = false;
    this.tx.innerHTML = `
      <div class="wel">ようこそ</div>
      <div class="big">${esc(to.name)}へ</div>
      <div class="sub"><span>${esc(to.region)}</span><span class="sep">　・　</span><span>現地 いま ${localTime(to.tz)}（${partOfDay(h)}）</span></div>
      <div class="acts"><button type="button" class="btn primary wm-start"><span class="seal">釣</span>はじめる</button></div>`;
    void this.tx.offsetWidth;
    this.tx.classList.remove('off');
    const go = this.tx.querySelector('.wm-start');
    go.addEventListener('click', () => this._start());
    go.focus({ preventScroll: true });
    tr.shown = true;
    // 旅のはんこ（はじめて押した日と、押した回数）
    const all = store.get(K_STAMP) || {};
    const today = ymd(new Date());
    all[to.id] = { first: (all[to.id] && all[to.id].first) || today, last: today, n: ((all[to.id] && all[to.id].n) || 0) + 1 };
    store.set(K_STAMP, all);
    this.stampEl.innerHTML = this._stampSVG(to, today);
    setTimeout(() => {
      this.stampEl.classList.add(this.calm ? 'soft' : 'on');
      if (!this.calm) setTimeout(() => { this.arr.classList.remove('shake'); void this.arr.offsetWidth; this.arr.classList.add('shake'); }, 260);
    }, this.calm ? 200 : 650);
  }

  _start() {
    if (!this.travel || this.travel.started) return;
    this.travel.started = true;
    this.el.classList.add('out');
    this.isOpen = false;
    this.covering = false;
    setTimeout(() => {
      this.el.hidden = true;
      this.el.classList.remove('out', 'arrive', 'busy', 'revealing', 'revealed', 'fading', 'in');
      this.arr.hidden = true;
      this.arr.classList.remove('shake');
      this.stampEl.classList.remove('on', 'soft');
      this.tx.classList.add('off');
      this.sky.hidden = false;
      this.sky.style.removeProperty('--r');
      this.mode = null;
      this.travel = null;
      this.arriving = null;
    }, 700);
    this.hooks.onStart && this.hooks.onStart();
  }

  // はんこ（朱の枠に、釣り場の字と日付。にじみ・かすれ）
  _stampSVG(p, ds) {
    return `
      <defs>
        <filter id="wm-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${p.id === 'hama' ? 3 : 7}" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.75" result="holes"/>
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="cut"/>
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="w"/>
          <feDisplacementMap in="cut" in2="w" scale="4"/>
        </filter>
      </defs>
      <rect x="2" y="2" width="196" height="196" rx="28" fill="#f4ecd8" opacity=".93"/>
      <g filter="url(#wm-ink)" fill="none" stroke="#c43d26">
        <rect x="14" y="14" width="172" height="172" rx="22" stroke-width="7"/>
        <rect x="26" y="26" width="148" height="148" rx="14" stroke-width="2.4"/>
        <g fill="#c43d26" stroke="none" font-family="Shippori Mincho, serif" font-weight="800" text-anchor="middle">
          <text x="100" y="62" font-size="20" letter-spacing="4">ひだまり</text>
          <text x="100" y="128" font-size="62">${esc(p.mark)}</text>
          <text x="100" y="156" font-size="13" letter-spacing="3">${esc(p.en)}</text>
          <text x="100" y="174" font-size="11" letter-spacing="1.5" font-weight="600">${ds}</text>
        </g>
      </g>`;
  }

  // ---------------------------------------------------------------- 1 フレーム
  _frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    if (this._needResize) this._resize();
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    let prog = -1;
    if (this.travel) prog = this._stepTravel(now, dt);
    else if (this.mode === 'browse' && !this.drag && !this.calm) this.cam.lon += 0.004;   // ごくゆっくり回る
    // カードが開いているときは、地球儀をカードのない側へ（広い画面は左、せまい画面は上）
    let wantX = 0, wantY = 0;
    if (this.mode === 'browse' && !this.card.classList.contains('off')) {
      const b = this._cardBox || (this._cardBox = { w: this.card.offsetWidth, h: this.card.offsetHeight });
      const R = this._baseR() * this.cam.zoom;
      if (W > 720) wantX = Math.max(Math.min(0, W - 16 - b.w - 24 - R - W / 2), 16 + R - W / 2);
      else wantY = Math.max(Math.min(0, H - 16 - b.h - 14 - R - H / 2), 64 + R - H / 2);
      wantX = Math.min(0, wantX); wantY = Math.min(0, wantY);
    }
    const k = this.calm ? 1 : 1 - Math.exp(-dt * 5);
    this.shiftX += (wantX - this.shiftX) * k;
    this.shiftY += (wantY - this.shiftY) * k;
    this._drawGlobe(this.cam, subsolar());
    const tr = this.travel;
    if (tr) this._drawRoute(tr.from, tr.to, this.cam, Math.max(0, prog), false);
    else if (this.sel && !spot(this.sel).soon && this.sel !== PLACE_ID) this._drawRoute(spot(PLACE_ID), spot(this.sel), this.cam, 1, true);
    this._placePins(this.cam, !!tr && this.cam.zoom > 4);
    if (now - (this._ct || 0) > 1000) {
      this._ct = now;
      this.clockEl.textContent = PLACE_IDS.map((id) => `${spot(id).short} ${localTime(spot(id).tz)}`).join('　／　');
    }
  }
}

export const worldMap = new WorldMap();
worldMap.boot();
