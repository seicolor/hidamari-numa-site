// 植物：草・ススキ・ガマ・彼岸花・スイレン・樹木・岩
import { SEASON } from './season.js';
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smoothstep, fbm2, noise2, hexToLinear, TAU } from '../util.js';
import { terrainHeight, pondSigned, pathDistance, HOUSE, SHORE_Z, PATH } from './terrain.js';
import { patchMaterial, G } from '../materials.js';
import { mergeGeos, colorize, colorFlat, displace, M, instancedFrom } from '../geo.js';
import { canvasTexture } from '../textures.js';

const lin = (hex) => hexToLinear(hex);

// ---------------------------------------------------------------------------
// 草のブレード
function bladeGeometry(segs = 3) {
  const pos = [], idx = [];
  for (let r = 0; r <= segs; r++) {
    const t = r / segs;
    pos.push(-0.5, t, 0, 0.5, t, 0);
  }
  for (let r = 0; r < segs; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const BLADE_VERT_PARS = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iParams;
varying vec3 vBladeCol;
uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uDry;
uniform float uWidth; uniform float uPlume; uniform vec2 uWind;
`;

const BLADE_NORMAL = /* glsl */ `
  { float yw = iParams.y; objectNormal = normalize( vec3( sin(yw)*0.5, 1.0, cos(yw)*0.5 ) ); }
`;

const BLADE_BEGIN = /* glsl */ `
  {
    float h = iParams.x, yaw = iParams.y, bend = iParams.z, seed = iParams.w;
    float cy = cos(yaw), sy = sin(yaw);
    float t = position.y;
    vec3 local;
    if (uPlume > 0.5) {
      t = 1.0;
      local = vec3(0.0, h, bend*h) + position * 1.0;
      local.y -= bend*bend*h*0.25;
    } else {
      float wsc = 1.0 + smoothstep(10.0, 70.0, length(iPos - cameraPosition)) * 2.4;
      local = vec3( position.x * uWidth * wsc * (1.0 - pow(t,1.3)*0.9), t*h, 0.0 );
      local.z += bend * t*t * h;
      local.y -= bend*bend * t*t * h * 0.25;
    }
    vec3 wp = vec3( local.x*cy + local.z*sy, local.y, -local.x*sy + local.z*cy );
    float ph = uTime*1.35 + iPos.x*0.21 + iPos.z*0.17;
    float gust = sin(uTime*0.5 + iPos.x*0.05 + iPos.z*0.04)*0.5 + 0.5;
    float sw = sin(ph + seed*6.283)*0.5 + sin(ph*2.3 + seed*17.0)*0.25 + 0.35 + gust*0.55;
    wp.xz += uWind * sw * t*t * h * 0.2;
    transformed = iPos + wp;
    float v1 = fract(seed*7.31), v2 = fract(seed*13.7);
    vec3 c = mix(uBase, uTip, t);
    c = mix(c, uDry, step(0.72, v1)*0.75*(0.35+0.65*t));
    c *= 0.78 + 0.42*v2;
    c *= mix(0.4, 1.0, smoothstep(0.0, 0.5, t));
    vBladeCol = c;
  }
`;

function bladeMaterial({ base, tip, dry, width = 0.05, plume = false, roughness = 0.85, vertexColors = false }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, side: THREE.DoubleSide, vertexColors });
  mat.userData.vertPars = BLADE_VERT_PARS;
  mat.userData.extraUniforms = {
    uBase: { value: new THREE.Color(...base) },
    uTip: { value: new THREE.Color(...tip) },
    uDry: { value: new THREE.Color(...dry) },
    uWidth: { value: width },
    uPlume: { value: plume ? 1 : 0 },
    uWind: G.uWind,
  };
  mat.userData.patchKey = plume ? 'plume' : 'blade';
  patchMaterial(mat, {
    underwater: true,
    translucent: plume ? 2.2 : 1.8,
    vertex: BLADE_BEGIN,
    normalVertex: BLADE_NORMAL,
    fragment: (fs) =>
      fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + (plume ? '' : 'diffuseColor.rgb *= vBladeCol;')).replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nvarying vec3 vBladeCol;'),
  });
  return mat;
}

function bladeMesh(inst, mat, geo) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  g.setAttribute('position', geo.attributes.position);
  if (geo.attributes.normal) g.setAttribute('normal', geo.attributes.normal);
  if (geo.attributes.color) g.setAttribute('color', geo.attributes.color);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(inst.pos, 3));
  g.setAttribute('iParams', new THREE.InstancedBufferAttribute(inst.params, 4));
  g.instanceCount = inst.count;
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.receiveShadow = true;
  return m;
}

class InstBuf {
  constructor(n) {
    this.pos = new Float32Array(n * 3);
    this.params = new Float32Array(n * 4);
    this.count = 0;
    this.cap = n;
  }
  push(x, y, z, h, yaw, bend, seed) {
    if (this.count >= this.cap) return false;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.params[i * 4] = h; this.params[i * 4 + 1] = yaw; this.params[i * 4 + 2] = bend; this.params[i * 4 + 3] = seed;
    return true;
  }
}

// 穂（ススキ）
function plumeGeometry(rng, spikes = 16, len = 0.3, droop = 0.4) {
  const pos = [], col = [];
  const base = lin(0x9a7a4a), tipc = lin(0xefe2c6);
  for (let i = 0; i < spikes; i++) {
    const az = rng() * TAU;
    const spread = 0.12 + rng() * 0.35;
    const L = len * (0.55 + rng() * 0.6);
    const dx = Math.sin(az) * spread, dz = Math.cos(az) * spread;
    const w = 0.011;
    const y0 = rng() * len * 0.45;
    const steps = 3;
    let prev = null;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = dx * L * t * 1.1 + Math.sin(az) * droop * t * t * 0.1;
      const y = y0 + L * t * (1 - spread * 0.4) - droop * t * t * L * 0.25;
      const z = dz * L * t * 1.1 + Math.cos(az) * droop * t * t * 0.1;
      const ww = w * (1 - t * 0.85);
      const px = Math.cos(az) * ww, pz = -Math.sin(az) * ww;
      const cur = [[x - px, y, z - pz], [x + px, y, z + pz]];
      const c = [lerpC(base, tipc, t * (0.5 + rng() * 0.5))];
      if (prev) {
        const tri = (a, b, c3) => {
          pos.push(...a, ...b, ...c3);
          const cc = lerpC(base, tipc, t * 0.9 + 0.1);
          const cp = lerpC(base, tipc, (s - 1) / steps * 0.9 + 0.1);
          col.push(...cp, ...cp, ...cc);
        };
        tri(prev[0], prev[1], cur[0]);
        tri(prev[1], cur[1], cur[0]);
      }
      prev = cur;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // 法線を上向き寄りにして柔らかく
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.4, 0.9, n.getZ(i) * 0.4);
  return g;
}
const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------------------
export function buildGrass(scene, { density = 1, camPos }) {
  const group = new THREE.Group();
  group.name = 'grass';
  const rng = mulberry32(2024);
  const cx = camPos.x, cz = camPos.z;
  const gd = density * SEASON.blade.density;   // 冬は草がまばら、夏はこい
  const meadow = new InstBuf(Math.floor(105000 * gd));
  const meadowTall = new InstBuf(Math.floor(30000 * gd));

  const tryMeadow = (x, z, hMin, hMax, buf, tall) => {
    const s = pondSigned(x, z);
    if (s < 0.5) return;
    const pd = pathDistance(x, z);
    if (pd < 0.9 && rng() < 0.92) return;
    const dh = Math.hypot(x - HOUSE.x, z - HOUSE.z);
    if (dh < 8) return;
    // 桟橋の付け根は刈られて短い
    const dp = Math.hypot(x - 0, z - (SHORE_Z + 1.5));
    const y = terrainHeight(x, z);
    let h = lerp(hMin, hMax, rng());
    h *= 0.55 + 0.9 * (fbm2(x * 0.08, z * 0.08, 2) * 0.5 + 0.5);
    if (dp < 4.5) h *= 0.4 + 0.6 * smoothstep(1, 4.5, dp);
    // 岸のきわは草が低い
    h *= 0.5 + 0.5 * smoothstep(0.5, 3, s);
    const clusters = 1;
    buf.push(x, y - 0.02, z, h, rng() * TAU, (rng() - 0.3) * 0.7, rng());
  };

  const disc = (r0, r1, perM2, buf, hMin, hMax) => {
    const area = Math.PI * (r1 * r1 - r0 * r0);
    const n = Math.floor(area * perM2 * gd);
    for (let i = 0; i < n && buf.count < buf.cap; i++) {
      const r = Math.sqrt(lerp(r0 * r0, r1 * r1, rng()));
      const a = rng() * TAU;
      tryMeadow(cx + Math.cos(a) * r, cz + Math.sin(a) * r, hMin, hMax, buf);
    }
  };
  disc(0, 6, 90, meadow, 0.22, 0.5);
  disc(6, 20, 38, meadow, 0.25, 0.6);
  disc(20, 50, 9, meadow, 0.3, 0.7);
  disc(50, 110, 1.4, meadowTall, 0.45, 0.95);

  const B = SEASON.blade;
  const bl = (a) => ({ base: lin(a[0]), tip: lin(a[1]), dry: lin(a[2]) });
  const matMeadow = bladeMaterial({ ...bl(B.meadow), width: 0.045 });
  const matMeadowTall = bladeMaterial({ ...bl(B.tall), width: 0.075 });
  const bg = bladeGeometry(3);
  group.add(bladeMesh(meadow, matMeadow, bg));
  group.add(bladeMesh(meadowTall, matMeadowTall, bladeGeometry(2)));

  // ---- 岸辺の草むら（ススキ・ヨシ・ガマ） ----
  const susukiStalks = new InstBuf(Math.floor(9000 * density));
  const susukiPlume = new InstBuf(Math.floor(2400 * density));
  const reedStalks = new InstBuf(Math.floor(7000 * density));
  const reedPlume = new InstBuf(Math.floor(1200 * density));
  const gamaStalks = new InstBuf(Math.floor(5000 * density));
  const gamaHead = new InstBuf(Math.floor(600 * density));

  const clump = (x, z, kind) => {
    const y = terrainHeight(x, z);
    const n = kind === 'susuki' ? 8 + Math.floor(rng() * 10) : kind === 'reed' ? 6 + Math.floor(rng() * 8) : 5 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * (kind === 'susuki' ? 0.45 : 0.55);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const py = terrainHeight(px, pz) - 0.02;
      const out = a; // 外側へ垂れる
      if (kind === 'susuki') {
        const h = 1.1 + rng() * 0.9;
        susukiStalks.push(px, py, pz, h, out + (rng() - 0.5) * 0.6, 0.35 + rng() * 0.8, rng());
        if (rng() < 0.32) {
          const ph = h * (1.05 + rng() * 0.25);
          const yaw = out + (rng() - 0.5) * 0.4;
          const bend = 0.12 + rng() * 0.35;
          susukiStalks.push(px, py, pz, ph, yaw, bend, rng());
          const rp = rng();
          if (SEASON.plumes) susukiPlume.push(px, py, pz, ph, yaw, bend, rp);   // 穂が出るのは秋から冬
        }
      } else if (kind === 'reed') {
        const h = 1.7 + rng() * 1.3;
        reedStalks.push(px, py, pz, h, out + (rng() - 0.5) * 0.5, 0.25 + rng() * 0.55, rng());
        if (rng() < 0.2) {
          const yaw = out, bend = 0.2 + rng() * 0.3, ph = h * 1.04;
          reedStalks.push(px, py, pz, ph, yaw, bend, rng());
          const rq = rng();
          if (SEASON.reedPlumes) reedPlume.push(px, py, pz, ph, yaw, bend, rq);
        }
      } else {
        const h = 1.2 + rng() * 0.9;
        gamaStalks.push(px, py, pz, h, out, 0.12 + rng() * 0.3, rng());
        if (rng() < 0.45) {
          const yaw = rng() * TAU, bend = 0.02 + rng() * 0.08, ph = h * (1.05 + rng() * 0.2);
          gamaStalks.push(px, py, pz, ph, yaw, bend, rng());
          gamaHead.push(px, py, pz, ph * 0.86, yaw, bend, rng());
        }
      }
    }
  };

  // 沼のふち一周に配置（桟橋・視界の正面は少し抜く）
  const placeAround = (kind, count, sMin, sMax, bias) => {
    let placed = 0, tries = 0;
    while (placed < count * density && tries < count * 40) {
      tries++;
      const a = rng() * TAU;
      const px = Math.cos(a) * 60, pz = Math.sin(a) * 60;
      // 外側から内側へマーチして岸線を探す
      let r = 60;
      let s = pondSigned(px, pz);
      let x = px, z = pz;
      for (let k = 0; k < 80 && s > 0.2; k++) {
        r -= 0.8;
        x = Math.cos(a) * r * 1.0;
        z = Math.sin(a) * r;
        s = pondSigned(x, z);
      }
      // 岸線の方向 (x,z) からオフセット
      const off = lerp(sMin, sMax, rng());
      const dirx = Math.cos(a), dirz = Math.sin(a);
      const cxp = x + dirx * off, czp = z + dirz * off;
      const ss = pondSigned(cxp, czp);
      if (kind === 'gama' && (ss > -0.1 || ss < -3.2)) continue;
      if (kind !== 'gama' && (ss < sMin * 0.0 - 0.6 && kind === 'reed' && ss < -1.4)) continue;
      // 桟橋の近く（x∈[-3.2,3.2], z>SHORE_Z-8）は避ける
      if (Math.abs(cxp) < 3.6 && czp > SHORE_Z - 9) continue;
      // 正面の見晴らしの一部は抜く
      if (kind === 'reed' && Math.abs(cxp) < 7 && czp > SHORE_Z - 12) continue;
      if (pathDistance(cxp, czp) < 1.4) continue;
      if (terrainHeight(cxp, czp) > 4) continue;
      // 偏り: ノイズで群生
      const m = fbm2(cxp * 0.09 + bias, czp * 0.09, 2) * 0.5 + 0.5;
      if (m < 0.42) continue;
      clump(cxp, czp, kind);
      placed++;
    }
  };
  placeAround('susuki', 150, 0.8, 5.5, 3);
  placeAround('reed', 100, -0.2, 1.8, 11);
  placeAround('gama', 80, -0.1, -2.6, 23);
  // 桟橋の両わきの浅瀬に葦とガマ（手前の額縁になる）
  for (let k = 0; k < 40 * density; k++) {
    const sg = rng() < 0.5 ? -1 : 1;
    const x = sg * (5 + rng() * 9), z = SHORE_Z - 0.5 - rng() * 9;
    const s = pondSigned(x, z);
    if (s > -0.3 || s < -6.5 || pathDistance(x, z) < 1) continue;
    clump(x, z, rng() < 0.55 ? 'reed' : 'gama');
  }
  // 陸のススキ原（遠景で風に揺れる）
  for (let i = 0; i < 90 * density; i++) {
    const a = rng() * TAU, r = 18 + rng() * 40;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
    if (pondSigned(x, z) < 3) continue;
    if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < 11 || pathDistance(x, z) < 1.8) continue;
    if (terrainHeight(x, z) > 9) continue;
    if (fbm2(x * 0.04 + 5, z * 0.04, 2) < 0.02) continue;
    clump(x, z, 'susuki');
  }

  const matSusukiStalk = bladeMaterial({ ...bl(B.susuki), width: 0.032 });
  const matReedStalk = bladeMaterial({ ...bl(B.reed), width: 0.045 });
  const matGama = bladeMaterial({ ...bl(B.gama), width: 0.03 });
  group.add(bladeMesh(susukiStalks, matSusukiStalk, bladeGeometry(4)));
  group.add(bladeMesh(reedStalks, matReedStalk, bladeGeometry(4)));
  group.add(bladeMesh(gamaStalks, matGama, bladeGeometry(4)));

  const plumeMat = bladeMaterial({ base: [1, 1, 1], tip: [1, 1, 1], dry: [1, 1, 1], plume: true, vertexColors: true, roughness: 0.6 });
  const plumeG = plumeGeometry(mulberry32(5), 22, 0.34, 0.5);
  group.add(bladeMesh(susukiPlume, plumeMat, plumeG));
  const reedPlumeMat = bladeMaterial({ base: [1, 1, 1], tip: [1, 1, 1], dry: [1, 1, 1], plume: true, vertexColors: true, roughness: 0.6 });
  const reedG = plumeGeometry(mulberry32(9), 18, 0.3, 0.8);
  colorize(reedG, (x, y, z) => {
    const t = clamp(y / 0.34);
    return lerpC(lin(0x5a3f26), lin(0xb9a07a), t);
  });
  group.add(bladeMesh(reedPlume, reedPlumeMat, reedG));

  const gamaG = new THREE.CylinderGeometry(0.022, 0.022, 0.2, 7, 1);
  gamaG.translate(0, 0.1, 0);
  const stick = new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4, 1);
  stick.translate(0, 0.28, 0);
  const gamaHeadG = mergeGeos([colorFlat(gamaG, lin(0x4a2e18)), colorFlat(stick, lin(0x8a9a4a))]);
  const gamaMat = bladeMaterial({ base: [1, 1, 1], tip: [1, 1, 1], dry: [1, 1, 1], plume: true, vertexColors: true, roughness: 0.9 });
  group.add(bladeMesh(gamaHead, gamaMat, gamaHeadG));

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// 彼岸花
export function buildHigan(scene, { density = 1 }) {
  const rng = mulberry32(777);
  const petals = [];
  const red = lin(0xd2121f), redD = lin(0x7a0a12), stemC = lin(0x6a8a36);
  const stem = new THREE.CylinderGeometry(0.004, 0.006, 0.5, 5, 1);
  stem.translate(0, 0.25, 0);
  colorFlat(stem, stemC);
  petals.push(stem);
  // 反り返る6枚の花被片
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const pts = [];
    const segs = 6;
    const pos = [], col = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = Math.sin(t * 2.2) * 0.065;
      const y = 0.5 + Math.sin(t * Math.PI * 0.9) * 0.05 - t * t * 0.02;
      const w = 0.006 * (1 - t) + 0.004;
      pts.push({ r, y, w });
    }
    for (let s = 0; s < segs; s++) {
      const p0 = pts[s], p1 = pts[s + 1];
      const v = (p, side) => [Math.cos(a) * p.r + Math.cos(a + 1.57) * p.w * side, p.y + (side * 0.002), Math.sin(a) * p.r + Math.sin(a + 1.57) * p.w * side];
      const A = v(p0, -1), B = v(p0, 1), C = v(p1, -1), D = v(p1, 1);
      pos.push(...A, ...B, ...C, ...B, ...D, ...C);
      const c0 = s / segs, c1 = (s + 1) / segs;
      const mc = (t) => [lerp(red[0], redD[0], t * 0.6), lerp(red[1], redD[1], t * 0.6), lerp(red[2], redD[2], t * 0.6)];
      col.push(...mc(c0), ...mc(c0), ...mc(c1), ...mc(c0), ...mc(c1), ...mc(c1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    petals.push(g);
  }
  // 長いおしべ
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const pos = [], col = [];
    const segs = 5;
    let prev = null;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = t * 0.085 * (0.8 + (i % 2) * 0.3);
      const y = 0.5 + Math.sin(t * Math.PI * 0.55) * 0.08;
      const cur = [Math.cos(a) * r, y, Math.sin(a) * r];
      if (prev) {
        const w = 0.0016;
        pos.push(prev[0] - w, prev[1], prev[2], prev[0] + w, prev[1], prev[2], cur[0] - w, cur[1], cur[2]);
        pos.push(prev[0] + w, prev[1], prev[2], cur[0] + w, cur[1], cur[2], cur[0] - w, cur[1], cur[2]);
        for (let k = 0; k < 6; k++) col.push(...(s === segs ? lin(0x2a1a10) : red));
      }
      prev = cur;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    petals.push(g);
  }
  const geo = mergeGeos(petals);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, emissive: new THREE.Color(0.12, 0.0, 0.005) });
  patchMaterial(mat, { translucent: 2.5 });
  const mats = [];
  const cols = [];
  const place = (x, z, sc) => {
    const y = terrainHeight(x, z);
    mats.push(M(x, y - 0.01, z, (rng() - 0.5) * 0.12, rng() * TAU, (rng() - 0.5) * 0.12, sc));
  };
  // 小道・岸辺・畦に群生
  for (let i = 0; i < 520 * density; i++) {
    const t = rng() * (PATH.length - 1);
    const k = Math.floor(t), f = t - k;
    const a = PATH[k], b = PATH[Math.min(k + 1, PATH.length - 1)];
    const px = lerp(a[0], b[0], f), pz = lerp(a[1], b[1], f);
    const off = (rng() < 0.5 ? -1 : 1) * (1.1 + rng() * 3.2);
    const x = px + off, z = pz + (rng() - 0.5) * 2;
    if (pondSigned(x, z) < 1.2) continue;
    if (noise2(x * 0.15, z * 0.15) < -0.1) continue;
    place(x, z, 0.8 + rng() * 0.5);
  }
  for (let i = 0; i < 220 * density; i++) {
    const a = rng() * TAU;
    const r = 24 + rng() * 14;
    const x = Math.cos(a) * r * 1.3, z = Math.sin(a) * r;
    const s = pondSigned(x, z);
    if (s < 1.0 || s > 8) continue;
    if (Math.abs(x) < 3.5 && z > SHORE_Z - 8) continue;
    if (noise2(x * 0.2 + 9, z * 0.2) < 0.05) continue;
    place(x, z, 0.8 + rng() * 0.5);
  }
  const mesh = instancedFrom(geo, mat, mats);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'higanbana';
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// 樹木
// 杉の一段。枝先がとがって垂れ、枝先のあいだはくぼむ（円錐ではなく、枝のすだれに見える形）
function cedarTier(rng, y, R, h, N, droop, bright) {
  const pos = [], col = [];
  const dark = lin(0x15281a), mid = lin(0x2c4d2c), light = lin(0x58874c), tipY = lin(0x7a9a4c);
  const a0 = rng() * TAU, ox = (rng() - 0.5) * 0.25, oz = (rng() - 0.5) * 0.25;
  const P = (x, yy, z, c, k) => { pos.push(x, yy, z); col.push(c[0] * k, c[1] * k, c[2] * k); return pos.length / 3 - 1; };
  const apex = P(ox, y + h, oz, dark, bright);
  const tips = [], notches = [];
  for (let i = 0; i < N; i++) {
    const a = a0 + (i / N) * TAU + (rng() - 0.5) * 0.3;
    const r = R * (0.72 + rng() * 0.5);
    const c = rng() < 0.18 ? tipY : light;
    tips.push(P(ox + Math.cos(a) * r, y - droop * (0.55 + rng() * 0.9), oz + Math.sin(a) * r, c, bright * (0.85 + rng() * 0.3)));
  }
  for (let i = 0; i < N; i++) {
    const a = a0 + ((i + 0.5) / N) * TAU;
    const r = R * (0.4 + rng() * 0.2);
    notches.push(P(ox + Math.cos(a) * r, y + h * 0.3 + (rng() - 0.5) * 0.15, oz + Math.sin(a) * r, mid, bright));
  }
  const idx = [];
  for (let i = 0; i < N; i++) {
    const t0 = tips[i], t1 = tips[(i + 1) % N], n0 = notches[i];
    idx.push(apex, t0, n0, apex, n0, t1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  // 法線は上向きに（巻き方向に関係なく）そろえる
  const n = ng.attributes.normal;
  let sy = 0;
  for (let i = 0; i < n.count; i++) sy += n.getY(i);
  if (sy < 0) {
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return ng;
}

function makeCedarGeometry(rng, { tiers = 14, sectors = 7, inner = true, k = 1, lite = false } = {}) {
  const parts = [];
  const bark = lin(0x4a3524);
  const trunk = new THREE.CylinderGeometry(0.18, 0.46, 5, lite ? 4 : 7, 1);
  trunk.translate(0, 2.5, 0);
  parts.push(colorFlat(trunk, bark));
  if (!lite) {
    const upper = new THREE.CylinderGeometry(0.03, 0.2, 14, 5, 1);
    upper.translate(0, 5 + 7, 0);
    parts.push(colorFlat(upper, bark));
  }
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 1.9 + t * 16.2 * k + (rng() - 0.5) * 0.35;
    const R = (2.25 * Math.pow(1 - t, 0.9) + 0.28) * (0.8 + rng() * 0.4);
    const h = (3.0 - t * 1.0) * k;
    const b = 0.78 + rng() * 0.4;
    parts.push(cedarTier(rng, y, R, h, sectors, (0.7 - 0.35 * t) * (0.8 + rng() * 0.4), b));
    if (inner) parts.push(cedarTier(rng, y - 0.6, R * 0.72, h * 0.8, sectors, 0.45 - 0.2 * t, b * 0.92));
  }
  const top = new THREE.ConeGeometry(0.16, 1.9, lite ? 3 : 5);
  top.translate(0, 1.9 + 16.2 * k + 2.1, 0);
  parts.push(colorFlat(top, lin(0x3e6a3c)));
  return mergeGeos(parts);
}

// 枝・幹の管（曲線に沿って細くなる）。colFn(t, a) で樹皮の色をつける
function tubeGeo(pts, r0, r1, radial, seg, colFn, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = curve.getPoint(t);
    const r = lerp(r0, r1, t) * (1 + flare * Math.exp(-t * 16));
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      // ごつごつ
      const bump = 1 + 0.12 * Math.sin(a * 3 + t * 9) * (1 - t * 0.5);
      pos.push(c.x + (N.x * ca + B.x * sa) * r * bump, c.y + (N.y * ca + B.y * sa) * r * bump, c.z + (N.z * ca + B.z * sa) * r * bump);
      const k = colFn(t, a);
      col.push(k[0], k[1], k[2]);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 落葉樹の幹と大枝。大枝は房の中へのびていく
function makeTrunkGeo(rng, blobs) {
  const parts = [];
  const bark = lin(0x4d3c2c), dk = lin(0x2f241a), moss = lin(0x4a5230);
  const lx = (rng() - 0.5) * 0.7, lz = (rng() - 0.5) * 0.7;
  const trunkCol = (t, a) => {
    const m = clamp(0.5 - t * 1.4 + Math.sin(a * 2 + 1) * 0.25, 0, 1) * 0.5; // 根もとはコケむす
    const k = lerp(0.85, 1.1, t) * (0.9 + 0.2 * Math.sin(a * 5 + t * 11));
    const c = lerpC(bark, moss, m);
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  parts.push(tubeGeo([[0, -0.3, 0], [lx * 0.3, 1.8, lz * 0.3], [lx * 0.75, 3.6, lz * 0.75], [lx, 4.9, lz]], 0.5, 0.2, 7, 8, trunkCol, 0.5));
  const nl = 5;
  const order = blobs.map((b, i) => [Math.hypot(b.x, b.z), i]).sort((a, b) => b[0] - a[0]).map((v) => v[1]);
  for (let i = 0; i < nl; i++) {
    const b = blobs[order[i % order.length]];
    const h0 = 3.2 + rng() * 1.7;
    const sx = lx * (h0 / 5), sz = lz * (h0 / 5);
    const tx = b.x * 0.7, ty = b.y * 0.9, tz = b.z * 0.7;
    const midX = lerp(sx, tx, 0.5) + (rng() - 0.5) * 0.6, midZ = lerp(sz, tz, 0.5) + (rng() - 0.5) * 0.6;
    const midY = lerp(h0, ty, 0.5) + 0.5;
    const limbCol = (t) => {
      const k = lerp(0.75, 1.1, t);
      return [dk[0] * k * 1.3, dk[1] * k * 1.3, dk[2] * k * 1.3];
    };
    parts.push(tubeGeo([[sx, h0, sz], [midX, midY, midZ], [tx, ty, tz]], 0.17, 0.05, 5, 6, limbCol));
    for (let k = 0; k < 2; k++) {
      const f = 0.55 + rng() * 0.25;
      const px = lerp(midX, tx, f), py = lerp(midY, ty, f), pz = lerp(midZ, tz, f);
      const a = rng() * TAU;
      parts.push(tubeGeo([[px, py, pz], [px + Math.cos(a) * 0.6, py + 0.55, pz + Math.sin(a) * 0.6], [px + Math.cos(a) * 1.3, py + 1.0, pz + Math.sin(a) * 1.3]], 0.05, 0.015, 4, 3, limbCol));
    }
  }
  return mergeGeos(parts);
}

// 小さめの房をたくさん（ぼてっとした一つの塊にならないように）
function crownLumpList(rng, n, spread, size) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const rr = i === 0 ? 0 : Math.sqrt(rng()) * spread;
    const y = i === 0 ? 1.1 : (rng() - 0.3) * spread * 0.95;
    list.push({ x: Math.cos(a) * rr, y: 5.7 + y, z: Math.sin(a) * rr, r: size * (0.6 + rng() * 0.5) });
  }
  return list;
}

function crownBlobList(rng, blobs, spread, size) {
  const list = [];
  for (let i = 0; i < blobs; i++) {
    const a = rng() * TAU;
    const r = i === 0 ? 0 : Math.sqrt(rng()) * spread;
    const y = i === 0 ? 1.0 : (rng() - 0.35) * spread * 1.05;
    const s = size * (0.62 + rng() * 0.55);
    list.push({ x: Math.cos(a) * r, y: 5.4 + y, z: Math.sin(a) * r, r: s });
  }
  return list;
}

function makeBlobCrown(rng, detail, blobs = 6, spread = 2.0, size = 2.2, list = null, dark = 1) {
  const parts = [];
  const bl = list || crownBlobList(rng, blobs, spread, size);
  bl.forEach((b, i) => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    const merged = mergeVerticesIdx(g);
    displace(merged, 0.17, 2.3, i * 17);
    merged.scale(b.r, b.r * 0.84, b.r);
    merged.translate(b.x, b.y, b.z);
    // 房ごとに色合いと明るさを少しずつ変える（赤↔橙↔黄）
    const hue = (rng() - 0.5) * 2;
    const bright = 0.75 + rng() * 0.4;
    colorize(merged, (x, yy, z) => {
      const t = clamp((yy - (b.y - b.r)) / (b.r * 2));
      const k = dark * bright * (0.52 + 0.62 * t) * (0.94 + 0.12 * Math.sin(x * 3.1 + z * 2.3));
      return [k * (1 + hue * 0.18), k * (1 + hue * 0.34), k * (1 - hue * 0.28)];
    });
    parts.push(merged);
  });
  return mergeGeos(parts);
}

function mergeVerticesIdx(g) {
  // 非インデックスのIcosahedronを位置で統合してインデックス付きに
  const p = g.attributes.position;
  const map = new Map();
  const outPos = [];
  const idx = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = outPos.length / 3;
      map.set(key, id);
      outPos.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    idx.push(id);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  o.setIndex(idx);
  o.computeVertexNormals();
  return o;
}

const AUTUMN = [
  { c: lin(0xc9361c), w: 1.1 },
  { c: lin(0xe0702a), w: 1.2 },
  { c: lin(0xe6b432), w: 1.2 },
  { c: lin(0x7e9c38), w: 1.6 },
  { c: lin(0xa0562a), w: 0.6 },
  { c: lin(0x4f7a30), w: 1.2 },
];

function autumnColor(x, z, rng) {
  // 山肌にまとまった色の塊ができるように（季節の葉の色のグラデーションから選ぶ）
  const n = fbm2(x * 0.018 + 17, z * 0.018 + 3, 3) * 0.5 + 0.5;
  const n2 = fbm2(x * 0.06 + 5, z * 0.06 + 31, 2) * 0.5 + 0.5;
  const v = clamp(n * 0.7 + n2 * 0.5 + (rng() - 0.5) * 0.35);
  const L = SEASON.leaf;
  if (!L.pal.length) return new THREE.Color(1, 1, 1);
  const pal = L.pal.map((h) => lin(h));
  const f = v * (pal.length - 1);
  const i = Math.floor(f);
  const c = lerpC(pal[i], pal[Math.min(i + 1, pal.length - 1)], f - i);
  const dull = lin(L.dull);
  const m = lerpC(c, dull, L.dullAmt);
  return new THREE.Color(m[0] * L.k, m[1] * L.k, m[2] * L.k);
}

export function buildTrees(scene, { density = 1, camPos }) {
  const rng = mulberry32(99);
  const group = new THREE.Group();
  group.name = 'trees';

  // 杉: 近景は枝のすだれを重ねた3種類、遠景は軽い簡易版
  const cedarNearGeos = [
    makeCedarGeometry(mulberry32(3), { tiers: 14, sectors: 7, k: 1 }),
    makeCedarGeometry(mulberry32(17), { tiers: 15, sectors: 8, k: 1.08 }),
    makeCedarGeometry(mulberry32(29), { tiers: 13, sectors: 7, k: 0.94 }),
  ];
  const cedarFarGeo = makeCedarGeometry(mulberry32(5), { tiers: 11, sectors: 5, inner: false, lite: true });
  const cedarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  patchMaterial(cedarMat, { underwater: true, detail: 'leaf', translucent: 1.2 });

  // 落葉樹: 遠景は大きめのブロブ、近景は小さな房をたくさん＋葉のカード
  const listFarA = crownBlobList(mulberry32(41), 7, 2.3, 2.2);
  const listFarB = crownBlobList(mulberry32(58), 8, 2.6, 2.0);
  const crownGeoA = makeBlobCrown(mulberry32(41), 1, 0, 0, 0, listFarA);
  const crownGeoB = makeBlobCrown(mulberry32(58), 1, 0, 0, 0, listFarB);
  const listA = crownLumpList(mulberry32(41), 11, 2.7, 1.75);
  const listB = crownLumpList(mulberry32(58), 12, 2.9, 1.7);
  const trunkGeo = (() => {
    const t = new THREE.CylinderGeometry(0.2, 0.36, 5.2, 7, 1);
    t.translate(0, 2.6, 0);
    const b1 = new THREE.CylinderGeometry(0.1, 0.16, 2.4, 5, 1);
    b1.translate(0, 1.2, 0); b1.rotateZ(0.7); b1.translate(0.2, 4.2, 0);
    const b2 = new THREE.CylinderGeometry(0.1, 0.16, 2.4, 5, 1);
    b2.translate(0, 1.2, 0); b2.rotateZ(-0.6); b2.rotateY(2.0); b2.translate(-0.1, 4.0, 0.1);
    return mergeGeos([colorFlat(t, lin(0x4d3b2a)), colorFlat(b1, lin(0x4d3b2a)), colorFlat(b2, lin(0x4d3b2a))]);
  })();
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: 0xdcdcdc });
  patchMaterial(leafMat, { underwater: true, detail: 'leaf', translucent: 1.5 });
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  patchMaterial(trunkMat, { underwater: true, detail: 'wood' });

  const cedarM = [], cedarC = [];
  const decM = [], decC = [], decMB = [];

  const maxCedar = Math.floor(5200 * density), maxDec = Math.floor(1700 * density);
  let tries = 0;
  while ((cedarM.length < maxCedar || decM.length < maxDec) && tries < 220000) {
    tries++;
    const a = rng() * TAU;
    // 手前ほど密に
    const r = 28 + Math.pow(rng(), 1.45) * 330;
    const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r;
    const s = pondSigned(x, z);
    if (s < 3.5) continue;
    const h = terrainHeight(x, z);
    if (h < 0.5) continue;
    const pd = pathDistance(x, z);
    if (pd < 3.2) continue;
    if (Math.hypot(x - camPos.x, z - camPos.z) < 26) continue;
    if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < HOUSE.r + 3) continue;
    // 桟橋側の背後や正面は抜く
    const hl = Math.hypot(x, z);
    const forestN = fbm2(x * 0.012 + 8, z * 0.012 - 5, 3) * 0.5 + 0.5;
    const hillF = smoothstep(14, 70, hl) ;
    const dens = hillF * (0.25 + 0.9 * smoothstep(0.35, 0.65, forestN));
    // 近景は疎らに
    const nearSparse = smoothstep(26, 90, hl) * 0.9 + 0.1;
    if (rng() > dens * nearSparse) continue;
    // 勾配
    const e = 1.2;
    const slope = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    if (slope > 0.95) continue;
    const decidAmt = smoothstep(0.4, 0.62, fbm2(x * 0.02 + 33, z * 0.02 + 1, 3) * 0.5 + 0.5);
    const isCedar = rng() > decidAmt * 0.85 + (hl < 55 ? 0.35 : 0);
    const yaw = rng() * TAU;
    if (isCedar && cedarM.length < maxCedar) {
      const sc = (0.5 + rng() * 0.7) * (hl > 150 ? 1.5 : 1);
      cedarM.push(M(x, h - 0.2, z, (rng() - 0.5) * 0.09, yaw, (rng() - 0.5) * 0.09, sc * (0.85 + rng() * 0.3), sc * (0.9 + rng() * 0.3), sc * (0.85 + rng() * 0.3)));
      const t = 0.8 + rng() * 0.4;
      const cc = new THREE.Color(t * SEASON.cedarTint[0], t * (0.95 + rng() * 0.1) * SEASON.cedarTint[1], t * SEASON.cedarTint[2]);
      if (SEASON.cedarSnow) cc.lerp(new THREE.Color(1.0, 1.04, 1.1), SEASON.cedarSnow);   // 雪をかぶった杉
      cedarC.push(cc);
    } else if (!isCedar && decM.length < maxDec) {
      const sc = (0.75 + rng() * 0.75) * (hl > 150 ? 1.7 : 1);
      const m = M(x, h - 0.2, z, 0, yaw, 0, sc);
      decM.push(m);
      decMB.push(rng() < 0.5 ? 0 : 1);
      decC.push(autumnColor(x, z, rng));
    }
  }
  // 影を落とすのは影の範囲に入る近い木だけ（遠い木は影パスの頂点処理を省く）
  {
    const nearM = [[], [], []], nearC = [[], [], []], farM = [], farC = [];
    const rv = mulberry32(777);
    cedarM.forEach((m, i) => {
      const d = Math.hypot(m.elements[12], m.elements[14] + 6);
      if (d < 100) { const v = Math.floor(rv() * 3); nearM[v].push(m); nearC[v].push(cedarC[i]); } else { farM.push(m); farC.push(cedarC[i]); }
    });
    nearM.forEach((list, v) => {
      if (!list.length) return;
      const c = instancedFrom(cedarNearGeos[v], cedarMat, list, nearC[v]); c.castShadow = true; c.receiveShadow = true; group.add(c);
    });
    if (farM.length) { const c = instancedFrom(cedarFarGeo, cedarMat, farM, farC); c.castShadow = false; c.receiveShadow = true; group.add(c); }
  }
  // 落葉樹: 近い木は高分割＋葉カード、遠い木は軽いブロブだけ
  const NEAR = 150;
  const groups = { nearA: [[], []], nearB: [[], []], farA: [[], []], farB: [[], []] };
  decM.forEach((m, i) => {
    const px = m.elements[12], pz = m.elements[14];
    const near = Math.hypot(px - camPos.x, pz - camPos.z) < NEAR;
    const g = groups[(near ? 'near' : 'far') + (decMB[i] ? 'B' : 'A')];
    g[0].push(m); g[1].push(decC[i]);
  });
  // 近景の房は内側を暗くして、手前の葉のカードとの陰影の差で奥行きを出す
  const core = (l) => l.map((b) => ({ ...b, r: b.r * 0.86 }));
  const hiA = makeBlobCrown(mulberry32(41), 1, 0, 0, 0, core(listA), 0.85);
  const hiB = makeBlobCrown(mulberry32(58), 1, 0, 0, 0, core(listB), 0.85);
  const defs = [['nearA', hiA], ['nearB', hiB], ['farA', crownGeoA], ['farB', crownGeoB]];
  const leafy = SEASON.leaf.mode === 'full';   // 冬の落葉樹は葉がない（幹と大枝だけ）
  for (const [k, geo] of defs) {
    if (!leafy || !groups[k][0].length) continue;
    const m = instancedFrom(geo, leafMat, groups[k][0], groups[k][1]);
    m.castShadow = k.startsWith('near'); m.receiveShadow = true; group.add(m);
  }
  // 幹: 近景は大枝が房の中へのびる形、遠景は簡易な幹
  const trunkA = makeTrunkGeo(mulberry32(7), listA), trunkB = makeTrunkGeo(mulberry32(8), listB);
  for (const [k, geo] of [['nearA', trunkA], ['nearB', trunkB], ['farA', trunkGeo], ['farB', trunkGeo]]) {
    if (!groups[k][0].length) continue;
    const t = instancedFrom(geo, trunkMat, groups[k][0]);
    t.castShadow = false; t.receiveShadow = true; group.add(t);
  }
  if (leafy && density > 0.5) {
    const cardMat = leafCardMaterial();
    const rngC = mulberry32(2025);
    for (const [k, list] of [['nearA', listA], ['nearB', listB]]) {
      if (!groups[k][0].length) continue;
      const nCards = Math.round((16 + 10 * Math.min(1, density)) * list.length);
      const c = instancedFrom(makeCardCrownGeometry(list, nCards, rngC), cardMat, groups[k][0], groups[k][1]);
      c.castShadow = false; c.receiveShadow = false; c.userData.cards = true; group.add(c);
    }
  }
  scene.add(group);
  group.userData.makers = { crownGeoA, crownGeoB, trunkGeo, leafMat, trunkMat, cedarGeo: cedarNearGeos[0], cedarMat };
  return group;
}

// 葉っぱカード用テクスチャ（もみじ風の小さな葉のかたまり）
function makeLeafCardTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const rnd = mulberry32(88);
    g.clearRect(0, 0, w, h);
    const leaf = (cx, cy, r, rot, tone) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.beginPath();
      const pts = 5;
      for (let i = 0; i <= pts * 2; i++) {
        const a = (i / (pts * 2)) * TAU - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.46;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.95;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = `rgb(${tone},${tone},${tone})`;
      g.fill();
      g.strokeStyle = `rgba(0,0,0,0.3)`;
      g.lineWidth = 1;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * TAU - Math.PI / 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.8); g.stroke();
      }
      g.restore();
    };
    // 房の形（楕円）の中に、奥の暗い葉 → 手前の明るい葉の順に散らす。すき間から奥が見える
    const place = (n, r0, r1, t0, t1) => {
      for (let i = 0; i < n; i++) {
        let x, y;
        do { x = (rnd() * 2 - 1) * 0.44; y = (rnd() * 2 - 1) * 0.44; } while (x * x + y * y > 0.19);
        leaf(w * (0.5 + x), h * (0.5 + y), r0 + rnd() * (r1 - r0), rnd() * TAU, t0 + Math.floor(rnd() * (t1 - t0)));
      }
    };
    place(16, 26, 38, 70, 140);
    place(18, 22, 36, 130, 255);
  }, { repeat: false });
}

let LEAF_TEX = null;

// 1本の木の葉カードをまとめた形状（単位座標）。木ごとのインスタンスで使い回す
function makeCardCrownGeometry(blobs, count, rng) {
  const quads = [];
  const n = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const b = blobs[Math.floor(rng() * blobs.length)];
    const u = rng() * 2 - 1, th = rng() * TAU;
    const rr = Math.sqrt(1 - u * u);
    n.set(rr * Math.cos(th), u * 0.9 + 0.1, rr * Math.sin(th)).normalize();
    const g = new THREE.PlaneGeometry(1, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(up, n);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2, rng() * TAU)));
    const sc = 1.25 + rng() * 1.0;
    const off = 1.0 + rng() * 0.16;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(b.x + n.x * b.r * off, b.y + n.y * b.r * 0.86 * off, b.z + n.z * b.r * off), q, new THREE.Vector3(sc, sc, sc)));
    // 法線は房の中心から外向き。平らな板でも、丸い塊のようにやわらかく陰影がつく
    const pa = g.attributes.position, na = g.attributes.normal;
    for (let k = 0; k < pa.count; k++) {
      v.set(pa.getX(k) - b.x, (pa.getY(k) - b.y) / 0.86 + b.r * 0.35, pa.getZ(k) - b.z).normalize();
      na.setXYZ(k, v.x, v.y, v.z);
    }
    // 輪郭の外側ほど明るく、色合いも少しずらす
    const vv = 0.74 + rng() * 0.58;
    const hue = (rng() - 0.5) * 2;
    const lit = 0.82 + 0.3 * clamp((n.y + 1) * 0.5);
    colorFlat(g, [vv * lit * (1 + hue * 0.2), vv * lit * (1 + hue * 0.38), vv * lit * (1 - hue * 0.3)]);
    quads.push(g);
  }
  return mergeGeos(quads);
}

function leafCardMaterial() {
  if (!LEAF_TEX) LEAF_TEX = makeLeafCardTexture();
  const mat = new THREE.MeshStandardMaterial({ map: LEAF_TEX, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65, vertexColors: true, alphaToCoverage: true, color: 0xffffff });
  patchMaterial(mat, { translucent: 2.2, underwater: false });
  return mat;
}

function buildLeafCards(blobs, color, count, rng) {
  if (!LEAF_TEX) LEAF_TEX = makeLeafCardTexture();
  const geo = new THREE.PlaneGeometry(0.8, 0.8);
  const mat = new THREE.MeshStandardMaterial({ map: LEAF_TEX, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65, alphaToCoverage: true });
  patchMaterial(mat, { translucent: 2.4, underwater: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const n = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const b = blobs[Math.floor(rng() * blobs.length)];
    // 球面上の点（上側ほど多い）
    const u = rng() * 2 - 1, th = rng() * TAU;
    const rr = Math.sqrt(1 - u * u);
    n.set(rr * Math.cos(th), u * 0.9 + 0.1, rr * Math.sin(th)).normalize();
    const off = 1.08 + rng() * 0.14;
    const pos = new THREE.Vector3(b.x + n.x * b.r * off, b.y + n.y * b.r * 0.86 * off, b.z + n.z * b.r * off);
    q.setFromUnitVectors(up, n);
    e.set((rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2, rng() * TAU);
    const q2 = new THREE.Quaternion().setFromEuler(e);
    q.multiply(q2);
    const sc = 0.75 + rng() * 0.9;
    tmp.compose(pos, q, new THREE.Vector3(sc, sc, sc));
    mesh.setMatrixAt(i, tmp);
    const v = 0.55 + rng() * 0.55;
    const hue = (rng() - 0.5) * 2;
    col.setRGB(color.r * v * (1 + hue * 0.22), color.g * v * (1 + hue * 0.4), color.b * v * (1 - hue * 0.3));
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  mesh.userData.cards = true;
  return mesh;
}

// 主役の木（柿・モミジ）を高精細で置く
export function buildHeroTrees(scene, list, { density = 1 } = {}) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  patchMaterial(trunkMat, { detail: 'wood' });
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, emissive: new THREE.Color(0.28, 0.07, 0.0) });
  patchMaterial(fruitMat, {});
  const rng = mulberry32(555);
  for (const t of list) {
    const blobsList = crownBlobList(mulberry32(t.seed || 1), (t.blobs || 8) + 3, (t.spread || 2.4) * 1.05, (t.size || 2.3) * 0.82);
    const crownGeo = makeBlobCrown(mulberry32(t.seed || 1), 2, 0, 0, 0, blobsList);
    const trunk = new THREE.CylinderGeometry(0.2, 0.42, 5.6, 9, 4);
    trunk.translate(0, 2.8, 0);
    displace(trunk, 0.02, 2, 7);
    const br = [];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.CylinderGeometry(0.06, 0.15, 2.8, 5, 1);
      b.translate(0, 1.4, 0);
      b.rotateZ(0.5 + rng() * 0.45);
      b.rotateY(rng() * TAU);
      b.translate(0, 3.4 + rng() * 1.4, 0);
      br.push(colorFlat(b, lin(0x45362a)));
    }
    const tr = mergeGeos([colorFlat(trunk, lin(0x4b3a2a)), ...br]);
    const col = new THREE.Color(...(t.color || [1, 1, 1]));
    // 内側の房（暗めで日陰）
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: col.clone().multiplyScalar(0.55) });
    patchMaterial(crownMat, { detail: 'leaf', translucent: 1.2 });
    const crownMesh = new THREE.Mesh(crownGeo, crownMat);
    crownMesh.castShadow = crownMesh.receiveShadow = true;
    const leafy = SEASON.leaf.mode === 'full';
    const trMesh = new THREE.Mesh(tr, trunkMat);
    trMesh.castShadow = trMesh.receiveShadow = true;
    const g2 = new THREE.Group();
    g2.add(trMesh);
    if (leafy) {
      g2.add(crownMesh);
      // 葉のカードで輪郭をふわっと
      const cards = buildLeafCards(blobsList, col, Math.floor(380 * density) + 60, rng);
      g2.add(cards);
    }
    if (t.fruit) {
      const fg = new THREE.SphereGeometry(0.1, 8, 6);
      const fm = new THREE.InstancedMesh(fg, fruitMat, t.fruit);
      const tmp = new THREE.Matrix4();
      for (let i = 0; i < t.fruit; i++) {
        const a = rng() * TAU, rr = 0.9 + rng() * 2.8, yy = 4.0 + rng() * 3.0;
        tmp.makeTranslation(Math.cos(a) * rr, yy, Math.sin(a) * rr);
        fm.setMatrixAt(i, tmp);
      }
      fm.castShadow = false;
      g2.add(fm);
    }
    g2.position.set(t.x, terrainHeight(t.x, t.z) - 0.15, t.z);
    g2.rotation.y = rng() * TAU;
    g2.scale.setScalar(t.scale || 1);
    group.add(g2);
  }
  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// 岩
export function buildRocks(scene) {
  const rng = mulberry32(3030);
  const base = new THREE.IcosahedronGeometry(1, 2);
  base.deleteAttribute('uv');
  base.deleteAttribute('normal');
  const geo = mergeVerticesIdx(base);
  displace(geo, 0.28, 1.4, 5);
  const geo2 = geo.clone();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb3ab9c, roughness: 0.95 });
  patchMaterial(mat, { underwater: true, detail: 'terrain' });
  const mats = [], cols = [];
  const add = (x, z, sc) => {
    const y = terrainHeight(x, z);
    mats.push(M(x, y + sc * 0.15, z, rng() * 0.5, rng() * TAU, rng() * 0.5, sc * (0.9 + rng() * 0.5), sc * (0.55 + rng() * 0.3), sc * (0.9 + rng() * 0.5)));
    const t = 0.6 + rng() * 0.5;
    cols.push(new THREE.Color(t * 0.9, t * 0.88, t * 0.82));
  };
  for (let i = 0; i < 180; i++) {
    const a = rng() * TAU;
    const px = Math.cos(a) * 60, pz = Math.sin(a) * 60;
    let r = 60, x = px, z = pz, s = pondSigned(x, z);
    for (let k = 0; k < 90 && s > 0; k++) { r -= 0.75; x = Math.cos(a) * r; z = Math.sin(a) * r; s = pondSigned(x, z); }
    const off = (rng() - 0.5) * 3;
    const xx = x + Math.cos(a) * off, zz = z + Math.sin(a) * off;
    if (Math.abs(xx) < 3.5 && zz > SHORE_Z - 9) continue;
    add(xx, zz, 0.15 + Math.pow(rng(), 2.2) * 0.9);
  }
  const mesh = instancedFrom(geo2, mat, mats, cols);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'rocks';
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// スイレン（睡蓮）の葉と花
export function buildLilies(scene, { depthAt }) {
  const rng = mulberry32(8080);
  // 葉っぱ：切れ込みのある円
  const seg = 28;
  const pos = [], idx = [], uv = [];
  pos.push(0, 0.02, 0); uv.push(0.5, 0.5);
  const notch = 0.22;
  for (let i = 0; i <= seg; i++) {
    const a = notch + (i / seg) * (TAU - notch * 2);
    const x = Math.cos(a), z = Math.sin(a);
    pos.push(x, 0.02 + x * x * 0 + 0.05, z);
    uv.push(0.5 + x * 0.5, 0.5 + z * 0.5);
  }
  for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  // 縁を少し持ち上げる
  const p = geo.attributes.position;
  for (let i = 1; i < p.count; i++) p.setY(i, 0.012 + Math.hypot(p.getX(i), p.getZ(i)) * 0.03);
  p.setY(0, 0.0);
  geo.computeVertexNormals();
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4c6f2a';
    g.fillRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#8aa84a');
    grad.addColorStop(0.7, '#5b8030');
    grad.addColorStop(1, '#3c5a24');
    g.fillStyle = grad;
    g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(200,220,120,0.5)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.5); g.stroke();
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${rng() > 0.5 ? '40,60,20' : '170,190,90'},${rng() * 0.14})`;
      g.beginPath(); g.arc(rng() * w, rng() * h, rng() * 8 + 1, 0, 7); g.fill();
    }
    // 少し枯れた縁
    g.strokeStyle = 'rgba(150,120,50,0.5)';
    g.lineWidth = 9;
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, TAU); g.stroke();
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide });
  patchMaterial(mat, { translucent: 1.5 });
  const mats = [];
  const flowers = [];
  const clusters = [
    [-18, -8, 7], [-22, 4, 5], [20, -14, 6], [26, 3, 4], [-6, -20, 5], [14, -22, 4], [-26, -4, 4], [8, 10, 3], [-9, SHORE_Z - 12, 3.2], [10.5, SHORE_Z - 13, 3.2], [-14, SHORE_Z - 9, 2.5],
  ];
  for (const [cx, cz, rad] of clusters) {
    const n = 12 + Math.floor(rng() * 12);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * rad;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const d = depthAt(x, z);
      if (d < 0.5 || d > 2.2) continue;
      const sc = 0.22 + rng() * 0.3;
      mats.push(M(x, 0.004, z, 0, rng() * TAU, 0, sc));
      if (rng() < SEASON.lilyFlower) flowers.push([x + 0.1, z + 0.1]);
    }
  }
  const mesh = instancedFrom(geo, mat, mats);
  mesh.receiveShadow = true;
  mesh.name = 'lilies';
  scene.add(mesh);

  // 花（白）
  const petalGeos = [];
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < 9; i++) {
      const pg = new THREE.ConeGeometry(0.028, 0.11, 4, 1);
      pg.translate(0, 0.055, 0);
      pg.rotateZ(0.7 - ring * 0.4);
      pg.rotateY((i / 9) * TAU + ring * 0.3);
      pg.translate(0, 0.01 + ring * 0.015, 0);
      petalGeos.push(colorFlat(pg, ring ? lin(0xfff6f0) : lin(0xf8e6ee)));
    }
  const ctr = new THREE.SphereGeometry(0.02, 6, 4);
  ctr.translate(0, 0.05, 0);
  petalGeos.push(colorFlat(ctr, lin(0xffd24a)));
  const fgeo = mergeGeos(petalGeos);
  const fmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: new THREE.Color(0.1, 0.09, 0.09) });
  patchMaterial(fmat, { translucent: 2.0 });
  const fm = instancedFrom(fgeo, fmat, flowers.map(([x, z]) => M(x, 0.02, z, 0, rng() * TAU, 0, 1.4)));
  scene.add(fm);
  return { mesh, flowers: fm };
}
