// 魚拓: 釣った魚を、和紙に墨で刷ったような画像にする（保存・共有用）
import { L, EN } from './i18n.js';
import { mulberry32 } from './util.js';
import { PLACE } from './place.js';

const W = 1600, H = 1000;
const PAPER = [240, 231, 209];
const INK = [30, 26, 24];
const FONT = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 数字を漢数字に（1〜99）
const KN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function kanjiNum(n) {
  if (n < 10) return KN[n];
  const t = Math.floor(n / 10), o = n % 10;
  return (t > 1 ? KN[t] : '') + '十' + (o ? KN[o] : '');
}
export function eraDate(d) {
  const y = d.getFullYear() - 2018;
  return `令和${y === 1 ? '元' : kanjiNum(y)}年${kanjiNum(d.getMonth() + 1)}月${kanjiNum(d.getDate())}日`;
}

// なめらかな値ノイズ（格子ごとの乱数を補間）
function makeNoise(rnd, size = 256) {
  const t = new Float32Array(size * size);
  for (let i = 0; i < t.length; i++) t[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = t[((yi & (size - 1)) * size) + (xi & (size - 1))], b = t[((yi & (size - 1)) * size) + ((xi + 1) & (size - 1))];
    const c = t[(((yi + 1) & (size - 1)) * size) + (xi & (size - 1))], d = t[(((yi + 1) & (size - 1)) * size) + ((xi + 1) & (size - 1))];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
}

// 和紙: 繊維とむらのある、あたたかい白
function paper(rnd) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const n1 = makeNoise(rnd), n2 = makeNoise(rnd);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const blot = (n1(x / 220, y / 220) - 0.5) * 12 + (n2(x / 14, y / 14) - 0.5) * 7;
      const grain = (rnd() - 0.5) * 6;
      // ふちをほんのり暗く
      const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
      const edge = 1 - 0.1 * (1 - smooth(0, 0.07, Math.min(ex * 1.6, ey * 2.4)));
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, (PAPER[k] + blot + grain) * edge));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 繊維
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI * 2, l = 10 + rnd() * 46;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,252,240,0.30)' : 'rgba(150,120,80,0.10)';
    ctx.lineWidth = 0.6 + rnd() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return cv;
}

// 箱ぼかし（アルファの縁にたまる墨をつくる）
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * k;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * k;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// 魚の絵を、墨の濃淡にする（うろこの凹凸・縁のたまり・かすれ）
function inkOf(fish, rnd) {
  const w = fish.width, h = fish.height;
  const src = fish.getContext('2d').getImageData(0, 0, w, h).data;
  const A = new Float32Array(w * h), L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    A[i] = src[i * 4 + 3] / 255;
    L[i] = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) / 255;
  }
  const B = boxBlur(A, w, h, 7);
  const Lb = boxBlur(L, w, h, 9);
  const nz = makeNoise(rnd);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, a = A[i];
      if (a < 0.02) continue;
      // 濃い色ほど墨が乗る。細かい明暗（うろこ）は、ぼかした明るさとの差で強調する
      const base = 0.34 + 0.62 * Math.pow(1 - L[i], 1.1);
      const detail = (Lb[i] - L[i]) * 1.9;
      // 縁には墨がたまる
      const rim = Math.max(0, a - B[i]) * 1.5;
      let d = a * (base + detail) + rim;
      // 紙の目に墨がのらない「かすれ」
      const grain = nz(x / 5, y / 5) * 0.6 + nz(x / 1.7, y / 1.7) * 0.4;
      d = smooth(0.2, 0.7, d + (grain - 0.5) * 0.42);
      d *= a > 0.95 ? 1 : a;
      const o = i * 4;
      img.data[o] = INK[0]; img.data[o + 1] = INK[1]; img.data[o + 2] = INK[2];
      img.data[o + 3] = Math.round(clamp01(d) * 235);
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// 縦書き（1字ずつ中央に積む）
function vtext(ctx, str, cx, y0, size, gap = 1.12) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ${FONT}`;
  let y = y0 + size / 2;
  for (const ch of str) {
    if (ch === 'ー') { ctx.fillText('｜', cx, y); } else ctx.fillText(ch, cx, y);
    y += size * gap;
  }
  return y;
}

// 英語の縦の列: 文字を積まず、90°まわして 1 行で（本の背のように、上から下へ読む）。長いときは字を小さく
function rtext(ctx, str, cx, y0, size, maxLen) {
  ctx.save();
  ctx.translate(cx, y0);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let s = size;
  ctx.font = `700 ${s}px ${FONT}`;
  const w = ctx.measureText(str).width;
  if (w > maxLen) { s = Math.max(24, Math.floor(s * maxLen / w)); ctx.font = `700 ${s}px ${FONT}`; }
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// 落款（朱の印）
function seal(ctx, cx, cy, s, rnd) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.translate(cx, cy);
  ctx.rotate(-0.05);
  const r = s * 0.12;
  ctx.fillStyle = 'rgba(196,56,38,0.93)';
  ctx.beginPath();
  ctx.moveTo(-s / 2 + r, -s / 2);
  ctx.arcTo(s / 2, -s / 2, s / 2, s / 2, r); ctx.arcTo(s / 2, s / 2, -s / 2, s / 2, r);
  ctx.arcTo(-s / 2, s / 2, -s / 2, -s / 2, r); ctx.arcTo(-s / 2, -s / 2, s / 2, -s / 2, r);
  ctx.fill();
  // 彫りのかすれ
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.3})`;
    ctx.fillRect((rnd() - 0.5) * s, (rnd() - 0.5) * s, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgb(${PAPER[0]},${PAPER[1]},${PAPER[2]})`;
  ctx.font = `800 ${s * 0.72}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('釣', 0, s * 0.04);
  ctx.restore();
}

