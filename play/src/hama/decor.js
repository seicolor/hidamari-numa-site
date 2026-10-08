// ひだまり浜の飾り: サンゴ・ウニ・溶岩の岩・アウトリガーカヌー・流木・ヤシの実
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smoothstep, noise2, fbm2, ridged2, hexToLinear, TAU } from '../util.js';
import { patchMaterial } from '../materials.js';
import { mergeGeos, colorize, colorFlat, M, instancedFrom } from '../geo.js';
import { baseHeight, pondSigned, HEADS, SHORE_Z, nearTank } from './terrain.js';

const C = (h) => hexToLinear(h);
const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const thOf = (x, z) => Math.atan2(x / 40, -(z + 8) / 22);

// 頂点を共有した球（変位させても割れない）
export function blobGeo(detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const map = new Map(), idx = [], out = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!map.has(k)) { map.set(k, out.length / 3); out.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(map.get(k));
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.setIndex(idx);
  ng.computeVertexNormals();
  return ng;
}

// ---------------------------------------------------------------------------
// サンゴ（ハワイの浅い礁に多い種類）
//  ハマサンゴ（Porites lobata）: 黄褐色〜緑がかった、こぶの多い大きな塊
//  ハナヤサイサンゴ（Pocillopora meandrina）: 桃色がかった茶の、カリフラワーのような株
//  コモンサンゴ（Montipora）: 重なる板。茶〜紫
//  ユビエダハマサンゴ（Porites compressa）: 指のような枝が密に立つ
const PAL = {
  lobe: [C(0x9a8650), C(0xb09a5a), C(0x7c8a4c), C(0x8e8a58)],
  cauli: [C(0xc0847a), C(0xd8a094), C(0xa87060), C(0xd0b0a0)],
  plate: [C(0x7a5a78), C(0x9a7450), C(0x6e6a48), C(0x8a6a9a)],
  finger: [C(0xb8a07a), C(0xb4a2cc), C(0xa89474)],
};
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

export function lobeCoral(rng, size) {
  const parts = [];
  const base = pick(rng, PAL.lobe), hi = mixA(base, [0.85, 0.82, 0.62], 0.25);
  const n = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const g = blobGeo(2);
    const a = rng() * TAU, r = i === 0 ? 0 : 0.35 + rng() * 0.4, s = i === 0 ? 0.75 : 0.35 + rng() * 0.35;
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const d = 1 + 0.12 * noise2(x * 3 + i * 7, z * 3 + y * 2) + 0.05 * noise2(x * 9, y * 9 + z * 5);
      p.setXYZ(k, x * d * s, Math.max(y, -0.3) * d * s * 0.75, z * d * s);
    }
    g.translate(Math.cos(a) * r, s * 0.4, Math.sin(a) * r);
    g.computeVertexNormals();
    colorize(g, (x, y, z) => {
      const ao = smoothstep(-0.1, 0.5, y);                     // 根もとは暗く
      const sp = 0.5 + 0.5 * noise2(x * 18, z * 18 + y * 9);  // 細かなポリプのまだら
      return mixA(mixA(base, [0.12, 0.1, 0.07], (1 - ao) * 0.55), hi, ao * 0.35 * sp);
    });
    parts.push(g);
  }
  const g = mergeGeos(parts); g.scale(size, size, size); return g;
}

