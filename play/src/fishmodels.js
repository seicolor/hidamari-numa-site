// 魚・イモリ・ザリガニ・長靴の手続き的3Dモデル
//  - 体: ロフト面 + 鱗(色+バンプ)のアトラス + 描き込んだ目 + えら蓋の段差
//  - ひれ: 別メッシュ(半透明・条(すじ)つき)。頂点シェーダで波打ち・扇ぎ・しなりを表現
//  - 呼吸: えら蓋のふくらみ・口のぱくぱく
import * as THREE from 'three';
import { noise2, fbm2, clamp, lerp, smoothstep as ss, hash2, TAU } from './util.js';
import { patchMaterial } from './materials.js';
import { mergeGeos, colorize } from './geo.js';
import { applyEnv, releaseEnv } from './env.js';

// ---------------------------------------------------------------------------
// アトラス: 体 768x320 / すき間 / 下段に 目(128x128) と色見本
const TW = 768, BODY_ROWS = 320, EYE = 128;
const EYE_Y0 = BODY_ROWS + 8;
const TH = EYE_Y0 + EYE + 8;
const SWY = EYE_Y0 + 64;
const sw = (x) => [(x + 0.5) / TW, (SWY + 0.5) / TH];
const SW = { dark: sw(176), barbel: sw(208), accent: sw(240) };
const bodyV = (j, R) => (0.5 + (j / R) * (BODY_ROWS - 1)) / TH;
// 目タイルのUV (x,y は -1..1)
const eyeU = (x) => (1 + (0.5 + x * 0.5) * (EYE - 2)) / TW;
const eyeV = (y) => (EYE_Y0 + 1 + (0.5 + y * 0.5) * (EYE - 2)) / TH;

const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// 角度方向に継ぎ目のないノイズ
const an = (u, ang, fu, fa, oct = 3, off = 0) => fbm2(u * fu + Math.cos(ang) * fa + off, Math.sin(ang) * fa + off * 0.7 + 3.1, oct);

function curve(pts) {
  return (t) => {
    const n = pts.length;
    t = clamp(t, pts[0][0], pts[n - 1][0]);
    let i = 0;
    while (i < n - 2 && t > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const dt = p2[0] - p1[0];
    const u = (t - p1[0]) / dt;
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0] || 1);
    const m2 = (p3[1] - p1[1]) / (p3[0] - p1[0] || 1);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * dt * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * dt * m2;
  };
}

// ---------------------------------------------------------------------------
// 鱗の1枚ぶんの陰影。頭側から尾側へ屋根瓦のように重なり、後縁が弧を描く。
function scaleCell(u, ang, nc, nr) {
  const row = (ang / TAU) * nr;
  const ri = Math.floor(row), rf = row - ri;
  const col = u * nc + (ri & 1) * 0.5;
  const ci = Math.floor(col), cf = col - ci;
  const yy = (rf - 0.5) * 2;
  const edge = 0.97 - 0.3 * yy * yy;
  const d = cf - edge;
  return {
    rim: Math.exp(-(d * d) / 0.0022),
    lit: ss(0.1, 1.0, cf / edge),
    rnd: hash2(ci * 1.37 + 11, ri * 2.11 + 5),
    cf,
  };
}

// 体の下地: 背→腹の階調、鱗、側線、えら蓋、口
function bodyPaint(o) {
  const { back, flank, belly, nc = 40, nr = 28, rimK = 0.5, scaleK = 1, cheek = null, glint = [255, 255, 255], glintK = 0.18, sc0 = 0.215, lat = true, extra = null, mottle = 0.1, gillU = 0.205, gillK = 1 } = o;
  return (u, ang) => {
    const b = Math.sin(ang);
    let c = mixC(belly, flank, ss(-0.72, -0.08, b));
    c = mixC(c, back, ss(0.04, 0.82, b));
    const S = scaleCell(u, ang, nc, nr);
    const sc = ss(sc0 - 0.03, sc0 + 0.07, u) * (1 - 0.5 * b * b * b * b);
    const sh = 0.78 + 0.3 * S.lit + (S.rnd - 0.5) * 0.12;
    c = mul(c, lerp(1, sh, sc * scaleK));
    c = mul(c, 1 - S.rim * rimK * sc * scaleK);
    const flankW = ss(-0.6, -0.1, b) * (1 - ss(0.2, 0.8, b));
    c = mixC(c, glint, S.lit * S.lit * S.lit * glintK * sc * scaleK * flankW);
    const n = an(u, ang, 38, 2.2, 2);
    c = mul(c, 1 + n * mottle);
    if (cheek) c = mixC(c, cheek, ss(0.22, 0.12, u) * 0.3 * (1 - 0.85 * ss(0.1, 0.7, b)));
    // 側線
    let ll = 0;
    if (lat && u > gillU + 0.015 && u < 0.94) {
      const bl = Math.sin(0.5 * (1 - ss(0.2, 0.75, u)) + 0.02);
      ll = ss(0.03, 0.0, Math.abs(b - bl)) * (0.4 + 0.6 * ss(0.15, 0.7, S.cf));
      c = mul(c, 1 - ll * 0.3);
    }
    // えら蓋のふち
    const g1 = Math.exp(-Math.pow((u - gillU) / 0.0035, 2)) * (1 - 0.7 * ss(-0.5, -0.95, b)) * gillK;
    c = mul(c, 1 - 0.3 * g1);
    // 口
    const ms = Math.abs(u * b + 0.011);
    const slit = u < 0.026 ? ss(0.0022, 0.0007, ms) * ss(0.026, 0.018, u) * ss(-0.5, -0.8, b) : 0;
    c = mul(c, 1 - 0.7 * slit);
    if (u < 0.045 && b < 0) c = mixC(c, mul(mixC(flank, [220, 150, 130], 0.4), 0.95), 0.4 * ss(0.045, 0.02, u));
    if (extra) c = extra(c, u, ang, b, S);
    const h = 0.5 + sc * scaleK * (0.3 * S.lit - 0.55 * S.rim) + 0.05 * n - ll * 0.12 - g1 * 0.35 - slit * 0.4;
    return [c[0], c[1], c[2], h];
  };
}

// 目(正面から見た絵): 瞳孔・虹彩の放射状の筋・縁
function paintEye(nx, ny, e) {
  const rr = Math.hypot(nx, ny);
  const skin = hex(e.skin);
  const pupil = e.pupil ?? 0.34, irisR = 0.72;
  let c;
  if (rr < irisR) {
    const t = clamp((rr - pupil) / (irisR - pupil));
    const a = Math.atan2(ny, nx);
    const streak = 0.78 + 0.5 * (0.5 + noise2(Math.cos(a) * 2.6 + rr * 0.8, Math.sin(a) * 2.6));
    let ic = mixC(mul(hex(e.iris), 1.22), mul(hex(e.iris2 ?? e.iris), 0.62), ss(0.0, 1.0, t));
    ic = mul(ic, streak);
    ic = mixC(ic, [10, 8, 6], ss(0.8, 1.0, t) * 0.75);
    ic = mixC(ic, [10, 9, 8], ss(0.22, 0.0, t) * 0.9);
    c = mixC([5, 5, 7], ic, ss(pupil - 0.025, pupil + 0.025, rr));
  } else {
    c = mixC([12, 10, 8], skin, ss(irisR, 0.97, rr));
  }
  const cl = Math.hypot(nx + 0.27, ny - 0.3);
  c = mixC(c, [255, 255, 255], ss(0.13, 0.04, cl) * 0.75);
  const c2 = Math.hypot(nx - 0.22, ny + 0.28);
  c = mixC(c, [255, 255, 255], ss(0.07, 0.02, c2) * 0.28);
  return c;
}

