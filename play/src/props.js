// 人工物：桟橋・古民家（茅葺き）・蔵・稲架・電柱・お地蔵さん・釣り道具
import * as THREE from 'three';
import { mulberry32, clamp, lerp, TAU, smoothstep } from './util.js';
import { terrainHeight, SHORE_Z, HOUSE, FIELD, PATH } from './terrain.js';
import { patchMaterial, G } from './materials.js';
import { mergeGeos, colorFlat, M, instancedFrom, displace } from './geo.js';
import { makeWoodTexture, makeThatchTexture, makePlasterTexture, makeTileTexture, canvasTexture, makeSignTexture } from './textures.js';

export const PIER = { x: 0, zStart: SHORE_Z + 3.2, zEnd: SHORE_Z - 5.4, y: 0.62, w: 1.5 };

function wood(color = 0xffffff, tex, rep = [1, 1], extra = {}) {
  const t = tex.clone();
  t.repeat.set(...rep);
  t.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map: t, color, roughness: 0.92, ...extra });
  patchMaterial(m, { underwater: true, detail: 'wood' });
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function uvScale(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// ---------------------------------------------------------------------------
export function buildPier(scene) {
  const group = new THREE.Group();
  group.name = 'pier';
  const rng = mulberry32(12);
  const woodTex = makeWoodTexture({ planks: 1 });
  const plankMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });
  patchMaterial(plankMat, { underwater: true, detail: 'wood' });
  const L = PIER.zStart - PIER.zEnd;
  const plankW = 0.19, gap = 0.014;
  const n = Math.floor(L / (plankW + gap));
  const planks = [];
  const cols = [];
  const geo = new THREE.BoxGeometry(PIER.w, 0.05, plankW);
  uvScale(geo, 1, 1);
  for (let i = 0; i < n; i++) {
    const z = PIER.zStart - i * (plankW + gap) - plankW / 2;
    const tilt = (rng() - 0.5) * 0.012;
    planks.push(M(PIER.x + (rng() - 0.5) * 0.02, PIER.y + (rng() - 0.5) * 0.006, z, tilt, (rng() - 0.5) * 0.01, (rng() - 0.5) * 0.008, 1, 1, 0.98 + rng() * 0.03));
    const t = 0.55 + rng() * 0.55;
    cols.push(new THREE.Color(t, t * (0.95 + rng() * 0.08), t * (0.9 + rng() * 0.1)));
  }
  const deck = instancedFrom(geo, plankMat, planks, cols);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const postMat = wood(0xb0a08a, woodTex, [0.4, 2]);
  const beamMat = wood(0x9a8a74, woodTex, [3, 0.4]);
  // 杭と横木
  const postZs = [];
  for (let z = PIER.zStart - 0.3; z > PIER.zEnd - 0.1; z -= 1.9) postZs.push(z);
  postZs.push(PIER.zEnd + 0.1);
  for (const z of postZs) {
    for (const sx of [-1, 1]) {
      const x = PIER.x + sx * (PIER.w / 2 + 0.04);
      const bottom = Math.min(terrainHeight(x, z) - 0.3, -0.2);
      const top = PIER.y + (z === PIER.zEnd + 0.1 ? 0.85 : 0.18);
      const hgt = top - bottom;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, hgt, 9, 3), postMat);
      displace(post.geometry, 0.008, 3, z * 3);
      post.position.set(x, bottom + hgt / 2, z);
      post.castShadow = post.receiveShadow = true;
      group.add(post);
    }
    group.add(box(PIER.w + 0.4, 0.09, 0.1, beamMat, PIER.x, PIER.y - 0.075, z));
  }
  // 縦の大きな梁
  for (const sx of [-1, 1]) {
    group.add(box(0.1, 0.12, L + 0.2, beamMat, PIER.x + sx * (PIER.w / 2 - 0.12), PIER.y - 0.12, (PIER.zStart + PIER.zEnd) / 2));
  }
  // 先端の手すり代わりの縄
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb9a57a, roughness: 1 });
  patchMaterial(ropeMat, {});
  const ez = PIER.zEnd + 0.1;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(PIER.x - PIER.w / 2 - 0.04 + t * (PIER.w + 0.08), PIER.y + 0.78 - Math.sin(t * Math.PI) * 0.1, ez));
  }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 5), ropeMat);
  rope.castShadow = true;
  group.add(rope);

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// 釣り場の小物：びく、バケツ、蚊取り線香（ブタ）、ランタン
export function buildGear(scene, { style = 'numa' } = {}) {
  const group = new THREE.Group();
  group.name = 'gear';
  const rng = mulberry32(44);
  const px = PIER.x, pz = PIER.zEnd + 1.0;
  const lights = {};

  // びく（竹かご）: 杭に縄で結ばれ水に浸かる
  const bikuTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b3945a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 16) {
        const o = (y / 8) % 2 ? 8 : 0;
        g.fillStyle = `hsl(${36 + rng() * 8},${40 + rng() * 15}%,${40 + rng() * 22}%)`;
        g.fillRect(x + o, y, 14, 7);
      }
    }
  }, { repeat: true });
  bikuTex.repeat.set(3, 1);
  const bikuMat = new THREE.MeshStandardMaterial({ map: bikuTex, roughness: 0.9, side: THREE.DoubleSide });
  patchMaterial(bikuMat, { underwater: true });
  const biku = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.42, 16, 3, true), bikuMat);
  body.position.y = 0.0;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), bikuMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -0.21;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.17, 0.12, 16, 1, true), bikuMat);
  neck.position.y = 0.26;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), bikuMat);
  lid.position.y = 0.34;
  biku.add(body, bottom, neck, lid);
  biku.rotation.z = 0.35;
  biku.position.set(px + PIER.w / 2 + 0.55, -0.12, pz - 0.3);
  biku.traverse((o) => { o.castShadow = true; });
  group.add(biku);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb5a070, roughness: 1 });
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), ropeMat);
  rope.position.set(px + PIER.w / 2 + 0.3, PIER.y + 0.05, pz - 0.05);
  rope.rotation.z = -0.5;
  group.add(rope);
  group.userData.biku = biku;

  // バケツ（青）
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x2d62a8, roughness: 0.4 });
  patchMaterial(bucketMat, {});
  const bucket = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.26, 20, 1, true), bucketMat);
  bb.material.side = THREE.DoubleSide;
  const bb2 = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), bucketMat);
  bb2.rotation.x = -Math.PI / 2; bb2.position.y = -0.125;
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2b3a2c, roughness: 0.05, metalness: 0.2 });
  const bw = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), waterMat);
  bw.rotation.x = -Math.PI / 2; bw.position.y = 0.07;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 5, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }));
  handle.position.y = 0.13;
  handle.rotation.z = 0.0;
  bucket.add(bb, bb2, bw, handle);
  bucket.position.set(px - PIER.w / 2 + 0.38, PIER.y + 0.155, pz + 0.9);
  bucket.traverse((o) => (o.castShadow = true));
  group.add(bucket);

  // 木製の道具箱
  const boxMat = wood(0xc6b296, makeWoodTexture({ planks: 3 }), [1, 1]);
  const tb = box(0.42, 0.2, 0.26, boxMat, px + PIER.w / 2 - 0.4, PIER.y + 0.125, pz + 1.7);
  tb.rotation.y = 0.35;
  group.add(tb);
  const tbl = box(0.4, 0.02, 0.24, new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.8 }), 0, 0.11, 0);
  tb.add(tbl);

  // 蚊取り線香（ブタ）
  const pigMat = new THREE.MeshStandardMaterial({ color: 0xe8dccb, roughness: 0.25, metalness: 0.0 });
  patchMaterial(pigMat, {});
  const pig = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), pigMat);
  pb.scale.set(1.25, 0.85, 0.95);
  pb.position.y = 0.13;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), pigMat);
  head.position.set(0.19, 0.16, 0);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xf1b7b0, roughness: 0.4 }));
  snout.rotation.z = Math.PI / 2;
  snout.position.set(0.29, 0.15, 0);
  const earGeo = new THREE.ConeGeometry(0.035, 0.06, 5);
  const ear1 = new THREE.Mesh(earGeo, pigMat), ear2 = new THREE.Mesh(earGeo, pigMat);
  ear1.position.set(0.17, 0.25, 0.06); ear1.rotation.set(0.5, 0, -0.3);
  ear2.position.set(0.17, 0.25, -0.06); ear2.rotation.set(-0.5, 0, -0.3);
  const legGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.06, 8);
  const legs = [[0.1, 0.07], [0.1, -0.07], [-0.1, 0.07], [-0.1, -0.07]].map(([x, z]) => {
    const l = new THREE.Mesh(legGeo, pigMat);
    l.position.set(x, 0.03, z);
    return l;
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), eyeMat), eye2 = eye1.clone();
  eye1.position.set(0.255, 0.19, 0.045); eye2.position.set(0.255, 0.19, -0.045);
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 20), new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.9, emissive: new THREE.Color(0.0, 0, 0) }));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-0.04, 0.24, 0);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.8, 0.15) }));
  ember.position.set(-0.04 + 0.05, 0.245, 0);
  pig.add(pb, head, snout, ear1, ear2, ...legs, eye1, eye2, coil, ember);
  pig.position.set(px + PIER.w / 2 - 0.3, PIER.y + 0.025, pz + 0.3);
  pig.rotation.y = 2.4;
  pig.scale.setScalar(1.0);
  pig.traverse((o) => { o.castShadow = true; });
  group.add(pig);
  group.userData.ember = ember;
  group.userData.pigPos = new THREE.Vector3();
  pig.getWorldPosition(group.userData.pigPos);
  group.userData.pigPos.y += 0.25;

  if (style === 'hama') {
    // 浜: 蚊取りブタのかわりにクーラーボックス、竹のびくのかわりに網の魚かご
    group.remove(pig);
    const shell = new THREE.MeshStandardMaterial({ color: 0xf0eee6, roughness: 0.45 });
    const lidM = new THREE.MeshStandardMaterial({ color: 0x2a78c8, roughness: 0.35 });
    patchMaterial(shell, {}); patchMaterial(lidM, {});
    const cooler = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.32), shell); cb.position.y = 0.15;
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.34), lidM); cl.position.y = 0.33;
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 5, 14, Math.PI), lidM); hd.position.y = 0.36; hd.rotation.x = -0.9;
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), lidM); latch.position.set(0, 0.27, 0.17);
    cooler.add(cb, cl, hd, latch);
    cooler.position.set(px + PIER.w / 2 - 0.34, PIER.y + 0.025, pz + 0.35);
    cooler.rotation.y = 0.25;
    cooler.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    group.add(cooler);
    const netTex = canvasTexture(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#3c6a4a'; g.lineWidth = 3;
      for (let i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    }, { repeat: true });
    netTex.repeat.set(3, 2);
    const netM = new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    patchMaterial(netM, { underwater: true });
    for (const o of biku.children) o.material = netM;
  }

  // ランタン（桟橋先端の杭に）
  const lan = new THREE.Group();
  const lanBodyMat = new THREE.MeshStandardMaterial({ color: 0x222018, roughness: 0.6, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: new THREE.Color(1.0, 0.62, 0.25), emissiveIntensity: 0.0, roughness: 0.3 });
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10), glassMat);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.06, 10), lanBodyMat);
  cap.position.y = 0.1;
  const bas = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10), lanBodyMat);
  bas.position.y = -0.08;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 4, 10), lanBodyMat);
  ring.position.y = 0.15;
  lan.add(gl, cap, bas, ring);
  lan.position.set(px - PIER.w / 2 - 0.04, PIER.y + 0.88, PIER.zEnd + 0.1);
  group.add(lan);
  const lamp = new THREE.PointLight(0xffb066, 0, 16, 1.6);
  lamp.position.copy(lan.position);
  lamp.position.y += 0.02;
  group.add(lamp);
  lights.lamp = lamp;
  lights.lampGlass = glassMat;
  group.userData.lights = lights;

  // 麦わら帽子（桟橋の手前の杭に）
  const strawMat = new THREE.MeshStandardMaterial({ color: 0xcdb273, roughness: 1 });
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.015, 24), strawMat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.13, 20), strawMat);
  crown.position.y = 0.07;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.151, 0.153, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xa83a2a, roughness: 0.8 }));
  band.position.y = 0.04;
  hat.add(brim, crown, band);
  hat.position.set(px - PIER.w / 2 - 0.2, PIER.y + 0.28, PIER.zStart - 0.3);
  hat.rotation.set(1.2, 0.2, 0.15);
  hat.traverse((o) => (o.castShadow = true));
  group.add(hat);

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// 寄棟の茅葺き屋根
function hipRoofGeometry(W, D, H, ridgeLen, nu = 14, nv = 10, noise = 0.05, seed = 1) {
  const rng = mulberry32(seed);
  const rl = ridgeLen / 2;
  const faces = [
    { e0: [-W / 2, 0, D / 2], e1: [W / 2, 0, D / 2], r0: [-rl, H, 0], r1: [rl, H, 0] },
    { e0: [W / 2, 0, -D / 2], e1: [-W / 2, 0, -D / 2], r0: [rl, H, 0], r1: [-rl, H, 0] },
    { e0: [W / 2, 0, D / 2], e1: [W / 2, 0, -D / 2], r0: [rl, H, 0], r1: [rl, H, 0] },
    { e0: [-W / 2, 0, -D / 2], e1: [-W / 2, 0, D / 2], r0: [-rl, H, 0], r1: [-rl, H, 0] },
  ];
  const geos = [];
  const prof = (v) => 0.7 * v + 0.3 * v * v;
  for (const f of faces) {
    const pos = [], uv = [], idx = [];
    const sl = Math.hypot(Math.hypot(f.r0[0] - f.e0[0], f.r0[2] - f.e0[2]), H);
    const el = Math.hypot(f.e1[0] - f.e0[0], f.e1[2] - f.e0[2]);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const ex = lerp(f.e0[0], f.e1[0], u), ez = lerp(f.e0[2], f.e1[2], u);
        const rx = lerp(f.r0[0], f.r1[0], u), rz = lerp(f.r0[2], f.r1[2], u);
        const x = lerp(ex, rx, v), z = lerp(ez, rz, v);
        let y = H * prof(v);
        y += (rng() - 0.5) * noise * (1 - v * 0.7);
        pos.push(x, y, z);
        uv.push((u * el) / 2.2, (v * sl) / 2.2);
      }
    }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 面が内向きなら反転
    const n = g.attributes.normal;
    const midI = Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2);
    const px = g.attributes.position.getX(midI), pz = g.attributes.position.getZ(midI);
    const dot = n.getX(midI) * px + n.getZ(midI) * pz;
    const ny = n.getY(midI);
    if (ny < 0) {
      for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    geos.push(g);
  }
  return mergeGeos(geos);
}