export function cauliCoral(rng, size) {
  const parts = [];
  const base = pick(rng, PAL.cauli), tip = mixA(base, [1, 0.92, 0.85], 0.45);
  const add = (from, dir, len, rad, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.75, rad, len, 5, 1);
    colorize(g, (x, y) => mixA(mixA(base, [0.15, 0.1, 0.08], 0.4 * (1 - depth / 3)), tip, clamp((y / len + 0.5) * 0.3 + depth * 0.12)));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir));
    const mid = from.clone().addScaledVector(dir, len / 2);
    g.translate(mid.x, mid.y, mid.z);
    parts.push(g);
    const end = from.clone().addScaledVector(dir, len);
    if (depth >= 3) {
      // 枝先の、平たいこぶ（いぼ）
      const k = new THREE.SphereGeometry(rad * 1.35, 6, 5); k.scale(1.2, 0.75, 1.2); k.translate(end.x, end.y, end.z);
      colorize(k, () => tip); parts.push(k);
      return;
    }
    const n = depth === 0 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().add(V3((rng() - 0.5) * 1.3, 0.25 + rng() * 0.4, (rng() - 0.5) * 1.3)).normalize();
      add(end, nd, len * (0.6 + rng() * 0.2), rad * 0.72, depth + 1);
    }
  };
  add(V3(0, 0, 0), V3(0, 1, 0), 0.16, 0.06, 0);
  const g = mergeGeos(parts); g.scale(size * 1.6, size * 1.4, size * 1.6); return g;
}

export function plateCoral(rng, size) {
  const parts = [];
  const base = pick(rng, PAL.plate), edge = mixA(base, [0.9, 0.85, 0.75], 0.5);
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(1, 0.85, 0.05, 28, 1);
    const p = g.attributes.position, s0 = rng() * 50;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), a = Math.atan2(z, x), r = Math.hypot(x, z);
      const kk = 0.75 + 0.3 * noise2(Math.cos(a) * 1.8 + s0, Math.sin(a) * 1.8 + s0);
      const wave = 0.06 * Math.sin(a * 6 + s0) * r;               // ふちが波うつ
      p.setXYZ(k, x * kk, y + wave + 0.08 * r * r, z * kk);
    }
    g.computeVertexNormals();
    colorize(g, (x, y, z) => mixA(base, edge, smoothstep(0.55, 1.0, Math.hypot(x, z)) * 0.8));
    const s = (0.55 + rng() * 0.45) * (1 - i * 0.12);
    g.scale(s, s, s);
    g.rotateX((rng() - 0.5) * 0.4); g.rotateZ((rng() - 0.5) * 0.4);
    g.translate((rng() - 0.5) * 0.5, 0.12 + i * 0.16, (rng() - 0.5) * 0.5);
    parts.push(g);
  }
  const stem = new THREE.CylinderGeometry(0.1, 0.18, 0.5, 6, 1); stem.translate(0, 0.2, 0);
  colorize(stem, () => mixA(base, [0.1, 0.08, 0.06], 0.5)); parts.push(stem);
  const g = mergeGeos(parts); g.scale(size, size, size); return g;
}

export function fingerCoral(rng, size) {
  const parts = [];
  const base = pick(rng, PAL.finger), tip = mixA(base, [1, 0.95, 0.9], 0.4);
  const n = 28 + Math.floor(rng() * 24);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 0.55;
    const h = (0.22 + rng() * 0.28) * (1 - r * 0.6), w = 0.035 + rng() * 0.015;
    const g = new THREE.CapsuleGeometry(w, h, 3, 6);
    g.translate(0, h / 2, 0);
    g.rotateX((rng() - 0.5) * 0.4 * r * 2); g.rotateZ((rng() - 0.5) * 0.4 * r * 2);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    colorize(g, (x, y) => mixA(mixA(base, [0.12, 0.1, 0.08], 0.5), tip, smoothstep(0.0, 0.4, y)));
    parts.push(g);
  }
  const g = mergeGeos(parts); g.scale(size * 1.3, size * 1.3, size * 1.3); return g;
}

