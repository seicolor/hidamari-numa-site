// 地形：山間の小さな沼。極座標グリッドで、沼の周りは細かく遠くの山並みは粗く。
import { SEASON } from './season.js';
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm2, noise2, ridged2, hexToLinear, hash2 } from '../util.js';
import { patchMaterial } from '../materials.js';

export const POND_STRETCH = 1.32;

export function pondRadius(phi) {
  return (
    21 +
    3.2 * Math.sin(2 * phi + 1.1) +
    2.0 * Math.sin(3 * phi + 0.3) +
    1.2 * Math.sin(5 * phi + 2.0) +
    0.8 * Math.sin(7 * phi + 0.7)
  );
}

// 負: 沼の内側(m)、正: 岸の外側
export function pondSigned(x, z) {
  const px = x / POND_STRETCH;
  const r = Math.hypot(px, z);
  const phi = Math.atan2(z, px);
  return (r - pondRadius(phi)) * 1.14;
}

// 南の岸（桟橋側）の位置を探す
export const SHORE_Z = (() => {
  let z = 0;
  for (; z < 80; z += 0.05) if (pondSigned(0, z) > 0) break;
  return z;
})();

export const HOUSE = { x: 34, z: -48, y: 0, r: 13, platform: 3.4 };
export const FIELD = { x: 12, z: -50, r: 15 };

// 小道（ポリライン）
export const PATH = [
  [-2, SHORE_Z + 40],
  [0, SHORE_Z + 22],
  [1.5, SHORE_Z + 6],
  [9, SHORE_Z + 3],
  [24, SHORE_Z - 3],
  [44, SHORE_Z - 16],
  [52, -8],
  [52, -28],
  [46, -40],
  [HOUSE.x + 6, HOUSE.z + 9],
];

export function pathDistance(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const NOTCH_TH = -0.18; // 谷の開口方向（北からのずれ）

function mountainHeight(x, z) {
  const rr = Math.hypot(x, z);
  const th = Math.atan2(x, -z); // 北=0
  // 手前の里山 〜 奥の山並み
  const near = smoothstep(52, 150, rr);
  const mid = smoothstep(160, 520, rr);
  const far = smoothstep(420, 1500, rr);
  const side = 0.4 + 0.75 * smoothstep(0.2, 1.4, Math.abs(angDiff(th, NOTCH_TH)));
  const back = smoothstep(0.0, 1.0, Math.abs(th) / Math.PI);
  const ridge = 0.55 * ridged2(x * 0.0030 + 11.3, z * 0.0030 - 4.7, 3) + 0.45 * (fbm2(x * 0.004, z * 0.004, 3) * 0.5 + 0.5);
  const rough = fbm2(x * 0.011, z * 0.011, 4) * 0.5 + 0.5;
  const rough2 = fbm2(x * 0.045 + 3.0, z * 0.045 + 9.0, 3) * 0.5 + 0.5;
  let h = near * (12 + 18 * rough) * (0.5 + 0.5 * side);
  h += mid * (40 + 110 * ridge) * side * (0.8 + 0.4 * back);
  h += far * (80 + 240 * ridge) * (0.55 + 0.6 * side);
  h += near * rough2 * 5.0;
  return h;
}

const BASIN_DEPTH = 2.5;

export function terrainHeight(x, z) {
  const s = pondSigned(x, z);
  let h;
  if (s < 0) {
    const u = clamp(-s / 14.5);
    const prof = u * u * (3 - 2 * u);
    h = -BASIN_DEPTH * prof;
    // 底の凹凸と、中央の少し深い所
    h -= 0.32 * (fbm2(x * 0.16 + 5, z * 0.16, 3) * 0.5 + 0.5) * smoothstep(0.1, 0.5, u);
    h -= 0.35 * Math.exp(-((x + 5) * (x + 5) + (z + 3) * (z + 3)) / 90) * smoothstep(0.1, 0.6, u);
  } else {
    h = 0.5 * (1 - Math.exp(-s / 2.0));
    // 岸のなだらかな起伏
    h += (fbm2(x * 0.045, z * 0.045, 4) * 0.5 + 0.5) * 1.2 * smoothstep(0, 14, s);
    h += fbm2(x * 0.22 + 7, z * 0.22, 2) * 0.12 * smoothstep(1, 4, s);
    h += mountainHeight(x, z) * smoothstep(0, 30, s);
    // 母屋の敷地（平坦に均す）
    const dh = Math.hypot(x - HOUSE.x, z - HOUSE.z);
    h = lerp(h, HOUSE.platform + fbm2(x * 0.05, z * 0.05, 2) * 0.12, smoothstep(HOUSE.r + 14, HOUSE.r, dh));
    // 小道は少しへこむ
    const pd = pathDistance(x, z);
    h -= 0.06 * smoothstep(1.8, 0.4, pd);
    h = Math.max(h, 0.02 + 0.02 * smoothstep(0, 1.5, s));
  }
  return h;
}

export function waterDepthAt(x, z) {
  return Math.max(0, -terrainHeight(x, z));
}

// ---------------------------------------------------------------------------
const C = (hex) => hexToLinear(hex);
const G0 = SEASON.ground;   // 季節ごとの草地・森の色
const COL = {
  grassA: C(G0.grassA), grassB: C(G0.grassB), grassC: C(G0.grassC), grassDry: C(G0.grassDry),
  mud: C(G0.mud), mudWet: C(0x3a3022), bed: C(0x3d3524), dirt: C(0xa28b60), dirtDark: C(0x7a6644),
  cedar: C(G0.cedar), cedarB: C(G0.cedarB), oakY: C(G0.oakY), oakR: C(G0.oakR), oakG: C(G0.oakG),
  rock: C(0x78726a), rockDark: C(0x4a463f), soilHill: C(0x6a5a3a),
};

function mix3(a, b, t, o) {
  o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t);
}

