// 水槽（ひだまり浜）: 釣った魚を、砂浜に置いた 150cm のサンゴ礁水槽で飼って、ながめる。
// 水槽: 幅150×奥行60×高さ60cm、厚さ12mmの高透過ガラス（縁なし）。コアの木の台、LED照明、造波ポンプ2台。
// 中は、ライブロックの島が2つと、ミドリイシ・テーブル・コモンサンゴ・ハナガタ・ナガレハナ・マメスナ・ディスク・ウミキノコ・イソギンチャク・ヤギ。
// 水の見え方: 水の中を通った長さで赤から抜けて青くなり、水面でくだけた光が網（コースティクス）と光の柱になって落ちる。
// 前のガラスごしに少し下から見ると、水面の裏が鏡になる（全反射）。造波ポンプで水面とサンゴが行ったり来たり揺れる。
import * as THREE from 'three';
import { G, patchMaterial, TANK_GLSL } from '../materials.js';
import { mulberry32, clamp, lerp, smoothstep, noise2, ridged2, hexToLinear, TAU, damp, widenFov } from '../util.js';
import { mergeGeos, colorize } from '../geo.js';
import { canvasTexture } from '../textures.js';
import { baseHeight, TANK_SITE, groundColor } from './terrain.js';
import { blobGeo } from './decor.js';
import { createFishObject } from '../fishmodels.js';
import { SPECIES } from '../species.js';
import { SEASON } from '../season.js';
import { applyEnv } from '../env.js';

export const TANK_LAYER = 3;                 // 水面の裏の鏡に映すもの
export const TANK = { x: TANK_SITE.x, z: TANK_SITE.z, cap: 12, smallCap: 8, maxCm: 40 };   // 群がる小魚（ヒメスズメダイなど）は別枠
const W = 1.5, D = 0.6, H = 0.6, GT = 0.012;   // 外寸とガラスの厚さ(m)
const Y0 = 0.83;                                // 水槽の底（台の高さ＋マット）
const XI = W / 2 - GT, ZI = D / 2 - GT, YB = Y0 + GT, YW = Y0 + H - 0.03;   // 内のりと水面
const YLED = Y0 + H + 0.24;                    // 照明の下面
const LED_X = [-0.5, 0, 0.5], LED_Z = -0.1;      // 3つの照明の位置
const C = (h) => hexToLinear(h);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulA = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const ZERO = [0, 0, 0];
const EXTRA = [{ name: 'fluo', size: 3 }, { name: 'sway', size: 1 }];

// 色・蛍光（青い光で光る色）・ゆれ（0=根もと〜1=先）を、頂点ごとに
function paint(g, fn) {
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), flu = new Float32Array(n * 3), sw = new Float32Array(n);
  const o = { c: [1, 1, 1], f: ZERO, s: 0 };
  for (let i = 0; i < n; i++) {
    o.c = [1, 1, 1]; o.f = ZERO; o.s = 0;
    fn(p.getX(i), p.getY(i), p.getZ(i), o, i);
    col[i * 3] = o.c[0]; col[i * 3 + 1] = o.c[1]; col[i * 3 + 2] = o.c[2];
    flu[i * 3] = o.f[0]; flu[i * 3 + 1] = o.f[1]; flu[i * 3 + 2] = o.f[2];
    sw[i] = o.s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('fluo', new THREE.BufferAttribute(flu, 3));
  g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
  return g;
}
// a→b の円すい台。fn(t, o) で、根もと(t=0)から先(t=1)までの色をぬる
const _up = V3(0, 1, 0), _q = new THREE.Quaternion();
function seg(a, b, r0, r1, rad, fn, open = true) {
  const d = b.clone().sub(a), len = Math.max(d.length(), 1e-4);
  const g = new THREE.CylinderGeometry(r1, r0, len, rad, 1, open);
  g.deleteAttribute('uv');
  g.translate(0, len / 2, 0);
  paint(g, (x, y, z, o) => fn(y / len, o));
  g.applyQuaternion(_q.setFromUnitVectors(_up, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
function ball(p, r, fn, ws = 6, hs = 4) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.deleteAttribute('uv');
  paint(g, (x, y, z, o) => fn(o));
  g.translate(p.x, p.y, p.z);
  return g;
}
// 高さで、ゆれをきめる（根もとは動かず、先ほど大きく）
function swayByHeight(g, h0, h1, k = 1) {
  const p = g.attributes.position, s = g.attributes.sway;
  for (let i = 0; i < p.count; i++) s.setX(i, Math.max(s.getX(i), clamp((p.getY(i) - h0) / (h1 - h0)) * k));
  return g;
}
// y軸を n の向きへ（サンゴを岩の面に立てる）
function alignTo(g, n, spin = 0) {
  g.rotateY(spin);
  g.applyQuaternion(_q.setFromUnitVectors(_up, n.clone().normalize()));
  return g;
}

// ---------------------------------------------------------------------------
// サンゴ
// 枝サンゴ（ミドリイシ）: 枝わかれをくりかえし、先がとがって明るい色（青・紫・緑に光る）
function acropora(rng, o) {
  const parts = [];
  const grow = (p, dir, len, r, depth) => {
    const q = p.clone().addScaledVector(dir, len);
    const k0 = depth / (o.depth + 1), k1 = (depth + 1) / (o.depth + 1);
    parts.push(seg(p, q, r, r * 0.8, 5, (t, c) => { const k = lerp(k0, k1, t); c.c = mixA(o.base, o.tip, k * k); c.f = mulA(o.fluo, smoothstep(0.55, 1, k) * 0.6); }));
    if (depth >= o.depth) {
      const e = q.clone().addScaledVector(dir, r * (2.4 + rng() * 1.6));
      parts.push(seg(q, e, r * 0.8, r * 0.18, 5, (t, c) => { c.c = mixA(o.tip, o.tip2 || o.tip, t); c.f = o.fluo; }));
      return;
    }
    const n = depth === 0 ? o.trunks : (rng() < o.fork ? 3 : 2);
    for (let i = 0; i < n; i++) {
      const a = depth === 0 ? (i / n) * TAU + rng() * 0.6 : rng() * TAU;
      const nd = dir.clone().add(V3(Math.cos(a) * o.spread * (0.5 + rng() * 0.6), o.up * (0.4 + rng() * 0.5), Math.sin(a) * o.spread * (0.5 + rng() * 0.6))).normalize();
      grow(q, nd, len * (0.66 + rng() * 0.22), r * 0.76, depth + 1);
    }
    // 枝の横の小さな芽
    if (depth >= 1 && o.buds) {
      for (let i = 0; i < o.buds; i++) {
        const t = 0.2 + rng() * 0.7, b = p.clone().lerp(q, t);
        const bd = dir.clone().add(V3(rng() - 0.5, 0.3, rng() - 0.5).multiplyScalar(1.6)).normalize();
        parts.push(seg(b, b.clone().addScaledVector(bd, r * 1.6), r * 0.45, r * 0.2, 4, (tt, c) => { c.c = o.tip; c.f = mulA(o.fluo, 0.7); }));
      }
    }
  };
  grow(V3(0, -0.006, 0), V3(0, 1, 0), o.len, o.r, 0);
  return mergeGeos(parts, EXTRA);
}

// テーブルサンゴ: 平たい板の上に、小さな枝がびっしり上を向く
function tableAcro(rng, R, o) {
  const parts = [];
  const s0 = rng() * 50;
  const edge = (a) => 1 + 0.13 * noise2(Math.cos(a) * 1.7 + s0, Math.sin(a) * 1.7 + s0) + 0.04 * Math.sin(a * 7 + s0);
  const plateY = (r, a) => 0.032 + 0.05 * R * r * r + 0.006 * Math.sin(a * 5 + s0) * r;
  parts.push(seg(V3(0, -0.01, 0), V3(0, 0.034, 0), 0.016, 0.011, 7, (t, c) => { c.c = mixA(mulA(o.base, 0.5), o.base, t); }));
  for (const side of [1, -1]) {
    const g = new THREE.RingGeometry(0.01, 1, 48, 5);
    g.deleteAttribute('uv');
    g.rotateX(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x), e = edge(a);
      p.setXYZ(i, x * R * e, plateY(r, a) - (side < 0 ? 0.007 * (1 - r * 0.7) : 0), z * R * e);
    }
    g.computeVertexNormals();
    paint(g, (x, y, z, c) => {
      const r = Math.hypot(x, z) / R;
      c.c = side > 0 ? mixA(o.base, o.rim, smoothstep(0.6, 1.0, r)) : mulA(mixA(o.base, [0.8, 0.75, 0.6], 0.3), 0.8);
      c.f = side > 0 ? mulA(o.fluo, smoothstep(0.7, 1.0, r) * 0.6) : ZERO;
    });
    parts.push(g);
  }
  const n = Math.round(260 * (R / 0.12) * (R / 0.12));
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * 0.95, e = edge(a);
    const x = Math.cos(a) * rr * R * e, z = Math.sin(a) * rr * R * e, y = plateY(rr, a);
    const h = 0.005 + rng() * 0.009 * (1 - rr * 0.4);
    const b = V3(x, y, z), tip = V3(x + Math.cos(a) * rr * h * 0.5, y + h, z + Math.sin(a) * rr * h * 0.5);
    parts.push(seg(b, tip, 0.0028, 0.0016, 4, (t, c) => { c.c = mixA(o.base, o.tip, t); c.f = mulA(o.fluo, t); }));
  }
  return mergeGeos(parts, EXTRA);
}

// コモンサンゴ（板状・渦巻き）: 岩の横から、うすい板がバラの花びらのように重なって張り出す。+z が外向き
function montiCap(rng, R, o) {
  const parts = [];
  const n = o.n || 6;
  for (let i = 0; i < n; i++) {
    const r0 = R * (0.6 + rng() * 0.45) * (1 - i * 0.05);
    const span = 1.3 + rng() * 1.0;
    const g = new THREE.RingGeometry(0.006, 1, 30, 5, -Math.PI / 2 - span / 2, span);
    g.deleteAttribute('uv');
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, s0 = rng() * 40;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k), r = Math.hypot(x, z), a = Math.atan2(z, x);
      // 中心から外へ、ゆるく反りあがる。ふちは波打つ
      const y = 0.18 * r * r + 0.06 * Math.sin(a * 5 + s0) * r * r + 0.03 * Math.sin(r * 9 + s0) * r;
      p.setXYZ(k, x * r0, y * r0, z * r0);
    }
    g.computeVertexNormals();
    paint(g, (x, y, z, c) => {
      const r = Math.hypot(x, z) / r0;
      const ring = 0.5 + 0.5 * Math.sin(r * 26 + s0);   // 成長の年輪のような、かすかな縞
      c.c = mixA(mulA(o.base, 0.85 + 0.15 * ring), o.rim, smoothstep(0.8, 1.0, r));
      c.f = mulA(o.fluo, 0.25 + 0.75 * smoothstep(0.8, 1.0, r));
    });
    // 渦巻き: 少しずつ回りながら、高さをずらして重なる
    g.rotateX(-0.08 - rng() * 0.18);
    g.rotateY((i / n - 0.5) * 2.4 + (rng() - 0.5) * 0.4);
    g.translate(0, (i % 3) * R * 0.12 - R * 0.12 + (rng() - 0.5) * R * 0.08, (i % 2) * R * 0.08);
    parts.push(g);
  }
  return mergeGeos(parts, EXTRA);
}

// エダコモンサンゴ: 指のような、まるい先の枝
function digitata(rng, o) {
  const parts = [];
  const n = o.n || 16;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * o.R;
    const h = (0.03 + rng() * 0.05) * (1 - r / o.R * 0.5), w = 0.0045 + rng() * 0.002;
    const b = V3(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6), e = V3(Math.cos(a) * r, h, Math.sin(a) * r);
    parts.push(seg(b, e, w * 1.2, w, 6, (t, c) => { c.c = mixA(mulA(o.base, 0.6), o.base, t); c.f = mulA(o.fluo, t * 0.6); }));
    parts.push(ball(e, w, (c) => { c.c = o.tip; c.f = o.fluo; }));
  }
  return mergeGeos(parts, EXTRA);
}

// ハナガタ・ノウサンゴ: まるい株に、うねる溝（溝は赤、尾根は緑に光る）
function brain(rng, R, o) {
  const g = blobGeo(4);
  const p = g.attributes.position, s0 = rng() * 30;
  const ridge = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const m = noise2(x * 1.6 + s0, z * 1.6 + y * 1.3) + 0.5 * noise2(x * 3.1 - s0, y * 3.1 + z * 2.3);
    const v = Math.abs(Math.sin((m * 4.2 + x * 2.0) * Math.PI));
    const rg = smoothstep(0.15, 0.6, v);
    ridge[i] = rg;
    const d = 1 + 0.06 * rg - 0.02 + 0.03 * noise2(x * 5 + s0, z * 5);
    y = Math.max(y, -0.2);
    p.setXYZ(i, x * d * R, (y + 0.2) * d * R * 0.72, z * d * R);
  }
  g.computeVertexNormals();
  paint(g, (x, y, z, c, i) => {
    c.c = mixA(o.valley, o.ridge, ridge[i]);
    c.f = mixA(mulA(o.fluoV, 0.5), o.fluo, ridge[i]);
    if (y < R * 0.06) c.c = mulA(c.c, 0.55);
  });
  return g;
}

// ナガレハナサンゴ（トーチ）: 長い触手がふわふわ流れ、先がまるく光る
function torch(rng, o) {
  const parts = [];
  const heads = o.heads || 4;
  for (let h = 0; h < heads; h++) {
    const a = (h / heads) * TAU + rng(), r = h === 0 ? 0 : (o.spreadH || 0.015) + rng() * 0.012;
    const top = V3(Math.cos(a) * r, 0.018 + rng() * 0.016, Math.sin(a) * r);
    parts.push(seg(V3(0, -0.005, 0), top, 0.008, 0.007, 6, (t, c) => { c.c = [0.25, 0.22, 0.17]; }));
    const m = o.tent || 34;
    for (let i = 0; i < m; i++) {
      const b = rng() * TAU, el = 0.35 + rng() * 1.0;
      const dir = V3(Math.cos(b) * Math.cos(el), Math.sin(el), Math.sin(b) * Math.cos(el));
      const L = (o.L || 0.035) + rng() * 0.03;
      const pts = [];
      for (let k = 0; k <= 3; k++) {
        const s = k / 3;
        pts.push(top.clone().addScaledVector(dir, L * s).add(V3(0, -0.35 * L * s * s, 0)));
      }
      for (let k = 0; k < 3; k++) {
        const s0 = k / 3, s1 = (k + 1) / 3;
        parts.push(seg(pts[k], pts[k + 1], 0.0028 * (1 - s0 * 0.4), 0.0028 * (1 - s1 * 0.4), 4, (t, c) => {
          const s = lerp(s0, s1, t);
          c.c = mixA(o.base, o.mid, s); c.f = mulA(o.fluo, s * 0.25); c.s = s;
        }));
      }
      if (o.frog) {   // カエルの卵のような、つぶつぶの先（ナガレハナ・フロッグスポーン）
        for (let k = 0; k < 4; k++) {
          const q = pts[3].clone().add(V3((rng() - 0.5) * 0.007, (rng() - 0.3) * 0.006, (rng() - 0.5) * 0.007));
          parts.push(seg(pts[3], q, 0.0016, 0.0013, 4, (t, c) => { c.c = o.mid; c.s = 1; }));
          parts.push(ball(q, 0.0024, (c) => { c.c = o.tip; c.f = o.fluo; c.s = 1; }, 5, 4));
        }
      } else parts.push(ball(pts[3], 0.0034, (c) => { c.c = o.tip; c.f = o.fluo; c.s = 1; }));
    }
  }
  return mergeGeos(parts, EXTRA);
}

