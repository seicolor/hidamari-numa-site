// ひだまり浜の植物: ココヤシ・ハラ（タコノキ）・ナウパカの茂み・浜の草・丘の木々
//  ヤシの葉は、葉軸の両側に小葉を一枚ずつ並べて、V字に垂らす（板に絵を貼るのではなく、立体の葉）。
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smoothstep, noise2, fbm2, hexToLinear, TAU } from '../util.js';
import { patchMaterial } from '../materials.js';
import { mergeGeos, colorize, displace, M, instancedFrom } from '../geo.js';
import { baseHeight, pondSigned, SHORE_Z, nearTank } from './terrain.js';

const C = (h) => hexToLinear(h);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const thOf = (x, z) => Math.atan2(x / 40, -(z + 8) / 22);   // 入り江の中心からの方位（北=0）

// 貿易風の強さ（world.js が、時間・季節・天気から毎フレーム決める。1 = ふつう）
export const TRADE = { value: 1 };

// 風でゆれる葉（uv.x = 根もとからの距離 0〜1、uv.y = ゆれの位相）。
// 風が強いと、ゆれが大きくなり、北東からの風下（南西）へなびく
const SWAY = `{
  float sw = uv.x * uv.x;
  float ph = position.x * 0.23 + position.z * 0.19 + uv.y * 6.0;
  transformed.x += (sin(uTime * 1.3 + ph) * 0.10 - 0.05 * max(uTrade - 0.6, 0.0)) * sw * uTrade;
  transformed.z += (sin(uTime * 1.07 + ph * 1.3 + 1.7) * 0.08 + 0.05 * max(uTrade - 0.6, 0.0)) * sw * uTrade;
  transformed.y += sin(uTime * 1.7 + ph) * 0.05 * sw * uTrade;
}`;

function leafMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, ...opts });
  m.userData.extraUniforms = { uTrade: TRADE };
  m.userData.vertPars = 'uniform float uTrade;\n';
  patchMaterial(m, { underwater: true, translucent: 1.5, vertex: SWAY, detail: 'leaf' });
  return m;
}
function barkMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  patchMaterial(m, { underwater: true, detail: 'wood' });
  return m;
}

