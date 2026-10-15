// ひだまり港の港町: 赤瓦の家・屋根の上のシーサー・福木の並木・街灯・自販機・消波ブロック・灯台・漁船
//  景色は、南の岸壁（コンクリートの岸）の奥に村、東西の岬に消波ブロック、東の堤防の先に灯台。
//  ここの物はすべて「陸」のグループ（land）に入れる。潮で陸が上下するので、岸壁の水ぎわが上がったり下がったりする。
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smoothstep, noise2, hexToLinear, TAU } from '../util.js';
import { patchMaterial } from '../materials.js';
import { mergeGeos, colorFlat, M, instancedFrom } from '../geo.js';
import { baseHeight, pondSigned, QUAY_H } from './terrain.js';
import { blobGeo } from './decor.js';

const C = (h) => hexToLinear(h);
const thOf = (x, z) => Math.atan2(x / 40, -(z + 8) / 22);
const jit = (c, k, r) => [clamp(c[0] * (1 + (r - 0.5) * k)), clamp(c[1] * (1 + (r - 0.5) * k)), clamp(c[2] * (1 + (r - 0.5) * k))];

// 1つのパーツ（形・色・置き場所）をリストに足す
function part(list, geo, rgb, m) {
  if (m) geo.applyMatrix4(m);
  colorFlat(geo, rgb);
  list.push(geo);
}
const box = (list, w, h, d, x, y, z, rgb, ry = 0) => part(list, new THREE.BoxGeometry(w, h, d), rgb, M(x, y, z, 0, ry, 0));
const cyl = (list, r0, r1, h, x, y, z, rgb, seg = 8, rx = 0, rz = 0) => part(list, new THREE.CylinderGeometry(r1, r0, h, seg), rgb, M(x, y, z, rx, 0, rz));

function stdMat(opts = {}, patch = { underwater: true }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...opts });
  patchMaterial(m, patch);
  return m;
}

// x の列で、岸（水ぎわ）から s メートル奥の z
function zAtS(x, s) {
  let lo = -40, hi = 90;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pondSigned(x, mid) < s) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// 入り江の中心から、方位 th（北=0）の向きで、水ぎわから s メートルの点
function edgePoint(th, s) {
  let lo = 0.2, hi = 1.8;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    const x = 40 * t * Math.sin(th), z = -8 - 22 * t * Math.cos(th);
    if (pondSigned(x, z) < s) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2;
  return [40 * t * Math.sin(th), -8 - 22 * t * Math.cos(th)];
}

// ---------------------------------------------------------------------------
// 家
//  赤瓦の平屋（寄棟）と、屋上に水タンクのある、コンクリートの家。ほとんどの窓は、夕方から灯る。
const WALL = [C(0xe8e2d0), C(0xd9d2bc), C(0xcfd8d6), C(0xe6d6b8), C(0xdcc9c0)];
const TILE = [C(0xb44a28), C(0xa8442a), C(0xbd5430)];

// 寄棟の屋根（赤瓦）。w×d の建物の上に、軒を出してのせる
function hipRoof(list, w, d, y, rise, rgb, rng) {
  const ow = w / 2 + 0.55, od = d / 2 + 0.55, rl = Math.max(0.1, ow - od) * 0.9;   // 棟の長さの半分
  const A = [-ow, y, -od], B = [ow, y, -od], Cc = [ow, y, od], D = [-ow, y, od];
  const R1 = [-rl, y + rise, 0], R2 = [rl, y + rise, 0];
  const tris = [[A, B, R2], [A, R2, R1], [D, R1, R2], [D, R2, Cc], [A, R1, D], [B, Cc, R2]];
  const pos = [];
  for (const t of tris) for (const v of t) pos.push(...v);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 瓦の段（横縞）で、少し濃淡をつける
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const band = 0.5 + 0.5 * Math.sin((p.getY(i) - y) * 36 + p.getX(i) * 1.7);
    const k = 0.9 + 0.12 * band + 0.06 * (rng() - 0.5);
    col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  list.push(g);
  // 棟の白い漆喰
  box(list, rl * 2 + 0.3, 0.12, 0.22, 0, y + rise + 0.04, 0, C(0xf2eee2));
  // 軒先の、うすい影の板
  box(list, ow * 2, 0.1, 0.1, 0, y - 0.02, -od + 0.02, C(0x8a3a22));
  box(list, ow * 2, 0.1, 0.1, 0, y - 0.02, od - 0.02, C(0x8a3a22));
}

