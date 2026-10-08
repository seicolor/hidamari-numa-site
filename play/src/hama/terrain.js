// 地形（ひだまり浜）: ハワイの小さな入り江。
//  南（手前）が白い砂浜、東西が溶岩の岬、北が外洋に向かってひらき、沖にはサンゴ礁のふち（リーフ）。
//  座標は沼と同じ: 桟橋は南の岸に立ち、北（-z）を向く。入り江（遊べる水域）は pondSigned < 0 の楕円。
//  潮: 陸（地面と飾り）を上下にずらして表す。海面は常に y=0。terrainHeight は潮ぶんを引いた高さ。
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm2, noise2, ridged2, hexToLinear, mulberry32 } from '../util.js';
import { patchMaterial } from '../materials.js';

// 入り江の楕円（中心・半径）
const CX = 0, CZ = -8, A = 40, B = 22;
const outline = (th) => 1 + 0.04 * Math.sin(3 * th + 0.8) + 0.025 * Math.sin(5 * th + 2.0) + 0.012 * Math.sin(9 * th);

// 入り江の内側が負、外側が正（ほぼメートル）
// 砂浜の水槽の場所（まわりと、正面から眺める場所には、草木を生やさない）
export const TANK_SITE = { x: 10, z: 17.6 };
export function nearTank(x, z, m = 0) {
  return x > TANK_SITE.x - 2.4 - m && x < TANK_SITE.x + 2.4 + m && z > TANK_SITE.z - 1.3 - m && z < TANK_SITE.z + 3.8 + m;
}

export function pondSigned(x, z) {
  const nx = (x - CX) / A, nz = (z - CZ) / B;
  const rn = Math.hypot(nx, nz);
  if (rn < 1e-4) return -A * 0.9;
  const th = Math.atan2(nx, -nz);
  const ed = outline(th);
  const metric = 1 / Math.hypot(nx / rn / A, nz / rn / B);
  return (rn - ed) * metric;
}

// 南の岸（桟橋側）の位置
export const SHORE_Z = (() => {
  let z = CZ;
  for (; z < 80; z += 0.05) if (pondSigned(0, z) > 0) break;
  return z;
})();

// 共通コードが参照する沼の名残り（ここには母屋も田んぼも小道もない）
export const HOUSE = { x: 1e4, z: 1e4, y: 0, r: 1, platform: 0 };
export const FIELD = { x: 1e4, z: 1e4, r: 1 };
export const PATH = [[1e4, 1e4], [1e4, 1e4 + 1]];
export const pathDistance = () => 1e9;

// ---------------------------------------------------------------------------
// 潮（m）。正が満ち潮。陸が下がることで表す
export const TIDE = { level: 0, rate: 0, amp: 0.42 };   // rate: -1（ひく）〜 +1（みちる）
export function setTide(v, rate = TIDE.rate) { TIDE.level = v; TIDE.rate = rate; }

// サンゴの根（水中のこぶ）: 位置・広がり・高さ
export const HEADS = (() => {
  const rng = mulberry32(2718);
  // 桟橋のまえには、見ごたえのあるサンゴの根を3つ（礁の魚がここにすみつく）
  const list = [
    { x: -8.5, z: -1.2, r: 3.0, h: 1.0, kind: 0, seed: 11 },
    { x: 8.2, z: -3.4, r: 3.4, h: 1.15, kind: 1, seed: 22 },
    { x: -2.8, z: -9.0, r: 3.8, h: 1.25, kind: 2, seed: 33 },
  ];
  let guard = 0;
  while (list.length < 26 && guard++ < 600) {
    const x = (rng() * 2 - 1) * 33, z = -27 + rng() * 33;
    if (pondSigned(x, z) > -6) continue;
    if (Math.abs(x) < 3.2 && z > -2) continue;             // 桟橋の正面は、すっきりと
    if (list.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + 4.5)) continue;
    const r = 2.0 + rng() * 3.4;
    list.push({ x, z, r, h: 0.55 + rng() * 1.0, kind: Math.floor(rng() * 3), seed: Math.floor(rng() * 1e6) });
  }
  return list;
})();

// 海ぞこの、ざっくりとした波形（砂紋）と、サンゴの根
function headsAt(x, z) {
  let h = 0;
  for (let i = 0; i < HEADS.length; i++) {
    const c = HEADS[i];
    const dx = x - c.x, dz = z - c.z, rr = c.r * 1.7;
    if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
    const q = (dx * dx + dz * dz) / (c.r * c.r);
    if (q > 3) continue;
    h += c.h * Math.exp(-q * 1.5);
  }
  return h;
}