// 頂点を、まとめて足していく小さな道具
class Builder {
  constructor() { this.pos = []; this.nor = null; this.col = []; this.uv = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  v(p, c, u = 0, w = 0) { this.pos.push(p.x, p.y, p.z); this.col.push(c[0], c[1], c[2]); this.uv.push(u, w); return this.n - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, b, d, c); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// 曲線にそった、太さの変わる管（樹皮の色は colorAt(t, angle)）
function tubeAlong(B, curve, seg, radial, radiusAt, colorAt, swayAt = () => 0) {
  const frames = curve.computeFrenetFrames(seg, false);
  const base = B.n;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = curve.getPoint(t), r = radiusAt(t);
    const Nn = frames.normals[i], Bn = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, cs = Math.cos(a), sn = Math.sin(a);
      B.v(V3(p.x + (Nn.x * cs + Bn.x * sn) * r, p.y + (Nn.y * cs + Bn.y * sn) * r, p.z + (Nn.z * cs + Bn.z * sn) * r), colorAt(t, a), swayAt(t), 0);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = base + i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
    B.quad(a, c, b, d);
  }
}

// ---------------------------------------------------------------------------
// ココヤシ
const PALM = {
  bark: C(0x8d7f69), barkDark: C(0x5a4e40), barkLow: C(0x6e6455), boot: C(0x6b5a3a),
  leafBase: C(0x3a6a26), leafMid: C(0x4f8a2e), leafTip: C(0x9db246), dead: C(0x8f6f3e), deadTip: C(0xb59a62),
  nutGreen: C(0x6c7a2a), nutBrown: C(0x6a4a26),
};

function palmFrond(B, rng, top, az, elev, L, droop, age) {
  const hx = Math.cos(az), hz = Math.sin(az);
  const sx = -hz, sz = hx;                          // 横（水平）
  const at = (s) => {                               // 葉軸の点
    const d = L * s;
    const e = elev - droop * s * s * 1.6;
    return V3(top.x + hx * d * Math.cos(elev) * (1 - 0.15 * s), top.y + d * Math.sin(elev) - droop * L * s * s * 0.55, top.z + hz * d * Math.cos(elev) * (1 - 0.15 * s));
  };
  const dead = age > 0.92;
  const phase = rng();
  // 葉軸
  const rN = 10;
  let prev = null;
  for (let i = 0; i <= rN; i++) {
    const s = i / rN, p = at(s), w = 0.04 * (1 - s * 0.8);
    const c = dead ? PALM.dead : mixA(C(0x7a8a3a), C(0x9aa24c), s);
    const a = B.v(V3(p.x + sx * w, p.y, p.z + sz * w), c, s, phase), b = B.v(V3(p.x - sx * w, p.y, p.z - sz * w), c, s, phase);
    if (prev) B.quad(prev[0], a, prev[1], b);
    prev = [a, b];
  }
  // 小葉: 両側に、V字にたれる
  const nL = 34 + Math.floor(rng() * 8);
  for (let k = 0; k < nL; k++) {
    const s = 0.1 + 0.88 * (k / (nL - 1)) + (rng() - 0.5) * 0.01;
    const p = at(s), p2 = at(Math.min(1, s + 0.01));
    const tx = p2.x - p.x, ty = p2.y - p.y, tz = p2.z - p.z, tl = Math.hypot(tx, ty, tz) || 1;
    const len = (0.25 + 0.85 * Math.sin(Math.PI * Math.min(1, 0.08 + s * 0.95))) * (0.95 + rng() * 0.15) * (L / 4.2);
    const wid = 0.045 * (0.7 + 0.6 * Math.sin(Math.PI * s));
    for (const sg of [-1, 1]) {
      if (dead && rng() < 0.25) continue;
      // 小葉の向き: 横＋先へ少し＋下へ（古い葉ほど垂れる）
      const fw = 0.55, dn = 0.45 + 0.5 * age + 0.2 * s;
      let dx = sx * sg + (tx / tl) * fw, dy = -dn + (ty / tl) * fw * 0.5, dz = sz * sg + (tz / tl) * fw;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const mid = V3(p.x + dx * len * 0.5, p.y + dy * len * 0.5 + 0.03 * len, p.z + dz * len * 0.5);
      const tip = V3(p.x + dx * len, p.y + dy * len - 0.12 * len * (0.5 + age), p.z + dz * len);
      // 幅の向き（葉軸の向き）
      const wx = (tx / tl) * wid, wy = (ty / tl) * wid, wz = (tz / tl) * wid;
      const cb = dead ? PALM.dead : mixA(PALM.leafBase, PALM.leafMid, s * 0.8 + rng() * 0.15);
      const ct = dead ? PALM.deadTip : mixA(PALM.leafMid, PALM.leafTip, 0.35 + 0.5 * s + rng() * 0.15);
      const sw = 0.25 + 0.75 * s;
      const a = B.v(V3(p.x - wx * 0.5, p.y - wy * 0.5, p.z - wz * 0.5), cb, sw * 0.9, phase);
      const b = B.v(V3(p.x + wx * 0.5, p.y + wy * 0.5, p.z + wz * 0.5), cb, sw * 0.9, phase);
      const c = B.v(V3(mid.x - wx, mid.y - wy, mid.z - wz), mixA(cb, ct, 0.5), sw, phase);
      const d = B.v(V3(mid.x + wx, mid.y + wy, mid.z + wz), mixA(cb, ct, 0.5), sw, phase);
      const e = B.v(tip, ct, sw * 1.05, phase);
      B.quad(a, c, b, d); B.tri(c, e, d);
    }
  }
}

function palmTree(trunkB, leafB, rng, x, z, H, leanDir) {
  const y0 = baseHeight(x, z) - 0.2;
  const lean = 0.12 + rng() * 0.22;
  const lx = Math.cos(leanDir), lz = Math.sin(leanDir);
  // 海へ向かってかたむき、上で少し起きあがる幹
  const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const off = lean * H * (Math.pow(t, 1.4) - 0.18 * Math.pow(t, 3));
    return V3(x + lx * off, y0 + t * H, z + lz * off);
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = Math.ceil(H / 0.09), r0 = 0.19 + rng() * 0.04;
  tubeAlong(trunkB, curve, seg, 10,
    (t) => r0 * (1 - 0.32 * t) * (1 + 0.9 * Math.exp(-t * 26)) * (1 + 0.035 * Math.pow(Math.abs(Math.sin(t * H * Math.PI / 0.16)), 8)),
    (t, a) => {
      const ring = Math.pow(Math.abs(Math.sin(t * H * Math.PI / 0.16)), 10);
      let c = mixA(PALM.barkLow, PALM.bark, smoothstep(0.0, 0.3, t));
      c = mixA(c, PALM.barkDark, ring * 0.65);
      return mixA(c, C(0xa89a80), 0.15 * (0.5 + 0.5 * Math.sin(a * 3 + t * 40)));
    });
  // 根もとに、砂へもぐる根
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rng() * 0.4, rr = r0 * 1.7;
    const p0 = V3(x + Math.cos(a) * r0 * 0.6, y0 + 0.35, z + Math.sin(a) * r0 * 0.6);
    const p1 = V3(x + Math.cos(a) * rr * 1.6, y0 + 0.02, z + Math.sin(a) * rr * 1.6);
    tubeAlong(trunkB, new THREE.LineCurve3(p0, p1), 2, 5, (t) => 0.06 * (1 - t * 0.6), () => PALM.barkLow);
  }
  const top = curve.getPoint(1);
  // 葉の付け根のふくらみ
  const boot = new THREE.SphereGeometry(0.34, 10, 8); boot.scale(1, 1.3, 1); boot.translate(top.x, top.y - 0.15, top.z);
  colorize(boot, (px, py) => mixA(PALM.boot, C(0x8a7a50), smoothstep(top.y - 0.5, top.y, py)));
  trunkB.extra.push(boot);
  // ヤシの実（房）
  const nN = 5 + Math.floor(rng() * 8);
  for (let i = 0; i < nN; i++) {
    const g = new THREE.SphereGeometry(0.14, 9, 7); g.scale(1, 1.12, 1);
    const a = rng() * TAU, r = 0.25 + rng() * 0.12;
    g.translate(top.x + Math.cos(a) * r, top.y - 0.35 - rng() * 0.25, top.z + Math.sin(a) * r);
    const c = rng() < 0.65 ? PALM.nutGreen : PALM.nutBrown;
    colorize(g, () => c);
    trunkB.extra.push(g);
  }
  // 葉: 黄金角で、若い葉は立ち、古い葉は垂れる
  const nF = 20 + Math.floor(rng() * 6);
  for (let f = 0; f < nF; f++) {
    const age = f / nF + (rng() - 0.5) * 0.05;
    const az = f * 2.39996 + rng() * 0.2;
    const elev = lerp(1.05, -0.35, age) + (rng() - 0.5) * 0.12;
    const L = (3.4 + rng() * 1.2) * (0.75 + 0.35 * Math.sin(Math.PI * clamp(age * 1.2)));
    const droop = lerp(0.45, 1.6, age);
    palmFrond(leafB, rng, V3(top.x, top.y + 0.05, top.z), az, elev, L, droop, f >= nF - 2 && rng() < 0.6 ? 0.95 : age * 0.85);
  }
}

export function buildPalms(parent, { count = 44 } = {}) {
  const rng = mulberry32(9090);
  const trunkB = new Builder(); trunkB.extra = [];
  const leafB = new Builder();
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < 8000) {
    const x = (rng() * 2 - 1) * 120, z = -30 + rng() * 120;
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 4.5 || s > 75) continue;
    if (Math.abs(th) < 1.15) continue;
    if (Math.abs(x) < 6 && z > SHORE_Z - 4) continue;
    if (nearTank(x, z, 2.2)) continue;
    if (pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < (rng() < 0.3 ? 2.5 : 5.5))) continue;
    if (rng() < smoothstep(2.28, 1.78, Math.abs(th)) * 0.55) continue;
    if (baseHeight(x, z) < 0.45) continue;
    pts.push([x, z]);
  }
  for (const [x, z] of pts) {
    // 入り江の中心（海）のほうへ、かたむく
    const toSea = Math.atan2(-8 - z, 0 - x) + (rng() - 0.5) * 0.9;
    palmTree(trunkB, leafB, rng, x, z, 7.5 + rng() * 6, toSea);
  }
  const trunkGeo = mergeGeos([trunkB.geo(), ...trunkB.extra]);
  const trunks = new THREE.Mesh(trunkGeo, barkMaterial());
  trunks.castShadow = true; trunks.receiveShadow = true; trunks.name = 'palm-trunks';
  const fronds = new THREE.Mesh(leafB.geo(), leafMaterial());
  fronds.castShadow = true; fronds.receiveShadow = true; fronds.name = 'palm-fronds';
  parent.add(trunks, fronds);
  return { trunks, fronds, positions: pts };
}