function bakeAtlas(P) {
  const col = new Uint8Array(TW * TH * 4), hgt = new Uint8Array(TW * TH);
  const put = (x, y, c, h = 0.5) => {
    const i = y * TW + x;
    col[i * 4] = clamp(c[0], 0, 255); col[i * 4 + 1] = clamp(c[1], 0, 255); col[i * 4 + 2] = clamp(c[2], 0, 255); col[i * 4 + 3] = 255;
    hgt[i] = clamp(h, 0, 1) * 255;
  };
  for (let y = 0; y < BODY_ROWS; y++) {
    const ang = (y / (BODY_ROWS - 1)) * TAU;
    for (let x = 0; x < TW; x++) {
      const c = P.body((x + 0.5) / TW, ang);
      put(x, y, c, c[3]);
    }
  }
  const skin = hex(P.eye.skin);
  for (let y = BODY_ROWS; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      if (y < EYE_Y0) {
        const i = (BODY_ROWS - 1) * TW + x;
        put(x, y, [col[i * 4], col[i * 4 + 1], col[i * 4 + 2]], hgt[i] / 255);
      } else put(x, y, skin, 0.5);
    }
  }
  for (let ly = 0; ly < EYE; ly++) {
    for (let lx = 0; lx < EYE; lx++) {
      const c = paintEye(((lx + 0.5) / EYE) * 2 - 1, ((ly + 0.5) / EYE) * 2 - 1, P.eye);
      put(lx, EYE_Y0 + ly, c, 0.5);
    }
  }
  const patch = (x0, rgb) => {
    for (let y = EYE_Y0 + 48; y < EYE_Y0 + 80; y++) for (let x = x0; x < x0 + 32; x++) put(x, y, rgb, 0.5);
  };
  patch(160, hex(P.dark)); patch(192, hex(P.barbel)); patch(224, hex(P.accent));
  const mk = (data, w, h, fmt) => {
    const t = new THREE.DataTexture(data, w, h, fmt);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const map = mk(col, TW, TH, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = mk(hgt, TW, TH, THREE.RedFormat);
  return { map, bump };
}

// ひれの絵: 横方向が条(すじ)の並び、縦が根元→縁。条の部分は不透明、膜は透ける。
// P.finPaint があるときは、ひれごとに横へならべて塗る（0 背 / 1 しり / 2 尾 / 3 胸 / 4 腹）。
// finPaint(k, s, r, c, a) → [r, g, b, a] か null（s: ひれの前→後ろ、r: 付け根→ふち）
export const FIN_REGIONS = 5;
const FIN_KX = [1, 0.7, 1.25, 0.8, 0.6];
function bakeFin(P) {
  const nReg = P.finPaint ? FIN_REGIONS : 1;
  const W = 256 * nReg, H = 64;
  const data = new Uint8Array(W * H * 4);
  const f0 = hex(P.fin[0]), f1 = hex(P.fin[1]);
  const [fa0, fa1] = P.finA || [0.3, 0.92];
  for (let y = 0; y < H; y++) {
    const r = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const reg = Math.floor(x / 256);
      const u = nReg > 1 ? ((x % 256) + 0.5) / 256 * FIN_KX[reg] : (x + 0.5) / W;
      const ph = u * (P.rays || 14);
      const ray = 0.5 + 0.5 * Math.cos(ph * TAU);
      const ri = Math.floor(ph);
      let a = fa0 + (fa1 - fa0) * Math.pow(ray, 0.85);
      a = lerp(0.96, a, ss(0.0, 0.2, r));
      a *= 1 - 0.55 * ss(0.88, 1.0, r);
      a *= 0.9 + 0.1 * noise2(u * 40, r * 6);
      let c = mixC(f0, f1, Math.pow(r, 1.15));
      c = mul(c, 0.82 + 0.28 * ray);
      // 条の節(ふし)
      const jn = ss(0.86, 0.97, Math.abs(Math.sin(r * r * 52 + hash2(ri, 3) * 6.28)));
      c = mul(c, 1 - jn * 0.1 * r);
      if (P.finEdge) c = mixC(c, hex(P.finEdge), ss(0.8, 0.98, r) * 0.85);
      if (P.finBase) c = mixC(c, hex(P.finBase), ss(0.3, 0.0, r) * 0.6);
      if (P.finPaint) {
        const sl = clamp((((x % 256) + 0.5) / 256 - 0.02) / 0.96);
        const o = P.finPaint(reg, sl, r, c, a, ray);
        if (o) { c = [o[0], o[1], o[2]]; if (o[3] != null) a = o[3]; }
      }
      const i = (y * W + x) * 4;
      data[i] = clamp(c[0], 0, 255); data[i + 1] = clamp(c[1], 0, 255); data[i + 2] = clamp(c[2], 0, 255);
      data[i + 3] = clamp(a, 0, 1) * 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const PAINTERS = {
  funa: {
    body: bodyPaint({
      back: hex(0x48471f), flank: hex(0xb6a566), belly: hex(0xe6dfc6), nc: 46, nr: 32, rimK: 0.55, cheek: hex(0xcbb978), glint: hex(0xfff0c0), glintK: 0.2,
      extra: (c, u, ang, b) => mixC(c, hex(0xd2b868), ss(0.0, 0.5, 0.35 - Math.abs(b - 0.05)) * 0.18 * ss(0.25, 0.4, u)),
    }),
    eye: { skin: 0x8a8858, iris: 0xdca848, iris2: 0xb87a28 },
    fin: [0x6a683c, 0xa9a47a], finBase: 0x8e8450, dark: 0x3f3d24, barbel: 0xd0c8a0, accent: 0xd9c88a, rays: 17,
  },
  koi: {
    body: bodyPaint({
      back: hex(0x3a3620), flank: hex(0x9a7b34), belly: hex(0xd8c98e), nc: 30, nr: 26, rimK: 0.85, cheek: hex(0xb69a4a), glint: hex(0xffe9a8), glintK: 0.22,
      extra: (c, u, ang, b) => {
        const n = an(u, ang, 5, 1.6, 3, 4);
        return mixC(c, hex(0xc4a040), clamp(n * 1.3 + 0.1) * 0.2 * ss(-0.5, 0.4, b));
      },
    }),
    eye: { skin: 0x5a4a28, iris: 0xd0a040, iris2: 0x8a5a20 },
    fin: [0x5e4c2a, 0xa98f58], finBase: 0x7e6638, dark: 0x3a3320, barbel: 0xc9b57a, accent: 0xb99a52, rays: 15,
  },
  tanago: {
    body: bodyPaint({
      back: hex(0x5e6e50), flank: hex(0xb6c4c6), belly: hex(0xe4b9a8), nc: 36, nr: 26, rimK: 0.3, glint: hex(0xffffff), glintK: 0.4,
      extra: (c, u, ang, b) => {
        const band = ss(0.4, 0.55, u) * (1 - ss(0.95, 1.0, u)) * ss(0.22, 0.0, Math.abs(b + 0.05));
        c = mixC(c, hex(0x25d4c2), band * 0.92);
        c = mixC(c, hex(0xf08a6a), ss(-0.35, -0.9, b) * 0.65 * ss(0.25, 0.5, u));
        const s = Math.hypot((u - 0.25) * 8, b * 1.4);
        c = mixC(c, hex(0x202428), ss(0.4, 0.15, s) * 0.8);
        const sp = an(u, ang, 90, 5, 2);
        return mixC(c, [255, 255, 255], clamp(sp * 1.4) * 0.16);
      },
    }),
    eye: { skin: 0x7a8a78, iris: 0xe02a20, iris2: 0x8a1410, pupil: 0.36 },
    fin: [0xdc4a2a, 0xf2a078], finEdge: 0x1e1818, finBase: 0xe58a5a, dark: 0x3a3e30, barbel: 0xe9b0a0, accent: 0x25d4c2, rays: 12,
  },
  dojo: {
    body: bodyPaint({
      back: hex(0x544828), flank: hex(0x8d7840), belly: hex(0xd6c88e), nc: 70, nr: 22, rimK: 0.12, scaleK: 0.45, glintK: 0.08, mottle: 0.16,
      extra: (c, u, ang, b) => {
        const s = an(u, ang, 80, 4, 2);
        c = mixC(c, hex(0x2a2112), ss(0.2, 0.5, s) * 0.6 * ss(-0.5, 0.25, b));
        const s2 = an(u, ang, 10, 1.4, 3, 9);
        c = mixC(c, hex(0x2c2412), ss(0.05, 0.3, s2) * 0.28 * ss(-0.3, 0.3, b));
        const band = ss(0.5, 0.2, Math.abs(b - 0.15)) * 0.2 * ss(0.18, 0.3, u);
        return mixC(c, hex(0x2a2010), band);
      },
    }),
    eye: { skin: 0x5a4a2a, iris: 0x8a5a28, iris2: 0x4a2a10, pupil: 0.4 },
    fin: [0x6c5f34, 0xa4915a], finBase: 0x7a6a3c, dark: 0x3a301a, barbel: 0xb09a62, accent: 0x7a6838, rays: 10, finA: [0.5, 0.9],
  },
  namazu: {
    body: bodyPaint({
      back: hex(0x363a28), flank: hex(0x575c3e), belly: hex(0xb8bb98), nc: 4, nr: 4, rimK: 0, scaleK: 0, lat: false, glintK: 0, mottle: 0.12,
      extra: (c, u, ang, b) => {
        const m = an(u, ang, 9, 1.8, 4, 4);
        c = mixC(c, hex(0x6c6e44), ss(0.05, 0.4, m) * 0.5 * ss(-0.6, 0.3, b));
        c = mixC(c, hex(0x1c1e12), ss(0.25, 0.5, an(u, ang, 14, 2.4, 3, 11)) * 0.4 * ss(-0.2, 0.5, b));
        const d = an(u, ang, 60, 5, 2);
        return mul(c, 0.94 + d * 0.14);
      },
    }),
    eye: { skin: 0x383c28, iris: 0xa08a3a, iris2: 0x5a4818, pupil: 0.4 },
    fin: [0x2a2e20, 0x585a40], finBase: 0x3c4030, dark: 0x1d2016, barbel: 0x30342a, accent: 0x70724e, rays: 14, finA: [0.55, 0.9],
  },
  nishiki: {
    body: bodyPaint({
      back: hex(0xeee9de), flank: hex(0xf1ece2), belly: hex(0xf9f6ee), nc: 30, nr: 26, rimK: 0.35, glint: hex(0xffffff), glintK: 0.3, cheek: hex(0xfaf6ec),
      extra: (c, u, ang, b) => {
        const p = an(u, ang, 3.4, 1.4, 4, 5);
        const red = ss(-0.02, 0.1, p) * ss(-0.75, 0.0, b + 0.2);
        const col = mixC(c, hex(0xd8341b), red * 0.95);
        const sm = an(u, ang, 8, 1.8, 3, 22);
        const sumi = ss(0.2, 0.3, sm) * ss(0.0, 0.7, b) * ss(0.24, 0.34, u);
        return mixC(col, hex(0x161618), sumi * 0.9);
      },
    }),
    eye: { skin: 0xb8b0a0, iris: 0xd0a436, iris2: 0x8a6a20 },
    fin: [0xe4ddd0, 0xf6f2ea], finBase: 0xf0c8b8, dark: 0x161618, barbel: 0xefe6d2, accent: 0xd8341b, rays: 15,
  },
  // 季節の魚
  hibuna: {
    body: bodyPaint({
      back: hex(0xc8461a), flank: hex(0xf08a3a), belly: hex(0xffe0b0), nc: 46, nr: 32, rimK: 0.5, cheek: hex(0xffa850), glint: hex(0xfff0c8), glintK: 0.25,
      extra: (c, u, ang, b) => mixC(c, hex(0xff6a28), ss(0.0, 0.5, 0.35 - Math.abs(b - 0.05)) * 0.2 * ss(0.25, 0.4, u)),
    }),
    eye: { skin: 0xd08a50, iris: 0xe0b050, iris2: 0xb87a28 },
    fin: [0xe0561e, 0xf8a060], finBase: 0xe8661e, dark: 0x6a2a10, barbel: 0xf0c890, accent: 0xffb060, rays: 17,
  },
  unagi: {
    body: bodyPaint({
      back: hex(0x1e1c14), flank: hex(0x3c3a28), belly: hex(0xd8d0a0), nc: 4, nr: 4, rimK: 0, scaleK: 0, lat: false, glintK: 0, mottle: 0.08,
      extra: (c, u, ang, b) => { const d = an(u, ang, 60, 5, 2); return mul(c, 0.94 + d * 0.14); },
    }),
    eye: { skin: 0x2a2a1c, iris: 0xc8b060, iris2: 0x6a5a20, pupil: 0.4 },
    fin: [0x2a2a1c, 0x5a5a3e], finBase: 0x303020, dark: 0x16160e, barbel: 0x2a2a20, accent: 0x6a6a44, rays: 22, finA: [0.55, 0.9],
  },
  herabuna: {
    body: bodyPaint({
      back: hex(0x4a4a30), flank: hex(0xcdc8a0), belly: hex(0xf0ecd8), nc: 40, nr: 30, rimK: 0.5, cheek: hex(0xe0d8aa), glint: hex(0xffffff), glintK: 0.35,
      extra: (c, u, ang, b) => mixC(c, hex(0xe8d890), ss(0.0, 0.5, 0.35 - Math.abs(b - 0.05)) * 0.2 * ss(0.25, 0.4, u)),
    }),
    eye: { skin: 0x9a9468, iris: 0xe0b860, iris2: 0xa87a30 },
    fin: [0x6a6a48, 0xb8b490], finBase: 0x8e8a5c, dark: 0x3f3d24, barbel: 0xd0c8a0, accent: 0xd9c88a, rays: 17,
  },
  wakasagi: {
    body: bodyPaint({
      back: hex(0x6b7a62), flank: hex(0xcfd9d8), belly: hex(0xf3f4ee), nc: 44, nr: 28, rimK: 0.3, glint: hex(0xffffff), glintK: 0.45,
      extra: (c, u, ang, b) => { const band = ss(0.4, 0.55, u) * (1 - ss(0.95, 1.0, u)) * ss(0.2, 0.0, Math.abs(b + 0.02)); return mixC(c, hex(0xe6eef0), band * 0.5); },
    }),
    eye: { skin: 0x7a8a82, iris: 0x303428, iris2: 0x181a14, pupil: 0.5 },
    fin: [0xa9b4ae, 0xdde4e0], finBase: 0xb8c4be, dark: 0x3a4038, barbel: 0xe0e8e4, accent: 0xcfd9d8, rays: 10, finA: [0.3, 0.7],
  },
  imori: {
    body: (u, ang) => {
      const b = Math.sin(ang);
      let back = hex(0x4e3e34);
      const w = an(u, ang, 60, 6, 3);
      back = mixC(back, hex(0x8a7556), ss(0.15, 0.55, w) * 0.7);
      const gran = noise2(u * 220 + Math.cos(ang) * 14, Math.sin(ang) * 14);
      back = mul(back, 0.9 + gran * 0.2);
      let belly = hex(0xe3441a);
      const sp = an(u, ang, 22, 3, 3, 8);
      belly = mixC(belly, hex(0x1b1210), ss(0.18, 0.3, sp) * 0.95);
      belly = mul(belly, 0.92 + 0.12 * noise2(u * 90 + Math.cos(ang) * 8, Math.sin(ang) * 8));
      const split = ss(-0.1, -0.32, b);
      let c = mixC(back, belly, split);
      if (u < 0.16) c = mixC(c, hex(0x2b221c), ss(0.16, 0.0, u) * 0.7 * split);
      // 耳腺(頭のうしろの膨らみ)と首のしわ
      const nk = Math.exp(-Math.pow((u - 0.17) / 0.012, 2));
      c = mul(c, 1 - 0.3 * nk);
      // いぼ
      const wart = 0.5 + 0.5 * noise2(u * 170 + Math.cos(ang) * 11, Math.sin(ang) * 11 + 1.7);
      const h = 0.45 + 0.4 * ss(0.45, 0.8, wart) * (1 - split * 0.6) - 0.15 * nk;
      return [c[0], c[1], c[2], h];
    },
    eye: { skin: 0x3a2c24, iris: 0xd6a830, iris2: 0x8a5a16, pupil: 0.36 },
    fin: [0x3a2f27, 0x7a5a3a], finBase: 0xa8502a, dark: 0x30261f, barbel: 0xd9421a, accent: 0xe5481c, rays: 9, finA: [0.4, 0.8],
  },
};

const ATLAS = {};
// 読み込み中に1種ずつ描いておく（画面を止めないため）
export let FISH_TEXTURE_IDS = Object.keys(PAINTERS);
export function prebakeFish(id) { getFishAtlas(id); }
// 場所ごとの魚（reeffish.js など）を足す。painter = 体の絵、body = 体の形（BODIES と同じ）、look = 質感
export function registerFish(id, { painter, body, look }) {
  PAINTERS[id] = painter;
  BODIES[id] = body;
  if (look) LOOK[id] = look;
  FISH_TEXTURE_IDS = Object.keys(PAINTERS);
}
export { bodyPaint, mixC, mul, hex, ss, an, curve, noise2, fbm2, clamp, lerp, hash2, TAU };
export function getFishAtlas(id) {
  if (!ATLAS[id]) ATLAS[id] = { ...bakeAtlas(PAINTERS[id]), fin: bakeFin(PAINTERS[id]) };
  return ATLAS[id];
}

// ---------------------------------------------------------------------------
// ロフト体（横から見た輪郭 top/bot と 幅 w の曲線から作る）
function loft(def, S = 80, R = 28) {
  const top = curve(def.top), bot = curve(def.bot), wid = curve(def.w);
  const yc = def.yc ? curve(def.yc) : () => 0;
  const p = def.p || 2.3;
  const gillG = def.gill ?? 0.03;
  const gT = def.gillT ?? 0.2;
  const tEnd = def.top[def.top.length - 1][0];
  const surf = (t, th, out = [0, 0, 0]) => {
    const c = Math.cos(th), s = Math.sin(th);
    const cc = Math.sign(c) * Math.pow(Math.abs(c), 2 / p), sv = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
    const hh = s >= 0 ? top(t) * def.Ht : bot(t) * def.Hb;
    // えら蓋より前(頭)は一段ふくらむ
    const k = 1 + gillG * (1 - ss(gT - 0.015, gT + 0.015, t)) * ss(0.02, 0.09, t);
    out[0] = 0.5 - t;
    out[1] = yc(t) + hh * sv * k;
    out[2] = wid(t) * def.W * cc * k;
    return out;
  };
  const pos = [], uv = [], idx = [], an_ = [];
  for (let i = 0; i <= S; i++) {
    const t = Math.pow(i / S, 1.15) * tEnd;
    const gw = Math.sin(Math.PI * ss(0.06, 0.24, t));
    for (let j = 0; j <= R; j++) {
      const th = (j / R) * TAU;
      const v = surf(t, th);
      pos.push(v[0], v[1], v[2]);
      uv.push(t / tEnd, bodyV(j, R));
      const mw = (1 - ss(0.0, 0.07, t)) * ss(-0.05, -0.5, Math.sin(th));
      an_.push(0, gw, mw, 0);
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + 1, c = a + R + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAnim', new THREE.Float32BufferAttribute(an_, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 継ぎ目の法線をそろえる
  const n = g.attributes.normal;
  for (let i = 0; i <= S; i++) {
    const a = i * (R + 1), b = a + R;
    const nx = n.getX(a) + n.getX(b), ny = n.getY(a) + n.getY(b), nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l);
    n.setXYZ(b, nx / l, ny / l, nz / l);
  }
  // 向きが逆なら反転
  const mid = Math.floor(S / 2) * (R + 1) + Math.floor(R / 4);
  const topV = new THREE.Vector3(pos[mid * 3], pos[mid * 3 + 1], pos[mid * 3 + 2]);
  if (n.getY(mid) < 0 && topV.y > 0) {
    for (let k = 0; k < idx.length; k += 3) { const tt = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tt; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return { geometry: g, surf, tEnd };
}

// ひれ。aAnim = (種類 1:背/しり 2:胸/腹 3:尾, 根元からの距離, 付け根方向の位置, 左右)
function fin(baseFn, rimFn, { N = 12, K = 4, type = 1, sg = 1, kx = 1, uo = 0 } = {}) {
  const pos = [], uv = [], idx = [], an_ = [];
  for (let k = 0; k <= K; k++) {
    const r = k / K;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = baseFn(s), b = rimFn(s);
      pos.push(lerp(a[0], b[0], r), lerp(a[1], b[1], r), lerp(a[2], b[2], r));
      uv.push(uo + s * kx, 0.03 + 0.94 * r);
      an_.push(type, r, s, sg);
    }
  }
  for (let k = 0; k < K; k++)
    for (let i = 0; i < N; i++) {
      const a = k * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAnim', new THREE.Float32BufferAttribute(an_, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 目玉: +z 向きに少しふくらんだ球。(x,y) 平面の絵を貼る
function eyeGeo(r, pos, dir, flat = 0.6) {
  const g = new THREE.SphereGeometry(r, 22, 14);
  const p = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / r, y = p.getY(i) / r;
    uv.setXY(i, eyeU(x), eyeV(y));
    const z = p.getZ(i);
    p.setZ(i, z * flat);
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i) / flat;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(i, nx / l, ny / l, nz / l);
  }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
  g.applyQuaternion(q);
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}

function taperTube(pts, r0, r1, sw_, radial = 5, w0 = null, w1 = 1) {
  const curveP = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const seg = Math.max(4, pts.length * 3);
  const pos = [], idx = [], uv = [], an_ = [];
  const frames = curveP.computeFrenetFrames(seg, false);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = curveP.getPoint(t);
    const r = lerp(r0, r1, t);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + (N.x * c + B.x * s) * r, p.y + (N.y * c + B.y * s) * r, p.z + (N.z * c + B.z * s) * r);
      uv.push(sw_[0], sw_[1]);
      an_.push(0, 0, 0, w0 === null ? 0 : lerp(w0, w1, t));
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAnim', new THREE.Float32BufferAttribute(an_, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 体の定義（長さ=1、鼻先が +x。top/bot は断面の上下の高さ、w は幅）
const BODIES = {
  funa: {
    Ht: 0.215, Hb: 0.2, W: 0.088, p: 2.25, gill: 0.016,
    yc: [[0, -0.035], [0.12, -0.012], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.16], [0.04, 0.36], [0.09, 0.52], [0.15, 0.66], [0.24, 0.84], [0.34, 0.96], [0.42, 1], [0.52, 0.97], [0.62, 0.85], [0.72, 0.64], [0.8, 0.46], [0.87, 0.35], [0.94, 0.3], [0.985, 0.24], [1.0, 0.1]],
    bot: [[0, 0], [0.012, 0.16], [0.04, 0.34], [0.09, 0.5], [0.15, 0.64], [0.26, 0.85], [0.38, 0.98], [0.47, 1], [0.57, 0.94], [0.67, 0.78], [0.77, 0.57], [0.85, 0.42], [0.92, 0.34], [0.97, 0.3], [1.0, 0.12]],
    w: [[0, 0], [0.012, 0.3], [0.05, 0.62], [0.12, 0.84], [0.22, 0.96], [0.34, 1], [0.5, 0.98], [0.66, 0.78], [0.8, 0.5], [0.9, 0.32], [1, 0.1]],
    fins: { dorsal: [0.32, 0.7, 0.17], anal: [0.68, 0.79, 0.075], caudal: { L: 0.21, H: 0.15, notch: 0.42 }, pect: [0.245, 0.17], pelv: [0.47, 0.12] },
    eye: [0.082, 0.023, 0.42],
  },
  koi: {
    Ht: 0.18, Hb: 0.165, W: 0.1, p: 2.2, gill: 0.016,
    yc: [[0, -0.03], [0.12, -0.01], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.014, 0.18], [0.045, 0.4], [0.1, 0.58], [0.18, 0.76], [0.28, 0.92], [0.4, 1], [0.5, 0.99], [0.62, 0.86], [0.74, 0.64], [0.84, 0.46], [0.92, 0.36], [0.985, 0.28], [1.0, 0.1]],
    bot: [[0, 0], [0.014, 0.18], [0.045, 0.38], [0.1, 0.56], [0.2, 0.78], [0.34, 0.96], [0.48, 1], [0.6, 0.9], [0.72, 0.7], [0.82, 0.52], [0.9, 0.4], [0.97, 0.32], [1.0, 0.12]],
    w: [[0, 0], [0.014, 0.32], [0.05, 0.66], [0.12, 0.88], [0.24, 1], [0.5, 1], [0.7, 0.82], [0.85, 0.5], [0.94, 0.3], [1, 0.1]],
    fins: { dorsal: [0.3, 0.7, 0.13], anal: [0.7, 0.8, 0.075], caudal: { L: 0.23, H: 0.14, notch: 0.45 }, pect: [0.245, 0.15], pelv: [0.47, 0.11] },
    eye: [0.08, 0.02, 0.42], barbels: 2,
  },
  tanago: {
    Ht: 0.235, Hb: 0.215, W: 0.07, p: 2.4, gill: 0.014,
    yc: [[0, -0.03], [0.12, -0.008], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.014, 0.16], [0.045, 0.38], [0.1, 0.56], [0.18, 0.76], [0.3, 0.95], [0.42, 1], [0.54, 0.93], [0.66, 0.74], [0.78, 0.52], [0.88, 0.36], [0.96, 0.3], [1.0, 0.1]],
    bot: [[0, 0], [0.014, 0.16], [0.045, 0.36], [0.1, 0.56], [0.2, 0.8], [0.34, 0.97], [0.5, 1], [0.62, 0.84], [0.74, 0.6], [0.84, 0.44], [0.93, 0.34], [0.98, 0.3], [1.0, 0.1]],
    w: [[0, 0], [0.014, 0.3], [0.05, 0.62], [0.14, 0.86], [0.3, 1], [0.55, 0.95], [0.8, 0.55], [0.95, 0.28], [1, 0.08]],
    fins: { dorsal: [0.34, 0.66, 0.2], anal: [0.55, 0.78, 0.1], caudal: { L: 0.22, H: 0.15, notch: 0.4 }, pect: [0.25, 0.14], pelv: [0.46, 0.12] },
    eye: [0.085, 0.027, 0.42],
  },
  dojo: {
    Ht: 0.062, Hb: 0.056, W: 0.054, p: 2.0, gill: 0.018,
    yc: [[0, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.3], [0.05, 0.62], [0.14, 0.86], [0.3, 1], [0.6, 1], [0.82, 0.88], [0.94, 0.7], [0.985, 0.5], [1.0, 0.12]],
    bot: [[0, 0], [0.012, 0.3], [0.05, 0.62], [0.14, 0.86], [0.3, 1], [0.6, 1], [0.82, 0.88], [0.94, 0.7], [0.985, 0.5], [1.0, 0.12]],
    w: [[0, 0], [0.012, 0.3], [0.05, 0.6], [0.14, 0.85], [0.3, 1], [0.6, 0.95], [0.85, 0.7], [0.98, 0.4], [1, 0.1]],
    fins: { dorsal: [0.46, 0.58, 0.07], anal: [0.7, 0.76, 0.04], caudal: { L: 0.1, H: 0.045, notch: 0.0, round: true }, pect: [0.14, 0.05], pelv: [0.5, 0.04] },
    eye: [0.058, 0.0085, 0.8], barbels: 5,
  },
  namazu: {
    Ht: 0.115, Hb: 0.1, W: 0.115, p: 2.1, gill: 0.012,
    yc: [[0, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.25], [0.05, 0.5], [0.12, 0.62], [0.22, 0.75], [0.4, 1], [0.62, 0.9], [0.8, 0.66], [0.92, 0.45], [0.98, 0.3], [1.0, 0.08]],
    bot: [[0, 0], [0.012, 0.25], [0.05, 0.45], [0.12, 0.55], [0.22, 0.7], [0.4, 0.95], [0.62, 0.8], [0.8, 0.55], [0.92, 0.38], [0.98, 0.25], [1.0, 0.08]],
    w: [[0, 0], [0.01, 0.6], [0.05, 0.95], [0.12, 1], [0.2, 0.92], [0.4, 0.62], [0.65, 0.4], [0.85, 0.27], [0.98, 0.14], [1, 0.03]],
    fins: { dorsal: [0.25, 0.3, 0.025], anal: [0.28, 0.96, 0.055], analKx: 2.6, caudal: { L: 0.1, H: 0.06, notch: 0.0, round: true }, pect: [0.18, 0.08], pelv: [0.5, 0.05] },
    eye: [0.045, 0.011, 1.0], barbels: 6,
  },
};
BODIES.nishiki = { ...BODIES.koi, barbels: 2 };
BODIES.hibuna = { ...BODIES.funa };
BODIES.herabuna = { ...BODIES.funa, Ht: 0.285, Hb: 0.265, W: 0.1, fins: { ...BODIES.funa.fins, dorsal: [0.3, 0.7, 0.2] } };
BODIES.wakasagi = {
  ...BODIES.tanago, Ht: 0.15, Hb: 0.13, W: 0.055,
  fins: { dorsal: [0.4, 0.58, 0.13], anal: [0.62, 0.8, 0.08], caudal: { L: 0.2, H: 0.13, notch: 0.45 }, pect: [0.25, 0.1], pelv: [0.45, 0.08] },
};
BODIES.unagi = {
  ...BODIES.dojo, Ht: 0.046, Hb: 0.04, W: 0.04, barbels: 0,
  fins: { dorsal: [0.24, 0.975, 0.02], anal: [0.34, 0.975, 0.018], caudal: { L: 0.03, H: 0.02, notch: 0.0, round: true }, pect: [0.11, 0.03], pelv: [0.5, 0.004] },
  eye: [0.05, 0.0065, 0.85],
};

const SIDE = [1, -1];

function buildSwimmer(id) {
  const B = BODIES[id];
  const atlas = getFishAtlas(id);
  const { geometry: body, surf } = loft(B, 80, 28);
  const parts = [body];
  const fins = [];
  const [fd0, fd1, fdh] = B.fins.dorsal;
  const [fa0, fa1, fah] = B.fins.anal;
  const P = (t, th) => surf(t, th, [0, 0, 0]);
  // ひれごとに塗り分ける魚は、テクスチャの別の場所を使う
  const reg = PAINTERS[id] && PAINTERS[id].finPaint;
  const R = (k, kx) => (reg ? { uo: (k + 0.02) / FIN_REGIONS, kx: 0.96 / FIN_REGIONS } : { kx });
  // 背びれ
  fins.push(fin(
    (s) => P(lerp(fd0, fd1, s), Math.PI / 2),
    (s) => {
      const b = P(lerp(fd0, fd1, s), Math.PI / 2);
      const sh = B.fins.dshape ? B.fins.dshape(s) : Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 0.7) * (1.0 - 0.35 * s) + 0.1 * (1 - s);
      const sw = B.fins.dsweep ?? 0.25;
      return [b[0] - 0.05 * s - fdh * sw * (B.fins.dshape ? sh : s), b[1] + fdh * sh, b[2]];
    },
    { N: 18, K: 5, type: 1, ...R(0, B.fins.dKx || 1) }
  ));
  // しりびれ
  fins.push(fin(
    (s) => P(lerp(fa0, fa1, s), -Math.PI / 2),
    (s) => {
      const b = P(lerp(fa0, fa1, s), -Math.PI / 2);
      const sh = B.fins.ashape ? B.fins.ashape(s) : Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.7) * (1 - 0.3 * s) + 0.1 * (1 - s);
      const sw = B.fins.asweep ?? 0;
      return [b[0] - 0.05 * s - fah * sw * (B.fins.ashape ? sh : 0), b[1] - fah * sh, b[2]];
    },
    { N: 14, K: 4, type: 1, ...R(1, B.fins.analKx || 0.7) }
  ));
  // 尾びれ（二又 / ドジョウ・ナマズは丸い）
  const cd = B.fins.caudal;
  const tb = P(0.975, Math.PI / 2), tbb = P(0.975, -Math.PI / 2);
  const cMid = (tb[1] + tbb[1]) / 2, cHalf = Math.max((tb[1] - tbb[1]) / 2, 0.02);
  fins.push(fin(
    (s) => [tb[0] + 0.01, cMid + (0.5 - s) * 2 * cHalf * 1.2, 0],
    (s) => {
      const q = Math.abs(s - 0.5) * 2;
      const y = cMid + (0.5 - s) * 2 * (cd.H + cHalf * 0.6);
      let ext;
      if (cd.ext) ext = cd.ext(q, s);                 // 種ごとの尾の形（キイロハギの、切れ込みの浅い尾など）
      else if (cd.round) ext = 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - Math.pow(q, 2.2)));
      else {
        const lobe = Math.sqrt(Math.max(0, 1 - Math.pow(q, 4.5) * 0.55));
        const notch = 1 - cd.notch * Math.exp(-Math.pow((s - 0.5) / 0.2, 2));
        ext = (0.42 + 0.58 * Math.pow(q, 0.8) + 0.0) * notch;
        ext = Math.min(1, ext) * lobe;
      }
      return [tb[0] - cd.L * ext, y, 0];
    },
    { N: 26, K: 6, type: 3, ...R(2, 1.25) }
  ));
  // 胸びれ・腹びれ
  const [pt, pl] = B.fins.pect;
  const [vt, vl] = B.fins.pelv;
  for (const sg of SIDE) {
    const A = P(pt, sg > 0 ? -0.62 : Math.PI + 0.62);
    const a0 = [A[0], A[1] + pl * 0.16, A[2]], a1 = [A[0] + 0.003, A[1] - pl * 0.14, A[2]];
    fins.push(fin(
      (s) => [lerp(a0[0], a1[0], s), lerp(a0[1], a1[1], s), lerp(a0[2], a1[2], s)],
      (s) => {
        const sh = Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * s)), 0.8) * 0.9 + 0.12;
        return [A[0] - pl * 0.95 * sh, A[1] - pl * 0.34 * sh - pl * 0.42 * (s - 0.5), A[2] + sg * pl * 0.6 * sh];
      },
      { N: 12, K: 5, type: 2, sg, ...R(3, 0.8) }
    ));
    const V = P(vt, sg > 0 ? -1.25 : Math.PI + 1.25);
    const Vz = V[2];
    fins.push(fin(
      (s) => [V[0] - s * 0.02, V[1], Vz * (1 - s * 0.3)],
      (s) => {
        const sh = Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * s)), 0.8) * 0.9 + 0.12;
        return [V[0] - vl * 0.9 * sh - s * 0.02, V[1] - vl * 0.38 * sh, Vz + sg * vl * 0.45 * sh];
      },
      { N: 10, K: 4, type: 2, sg, ...R(4, 0.6) }
    ));
  }
  // 種ごとの飾り（ツノダシの長い背びれ・フエヤッコダイの口先など）
  // 種ごとに足すひれ（2つめの背びれ・とげの背びれなど）は、背びれと同じ塗りを使う（opts.region で変えられる）
  const finX = (b, r, o = {}) => fin(b, r, reg ? { ...o, ...R(o.region ?? 0, o.kx ?? 1) } : o);
  if (B.extra) B.extra({ P, parts, fins, fin: finX, taperTube, eyeGeo, SW, lerp, SIDE });
  // 目
  const [et, er, eth] = B.eye;
  for (const sg of SIDE) {
    const th = sg > 0 ? eth : Math.PI - eth;
    const E = P(et, th);
    const nrm = [0, Math.sin(eth) * 0.6, sg * Math.cos(eth)];
    parts.push(eyeGeo(er, [E[0], E[1], E[2] - sg * er * 0.25], nrm, 0.62));
  }
  // ひげ（コイ・ニシキゴイは、口のはしの長い一対と、前の短い一対。横から見て、ぶらりと垂れて見えるように）
  if (B.barbels) {
    const n = B.barbels;
    const long = id === 'namazu';
    const carp = id === 'koi' || id === 'nishiki';
    for (let k = 0; k < n; k++) {
      for (const sg of SIDE) {
        const pr = k / Math.max(1, n - 1);
        const A = P(0.012 + (id === 'dojo' ? 0.004 * k : 0), sg > 0 ? -0.5 - 0.25 * pr : Math.PI + 0.5 + 0.25 * pr);
        const len = long ? (k < 2 ? 0.2 : 0.07) : carp ? (k === 0 ? 0.08 : 0.052) : id === 'dojo' ? 0.05 : 0.035;
        const spread = long && k < 2 ? 0.9 : carp ? 0.5 : 0.5;
        const pts = carp ? [
          A,
          [A[0] - len * 0.12, A[1] - len * 0.38, A[2] + sg * len * spread * 0.3],
          [A[0] - len * 0.4, A[1] - len * 0.78, A[2] + sg * len * spread * 0.55],
          [A[0] - len * 0.78, A[1] - len * 0.95, A[2] + sg * len * spread * 0.7],
        ] : [
          A,
          [A[0] - len * 0.35, A[1] - len * 0.15, A[2] + sg * len * spread * 0.6],
          [A[0] - len * 0.8 - (long ? 0.02 : 0), A[1] - len * 0.3 - (k % 2) * len * 0.1, A[2] + sg * len * spread * (0.5 + 0.2 * k % 3)],
        ];
        parts.push(taperTube(pts, long ? 0.0045 : carp ? 0.008 : 0.003, carp ? 0.0028 : 0.0012, SW.barbel, carp ? 7 : 5, -0.01, -1));
      }
    }
  }
  body.computeBoundingBox();
  const bellyMin = body.boundingBox.min.y;
  const geometry = mergeGeos(parts, [{ name: 'aAnim', size: 4 }]);
  const finGeo = mergeGeos(fins, [{ name: 'aAnim', size: 4 }]);
  return finalize({ geometry, finGeo, atlas, B, bellyMin });
}

