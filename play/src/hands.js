// 釣った魚を見せるときの「手」。手のひらを上にして、魚をそっとのせる（大きな魚は両手で）。
// 長さはメートル。実物の大きさ（手のひら幅 約9cm）なので、魚の大きさの目安になる。
import * as THREE from 'three';
import { mergeGeos } from './geo.js';
import { patchMaterial } from './materials.js';
import { applyEnv } from './env.js';

const SKIN = new THREE.Color(0xcd9874);
const SKIN_SHADE = new THREE.Color(0x965c45);
const SLEEVE = new THREE.Color(0x34465f);
const CUFF = new THREE.Color(0x52667f);
const Y = new THREE.Vector3(0, 1, 0);
const rad = (d) => (d * Math.PI) / 180;

// 下側ほど暗い肌色（手のひら側は明るく、甲側は影になる）
function paintSkin(geo) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) + 0.02) / 0.04, 0, 1);
    col.copy(SKIN_SHADE).lerp(SKIN, t);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function paintFlat(geo, color) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// 2点のあいだの丸い棒（関節が丸くつながる）
function capsule(a, b, r) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(1e-4, len), 4, 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function cylinder(a, b, r0, r1, open = false) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 18, 1, open);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function ellipsoid(rx, ry, rz, x, y, z) {
  const g = new THREE.SphereGeometry(1, 18, 12);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

// 手のひらを上、指先を -z に向けた手（手首が +z）。side: +1 右手（親指が +x）/ -1 左手
function buildHand(side) {
  const sx = side;
  const skin = [];
  // 手のひらと盛り上がり
  skin.push(ellipsoid(0.046, 0.0155, 0.053, 0, 0, -0.002));
  skin.push(ellipsoid(0.026, 0.013, 0.032, 0.024 * sx, 0.006, 0.022)); // 親指のつけ根
  skin.push(ellipsoid(0.018, 0.011, 0.03, -0.028 * sx, 0.004, 0.02)); // 小指側
  // 指（人さし・中・くすり・小指）。ゆるくカーブして、魚をのせても指がじゃまにならない
  const fingers = [
    { x: 0.031, z: -0.046, L: [0.042, 0.025, 0.02], r: 0.0095, spread: 5, curl: [16, 40, 34] },
    { x: 0.0105, z: -0.049, L: [0.046, 0.028, 0.021], r: 0.0098, spread: 1, curl: [18, 44, 36] },
    { x: -0.0105, z: -0.047, L: [0.042, 0.026, 0.02], r: 0.0092, spread: -3, curl: [20, 46, 38] },
    { x: -0.031, z: -0.042, L: [0.033, 0.02, 0.018], r: 0.0082, spread: -8, curl: [24, 48, 40] },
  ];
  for (const f of fingers) {
    let p = new THREE.Vector3(f.x * sx, 0.004, f.z);
    let th = 0;
    const sp = rad(f.spread) * sx;
    for (let i = 0; i < 3; i++) {
      th += rad(f.curl[i]);
      const dir = new THREE.Vector3(Math.sin(sp) * Math.cos(th), Math.sin(th), -Math.cos(sp) * Math.cos(th)).normalize();
      const q = p.clone().addScaledVector(dir, f.L[i]);
      skin.push(capsule(p, q, f.r * (1 - 0.1 * i)));
      p = q;
    }
  }
  // 親指（外へ開いて、先がやや内側へ）
  {
    let p = new THREE.Vector3(0.036 * sx, 0.0, 0.016);
    const segs = [[0.036, 54, 8], [0.03, 34, 18], [0.026, 14, 28]];
    segs.forEach(([L, yaw, pitch], i) => {
      const y = rad(yaw), pt = rad(pitch);
      const dir = new THREE.Vector3(Math.sin(y) * Math.cos(pt) * sx, Math.sin(pt), -Math.cos(y) * Math.cos(pt)).normalize();
      const q = p.clone().addScaledVector(dir, L);
      skin.push(capsule(p, q, 0.0118 - i * 0.0012));
      p = q;
    });
  }
  // 手首〜前腕（手前・下へ向かう）
  const wrist = new THREE.Vector3(0, -0.004, 0.056);
  const fdir = new THREE.Vector3(0, -0.5, 0.86).normalize();
  const elbow = wrist.clone().addScaledVector(fdir, 1.25);
  skin.push(capsule(wrist, wrist.clone().addScaledVector(fdir, 0.16), 0.0295));
  skin.forEach(paintSkin);
  // 袖（ゆったりした作務衣風）
  const cuffA = wrist.clone().addScaledVector(fdir, 0.13);
  const cuffB = wrist.clone().addScaledVector(fdir, 0.145);
  const cloth = [
    paintFlat(cylinder(cuffB, elbow, 0.046, 0.075, false), SLEEVE),
    paintFlat(cylinder(cuffA, cuffB, 0.0445, 0.0455, false), CUFF),
  ];
  return { skin: mergeGeos(skin), cloth: mergeGeos(cloth) };
}

export function buildHands() {
  const group = new THREE.Group();
  group.name = 'hands';
  group.visible = false;
  const skinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  patchMaterial(skinMat, { translucent: 0.6 });
  skinMat.userData.patchKey = 'hand-skin';
  applyEnv(skinMat, 0.5);
  const clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  patchMaterial(clothMat, {});
  clothMat.userData.patchKey = 'hand-cloth';
  const make = (side) => {
    const g = buildHand(side);
    const h = new THREE.Group();
    const a = new THREE.Mesh(g.skin, skinMat);
    const b = new THREE.Mesh(g.cloth, clothMat);
    a.frustumCulled = false; b.frustumCulled = false;
    h.add(a, b);
    group.add(h);
    return h;
  };
  return { group, right: make(1), left: make(-1) };
}