// ---------------------------------------------------------------------------
// ハラ（タコノキ）: 支柱のような根で立ち、枝先に細長い葉がらせん状に房をつくる
function halaTree(barkB, leafB, rng, x, z, H) {
  const y0 = baseHeight(x, z) - 0.1;
  const bark = C(0x8b8476), barkD = C(0x6a6458);
  const barkC = (t, a) => mixA(bark, barkD, 0.5 * Math.pow(Math.abs(Math.sin(t * 40 + a)), 6));
  // 支柱根
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rng() * 0.3, h = 0.6 + rng() * 1.1, d = 0.7 + rng() * 0.7;
    const curve = new THREE.QuadraticBezierCurve3(V3(x, y0 + h, z), V3(x + Math.cos(a) * d * 0.35, y0 + h * 0.6, z + Math.sin(a) * d * 0.35), V3(x + Math.cos(a) * d, y0 - 0.05, z + Math.sin(a) * d));
    tubeAlong(barkB, curve, 6, 5, (t) => 0.045 - t * 0.012, () => mixA(bark, C(0xa69c84), 0.4));
  }
  // 幹と枝（ふたまたに分かれる）
  const tips = [];
  const branch = (p, dir, len, r, depth) => {
    const end = p.clone().addScaledVector(dir, len);
    const mid = p.clone().addScaledVector(dir, len * 0.5).add(V3((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3));
    tubeAlong(barkB, new THREE.QuadraticBezierCurve3(p, mid, end), 6, 6, (t) => r * (1 - 0.25 * t), barkC);
    if (depth >= 2 || (depth === 1 && rng() < 0.3)) { tips.push([end, dir]); return; }
    for (let k = 0; k < 2; k++) {
      const a = rng() * TAU;
      const nd = dir.clone().add(V3(Math.cos(a) * 0.75, 0.15 + rng() * 0.3, Math.sin(a) * 0.75)).normalize();
      branch(end, nd, len * (0.6 + rng() * 0.2), r * 0.72, depth + 1);
    }
  };
  branch(V3(x, y0 + 0.3, z), V3((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3).normalize(), H * 0.5, 0.13, 0);
  // 葉の房
  const leafA = C(0x3f6b33), leafB_ = C(0x6f8f44), leafT = C(0xb5a95a);
  for (const [tp, dir] of tips) {
    const nL = 26 + Math.floor(rng() * 10);
    const phase = rng();
    for (let i = 0; i < nL; i++) {
      const az = i * 2.39996, el = lerp(1.1, -0.6, (i % 9) / 9) + (rng() - 0.5) * 0.3;
      const L = 0.9 + rng() * 0.6;
      const hx = Math.cos(az), hz = Math.sin(az);
      const sxv = -hz, szv = hx;
      const N = 5, w = 0.045;
      let prev = null;
      for (let k = 0; k <= N; k++) {
        const s = k / N;
        const d = L * s;
        const px = tp.x + hx * d * Math.cos(el), py = tp.y + d * Math.sin(el) - s * s * L * 0.55, pz = tp.z + hz * d * Math.cos(el);
        const ww = w * (1 - s * 0.85);
        const c = mixA(mixA(leafA, leafB_, rng() * 0.4), leafT, Math.pow(s, 3) * 0.7);
        const a = leafB.v(V3(px + sxv * ww, py + ww * 0.6, pz + szv * ww), c, s * 0.6, phase);
        const b = leafB.v(V3(px - sxv * ww, py + ww * 0.6, pz - szv * ww), c, s * 0.6, phase);
        const m = leafB.v(V3(px, py - ww * 0.3, pz), c, s * 0.6, phase);   // 葉のまんなかの折り目
        if (prev) { leafB.quad(prev[0], a, prev[2], m); leafB.quad(prev[2], m, prev[1], b); }
        prev = [a, b, m];
      }
    }
    // たまに、パイナップルのような実
    if (rng() < 0.3) {
      const g = new THREE.SphereGeometry(0.16, 10, 8); g.scale(1, 1.25, 1); g.translate(tp.x, tp.y - 0.25, tp.z);
      colorize(g, (px, py, pz) => mixA(C(0xd9822e), C(0x6a7a2a), 0.5 + 0.5 * Math.sin(px * 60 + py * 50)));
      barkB.extra.push(g);
    }
  }
}

export function buildHala(parent, { count = 10 } = {}) {
  const rng = mulberry32(5511);
  const barkB = new Builder(); barkB.extra = [];
  const leafB = new Builder();
  let n = 0, guard = 0;
  const placed = [];
  while (n < count && guard++ < 4000) {
    const x = (rng() * 2 - 1) * 70, z = -30 + rng() * 80;
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 6 || s > 40 || Math.abs(th) < 1.2) continue;
    if (Math.abs(x) < 7 && z > SHORE_Z - 4) continue;
    if (nearTank(x, z, 3)) continue;
    if (baseHeight(x, z) < 0.6) continue;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 7)) continue;
    placed.push([x, z]);
    halaTree(barkB, leafB, rng, x, z, 3.5 + rng() * 2.5);
    n++;
  }
  const bark = new THREE.Mesh(mergeGeos([barkB.geo(), ...barkB.extra]), barkMaterial());
  const leaves = new THREE.Mesh(leafB.geo(), leafMaterial({ roughness: 0.55 }));
  for (const m of [bark, leaves]) { m.castShadow = true; m.receiveShadow = true; }
  bark.name = 'hala-bark'; leaves.name = 'hala-leaves';
  parent.add(bark, leaves);
}