// 全長(ひれを含む)を測っておく
function finalize(c) {
  const box = new THREE.Box3();
  c.geometry.computeBoundingBox();
  box.copy(c.geometry.boundingBox);
  if (c.finGeo) { c.finGeo.computeBoundingBox(); box.union(c.finGeo.boundingBox); }
  c.extent = box.max.x - box.min.x;
  c.cx = (box.max.x + box.min.x) / 2;
  if (c.B && c.B.extentBox) { c.extent = c.B.extentBox[1] - c.B.extentBox[0]; c.cx = (c.B.extentBox[0] + c.B.extentBox[1]) / 2; }   // ツノダシの長いむちは、全長にいれない
  return c;
}

// ---------------------------------------------------------------------------
// イモリ
function buildNewt() {
  const def = {
    Ht: 0.075, Hb: 0.06, W: 0.062, p: 2.0, gill: 0.0,
    top: [[0, 0], [0.015, 0.4], [0.06, 0.62], [0.14, 0.66], [0.22, 0.6], [0.4, 0.66], [0.55, 0.78], [0.7, 0.9], [0.84, 0.62], [0.95, 0.28], [1.0, 0.04]],
    bot: [[0, 0], [0.015, 0.4], [0.06, 0.55], [0.14, 0.52], [0.22, 0.7], [0.4, 0.78], [0.55, 0.7], [0.7, 0.6], [0.84, 0.38], [0.95, 0.15], [1.0, 0.03]],
    w: [[0, 0], [0.012, 0.55], [0.06, 0.78], [0.14, 0.7], [0.22, 0.85], [0.4, 0.95], [0.55, 0.8], [0.7, 0.4], [0.85, 0.24], [0.96, 0.12], [1.0, 0.03]],
  };
  const atlas = getFishAtlas('imori');
  const { geometry: body, surf } = loft(def, 70, 24);
  const parts = [body];
  const fins = [];
  const P = (t, th) => surf(t, th, [0, 0, 0]);
  // 尾の縁取りのひれ（背・腹）
  fins.push(fin(
    (s) => P(lerp(0.58, 0.975, s), Math.PI / 2),
    (s) => {
      const b = P(lerp(0.58, 0.975, s), Math.PI / 2);
      return [b[0] - 0.012 * s, b[1] + 0.017 * Math.sin(Math.PI * Math.pow(s, 0.85)) * (0.35 + 0.65 * s), b[2]];
    },
    { N: 20, K: 3, type: 1, kx: 2.2 }
  ));
  fins.push(fin(
    (s) => P(lerp(0.66, 0.97, s), -Math.PI / 2),
    (s) => {
      const b = P(lerp(0.66, 0.97, s), -Math.PI / 2);
      return [b[0] - 0.012 * s, b[1] - 0.02 * Math.sin(Math.PI * Math.pow(s, 0.8)), b[2]];
    },
    { N: 14, K: 3, type: 1, kx: 1.4 }
  ));
  // 目（頭の上にぽこっと出る）
  for (const sg of SIDE) {
    const th = sg > 0 ? 1.0 : Math.PI - 1.0;
    const E = P(0.07, th);
    const nrm = [sg * 0.45, 0.85, 0.2];
    parts.push(eyeGeo(0.0125, [E[0], E[1] + 0.003, E[2]], nrm, 0.75));
  }
  // 脚
  const leg = (t, sg, fore) => {
    const A = P(t, sg > 0 ? -0.45 : Math.PI + 0.45);
    const k = fore ? 1 : -1;
    const B = [A[0] + 0.03 * k, A[1] - 0.012, A[2] + sg * 0.04];
    const C = [B[0] + 0.045 * (fore ? 1 : 0.5), B[1] - 0.03, B[2] + sg * 0.012];
    parts.push(taperTube([A, B, C], 0.011, 0.006, SW.dark, 6, 0.02, 0.9));
    const nf = fore ? 4 : 5;
    for (let f = 0; f < nf; f++) {
      const o = (f - (nf - 1) / 2) * 0.0075;
      const D = [C[0] + 0.022, C[1] - 0.004, C[2] + sg * 0.004 + o];
      parts.push(taperTube([C, [C[0] + 0.011, C[1] - 0.002, C[2] + sg * 0.002 + o * 0.7], D], 0.0042, 0.002, SW.accent, 5, 0.9, 1.05));
    }
  };
  leg(0.2, 1, true); leg(0.2, -1, true);
  leg(0.52, 1, false); leg(0.52, -1, false);
  const geometry = mergeGeos(parts, [{ name: 'aAnim', size: 4 }]);
  const finGeo = mergeGeos(fins, [{ name: 'aAnim', size: 4 }]);
  geometry.computeBoundingBox();
  body.computeBoundingBox();
  return finalize({ geometry, finGeo, atlas, B: def, bellyMin: geometry.boundingBox.min.y, backMax: body.boundingBox.max.y });
}