function terrainColor(x, z, h, ny, s, out) {
  const rr = Math.hypot(x, z);
  const n1 = fbm2(x * 0.02 + 40, z * 0.02, 3) * 0.5 + 0.5;
  const n2 = fbm2(x * 0.09, z * 0.09 + 20, 3) * 0.5 + 0.5;
  const n3 = fbm2(x * 0.005 + 70, z * 0.005 + 31, 3) * 0.5 + 0.5;
  // 草原
  let c = [0, 0, 0];
  mix3(COL.grassA, COL.grassB, n1, c);
  mix3(c, COL.grassC, smoothstep(0.5, 0.9, n2) * 0.7, c);
  mix3(c, COL.grassDry, smoothstep(0.55, 0.85, n3) * 0.5, c);
  // 山の森
  const forest = smoothstep(55, 120, rr) * smoothstep(0, 4, s);
  const decid = smoothstep(0.42, 0.62, n3 + n2 * 0.25);
  let fc = [0, 0, 0];
  mix3(COL.cedar, COL.cedarB, n2, fc);
  let leaf = [0, 0, 0];
  mix3(COL.oakG, COL.oakY, smoothstep(0.3, 0.6, n1), leaf);
  mix3(leaf, COL.oakR, smoothstep(0.55, 0.8, n2 * 0.5 + n1 * 0.6), leaf);
  mix3(fc, leaf, decid * 0.7, fc);
  mix3(c, fc, forest, c);
  // 急斜面は岩・土
  const slope = 1 - ny;
  const rockT = smoothstep(0.28, 0.5, slope) * smoothstep(60, 140, rr);
  mix3(c, COL.rock, rockT * 0.8, c);
  // 高所は少しくすむ
  mix3(c, COL.rockDark, smoothstep(180, 420, h) * 0.45, c);
  // 岸の泥
  const mudT = smoothstep(2.6, 0.2, s) * smoothstep(-1, 0.2, s);
  mix3(c, COL.mud, mudT * 0.85, c);
  // 水中
  if (s < 0.4) {
    const deep = smoothstep(0, -6, s);
    let m = [0, 0, 0];
    mix3(COL.mud, COL.bed, deep, m);
    mix3(c, m, smoothstep(0.4, -0.3, s), c);
  }
  // 小道
  const pd = pathDistance(x, z);
  const pt = smoothstep(2.4, 0.7, pd) * smoothstep(0.5, 2.0, s);
  let pc = [0, 0, 0];
  mix3(COL.dirt, COL.dirtDark, n2, pc);
  mix3(c, pc, pt * 0.92, c);
  // 母屋まわりの土
  const dh = Math.hypot(x - HOUSE.x, z - HOUSE.z);
  const yard = smoothstep(11, 6, dh);
  mix3(c, COL.dirt, yard * 0.65, c);
  // 刈り取り後の田んぼ（稲株の黄金色）
  const df = Math.hypot((x - FIELD.x) * 0.8, z - FIELD.z);
  const field = smoothstep(FIELD.r, FIELD.r - 3, df) * smoothstep(0.5, 3, s);
  let fc2 = [0, 0, 0];
  mix3(COL.grassDry, C(G0.field), n2, fc2);
  mix3(c, fc2, field * 0.9, c);
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

export function buildTerrain() {
  const nA = 384, nR = 236;
  const rMax = 1900;
  const a0 = 0.3;
  // 幾何級数の公比 g を二分法で求める
  let lo = 1.0001, hi = 1.1;
  for (let it = 0; it < 60; it++) {
    const g = (lo + hi) / 2;
    const rr = (a0 * (Math.pow(g, nR) - 1)) / (g - 1);
    if (rr > rMax) hi = g; else lo = g;
  }
  const g = (lo + hi) / 2;
  const radii = new Float32Array(nR + 1);
  for (let j = 0; j <= nR; j++) radii[j] = j === 0 ? 0 : (a0 * (Math.pow(g, j) - 1)) / (g - 1);

  const stride = nA + 1;
  const vCount = stride * (nR + 1);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const hts = new Float32Array(vCount);
  for (let j = 0; j <= nR; j++) {
    for (let i = 0; i <= nA; i++) {
      const th = ((i % nA) / nA) * Math.PI * 2;
      const r = radii[j];
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const h = terrainHeight(x, z);
      const k = j * stride + i;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      hts[k] = h;
    }
  }
  const idx = (i, j) => j * stride + ((i + nA) % nA);
  const tmp = [0, 0, 0];
  for (let j = 0; j <= nR; j++) {
    for (let i = 0; i <= nA; i++) {
      const k = j * stride + i;
      let nx = 0, ny = 1, nz = 0;
      if (j > 0) {
        const j0 = j - 1, j1 = Math.min(nR, j + 1);
        const a = idx(i - 1, j), b = idx(i + 1, j), c = idx(i, j0), d = idx(i, j1);
        const tx = pos[b * 3] - pos[a * 3], ty = pos[b * 3 + 1] - pos[a * 3 + 1], tz = pos[b * 3 + 2] - pos[a * 3 + 2];
        const rx = pos[d * 3] - pos[c * 3], ry = pos[d * 3 + 1] - pos[c * 3 + 1], rz = pos[d * 3 + 2] - pos[c * 3 + 2];
        nx = ty * rz - tz * ry; ny = tz * rx - tx * rz; nz = tx * ry - ty * rx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
      }
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      const x = pos[k * 3], z = pos[k * 3 + 2];
      terrainColor(x, z, hts[k], ny, pondSigned(x, z), tmp);
      col[k * 3] = tmp[0]; col[k * 3 + 1] = tmp[1]; col[k * 3 + 2] = tmp[2];
    }
  }
  const index = new Uint32Array(nA * nR * 6);
  let p = 0;
  for (let j = 0; j < nR; j++) {
    for (let i = 0; i < nA; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      index[p++] = a; index[p++] = b; index[p++] = c;
      index[p++] = b; index[p++] = d; index[p++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  patchMaterial(mat, { underwater: true, detail: 'terrain' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.frustumCulled = false;
  return mesh;
}

// 水面シェーダが水深を読むためのテクスチャ（half float）
export const DEPTH_WIN = { x0: -46, z0: -36, w: 92, h: 72 };

export function buildDepthTexture(nx = 256, nz = 200) {
  const data = new Uint16Array(nx * nz * 4);
  const { x0, z0, w, h } = DEPTH_WIN;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((i + 0.5) / nx) * w;
      const z = z0 + ((j + 0.5) / nz) * h;
      const hgt = terrainHeight(x, z);
      const d = Math.max(0, -hgt);
      const k = (j * nx + i) * 4;
      data[k] = THREE.DataUtils.toHalfFloat(d);
      data[k + 1] = THREE.DataUtils.toHalfFloat(clamp(-pondSigned(x, z) / 10, -1, 1) * 0.5 + 0.5);
      data[k + 2] = 0;
      data[k + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