// ---------------------------------------------------------------------------
// ナウパカ（クサトベラ）の茂み: つややかなスプーン形の葉が、ロゼットになって丸く茂る。白い半分の花
function rosetteGeo() {
  const B = new Builder();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const up = 0.55;
    const P = (r, y, w) => V3(ca * r - sa * w, y, sa * r + ca * w);
    const c0 = [0.55, 0.85, 0.45], c1 = [0.85, 1.0, 0.7];
    const b0 = B.v(P(0.0, 0.0, 0), c0, 0.4, 0);
    const b1 = B.v(P(0.12, 0.07 * up, -0.03), c0, 0.6, 0), b2 = B.v(P(0.12, 0.07 * up, 0.03), c0, 0.6, 0);
    const t1 = B.v(P(0.24, 0.13 * up, -0.055), c1, 0.9, 0), t2 = B.v(P(0.24, 0.13 * up, 0.055), c1, 0.9, 0);
    const tip = B.v(P(0.31, 0.15 * up, 0), c1, 1, 0);
    B.tri(b0, b1, b2); B.quad(b1, t1, b2, t2); B.tri(t1, tip, t2);
  }
  return B.geo();
}

// 白い「半分の花」（ナウパカ）や、5枚の花びらの花（イリマ）。fan = 花びらがひろがる角度
function flowerGeo(petals, fan, R, c0, c1) {
  const B = new Builder();
  const ctr = B.v(V3(0, 0.004, 0), c0, 0.8, 0);
  for (let i = 0; i < petals; i++) {
    const a0 = -fan / 2 + (i / petals) * fan, a1 = a0 + fan / petals * 0.86, am = (a0 + a1) / 2;
    const p0 = B.v(V3(Math.cos(a0) * R * 0.85, 0.012, Math.sin(a0) * R * 0.85), c1, 0.9, 0);
    const pm = B.v(V3(Math.cos(am) * R, 0.016, Math.sin(am) * R), c1, 1, 0);
    const p1 = B.v(V3(Math.cos(a1) * R * 0.85, 0.012, Math.sin(a1) * R * 0.85), c1, 0.9, 0);
    B.tri(ctr, p0, pm); B.tri(ctr, pm, p1);
  }
  return B.geo();
}

// ナウパカ（クサトベラ）の生け垣: 大小の丸い塊がいくつも重なった、でこぼこの茂み。浜ぞいに長くのびる。
// 低く砂の上にはうもの、腰の高さのもの。葉の色も株ごとに、黄緑〜濃い緑。ところどころに白い半分の花
export function buildNaupaka(parent, { count = 130, density = 1 } = {}) {
  const rng = mulberry32(4411);
  const geo = rosetteGeo();
  const fgeo = flowerGeo(5, Math.PI * 0.95, 0.03, [0.9, 0.9, 0.82], [1, 1, 0.97]);
  const mat = leafMaterial({ roughness: 0.4 });
  const fmat = leafMaterial({ roughness: 0.7 });
  const mats = [], cols = [], fm = [], fc = [];
  let n = 0, guard = 0;
  while (n < count && guard++ < 9000) {
    const x = (rng() * 2 - 1) * 110, z = -24 + rng() * 104;
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 3.2 || s > 45 || Math.abs(th) < 1.15) continue;
    if (Math.abs(x) < 5.5 && z > SHORE_Z - 5) continue;
    if (nearTank(x, z, 1.8)) continue;
    if (baseHeight(x, z) < 0.3) continue;
    // 浜に平行な向き（岸からの距離が変わらない向き）
    const gx = pondSigned(x + 1, z) - pondSigned(x - 1, z), gz = pondSigned(x, z + 1) - pondSigned(x, z - 1);
    const gl = Math.hypot(gx, gz) || 1, tx = -gz / gl, tz = gx / gl;
    const nb = 1 + Math.floor(rng() * 4.6);
    const size = 0.45 + Math.pow(rng(), 1.3) * 1.3;
    const low = rng() < 0.3 || s < 6;                 // 砂の上にはう、ひくい茂み
    const lobes = [];
    for (let k = 0; k < nb; k++) {
      const along = (k - (nb - 1) / 2) * size * (0.9 + rng() * 0.5), side = (rng() - 0.5) * size * 0.8;
      const lx = x + tx * along - tz * side, lz = z + tz * along + tx * side;
      const R = size * (0.5 + rng() * 0.65);
      const Hh = R * (low ? 0.28 + rng() * 0.18 : 0.45 + rng() * 0.45);
      lobes.push({ x: lx, z: lz, R, Hh, y: baseHeight(lx, lz) - 0.08 });
    }
    // 株ごとの葉の色（黄緑〜濃い緑）
    const tint = rng(), base = [lerp(0.2, 0.08, tint), lerp(0.36, 0.25, tint), lerp(0.07, 0.06, tint)];
    for (const L of lobes) {
      const nr = Math.round(L.R * L.R * 64 * density * (low ? 0.8 : 1));
      for (let i = 0; i < nr; i++) {
        const u = rng(), a = rng() * TAU;
        const el = Math.acos(1 - u * 0.97);
        const dx = Math.sin(el) * Math.cos(a), dz = Math.sin(el) * Math.sin(a), dy = Math.cos(el);
        const f = 0.9 + rng() * 0.16;
        const px = L.x + dx * L.R * f, pz = L.z + dz * L.R * f, py = L.y + dy * L.Hh * f;
        // ほかの塊の中に隠れる葉は置かない
        if (lobes.some((o) => o !== L && Math.pow((px - o.x) / o.R, 2) + Math.pow((pz - o.z) / o.R, 2) + Math.pow((py - o.y) / o.Hh, 2) < 0.75)) continue;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(dx * 0.9, dy + 0.35, dz * 0.9).normalize());
        q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rng() * TAU));
        const sc = 0.95 + rng() * 0.7;
        m.compose(V3(px, py, pz), q, V3(sc, sc, sc));
        mats.push(m);
        const t = rng() * 0.3, yel = rng() < 0.04 ? 0.6 : 0;    // ときどき黄ばんだ古い葉
        cols.push(new THREE.Color(base[0] + t * 0.1 + yel * 0.3, base[1] + t * 0.14 + yel * 0.08, base[2] + t * 0.04));
        if (rng() < 0.06) {
          const fmx = new THREE.Matrix4();
          const fq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(dx, dy + 0.6, dz).normalize());
          fq.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rng() * TAU));
          fmx.compose(V3(px + dx * 0.12, py + dy * 0.1 + 0.04, pz + dz * 0.12), fq, V3(1, 1, 1));
          fm.push(fmx); fc.push(new THREE.Color(1, 1, 0.97));
        }
      }
    }
    n++;
  }
  const mesh = instancedFrom(geo, mat, mats, cols);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'naupaka';
  parent.add(mesh);
  if (fm.length) { const fl = instancedFrom(fgeo, fmat, fm, fc); fl.name = 'naupaka-flowers'; parent.add(fl); }
  return mesh;
}