// ---------------------------------------------------------------------------
// マテリアル（体のうねり・ひれの波・呼吸 + 水中の濁り）
const WIG = /* glsl */ `
  {
    float brp = 0.5 + 0.5 * sin(uBreathT + uWigPhase * 1.7);
    if (aAnim.x < 0.5) {
      transformed.z *= 1.0 + aAnim.y * 0.024 * brp;
      transformed.y -= aAnim.z * (0.003 + 0.011 * brp);
      if (aAnim.w < 0.0) {
        // ひげ: 水の流れでゆらゆら
        float sy = sin(uTime * 2.6 + uWigPhase * 2.0 + transformed.z * 30.0);
        transformed.y += aAnim.w * 0.007 * sy;
        transformed.z += aAnim.w * 0.005 * sin(uTime * 2.1 + uWigPhase + transformed.x * 20.0);
      }
      if (aAnim.w > 0.0) {
        // イモリの脚: 対角の脚が同時に前後する
        float ph = (transformed.z > 0.0 ? 0.0 : 3.14159) + (transformed.x > 0.15 ? 0.0 : 3.14159);
        float sw = sin(uTime * 5.5 + ph);
        transformed.x += aAnim.w * 0.028 * sw * uLeg;
        transformed.y += aAnim.w * 0.012 * max(0.0, cos(uTime * 5.5 + ph)) * uLeg;
      }
    } else {
      float typ = aAnim.x, g = aAnim.y, sp = aAnim.z, sg = aAnim.w;
      float f = uFinT + uWigPhase;
      float g2 = g * g;
      if (typ < 1.5) {
        float w1 = sin(f * 0.9 - sp * 5.0);
        transformed.z += w1 * g2 * 0.018;
        transformed.x -= g2 * 0.007 * (0.5 + 0.5 * sin(f * 0.9 - sp * 5.0 + 1.0));
      } else if (typ < 2.5) {
        float fl = 0.5 + 0.5 * sin(f * 1.15 + sp * 2.0 + (sg > 0.0 ? 0.0 : 0.7));
        transformed.z += sg * g * (0.01 + 0.055 * fl);
        transformed.y += g * (0.012 * fl - 0.006);
        transformed.x -= g * 0.02 * fl;
      } else {
        // 尾びれ: 体の波のつづきとして、少しおくれてしなる（ひれだけ別の速さで、ぱたぱたしない）
        float tw = uWigT - 1.15 * uWave + uWigPhase - 1.1;
        transformed.z += sin(tw) * g2 * (0.004 + uWigAmp * 0.55);
        transformed.x += g2 * 0.006 * sin(2.0 * tw);
      }
    }
    float s = 0.5 - transformed.x;
    float env = smoothstep(0.02, 0.95, s);
    env = env * env * 1.2;
    float w = sin(uWigT - s * uWave + uWigPhase);
    transformed.z += uWigAmp * w * env;
    transformed.z += uTurn * s * s;
    transformed.y += uWigAmp * 0.25 * sin(uWigT * 0.5 + uWigPhase) * env;
  }
`;
const WIG_PARS = 'attribute vec4 aAnim; uniform float uWigAmp; uniform float uWigFreq; uniform float uWigPhase; uniform float uTurn; uniform float uWave; uniform float uFinFreq; uniform float uBreath; uniform float uLeg; uniform float uWigT; uniform float uFinT; uniform float uBreathT;';