// マメスナギンチャク: 小さなポリプが群れる（中心は橙、ふちは緑）。1つぶ分
function zoaPolyp(rng, o) {
  const h = 0.003 + rng() * 0.005, r = 0.0032 + rng() * 0.0016;
  const st = new THREE.CylinderGeometry(r * 0.9, r * 0.8, h, 8, 1, true);
  st.deleteAttribute('uv');
  st.translate(0, h / 2, 0);
  paint(st, (x, y, z, c) => { c.c = mixA([0.25, 0.2, 0.12], o.skirt, y / h); });
  const top = new THREE.CircleGeometry(r * 1.3, 12);
  top.deleteAttribute('uv');
  top.rotateX(-Math.PI / 2);
  const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), rr = Math.hypot(x, z) / (r * 1.3); tp.setY(i, h + 0.0012 * rr - 0.0018 * (1 - rr) * (1 - rr)); }
  top.computeVertexNormals();
  paint(top, (x, y, z, c) => {
    const rr = Math.hypot(x, z) / (r * 1.3);
    c.c = rr < 0.25 ? o.mouth : rr < 0.7 ? o.center : o.rim;
    c.f = rr < 0.25 ? mulA(o.fluoC, 0.4) : rr < 0.7 ? o.fluoC : o.fluoR;
    c.s = 0.15;
  });
  return mergeGeos([st, top], EXTRA);
}

// スターポリプ: 紫のマットから、緑に光る小さな星形のポリプがのびる。1つぶ分
function gspPolyp(rng) {
  const parts = [];
  const mat = new THREE.CircleGeometry(0.007 + rng() * 0.004, 7);
  mat.deleteAttribute('uv'); mat.rotateX(-Math.PI / 2); mat.translate(0, 0.0008, 0);
  paint(mat, (x, y, z, c) => { c.c = [0.28, 0.08, 0.3]; c.f = [0.12, 0.02, 0.15]; });
  parts.push(mat);
  const h = 0.004 + rng() * 0.005;
  parts.push(seg(V3(0, 0, 0), V3((rng() - 0.5) * 0.002, h, (rng() - 0.5) * 0.002), 0.0009, 0.0008, 4, (t, c) => { c.c = [0.3, 0.45, 0.25]; c.f = mulA([0.2, 0.7, 0.2], t * 0.5); c.s = t * 0.8; }));
  const star = new THREE.CircleGeometry(0.0032, 8);
  star.deleteAttribute('uv'); star.rotateX(-Math.PI / 2);
  const sp = star.attributes.position;
  for (let i = 1; i < sp.count; i++) { const k = i % 2 ? 1 : 0.45; sp.setX(i, sp.getX(i) * k); sp.setZ(i, sp.getZ(i) * k); }
  star.translate(0, h, 0);
  paint(star, (x, y, z, c) => { c.c = [0.35, 0.95, 0.35]; c.f = [0.3, 1.0, 0.25]; c.s = 1; });
  parts.push(star);
  return mergeGeos(parts, EXTRA);
}

// ターボスネール（コケとりの巻き貝）
function snail(rng) {
  const parts = [];
  const g = new THREE.ConeGeometry(0.011, 0.016, 10, 4);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.008, a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.12 * Math.sin(a + y * 400); p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k); }
  g.computeVertexNormals();
  paint(g, (x, y, z, c) => { const b = 0.5 + 0.5 * Math.sin(y * 700 + Math.atan2(z, x)); c.c = mixA([0.12, 0.1, 0.07], [0.35, 0.3, 0.2], b); });
  g.rotateZ(1.2);
  parts.push(g);
  const foot = new THREE.SphereGeometry(0.008, 8, 5); foot.deleteAttribute('uv'); foot.scale(1.3, 0.35, 1);
  paint(foot, (x, y, z, c) => { c.c = [0.3, 0.25, 0.18]; });
  parts.push(foot);
  return mergeGeos(parts, EXTRA);
}

// ディスクコーラル: 平たい円盤、まだら模様
function mushroom(rng, o) {
  const R = 0.011 + rng() * 0.01;
  const g = new THREE.CircleGeometry(R, 22, 0, TAU);
  g.deleteAttribute('uv');
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, s0 = rng() * 20;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) / R, a = Math.atan2(z, x);
    p.setY(i, 0.004 + 0.003 * (1 - r * r) + 0.0015 * Math.sin(a * 5 + s0) * r - (r < 0.12 ? 0.0012 : 0));
  }
  g.computeVertexNormals();
  paint(g, (x, y, z, c) => {
    const r = Math.hypot(x, z) / R;
    const sp = noise2(x * 900 + s0, z * 900) > 0.35 ? 1 : 0;
    c.c = r < 0.12 ? mulA(o.base, 0.6) : sp ? o.spot : mixA(o.base, o.rim, smoothstep(0.75, 1, r));
    c.f = sp ? o.fluoS : mulA(o.fluo, 0.5 + 0.5 * r);
    c.s = 0.1 * r;
  });
  const st = new THREE.CylinderGeometry(R * 0.35, R * 0.5, 0.005, 8, 1, true);
  st.deleteAttribute('uv');
  st.translate(0, 0.0025, 0);
  paint(st, (x, y, z, c) => { c.c = mulA(o.base, 0.45); });
  return mergeGeos([g, st], EXTRA);
}

// ウミキノコ（ソフトコーラル）: 太い柄に、ひだのある笠。笠の上にこまかなポリプがのびて、流れにそよぐ
function leather(rng, o) {
  const parts = [];
  parts.push(seg(V3(0, -0.005, 0), V3(0, 0.05, 0), 0.02, 0.015, 10, (t, c) => { c.c = mixA(mulA(o.base, 0.7), o.base, t); }, false));
  const R = 0.06;
  const cap = new THREE.CylinderGeometry(1, 0.8, 1, 36, 1);
  cap.deleteAttribute('uv');
  const p = cap.attributes.position, s0 = rng() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    const fold = 0.012 * Math.sin(a * 4 + s0) * r * r + 0.006 * Math.sin(a * 9) * r;
    p.setXYZ(i, x * R, 0.05 + (y + 0.5) * 0.012 + fold - 0.008 * r * r, z * R);
  }
  cap.computeVertexNormals();
  paint(cap, (x, y, z, c) => { c.c = o.base; });
  parts.push(cap);
  const n = o.polyps || 170;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * R * 0.92;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, rn = r / R;
    const y = 0.05 + 0.012 + 0.012 * Math.sin(a * 4 + s0) * rn * rn + 0.006 * Math.sin(a * 9) * rn - 0.008 * rn * rn;
    const h = 0.006 + rng() * 0.006;
    parts.push(seg(V3(x, y, z), V3(x * 1.05, y + h, z * 1.05), 0.0013, 0.0009, 4, (t, c) => { c.c = mixA(o.base, o.polyp, t); c.f = mulA(o.fluo, t); c.s = 0.3 + 0.7 * t; }));
  }
  return mergeGeos(parts, EXTRA);
}

// サンゴイソギンチャク: 先がふくらんだ触手（バブルチップ）。ゆらゆら
function anemone(rng, o) {
  const parts = [];
  parts.push(seg(V3(0, -0.004, 0), V3(0, 0.014, 0), 0.026, 0.03, 14, (t, c) => { c.c = mixA(mulA(o.base, 0.5), o.base, t); }, false));
  const disc = new THREE.CircleGeometry(0.03, 20);
  disc.deleteAttribute('uv');
  disc.rotateX(-Math.PI / 2); disc.translate(0, 0.014, 0);
  paint(disc, (x, y, z, c) => { const r = Math.hypot(x, z) / 0.03; c.c = r < 0.15 ? [0.5, 0.2, 0.15] : o.base; c.f = mulA(o.fluo, 0.3); });
  parts.push(disc);
  const n = o.tent || 60;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(0.08 + rng() * 0.92) * 0.027;
    const b = V3(Math.cos(a) * r, 0.014, Math.sin(a) * r);
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const L = 0.026 + rng() * 0.018;
    const m = b.clone().addScaledVector(out, L * 0.35 * (r / 0.027)).add(V3(0, L * 0.6, 0));
    const e = m.clone().addScaledVector(out, L * 0.25 * (r / 0.027)).add(V3(0, L * 0.25, 0));
    parts.push(seg(b, m, 0.0034, 0.0032, 5, (t, c) => { c.c = o.base; c.s = t * 0.6; c.f = mulA(o.fluo, 0.2); }));
    parts.push(ball(m.clone().lerp(e, 0.55), 0.0052, (c) => { c.c = o.bulb; c.f = mulA(o.fluo, 0.5); c.s = 0.85; }, 7, 5));
    parts.push(seg(m.clone().lerp(e, 0.9), e.clone().addScaledVector(out, 0.002), 0.0022, 0.0012, 5, (t, c) => { c.c = o.tip; c.f = o.fluo; c.s = 1; }));
  }
  return mergeGeos(parts, EXTRA);
}

// ヤギ（海のむち）: 細い枝が上へのび、流れに大きくしなる
function seaRod(rng, o) {
  const parts = [];
  const grow = (p, dir, len, r, depth) => {
    const q = p.clone().addScaledVector(dir, len);
    parts.push(seg(p, q, r, r * 0.85, 6, (t, c) => { c.c = mixA(o.base, o.tip, (depth + t) / 3.5); c.f = mulA(o.fluo, (depth + t) / 4); }));
    if (depth >= (o.depth || 2)) { parts.push(ball(q, r * 0.85, (c) => { c.c = o.tip; c.f = o.fluo; }, 5, 4)); return; }
    const n = depth === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      grow(q, dir.clone().add(V3(Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.25)).normalize(), len * (0.8 + rng() * 0.3), r * 0.82, depth + 1);
    }
  };
  grow(V3(0, -0.004, 0), V3(0, 1, 0), o.len, o.r, 0);
  const g = mergeGeos(parts, EXTRA);
  g.computeBoundingBox();
  return swayByHeight(g, 0.01, g.boundingBox.max.y, 1);
}

// ---------------------------------------------------------------------------
// ライブロック: 穴の多い石灰岩。白〜クリーム色に、紫やピンクの石灰藻
function lumpGeo(seed, rx, ry, rz) {
  const g = blobGeo(3);
  const p = g.attributes.position;
  const pit = new Float32Array(p.count);
  // ところどころ、平らに割れた面
  const rng = mulberry32(Math.floor(seed * 977));
  const cuts = [];
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU, el = (rng() - 0.35) * 1.4;
    cuts.push({ n: V3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)), d: 0.62 + rng() * 0.3 });
  }
  const v = V3(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const n1 = ridged2(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.5, 4);
    const n2 = noise2(v.x * 5.5 + seed * 3, v.y * 5.5 + v.z * 4.1);
    const hole = smoothstep(0.42, 0.8, Math.abs(noise2(v.x * 4.2 + seed, v.z * 4.2 - v.y * 3.3)));
    const hole2 = smoothstep(0.55, 0.9, Math.abs(noise2(v.x * 9.5 - seed, v.y * 9.5 + v.z * 7.7)));
    pit[i] = Math.max(hole, hole2 * 0.8);
    v.multiplyScalar(1 + 0.42 * (n1 - 0.5) + 0.08 * n2 - 0.24 * hole - 0.1 * hole2);
    for (const c of cuts) { const dd = v.dot(c.n); if (dd > c.d) v.addScaledVector(c.n, -(dd - c.d) * 0.85); }
    v.y = Math.max(v.y, -0.5);
    p.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  g.computeVertexNormals();
  const tan = C(0xc8b896), grey = C(0x9a9282), purple = C(0x6e3a78), pink = C(0xc06a86), mauve = C(0x9a5a8a), green = C(0x5c6a3c), brown = C(0x6a5a3a);
  paint(g, (x, y, z, c, i) => {
    const up = y / ry;
    let col = mixA(tan, grey, 0.5 + 0.5 * noise2(x * 24 + seed, z * 24 + y * 17));
    // 石灰藻（紫・ピンク）: 光の当たる上と外側ほど多い
    const cor = noise2(x * 11 + seed * 2, z * 11 + y * 9) * 0.8 + noise2(x * 31, y * 29 + seed) * 0.35 + 0.35 * up;
    const k = noise2(x * 7 - seed, z * 7 + y * 5);
    if (cor > 0.1) col = mixA(col, k > 0.25 ? purple : k > -0.2 ? mauve : pink, smoothstep(0.1, 0.4, cor) * 0.78);
    const alg = noise2(x * 8 - seed, y * 8 + z * 6);
    if (alg > 0.3) col = mixA(col, alg > 0.5 ? brown : green, smoothstep(0.3, 0.55, alg) * 0.55);
    col = mulA(col, (1 - 0.55 * pit[i]) * (0.55 + 0.45 * smoothstep(-0.9, 0.35, up)));
    c.c = col;
  });
  return g;
}
// 岩: いくつかのかたまりを組み合わせて、いびつな形に
function rockGeo(seed, rx, ry, rz) {
  const rng = mulberry32(Math.floor(seed * 131) + 7);
  const parts = [];
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const k = i === 0 ? 0.92 : 0.55 + rng() * 0.3;
    const a = rng() * TAU, r = i === 0 ? 0 : 0.3 + rng() * 0.25;
    const g = lumpGeo(seed + i * 3.7, rx * k, ry * (i === 0 ? 0.85 : 0.6 + rng() * 0.3), rz * k);
    g.rotateY(rng() * TAU);
    g.translate(Math.cos(a) * r * rx, (rng() - 0.35) * ry * 0.35, Math.sin(a) * r * rz);
    parts.push(g);
  }
  return mergeGeos(parts, EXTRA);
}