// ---------------------------------------------------------------------------
// キダチルリソウ（Heliotropium foertherianum、ハワイでは「ターヒヌ」）: 浜の奥の小さな木。
//  灰色のねじれた幹が何本も斜めに立ち、枝先に、銀色がかった大きな葉のロゼットが、かたまって茂る
function heliotropeTree(barkB, leafB, rng, x, z, H) {
  const y0 = baseHeight(x, z) - 0.08;
  const bark = C(0x7a7266), barkD = C(0x55504a);
  const barkC = (t, a) => mixA(bark, barkD, 0.55 * Math.pow(Math.abs(Math.sin(t * 23 + a * 2)), 4));
  const tips = [];
  const branch = (p, dir, len, r, depth) => {
    const end = p.clone().addScaledVector(dir, len);
    const mid = p.clone().addScaledVector(dir, len * 0.5).add(V3((rng() - 0.5) * 0.35, (rng() - 0.3) * 0.2, (rng() - 0.5) * 0.35));
    tubeAlong(barkB, new THREE.QuadraticBezierCurve3(p, mid, end), 5, 5, (t) => r * (1 - 0.3 * t), barkC);
    if (depth >= 2) { tips.push(end); return; }
    const nk = depth === 0 ? 3 : 2;
    for (let k = 0; k < nk; k++) {
      const a = rng() * TAU;
      const nd = dir.clone().add(V3(Math.cos(a) * 0.9, 0.2 + rng() * 0.35, Math.sin(a) * 0.9)).normalize();
      branch(end, nd, len * (0.55 + rng() * 0.25), r * 0.66, depth + 1);
    }
  };
  const nStem = 2 + Math.floor(rng() * 2);
  for (let k = 0; k < nStem; k++) {
    const a = rng() * TAU, lean = 0.35 + rng() * 0.45;
    branch(V3(x + Math.cos(a) * 0.15, y0, z + Math.sin(a) * 0.15), V3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize(), H * (0.38 + rng() * 0.12), 0.09 + rng() * 0.03, 0);
  }
  // 枝先の、葉のロゼット（倒卵形の大きな葉。表は灰緑、ふちと裏は銀白）
  const lA = C(0x6f8468), lB = C(0x93a58c), lS = C(0xc2cbb8);
  for (const tp of tips) {
    const nR = 6 + Math.floor(rng() * 4);
    for (let r = 0; r < nR; r++) {
      const c = tp.clone().add(V3((rng() - 0.5) * 0.9, (rng() - 0.2) * 0.45, (rng() - 0.5) * 0.9));
      const phase = rng(), nL = 9 + Math.floor(rng() * 4), tilt = rng() * 0.5;
      for (let i = 0; i < nL; i++) {
        const az = i * 2.39996 + rng() * 0.3, el = lerp(0.9, -0.35, (i % 6) / 6) - tilt * 0.3;
        const L = 0.3 + rng() * 0.16;
        const hx = Math.cos(az), hz = Math.sin(az), sxv = -hz, szv = hx;
        const N = 4;
        let prev = null;
        for (let k = 0; k <= N; k++) {
          const sl = k / N, d = L * sl;
          const px = c.x + hx * d * Math.cos(el), py = c.y + d * Math.sin(el) - sl * sl * L * 0.35, pz = c.z + hz * d * Math.cos(el);
          const ww = 0.075 * Math.sin(Math.PI * Math.min(1, 0.12 + sl * 0.8)) + 0.008;
          const col = mixA(mixA(lA, lB, rng() * 0.5), lS, Math.pow(sl, 2) * 0.35);
          const a = leafB.v(V3(px + sxv * ww, py + ww * 0.25, pz + szv * ww), col, 0.5 + sl * 0.4, phase);
          const b = leafB.v(V3(px - sxv * ww, py + ww * 0.25, pz - szv * ww), col, 0.5 + sl * 0.4, phase);
          if (prev) leafB.quad(prev[0], a, prev[1], b);
          prev = [a, b];
        }
      }
    }
  }
}

export function buildHeliotrope(parent, { count = 9 } = {}) {
  const rng = mulberry32(7171);
  const barkB = new Builder(), leafB = new Builder();
  const placed = [];
  let n = 0, guard = 0;
  while (n < count && guard++ < 4000) {
    const x = (rng() * 2 - 1) * 80, z = -26 + rng() * 80;
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 4.5 || s > 16 || Math.abs(th) < 1.15) continue;
    if (Math.abs(x) < 8 && z > SHORE_Z - 5) continue;
    if (nearTank(x, z, 3)) continue;
    if (baseHeight(x, z) < 0.4) continue;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9)) continue;
    placed.push([x, z]);
    heliotropeTree(barkB, leafB, rng, x, z, 2.6 + rng() * 1.6);
    n++;
  }
  const bark = new THREE.Mesh(barkB.geo(), barkMaterial());
  const leaves = new THREE.Mesh(leafB.geo(), leafMaterial({ roughness: 0.75 }));
  for (const m of [bark, leaves]) { m.castShadow = true; m.receiveShadow = true; }
  bark.name = 'heliotrope-bark'; leaves.name = 'heliotrope-leaves';
  parent.add(bark, leaves);
}