// シーサー（屋根の上の、小さな獅子）
function shisa(list, x, y, z, ry, rng) {
  const clay = jit(C(0xc89a58), 0.25, rng());
  const m = (px, py, pz) => M(x, y, z, 0, ry, 0).multiply(M(px, py, pz));
  part(list, new THREE.BoxGeometry(0.26, 0.1, 0.34), clay, m(0, 0.05, 0));                        // 台座
  part(list, new THREE.SphereGeometry(0.17, 8, 6), clay, m(0, 0.27, 0.0).multiply(M(0, 0, 0, 0, 0, 0, 0.9, 1.1, 1.0)));   // 体
  part(list, new THREE.SphereGeometry(0.13, 8, 6), clay, m(0, 0.46, 0.1));                          // 頭
  part(list, new THREE.SphereGeometry(0.09, 6, 5), C(0xb88a4a), m(0, 0.4, 0.2));                   // たてがみ・口
  part(list, new THREE.SphereGeometry(0.035, 5, 4), C(0x2a1a10), m(0.055, 0.5, 0.2));               // 目
  part(list, new THREE.SphereGeometry(0.035, 5, 4), C(0x2a1a10), m(-0.055, 0.5, 0.2));
}

function house(rng, kind) {
  const list = [], win = [];
  const w = 7 + rng() * 3.5, d = 5.5 + rng() * 2, h = 2.8 + (kind === 'flat' ? rng() * 3 : 0.4);
  const wall = jit(WALL[Math.floor(rng() * WALL.length)], 0.1, rng());
  box(list, w, h, d, 0, h / 2, 0, wall);
  box(list, w + 0.1, 0.35, d + 0.1, 0, 0.17, 0, C(0xa8a496));            // 基礎
  // 正面（+z）の窓・玄関
  const nWin = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < nWin; i++) {
    const wx = (-w / 2 + (i + 0.5) * (w / (nWin + 0.7))) + 0.2;
    const ww = 1.3, wh = 1.1;
    win.push([wx, h * 0.55, d / 2 + 0.03, ww, wh]);
    box(list, ww + 0.2, 0.08, 0.12, wx, h * 0.55 + wh / 2 + 0.06, d / 2 + 0.07, C(0xcfcabb));   // ひさし
  }
  box(list, 1.0, 2.0, 0.08, w / 2 - 1.2, 1.1, d / 2 + 0.03, C(0x6a5a46));                         // 玄関
  if (kind === 'tile') {
    hipRoof(list, w, d, h, 1.5 + rng() * 0.4, jit(TILE[Math.floor(rng() * TILE.length)], 0.12, rng()), rng);
    shisa(list, (rng() - 0.5) * 1.6, h + 1.55, 0.1, (rng() - 0.5) * 0.6, rng);
    if (rng() < 0.6) shisa(list, (rng() - 0.5) * 1.6 + 2.2, h + 1.55, 0.1, 0, rng);
  } else {
    // 陸屋根（平らな屋根）: 低い立ち上がり、水のタンク、アンテナ
    box(list, w + 0.2, 0.25, d + 0.2, 0, h + 0.12, 0, jit(wall, 0.08, rng()));
    cyl(list, 0.62, 0.62, 1.1, -w * 0.28, h + 0.8, -d * 0.1, C(0xe4e8ea), 12);                 // 水タンク
    cyl(list, 0.66, 0.66, 0.1, -w * 0.28, h + 1.38, -d * 0.1, C(0xcfd6d8), 12);
    box(list, 0.9, 0.7, 0.7, w * 0.25, h + 0.45, d * 0.1, C(0xb8bcbc));                         // 室外機
    cyl(list, 0.02, 0.02, 2.6, w * 0.4, h + 1.5, -d * 0.3, C(0x6a6a6a), 4);                    // アンテナ
    box(list, 1.1, 0.03, 0.03, w * 0.4, h + 2.6, -d * 0.3, C(0x6a6a6a));
  }
  return { geo: mergeGeos(list), win, w, d, h };
}