// 岩山: 楕円体をなめらかにつないだ距離場に、でこぼこ・小さな穴・洞くつを足して、表面を取り出す（サーフェスネット）
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => {
    let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
  };
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
function surfaceNets(sdf, min, max, cell) {
  const nx = Math.ceil((max.x - min.x) / cell) + 1, ny = Math.ceil((max.y - min.y) / cell) + 1, nz = Math.ceil((max.z - min.z) / cell) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[id(i, j, k)] = sdf(min.x + i * cell, min.y + j * cell, min.z + k * cell);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cid = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const C8 = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E12 = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = val[id(i + C8[c][0], j + C8[c][1], k + C8[c][2])]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E12) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += C8[a][0] + (C8[b][0] - C8[a][0]) * t; sy += C8[a][1] + (C8[b][1] - C8[a][1]) * t; sz += C8[a][2] + (C8[b][2] - C8[a][2]) * t; n++;
    }
    cid[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * cell, min.y + (j + sy / n) * cell, min.z + (k + sz / n) * cell);
  }
  const idx = [];
  const C = (i, j, k) => cid[i + cx * (j + cy * k)];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 0; i < cx; i++) {   // x の辺
    const a = val[id(i, j, k)], b = val[id(i + 1, j, k)];
    if ((a < 0) === (b < 0)) continue;
    quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), a >= 0);
  }
  for (let k = 1; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 1; i < cx; i++) {   // y の辺
    const a = val[id(i, j, k)], b = val[id(i, j + 1, k)];
    if ((a < 0) === (b < 0)) continue;
    quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), a >= 0);
  }
  for (let k = 0; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {   // z の辺
    const a = val[id(i, j, k)], b = val[id(i, j, k + 1)];
    if ((a < 0) === (b < 0)) continue;
    quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), a >= 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function rockMass(ells, caves, floorY, seed) {
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const e of ells) {
      const qx = (x - e.c.x) / e.r.x, qy = (y - e.c.y) / e.r.y, qz = (z - e.c.z) / e.r.z;
      d = smin(d, (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * Math.min(e.r.x, e.r.y, e.r.z), 0.03);
    }
    if (d > 0.05) return d;
    d += 0.016 * vnoise3(x * 20 + seed, y * 20, z * 20) + 0.007 * vnoise3(x * 52, y * 52 + seed, z * 52) + 0.0025 * vnoise3(x * 130, y * 130, z * 130 + seed);
    const pn = vnoise3(x * 60 - seed, y * 60, z * 60);
    if (pn > 0.35) d += (pn - 0.35) * 0.028;   // 小さな穴
    for (const c of caves) d = Math.max(d, -(Math.hypot(x - c.c.x, (y - c.c.y) * 1.3, z - c.c.z) - c.r));
    return Math.max(d, floorY - y);
  };
  const min = V3(1e9, 1e9, 1e9), max = V3(-1e9, -1e9, -1e9);
  for (const e of ells) { min.min(e.c.clone().sub(e.r)); max.max(e.c.clone().add(e.r)); }
  min.subScalar(0.04); max.addScalar(0.04); min.y = Math.max(min.y, floorY - 0.01);
  const g = surfaceNets(sdf, min, max, 0.0065);
  // 法線（距離場の傾き）と、くぼみの暗さ
  const p = g.attributes.position, n = p.count;
  const nor = new Float32Array(n * 3), occ = new Float32Array(n);
  const e = 0.004;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    nor[i * 3] = gx; nor[i * 3 + 1] = gy; nor[i * 3 + 2] = gz;
    const o1 = sdf(x + gx * 0.012, y + gy * 0.012, z + gz * 0.012) / 0.012, o2 = sdf(x + gx * 0.03, y + gy * 0.03, z + gz * 0.03) / 0.03;
    occ[i] = clamp(0.5 * o1 + 0.5 * o2, 0, 1);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const tan = C(0xb09a76), grey = C(0x857c6c), purple = C(0x6a3474), pink = C(0xcc7a92), mauve = C(0x93527e), green = C(0x56663a), brown = C(0x6a5634), crust = C(0xd89aa8);
  paint(g, (x, y, z, c, i) => {
    const ny_ = nor[i * 3 + 1];
    let col = mixA(tan, grey, 0.5 + 0.5 * vnoise3(x * 40, y * 40, z * 40 + seed));
    // 石灰藻（紫・ピンク）: 光の当たる上と外側ほど厚く、ふちはうすい桃色
    const cor = vnoise3(x * 14 + seed, y * 14, z * 14) * 0.75 + vnoise3(x * 40, y * 40 + seed, z * 40) * 0.3 + 0.3 * ny_ - 0.05;
    const k = vnoise3(x * 8 - seed, y * 8, z * 8);
    const cc = k > 0.2 ? purple : k > -0.25 ? mauve : pink;
    if (cor > -0.05) col = mixA(col, mixA(crust, cc, smoothstep(0.05, 0.3, cor)), smoothstep(-0.05, 0.3, cor) * 0.85);
    const alg = vnoise3(x * 11, y * 11 - seed, z * 11);
    if (alg > 0.3) col = mixA(col, alg > 0.55 ? brown : green, smoothstep(0.3, 0.6, alg) * 0.55);
    col = mulA(col, (0.22 + 0.78 * Math.pow(occ[i], 0.9)) * (0.62 + 0.38 * smoothstep(-0.8, 0.5, ny_)));
    c.c = col;
  });
  return g;
}

// ---------------------------------------------------------------------------
// 照明のレンズ: 白と青のLEDの粒が丸く集まり、まわりに光がにじむ
function lensTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    bg.addColorStop(0, '#dfe9ff'); bg.addColorStop(0.55, '#7f9fe8'); bg.addColorStop(0.9, '#33449a'); bg.addColorStop(1, '#0c1030');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const dots = [[0, 0]];
    for (let r = 1; r <= 3; r++) for (let k = 0; k < r * 6; k++) { const a = (k / (r * 6)) * Math.PI * 2 + r * 0.3; dots.push([Math.cos(a) * r * 26, Math.sin(a) * r * 26]); }
    dots.forEach(([dx, dy], i) => {
      const blue = i % 3 === 1;
      const g = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, 12);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, blue ? '#9ab4ff' : '#f2f6ff'); g.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 12, 0, Math.PI * 2); ctx.fill();
    });
  }, { srgb: true });
}

// ---------------------------------------------------------------------------
// 水面（造波ポンプの往復で水槽全体がゆっくり揺れ、細かな波紋が重なる）
const T_SLOSH = 1.33;     // 水槽の長さで決まる、水のゆれの周期（秒）
const RIPPLES = [
  // 向き(x,z), 波長(m), 高さ(m), 位相
  [0.92, 0.38, 0.16, 0.0011, 0.0], [-0.9, 0.42, 0.13, 0.001, 1.3], [0.6, 0.8, 0.075, 0.0006, 2.1], [-0.7, 0.7, 0.064, 0.0006, 4.0],
  [0.2, 0.98, 0.045, 0.00035, 0.7], [-0.3, -0.95, 0.052, 0.00035, 3.3], [0.98, -0.2, 0.034, 0.00022, 5.1], [-0.95, 0.1, 0.029, 0.0002, 2.6],
];
const SURF_GLSL = /* glsl */ `
uniform float uSlosh;
uniform vec2 uPump;      // 左右のポンプの強さ（0〜1）
vec3 surfH( vec2 p, float t ) {
  float h = 0.0; vec2 g = vec2( 0.0 );
  float k0 = 3.14159265 / ${(2 * XI).toFixed(4)};
  float s = sin( t * ${(TAU / T_SLOSH).toFixed(4)} );
  h += uSlosh * cos( k0 * ( p.x + ${XI.toFixed(4)} ) ) * s;
  g.x -= uSlosh * k0 * sin( k0 * ( p.x + ${XI.toFixed(4)} ) ) * s;
  ${RIPPLES.map(([dx, dz, L, a, ph], i) => {
    const n = Math.hypot(dx, dz), k = TAU / L, w = Math.sqrt(9.8 * k + 0.072 / 1000 * k * k * k);
    const amp = `${a.toFixed(5)} * ( 0.35 + 0.65 * ${dx > 0 ? 'uPump.x' : 'uPump.y'} )`;
    return `{ vec2 d = vec2( ${(dx / n).toFixed(3)}, ${(dz / n).toFixed(3)} ); float ph = dot( d, p ) * ${k.toFixed(3)} - t * ${(w * 0.55).toFixed(3)} + ${ph.toFixed(2)}; float a = ${amp}; h += a * sin( ph ); g += a * ${k.toFixed(3)} * cos( ph ) * d; }`;
  }).join('\n  ')}
  return vec3( h, g );
}
`;