export function buildFarmhouse(scene) {
  const g = new THREE.Group();
  g.name = 'farmhouse';
  const base = terrainHeight(HOUSE.x, HOUSE.z);
  g.position.set(HOUSE.x, base, HOUSE.z);
  g.rotation.y = -0.12;

  const thatchTex = makeThatchTexture();
  const thatchMat = new THREE.MeshStandardMaterial({ map: thatchTex, roughness: 1, side: THREE.DoubleSide });
  patchMaterial(thatchMat, { detail: 'wood', translucent: 0.8 });
  const plaster = makePlasterTexture(256);
  plaster.repeat.set(3, 1);
  const plasterMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 });
  patchMaterial(plasterMat, { detail: 'wood' });
  const darkWood = wood(0x6a5a4a, makeWoodTexture({ base: '#4d3c2a', dark: '#2a1e12', light: '#6a5640', planks: 2 }), [1, 1]);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1 });
  patchMaterial(stoneMat, { detail: 'terrain' });

  const W = 13, D = 8, floorY = 0.55, wallH = 2.9;
  // 基礎の石
  g.add(box(W + 0.7, floorY, D + 0.7, stoneMat, 0, floorY / 2 - 0.05, 0));
  // 壁
  g.add(box(W, wallH, D, plasterMat, 0, floorY + wallH / 2, 0));
  // 腰板（下見板）
  g.add(box(W + 0.06, 0.9, D + 0.06, darkWood, 0, floorY + 0.45, 0));
  // 柱と梁（真壁風）
  for (let i = 0; i <= 7; i++) {
    const x = -W / 2 + (i / 7) * W;
    g.add(box(0.16, wallH, 0.12, darkWood, x, floorY + wallH / 2, D / 2 + 0.04));
    g.add(box(0.16, wallH, 0.12, darkWood, x, floorY + wallH / 2, -D / 2 - 0.04));
  }
  g.add(box(W + 0.2, 0.16, 0.14, darkWood, 0, floorY + wallH - 0.1, D / 2 + 0.05));
  g.add(box(W + 0.2, 0.14, 0.14, darkWood, 0, floorY + 0.95, D / 2 + 0.05));
  // 障子（縁側）
  const shojiTex = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#f2e3bf';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3a2a1a';
    c.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); }
    for (let i = 0; i <= 5; i++) { c.beginPath(); c.moveTo(0, i * h / 5); c.lineTo(w, i * h / 5); c.stroke(); }
    c.lineWidth = 8;
    c.strokeRect(2, 2, w - 4, h - 4);
  }, { repeat: false });
  const shojiMat = new THREE.MeshStandardMaterial({
    map: shojiTex, roughness: 0.9,
    emissive: new THREE.Color(1.0, 0.6, 0.26), emissiveMap: shojiTex, emissiveIntensity: 0.0,
  });
  patchMaterial(shojiMat, {});
  const shojiN = 5;
  for (let i = 0; i < shojiN; i++) {
    const w = 2.1;
    const x = -W / 2 + 1.35 + i * 2.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.85), shojiMat);
    m.position.set(x, floorY + 1.15 + 0.35, D / 2 + 0.01);
    g.add(m);
  }
  // 縁側
  const porchMat = wood(0xd5c3a6, makeWoodTexture({ planks: 8 }), [1, 1]);
  g.add(box(W + 0.8, 0.12, 1.5, porchMat, 0, floorY + 0.05, D / 2 + 0.8));
  g.add(box(W + 0.8, 0.5, 0.2, stoneMat, 0, floorY - 0.25, D / 2 + 1.5));
  // 屋根
  const roofW = W + 3.4, roofD = D + 3.4, roofH = 5.2;
  const roof = new THREE.Mesh(hipRoofGeometry(roofW, roofD, roofH, 4.4, 16, 10, 0.07, 3), thatchMat);
  roof.position.y = floorY + wallH + 0.15;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  // 軒先の厚み
  const eaveMat = new THREE.MeshStandardMaterial({ map: thatchTex, color: 0xbba886, roughness: 1 });
  patchMaterial(eaveMat, {});
  const ey = floorY + wallH + 0.2;
  const eaves = [
    box(roofW + 0.2, 0.4, 0.5, eaveMat, 0, ey, roofD / 2 - 0.05),
    box(roofW + 0.2, 0.4, 0.5, eaveMat, 0, ey, -roofD / 2 + 0.05),
    box(0.5, 0.4, roofD, eaveMat, roofW / 2 - 0.05, ey, 0),
    box(0.5, 0.4, roofD, eaveMat, -roofW / 2 + 0.05, ey, 0),
  ];
  eaves.forEach((e) => g.add(e));
  // 棟
  const ridgeMat = new THREE.MeshStandardMaterial({ map: thatchTex, color: 0x8a7650, roughness: 1 });
  patchMaterial(ridgeMat, {});
  const ridge = box(4.6, 0.42, 0.7, ridgeMat, 0, floorY + wallH + 0.15 + roofH + 0.1, 0);
  g.add(ridge);
  // 煙出し（棟のこぶ）
  const vent = box(1.0, 0.7, 1.0, ridgeMat, -1.4, floorY + wallH + roofH + 0.5, 0);
  g.add(vent);
  g.userData.smokePos = new THREE.Vector3(-1.4, floorY + wallH + roofH + 1.0, 0);

  // 庇の下の影（暗い）
  g.userData.shojiMat = shojiMat;

  // 蔵
  const kura = new THREE.Group();
  const kw = 4.6, kd = 4.2, kh = 3.6;
  const wallMat = new THREE.MeshStandardMaterial({ map: makePlasterTexture(256, '#efe8da'), roughness: 0.9 });
  patchMaterial(wallMat, { detail: 'wood' });
  kura.add(box(kw, kh, kd, wallMat, 0, kh / 2 + 0.3, 0));
  kura.add(box(kw + 0.3, 0.5, kd + 0.3, stoneMat, 0, 0.1, 0));
  const tileTex = makeTileTexture(256);
  tileTex.repeat.set(3, 2);
  const tileMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
  patchMaterial(tileMat, {});
  const slope = 0.62;
  const rl = Math.hypot(kd / 2 + 0.6, 1.9);
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(kw + 0.8, 0.14, rl), tileMat);
    slab.position.set(0, kh + 0.3 + 0.95, s * (kd / 4 + 0.15));
    slab.rotation.x = s * -Math.atan2(1.9, kd / 2 + 0.6) * 1.0;
    slab.castShadow = slab.receiveShadow = true;
    kura.add(slab);
  }
  // 破風の三角
  const tri = new THREE.Shape();
  tri.moveTo(-kw / 2 - 0.2, 0);
  tri.lineTo(kw / 2 + 0.2, 0);
  tri.lineTo(0, 1.7);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: kd * 0.99, bevelEnabled: false });
  gable.rotateY(Math.PI / 2);
  const gm = new THREE.Mesh(gable, wallMat);
  gm.rotation.y = Math.PI / 2;
  gm.rotation.y = 0;
  const gg = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: kd, bevelEnabled: false }), wallMat);
  gg.rotation.y = -Math.PI / 2;
  gg.position.set(kw / 2 + 0.2, kh + 0.3, kd / 2);
  // 戸
  const door = box(1.2, 2.2, 0.1, darkWood, 0, 1.4, kd / 2 + 0.05);
  kura.add(door);
  kura.position.set(-14, 0, 2);
  kura.rotation.y = 0.1;
  kura.children.forEach((c) => { c.castShadow = true; c.receiveShadow = true; });
  g.add(kura);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  return g;
}

