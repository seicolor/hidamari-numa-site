// シリーズの入口の地球儀: 夜の地球（陸は点、昼と夜の境目はいまの時刻）に、釣り場のピン。ゆっくり回る
// ゲームの「旅の地図」（src/worldmap.js）を、表示だけに小さくしたもの
import { LAND } from './worlddots.js';

const D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const PLACES = [
  { id: 'numa', name: 'ひだまり沼', short: '秋田県', lat: 39.16, lon: 140.49, tz: 'Asia/Tokyo' },
  { id: 'hama', name: 'ひだまり浜', short: 'オアフ島', lat: 21.392, lon: -157.716, tz: 'Pacific/Honolulu' },
];
export function localTime(tz) {
  try { return new Intl.DateTimeFormat('ja-JP', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); } catch (e) { return ''; }
}

function subsolar(d = new Date()) {
  const N = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return { lat: 23.44 * Math.sin((2 * Math.PI * (284 + N)) / 365), lon: -15 * (h - 12) };
}
const vec = (lat, lon) => { const c = Math.cos(lat * D2R); return [c * Math.cos(lon * D2R), Math.sin(lat * D2R), c * Math.sin(lon * D2R)]; };
const toLL = (v) => { const l = Math.hypot(...v); return { lat: Math.asin(v[1] / l) / D2R, lon: Math.atan2(v[2], v[0]) / D2R }; };
function slerp(a, b, t) {
  const w = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  if (w < 1e-5) return a.slice();
  const s = Math.sin(w), ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

function dots() {
  const la = [], lo = [];
  for (const [lat, n, r] of LAND.g) for (let i = 0; i < r.length; i += 2) for (let j = r[i]; j < r[i] + r[i + 1]; j++) { la.push(lat); lo.push(-180 + ((j + 0.5) * 360) / n); }
  const n = la.length, sLa = new Float32Array(n), cLa = new Float32Array(n), lon = new Float32Array(n);
  for (let i = 0; i < n; i++) { sLa[i] = Math.sin(la[i] * D2R); cLa[i] = Math.cos(la[i] * D2R); lon[i] = lo[i] * D2R; }
  return { n, sLa, cLa, lon };
}
const DAYC = [214, 236, 246], NIGHTC = [64, 98, 124];
const BUCKETS = Array.from({ length: 8 }, (_, k) => { const t = k / 7; return `rgb(${DAYC.map((v, i) => Math.round(lerp(NIGHTC[i], v, t))).join(',')})`; });

export function mountGlobe(canvas, pinsEl, { onPick } = {}) {
  const ctx = canvas.getContext('2d');
  const D = dots();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 2つの釣り場のまんなかを向く
  const mid = toLL(slerp(vec(PLACES[0].lat, PLACES[0].lon), vec(PLACES[1].lat, PLACES[1].lon), 0.5));
  const cam = { lat: mid.lat - 4, lon: mid.lon };
  let W = 0, H = 0, DPR = 1, stars = null, drag = null, visible = true;
  const oc = document.createElement('canvas'); oc.width = oc.height = 150;
  const octx = oc.getContext('2d'), oimg = octx.createImageData(150, 150);
  const pins = PLACES.map((p) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gpin';
    b.innerHTML = `<i></i><span><b>${p.name}</b><small>${p.short}　<em data-t="${p.tz}"></em></small></span>`;
    b.setAttribute('aria-label', `${p.name}（${p.short}）の紹介へ`);
    b.addEventListener('click', () => onPick && onPick(p.id));
    pinsEl.append(b);
    return b;
  });
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, devicePixelRatio || 1);
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    stars = null;
  };
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, lat: cam.lat, lon: cam.lon }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const k = 0.32 * (400 / Math.min(W, H)); cam.lon = drag.lon - (e.clientX - drag.x) * k; cam.lat = clamp(drag.lat + (e.clientY - drag.y) * k, -60, 70); });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  const proj = (sl, cl, lonR) => {
    const s0 = Math.sin(cam.lat * D2R), c0 = Math.cos(cam.lat * D2R), dl = lonR - cam.lon * D2R, cd = Math.cos(dl);
    return [cl * Math.sin(dl), c0 * sl - s0 * cl * cd, s0 * sl + c0 * cl * cd];
  };
  function frame() {
    requestAnimationFrame(frame);
    if (!W || !visible) return;
    if (!drag && !reduce) cam.lon += 0.012;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const R = Math.min(W, H) * 0.44, cx = W / 2, cy = H / 2;
    const bg = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.max(W, H) * 0.9);
    bg.addColorStop(0, '#0c1a2a'); bg.addColorStop(1, '#03070d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (!stars) { stars = []; const n = Math.round((W * H) / 1600); for (let i = 0; i < n; i++) { const a = Math.sin(i * 91.7) * 43758.5, b = Math.sin(i * 17.3 + 4) * 23421.6; stars.push([(a - Math.floor(a)) * W, (b - Math.floor(b)) * H, 0.3 + 0.7 * ((i * 0.618) % 1)]); } }
    ctx.fillStyle = '#cfe3f0';
    for (const [x, y, a] of stars) { ctx.globalAlpha = a * 0.55; ctx.fillRect(x, y, 1, 1); }
    ctx.globalAlpha = 1;
    const ag = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.18);
    ag.addColorStop(0, 'rgba(110,200,240,.35)'); ag.addColorStop(1, 'rgba(110,200,240,0)');
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, 6.2832); ctx.fill();
    const sun = subsolar();
    const sv = proj(Math.sin(sun.lat * D2R), Math.cos(sun.lat * D2R), sun.lon * D2R);
    // 海
    const d = oimg.data, N = 150;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = ((px + 0.5) / N) * 2 - 1, y = -(((py + 0.5) / N) * 2 - 1), r2 = x * x + y * y, i = (py * N + px) * 4;
      if (r2 > 1) { d[i + 3] = 0; continue; }
      const z = Math.sqrt(1 - r2), l = x * sv[0] + y * sv[1] + z * sv[2];
      const day = ss(-0.12, 0.22, l), rim = Math.pow(1 - z, 2.6), tw = Math.exp(-(((l + 0.02) / 0.07) ** 2)) * 0.22;
      const spec = Math.pow(Math.max(0, l * z), 22) * 60 * day;
      d[i] = Math.min(255, lerp(7, 22, day) + rim * 40 + tw * 60 + spec); d[i + 1] = Math.min(255, lerp(18, 64, day) + rim * 110 + tw * 34 + spec); d[i + 2] = Math.min(255, lerp(34, 96, day) + rim * 150 + tw * 10 + spec); d[i + 3] = 255;
    }
    octx.putImageData(oimg, 0, 0);
    ctx.drawImage(oc, cx - R, cy - R, 2 * R, 2 * R);
    // 陸
    const bx = BUCKETS.map(() => []);
    const s0 = Math.sin(cam.lat * D2R), c0 = Math.cos(cam.lat * D2R), L0 = cam.lon * D2R, sz = clamp(R * 0.0118, 1.1, 3.4);
    for (let i = 0; i < D.n; i++) {
      const dl = D.lon[i] - L0, cd = Math.cos(dl), cl = D.cLa[i], sl = D.sLa[i];
      const z = s0 * sl + c0 * cl * cd;
      if (z <= 0.02) continue;
      const x = cl * Math.sin(dl), y = c0 * sl - s0 * cl * cd;
      const b = ss(-0.12, 0.25, x * sv[0] + y * sv[1] + z * sv[2]) * (0.55 + 0.45 * Math.sqrt(z));
      bx[Math.min(7, Math.floor(b * 8))].push(cx + x * R, cy - y * R);
    }
    for (let k = 0; k < 8; k++) { const a = bx[k]; ctx.fillStyle = BUCKETS[k]; ctx.globalAlpha = 0.45 + 0.55 * (k / 7); for (let j = 0; j < a.length; j += 2) ctx.fillRect(a[j] - sz / 2, a[j + 1] - sz / 2, sz, sz); }
    ctx.globalAlpha = 1;
    // 2つの釣り場をむすぶ大円（点線）
    const va = vec(PLACES[0].lat, PLACES[0].lon), vb = vec(PLACES[1].lat, PLACES[1].lon);
    ctx.save(); ctx.strokeStyle = 'rgba(255,198,110,.6)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 5]); ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, ll = toLL(slerp(va, vb, t)), alt = 1 + 0.16 * Math.sin(Math.PI * t);
      const p = proj(Math.sin(ll.lat * D2R), Math.cos(ll.lat * D2R), ll.lon * D2R);
      if (p[2] < -0.05 && Math.hypot(p[0] * alt, p[1] * alt) < 1) { pen = false; continue; }
      const X = cx + p[0] * R * alt, Y = cy - p[1] * R * alt;
      if (!pen) { ctx.moveTo(X, Y); pen = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke(); ctx.restore();
    // ピン
    PLACES.forEach((p, i) => {
      const q = proj(Math.sin(p.lat * D2R), Math.cos(p.lat * D2R), p.lon * D2R);
      const ok = q[2] > 0.08;
      pins[i].hidden = !ok;
      if (ok) pins[i].style.transform = `translate(${(cx + q[0] * R - 9).toFixed(1)}px, ${(cy - q[1] * R - 9).toFixed(1)}px)`;
    });
  }
  const tick = () => { for (const e of pinsEl.querySelectorAll('[data-t]')) e.textContent = localTime(e.dataset.t); };
  tick(); setInterval(tick, 15000);
  resize();
  requestAnimationFrame(frame);
}