export function buildVillage(parent) {
  const rng = mulberry32(5150);
  const mat = stdMat({}, { underwater: true, detail: 'terrain' });
  const winMat = new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.25, metalness: 0.2, emissive: 0xffc86a, emissiveIntensity: 0 });
  patchMaterial(winMat, {});
  const winG = [];
  const housePos = [];
  let x = -34;
  // 道ぞいに、東西に家をならべる（奥へ行くほど少しずつ高い）
  for (let row = 0; row < 2; row++) {
    x = -34 + row * 3;
    while (x < 34) {
      const kind = rng() < 0.45 ? 'tile' : 'flat';
      const hs = house(rng, kind);
      const sOff = 15 + row * 13 + rng() * 2.5;
      const z = zAtS(x, sOff);
      const th = thOf(x, z);
      if (Math.abs(th) < 2.0) { x += 6; continue; }       // 岸壁の正面ではない場所は、あとの石灰岩の岬
      const gy = baseHeight(x, z);
      const yaw = -Math.atan2(x * 0.02, 1) + (rng() - 0.5) * 0.08;
      const mesh = new THREE.Mesh(hs.geo, mat);
      mesh.position.set(x, gy - 0.1, z); mesh.rotation.y = yaw;
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      for (const [wx, wy, wz, ww, wh] of hs.win) {
        const g = new THREE.PlaneGeometry(ww, wh);
        g.translate(wx, wy, wz);
        g.rotateY(yaw);
        g.translate(x, gy - 0.1, z);
        winG.push(g);
      }
      housePos.push({ x, z, w: hs.w, d: hs.d, yaw, gy });
      x += hs.w + 2.2 + rng() * 3.5;
    }
  }
  if (winG.length) {
    const wm = new THREE.Mesh(mergeGeos(winG), winMat);
    wm.name = 'house-windows';
    parent.add(wm);
  }
  return { winMat, housePos };
}

// ---------------------------------------------------------------------------
// 福木（フクギ）: 防風林の並木。幹はまっすぐ、葉は濃い緑のこんもりした丸い樹冠
export function buildFukugi(parent, { count = 34 } = {}) {
  const rng = mulberry32(8827);
  const trunkG = [], crownG = [];
  const bark = C(0x5a4630), leaf = [C(0x26501e), C(0x2f5e24), C(0x356a28), C(0x1f4619)];
  const spots = [];
  // 道ぞい（水ぎわから11〜12.5m）に並べ、家のうしろにも数本
  for (let x = -32; x <= 32; x += 4.6 + rng() * 1.8) {
    const z = zAtS(x, 11.2 + rng() * 1.2);
    if (Math.abs(thOf(x, z)) < 2.1) continue;
    spots.push([x, z, 1]);
  }
  for (let i = 0; i < count * 0.5; i++) {
    const x = (rng() * 2 - 1) * 36, z = zAtS(x, 24 + rng() * 22);
    if (Math.abs(thOf(x, z)) < 2.0) continue;
    spots.push([x, z, 1.15]);
  }
  for (const [x, z, k] of spots) {
    const gy = baseHeight(x, z);
    const sc = k * (0.85 + rng() * 0.5);
    const h = 5.2 * sc;
    const trunk = new THREE.CylinderGeometry(0.2 * sc, 0.32 * sc, h, 7);
    trunk.applyMatrix4(M(x, gy + h / 2 - 0.1, z));
    colorFlat(trunk, jit(bark, 0.2, rng()));
    trunkG.push(trunk);
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const g = blobGeo(2);
      const r = (1.7 + rng() * 1.0) * sc;
      const a = rng() * TAU, o = j === 0 ? 0 : (0.8 + rng() * 1.2) * sc;
      const p = g.attributes.position;
      for (let q = 0; q < p.count; q++) {
        const px = p.getX(q), py = p.getY(q), pz = p.getZ(q);
        const d = 1 + 0.16 * noise2(px * 2.4 + j * 5 + x, pz * 2.4 + py * 2 + z);
        p.setXYZ(q, px * d, py * d * 0.85, pz * d);
      }
      g.computeVertexNormals();
      g.applyMatrix4(M(x + Math.cos(a) * o, gy + h * (0.88 + rng() * 0.18), z + Math.sin(a) * o, 0, 0, 0, r, r, r));
      colorFlat(g, jit(leaf[Math.floor(rng() * leaf.length)], 0.18, rng()));
      crownG.push(g);
    }
  }
  const tm = new THREE.Mesh(mergeGeos(trunkG), stdMat({}, { underwater: true }));
  tm.castShadow = true; tm.name = 'fukugi-trunks';
  const cm = new THREE.Mesh(mergeGeos(crownG), stdMat({ roughness: 0.8 }, { underwater: true, detail: 'leaf', translucent: 0.9 }));
  cm.castShadow = true; cm.receiveShadow = true; cm.name = 'fukugi-crowns';
  parent.add(tm, cm);
}