// 稲架（はさ掛け）
export function buildHasa(scene) {
  const group = new THREE.Group();
  const rng = mulberry32(61);
  const woodMat = wood(0xc2b090, makeWoodTexture({ planks: 1, base: '#8a7350' }), [0.2, 2]);
  const poleG = new THREE.CylinderGeometry(0.04, 0.05, 1, 6, 1);
  const bundleG = (() => {
    const g1 = new THREE.CylinderGeometry(0.1, 0.055, 0.55, 7, 2, true);
    g1.translate(0, -0.28, 0);
    // 稲穂側(上)は広がる
    const g2 = new THREE.CylinderGeometry(0.01, 0.012, 0.9, 5, 1);
    return g1;
  })();
  const bundleMat = new THREE.MeshStandardMaterial({ color: 0xc9a24c, roughness: 0.85, side: THREE.DoubleSide });
  patchMaterial(bundleMat, { translucent: 1.5, detail: 'leaf' });
  const bundleM = [], bundleC = [];
  const rows = [
    { x: FIELD.x - 6, z: FIELD.z + 8, len: 14, rot: 0.1 },
    { x: FIELD.x - 6, z: FIELD.z + 4, len: 14, rot: 0.1 },
    { x: FIELD.x - 4, z: FIELD.z - 1, len: 12, rot: 0.08 },
  ];
  for (const row of rows) {
    const nPoles = Math.floor(row.len / 2.2) + 1;
    const dirx = Math.cos(row.rot), dirz = Math.sin(row.rot);
    for (let i = 0; i < nPoles; i++) {
      const x = row.x + dirx * i * 2.2, z = row.z + dirz * i * 2.2;
      const y = terrainHeight(x, z);
      const h = 2.0;
      const p = new THREE.Mesh(poleG, woodMat);
      p.scale.set(1, h, 1);
      p.position.set(x, y + h / 2 - 0.05, z);
      p.rotation.z = (rng() - 0.5) * 0.04;
      p.castShadow = true;
      group.add(p);
    }
    // 横木
    const L = (nPoles - 1) * 2.2 + 0.4;
    for (const hy of [1.0, 1.45, 1.9]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 6, 1), woodMat);
      bar.rotation.z = Math.PI / 2;
      bar.rotation.y = -row.rot;
      const cx = row.x + dirx * (L / 2 - 0.2), cz = row.z + dirz * (L / 2 - 0.2);
      bar.position.set(cx, terrainHeight(cx, cz) + hy, cz);
      bar.castShadow = true;
      group.add(bar);
      // 稲束を掛ける
      const nb = Math.floor(L / 0.19);
      for (let k = 0; k < nb; k++) {
        const t = k / nb;
        const x = row.x + dirx * (t * L - 0.2), z = row.z + dirz * (t * L - 0.2);
        const y = terrainHeight(x, z) + hy;
        for (const side of [-1, 1]) {
          bundleM.push(M(x + dirz * side * 0.05, y, z - dirx * side * 0.05, (rng() - 0.5) * 0.08, rng() * TAU, side * 0.14, 1, 0.95 + rng() * 0.3, 1));
          const t = 0.8 + rng() * 0.4;
          bundleC.push(new THREE.Color(t, t * (0.92 + rng() * 0.1), t * 0.85));
        }
      }
    }
  }
  const bundles = instancedFrom(bundleG, bundleMat, bundleM, bundleC);
  bundles.castShadow = true;
  group.add(bundles);
  scene.add(group);
  return group;
}