// ---------------------------------------------------------------------------
export class Aquarium {
  constructor({ land, scene, atm, save, renderer }) {
    this.land = land; this.scene = scene; this.atm = atm; this.save = save; this.renderer = renderer;
    if (!Array.isArray(save.data.tank)) save.data.tank = [];
    this.fish = [];
    this.active = false;
    this.flow = new THREE.Vector2();
    this.pumpT = 0;
    this.rocks = [];        // 魚がよける岩（楕円体）
    this.spots = [];        // 魚が寄る、岩の表面（点と向き）
    this.cam = { yaw: 0, pitch: 0.03, dist: 2.3, fov: 38, ty: 0, tx: 0 };
    this.camS = null;
    this.mirror = { rt: null, cam: new THREE.PerspectiveCamera(), texMat: new THREE.Matrix4(), on: false, lightsDone: false };
    this.mirror.cam.layers.set(TANK_LAYER);
    this._v = [V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0)];
    this.build();
  }

  // ------------------------------------------------------------------ 組み立て
  build() {
    const root = new THREE.Group();
    root.name = 'aquarium';
    const corners = [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35], [0, 0]];
    let gy = 0;
    for (const [dx, dz] of corners) gy += baseHeight(TANK.x + dx, TANK.z + dz);
    gy /= corners.length;
    root.position.set(TANK.x, gy, TANK.z);
    this.land.add(root);
    this.root = root;
    // 台（stand）と、水槽そのもの（tank）。台なしのときは、水槽を砂の上に直に置いて、すそを砂にうめる
    const stand = new THREE.Group(), tank = new THREE.Group();
    root.add(stand, tank);
    this.stand = stand; this.tank = tank;
    const inner = new THREE.Group();   // 水の中のもの（鏡に映す）
    tank.add(inner);
    this.inner = inner;
    this.buildStand(stand);
    this.buildSand(inner);
    this.buildRocks(inner);
    this.buildCorals(inner);
    this.buildPumps(tank, inner);
    this.buildWater(tank, inner);
    this.buildGlass(tank);
    this.buildLight(tank);
    this.buildParticles(inner);
    this.buildBank(root, gy);
    inner.traverse((o) => { o.layers.enable(TANK_LAYER); });
    for (const e of this.save.data.tank) this.spawn(e);
    this.setStand(this.save.setting('tankStand') !== 0);
  }

  // 台あり（ふつうの水槽台）／砂の上に直置き
  setStand(on) {
    this.standOn = !!on;
    this.stand.visible = this.standOn;
    this.bank.visible = !this.standOn;
    this.tank.position.y = this.standOn ? 0 : this.bankBottom - Y0;
    this.root.updateMatrixWorld(true);
  }
  toggleStand() {
    this.setStand(!this.standOn);
    this.save.setting('tankStand', this.standOn ? 1 : 0);
    if (this.active) { this.setView(this.view); this.camS = { ...this.goal }; }
    this.refreshPanel();
    return this.standLabel();
  }
  standLabel() { return this.standOn ? '台の上' : '砂の上'; }

  // 直置きのとき: 水槽のすそに寄せた砂（まわりの浜と同じ色・同じ細かさ）
  buildBank(root, gy) {
    // 水槽の底は、足もとでいちばん低い地面より少し下（どこもすこし砂にうまる）
    let lo = 1e9;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
      const x = -W / 2 + (W * i) / 8, z = -D / 2 + (D * j) / 4;
      lo = Math.min(lo, baseHeight(TANK.x + x, TANK.z + z) - gy);
    }
    this.bankBottom = lo - 0.02;
    const top = this.bankBottom + 0.045;       // ガラスのすそに、砂がこれだけ寄る
    const ex = 0.34, nx = 96, nz = 44;
    const g = new THREE.PlaneGeometry(W + 2 * ex, D + 2 * ex, nx, nz);
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    const p = g.attributes.position;
    const ao = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const dx = Math.abs(x) - W / 2, dz = Math.abs(z) - D / 2;
      const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);   // 水槽のふちからの距離（外が正）
      const gl = baseHeight(TANK.x + x, TANK.z + z) - gy;
      const k = smoothstep(0.0, ex * 0.95, d);
      let y = lerp(top, gl - 0.012, k * k * (3 - 2 * k)) + 0.004 * noise2(x * 18, z * 18) * (1 - k);
      if (d < 0) y = top - 0.03;
      p.setY(i, y);
      ao[i] = 0.72 + 0.28 * smoothstep(0.0, 0.12, d);
    }
    g.computeVertexNormals();
    const c = [0, 0, 0];
    colorize(g, (x, y, z, i) => { groundColor(TANK.x + x, TANK.z + z, c); return mulA(c, ao[i]); });
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
    patchMaterial(m, { underwater: true, detail: 'terrain' });
    const bank = new THREE.Mesh(g, m);
    bank.receiveShadow = true;
    bank.name = 'tankBank';
    root.add(bank);
    this.bank = bank;
  }

  // 水槽台: つやをおさえた白の、シンプルな箱。扉は取っ手なし（押して開ける）で、細い目地だけが見える
  buildStand(root) {
    this.standBase = new THREE.Color(0xeeebe5);
    const wm = new THREE.MeshPhysicalMaterial({ color: this.standBase.clone(), roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.4 });
    applyEnv(wm, 0.3);
    this.standMat = wm;
    const gap = new THREE.MeshStandardMaterial({ color: 0x4a4946, roughness: 0.9 });
    const toe = new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 0.8 });
    const box = (w, h, d, x, y, z, m = wm) => {
      const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      ms.position.set(x, y, z);
      ms.castShadow = true; ms.receiveShadow = true;
      root.add(ms);
      return ms;
    };
    const SW = 1.56, SD = 0.66, SH = 0.8, B = 0.07;
    box(SW - 0.06, B + 0.1, SD - 0.06, 0, (B - 0.1) / 2, 0, toe);                 // 台輪（へこませて、影の線に。下は砂にうまる）
    box(SW, SH - B - 0.02, SD - 0.02, 0, B + (SH - B - 0.02) / 2, -0.01);        // 本体
    box(SW + 0.01, 0.022, SD + 0.01, 0, SH - 0.011, 0);                          // 天板
    // 扉3枚: 本体の前に、細い目地をあけて並べる
    const top = SH - 0.022, bot = B, dh = top - bot - 0.006;
    const dw = (SW - 0.004 * 2) / 3;
    box(SW, dh + 0.004, 0.004, 0, bot + 0.003 + dh / 2, SD / 2 - 0.022, gap);     // 目地の奥（暗い）
    for (let i = 0; i < 3; i++) {
      const x = -SW / 2 + dw / 2 + i * (dw + 0.004);
      box(dw, dh, 0.02, x, bot + 0.003 + dh / 2, SD / 2 - 0.01);
    }
    // 水槽の下のマット（黒）
    const mat = new THREE.Mesh(new THREE.BoxGeometry(W + 0.004, 0.006, D + 0.004), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 }));
    mat.position.set(0, Y0 - 0.003, 0);
    root.add(mat);
  }

  // 砂（アラゴナイトの白い砂）: 奥ほど高く、岩のまわりはわずかに盛り上がる。前のガラス越しに、砂の層が見える
  sandY(x, z) {
    const back = (0.5 - z / (2 * ZI)) * 0.03;
    return YB + 0.032 + back + 0.004 * noise2(x * 14, z * 14) + 0.0015 * Math.sin(x * 70 + Math.sin(z * 30) * 1.5);
  }
  buildSand(inner) {
    const nx = 120, nz = 48;
    const g = new THREE.PlaneGeometry(2 * XI - 0.002, 2 * ZI - 0.002, nx, nz);
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.sandY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    this.sandGeo = g;
    const top = g;
    // 側面（ガラスに接する砂の断面）
    const skirt = [];
    const edge = (x0, z0, x1, z1, n) => {
      const pos = [], col = [];
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const xa = lerp(x0, x1, t0), za = lerp(z0, z1, t0), xb = lerp(x0, x1, t1), zb = lerp(z0, z1, t1);
        const ya = this.sandY(xa, za), yb = this.sandY(xb, zb), y0 = YB + 0.0005;
        pos.push(xa, y0, za, xb, y0, zb, xb, yb, zb, xa, y0, za, xb, yb, zb, xa, ya, za);
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      gg.computeVertexNormals();
      skirt.push(gg);
    };
    const e = 0.0006;
    edge(-XI + e, ZI - e, XI - e, ZI - e, 120);
    edge(XI - e, -ZI + e, -XI + e, -ZI + e, 120);
    edge(-XI + e, -ZI + e, -XI + e, ZI - e, 40);
    edge(XI - e, ZI - e, XI - e, -ZI + e, 40);
    const sand = C(0xe9e0cc), sand2 = C(0xd4c7aa);
    for (const s of skirt) {
      colorize(s, (x, y, z) => {
        const dep = (this.sandY(x, z) - y) / 0.06;
        return mulA(mixA(sand2, [0.55, 0.5, 0.42], clamp(dep * 0.5)), 0.85 + 0.15 * noise2(x * 200, y * 300));
      });
    }
    this.sandParts = [top, ...skirt];
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    m.userData.patchKey = 'tankSand';
    patchMaterial(m, {
      underwater: true,
      fragment: (fs) => fs.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float gA = texture2D( uDetail, vWPos.xz * 3.1 ).b, gB = texture2D( uDetail, vWPos.zx * 5.3 + vWPos.y * 2.0 + 0.4 ).b;
          diffuseColor.rgb *= 0.8 + 0.32 * ( gA * 0.6 + gB * 0.4 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.45, 0.3, 0.32 ), step( 0.93, gB ) * 0.35 );   // 貝のかけら・ピンクの粒
        }`),
    });
    this.sandMat = m;
  }

  buildRocks(inner) {
    const sy = (x, z) => this.sandY(x, z);
    // 島の形（楕円体）: [x, 砂からの高さ, z, 半径x, y, z]
    const isl = (list) => list.map(([x, hy, z, rx, ry, rz]) => ({ c: V3(x, sy(x, z) + hy, z), r: V3(rx, ry, rz) }));
    const left = isl([
      [-0.47, 0.05, -0.12, 0.17, 0.1, 0.13], [-0.32, 0.04, -0.06, 0.12, 0.075, 0.1], [-0.6, 0.04, 0.02, 0.1, 0.065, 0.09], [-0.64, 0.12, -0.16, 0.08, 0.12, 0.08],
      [-0.42, 0.16, -0.13, 0.12, 0.1, 0.1], [-0.53, 0.22, -0.17, 0.085, 0.11, 0.075], [-0.33, 0.21, -0.11, 0.085, 0.075, 0.085],
      [-0.45, 0.31, -0.15, 0.075, 0.075, 0.065], [-0.24, 0.18, -0.12, 0.11, 0.035, 0.055], [-0.14, 0.15, -0.1, 0.055, 0.045, 0.05], [-0.12, 0.05, -0.1, 0.04, 0.09, 0.04],
    ]);
    const right = isl([
      [0.38, 0.04, -0.1, 0.18, 0.09, 0.13], [0.56, 0.04, -0.06, 0.13, 0.075, 0.11], [0.25, 0.03, 0.01, 0.09, 0.055, 0.075], [0.64, 0.06, 0.06, 0.07, 0.05, 0.07],
      [0.44, 0.13, -0.14, 0.11, 0.085, 0.09], [0.59, 0.16, -0.17, 0.08, 0.09, 0.07], [0.33, 0.16, -0.11, 0.075, 0.065, 0.07],
      [0.47, 0.225, -0.12, 0.11, 0.03, 0.09],
    ]);
    const caveL = isl([[-0.43, 0.06, 0.01, 0.045], [-0.23, 0.08, -0.08, 0.05], [-0.55, 0.14, -0.06, 0.03]]).map((q) => ({ c: q.c, r: q.r.x }));
    const caveR = isl([[0.33, 0.05, 0.03, 0.04], [0.5, 0.075, -0.01, 0.04]]).map((q) => ({ c: q.c, r: q.r.x }));
    const geos = [rockMass(left, caveL, YB + 0.02, 3.1), rockMass(right, caveR, YB + 0.02, 7.7)];
    for (const e of [...left, ...right]) this.rocks.push({ c: e.c, r: e.r.clone().multiplyScalar(0.92) });
    // 砂の上の小石
    let seed = 11;
    for (const [x, z, rx, ry, rz, rot] of [[-0.02, 0.13, 0.045, 0.028, 0.038, 0.4], [0.12, 0.19, 0.035, 0.022, 0.03, 1.2], [-0.67, 0.19, 0.04, 0.025, 0.035, 2.2], [0.05, -0.2, 0.06, 0.05, 0.05, 0.8]]) {
      const g = rockGeo(seed += 7.3, rx, ry, rz);
      g.rotateY(rot);
      const y = sy(x, z) + ry * 0.3;
      g.translate(x, y, z);
      geos.push(g);
      this.rocks.push({ c: V3(x, y, z), r: V3(rx * 0.95, ry * 0.95, rz * 0.95) });
    }
    const geo = mergeGeos(geos, EXTRA);
    this.rockGeo = geo;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
    m.userData.patchKey = 'tankRock';
    patchMaterial(m, {
      underwater: true,
      fragment: (fs) => fs.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = vWPos * 3.0;
          float a = texture2D( uDetail, q.xz ).g, b = texture2D( uDetail, q.xy + 0.3 ).g, c = texture2D( uDetail, q.zy + 0.6 ).g;
          float f = texture2D( uDetail, vWPos.xz * 11.0 + vWPos.y * 7.0 ).r;
          float pore = ( a + b + c ) / 3.0;
          diffuseColor.rgb *= ( 0.68 + 0.42 * smoothstep( 0.3, 0.62, pore ) ) * ( 0.88 + 0.24 * f );
        }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 q = vWPos * 9.0;
          vec3 nn = vec3( texture2D( uDetail, q.xz ).g, texture2D( uDetail, q.zy + 0.31 ).g, texture2D( uDetail, q.xy + 0.62 ).g ) - 0.5;
          normal = normalize( normal + nn * 0.9 );
        }`),
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'tankRock';
    inner.add(mesh);
    this.rockMesh = mesh;
    // 砂の色を、岩のきわで暗くする（rocks がそろってから）
    colorize(this.sandGeo, (x, y, z) => {
      const sand = C(0xddd3bd), sand2 = C(0xc6b99c);
      const c = mixA(sand, sand2, 0.5 + 0.5 * noise2(x * 9, z * 9));
      let ao = 1;
      for (const r of this.rocks) {
        const dx = (x - r.c.x) / (r.r.x + 0.04), dz = (z - r.c.z) / (r.r.z + 0.04);
        ao = Math.min(ao, 0.5 + 0.5 * smoothstep(0.7, 1.4, Math.hypot(dx, dz)));
      }
      return mulA(c, ao);
    });
    const sandGeo = mergeGeos(this.sandParts);
    const sand = new THREE.Mesh(sandGeo, this.sandMat);
    sand.name = 'tankSand';
    inner.add(sand);
    // 魚の寄り場（岩の表面）
    const rc = new THREE.Raycaster();
    const rng = mulberry32(404);
    for (let i = 0; i < 160; i++) {
      const r = this.rocks[Math.floor(rng() * this.rocks.length)];
      const a = rng() * TAU, el = (rng() - 0.25) * 1.4;
      const dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      if (dir.z < -0.5) continue;   // 奥の面は見えない
      const o = r.c.clone().addScaledVector(dir, 0.6);
      rc.set(o, dir.clone().negate());
      const hit = rc.intersectObject(mesh, false)[0];
      if (!hit) continue;
      const n = hit.face.normal.clone();
      if (n.dot(dir) < 0.2) continue;
      this.spots.push({ p: hit.point.clone(), n: dir.clone() });
    }
    this.raycaster = rc;
  }

  // 岩の上（または横）に、サンゴを置く場所をさがす
  hitRock(x, y, z, dir) {
    const rc = this.raycaster;
    const o = V3(x, y, z).addScaledVector(dir, 0.4);
    rc.set(o, dir.clone().negate());
    const hits = rc.intersectObject(this.rockMesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    const n = h.face.normal.clone().normalize();
    return { p: h.point.clone(), n };
  }

  buildCorals(inner) {
    const rng = mulberry32(9090);
    const geos = [];
    const obst = (p, r, h) => this.rocks.push({ c: V3(p.x, p.y + h * 0.5, p.z), r: V3(r, h * 0.6 + 0.01, r), coral: true });
    const put = (g, at, n, spin, sink = 0.004, tiltK = 0.6) => {
      const nn = V3(0, 1, 0).lerp(n, tiltK).normalize();
      alignTo(g, nn, spin);
      g.translate(at.x - nn.x * sink, at.y - nn.y * sink, at.z - nn.z * sink);
      geos.push(g);
    };
    const top = (x, z) => this.hitRock(x, 0.8 + Y0, z, V3(0, 1, 0));
    const side = (x, y, z, dx, dz) => this.hitRock(x, y, z, V3(dx, 0.15, dz).normalize());
    const cap = (g, h) => {
      const out = V3(h.n.x, 0, h.n.z).normalize();
      g.rotateY(Math.atan2(out.x, out.z));
      g.translate(h.p.x - out.x * 0.006, h.p.y, h.p.z - out.z * 0.006);
      geos.push(g);
    };
    // 岩の面に、小さなポリプを群れで
    const colony = (cx, cy, cz, dx, dz, n, R, make, sink = 0.0015) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * R;
        const hh = this.hitRock(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, cz + (rng() - 0.5) * R * 0.3, V3(dx, 0.35, dz).normalize());
        if (!hh || hh.n.y < -0.3) continue;
        put(make(), hh.p, hh.n, rng() * TAU, sink, 0.85);
      }
    };
    const blueAcro = { len: 0.045, r: 0.0095, trunks: 7, depth: 3, fork: 0.4, spread: 0.85, up: 1.1, buds: 3, base: C(0x52606e), tip: C(0x5a8ae0), tip2: C(0xd0e6ff), fluo: [0.08, 0.28, 1.0] };
    const pinkNest = { len: 0.026, r: 0.0042, trunks: 8, depth: 3, fork: 0.55, spread: 1.25, up: 0.9, buds: 0, base: C(0xb07a8a), tip: C(0xf2a6c6), tip2: C(0xffe0ee), fluo: [0.55, 0.12, 0.4] };
    const greenAcro = { len: 0.036, r: 0.0075, trunks: 6, depth: 3, fork: 0.3, spread: 0.75, up: 1.3, buds: 2, base: C(0x5a6a3a), tip: C(0x9cd25a), tip2: C(0xeaffb8), fluo: [0.28, 0.85, 0.15] };
    const purpAcro = { len: 0.034, r: 0.0075, trunks: 7, depth: 3, fork: 0.45, spread: 0.6, up: 1.45, buds: 4, base: C(0x564868), tip: C(0x9c6ad6), tip2: C(0xe8d4ff), fluo: [0.4, 0.15, 0.9] };
    const tealAcro = { len: 0.018, r: 0.0042, trunks: 5, depth: 2, fork: 0.3, spread: 0.8, up: 1.2, buds: 0, base: C(0x5a5a3a), tip: C(0x48d0a8), tip2: C(0xc8ffe8), fluo: [0.1, 0.8, 0.5] };
    // -- 左の島（高い）
    let h = top(-0.43, -0.15);
    if (h) { put(acropora(rng, blueAcro), h.p, h.n, rng() * TAU, 0.008, 0.3); obst(h.p, 0.1, 0.15); }
    h = top(-0.55, -0.17);
    if (h) { put(acropora(rng, pinkNest), h.p, h.n, rng() * TAU, 0.005, 0.5); obst(h.p, 0.07, 0.09); }
    h = top(-0.2, -0.1);
    if (h) { put(acropora(rng, greenAcro), h.p, h.n, rng() * TAU, 0.006, 0.4); obst(h.p, 0.08, 0.12); }
    h = side(-0.33, YB + 0.25, -0.05, 0.25, 1);
    if (h) cap(montiCap(rng, 0.1, { n: 7, base: C(0xd8601e), rim: C(0xf2d040), fluo: [0.85, 0.3, 0.02] }), h);
    h = side(-0.6, YB + 0.2, -0.06, 0.5, 1);
    if (h) { put(torch(rng, { heads: 5, tent: 34, L: 0.045, spreadH: 0.02, base: C(0x7a6a42), mid: C(0x8f8a52), tip: C(0xc8ff60), fluo: [0.35, 0.95, 0.1] }), h.p, h.n, rng() * TAU, 0.004, 0.35); obst(h.p, 0.08, 0.09); }
    h = side(-0.44, YB + 0.14, -0.04, 0.1, 1);
    if (h) colony(h.p.x, h.p.y, h.p.z, 0.1, 1, 260, 0.06, () => gspPolyp(rng), 0.001);
    colony(-0.52, YB + 0.08, 0.02, 0.3, 1, 80, 0.05, () => zoaPolyp(rng, { skirt: C(0x8a6a40), mouth: C(0x5a2a10), center: C(0xff8a1a), rim: C(0x40e070), fluoC: [0.9, 0.35, 0.02], fluoR: [0.15, 0.8, 0.25] }));
    colony(-0.3, YB + 0.07, 0.0, 0.0, 1, 9, 0.05, () => mushroom(rng, { base: C(0x9a1a2a), rim: C(0xd04050), spot: C(0x40d0c0), fluo: [0.45, 0.04, 0.1], fluoS: [0.1, 0.6, 0.55] }));
    // -- 右の島（低く、たな）
    h = top(0.47, -0.13);
    if (h) { put(tableAcro(rng, 0.16, { base: C(0x6a7a4a), rim: C(0xa8d070), tip: C(0xb48ad8), fluo: [0.38, 0.2, 0.8] }), h.p, V3(0, 1, 0), rng() * TAU, 0.004, 0); obst(h.p, 0.17, 0.06); }
    h = top(0.6, -0.18);
    if (h) { put(acropora(rng, purpAcro), h.p, h.n, rng() * TAU, 0.006, 0.3); obst(h.p, 0.08, 0.13); }
    h = top(0.32, -0.09);
    if (h) { put(digitata(rng, { n: 26, R: 0.055, base: C(0x6aa04a), tip: C(0xb0f070), fluo: [0.2, 0.85, 0.2] }), h.p, h.n, rng() * TAU, 0.004, 0.4); obst(h.p, 0.06, 0.09); }
    h = side(0.4, YB + 0.12, -0.05, -0.1, 1);
    if (h) cap(montiCap(rng, 0.085, { n: 6, base: C(0x8a2a6a), rim: C(0xf080c0), fluo: [0.65, 0.1, 0.5] }), h);
    h = side(0.58, YB + 0.08, -0.02, 0.4, 1);
    if (h) cap(montiCap(rng, 0.07, { n: 5, base: C(0x3a7a5a), rim: C(0x8af0d0), fluo: [0.1, 0.7, 0.45] }), h);
    colony(0.25, YB + 0.06, 0.03, -0.2, 1, 70, 0.045, () => zoaPolyp(rng, { skirt: C(0x6a5a50), mouth: C(0x3a1a2a), center: C(0xf060a0), rim: C(0xf0e060), fluoC: [0.7, 0.15, 0.45], fluoR: [0.6, 0.6, 0.05] }));
    colony(0.5, YB + 0.05, 0.0, 0.1, 1, 8, 0.045, () => mushroom(rng, { base: C(0x1e3a8a), rim: C(0x3a6ad0), spot: C(0x6aa0ff), fluo: [0.05, 0.15, 0.6], fluoS: [0.15, 0.35, 0.9] }));
    h = side(0.2, YB + 0.06, 0.03, -0.5, 1);
    if (h) { put(anemone(rng, { base: C(0xa04a50), bulb: C(0xe06a7a), tip: C(0xffd0d0), fluo: [0.35, 0.08, 0.1], tent: 70 }), h.p, h.n, 0, 0.004, 0.3); obst(h.p, 0.05, 0.05); }
    // -- 砂の上・奥
    const onSand = (x, z) => V3(x, this.sandY(x, z), z);
    let p = onSand(-0.63, 0.15);
    put(brain(rng, 0.065, { valley: C(0x8a2a1a), ridge: C(0x5ab04a), fluo: [0.22, 0.8, 0.15], fluoV: [0.5, 0.1, 0.03] }), p, V3(0, 1, 0), rng() * TAU, 0.01, 0); obst(p, 0.07, 0.06);
    p = onSand(0.61, 0.17);
    put(brain(rng, 0.052, { valley: C(0x2a5a3a), ridge: C(0xd04a2a), fluo: [0.65, 0.15, 0.03], fluoV: [0.1, 0.6, 0.2] }), p, V3(0, 1, 0), rng() * TAU, 0.01, 0); obst(p, 0.06, 0.05);
    for (const [x, z, len, col] of [[0.13, -0.22, 0.12, 0], [0.19, -0.2, 0.09, 1], [-0.07, -0.23, 0.14, 2]]) {
      p = onSand(x, z);
      const pal = [[C(0x4a2050), C(0x9a58b0), [0.25, 0.06, 0.3]], [C(0x6a2a1a), C(0xe07040), [0.4, 0.12, 0.02]], [C(0x5a3a20), C(0xd0b070), [0.15, 0.1, 0.02]]][col];
      put(seaRod(rng, { len, r: 0.0055, depth: 3, base: pal[0], tip: pal[1], fluo: pal[2] }), p, V3(0, 1, 0), rng() * TAU, 0.01, 0);
    }
    h = top(0.04, -0.2);
    if (h) { put(leather(rng, { base: C(0xc8b88a), polyp: C(0xd8e0b0), fluo: [0.12, 0.2, 0.06] }), h.p, h.n, rng() * TAU, 0.006, 0.2); obst(h.p, 0.06, 0.08); }
    // もっと: 枝サンゴの株・ナガレハナ・マメスナ・スターポリプ・巻き貝
    const yellowAcro = { len: 0.03, r: 0.0065, trunks: 6, depth: 3, fork: 0.5, spread: 1.0, up: 1.0, buds: 2, base: C(0x6a6a3a), tip: C(0xd8d050), tip2: C(0xfff8c0), fluo: [0.6, 0.6, 0.05] };
    const skyAcro = { len: 0.028, r: 0.006, trunks: 7, depth: 3, fork: 0.4, spread: 0.9, up: 1.2, buds: 2, base: C(0x4a5a6a), tip: C(0x70b8e8), tip2: C(0xe0f4ff), fluo: [0.1, 0.45, 0.95] };
    for (const [x, z, o] of [[-0.6, -0.12, skyAcro], [-0.34, -0.12, yellowAcro], [0.37, -0.16, greenAcro], [0.53, -0.04, yellowAcro], [0.27, -0.02, pinkNest]]) {
      const hh = top(x, z);
      if (hh && hh.p.y > YB + 0.04) { put(acropora(rng, o), hh.p, hh.n, rng() * TAU, 0.006, 0.4); obst(hh.p, 0.07, 0.1); }
    }
    h = side(-0.3, YB + 0.1, -0.02, 0.2, 1);
    if (h) { put(torch(rng, { heads: 4, tent: 26, L: 0.03, frog: true, base: C(0x6a5a3a), mid: C(0x9a8a62), tip: C(0xe8b0d0), fluo: [0.6, 0.25, 0.5] }), h.p, h.n, rng() * TAU, 0.004, 0.4); obst(h.p, 0.06, 0.06); }
    h = side(0.6, YB + 0.18, -0.08, 0.6, 1);
    if (h) { put(torch(rng, { heads: 3, tent: 30, L: 0.04, base: C(0x6a5a3a), mid: C(0x8a7a52), tip: C(0xff9a50), fluo: [0.9, 0.4, 0.05] }), h.p, h.n, rng() * TAU, 0.004, 0.4); obst(h.p, 0.07, 0.07); }
    colony(0.44, YB + 0.05, 0.03, 0.0, 1, 60, 0.04, () => zoaPolyp(rng, { skirt: C(0x5a6a50), mouth: C(0x203a20), center: C(0x50f0a0), rim: C(0xff5aa0), fluoC: [0.15, 0.9, 0.5], fluoR: [0.8, 0.2, 0.45] }));
    colony(-0.62, YB + 0.13, 0.0, 0.5, 1, 50, 0.035, () => zoaPolyp(rng, { skirt: C(0x7a6a40), mouth: C(0x3a2a10), center: C(0xffd040), rim: C(0x50a0ff), fluoC: [0.8, 0.7, 0.05], fluoR: [0.15, 0.4, 0.95] }));
    h = side(0.5, YB + 0.13, -0.08, 0.1, 1);
    if (h) colony(h.p.x, h.p.y, h.p.z, 0.1, 1, 200, 0.05, () => gspPolyp(rng), 0.001);
    for (const [x, y, z, dx, dz] of [[-0.05, YB + 0.32, -ZI + 0.012, 0, 1], [0.3, YB + 0.42, -ZI + 0.012, 0, 1], [-0.7, YB + 0.1, -0.02, 1, 0]]) {
      const n = V3(dx, 0, dz);
      const g = snail(rng);
      alignTo(g, n, rng() * TAU);
      g.translate(x, y, z);
      geos.push(g);
    }
    for (let i = 0; i < 7; i++) {   // 小さな枝サンゴ（株分けしたかけら）
      const hh = top(-0.62 + rng() * 1.24, -0.16 + rng() * 0.14);
      if (!hh || hh.p.y < YB + 0.07) continue;
      put(acropora(rng, tealAcro), hh.p, hh.n, rng() * TAU, 0.003, 0.4);
    }
    const geo = mergeGeos(geos, EXTRA);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    m.userData.patchKey = 'tankCoral';
    m.userData.vertPars = 'attribute vec3 fluo;\nattribute float sway;\nvarying vec3 vFluo;\nuniform vec2 uTankFlow;\n';
    m.userData.fragPars = 'varying vec3 vFluo;\n';
    patchMaterial(m, {
      underwater: true,
      vertex: `
        vFluo = fluo;
        if ( sway > 0.0 ) {
          vec3 w0 = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          float ph = uTime * 1.9 + dot( w0, vec3( 23.0, 31.0, 17.0 ) );
          vec2 fl = uTankFlow + vec2( sin( ph ), cos( ph * 1.3 ) ) * 0.22;
          float k = sway * sway;
          transformed.xz += fl * k * 0.02;
          transformed.y -= k * 0.005 * length( fl );
        }`,
      fragment: (fs) => fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vFluo * uTankAct;'),
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'tankCoral';
    inner.add(mesh);
    this.coralMesh = mesh;
  }

  buildPumps(root, inner) {
    const black = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.45, metalness: 0.1 });
    patchMaterial(black, { underwater: true });
    const grille = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 });
    patchMaterial(grille, { underwater: true });
    const cable = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.6 });
    this.pumps = [];
    for (const s of [-1, 1]) {
      const x = s * (XI - 0.024), y = YW - 0.09;
      // 中（ぬれる側）: プロペラのかご
      const wet = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.045, 28), black);
      body.rotation.x = Math.PI / 2;
      wet.add(body);
      for (let k = 0; k < 4; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009 + k * 0.0065, 0.0018, 6, 28), grille);
        ring.position.z = 0.024;
        wet.add(ring);
      }
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.058, 0.003), grille);
        sp.rotation.z = (k / 6) * Math.PI; sp.position.z = 0.024;
        wet.add(sp);
      }
      // 左右の側面のガラス（奥寄り）に、内がわへ向けてつける。左右が交互に強まって、水が行ったり来たりする
      const z = -0.12;
      wet.position.set(s * (XI - 0.024), y, z);
      wet.rotation.y = s < 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
      inner.add(wet);
      // 外（モーター）とケーブル
      const dry = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 28), black);
      dry.rotation.z = Math.PI / 2;
      dry.position.set(s * (W / 2 + 0.03), y, z);
      root.add(dry);
      const xo = s * (W / 2 + 0.04);
      const cb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        V3(xo, y - 0.03, z), V3(xo + s * 0.015, y - 0.2, z - 0.05), V3(xo, Y0 - 0.02, -0.3), V3(xo - s * 0.04, Y0 - 0.25, -0.345),
      ]), 20, 0.003, 5), cable);
      root.add(cb);
      this.pumps.push({ x, y, s });
      this.rocks.push({ c: V3(x, y, -0.12), r: V3(0.04, 0.04, 0.04), pump: true });
    }
  }

  // 水: 箱の中の水（背景の色を変え、光の柱を散らす）、水面、ただよう粒
  buildWater(root, inner) {
    const vol = new THREE.BoxGeometry(2 * XI - 0.001, YW - YB, 2 * ZI - 0.001);
    vol.translate(0, (YW + YB) / 2, 0);
    const volMat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uDetail: G.uDetail, uSunColor: G.uSunColor, uSunDirW: G.uSunDirW, uTankOn: G.uTankOn, uTankMin: G.uTankMin, uTankMax: G.uTankMax, uTankLed: G.uTankLed, uTankAct: G.uTankAct, uTankWater: G.uTankWater, uTankFlow: G.uTankFlow, uTankSpots: G.uTankSpots, uTankSpotY: G.uTankSpotY },
      vertexShader: /* glsl */ `varying vec3 vWPos; void main(){ vec4 w = modelMatrix * vec4( position, 1.0 ); vWPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uDetail; uniform vec3 uSunColor; uniform vec3 uSunDirW;
        varying vec3 vWPos;
        ${TANK_GLSL}
        void main() {
          vec3 ent;
          float dw = tankPath( vWPos, ent );
          vec3 sc = uTankWater * ( 1.0 - exp( -dw * 0.35 ) ) + tankScatter( ent, vWPos, uTime ) * 0.09;
          float a = 1.0 - exp( -dw * 0.5 );
          gl_FragColor = vec4( sc, a );
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const volume = new THREE.Mesh(vol, volMat);
    volume.renderOrder = 1;
    volume.name = 'tankVolume';
    inner.add(volume);

    // 水面
    const sg = new THREE.PlaneGeometry(2 * XI, 2 * ZI, 150, 60);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, YW, 0);
    const a = this.atm.u;
    this.surfU = {
      uTime: G.uTime, uDetail: G.uDetail, uSunColor: G.uSunColor, uSunDirW: G.uSunDirW,
      uTankOn: G.uTankOn, uTankMin: G.uTankMin, uTankMax: G.uTankMax, uTankLed: G.uTankLed, uTankAct: G.uTankAct, uTankWater: G.uTankWater, uTankFlow: G.uTankFlow,
      uHorizon: a.uHorizon, uZenith: a.uZenith, uSunDir: a.uSunDir, uSunCol: a.uSunCol, uSunVis: a.uSunVis, uAmbient: a.uAmbient,
      uSlosh: { value: 0.0025 }, uPump: { value: new THREE.Vector2(1, 1) },
      uOrigin: { value: new THREE.Vector3() },
      uMirror: { value: null }, uMirrorOn: { value: 0 }, uMirrorMat: { value: this.mirror.texMat },
      uRefr: { value: null }, uRefrOn: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uProj: { value: new THREE.Matrix4() },
      uTankSpots: G.uTankSpots, uTankSpotY: G.uTankSpotY,
    };
    const SKY = /* glsl */ `
      uniform vec3 uHorizon, uZenith, uSunDir, uSunCol, uAmbient; uniform float uSunVis;
      vec3 skyEnv( vec3 R ) {
        vec3 s = mix( uHorizon, uZenith, pow( clamp( R.y, 0.0, 1.0 ), 0.42 ) );
        vec3 gnd = uAmbient * vec3( 0.62, 0.56, 0.45 ) * 0.8;
        vec3 c = R.y > 0.0 ? s : mix( uHorizon * 0.85, gnd, smoothstep( 0.0, 0.2, -R.y ) );
        c += uSunCol * pow( max( dot( R, uSunDir ), 0.0 ), 1400.0 ) * 70.0 * uSunVis;
        return c;
      }`;
    this.SKY = SKY;
    const surfMat = new THREE.ShaderMaterial({
      uniforms: this.surfU,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uOrigin;
        ${SURF_GLSL}
        varying vec3 vWPos; varying vec2 vL;
        void main() {
          vec3 p = position;
          vec3 h = surfH( p.xz, uTime );
          p.y += h.x;
          vL = p.xz;
          vec4 w = modelMatrix * vec4( p, 1.0 );
          vWPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uDetail; uniform vec3 uSunColor; uniform vec3 uSunDirW;
        uniform sampler2D uMirror; uniform float uMirrorOn; uniform mat4 uMirrorMat;
        uniform sampler2D uRefr; uniform float uRefrOn; uniform vec2 uRes; uniform mat4 uProj;
        varying vec3 vWPos; varying vec2 vL;
        ${TANK_GLSL}
        ${SURF_GLSL}
        ${SKY}
        void main() {
          vec3 hs = surfH( vL, uTime );
          // 細かなさざ波（テクスチャ）
          vec2 q = vL * 3.0;
          vec2 dn = vec2( texture2D( uDetail, q + vec2( uTime * 0.05, 0.0 ) ).g - texture2D( uDetail, q + vec2( 0.013, uTime * 0.05 ) ).g,
                          texture2D( uDetail, q.yx * 1.3 - vec2( 0.0, uTime * 0.06 ) ).g - texture2D( uDetail, q.yx * 1.3 + vec2( 0.011, -uTime * 0.06 ) ).g ) * 0.9;
          vec3 n = normalize( vec3( -hs.y - dn.x * 0.06, 1.0, -hs.z - dn.y * 0.06 ) );
          vec3 V = normalize( cameraPosition - vWPos );
          if ( gl_FrontFacing ) {
            // 上から: 空と照明が映る。水の中は透けて見える
            float c = clamp( dot( n, V ), 0.0, 1.0 );
            float F = 0.02 + 0.98 * pow( 1.0 - c, 5.0 );
            vec3 R = reflect( -V, n );
            vec3 env = skyEnv( R );
            if ( R.y > 0.05 ) {
              float t = ( uTankSpotY - vWPos.y ) / R.y;
              vec2 hp = vWPos.xz + R.xz * t;
              // 3つの照明の丸いレンズが、波でゆらいで映る
              float dz = hp.y - uTankSpots.w;
              vec3 ax = abs( vec3( hp.x ) - uTankSpots.xyz );
              float ax0 = min( min( ax.x, ax.y ), ax.z );
              float dm = length( vec2( ax0, dz ) );
              if ( dm < 0.066 ) env = uTankLed * 9.0 + vec3( 0.05 );
              else if ( ax0 < 0.095 && abs( dz ) < 0.095 ) env = mix( env, vec3( 0.015 ), 0.85 );   // 黒い本体
            }
            // 水の中は、波でゆらいで見える（水槽の中だけを描いた絵を、水面の傾きでずらす）
            if ( uRefrOn > 0.5 ) {
              vec2 suv = gl_FragCoord.xy / uRes;
              vec4 c0 = uProj * viewMatrix * vec4( vWPos, 1.0 );
              vec4 c1 = uProj * viewMatrix * vec4( vWPos + vec3( n.x, 0.0, n.z ) * 0.06, 1.0 );
              vec2 off = ( c1.xy / c1.w - c0.xy / c0.w ) * 0.5;
              vec4 rc = texture2D( uRefr, suv + off );
              if ( rc.a > 0.5 ) { gl_FragColor = vec4( env * F + rc.rgb * ( 1.0 - F ), 1.0 ); return; }
            }
            gl_FragColor = vec4( env * F, F );
          } else {
            // 下から（前のガラスごし）: 角度が浅いと、水面の裏が鏡になる（全反射）
            vec3 ent;
            float dw = tankPath( vWPos, ent );
            vec3 d = -V;
            vec3 nE = vec3( 0.0, 0.0, 1.0 );
            if ( abs( ent.x - uTankMin.x ) < 0.004 ) nE = vec3( -1.0, 0.0, 0.0 );
            else if ( abs( ent.x - uTankMax.x ) < 0.004 ) nE = vec3( 1.0, 0.0, 0.0 );
            else if ( abs( ent.z - uTankMin.z ) < 0.004 ) nE = vec3( 0.0, 0.0, -1.0 );
            vec3 dw3 = refract( d, nE, 1.0 / 1.333 );
            float ci = clamp( dot( dw3, n ), 0.0, 1.0 );
            float st2 = 1.777 * ( 1.0 - ci * ci );
            vec4 mp = uMirrorMat * vec4( vWPos, 1.0 );
            vec2 muv = mp.xy / mp.w + n.xz * 0.06;
            vec3 mir = uMirrorOn > 0.5 ? texture2D( uMirror, muv ).rgb : uTankWater * 0.7 + uTankLed * 0.05;
            vec3 col;
            if ( st2 >= 1.0 ) col = mir;
            else {
              float ct = sqrt( 1.0 - st2 );
              float F = pow( ( 1.333 * ci - ct ) / ( 1.333 * ci + ct ), 2.0 );
              vec3 above = skyEnv( refract( dw3, -n, 1.333 ) ) + uTankLed * 2.0;
              col = mix( above, mir, clamp( F, 0.0, 1.0 ) );
            }
            col = col * exp( -dw * vec3( 0.62, 0.17, 0.09 ) ) + uTankWater * ( 1.0 - exp( -dw * 0.35 ) );
            gl_FragColor = vec4( col, 1.0 );
          }
        }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const surf = new THREE.Mesh(sg, surfMat);
    surf.renderOrder = 2;
    surf.name = 'tankSurface';
    root.add(surf);
    this.surface = surf;
  }

  // ガラス: 外の面は空を映し（斜めほど強く）、厚みの断面は淡い青緑。中から見える面はほとんど映らない
  buildGlass(root) {
    const panes = [];
    const pane = (w, h, d, x, y, z, out) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.deleteAttribute('uv');
      const n = g.attributes.normal, cnt = n.count;
      const edge = new Float32Array(cnt), on = new Float32Array(cnt * 3);
      const thin = w < h && w < d ? 0 : h < d ? 1 : 2;
      for (let i = 0; i < cnt; i++) {
        const nv = [n.getX(i), n.getY(i), n.getZ(i)];
        edge[i] = Math.abs(nv[thin]) > 0.5 ? 0 : 1;
        on[i * 3] = out[0]; on[i * 3 + 1] = out[1]; on[i * 3 + 2] = out[2];
      }
      g.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
      g.setAttribute('outN', new THREE.BufferAttribute(on, 3));
      g.translate(x, y, z);
      panes.push(g);
    };
    const yc = Y0 + H / 2 + GT / 2;
    pane(W, H - GT, GT, 0, yc, D / 2 - GT / 2, [0, 0, 1]);
    pane(W, H - GT, GT, 0, yc, -D / 2 + GT / 2, [0, 0, -1]);
    pane(GT, H - GT, D - 2 * GT, -W / 2 + GT / 2, yc, 0, [-1, 0, 0]);
    pane(GT, H - GT, D - 2 * GT, W / 2 - GT / 2, yc, 0, [1, 0, 0]);
    pane(W, GT, D, 0, Y0 + GT / 2, 0, [0, -1, 0]);
    const g = new THREE.BufferGeometry();
    {
      const list = panes.map((p) => p.toNonIndexed());
      const cat = (name, size) => {
        let n = 0; for (const p of list) n += p.attributes[name].count;
        const arr = new Float32Array(n * size); let o = 0;
        for (const p of list) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
        return new THREE.BufferAttribute(arr, size);
      };
      g.setAttribute('position', cat('position', 3));
      g.setAttribute('normal', cat('normal', 3));
      g.setAttribute('edge', cat('edge', 1));
      g.setAttribute('outN', cat('outN', 3));
    }
    const a = this.atm.u;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uHorizon: a.uHorizon, uZenith: a.uZenith, uSunDir: a.uSunDir, uSunCol: a.uSunCol, uSunVis: a.uSunVis, uAmbient: a.uAmbient, uSunLight: a.uSunLight, uTankLed: G.uTankLed, uTankWater: G.uTankWater,
        uTime: G.uTime, uOrigin: this.surfU.uOrigin, uSlosh: this.surfU.uSlosh, uPump: this.surfU.uPump },
      vertexShader: /* glsl */ `
        attribute float edge; attribute vec3 outN;
        varying vec3 vWPos; varying vec3 vN; varying vec3 vOut; varying float vEdge;
        void main() {
          vec4 w = modelMatrix * vec4( position, 1.0 );
          vWPos = w.xyz; vN = normalize( mat3( modelMatrix ) * normal ); vOut = mat3( modelMatrix ) * outN; vEdge = edge;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunLight, uTankLed, uTankWater; uniform float uTime; uniform vec3 uOrigin;
        varying vec3 vWPos; varying vec3 vN; varying vec3 vOut; varying float vEdge;
        ${this.SKY}
        ${SURF_GLSL}
        void main() {
          vec3 V = normalize( cameraPosition - vWPos );
          vec3 N = normalize( vN );
          if ( dot( N, V ) < 0.0 ) N = -N;
          float c = clamp( dot( N, V ), 0.0, 1.0 );
          if ( vEdge > 0.5 ) {
            // ガラスの断面（磨いた小口）: 淡い青緑。光がガラスの中を通って明るく見える
            vec3 ec = vec3( 0.42, 0.66, 0.6 );
            vec3 L = uAmbient * 0.9 + uSunLight * 0.25 + uTankLed * 0.35;
            float F = 0.04 + 0.96 * pow( 1.0 - c, 5.0 );
            vec3 col = ec * L * 0.55 + min( skyEnv( reflect( -V, N ) ), vec3( 2.5 ) ) * F;   // 小口の太陽のぎらつきは、おさえめに
            gl_FragColor = vec4( col * 0.8, 0.8 );
            return;
          }
          bool outside = dot( V, vOut ) > 0.0;
          float F = outside ? 0.04 + 0.96 * pow( 1.0 - c, 5.0 ) : 0.004 + 0.2 * pow( 1.0 - c, 5.0 );
          vec3 env = outside ? skyEnv( reflect( -V, N ) ) : uTankWater * 0.6 + uTankLed * 0.2;
          vec4 o = vec4( env * F, F * 0.92 + 0.012 );
          // 水ぎわの線（ガラスの内側に、水がはい上がった細い線）
          if ( dot( normalize( vN ), vOut ) < -0.5 && abs( vOut.y ) < 0.5 ) {
            vec3 lp = vWPos - uOrigin;
            float wl = ${YW.toFixed(4)} + surfH( lp.xz, uTime ).x;
            float dy = vWPos.y - uOrigin.y - wl;
            float line = smoothstep( 0.0022, 0.0004, abs( dy - 0.0006 ) );
            float under = smoothstep( 0.0005, -0.002, dy );
            vec3 lc = skyEnv( vec3( 0.0, 1.0, 0.0 ) ) * 0.5 + uTankLed * 0.6 + uAmbient * 0.3;
            o = vec4( o.rgb * ( 1.0 - line * 0.6 ) + lc * line * 0.6, max( o.a, line * 0.6 ) );
            o.rgb += uTankWater * 0.04 * under;
          }
          gl_FragColor = o;
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 3;
    mesh.name = 'tankGlass';
    root.add(mesh);
    // 黒いシリコン（角の継ぎ目）
    const sil = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.35 });
    patchMaterial(sil, { underwater: true });
    const parts = [];
    const sw = 0.006;
    for (const [x, z] of [[-XI, -ZI], [XI, -ZI], [-XI, ZI], [XI, ZI]]) {
      const b = new THREE.BoxGeometry(sw, H - GT, sw);
      b.rotateY(Math.PI / 4);
      b.translate(x, YB + (H - GT) / 2, z);
      parts.push(b);
    }
    for (const [w, d, x, z] of [[2 * XI, sw, 0, ZI], [2 * XI, sw, 0, -ZI], [sw, 2 * ZI, -XI, 0], [sw, 2 * ZI, XI, 0]]) {
      const b = new THREE.BoxGeometry(w, sw, d);
      b.rotateX(0); b.translate(x, YB + sw * 0.3, z);
      parts.push(b);
    }
    const sm = new THREE.Mesh(mergeGeos(parts), sil);
    sm.layers.enable(TANK_LAYER);
    root.add(sm);
  }

  // LED照明: ガラスの縁にのせる細い脚と、薄い本体。下面に白と青のLEDの粒
  // 照明: 四角いペンダントライトを3つ。水槽の後ろから立つステンレスの角柱で吊り、下面の丸いレンズから光る
  buildLight(root) {
    const black = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.6, metalness: 0.2 });
    // 柱・腕・金具も、本体と同じ黒（つや消しの黒いアルミ。角に少しだけ光がのる）
    const armMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.42, metalness: 0.5 });
    applyEnv(black, 0.12); applyEnv(armMat, 0.3);
    const rim = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.25, metalness: 0.8 });
    this.ledMat = new THREE.MeshBasicMaterial({ map: lensTexture(), color: new THREE.Color(3, 3, 3) });
    const S = 0.19, HB = 0.072, zc = LED_Z, zp = -D / 2 + GT / 2;   // 柱は、後ろのガラスの真上
    const rimY = Y0 + H;
    for (const x of LED_X) {
      // 本体（四角い箱）
      const head = new THREE.Mesh(new THREE.BoxGeometry(S, HB, S), black);
      head.position.set(x, YLED + HB / 2, zc);
      root.add(head);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(S - 0.01, 0.004, S - 0.01), rim);
      cap.position.set(x, YLED + HB + 0.002, zc);
      root.add(cap);
      // 下面: 丸いレンズと、そのふち
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.066, 0.074, 40), rim);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, YLED - 0.0008, zc);
      root.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.066, 40), this.ledMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, YLED - 0.001, zc);
      root.add(lens);
      // ガラスの縁をはさむ金具（上と、外側・内側の板。内側は水面にとどかない長さ）
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.016, GT + 0.012), armMat);
      clamp.position.set(x, rimY + 0.008, zp);
      root.add(clamp);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.004), armMat);
      outer.position.set(x, rimY - 0.025 + 0.016, zp - GT / 2 - 0.004);
      root.add(outer);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.004), armMat);
      inner.position.set(x, rimY - 0.01 + 0.016, zp + GT / 2 + 0.004);
      root.add(inner);
      // 柱: 金具から立ちあがり、上で前へ曲がって本体の背中につく
      const postBot = rimY + 0.016;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.024, YLED + HB * 0.6 - postBot, 0.024), armMat);
      post.position.set(x, (YLED + HB * 0.6 + postBot) / 2, zp);
      root.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, zc - S / 2 - zp + 0.012), armMat);
      arm.position.set(x, YLED + HB * 0.6, (zc - S / 2 + zp) / 2 + 0.006);
      root.add(arm);
      // 電源コード: 金具の外側から、水槽の後ろを下へ
      const cb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        V3(x + 0.014, rimY + 0.01, zp - GT / 2 - 0.008), V3(x + 0.02, rimY - 0.12, zp - GT / 2 - 0.012), V3(x + 0.03, Y0 + 0.08, -D / 2 - 0.016), V3(x + 0.035, Y0 - 0.02, -D / 2 - 0.02),
      ]), 16, 0.0022, 5), new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.6 }));
      root.add(cb);
    }
    // 夜、水槽の青い光が砂にこぼれる
    const glowTex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, { srgb: false });
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.0), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.03, 0.35);
    glow.renderOrder = 0;
    this.root.add(glow);
  }

  buildParticles(inner) {
    const n = 420, rng = mulberry32(55);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seed[i] = rng();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(V3(0, (YB + YW) / 2, 0), 1);
    this.partU = { uTime: G.uTime, uTankFlow: G.uTankFlow, uTankLed: G.uTankLed, uSunColor: G.uSunColor, uAmb: this.atm.u.uAmbient, uPx: { value: 800 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.partU,
      vertexShader: /* glsl */ `
        attribute vec4 seed; uniform float uTime, uPx; uniform vec2 uTankFlow;
        varying float vA;
        void main() {
          vec3 f = fract( seed.xyz + vec3( uTime * 0.0035 * ( seed.w - 0.3 ), -uTime * 0.0012 * ( 0.5 + seed.w ), uTime * 0.002 * ( seed.y - 0.5 ) ) );
          vec3 p = mix( vec3( ${(-XI + 0.01).toFixed(3)}, ${(YB + 0.05).toFixed(3)}, ${(-ZI + 0.01).toFixed(3)} ), vec3( ${(XI - 0.01).toFixed(3)}, ${(YW - 0.01).toFixed(3)}, ${(ZI - 0.01).toFixed(3)} ), f );
          p.xz += uTankFlow * 0.02 * ( 0.5 + seed.w );
          p += 0.006 * vec3( sin( uTime * 0.7 + seed.x * 40.0 ), sin( uTime * 0.5 + seed.y * 40.0 ), cos( uTime * 0.6 + seed.z * 40.0 ) );
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_PointSize = max( 1.0, uPx * ( 0.0007 + seed.w * 0.0009 ) / -mv.z );
          vA = smoothstep( 0.0, 0.08, f.y ) * smoothstep( 1.0, 0.9, f.y ) * ( 0.35 + 0.65 * seed.w );
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTankLed, uSunColor, uAmb; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep( 0.5, 0.15, length( c ) ) * vA;
          gl_FragColor = vec4( ( uTankLed * 0.6 + uAmb * 0.4 + uSunColor * 0.08 ) * a * 0.32, 0.0 );
        }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const pts = new THREE.Points(g, m);
    pts.renderOrder = 2;
    pts.frustumCulled = false;
    inner.add(pts);
    this.particles = pts;
  }

  // ------------------------------------------------------------------ 魚
  canAdd(sp, cm) {
    if (!sp || sp.junk || sp.legend) return { ok: false, msg: 'この魚は水槽には入れられない' };
    if (cm > TANK.maxCm) return { ok: false, msg: '大きすぎて、水槽には入らない' };
    const n = this.tankCount();
    if (sp.shoal) { if (n.small >= TANK.smallCap) return { ok: false, msg: `小魚がいっぱい（${TANK.smallCap}匹まで）` }; }
    else if (n.big >= TANK.cap) return { ok: false, msg: `水槽がいっぱい（${TANK.cap}匹まで）` };
    return { ok: true };
  }
  // 飼っている数（群がる小魚は別に数える）
  tankCount() {
    let small = 0;
    for (const e of this.save.data.tank) if (SPECIES[e.id] && SPECIES[e.id].shoal) small++;
    return { small, big: this.save.data.tank.length - small };
  }
  add(id, cm) {
    const sp = SPECIES[id];
    const r = this.canAdd(sp, cm);
    if (!r.ok) return r;
    const e = { id, cm: Math.round(cm * 10) / 10, at: Date.now() };
    this.save.data.tank.push(e);
    this.save.save();
    this.spawn(e, true);
    return { ok: true };
  }
  remove(i) {
    const e = this.save.data.tank[i];
    if (!e) return null;
    this.save.data.tank.splice(i, 1);
    this.save.save();
    const f = this.fish.find((ff) => ff.e === e);
    if (f) {
      this.inner.remove(f.obj.group);
      f.obj.dispose();
      this.fish.splice(this.fish.indexOf(f), 1);
    }
    return e;
  }
  spawn(e, splash = false) {
    const sp = SPECIES[e.id];
    if (!sp) return;
    const obj = createFishObject(sp, e.cm);
    obj.group.traverse((o) => { o.layers.enable(TANK_LAYER); o.castShadow = false; o.receiveShadow = false; });
    this.inner.add(obj.group);
    const STY = { himeSuzume: 'shoal', kiiroHagi: 'graze', potter: 'hide', hifuki: 'hide', tsunodashi: 'cruise', muramasa: 'bottom', hashinaga: 'pick', uhu: 'graze', aholehole: 'school', papio: 'patrol' };
    const len = e.cm / 100;
    const f = {
      e, sp, obj, len,
      style: STY[e.id] || 'cruise',
      p: V3((Math.random() - 0.5) * 0.6, splash ? YW - 0.06 : YB + 0.25, 0.1),
      heading: Math.random() * TAU, pitch: 0, roll: 0, turn: 0, speed: 0,
      target: V3(0, YB + 0.25, 0.1), hold: 0, t: 0,
      cruise: clamp(0.05 + sp.speed * 0.22, 0.05, 0.22) * (0.9 + Math.random() * 0.2),
      phase: Math.random() * 10, side: Math.random() < 0.5 ? -1 : 1, av: 0, bend: 0,
    };
    this.pickTarget(f);
    this.fish.push(f);
  }

  // 次に向かう場所（魚の性格で）
  pickTarget(f) {
    const m = f.len * 0.55 + 0.02, rnd = Math.random;
    const box = (y0, y1) => V3((rnd() * 2 - 1) * (XI - m), lerp(y0, y1, rnd()), (rnd() * 2 - 1) * (ZI - Math.min(m, ZI - 0.04)));
    let t;
    f.hold = 0;
    f.face = null;
    if ((f.style === 'graze' || f.style === 'pick' || f.style === 'hide') && this.spots.length && rnd() < (f.style === 'hide' ? 0.85 : 0.65)) {
      let s = this.spots[Math.floor(rnd() * this.spots.length)];
      if (f.style === 'hide' && f.home) {   // 自分のすみかの近くで
        const near = this.spots.filter((q) => q.p.distanceTo(f.home) < 0.16);
        if (near.length) s = near[Math.floor(rnd() * near.length)];
      }
      if (f.style === 'hide' && !f.home) f.home = s.p.clone();
      t = s.p.clone().addScaledVector(s.n, f.len * 0.35 + 0.025);
      f.hold = (f.style === 'hide' ? 2.5 : 1.2) + rnd() * 3;
      f.face = s.n.clone().negate();
    } else if (f.style === 'bottom') {
      t = box(YB + 0.06, YB + 0.14);
      f.hold = rnd() * 1.5;
    } else if (f.style === 'shoal') {
      // 群れの集まる場所（岩の少し上の水中）のまわりへ。ときどき、すぐ前のプランクトンをつつきに出る
      const S = this._shoal || this.shoalAnchor(0);
      if (rnd() < 0.3) t = f.p.clone().add(V3(Math.cos(f.heading) * 0.06 + (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.04, Math.sin(f.heading) * 0.06 + (rnd() - 0.5) * 0.05));
      else t = S.p.clone().add(V3((rnd() * 2 - 1) * 0.17, (rnd() * 2 - 1) * 0.07, (rnd() * 2 - 1) * 0.09));
      f.hold = 0.8 + rnd() * 2.5;
    } else if (f.style === 'patrol') {
      t = V3((f.target.x > 0 ? -1 : 1) * (XI - m - rnd() * 0.15), lerp(YB + 0.18, YW - 0.08, rnd()), (rnd() * 2 - 1) * (ZI - Math.min(m, ZI - 0.05)));
    } else {
      t = box(YB + 0.16, YW - 0.06);
      if (f.style === 'cruise') f.hold = rnd() < 0.3 ? 1 + rnd() * 2 : 0;
    }
    this.pushOut(t, f.len * 0.12 + 0.02);
    t.y = clamp(t.y, YB + 0.05 + f.len * 0.15, YW - 0.03 - f.len * 0.15);
    t.x = clamp(t.x, -XI + m, XI - m);
    t.z = clamp(t.z, -ZI + Math.min(m, ZI - 0.03), ZI - Math.min(m, ZI - 0.03));
    f.target.copy(t);
    f.t = 0;
    f.prog = null; f.progT = 0; f.dodgeT = 0;
  }

  // 群がる小魚の集まる場所: 岩の少し上の水中。ときどき（15〜30秒ごと）群れごと別の岩の上へ移り、向きもそろえる
  //  （たいていは横向き＝水槽の前から体の横が見える向き）
  shoalAnchor(dt) {
    const S = this._shoal || (this._shoal = { p: V3(0, YB + 0.32, 0), h: 0, t: 0 });
    S.t -= dt;
    if (S.t <= 0) {
      S.t = 15 + Math.random() * 15;
      // 岩組みのいちばん上から、少し上の水中（何度か試して、岩の上になる場所を選ぶ）
      let best = null;
      for (let k = 0; k < 8 && !best; k++) {
        const x = (Math.random() * 2 - 1) * (XI - 0.25), z = (Math.random() - 0.4) * 0.2;
        let top = -1;
        for (const r of this.rocks) if (!r.pump && Math.abs(r.c.x - x) < r.r.x * 0.8 && Math.abs(r.c.z - z) < r.r.z + 0.1) top = Math.max(top, r.c.y + r.r.y);
        if (top > YB + 0.1 || k === 7) best = [x, top > 0 ? top : YB + 0.1, z];
      }
      S.p.set(best[0], clamp(best[1] + 0.13, YB + 0.22, YW - 0.1), best[2]);
      S.h = Math.random() < 0.7 ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.7 : Math.random() * TAU;
    }
    return S;
  }

  // 岩・サンゴの中に入っていたら、外へ出す
  pushOut(p, m) {
    let hit = false;
    for (const r of this.rocks) {
      const ax = r.r.x + m, ay = r.r.y + m, az = r.r.z + m;
      const qx = (p.x - r.c.x) / ax, qy = (p.y - r.c.y) / ay, qz = (p.z - r.c.z) / az;
      const q = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (q < 1 && q > 1e-4) { p.set(r.c.x + (qx / q) * ax, r.c.y + (qy / q) * ay, r.c.z + (qz / q) * az); hit = true; }
    }
    return hit;
  }

  updateFish(dt, time) {
    if (!this._fv) this._fv = [V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0)];
    const [des, toT, tmp, nrm, fwd] = this._fv;
    const fl = this.flow;
    const SH = this.fish.some((f) => f.style === 'shoal') ? this.shoalAnchor(dt) : null;
    for (const f of this.fish) {
      f.t += dt;
      // 行き先: 近くまで来たら、しばらくその場にいて次へ。なかなか近づけない（岩とガラスのすきまなど）ときも次へ
      let dist = f.target.distanceTo(f.p);
      if (dist < 0.05 + f.len * 0.15) {
        f.hold -= dt;
        if (f.hold <= 0) this.pickTarget(f);
      } else if (f.t > 20) this.pickTarget(f);
      if (f.prog == null) f.prog = dist;
      if ((f.progT = (f.progT || 0) + dt) > 4) {
        if (dist > 0.05 + f.len * 0.15 && f.prog - dist < 0.03) this.pickTarget(f);
        f.prog = f.target.distanceTo(f.p); f.progT = 0;
      }
      f.dodgeT = (f.dodgeT || 0) - dt;
      toT.subVectors(f.target, f.p);
      dist = toT.length();
      const hover = dist < 0.05 + f.len * 0.15;
      const cruise = f.cruise * (f.style === 'patrol' ? 1.5 : 1);
      // ほしい速さと向き: 目的地へ。近づいたらゆっくり
      des.copy(toT).multiplyScalar(cruise * clamp(dist / 0.15, 0.25, 1) / Math.max(dist, 1e-4));
      // 群れ（アホレホレ）: 仲間に寄る
      if (f.style === 'school') {
        let n = 0; tmp.set(0, 0, 0);
        for (const g of this.fish) if (g !== f && g.e.id === f.e.id) { tmp.add(g.p); n++; }
        if (n) des.addScaledVector(tmp.multiplyScalar(1 / n).sub(f.p), 0.6);
      }
      // ほかの魚と重ならない（すれちがうくらいでは向きを変えず、ひれで少しよける）
      for (const g of this.fish) {
        if (g === f) continue;
        tmp.subVectors(f.p, g.p);
        const d = tmp.length(), r = (f.len + g.len) * 0.38 + 0.015;
        if (d < r && d > 1e-4) {
          const k = (r - d) / r;
          des.addScaledVector(tmp, k * cruise * 0.5 / d);
          f.p.addScaledVector(tmp, k * 0.03 * dt / d);
        }
      }
      // 岩・サンゴ・ガラス・砂・水面: 近づいたら、そちらへ向かう分だけを消して、表面に沿って回りこむ。
      // （魚の向きで力が変わると、向きを変える→力が変わる→また向きを変える、で首を振りつづけるので、
      //   いまいる場所だけで決める）
      const want = des.length();
      let brake = 1;
      fwd.set(Math.cos(f.heading) * Math.cos(f.pitch), Math.sin(f.pitch), Math.sin(f.heading) * Math.cos(f.pitch));
      const wall = (gap, band, nx, ny, nz) => {
        if (gap > band) return 0;
        nrm.set(nx, ny, nz);
        const w = smoothstep(band, 0, gap);
        const into = des.dot(nrm);
        if (into < 0) des.addScaledVector(nrm, -into * w);
        if (gap < 0) des.addScaledVector(nrm, -gap * 3);
        brake = Math.min(brake, 1 - 0.75 * w * Math.max(0, -fwd.dot(nrm)));
        return w;
      };
      for (const r of this.rocks) {
        const m = f.len * 0.12 + 0.015;
        const ax = r.r.x + m, ay = r.r.y + m, az = r.r.z + m;
        const qx = (f.p.x - r.c.x) / ax, qy = (f.p.y - r.c.y) / ay, qz = (f.p.z - r.c.z) / az;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (q < 1e-4) continue;
        const band = 0.04 + f.len * 0.25;
        const gap = (q - 1) * Math.min(ax, ay, az);
        if (gap > band) continue;
        tmp.set(qx / ax, qy / ay, qz / az).normalize();
        const w = wall(gap, band, tmp.x, tmp.y, tmp.z);
        // 真正面に岩があるときは、横へ回りこむ（右か左かは、いったん決めたら、しばらく変えない）
        const left = des.length();
        if (left < want * 0.5) {
          tmp.set(-nrm.z, 0, nrm.x);
          if (tmp.lengthSq() < 1e-6) tmp.set(1, 0, 0);
          tmp.normalize();
          if (f.dodgeT <= 0) f.dodgeS = Math.sign(tmp.dot(toT)) || f.side;
          f.dodgeT = 2.5;
          des.addScaledVector(tmp, f.dodgeS * (want * 0.5 - left) * w);
        }
      }
      const mx = XI - f.len * 0.5 - 0.02, mz = ZI - Math.min(f.len * 0.5 + 0.02, ZI - 0.03);
      const ylo = YB + 0.05 + f.len * 0.12, yhi = YW - 0.03 - f.len * 0.12;
      const bh = 0.05 + f.len * 0.3, bz = Math.min(bh, mz * 0.8), bv = 0.04;
      wall(mx - f.p.x, bh, -1, 0, 0); wall(f.p.x + mx, bh, 1, 0, 0);
      wall(mz - f.p.z, bz, 0, 0, -1); wall(f.p.z + mz, bz, 0, 0, 1);
      wall(yhi - f.p.y, bv, 0, -1, 0); wall(f.p.y - ylo, bv, 0, 1, 0);
      // 向き: ほしい向き（水平）へ、なめらかに回る。泳ぎながらは速く、止まっているときはひれで、ゆっくり。
      // 真上・真下へ行きたいときは向きを変えず、ひれで浮き沈みする（くるくる回りながら沈まない）
      if (hover && !f.wasHover) f.hoverH = f.heading;
      f.wasHover = hover;
      const hs = Math.hypot(des.x, des.z);
      let wantH = f.heading;
      if (hover && SH && f.style === 'shoal') wantH = SH.h + f.side * 0.12 + 0.18 * Math.sin(f.t * 0.5 + f.phase);   // 群れで向きをそろえる
      else if (hover) wantH = f.face && Math.hypot(f.face.x, f.face.z) > 0.3 ? Math.atan2(f.face.z, f.face.x) : f.hoverH + 0.35 * Math.sin(f.t * 0.4 + f.phase);
      else if (hs > 0.004) wantH = Math.atan2(des.z, des.x);
      const dh = Math.atan2(Math.sin(wantH - f.heading), Math.cos(wantH - f.heading));
      const piv = clamp(0.24 / f.len, 0.6, 1.6);
      const rate = (hover ? 0.5 : 1) * piv + f.speed / (0.7 * f.len);
      const sure = hover ? 1 : smoothstep(0.1 * cruise, 0.45 * cruise, hs);
      f.av = damp(f.av || 0, clamp(dh * 2 * sure, -rate, rate), 6, dt);
      f.heading += f.av * dt;
      // 速さ: 大きく向きを変えるとき・ガラスや岩に向いているときは、ゆるめる
      const tgtS = hover ? 0.004 : Math.min(hs, cruise * 1.3) * Math.max(0.2, Math.cos(dh)) * brake;
      f.speed = damp(f.speed, tgtS, 1.8, dt);
      f.vy = damp(f.vy || 0, hover ? 0 : clamp(des.y, -0.6 * cruise, 0.6 * cruise), 1.5, dt);
      // 上り下りのときは、頭を少し上げ下げする
      f.pitch = damp(f.pitch, clamp(0.6 * Math.atan2(f.vy, Math.max(f.speed, 0.08)), -0.3, 0.3), 2, dt);
      f.p.x += Math.cos(f.heading) * f.speed * dt;
      f.p.z += Math.sin(f.heading) * f.speed * dt;
      f.p.y += f.vy * dt;
      // 近くまで来たら、ひれで少しずつ寄って、その場にとどまる
      if (hover && dist > 1e-4) f.p.addScaledVector(toT, Math.min(dist, 0.015 * dt) / dist);
      // 造波ポンプの流れに、少し押される
      f.p.x += fl.x * 0.012 * dt / Math.max(0.5, f.len * 6);
      f.p.z += fl.y * 0.012 * dt / Math.max(0.5, f.len * 6);
      // めりこみ防止
      this.pushOut(f.p, f.len * 0.12 + 0.008);
      const hx = XI - f.len * 0.42, hz = ZI - Math.min(f.len * 0.42, ZI - 0.03);
      f.p.x = clamp(f.p.x, -hx, hx); f.p.z = clamp(f.p.z, -hz, hz);
      f.p.y = clamp(f.p.y, YB + 0.035 + f.len * 0.1, YW - 0.02 - f.len * 0.1);
      this.placeFish(f, dt);
    }
  }
  placeFish(f, dt) {
    const o = f.obj, g = o.group;
    const dt1 = Math.max(dt, 1 / 60);
    g.position.copy(f.p);
    g.rotation.order = 'YZX';
    g.rotation.y = -f.heading;
    g.rotation.z = f.pitch;
    // 曲がるときは、体を曲がる側へ少しだけしならせ、ほんの少し内側へかたむく。
    // その場でゆっくり向きを変えるときは、ひれで回るので、体はほぼまっすぐ
    const swim = clamp(f.speed / Math.max(f.cruise, 0.03), 0, 1);
    f.bend = damp(f.bend || 0, clamp(f.av * 0.03 * (0.35 + 0.65 * swim), -0.055, 0.055), 6, dt1);
    f.roll = damp(f.roll, clamp(f.av * 0.05 * swim, -0.08, 0.08), 4, dt1);
    g.rotation.x = f.roll;
    if (o.wig) {
      // 尾をふる速さは、体の長さあたりの速さで（小さい魚ほど速く、大きい魚はゆったり）
      const bl = clamp(f.speed / f.len, 0, 2.5);
      o.wig.uWigFreq.value = 3 + bl * 4.5;
      o.wig.uWigAmp.value = (o.wigAmp ?? 0.065) * (0.3 + 0.5 * clamp(f.speed / Math.max(f.cruise, 0.03), 0, 1.2));
      o.wig.uTurn.value = f.bend;
      o.wig.uFinFreq.value = (o.finBase ?? 4.5) + bl * 3;
      const peck = f.face && f.target.distanceTo(f.p) < 0.06;
      o.wig.uBreath.value = damp(o.wig.uBreath.value, peck ? 8 : o.breath0, 4, dt1);
    }
  }

  // ------------------------------------------------------------------ 毎フレーム
  update(dt, time, atm) {
    this.tank.updateWorldMatrix(true, false);
    const o = this.tank.getWorldPosition(this._v[3]);
    G.uTankOn.value = 1;
    G.uTankMin.value.set(o.x - XI, o.y + YB, o.z - ZI);
    G.uTankMax.value.set(o.x + XI, o.y + YW, o.z + ZI);
    // 照明: 昼は白と青、日が暮れると青だけ（サンゴの蛍光がうかぶ）、夜ふけは月明かりのように暗く
    const hr = atm.hour, set = SEASON.sun.set, rise = SEASON.sun.rise;
    const day = smoothstep(rise + 0.5, rise + 1.5, hr) * (1 - smoothstep(set + 1.0, set + 2.0, hr));
    const blue = smoothstep(rise, rise + 0.8, hr) * (1 - smoothstep(23.0, 23.8, hr));
    const moon = 0.06;
    const white = day * 0.62;
    const act = Math.max(blue, moon);
    G.uTankLed.value.setRGB(0.55 * white + 0.05 * act, 0.68 * white + 0.16 * act, 0.9 * white + 0.85 * act).multiplyScalar(1.0);
    G.uTankAct.value.setRGB(0.25, 0.3, 0.55).multiplyScalar(act * (0.7 + 0.8 * (1 - day)));
    // 水の散乱光: 照明と空の光を少し
    const amb = atm.u.uAmbient.value;
    // 水の中で散る光（たっぷり水を通したときの色）: 空の光と照明が、青く散る
    const L = G.uTankLed.value;
    G.uTankWater.value.setRGB(amb.r * 0.1 + L.r * 0.22, amb.g * 0.25 + L.g * 0.3, amb.b * 0.38 + L.b * 0.36);
    this.ledMat.color.setRGB(2.2 * white + 0.25 * act, 2.6 * white + 0.6 * act, 3.2 * white + 3.0 * act);
    this.standMat.color.copy(this.standBase).multiplyScalar(1 - 0.5 * atm.night);   // 夜は台を暗く（水槽の光だけがうかぶように）
    this.glowMat.color.setRGB(0.02 * white + 0.01 * act, 0.05 * white + 0.035 * act, 0.09 * white + 0.12 * act).multiplyScalar(atm.night * 1.0 + 0.05);
    // 造波ポンプ: 左右が交互に強くなり、水が行ったり来たりする
    this.pumpT += dt;
    const ph = (this.pumpT / 7.0) * TAU;
    const sw = Math.sin(ph);
    this.flow.set(sw * 1.0 + 0.25 * Math.sin(this.pumpT * (TAU / T_SLOSH)), 0.25 * Math.sin(ph * 0.5 + 1));
    G.uTankFlow.value.copy(this.flow);
    this.surfU.uPump.value.set(0.5 + 0.5 * Math.max(0, sw), 0.5 + 0.5 * Math.max(0, -sw));
    this.surfU.uSlosh.value = 0.0018 + 0.0012 * Math.abs(sw);
    G.uTankSpots.value.set(o.x + LED_X[0], o.x + LED_X[1], o.x + LED_X[2], o.z + LED_Z);
    G.uTankSpotY.value = o.y + YLED;
    this.surfU.uOrigin.value.copy(o);
    this.updateFish(Math.min(dt, 0.05), time);
    if (this.active) this.updateCamera(dt);
  }

  // ------------------------------------------------------------------ 鑑賞モード
  // ctx: { camera, player, ui, game, canvas, hide: [隠すもの], onPhoto }
  attach(ctx) {
    this.ctx = ctx;
    const cv = ctx.canvas;
    const pts = new Map();
    let pinch0 = 0, dist0 = 0;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cv.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = this.goal.dist; }
      this.idleT = 0;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.active || !pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        const k = e.pointerType === 'mouse' ? 0.0045 : 0.006;
        this.goal.yaw -= dx * k;
        this.goal.pitch = clamp(this.goal.pitch + dy * k * 0.7, -0.32, 1.05);
      } else if (pts.size === 2 && pinch0 > 0) {
        const [a, b] = [...pts.values()];
        this.goal.dist = clamp(dist0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 0.85, 5.5);
      }
      this.idleT = 0;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.goal.dist = clamp(this.goal.dist * Math.exp(e.deltaY * 0.0012), 0.85, 5.5);
    }, { passive: true });
  }

  setView(k) {
    const V = VIEWS[k] || VIEWS.front;
    this.view = k;
    // 砂の上に直置きのときは目線を低く。正面は、水面の高さに目をおいて、沖の水平線と水槽の水面をそろえる
    this.goal = { ...V, ...(this.standOn ? {} : DIRECT_VIEWS[k] || {}) };
    if (!this.camS) this.camS = { ...V };
  }
  nextView() {
    const i = VIEW_ORDER.indexOf(this.view);
    this.setView(VIEW_ORDER[(i + 1) % VIEW_ORDER.length]);
    return VIEW_NAMES[this.view];
  }

  enter() {
    if (this.active || !this.ctx) return;
    const { player, ui } = this.ctx;
    this.active = true;
    player.enabled = false;
    this.fovBefore = player.targetFov;
    this.hidden = (this.ctx.hide || []).filter(Boolean).map((o) => [o, o.visible]);
    for (const [o] of this.hidden) o.visible = false;
    this.camS = null;
    this.setView('front');
    this.camS = { ...this.goal };
    ui.openTank && ui.openTank(this.panelState());
  }
  exit() {
    if (!this.active) return;
    const { player, ui, camera } = this.ctx;
    this.active = false;
    player.enabled = true;
    player.targetFov = this.fovBefore ?? player.targetFov;
    for (const [o, v] of this.hidden || []) o.visible = v;
    this.hidden = null;
    this.surfU.uMirrorOn.value = 0;
    camera.near = 0.2;
    camera.updateProjectionMatrix();
    ui.closeTank && ui.closeTank();
  }
  panelState() {
    const g = this.ctx.game;
    return {
      cap: TANK.cap, smallCap: TANK.smallCap, ...this.tankCount(), maxCm: TANK.maxCm, view: VIEW_NAMES[this.view], stand: this.standLabel(),
      fish: this.save.data.tank.map((e, i) => ({ i, id: e.id, name: SPECIES[e.id] ? SPECIES[e.id].name : e.id, cm: e.cm })),
      kept: (g.keptList || []).map((e, i) => { const sp = SPECIES[e.id]; const r = this.canAdd(sp, e.cm); return { i, id: e.id, name: sp ? sp.name : e.id, cm: e.cm, ok: r.ok, why: r.msg || '' }; }),
    };
  }
  refreshPanel() { if (this.active && this.ctx.ui.renderTank) this.ctx.ui.renderTank(this.panelState()); }
  release(i) {
    const e = this.remove(i);
    if (e) this.ctx.ui.toast(`${SPECIES[e.id] ? SPECIES[e.id].name : '魚'}を、海へ帰した`, 'info', 2000);
    this.refreshPanel();
  }
  fromCreel(i) {
    const g = this.ctx.game;
    const e = g.keptList[i];
    if (!e) return;
    const r = this.add(e.id, e.cm);
    if (!r.ok) { this.ctx.ui.toast(r.msg, 'info', 2200); return; }
    g.keptList.splice(i, 1);
    this.ctx.ui.setKept(g.keptList.length);
    this.ctx.ui.toast(`${SPECIES[e.id].name}を水槽に入れた`, 'info', 1800);
    this.refreshPanel();
  }

  updateCamera(dt) {
    const { camera } = this.ctx;
    const s = this.camS, g = this.goal;
    this.idleT = (this.idleT || 0) + dt;
    const k = 1 - Math.exp(-dt * 4);
    for (const key of ['yaw', 'pitch', 'dist', 'fov', 'tx', 'ty']) s[key] += (g[key] - s[key]) * k;
    const o = this.tank.getWorldPosition(this._v[3]);
    const T = this._t || (this._t = V3(0, 0, 0));
    T.set(o.x + s.tx, o.y + Y0 + s.ty, o.z);
    // 縦長の画面（スマホ）では、少し引いて画角を広げ、水槽の幅が入るように。
    // 写真の構図を決めているときは、写真の形（photoFit.asp）に合わせて水槽が大きく入るように寄り、
    // 画面では枠のまわりを広げて見せる（枠の中が、そのまま写真になる）
    const pf = this.photoFit;
    const asp = pf ? pf.asp : camera.aspect || 1.6;
    const port = asp < 1 ? 1 - asp : 0;
    const dist = s.dist * (1 + port * 0.75);
    const cp = Math.cos(s.pitch);
    camera.position.set(T.x + Math.sin(s.yaw) * cp * dist, T.y + Math.sin(s.pitch) * dist, T.z + Math.cos(s.yaw) * cp * dist);
    // 地面より下、水槽の中には入らない
    camera.position.y = Math.max(camera.position.y, baseHeight(camera.position.x, camera.position.z) + this.land.position.y + 0.25);
    // ゆっくり呼吸するような、ごくわずかな手ぶれ
    camera.position.x += Math.sin(this.pumpT * 0.37) * 0.003;
    camera.position.y += Math.sin(this.pumpT * 0.53) * 0.002;
    camera.lookAt(T);
    camera.fov = s.fov * (1 + port * 1.0);
    if (pf) camera.fov = widenFov(camera.fov, pf.k);
    camera.near = 0.05;
    camera.updateProjectionMatrix();
  }

  // 水面の裏の鏡（全反射）: 水の中のものだけを、水面で折り返したカメラから描く
  renderMirror(renderer, scene, camera) {
    const M = this.mirror, U = this.surfU;
    U.uMirrorOn.value = 0;
    U.uRefrOn.value = 0;
    if (!this.active) return;
    const yS = G.uTankMax.value.y;
    if (!M.lightsDone) { scene.traverse((o) => { if (o.isLight) o.layers.enable(TANK_LAYER); }); M.lightsDone = true; }
    if (camera.position.y > yS + 0.002) { this.renderRefr(renderer, scene, camera); return; }
    if (camera.position.y > yS - 0.002) return;
    const w = Math.max(64, renderer.domElement.width >> 1), h = Math.max(64, renderer.domElement.height >> 1);
    if (!M.rt || M.rt.width !== w || M.rt.height !== h) {
      if (M.rt) M.rt.dispose();
      M.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    }
    const vc = M.cam;
    camera.updateMatrixWorld();
    const cp = this._v[0].setFromMatrixPosition(camera.matrixWorld);
    const rot = this._rot || (this._rot = new THREE.Matrix4());
    rot.extractRotation(camera.matrixWorld);
    const look = this._v[1].set(0, 0, -1).applyMatrix4(rot).add(cp);
    vc.position.set(cp.x, 2 * yS - cp.y, cp.z);
    vc.up.set(0, 1, 0).applyMatrix4(rot);
    vc.up.y *= -1;
    vc.lookAt(look.x, 2 * yS - look.y, look.z);
    vc.fov = camera.fov; vc.aspect = camera.aspect; vc.near = 0.05; vc.far = 20;
    vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
    M.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    M.texMat.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    const prevRT = renderer.getRenderTarget();
    const nu = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    const cc = this._cc || (this._cc = new THREE.Color());
    renderer.getClearColor(cc);
    const ca = renderer.getClearAlpha();
    // 鏡の奥（後ろのガラスの向こう）は、外の明るさをぼんやりと。
    // 反射した光は下向きに後ろのガラスを抜けて浜の地面を見るうえ、長い水の道のりで赤みが消えるので、
    // 夕焼けの色（地平線の色あい）は使わず、明るさだけを水の青みで。毎フレーム、いまの明るさで計算する
    const hz = this.atm.u.uHorizon.value, wc = G.uTankWater.value;
    const lum = (0.2126 * hz.r + 0.7152 * hz.g + 0.0722 * hz.b) * 0.42;
    const bg = this._wc || (this._wc = new THREE.Color());
    bg.setRGB(lum * 0.78 + wc.r * 0.15, lum * 0.93 + wc.g * 0.2 + 0.01, lum * 1.1 + wc.b * 0.2 + 0.015);
    renderer.setClearColor(bg, 1);
    renderer.setRenderTarget(M.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(cc, ca);
    renderer.shadowMap.needsUpdate = nu;
    U.uMirror.value = M.rt.texture;
    U.uMirrorOn.value = 1;
  }
  // 上から見るとき: 水槽の中だけを、同じカメラで描いておく（水面のゆらぎでずらして見せる）
  renderRefr(renderer, scene, camera) {
    const U = this.surfU, R = this.refr || (this.refr = { rt: null });
    const sz = renderer.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2()));
    const w = Math.max(64, Math.round(sz.x * 0.5)), h = Math.max(64, Math.round(sz.y * 0.5));
    if (!R.rt || R.rt.width !== w || R.rt.height !== h) {
      if (R.rt) R.rt.dispose();
      R.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    }
    const prevRT = renderer.getRenderTarget();
    const nu = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    const cc = this._cc || (this._cc = new THREE.Color());
    renderer.getClearColor(cc);
    const ca = renderer.getClearAlpha();
    const mask = camera.layers.mask;
    camera.layers.set(TANK_LAYER);
    const vol = this.inner.getObjectByName('tankVolume');
    vol.visible = false; this.particles.visible = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(R.rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevRT);
    vol.visible = true; this.particles.visible = true;
    camera.layers.mask = mask;
    renderer.setClearColor(cc, ca);
    renderer.shadowMap.needsUpdate = nu;
    U.uRefr.value = R.rt.texture;
    U.uRefrOn.value = 1;
    U.uRes.value.copy(sz);
    U.uProj.value.copy(camera.projectionMatrix);
  }
}

// 見る位置（水槽の正面を 0、左右に回す角度・見上げ/見下ろし・距離・画角・注視点のずれ）
const VIEWS = {
  front: { yaw: 0, pitch: 0.02, dist: 2.45, fov: 36, tx: 0, ty: 0.3 },
  diag: { yaw: 0.72, pitch: 0.12, dist: 2.6, fov: 38, tx: 0, ty: 0.3 },
  low: { yaw: -0.38, pitch: -0.22, dist: 2.5, fov: 42, tx: 0, ty: 0.38 },
  top: { yaw: 0.15, pitch: 0.8, dist: 1.7, fov: 44, tx: 0, ty: 0.22 },
  close: { yaw: -0.2, pitch: -0.03, dist: 1.0, fov: 46, tx: -0.25, ty: 0.26 },
};
const DIRECT_VIEWS = {
  front: { ty: 0.56, pitch: 0.0, dist: 2.6 },
  diag: { ty: 0.3, pitch: 0.2 },
  low: { ty: 0.34, pitch: -0.1 },
};
const VIEW_ORDER = ['front', 'diag', 'low', 'top', 'close'];
const VIEW_NAMES = { front: '正面', diag: 'ななめ', low: '見上げる', top: '上から', close: 'よって見る' };