// 体・ひれ・えらの波の「位相」は、毎フレーム 周波数×時間 を足して進める（advanceWig）。
// 時刻×周波数 で計算すると、泳ぐ速さで周波数が変わるたびに位相が大きく飛び、魚がぶるぶる震えて見える
const WIGS = new Set();
const WRAP = Math.PI * 40;   // ひれの式の係数（0.5〜2.6）をかけても、ちょうど一周の倍数になる長さで折り返す
export function advanceWig(dt) {
  for (const u of WIGS) {
    u.uWigT.value = (u.uWigT.value + u.uWigFreq.value * dt) % WRAP;
    u.uFinT.value = (u.uFinT.value + u.uFinFreq.value * dt) % WRAP;
    u.uBreathT.value = (u.uBreathT.value + u.uBreath.value * dt) % WRAP;
  }
}
function makeWigUniforms() {
  const ph = Math.random() * 40;
  const u = {
    uWigT: { value: ph }, uFinT: { value: ph * 1.3 }, uBreathT: { value: ph * 0.7 },
    uWigAmp: { value: 0.06 },
    uWigFreq: { value: 7 },
    uWigPhase: { value: Math.random() * 6 },
    uTurn: { value: 0 },
    uWave: { value: 6.5 },
    uFinFreq: { value: 5 },
    uBreath: { value: 2.6 + Math.random() * 1.2 },
    uLeg: { value: 0 },
  };
  WIGS.add(u);
  return u;
}