// ウニ（ナガウニ）: 黒い長いとげ
export function urchin(rng, size) {
  const parts = [];
  const body = new THREE.SphereGeometry(0.05, 10, 8); body.scale(1, 0.7, 1);
  colorize(body, () => [0.03, 0.02, 0.03]); parts.push(body);
  for (let i = 0; i < 26; i++) {
    const u = rng(), a = rng() * TAU, el = Math.acos(1 - u * 1.4);
    const d = V3(Math.sin(el) * Math.cos(a), Math.cos(el), Math.sin(el) * Math.sin(a));
    const len = 0.16 + rng() * 0.08;
    const g = new THREE.ConeGeometry(0.006, len, 4);
    g.translate(0, len / 2 + 0.03, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d));
    colorize(g, () => [0.04, 0.03, 0.05]); parts.push(g);
  }
  const g = mergeGeos(parts); g.scale(size, size, size); return g;
}

export function buildCoral(parent) {
  const rng = mulberry32(5150);
  const geos = [];
  const place = (g, x, z, rot, lift = 0) => {
    const y = baseHeight(x, z);
    g.computeBoundingBox();
    const hgt = g.boundingBox.max.y;
    const room = -y - 0.4;                                   // 水面まで、少し余裕をのこす
    if (room <= 0.08) return;
    const k = hgt > room ? room / hgt : 1;
    g.applyMatrix4(M(x, y + lift, z, 0, rot, 0, k));
    geos.push(g);
  };
  for (const h of HEADS) {
    // 根の中心には大きなハマサンゴ。まわりに、ほかの種類
    const top = -baseHeight(h.x, h.z);                       // 根のてっぺんの水深
    const lobe = Math.min(h.r * 0.3, (top - 0.5) / 0.95);   // 水面から出ないように
    if (lobe > 0.25) place(lobeCoral(rng, lobe), h.x, h.z, rng() * TAU, -0.15);
    const n = Math.round(h.r * h.r * 2.2);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = (0.35 + Math.sqrt(rng()) * 0.75) * h.r;
      const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      if (pondSigned(x, z) > -4) continue;
      const t = rng(), sz = (0.4 + rng() * 0.55) * (1 - 0.3 * (d / h.r));
      const g = t < 0.3 ? cauliCoral(rng, sz) : t < 0.52 ? plateCoral(rng, sz * 0.9) : t < 0.75 ? fingerCoral(rng, sz) : t < 0.92 ? lobeCoral(rng, sz * 0.6) : urchin(rng, 1 + rng() * 0.4);
      place(g, x, z, rng() * TAU, t < 0.92 ? -0.04 : 0.0);
    }
  }
  // 砂地に点在する、小さなサンゴとウニ
  for (let i = 0; i < 70; i++) {
    const x = (rng() * 2 - 1) * 36, z = -28 + rng() * 34;
    if (pondSigned(x, z) > -5 || baseHeight(x, z) > -0.7) continue;
    if (Math.abs(x) < 3 && z > -2) continue;
    const t = rng();
    const g = t < 0.35 ? cauliCoral(rng, 0.3 + rng() * 0.25) : t < 0.6 ? lobeCoral(rng, 0.25 + rng() * 0.25) : t < 0.8 ? fingerCoral(rng, 0.3 + rng() * 0.2) : urchin(rng, 1);
    place(g, x, z, rng() * TAU, -0.03);
  }
  const geo = mergeGeos(geos);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  patchMaterial(mat, { underwater: true, caustics: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'coral';
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// 溶岩の岩: 角ばった玄武岩。いくつかの形を作っておき、群れにして置く
function lavaRockGeo(seed) {
  const rng = mulberry32(seed);
  const g = blobGeo(3);
  const p = g.attributes.position;
  // 平面で切り落として、角ばらせる
  const cuts = [];
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU, el = (rng() - 0.3) * 1.6;
    cuts.push({ n: V3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)), d: 0.5 + rng() * 0.32 });
  }
  const sx = 0.8 + rng() * 0.5, sy = 0.45 + rng() * 0.35, sz = 0.8 + rng() * 0.5;
  const v = V3(0, 0, 0);
  const onCut = new Array(p.count).fill(null);
  const pit = new Float32Array(p.count);
  for (let k = 0; k < p.count; k++) {
    v.set(p.getX(k), p.getY(k), p.getZ(k));
    const r = 1 + 0.22 * ridged2(v.x * 1.4 + seed, v.z * 1.4 + v.y * 1.1, 3) + 0.08 * noise2(v.x * 6 + seed, v.y * 6 + v.z * 4);
    v.multiplyScalar(r);
    for (const c of cuts) { const dd = v.dot(c.n); if (dd > c.d) { v.addScaledVector(c.n, -(dd - c.d)); onCut[k] = c.n; } }
    // 溶岩の小さな穴（気泡のあと）と、ざらざらの肌
    const q = Math.abs(noise2(v.x * 5 + seed, v.z * 5 + v.y * 4));
    pit[k] = smoothstep(0.12, 0.0, q);
    v.multiplyScalar(1 - 0.04 * pit[k] + 0.02 * noise2(v.x * 8, v.y * 8 + v.z * 7));
    v.y = Math.max(v.y, -0.35);
    p.setXYZ(k, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  // 切り口の面は平らに見せる（法線を面の向きへ寄せる）。角だけが丸い、割れた岩のかたち
  const nn = g.attributes.normal, t3 = V3(0, 0, 0);
  for (let k = 0; k < p.count; k++) {
    const c = onCut[k];
    if (!c) continue;
    t3.set(c.x / sx, c.y / sy, c.z / sz).normalize();
    v.set(nn.getX(k), nn.getY(k), nn.getZ(k)).lerp(t3, 0.65).normalize();
    nn.setXYZ(k, v.x, v.y, v.z);
  }
  // 色: 黒い玄武岩。上の面は風化して明るく、くぼみは暗い。ところどころ赤茶
  const n = g.attributes.normal;
  const basalt = C(0x2a2725), weather = C(0x5f574e), rust = C(0x5a3a2a), salt = C(0x8a8478);
  const col = [];
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k), ny = n.getY(k);
    const f = fbm2(x * 3 + seed, z * 3 + y * 2, 3) * 0.5 + 0.5;
    let c = mixA(basalt, weather, smoothstep(0.2, 0.9, ny) * 0.65 * (0.6 + 0.4 * f));
    c = mixA(c, rust, smoothstep(0.62, 0.8, f) * 0.35);
    c = mixA(c, [0.03, 0.028, 0.026], pit[k] * 0.6);   // 穴の中は暗い
    c = mixA(c, salt, smoothstep(0.85, 0.95, ny) * smoothstep(0.55, 0.75, noise2(x * 9, z * 9) * 0.5 + 0.5) * 0.35);
    c = mixA(c, [0.05, 0.045, 0.04], smoothstep(-0.1, -0.35, y) * 0.5);
    col.push(c[0], c[1], c[2]);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildLavaRocks(parent) {
  const rng = mulberry32(7777);
  const variants = [101, 202, 303, 404, 505, 606].map(lavaRockGeo);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
  patchMaterial(mat, { underwater: true, caustics: true, wet: true });
  const buckets = variants.map(() => ({ mats: [], cols: [] }));
  const add = (x, z, sc, bury = 0.3) => {
    const y = baseHeight(x, z);
    const b = buckets[Math.floor(rng() * variants.length)];
    b.mats.push(M(x, y - sc * bury * 0.6, z, (rng() - 0.5) * 0.4, rng() * TAU, (rng() - 0.5) * 0.4, sc * (0.85 + rng() * 0.4), sc * (0.8 + rng() * 0.5), sc * (0.85 + rng() * 0.4)));
    const t = 0.85 + rng() * 0.3;
    b.cols.push(new THREE.Color(t, t * (0.97 + rng() * 0.05), t * 0.95));
  };
  // 群れ: 大きな岩のまわりに、小さな岩
  const cluster = (x, z, big) => {
    add(x, z, big, 0.35);
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = big * (0.7 + rng() * 0.9);
      add(x + Math.cos(a) * d, z + Math.sin(a) * d, big * (0.2 + rng() * 0.45), 0.3);
    }
  };
  let n = 0, guard = 0;
  while (n < 90 && guard++ < 9000) {
    const x = (rng() * 2 - 1) * 130, z = -64 + rng() * 104;
    const s = pondSigned(x, z), th = thOf(x, z);
    const side = Math.abs(th) > 0.8 && Math.abs(th) < 2.25;
    if (!(side && s > -2.5 && s < 30)) continue;
    // 岸ぎわほど多く、大きい
    if (rng() > 0.9 - 0.6 * smoothstep(0, 22, s)) continue;
    const big = 0.5 + Math.pow(rng(), 2) * (s < 6 ? 2.6 : 1.6);
    cluster(x, z, big);
    n++;
  }
  // リーフのふちに、顔を出す黒い岩
  for (let i = 0; i < 26; i++) {
    const a = (rng() * 2 - 1) * 0.95, r = 1.0 + 0.04 * rng();
    const x = Math.sin(a) * 40 * r, z = -8 - Math.cos(a) * 22 * r;
    if (rng() < 0.5) cluster(x + (rng() - 0.5) * 3, z + (rng() - 0.5) * 3, 0.5 + rng() * 0.9);
    else add(x + (rng() - 0.5) * 3, z + (rng() - 0.5) * 3, 0.4 + rng() * 0.9);
  }
  const meshes = [];
  variants.forEach((g, i) => {
    if (!buckets[i].mats.length) return;
    const m = instancedFrom(g, mat, buckets[i].mats, buckets[i].cols);
    m.castShadow = true; m.receiveShadow = true; m.name = 'lava';
    parent.add(m); meshes.push(m);
  });
  return meshes;
}