// 北寄り・東西寄りの重み（th: 北が0、東が +π/2）
const wNorth = (th) => smoothstep(1.0, 0.55, Math.abs(th));
const wEast = (th) => smoothstep(0.55, 0.0, Math.abs(Math.abs(th) - Math.PI / 2) - 0.55);
// 陸になる範囲: 北の開口（±約55°）の外側
function landW(th, s) {
  const j = 0.16 * noise2(s * 0.018 + (th > 0 ? 3.1 : 9.7), 1.7);
  return smoothstep(0.86 + j, 1.12 + j, Math.abs(th));
}
// 溶岩の岬（東西）か、砂浜（南）か
const wLava = (th) => smoothstep(2.28, 1.78, Math.abs(th));

// 遠くの山（南・東西の奥）
function mountainHeight(x, z) {
  const rr = Math.hypot(x, z);
  const near = smoothstep(60, 170, rr);
  const mid = smoothstep(170, 560, rr);
  const far = smoothstep(440, 1600, rr);
  const ridge = 0.55 * ridged2(x * 0.0032 + 5.3, z * 0.0032 - 8.1, 3) + 0.45 * (fbm2(x * 0.0042 + 2, z * 0.0042, 3) * 0.5 + 0.5);
  const rough = fbm2(x * 0.011, z * 0.011, 4) * 0.5 + 0.5;
  const rough2 = fbm2(x * 0.05 + 3, z * 0.05 + 9, 3) * 0.5 + 0.5;
  let h = near * (8 + 16 * rough);
  h += mid * (40 + 120 * ridge);
  h += far * (90 + 260 * ridge);
  h += near * rough2 * 3.5;
  return h;
}

// 入り江の外（s>0）の高さ
function outsideHeight(x, z, s, th) {
  const wl = landW(th, s);
  // 外洋側: リーフの肩（ほぼ水面）→ 外のふかみ
  const reefCrest = -0.28 - 0.18 * (0.5 + 0.5 * Math.sin(x * 0.31 + 2.0)) * smoothstep(0, 3, s);
  let reef = reefCrest - 26 * smoothstep(3.2, 16, s);
  if (wl < 0.001) return reef;
  // 陸側
  const lava = wLava(th);
  const rock = fbm2(x * 0.17 + 7, z * 0.17, 3) * 0.5 + 0.5;
  const rock2 = noise2(x * 0.6, z * 0.6);
  // 砂浜: ゆるい坂 → 後浜 → 草地
  const sand = 0.46 * (1 - Math.exp(-s / 2.6)) + 1.5 * smoothstep(7, 30, s) + (fbm2(x * 0.05, z * 0.05, 3) * 0.5 + 0.5) * 2.2 * smoothstep(12, 60, s);
  // 溶岩: すぐ切り立つ岩場
  const lav = 0.5 * (1 - Math.exp(-s / 1.2)) + rock * 2.6 * smoothstep(0.2, 7, s) + rock2 * 0.45 * smoothstep(1, 5, s) + 6.5 * smoothstep(5, 48, s);
  let h = lerp(sand, lav, lava);
  h += mountainHeight(x, z) * smoothstep(10, 70, s);
  return lerp(reef, h, wl);
}

// 入り江の内側の海ぞこ（depth は正）
function lagoonDepth(x, z, s, th) {
  const t = -s;
  const wN = wNorth(th), wE = wEast(th);
  const te = t * (1 + 0.8 * wE);
  let d = 3.0 * Math.pow(1 - Math.exp(-te / 8.5), 1.3);
  d *= 1 - 0.88 * Math.exp(-(t / 6) * (t / 6)) * wN;       // 北は、リーフの浅い棚
  d += 0.2 * noise2(x * 0.11 + 3, z * 0.11) * smoothstep(1.5, 7, t);
  d += 0.06 * Math.sin(x * 1.1 + z * 0.35 + noise2(x * 0.3, z * 0.3) * 3) * smoothstep(2, 6, t);   // 砂紋
  d -= headsAt(x, z) * smoothstep(0.5, 3, t);
  return d;
}

// 潮を引く前の、もとの高さ（飾りを置くときに使う）
export function baseHeight(x, z) {
  const s = pondSigned(x, z);
  const th = Math.atan2((x - CX) / A, -(z - CZ) / B);
  if (s < 0) {
    const edge = -0.28 * (1 - landW(th, 0));
    const d = lagoonDepth(x, z, s, th);
    return lerp(edge, -d, smoothstep(0, 4, -s));
  }
  return outsideHeight(x, z, s, th);
}