// ---------------------------------------------------------------------------
// 岸壁の小物: 街灯・係船柱・自販機・コンクリートの階段
export function buildQuayProps(parent) {
  const list = [];
  const lampHeads = [];
  const metal = C(0x4a4e50), black = C(0x1c1e20);
  // 街灯（岸壁のふち、水ぎわから2.2m）
  const lampXs = [-24, -12, 12, 24];
  for (const x of lampXs) {
    const z = zAtS(x, 2.4);
    const gy = baseHeight(x, z);
    cyl(list, 0.07, 0.11, 5.4, x, gy + 2.7, z, metal, 8);
    box(list, 0.1, 0.1, 1.1, x, gy + 5.35, z - 0.45, metal);
    box(list, 0.5, 0.12, 0.3, x, gy + 5.28, z - 1.0, black);
    lampHeads.push(new THREE.Vector3(x, gy + 5.2, z - 1.0));
  }
  // 係船柱（ボラード）。岸壁のふちに、おおよそ6mおき
  for (let x = -27; x <= 27; x += 6.2) {
    if (Math.abs(x) < 2.0) continue;
    const z = zAtS(x, 0.9);
    const gy = baseHeight(x, z);
    cyl(list, 0.12, 0.16, 0.34, x, gy + 0.17, z, black, 8);
    cyl(list, 0.17, 0.17, 0.06, x, gy + 0.36, z, black, 8);
  }
  // 岸壁のふちの、黄色い縁石線
  for (let x = -29; x < 29; x += 1.2) {
    const z = zAtS(x, 0.28);
    const gy = baseHeight(x, z);
    box(list, 1.1, 0.03, 0.18, x + 0.55, gy + 0.02, z, C(0xe6c84a));
  }
  const mesh = new THREE.Mesh(mergeGeos(list), stdMat({}, { underwater: true }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'quay-props';
  parent.add(mesh);

  // 自販機（夜に、ぼうっと光る）
  const vm = new THREE.Group();
  const vx = 17, vz = zAtS(vx, 7.2), vy = baseHeight(vx, vz);
  const vBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.8), new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.4 }));
  vBody.position.y = 0.95;
  const vFront = new THREE.MeshStandardMaterial({ color: 0x3a8ad0, roughness: 0.4, emissive: 0xaad8ff, emissiveIntensity: 0.0 });
  patchMaterial(vFront, {});
  const vPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.2), vFront);
  vPanel.position.set(0, 1.12, 0.405);
  vm.add(vBody, vPanel);
  vm.position.set(vx, vy, vz);
  vm.rotation.y = -0.04;
  patchMaterial(vBody.material, {});
  vm.traverse((o) => { o.castShadow = true; });
  parent.add(vm);

  // 街灯とあわせて、夕方〜夜にともる灯り（明るさは update で）
  const lamps = lampHeads.map((p) => {
    const l = new THREE.PointLight(0xffd8a0, 0, 16, 1.6);
    l.position.copy(p).add(new THREE.Vector3(0, -0.2, 0));
    parent.add(l);
    return l;
  });
  const lampGlassMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe0a0, emissiveIntensity: 0, roughness: 0.3 });
  patchMaterial(lampGlassMat, {});
  const lg = new THREE.Group();
  for (const p of lampHeads) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.24), lampGlassMat);
    m.position.copy(p).add(new THREE.Vector3(0, -0.04, 0));
    lg.add(m);
  }
  parent.add(lg);
  return { lamps, lampGlassMat, vFront };
}