// ---------------------------------------------------------------------------
// イリマ（Sida fallax）: ひざの高さの、灰緑の小さな葉の茂み。黄色〜橙の小さな花
export function buildIlima(parent, { count = 40, density = 1 } = {}) {
  const rng = mulberry32(8282);
  const geo = rosetteGeo();
  const fgeo = flowerGeo(5, TAU, 0.022, [0.95, 0.55, 0.1], [1, 0.72, 0.15]);
  const mats = [], cols = [], fm = [], fc = [];
  let n = 0, guard = 0;
  while (n < count && guard++ < 6000) {
    const x = (rng() * 2 - 1) * 100, z = -22 + rng() * 100;
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 5 || s > 32 || Math.abs(th) < 1.15) continue;
    if (Math.abs(x) < 6 && z > SHORE_Z - 5) continue;
    if (nearTank(x, z, 1)) continue;
    const y = baseHeight(x, z);
    if (y < 0.4) continue;
    const R = 0.35 + rng() * 0.45, Hh = R * (0.7 + rng() * 0.4);
    const nr = Math.round(R * R * 110 * density);
    for (let i = 0; i < nr; i++) {
      const u = rng(), a = rng() * TAU, el = Math.acos(1 - u * 0.95);
      const dx = Math.sin(el) * Math.cos(a), dz = Math.sin(el) * Math.sin(a), dy = Math.cos(el);
      const px = x + dx * R, pz = z + dz * R, py = y - 0.05 + dy * Hh;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(dx, dy + 0.4, dz).normalize());
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rng() * TAU));
      const sc = 0.4 + rng() * 0.25;
      m.compose(V3(px, py, pz), q, V3(sc, sc, sc));
      mats.push(m);
      const t = rng() * 0.25;
      cols.push(new THREE.Color(0.17 + t * 0.06, 0.22 + t * 0.07, 0.12 + t * 0.04));   // 灰色がかった緑
      if (rng() < 0.12) {
        const fmx = new THREE.Matrix4();
        fmx.compose(V3(px + dx * 0.05, py + 0.03, pz + dz * 0.05), new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(dx, dy + 1, dz).normalize()), V3(1, 1, 1));
        fm.push(fmx); fc.push(new THREE.Color(1, 1, 1));
      }
    }
    n++;
  }
  const mesh = instancedFrom(geo, leafMaterial({ roughness: 0.75 }), mats, cols);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'ilima';
  parent.add(mesh);
  if (fm.length) { const fl = instancedFrom(fgeo, leafMaterial({ roughness: 0.7 }), fm, fc); fl.name = 'ilima-flowers'; parent.add(fl); }
}

// ---------------------------------------------------------------------------
// ポーフエフエ（グンバイヒルガオ）: 砂の上をはう蔓。ヤギの足あとのような、先がへこんだ丸い葉。赤紫のラッパ形の花
function goatLeafGeo() {
  const B = new Builder();
  const c0 = [0.55, 0.8, 0.45], c1 = [0.85, 1, 0.7];
  const ctr = B.v(V3(0, 0.0, 0.0), c0, 0.3, 0);
  const n = 10, R = 0.05;
  let prev = null, first = null;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const notch = 1 - 0.35 * Math.exp(-Math.pow(Math.atan2(Math.sin(a), Math.cos(a)) / 0.35, 2));   // 先（+x）がへこむ
    const r = R * notch;
    const v = B.v(V3(Math.cos(a) * r + R * 0.6, 0.012 * (1 - Math.cos(a) * 0.3), Math.sin(a) * r * 0.95), c1, 0.6, 0);
    if (prev !== null) B.tri(ctr, prev, v);
    prev = v; if (first === null) first = v;
  }
  return B.geo();
}

export function buildBeachVines(parent, { count = 26, density = 1 } = {}) {
  const rng = mulberry32(9393);
  const lgeo = goatLeafGeo();
  const fgeo = flowerGeo(5, TAU, 0.03, [0.55, 0.12, 0.35], [0.85, 0.35, 0.62]);
  const mats = [], cols = [], fm = [], fc = [];
  let n = 0, guard = 0;
  while (n < count && guard++ < 6000) {
    const x = (rng() * 2 - 1) * 100, z = -22 + rng() * 100;
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 2.2 || s > 14 || Math.abs(th) < 1.15) continue;
    if (Math.abs(x) < 6 && z > SHORE_Z - 5) continue;
    if (nearTank(x, z, 1)) continue;
    // 1か所から、何本もの蔓が砂の上へのびる
    const nRun = Math.round((4 + rng() * 6) * density);
    for (let r = 0; r < nRun; r++) {
      let px = x, pz = z, a = rng() * TAU;
      const len = 1.5 + rng() * 4.5;
      for (let d = 0; d < len; d += 0.13) {
        a += (rng() - 0.5) * 0.5;
        px += Math.cos(a) * 0.13; pz += Math.sin(a) * 0.13;
        if (pondSigned(px, pz) < 1.6 || nearTank(px, pz)) break;
        const side = (Math.floor(d / 0.13) % 2) * 2 - 1;
        const la = a + side * (0.9 + rng() * 0.5);
        const y = baseHeight(px, pz) + 0.015 + rng() * 0.04;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -la);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), (rng() - 0.5) * 0.5));
        const sc = 0.8 + rng() * 0.6;
        m.compose(V3(px, y, pz), q, V3(sc, sc, sc));
        mats.push(m);
        const t = rng() * 0.3;
        cols.push(new THREE.Color(0.1 + t * 0.06, 0.24 + t * 0.12, 0.06 + t * 0.03));
        if (rng() < 0.045) {
          const fmx = new THREE.Matrix4();
          fmx.compose(V3(px, y + 0.05, pz), new THREE.Quaternion(), V3(1, 1, 1));
          fm.push(fmx); fc.push(new THREE.Color(1, 1, 1));
        }
      }
    }
    n++;
  }
  const mat = leafMaterial({ roughness: 0.45 });
  const mesh = instancedFrom(lgeo, mat, mats, cols);
  mesh.receiveShadow = true; mesh.name = 'beach-vines';
  parent.add(mesh);
  if (fm.length) { const fl = instancedFrom(fgeo, leafMaterial({ roughness: 0.6 }), fm, fc); fl.name = 'vine-flowers'; parent.add(fl); }
}