// 種ごとの質感（つや・バンプ・虹色の光沢）
const LOOK = {
  funa: { rough: 0.42, metal: 0.1, coat: 0.5, coatR: 0.18, irid: 0.2, bump: 2.0, env: 0.9 },
  koi: { rough: 0.44, metal: 0.08, coat: 0.55, coatR: 0.18, irid: 0.18, bump: 2.4, env: 0.95 },
  tanago: { rough: 0.32, metal: 0.18, coat: 0.8, coatR: 0.12, irid: 0.5, bump: 1.2, env: 1.25 },
  dojo: { rough: 0.5, metal: 0.0, coat: 0.75, coatR: 0.22, irid: 0.0, bump: 0.8, env: 1.0 },
  namazu: { rough: 0.45, metal: 0.0, coat: 1.0, coatR: 0.1, irid: 0.0, bump: 0.5, env: 1.2 },
  nishiki: { rough: 0.36, metal: 0.1, coat: 0.8, coatR: 0.14, irid: 0.3, bump: 2.0, env: 1.15 },
  imori: { rough: 0.6, metal: 0.0, coat: 0.35, coatR: 0.3, irid: 0.0, bump: 2.6, env: 0.9 },
  hibuna: { rough: 0.38, metal: 0.12, coat: 0.6, coatR: 0.16, irid: 0.25, bump: 2.0, env: 1.0 },
  unagi: { rough: 0.38, metal: 0.0, coat: 1.0, coatR: 0.1, irid: 0.0, bump: 0.4, env: 1.3 },
  herabuna: { rough: 0.36, metal: 0.16, coat: 0.7, coatR: 0.14, irid: 0.35, bump: 2.0, env: 1.1 },
  wakasagi: { rough: 0.3, metal: 0.2, coat: 0.85, coatR: 0.12, irid: 0.5, bump: 1.0, env: 1.3 },
};