// 目もりつきのものさし（魚の長さに合わせる）
function ruler(ctx, x0, y, pxPerCm, cm) {
  ctx.save();
  ctx.strokeStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.85)`;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round';
  const total = Math.ceil(cm);
  const minor = pxPerCm >= 11;
  const labelStep = cm <= 12 ? 2 : cm <= 30 ? 5 : 10;
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + cm * pxPerCm, y); ctx.stroke();
  ctx.font = `600 24px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let c = 0; c <= total; c++) {
    const x = x0 + c * pxPerCm;
    if (c > cm) break;
    const isLabel = c % labelStep === 0;
    if (!isLabel && !minor) continue;
    ctx.lineWidth = isLabel ? 2.6 : 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (isLabel ? 22 : 11)); ctx.stroke();
    if (isLabel) ctx.fillText(String(c), x, y + 26);
  }
  // 魚の長さの端
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0 + cm * pxPerCm, y - 9); ctx.lineTo(x0 + cm * pxPerCm, y + 9); ctx.stroke();
  ctx.restore();
}

// fishCanvas: 魚を透明な背景で描いた絵（thumbs.js の renderFishCanvas）
export async function makeGyotaku(fishCanvas, { sp, cm, date = new Date(), depth = null, bait = '' }) {
  const rnd = mulberry32(hashStr(`${sp.id}:${cm.toFixed(1)}:${date.toDateString()}`));
  try { if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load(`700 40px "Shippori Mincho"`, 'ひだまり沼浜令和釣'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }

  const cv = paper(rnd);
  const ctx = cv.getContext('2d');

  // 魚の範囲（透明でないところ）を切り出して、紙の左側いっぱいに
  const fctx = fishCanvas.getContext('2d');
  const fd = fctx.getImageData(0, 0, fishCanvas.width, fishCanvas.height).data;
  let x0 = fishCanvas.width, y0 = fishCanvas.height, x1 = 0, y1 = 0;
  for (let y = 0; y < fishCanvas.height; y += 2) for (let x = 0; x < fishCanvas.width; x += 2) {
    if (fd[(y * fishCanvas.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = fishCanvas.width; y1 = fishCanvas.height; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const maxW = 1030, maxH = 520;
  const s = Math.min(maxW / bw, maxH / bh);
  const dw = Math.round(bw * s), dh = Math.round(bh * s);
  const fish = document.createElement('canvas');
  fish.width = dw; fish.height = dh;
  const fx = fish.getContext('2d');
  fx.imageSmoothingQuality = 'high';
  fx.drawImage(fishCanvas, x0, y0, bw, bh, 0, 0, dw, dh);
  const ink = inkOf(fish, rnd);

  const left = 140 + (maxW - dw) / 2, top = 400 - dh / 2;
  // 墨のにじみ（小さく縮めて広げ、うっすら下に敷く）
  const sm = document.createElement('canvas');
  sm.width = Math.max(2, dw >> 2); sm.height = Math.max(2, dh >> 2);
  const sctx = sm.getContext('2d'); sctx.imageSmoothingQuality = 'high'; sctx.drawImage(ink, 0, 0, sm.width, sm.height);
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.drawImage(sm, left - 6, top - 6, dw + 12, dh + 12);
  ctx.restore();
  ctx.drawImage(ink, left, top);

  // ものさし（魚の全長 = cm）
  const pxPerCm = dw / cm;
  ruler(ctx, left, 770, pxPerCm, cm);
  ctx.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.9)`;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText(L(`全長 ${cm.toFixed(1)} cm`, `Length ${cm.toFixed(1)} cm`), left, 905);
  if (depth != null) {
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.7)`;
    ctx.fillText(L(`ウキ下 ${depth.toFixed(1)} m${bait ? `　${bait}` : ''}`, `Depth ${depth.toFixed(1)} m${bait ? `  ·  ${bait}` : ''}`), left, 950);
  }

  // 右の縦書き: 魚の名前・日付・場所
  ctx.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.92)`;
  if (EN) {
    rtext(ctx, sp.name, 1440, 130, 84, 640);
    ctx.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.8)`;
    rtext(ctx, date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 1340, 140, 40, 640);
    rtext(ctx, `at ${PLACE.title}`, 1272, 140, 36, 640);
  } else {
    const nameSize = sp.name.length > 4 ? 84 : 108;
    vtext(ctx, sp.name, 1440, 130, nameSize, 1.1);
    ctx.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.8)`;
    vtext(ctx, eraDate(date), 1318, 140, 42, 1.2);
    vtext(ctx, `${PLACE.title}にて`, 1250, 140, 36, 1.2);
  }
  seal(ctx, 1450, 850, 112, rnd);

  return cv;
}