// 電柱と電線
export function buildPoles(scene, polePts) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.95 });
  patchMaterial(poleMat, { detail: 'wood' });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });
  const insMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.3 });
  const tops = [];
  for (const [x, z] of polePts) {
    const y = terrainHeight(x, z);
    const h = 9.5;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, h, 8, 1), poleMat);
    p.position.set(x, y + h / 2, z);
    p.castShadow = true;
    group.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), armMat);
    arm.position.set(x, y + h - 0.6, z);
    arm.rotation.y = 0.9;
    arm.castShadow = true;
    group.add(arm);
    const arm2 = arm.clone();
    arm2.position.y = y + h - 1.9;
    arm2.scale.x = 0.8;
    group.add(arm2);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x6a7a74, roughness: 0.6, metalness: 0.4 }));
    tr.position.set(x + 0.4, y + h - 2.5, z);
    if (polePts.indexOf([x, z]) % 2 === 0) group.add(tr);
    const pts = [];
    for (const off of [-1, 0, 1]) {
      pts.push(new THREE.Vector3(x + Math.sin(0.9) * off * 1.0, y + h - 0.5, z + Math.cos(0.9) * off * 1.0));
    }
    for (const off of [-0.8, 0.8]) pts.push(new THREE.Vector3(x + Math.sin(0.9) * off, y + h - 1.8, z + Math.cos(0.9) * off));
    tops.push(pts);
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b });
  for (let i = 0; i < tops.length - 1; i++) {
    for (let k = 0; k < tops[i].length; k++) {
      const a = tops[i][k], b = tops[i + 1][k];
      const pts = [];
      const span = a.distanceTo(b);
      for (let s = 0; s <= 24; s++) {
        const t = s / 24;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * span * 0.035;
        pts.push(p);
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
  }
  scene.add(group);
  return group;
}

// お地蔵さん
export function buildJizo(scene, x, z) {
  const g = new THREE.Group();
  const y = terrainHeight(x, z);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8e9086, roughness: 1 });
  patchMaterial(stone, { detail: 'terrain' });
  const moss = new THREE.MeshStandardMaterial({ color: 0x5a6a38, roughness: 1 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0302a, roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.65), stone);
  base.position.y = 0.11;
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.48), stone);
  base2.position.y = 0.32;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 14), stone);
  body.position.y = 0.72;
  body.scale.set(1.0, 1, 0.85);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), stone);
  head.position.y = 1.15;
  const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.17, 0.12, 12, 1, true), red);
  bib.position.y = 0.98;
  bib.material.side = THREE.DoubleSide;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 12), red);
  hat.position.y = 1.27;
  const mossTop = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 5, 0, TAU, 0, 1.0), moss);
  mossTop.position.set(0.2, 0.23, 0.12);
  mossTop.scale.set(1.2, 0.35, 1);
  g.add(base, base2, body, head, bib, hat, mossTop);
  // お供えの小石と花
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.035, 0), stone);
    s.position.set(-0.15 + i * 0.1, 0.46, 0.2);
    g.add(s);
  }
  g.position.set(x, y, z);
  g.rotation.y = 0.5;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  return g;
}