function makeBodyMaterial(atlas, uni, look) {
  const m = new THREE.MeshPhysicalMaterial({
    map: atlas.map, bumpMap: atlas.bump, bumpScale: look.bump,
    roughness: look.rough, metalness: look.metal,
    clearcoat: look.coat, clearcoatRoughness: look.coatR,
    side: THREE.DoubleSide,
  });
  if (look.irid > 0) {
    m.iridescence = look.irid;
    m.iridescenceIOR = 1.38;
    m.iridescenceThicknessRange = [180, 520];
  }
  m.userData.vertPars = WIG_PARS;
  m.userData.extraUniforms = uni;
  m.userData.patchKey = 'fishbody';
  patchMaterial(m, { underwater: true, vertex: WIG });
  applyEnv(m, look.env);
  m.userData.wig = uni;
  return m;
}

function makeFinMaterial(atlas, uni) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas.fin, transparent: true, alphaTest: 0.05, depthWrite: true,
    roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide,
  });
  m.userData.vertPars = WIG_PARS;
  m.userData.extraUniforms = uni;
  m.userData.patchKey = 'fishfin';
  patchMaterial(m, { underwater: true, vertex: WIG, translucent: 2.4 });
  applyEnv(m, 0.5);
  m.userData.wig = uni;
  return m;
}

// ---------------------------------------------------------------------------
// ザリガニ
function solid(geo, rgb) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
const srgbToLin = (h) => {
  const c = hex(h).map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
};
function ell(rx, ry, rz, x, y, z, rgb, rot = [0, 0, 0]) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.scale(rx, ry, rz);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const py = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const t = clamp((py.getY(i) - y) / ry * 0.5 + 0.5);
    const c = mixC(rgb[1], rgb[0], t);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function tubeC(pts, r0, r1, rgb) {
  const g = taperTube(pts, r0, r1, [0, 0], 6);
  return solid(g, rgb);
}

function buildCrayfish() {
  const parts = [];
  const top = srgbToLin(0x8d2412), under = srgbToLin(0xd9602e), dark = srgbToLin(0x5a1a0e), tip = srgbToLin(0xe88a52), claw = srgbToLin(0xb6361c);
  const tc = [top, under];
  // 頭胸部
  parts.push(ell(0.22, 0.115, 0.135, 0.17, 0.115, 0, tc));
  parts.push(ell(0.1, 0.08, 0.09, 0.3, 0.1, 0, tc, [0, 0, -0.1]));
  const rost = new THREE.ConeGeometry(0.04, 0.16, 6);
  rost.rotateZ(-Math.PI / 2);
  rost.translate(0.44, 0.115, 0);
  parts.push(solid(rost, top));
  // 腹部（節）
  for (let i = 0; i < 6; i++) {
    const x = -0.02 - i * 0.062;
    const s = 1 - i * 0.06;
    parts.push(ell(0.062, 0.088 * s, 0.108 * s, x, 0.1 - i * 0.003, 0, tc));
  }
  // 尾びれ
  for (const [a, w] of [[0, 0.04], [0.5, 0.05], [-0.5, 0.05], [0.95, 0.045], [-0.95, 0.045]]) {
    const g = ell(0.075, 0.008, w, -0.4 - Math.abs(a) * 0.016, 0.07, a * 0.1, [top, under], [0, a * 0.35, 0]);
    parts.push(g);
  }
  // 目
  for (const s of SIDE) {
    parts.push(solid(new THREE.SphereGeometry(0.018, 10, 8).translate(0.4, 0.17, s * 0.05), srgbToLin(0x0a0a0a)));
    parts.push(tubeC([[0.37, 0.14, s * 0.035], [0.4, 0.16, s * 0.05]], 0.008, 0.006, dark));
  }
  // 触角
  for (const s of SIDE) {
    parts.push(tubeC([[0.42, 0.13, s * 0.03], [0.58, 0.2, s * 0.12], [0.75, 0.22, s * 0.24], [0.92, 0.18, s * 0.3]], 0.006, 0.002, dark));
    parts.push(tubeC([[0.43, 0.12, s * 0.015], [0.5, 0.15, s * 0.04], [0.58, 0.14, s * 0.05]], 0.004, 0.002, dark));
  }
  // はさみ
  for (const s of SIDE) {
    parts.push(tubeC([[0.3, 0.07, s * 0.1], [0.42, 0.09, s * 0.19], [0.56, 0.1, s * 0.2]], 0.026, 0.022, claw));
    parts.push(ell(0.09, 0.03, 0.05, 0.68, 0.1, s * 0.19, [claw, tip], [0, s * -0.2, 0]));
    const f1 = new THREE.ConeGeometry(0.022, 0.12, 7);
    f1.rotateZ(-Math.PI / 2);
    f1.translate(0.82, 0.115, s * 0.2);
    parts.push(solid(f1, tip));
    const f2 = new THREE.ConeGeometry(0.018, 0.1, 7);
    f2.rotateZ(-Math.PI / 2 - 0.2);
    f2.translate(0.8, 0.075, s * 0.2);
    parts.push(solid(f2, tip));
    for (let k = 0; k < 4; k++) parts.push(ell(0.011, 0.011, 0.011, 0.64 + k * 0.03, 0.125, s * (0.17 + (k % 2) * 0.03), [tip, tip]));
  }
  // 歩脚
  for (const s of SIDE) {
    for (let k = 0; k < 4; k++) {
      const x = 0.2 - k * 0.07;
      parts.push(tubeC([[x, 0.05, s * 0.07], [x - 0.03 + k * 0.01, 0.1, s * 0.17], [x - 0.06 + k * 0.012, 0.0, s * 0.23]], 0.011, 0.005, claw));
    }
  }
  const geometry = mergeGeos(parts);
  geometry.translate(-0.05, 0, 0);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.25 });
  patchMaterial(mat, { underwater: true });
  mat.userData.patchKey = 'crayfish';
  applyEnv(mat, 0.9);
  return { geometry, mat };
}