export function terrainHeight(x, z) { return baseHeight(x, z) - TIDE.level; }
export function waterDepthAt(x, z) { return Math.max(0, -terrainHeight(x, z)); }

// ---------------------------------------------------------------------------
const C = (hex) => hexToLinear(hex);
const COL = {
  sandDry: C(0xf0e4bf), sandWet: C(0xc9b68c), sandBed: C(0xcdbb8a), reefRock: C(0x6f6247), algae: C(0x5f6e3a), deep: C(0x2f4750),
  coralBrown: C(0x86694a), coralGreen: C(0x6f8a5a),
  lava: C(0x34302e), lavaB: C(0x514740), lavaC: C(0x6f6153), lichen: C(0x8a8a74),
  grassA: C(0x5a7a33), grassB: C(0x6e8c3e), grassDry: C(0xb3a35e), grassOlive: C(0x56662f), litter: C(0x8a6a44), vine: C(0x4f7a34),
  forest: C(0x2c3c22), forestB: C(0x3a4a28),
  soil: C(0x9a4e2c), mtn: C(0x3f6b3c), mtnB: C(0x587c42), cliff: C(0x5d5648),
};
const mix3 = (a, b, t, o) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); };

function terrainColor(x, z, h, ny, s, th, out) {
  const rr = Math.hypot(x, z);
  const n1 = fbm2(x * 0.03 + 40, z * 0.03, 3) * 0.5 + 0.5;
  const n2 = fbm2(x * 0.11, z * 0.11 + 20, 3) * 0.5 + 0.5;
  const n3 = fbm2(x * 0.006 + 70, z * 0.006 + 31, 3) * 0.5 + 0.5;
  const lava = wLava(th);
  const land = s > 0 ? landW(th, s) : 0;
  const c = [0, 0, 0];
  // ---- 水の中: 砂 ＋ サンゴ岩・藻 ＋ 外洋の暗い底
  mix3(COL.sandBed, COL.sandWet, smoothstep(0.55, 0.9, n2) * 0.35, c);
  const hd = headsAt(x, z);
  const rockiness = clamp(hd * 1.4 + smoothstep(0.62, 0.82, n1) * 0.45 + wNorth(th) * smoothstep(3.5, 0.5, -s) * 0.9);
  const rockC = [0, 0, 0];
  mix3(COL.reefRock, COL.algae, smoothstep(0.35, 0.7, n2), rockC);
  mix3(rockC, COL.coralBrown, smoothstep(0.5, 0.9, n1) * 0.5, rockC);
  mix3(c, rockC, rockiness, c);
  const deep = smoothstep(3.2, 14, -h);
  mix3(c, COL.deep, deep, c);
  // リーフの外側の急な落ちこみは、暗い岩肌
  if (h < -0.3) mix3(c, COL.reefRock, smoothstep(0.85, 0.55, ny) * 0.85, c);
  // ---- 陸
  if (land > 0 || s > -0.3) {
    const lc = [0, 0, 0];
    // 砂浜
    mix3(COL.sandDry, COL.sandWet, smoothstep(2.0, 0.0, s) * 0.8, lc);
    mix3(lc, COL.sandBed, smoothstep(0.55, 0.9, n2) * 0.25, lc);
    // 砂のむら: 風で寄った明るい砂と、踏まれて少し暗い砂。まっ白い一枚にしない
    {
      const ns = fbm2(x * 0.45 + 13, z * 0.45 - 7, 3) * 0.5 + 0.5, nf = fbm2(x * 1.3 - 5, z * 1.3 + 2, 2) * 0.5 + 0.5;
      const k = 0.9 + 0.12 * ns + 0.05 * (nf - 0.5);
      lc[0] *= k; lc[1] *= k * 0.995; lc[2] *= k * 0.98;
    }
    // 後浜から草・森へ。草のさかいは、はう蔓（ポーフエフエ）と砂がまだらにまじる
    const n4 = fbm2(x * 0.32 + 9, z * 0.32 - 4, 3) * 0.5 + 0.5;
    const n5 = fbm2(x * 0.9 - 3, z * 0.9 + 6, 2) * 0.5 + 0.5;
    const edgeB = smoothstep(0.3, 0.7, n4 + (s - 12) / 11);
    // 草は濃く（砂の色をまぜすぎると、のっぺりした芝生に見える）。浜に近いところは、ところどころ砂がのぞく
    const veg = smoothstep(6, 15, s) * (0.84 + 0.16 * n1) * edgeB * (1 - 0.6 * smoothstep(0.56, 0.74, n5 * 0.6 + n4 * 0.4) * smoothstep(36, 12, s));
    const gc = [0, 0, 0];
    mix3(COL.grassA, COL.grassB, n1, gc);
    mix3(gc, COL.grassOlive, smoothstep(0.42, 0.7, n2 * 0.6 + n5 * 0.4) * 0.6, gc);  // 濃い草のむら
    mix3(gc, COL.grassDry, smoothstep(0.5, 0.75, n3 * 0.5 + n4 * 0.5) * 0.65, gc);  // 乾いた草
    mix3(gc, COL.vine, smoothstep(14, 8, s) * smoothstep(0.4, 0.7, n5) * 0.6, gc); // 砂の上をはう蔓
    gc[0] *= 0.86 + 0.28 * n5; gc[1] *= 0.86 + 0.28 * n5; gc[2] *= 0.86 + 0.28 * n5;
    mix3(lc, gc, veg, lc);
    // 草地の中の、土が見えるところと、草のこいところ（10〜20 m のむら）
    mix3(lc, COL.litter, veg * smoothstep(0.62, 0.8, n4 * 0.5 + n2 * 0.5) * smoothstep(12, 20, s) * 0.45, lc);
    mix3(lc, COL.grassOlive, veg * smoothstep(0.35, 0.15, n2 * 0.6 + n5 * 0.4) * 0.5, lc);
    // 林のきわの落ち葉と土
    mix3(lc, COL.litter, smoothstep(24, 40, s) * smoothstep(0.55, 0.8, n4) * smoothstep(45, 90, rr) * 0.5, lc);
    const forest = smoothstep(32, 95, rr) * smoothstep(12, 34, s);   // 林の下は、落ち葉と影の暗い地面
    const fc = [0, 0, 0];
    mix3(COL.forest, COL.forestB, n2, fc);
    mix3(fc, COL.soil, smoothstep(0.7, 0.9, n3 + n2 * 0.25) * 0.35, fc);
    mix3(lc, fc, forest, lc);
    const far = smoothstep(140, 420, rr);
    const mc = [0, 0, 0];
    mix3(COL.mtn, COL.mtnB, n1, mc);
    mix3(lc, mc, far * smoothstep(8, 40, s), lc);
    // 溶岩の岬は、黒っぽい岩（陸へ上がるほど、草がのる）
    const lv = [0, 0, 0];
    mix3(COL.lava, COL.lavaB, n2, lv);
    mix3(lv, COL.lavaC, smoothstep(0.62, 0.9, n1) * 0.55, lv);
    mix3(lv, COL.lichen, smoothstep(0.78, 0.95, n2) * 0.25, lv);
    const lavaOn = lava * smoothstep(48, 12, s);
    mix3(lc, lv, lavaOn * 0.95, lc);
    // 急斜面は岩
    const slope = 1 - ny;
    mix3(lc, COL.cliff, smoothstep(0.25, 0.5, slope) * smoothstep(40, 130, rr) * 0.8, lc);
    // 水ぎわの濡れ
    mix3(lc, COL.sandWet, smoothstep(1.0, 0.0, s) * (1 - lava) * 0.4, lc);
    const k = s > 0 ? Math.max(land, smoothstep(0.0, 0.6, h)) : smoothstep(-0.3, 0.2, h);
    mix3(c, lc, clamp(k), c);
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

// その場所の地面の色（地形と同じ計算。水槽のまわりに盛る砂の色あわせに）
export function groundColor(x, z, out = [0, 0, 0]) {
  const th = Math.atan2((x - CX) / A, -(z - CZ) / B);
  terrainColor(x, z, baseHeight(x, z), 1, pondSigned(x, z), th, out);
  return out;
}

export function buildTerrain() {
  const nA = 512, nR = 300;
  const rMax = 1900;
  const a0 = 0.2;
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
      const h = baseHeight(x, z);
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
      const th = Math.atan2((x - CX) / A, -(z - CZ) / B);
      terrainColor(x, z, hts[k], ny, pondSigned(x, z), th, tmp);
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

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  patchMaterial(mat, { underwater: true, detail: 'terrain', caustics: true, grass: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.frustumCulled = false;
  return mesh;
}

// 水面シェーダが水深を読むためのテクスチャ（half float）。R = 水深（陸は負）。潮は水面シェーダが足す
export const DEPTH_WIN = { x0: -58, z0: -66, w: 116, h: 100 };

export function buildDepthTexture(nx = 360, nz = 310) {
  const data = new Uint16Array(nx * nz * 4);
  const { x0, z0, w, h } = DEPTH_WIN;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((i + 0.5) / nx) * w;
      const z = z0 + ((j + 0.5) / nz) * h;
      const d = clamp(-baseHeight(x, z), -3, 30);
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