// ---------------------------------------------------------------------------
// アウトリガーカヌー（ワア）: コア材の船体、反りあがる舳先の飾り板（マヌ）、2本の腕木（イアコ）、浮き木（アマ）
export function buildCanoe(parent, x, z, rotY) {
  const g = new THREE.Group();
  const L = 6.2, W = 0.34, D = 0.5;
  const koa = C(0x5a2e1a), koaL = C(0x8a4a26), black = C(0x161312), rope = C(0xb8a07a), cream = C(0xe8e0cc);
  // 船体: 断面がU字の殻。外側は黒く塗られ、上の板はコア材
  const N = 48, R = 14, pos = [], col = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, xx = (t - 0.5) * L, e = Math.abs(2 * t - 1);
    const w = W * Math.pow(1 - Math.pow(e, 2.4), 0.55) + 0.004;
    const d = D * Math.pow(1 - Math.pow(e, 3.2), 0.6) * 0.9 + 0.02;
    const sheer = 0.16 * Math.pow(e, 2.6);               // 両端が反りあがる
    for (let j = 0; j <= R; j++) {
      const a = Math.PI * (j / R);                       // 0=左のふち → π=右のふち
      const cy = -Math.sin(a) * d + sheer, cz = Math.cos(a) * w * (0.75 + 0.25 * Math.sin(a));
      pos.push(xx, cy, cz);
      const grain = 0.5 + 0.5 * Math.sin(xx * 9 + Math.sin(xx * 3) * 2 + cy * 30);
      const c = cy > sheer - d * 0.22 ? mixA(koa, koaL, grain * 0.6) : black;
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = a + 1, c = a + R + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const hullG = new THREE.BufferGeometry();
  hullG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullG.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hullG.setIndex(idx); hullG.computeVertexNormals();
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0, side: THREE.DoubleSide });
  patchMaterial(wood, { underwater: true });
  g.add(new THREE.Mesh(hullG, wood));
  const parts = [];
  const box = (w, h, d, px, py, pz, c, ry = 0, rz = 0) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateZ(rz); b.rotateY(ry); b.translate(px, py, pz); colorize(b, () => c); parts.push(b); };
  const rod = (pts, r, c, seg = 10) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)));
    const t = new THREE.TubeGeometry(curve, seg, r, 6, false);
    colorize(t, () => c); parts.push(t);
  };
  // ふちの木（モオ）
  for (const sg of [1, -1]) rod(Array.from({ length: 9 }, (_, k) => { const t = k / 8, e = Math.abs(2 * t - 1); return [(t - 0.5) * L * 0.96, 0.16 * Math.pow(e, 2.6) + 0.01, sg * (W * Math.pow(1 - Math.pow(e, 2.4), 0.55) * 0.98 + 0.01)]; }), 0.025, koaL, 24);
  // 舳先と艫の飾り板（マヌ）
  for (const sg of [1, -1]) {
    const mx = sg * L * 0.44;
    const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.18 * sg, 0.1, 0.32 * sg, 0.34); s.lineTo(0.26 * sg, 0.36); s.quadraticCurveTo(0.1 * sg, 0.12, -0.08 * sg, 0.04); s.lineTo(0, 0);
    const mg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
    mg.translate(mx, 0.14, -0.015);
    colorize(mg, () => koaL); parts.push(mg);
  }
  // 腰かけ板
  for (const px of [-1.6, -0.2, 1.3]) box(0.16, 0.025, W * 1.5, px, -0.04, 0, koaL);
  // 腕木（イアコ）: 船体から浮き木へ、ゆるく曲がって下がる
  const amaZ = -1.9;
  for (const px of [-1.0, 1.15]) rod([[px, 0.06, 0.32], [px, 0.12, -0.3], [px, 0.02, -1.1], [px, -0.2, amaZ + 0.1]], 0.035, koaL);
  // 浮き木（アマ）: 細長い丸太。前が少し上を向く
  const ama = new THREE.CapsuleGeometry(0.09, 3.4, 4, 10); ama.rotateZ(Math.PI / 2); ama.translate(0.2, -0.36, amaZ);
  const ap = ama.attributes.position; for (let k = 0; k < ap.count; k++) { const xx = ap.getX(k); if (xx > 1.2) ap.setY(k, ap.getY(k) + (xx - 1.2) * 0.12); }
  ama.computeVertexNormals(); colorize(ama, () => mixA(cream, koaL, 0.2)); parts.push(ama);
  // 腕木と浮き木をつなぐ棒（キアト）とくくり縄
  for (const px of [-1.0, 1.15]) {
    for (const dz of [-0.08, 0.08]) rod([[px + dz, -0.2, amaZ + 0.06], [px + dz * 1.4, -0.32, amaZ]], 0.015, koaL, 3);
    box(0.08, 0.06, 0.08, px, 0.1, 0.33, rope); box(0.08, 0.05, 0.08, px, -0.2, amaZ + 0.1, rope);
  }
  // パドル（ホエ）: 葉の形の刃
  for (const [px, ry] of [[-0.5, 0.12], [0.6, -0.08]]) {
    rod([[px - 0.7, 0.0, 0.05], [px + 0.5, 0.02, 0.0]], 0.016, koaL, 3);
    const bl = new THREE.SphereGeometry(1, 12, 6); bl.scale(0.28, 0.012, 0.1); bl.translate(px + 0.75, 0.02, 0.0); bl.rotateY(ry);
    colorize(bl, () => koa); parts.push(bl);
  }
  const extra = new THREE.Mesh(mergeGeos(parts), wood);
  g.add(extra);
  // 砂の上の、転がし用の丸太
  const logM = new THREE.MeshStandardMaterial({ color: 0x7a6c58, roughness: 0.95 });
  patchMaterial(logM, { underwater: true, detail: 'wood' });
  for (const px of [-1.5, 1.6]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.6, 9), logM); l.rotation.x = Math.PI / 2; l.rotation.y = (px > 0 ? 0.1 : -0.12); l.position.set(px, -0.44, -0.75); g.add(l); }
  const y = baseHeight(x, z);
  g.position.set(x, y + 0.48, z);
  g.rotation.y = rotY;
  g.rotation.z = 0.035;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// 浜の小物: 白くさらされた流木、落ちたヤシの実、満潮線にたまった海藻
