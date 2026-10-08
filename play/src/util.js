// 数学・ノイズ・乱数などの小さな道具たち
export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
// 画角（度）を広げる: 画面の高さの k 倍が入るように（tan で比べる）
export const widenFov = (fov, k) => (k === 1 ? fov : (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 180) / Math.PI);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 2D value noise (tileable-capable via period) ---
const PERM = new Uint8Array(512);
const GRAD = new Float32Array(512);
{
  const rnd = mulberry32(1234567);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    GRAD[i] = (PERM[i] / 255) * 2 - 1;
  }
}

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = GRAD[PERM[X] + Y];
  const b = GRAD[PERM[X + 1] + Y];
  const c = GRAD[PERM[X] + Y + 1];
  const d = GRAD[PERM[X + 1] + Y + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v); // -1..1
}

export function fbm2(x, y, oct = 5, lac = 2.0, gain = 0.5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= lac;
    a *= gain;
  }
  return s;
}

export function ridged2(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise2(x * f, y * f));
    n *= n;
    s += n * a * w;
    w = clamp(n * 1.6);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

export const hash2 = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// 周期ノイズ（タイル可能なテクスチャ用）
export function tileNoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
  const h = (a, b) => hash2(a, b) * 2 - 1;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(x0, y0), h(x1, y0), u), lerp(h(x0, y1), h(x1, y1), u), v);
}

export const hash1 = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function hexToLinear(hex) {
  // sRGB hex -> linear [r,g,b]
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function weightedPick(rng, items, weightFn) {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, weightFn(it));
    total += w;
    return w;
  });
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Box-Muller
export function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
