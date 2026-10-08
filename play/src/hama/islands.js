// 沖の島かげ: ハワイの火山島らしく、頂から海へ、ひだのような尾根と谷が刻まれ、
// 海ぎわは黒い溶岩の崖で切れ落ちる。ひとつずつ、細かな網目のメッシュで作る。
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise2, fbm2, ridged2, hexToLinear } from '../util.js';
import { patchMaterial } from '../materials.js';

// x, z: 中心 / r: 半径(m) / h: 高さ(m) / fl: ひだ(谷)の数 / kind: 'dome'（ふつうの島）'hat'（切り立った小島）'reef'（低い岩礁）
export const ISLANDS = [
  { x: -300, z: -620, r: 125, h: 82, fl: 11, seed: 3.1, kind: 'dome' },
  { x: -182, z: -512, r: 30, h: 34, fl: 7, seed: 7.7, kind: 'hat' },
  { x: 430, z: -1000, r: 300, h: 196, fl: 17, seed: 1.3, kind: 'dome' },
  { x: -880, z: -1300, r: 360, h: 140, fl: 13, seed: 5.5, kind: 'dome' },
  { x: 150, z: -430, r: 20, h: 6, fl: 5, seed: 9.2, kind: 'reef' },
];

const C = (h) => hexToLinear(h);
// 遠くから見たハワイの森は、明るい黄緑ではなく、濃い緑のまだら。尾根の上は草地、谷は影で暗い
const COL = {
  forest: C(0x355c2c), forestB: C(0x4a7236), canopyHi: C(0x6a8c48), ridge: C(0x7d9452), gully: C(0x1f3a1f),
  soil: C(0x8a4a2c), cliff: C(0x3e3833), cliffB: C(0x5a5048), surf: C(0xe9efea), wet: C(0x23201e),
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// 島の高さ（u: 中心0〜岸1 の正規化した半径、a: 方位）。out.f に「ひだの深さ」(0..1)を返す
function islandHeight(I, u, a, out = {}) {
  const s = I.seed;
  const ca = Math.cos(a), sa = Math.sin(a);
  out.f = 0;
  if (I.kind === 'reef') {
    const n = ridged2(ca * 2 + s, sa * 2 + u * 3, 3);
    return I.h * Math.pow(clamp(1 - u), 0.6) * (0.4 + 0.9 * n) - 0.6;
  }
  let prof;
  if (I.kind === 'hat') prof = Math.pow(smoothstep(1.0, 0.18, u), 1.25);          // 帽子のような、切り立った小島
  else prof = Math.pow(clamp(1 - u * u * 0.85 - u * 0.15), 1.25);
  // 頂はひとつではなく、となりあう峰がいくつか（侵食で削られた古い火山）
  if (I.kind === 'dome') {
    const px = u * ca, pz = u * sa;
    let peaks = 0;
    for (let k = 0; k < 3; k++) {
      const pa = hash(s * 7 + k) * Math.PI * 2, pr = 0.18 + 0.3 * hash(s * 3 + k * 5);
      const dx = px - Math.cos(pa) * pr, dz = pz - Math.sin(pa) * pr;
      peaks += (0.12 + 0.12 * hash(s + k * 9)) * Math.exp(-(dx * dx + dz * dz) / 0.025);
    }
    prof = prof * (0.86 + 0.14 * (1 - u)) + peaks * smoothstep(0.9, 0.3, u);
  }
  // 頂から放射状にのびる大きな谷（円形劇場のような、えぐれた谷頭）
  const warp = 1.8 * noise2(u * 2.4 + s, a * 1.7);
  const g = 0.5 + 0.5 * Math.cos(a * I.fl + warp);
  const gully = Math.pow(g, 2.2) * smoothstep(0.05, 0.4, u) * (1 - smoothstep(0.84, 1.0, u));
  // 細かな ひだ（ナイフのような尾根と、雨が刻んだ溝）。中腹でいちばん深い
  const warp2 = 2.2 * noise2(u * 5 + s * 2, a * 3.1);
  const fl = 1 - Math.abs(Math.sin(a * I.fl * 2.6 + warp2 + u * 3.0));
  const flute = Math.pow(1 - fl, 1.6) * smoothstep(0.1, 0.45, u) * (1 - smoothstep(0.8, 0.97, u));
  // 尾根のこまかな凹凸
  const rough = ridged2(ca * (2 + u * 6) + s * 3, sa * (2 + u * 6) + u * 4, 4);
  let h = I.h * prof * (1 - 0.34 * gully - 0.13 * flute) + I.h * 0.07 * (rough - 0.4) * (1 - u * 0.8);
  out.f = clamp(gully * 0.7 + flute * 0.6);
  // 海ぎわの崖: 岸の手前で急に落ちる
  const cliffH = I.h * (I.kind === 'hat' ? 0.18 : 0.08) * (0.6 + 0.8 * noise2(ca * 3 + s, sa * 3));
  h = Math.max(h, lerp(cliffH, 0, smoothstep(0.9, 1.0, u)) * (u < 1 ? 1 : 0));
  h = lerp(h, -24, smoothstep(0.99, 1.12, u));
  return h;
}

function buildIsland(I) {
  const nR = I.kind === 'reef' ? 22 : 110, nA = I.kind === 'reef' ? 64 : 360;
  const pos = [], col = [], idx = [];
  const rows = nR + 1, cols = nA + 1;
  const hs = new Float32Array(rows * cols), us = new Float32Array(rows * cols), fs = new Float32Array(rows * cols);
  const o = {};
  for (let j = 0; j <= nR; j++) {
    const u = Math.pow(j / nR, 0.85) * 1.14;
    for (let i = 0; i <= nA; i++) {
      const a = (i / nA) * Math.PI * 2;
      // 島の輪郭をゆがめる
      const ca = Math.cos(a), sa = Math.sin(a);
      const ed = 1 + 0.2 * noise2(ca * 1.2 + I.seed, sa * 1.2) + 0.07 * noise2(ca * 4 + I.seed * 2, sa * 4);
      const rr = u * I.r * ed;
      const h = islandHeight(I, u, a, o);
      pos.push(I.x + ca * rr, h, I.z + sa * rr);
      hs[j * cols + i] = h; us[j * cols + i] = u; fs[j * cols + i] = o.f;
    }
  }
  for (let j = 0; j < nR; j++) for (let i = 0; i < nA; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);   // 上向きの面（法線が空を向く）
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let k = 0; k < rows * cols; k++) {
    const h = hs[k], u = us[k], ny = nrm.getY(k), f = fs[k];
    const x = pos[k * 3], z = pos[k * 3 + 2];
    const n1 = fbm2(x * 0.02 + I.seed, z * 0.02, 3) * 0.5 + 0.5;
    const n2 = fbm2(x * 0.08, z * 0.08 + I.seed, 3) * 0.5 + 0.5;
    const n3 = fbm2(x * 0.35 + I.seed * 3, z * 0.35, 2) * 0.5 + 0.5;   // 樹冠のつぶつぶ
    let c = mix3(COL.forest, COL.forestB, n1);
    c = mix3(c, COL.canopyHi, smoothstep(0.55, 0.85, n3) * 0.35);
    c = mix3(c, COL.gully, clamp(f * 0.75 + smoothstep(0.86, 0.6, ny) * 0.35));                 // 谷とひだの溝は暗い
    c = mix3(c, COL.ridge, smoothstep(0.9, 0.98, ny) * smoothstep(0.55, 0.8, n2) * smoothstep(0.25, 0.0, f) * 0.55 * smoothstep(0.2, 0.6, h / I.h)); // 尾根の上の草地
    c = mix3(c, COL.soil, smoothstep(0.5, 0.3, ny) * smoothstep(0.45, 0.75, n2) * 0.6);          // 急な斜面の赤土
    const cliff = smoothstep(0.6, 0.33, ny) * smoothstep(0.7, 0.95, u) + smoothstep(I.h * 0.12, 0.5, h) * smoothstep(0.8, 1.0, u);
    c = mix3(c, mix3(COL.cliff, COL.cliffB, n2), clamp(cliff));                                     // 海ぎわの黒い崖
    if (I.kind === 'reef') c = mix3(COL.cliff, COL.cliffB, n2);
    c = mix3(c, COL.wet, smoothstep(1.2, 0.2, h) * smoothstep(-1.5, 0.0, h) * 0.8);                 // 波にぬれた岩
    c = mix3(c, COL.surf, smoothstep(0.9, 0.15, Math.abs(h - 0.35)) * (0.55 + 0.45 * n2) * 0.85);   // 打ちよせる白波
    col.push(c[0], c[1], c[2]);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export function buildIslands(parent) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  patchMaterial(mat, { underwater: true, detail: 'terrain' });
  const group = new THREE.Group();
  group.name = 'islands';
  for (const I of ISLANDS) {
    const m = new THREE.Mesh(buildIsland(I), mat);
    m.receiveShadow = true;
    m.frustumCulled = true;
    group.add(m);
  }
  parent.add(group);
  return group;
}