// ---------------------------------------------------------------------------
// 浜の草の株
function tuftGeo() {
  const B = new Builder();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + i * 0.7, lean = 0.25 + (i % 3) * 0.15, h = 0.28 + (i % 4) * 0.06;
    const ca = Math.cos(a), sa = Math.sin(a), w = 0.012;
    const P = (s) => V3(ca * lean * h * s * s * 1.4, h * s, sa * lean * h * s * s * 1.4);
    const c0 = [0.55, 0.6, 0.3], c1 = [1.0, 1.0, 0.65];
    const p0 = P(0), p1 = P(0.55), p2 = P(1);
    const a0 = B.v(V3(p0.x - sa * w, p0.y, p0.z + ca * w), c0, 0, 0), b0 = B.v(V3(p0.x + sa * w, p0.y, p0.z - ca * w), c0, 0, 0);
    const a1 = B.v(V3(p1.x - sa * w * 0.7, p1.y, p1.z + ca * w * 0.7), mixA(c0, c1, 0.5), 0.5, 0), b1 = B.v(V3(p1.x + sa * w * 0.7, p1.y, p1.z - ca * w * 0.7), mixA(c0, c1, 0.5), 0.5, 0);
    const t = B.v(p2, c1, 1, 0);
    B.quad(a0, a1, b0, b1); B.tri(a1, t, b1);
  }
  return B.geo();
}

// 背の高い株立ちの草（穂がつく）。ひざ〜腰の高さで、先は枯れ色
function tallGrassGeo() {
  const B = new Builder();
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + i * 1.3, lean = 0.2 + (i % 4) * 0.12, h = 0.55 + (i % 5) * 0.09;
    const ca = Math.cos(a), sa = Math.sin(a), w = 0.01;
    const P = (t) => V3(ca * lean * h * t * t * 1.5, h * t - lean * h * t * t * t * 0.35, sa * lean * h * t * t * 1.5);
    const c0 = [0.45, 0.55, 0.28], c1 = [1.0, 0.92, 0.62];
    let prev = null;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, p = P(t), ww = w * (1 - t * 0.8);
      const c = mixA(c0, c1, Math.pow(t, 1.5));
      const va = B.v(V3(p.x - sa * ww, p.y, p.z + ca * ww), c, t, 0), vb = B.v(V3(p.x + sa * ww, p.y, p.z - ca * ww), c, t, 0);
      if (prev) B.quad(prev[0], va, prev[1], vb);
      prev = [va, vb];
    }
    // 穂
    if (i % 3 === 0) {
      const p = P(1), q = P(1.12);
      const hc = [1.0, 0.9, 0.6];
      const h0 = B.v(V3(p.x - 0.012, p.y, p.z), hc, 1, 0), h1 = B.v(V3(p.x + 0.012, p.y, p.z), hc, 1, 0), h2 = B.v(V3(q.x, q.y + 0.08, q.z), hc, 1, 0);
      B.tri(h0, h1, h2);
    }
  }
  return B.geo();
}

export function buildTallGrass(parent, { count = 500 } = {}) {
  const rng = mulberry32(5757);
  const geo = tallGrassGeo();
  const mats = [], cols = [];
  let guard = 0;
  while (mats.length < count && guard++ < count * 6) {
    const cx = (rng() * 2 - 1) * 95, cz = -22 + rng() * 98;
    const s0 = pondSigned(cx, cz), th = thOf(cx, cz);
    if (s0 < 7 || s0 > 60 || Math.abs(th) < 1.12) continue;
    if (rng() > smoothstep(7, 14, s0) * smoothstep(60, 40, s0)) continue;   // 浜の奥の草地に多い
    const k = 4 + Math.floor(rng() * 14), R = 0.8 + rng() * 2.2, tone = rng();
    for (let i = 0; i < k && mats.length < count; i++) {
      const a = rng() * TAU, d = Math.pow(rng(), 0.6) * R;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (pondSigned(x, z) < 6 || nearTank(x, z)) continue;
      const sc = 0.85 + rng() * 0.8;
      mats.push(M(x, baseHeight(x, z) - 0.03, z, (rng() - 0.5) * 0.15, rng() * TAU, (rng() - 0.5) * 0.15, sc, sc * (0.8 + rng() * 0.5), sc));
      const t = rng() * 0.5 + tone * 0.5;
      cols.push(new THREE.Color(0.32 + t * 0.2, 0.36 + t * 0.12, 0.14 + t * 0.06));
    }
  }
  const mesh = instancedFrom(geo, leafMaterial({ roughness: 0.85 }), mats, cols);
  mesh.receiveShadow = true; mesh.name = 'tall-grass';
  parent.add(mesh);
}