// 長靴
function buildBoot() {
  const parts = [];
  const rubber = srgbToLin(0x35502e), sole = srgbToLin(0x1c1c1c), mud = srgbToLin(0x4a3b24), weed = srgbToLin(0x5d7a2a);
  const shaft = new THREE.CylinderGeometry(0.07, 0.078, 0.3, 24, 5, true);
  shaft.translate(-0.1, 0.2, 0);
  const sp = shaft.attributes.position;
  const sc = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) {
    const n = fbm2(sp.getX(i) * 20, sp.getY(i) * 18 + sp.getZ(i) * 10, 3) * 0.5 + 0.5;
    const m = (1 - clamp((sp.getY(i) - 0.06) / 0.2)) * 0.9 * ss(0.3, 0.7, n);
    const c = mixC(rubber, mud, clamp(m));
    sc[i * 3] = c[0]; sc[i * 3 + 1] = c[1]; sc[i * 3 + 2] = c[2];
  }
  shaft.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  shaft.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(sp.count * 2), 2));
  parts.push(shaft);
  const foot = new THREE.SphereGeometry(1, 20, 12);
  foot.scale(0.27, 0.06, 0.082);
  foot.translate(0.05, 0.06, 0);
  parts.push(solid(foot, rubber));
  const toe = new THREE.SphereGeometry(1, 16, 10);
  toe.scale(0.1, 0.052, 0.078);
  toe.translate(0.22, 0.056, 0);
  parts.push(solid(toe, rubber));
  const sole_ = new THREE.BoxGeometry(0.58, 0.026, 0.17);
  sole_.translate(0.07, 0.01, 0);
  parts.push(solid(sole_, sole));
  const heel = new THREE.BoxGeometry(0.09, 0.05, 0.15);
  heel.translate(-0.16, 0.03, 0);
  parts.push(solid(heel, sole));
  for (let i = 0; i < 6; i++) {
    parts.push(tubeC([[-0.07 + i * 0.01, 0.4, (i - 3) * 0.015], [-0.06 + i * 0.02, 0.5, (i - 3) * 0.03], [-0.02 + i * 0.03, 0.6, (i - 3) * 0.05]], 0.006, 0.002, weed));
  }
  const geometry = mergeGeos(parts);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  patchMaterial(mat, { underwater: true });
  mat.userData.patchKey = 'boot';
  applyEnv(mat, 0.8);
  return { geometry, mat };
}

// ビーチサンダル（ハワイでは「スリッパ」）
function buildSandal() {
  const parts = [];
  const sole = srgbToLin(0xf0ece0), top = srgbToLin(0x1f86d6), strap = srgbToLin(0xffd23a), sand = srgbToLin(0xc9b68c);
  // 足形の底: 小判形をふくらませて、つま先を丸く、かかとを細く
  const soleG = new THREE.SphereGeometry(1, 28, 12);
  const sp = soleG.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    const w = 0.88 + 0.22 * Math.max(0, x) - 0.28 * Math.max(0, -x - 0.2);      // 前がひろく、かかとが細い
    sp.setXYZ(i, x * 0.27, sp.getY(i) * 0.03, z * w * 0.155 * (1 + 0.1 * Math.sin(x * 4)));
  }
  soleG.computeVertexNormals();
  colorize(soleG, (x, y, z) => { const n = fbm2(x * 24, z * 24, 3) * 0.5 + 0.5; return mixC(y > 0 ? top : sole, sand, clamp(0.12 + 0.3 * ss(0.5, 0.8, n) * (y > 0 ? 1 : 0.5))); });
  parts.push(soleG);
  // 鼻緒（Y字）
  const toeP = [0.1, 0.012, 0];
  parts.push(tubeC([toeP, [0.04, 0.075, 0.06], [-0.02, 0.028, 0.125]], 0.0095, 0.0095, strap));
  parts.push(tubeC([toeP, [0.04, 0.075, -0.06], [-0.02, 0.028, -0.125]], 0.0095, 0.0095, strap));
  const geometry = mergeGeos(parts);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, clearcoat: 0.3, side: THREE.DoubleSide });
  patchMaterial(mat, { underwater: true });
  mat.userData.patchKey = 'sandal';
  applyEnv(mat, 0.8);
  return { geometry, mat };
}

// ---------------------------------------------------------------------------
const GEO_CACHE = {};

// メートル単位のサイズ(全長)のオブジェクトを返す
export function createFishObject(sp, cm) {
  const id = sp.model || sp.id;   // 「沼のぬし」は、ナマズの体を使う
  const len = cm / 100;
  let obj;
  if (sp.kind === 'swim' || sp.kind === 'newt') {
    const newt = sp.kind === 'newt';
    if (!GEO_CACHE[id]) GEO_CACHE[id] = newt ? buildNewt() : buildSwimmer(id);
    const c = GEO_CACHE[id];
    const uni = makeWigUniforms();
    const mat = makeBodyMaterial(c.atlas, uni, LOOK[id] || LOOK.funa);
    const fmat = makeFinMaterial(c.atlas, uni);
    const rig = new THREE.Group();
    const s = len / c.extent;
    rig.scale.setScalar(s);
    rig.position.x = -c.cx * s;
    const body = new THREE.Mesh(c.geometry, mat);
    const fins = new THREE.Mesh(c.finGeo, fmat);
    rig.add(body, fins);
    const g = new THREE.Group();
    g.add(rig);
    obj = {
      group: g, mesh: rig, mat, finMat: fmat, wig: uni, kind: sp.kind, len, bellyY: -c.bellyMin * s, backY: (c.backMax || 0) * s,
      breath0: uni.uBreath.value,
      dispose() { mat.dispose(); fmat.dispose(); releaseEnv(mat); releaseEnv(fmat); WIGS.delete(uni); },
    };
    if (sp.tint) mat.color.setHex(sp.tint);   // 苔むした、くすんだ色に
    if (newt) {
      uni.uWigAmp.value = 0.08;
      uni.uWave.value = 8;
    } else {
      uni.uWigAmp.value = id === 'dojo' || id === 'unagi' ? 0.1 : id === 'namazu' ? 0.075 : 0.065;
      uni.uWave.value = id === 'dojo' ? 12 : id === 'unagi' ? 14 : id === 'namazu' ? 7 : 6;
      const bw = BODIES[id] && BODIES[id].wig;     // ヤッコ・ハギなどは、体をあまりくねらせず、ひれで泳ぐ
      if (bw) { uni.uWigAmp.value = bw.amp; uni.uWave.value = bw.wave; if (bw.fin) uni.uFinFreq.value = bw.fin; obj.wigAmp = bw.amp; obj.finBase = bw.fin || undefined; }
    }
  } else if (sp.kind === 'crayfish') {
    if (!GEO_CACHE[id]) GEO_CACHE[id] = buildCrayfish();
    const c = GEO_CACHE[id];
    c.geometry.computeBoundingBox();
    const bb = c.geometry.boundingBox;
    const mesh = new THREE.Mesh(c.geometry, c.mat);
    const s = len / 0.9;
    mesh.scale.setScalar(s);
    mesh.position.x = -((bb.min.x + bb.max.x) / 2) * s;
    const g = new THREE.Group();
    g.add(mesh);
    obj = { group: g, mesh, mat: c.mat, kind: 'crayfish', len, bellyY: -bb.min.y * s, dispose() {} };
  } else {
    if (!GEO_CACHE[id]) GEO_CACHE[id] = id === 'sandal' ? buildSandal() : buildBoot();
    const c = GEO_CACHE[id];
    c.geometry.computeBoundingBox();
    const bb = c.geometry.boundingBox;
    const mesh = new THREE.Mesh(c.geometry, c.mat);
    const s = len / (id === 'sandal' ? 0.5 : 0.5);
    mesh.scale.setScalar(s);
    mesh.position.x = -((bb.min.x + bb.max.x) / 2) * s;
    const g = new THREE.Group();
    g.add(mesh);
    obj = { group: g, mesh, mat: c.mat, kind: 'boot', len, fitLen: len * 1.7, bellyY: -bb.min.y * s, dispose() {} };
  }
  obj.group.traverse((o) => { o.frustumCulled = true; });
  return obj;
}

// 画面にきれいに収まる基準長(m)
export function displayLength(sp) {
  return sp.kind === 'boot' ? 0.5 : sp.kind === 'crayfish' ? 0.34 : 0.46;
}