// ---------------------------------------------------------------------------
// 消波ブロック（テトラポッド）: 東西の岬の水ぎわに、ごろごろと積まれる
function tetraGeo() {
  const list = [];
  const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((d) => new THREE.Vector3(...d).normalize());
  for (const d of dirs) {
    const g = new THREE.CylinderGeometry(0.2, 0.3, 0.9, 7);
    g.translate(0, 0.45, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    list.push(g);
  }
  const g = mergeGeos(list);
  colorFlat(g, [1, 1, 1]);
  return g;
}

export function buildTetrapods(parent, { count = 260 } = {}) {
  const rng = mulberry32(7733);
  const geo = tetraGeo();
  const mat = stdMat({ roughness: 0.95 }, { underwater: true, detail: 'terrain' });
  const mats = [], cols = [];
  let guard = 0;
  while (mats.length < count && guard++ < count * 40) {
    const side = rng() < 0.5 ? -1 : 1;
    const th = side * (1.02 + rng() * 1.1);                       // 東西の岬（北の開口のきわ〜南の岸壁の手前）
    const s = -0.4 + Math.pow(rng(), 1.4) * 5;
    const [x, z] = edgePoint(th, s);
    if (Math.abs(x) < 12 && z > -4) continue;                      // 桟橋の正面は、あけておく
    const gy = baseHeight(x, z);
    if (gy < -1.8) continue;
    const layer = Math.floor(rng() * 3);
    const sc = 1.0 + rng() * 0.5;
    mats.push(M(x, gy + 0.25 + layer * 0.55 * (1 - s / 6), z, rng() * TAU, rng() * TAU, rng() * TAU, sc, sc, sc));
    const t = 0.7 + rng() * 0.3;
    cols.push(new THREE.Color(C(0xb2b0a6)[0] * t, C(0xb2b0a6)[1] * t, C(0xb2b0a6)[2] * t));
  }
  const mesh = instancedFrom(geo, mat, mats, cols);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'tetrapods';
  parent.add(mesh);
}

// ---------------------------------------------------------------------------
// 灯台: 東の堤防の先に、赤と白の小さな灯台。夜は、ゆっくりまたたく
export function buildLighthouse(parent) {
  const th = 1.0;
  const [x, z] = edgePoint(th, 1.6);
  const gy = baseHeight(x, z);
  const list = [];
  box(list, 3.2, 0.6, 3.2, 0, 0.3, 0, C(0xb6b4aa));
  cyl(list, 0.9, 0.62, 3.0, 0, 2.1, 0, C(0xf2f0ea), 12);
  cyl(list, 0.66, 0.62, 0.6, 0, 3.9, 0, C(0xc82a22), 12);
  cyl(list, 0.5, 0.5, 0.9, 0, 4.65, 0, C(0x2a2c2e), 10);
  cyl(list, 0.62, 0.0, 0.5, 0, 5.35, 0, C(0xc82a22), 12);
  const mesh = new THREE.Mesh(mergeGeos(list), stdMat({}, { underwater: true }));
  mesh.position.set(x, gy, z);
  mesh.castShadow = true;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xff5a40, emissive: 0xff3a20, emissiveIntensity: 0, roughness: 0.3 });
  patchMaterial(lampMat, {});
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 10), lampMat);
  lamp.position.set(x, gy + 4.65, z);
  const light = new THREE.PointLight(0xff5a3a, 0, 30, 1.4);
  light.position.set(x, gy + 4.8, z);
  parent.add(mesh, lamp, light);
  return { lampMat, light };
}

// ---------------------------------------------------------------------------
// 漁船: 岸壁につないだ、小さなFRPの船（白い船体・青い帯・小さな船室）。水面でゆっくりゆれる
function boatHull() {
  const L = 5.2, W = 1.7, N = 20, R = 8, pos = [], col = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, xx = (t - 0.5) * L, e = Math.abs(2 * t - 1);
    const w = W / 2 * Math.pow(Math.max(0, 1 - Math.pow(e, 3.0)), 0.5) * (t > 0.5 ? 1 : 0.92) + 0.02;
    const sheer = 0.5 + 0.35 * Math.pow(Math.max(0, (t - 0.5) * 2), 2.2);      // 舳先が反りあがる
    for (let j = 0; j <= R; j++) {
      const a = Math.PI * (j / R);
      const cy = -Math.sin(a) * 0.5 * (1 - 0.25 * e) + sheer * (1 - Math.sin(a) * 0.0), cz = Math.cos(a) * w;
      pos.push(xx, cy - 0.15, cz);
      const white = cy > -0.05 ? 1 : 0;
      const stripe = cy > 0.18 && cy < 0.3 ? 1 : 0;
      const c = stripe ? C(0x2a5aa8) : white ? C(0xf1f0ea) : C(0x8a2f2a);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = a + 1, c = a + R + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildFishingBoats(parent, spots) {
  const boats = [];
  const mat = stdMat({ side: THREE.DoubleSide }, { underwater: true });
  const hull = boatHull();
  spots.forEach(([x, z, ry], i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(hull, mat);
    m.castShadow = true;
    const list = [];
    box(list, 1.5, 1.0, 1.2, -0.7, 0.75, 0, C(0xf1f0ea));                  // 船室
    box(list, 1.55, 0.08, 1.3, -0.7, 1.28, 0, C(0x2a5aa8));
    box(list, 0.5, 0.45, 1.0, -0.7, 0.7, 0.62, C(0x3a4650));                // 窓
    cyl(list, 0.04, 0.04, 1.8, 0.3, 1.1, 0, C(0x6a6a6a), 5);               // マスト
    const sup = new THREE.Mesh(mergeGeos(list), mat);
    sup.castShadow = true;
    g.add(m, sup);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    parent.add(g);
    boats.push({ g, ph: i * 1.7, ry });
  });
  return {
    update(time) {
      for (const b of boats) {
        b.g.position.y = -0.12 + Math.sin(time * 0.7 + b.ph) * 0.03;
        b.g.rotation.z = Math.sin(time * 0.55 + b.ph) * 0.025;
        b.g.rotation.x = Math.sin(time * 0.45 + b.ph * 2) * 0.015;
      }
    },
  };
}