export function buildBeachGrass(parent, { count = 2200 } = {}) {
  const rng = mulberry32(6262);
  const geo = tuftGeo();
  const mat = leafMaterial({ roughness: 0.8 });
  const mats = [], cols = [];
  let guard = 0;
  // 草は、まとまった株の群れで生える
  while (mats.length < count && guard++ < count * 4) {
    const cx = (rng() * 2 - 1) * 90, cz = -20 + rng() * 95;
    const s0 = pondSigned(cx, cz), th = thOf(cx, cz);
    if (s0 < 5 || s0 > 70 || Math.abs(th) < 1.1) continue;
    if (rng() < smoothstep(2.28, 1.78, Math.abs(th)) * 0.6) continue;
    if (rng() > smoothstep(5, 14, s0)) continue;
    const k = 8 + Math.floor(rng() * 26), R = 0.8 + rng() * 2.2, tone = rng();
    for (let i = 0; i < k && mats.length < count; i++) {
      const a = rng() * TAU, d = Math.pow(rng(), 0.7) * R;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (pondSigned(x, z) < 4.5 || nearTank(x, z)) continue;
      const gy = baseHeight(x, z);
      const sc = (0.9 + rng() * 1.0) * (1 - 0.4 * d / R);
      mats.push(M(x, gy - 0.02, z, 0, rng() * TAU, 0, sc, sc * (0.9 + rng() * 0.6), sc));
      const t = rng() * 0.5 + tone * 0.5;
      cols.push(new THREE.Color(0.3 + t * 0.22, 0.4 + t * 0.14, 0.13 + t * 0.07));
    }
  }
  const mesh = instancedFrom(geo, mat, mats, cols);
  mesh.receiveShadow = true; mesh.name = 'beach-grass';
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// 頂点を共有した球（なめらかな陰影になる）
function smoothSphere(detail) {
  const g0 = new THREE.IcosahedronGeometry(1, detail);
  const pos = g0.attributes.position, map = new Map(), idx = [], out = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!map.has(k)) { map.set(k, out.length / 3); out.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(map.get(k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setIndex(idx);
  return g;
}

// 丘の木々（マンゴー・ククイ・ハウなど）: こんもり丸い樹冠。小さな葉むらの粒が、ドームの上にかさなる
function canopyGeo(seed) {
  const parts = [];
  const rng = mulberry32(seed);
  const trunk = new THREE.CylinderGeometry(0.1, 0.2, 2.0, 6, 1);
  trunk.translate(0, 1.0, 0);
  colorize(trunk, () => [0.9, 0.6, 0.75]);   // インスタンスの緑で染まるので、明るめにしておく（灰茶になる）
  parts.push(trunk);
  const n = 11 + Math.floor(rng() * 4);
  const top = 2.55;
  for (let i = 0; i < n; i++) {
    const g = smoothSphere(i === 0 ? 2 : 1);
    let cx = 0, cy = top, cz = 0, s = 1.3;
    if (i >= n - 3) {
      // 下の葉むら: 樹冠のすそを地面ちかくまで下ろす（遠くから幹が杭のように見えないように）
      const a = (i / 3) * TAU + rng();
      cx = Math.cos(a) * 0.75; cz = Math.sin(a) * 0.75; cy = top - 0.95; s = 0.7 + rng() * 0.2;
    } else if (i > 0) {
      const a = (i / (n - 1)) * TAU + rng() * 0.6, el = 0.12 + rng() * 0.95, R = 1.0 + rng() * 0.15;
      cx = Math.cos(a) * Math.cos(el) * R; cz = Math.sin(a) * Math.cos(el) * R;
      cy = top + Math.sin(el) * R * 0.7 - 0.12;
      s = 0.6 + rng() * 0.32;
    }
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      // 葉むらの輪郭は、なめらかな玉ではなく、でこぼこ（遠目にも、葉のかたまりの重なりに見えるように）
      const d = 1 + 0.2 * noise2(x * 2.3 + seed + i, z * 2.3 + y * 1.7) + 0.12 * noise2(x * 5 + i, y * 5 + z * 4) + 0.06 * noise2(x * 11 - i, z * 11 + y * 9);
      p.setXYZ(k, x * d * s, y * d * s * 0.8, z * d * s);
    }
    g.translate(cx, cy, cz);
    g.computeVertexNormals();
    // 下の葉は影で暗く、上は日ざしで明るい
    colorize(g, (x, y, z) => { const t = smoothstep(1.7, 3.6, y); const f = 0.5 + 0.5 * noise2(x * 4, z * 4 + y * 3); const gap = smoothstep(0.35, 0.0, noise2(x * 7 + i, z * 7 + y * 6) + 0.25) * 0.45; return [(0.42 + t * 0.62 + f * 0.12) * (1 - gap), (0.52 + t * 0.48 + f * 0.12) * (1 - gap), (0.4 + t * 0.26) * (1 - gap)]; });
    parts.push(g);
  }
  return mergeGeos(parts);
}

export function buildHillTrees(parent, { count = 900 } = {}) {
  const rng = mulberry32(8181);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  patchMaterial(mat, { underwater: true, detail: 'leaf', translucent: 0.9 });
  const variants = [canopyGeo(11), canopyGeo(23), canopyGeo(37)];
  const buckets = variants.map(() => ({ mats: [], cols: [] }));
  const okAt = (x, z) => {
    const s = pondSigned(x, z), th = thOf(x, z);
    if (s < 30 || Math.abs(th) < 0.95) return null;
    const gy = baseHeight(x, z);
    if (gy < 1.5) return null;
    const gx = baseHeight(x + 2, z) - gy, gz = baseHeight(x, z + 2) - gy;
    if (Math.hypot(gx, gz) / 2 > 0.85) return null;
    return gy;
  };
  // 木は、ひとかたまりの林（森）になって生える。浜のちかくには生やさない
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 6) {
    const a = rng() * TAU, r = 45 + Math.pow(rng(), 0.8) * 420;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (okAt(cx, cz) == null) continue;
    const k = 10 + Math.floor(rng() * 18), R = 7 + rng() * 11 + r * 0.03;   // 林は、木がすきまなく寄りあう
    const tone = rng();
    for (let i = 0; i < k && n < count; i++) {
      const aa = rng() * TAU, d = Math.sqrt(rng()) * R;
      const x = cx + Math.cos(aa) * d, z = cz + Math.sin(aa) * d;
      const gy = okAt(x, z);
      if (gy == null) continue;
      const b = buckets[Math.floor(rng() * variants.length)];
      const sc = (1.2 + rng() * 1.0) * (1 + r / 300);
      b.mats.push(M(x, gy - 0.95 * sc, z, 0, rng() * TAU, 0, sc * 1.2, sc * (0.85 + rng() * 0.3), sc * 1.2));
      const t = rng() * 0.6 + tone * 0.4;
      // ところどころに、白っぽい葉のククイ（銀緑）がまじる
      if (rng() < 0.16) b.cols.push(new THREE.Color(0.2 + t * 0.05, 0.29 + t * 0.06, 0.17 + t * 0.04));
      else b.cols.push(new THREE.Color(0.11 + t * 0.09, 0.22 + t * 0.13, 0.07 + t * 0.04));
      n++;
    }
  }
  variants.forEach((g, i) => {
    if (!buckets[i].mats.length) return;
    const m = instancedFrom(g, mat, buckets[i].mats, buckets[i].cols);
    m.castShadow = true; m.receiveShadow = true; m.name = 'hill-trees';
    parent.add(m);
  });
}