// 立て看板
export function buildSign(scene, x, z, rotY, title = 'ひだまり沼', sub = 'ふな・こい・たなご　釣り場') {
  const g = new THREE.Group();
  const y = terrainHeight(x, z);
  const woodMat = wood(0xc2ae90, makeWoodTexture({ planks: 1 }), [0.3, 2]);
  const post1 = box(0.1, 1.5, 0.1, woodMat, -0.55, 0.75, 0);
  const post2 = box(0.1, 1.5, 0.1, woodMat, 0.55, 0.75, 0);
  const tex = makeSignTexture(title, sub);
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  patchMaterial(boardMat, {});
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.06), [woodMat, woodMat, woodMat, woodMat, boardMat, woodMat]);
  board.position.set(0, 1.12, 0.04);
  g.add(post1, post2, board);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  return g;
}

export function updateProps(props, atm, time) {
  // 夜は窓が灯り、ランタンがともる
  const night = clamp(atm.night * 1.1 + smoothstep(8, -2, atm.sunElev) * 0.35);
  const dusk = smoothstep(14, -1, atm.sunElev);
  if (props.farmhouse) props.farmhouse.userData.shojiMat.emissiveIntensity = dusk * 1.5 + 0.02;
  if (props.gear) {
    const L = props.gear.userData.lights;
    L.lamp.intensity = night * 14 * (0.94 + 0.06 * Math.sin(time * 9.0 + Math.sin(time * 3.1)));
    L.lampGlass.emissiveIntensity = night * 3.2;
    const e = props.gear.userData.ember;
    e.scale.setScalar(0.85 + 0.25 * Math.sin(time * 5.0));
  }
}