export function buildBeachBits(parent, palms = []) {
  const rng = mulberry32(3131);
  const parts = [];
  const drift = C(0xb3aa98), driftD = C(0x7e7566);
  // 流木
  let n = 0, guard = 0;
  while (n < 9 && guard++ < 2000) {
    const x = (rng() * 2 - 1) * 45, z = SHORE_Z - 8 + rng() * 22;
    const s = pondSigned(x, z);
    if (s < 1.8 || s > 9 || Math.abs(thOf(x, z)) < 1.5) continue;
    if (Math.abs(x) < 4 && z > SHORE_Z - 3) continue;
    if (nearTank(x, z, 2)) continue;
    const a = rng() * TAU, len = 1.2 + rng() * 2.6, r = 0.07 + rng() * 0.1;
    const pts = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4 - 0.5; const px = x + Math.cos(a) * len * t, pz = z + Math.sin(a) * len * t; pts.push(V3(px + (rng() - 0.5) * 0.15, baseHeight(px, pz) + r * 0.6, pz + (rng() - 0.5) * 0.15)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, r, 7, false);
    colorize(tg, (px, py, pz) => mixA(drift, driftD, 0.5 + 0.5 * Math.sin(px * 13 + pz * 11 + py * 40)));
    parts.push(tg);
    // 枝わかれ
    if (rng() < 0.6) {
      const p0 = pts[3], b = a + (rng() - 0.5) * 1.6;
      const p1 = V3(p0.x + Math.cos(b) * 0.8, p0.y + 0.15, p0.z + Math.sin(b) * 0.8);
      const bg = new THREE.TubeGeometry(new THREE.LineCurve3(p0, p1), 3, r * 0.45, 5, false);
      colorize(bg, () => drift); parts.push(bg);
    }
    n++;
  }
  // ヤシの実（木の下に、いくつか）
  for (const [px, pz] of palms) {
    const k = Math.floor(rng() * 4);
    for (let i = 0; i < k; i++) {
      const a = rng() * TAU, d = 0.6 + rng() * 2.2, x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const g = new THREE.SphereGeometry(0.15, 9, 7); g.scale(1.15, 0.9, 1);
      const c = rng() < 0.5 ? C(0x6a4a26) : rng() < 0.5 ? C(0x7f6a3a) : C(0x6c7a2a);
      colorize(g, () => c);
      g.rotateY(rng() * TAU); g.translate(x, baseHeight(x, z) + 0.1, z);
      parts.push(g);
    }
  }
  // 満潮線の海藻（砂の上に、こげ茶のすじ）
  const weed = C(0x3a3020), weed2 = C(0x5a4a24);
  for (let i = 0; i < 160; i++) {
    const x = (rng() * 2 - 1) * 34, z = SHORE_Z - 10 + rng() * 14;
    const s = pondSigned(x, z);
    if (s < 1.6 || s > 3.0 || Math.abs(thOf(x, z)) < 1.9) continue;
    const g = new THREE.CircleGeometry(0.08 + rng() * 0.12, 6); g.rotateX(-Math.PI / 2); g.scale(1 + rng() * 1.5, 1, 0.5 + rng() * 0.6); g.rotateY(rng() * TAU);
    g.translate(x, baseHeight(x, z) + 0.012, z);
    colorize(g, () => (rng() < 0.5 ? weed : weed2)); parts.push(g);
  }
  if (!parts.length) return null;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  patchMaterial(mat, { underwater: true, detail: 'wood' });
  const m = new THREE.Mesh(mergeGeos(parts), mat);
  m.castShadow = true; m.receiveShadow = true; m.name = 'beach-bits';
  parent.add(m);
  return m;
}
