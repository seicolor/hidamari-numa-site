// ホヌ（ハワイのアオウミガメ）: ときどき入り江をよこぎる、見守るだけの住人。
//  近づきすぎず、釣りのじゃまもしない。ときどき水面に顔を出して息つぎをする。
import * as THREE from 'three';
import { clamp, lerp, hexToLinear, noise2, smoothstep } from '../util.js';
import { patchMaterial } from '../materials.js';
import { mergeGeos, colorize } from '../geo.js';
import { pondSigned, waterDepthAt } from './terrain.js';

const rand = (a, b) => a + Math.random() * (b - a);
const C = (h) => hexToLinear(h);

function ellipsoid(rx, ry, rz, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.scale(rx, ry, rz);
  return g;
}

// 3次元のセル模様（うろこ・甲らの板）。f1: いちばん近い点まで, f2: 2番目, id: その点の番号
function cells(x, y, z, out) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let f1 = 9, f2 = 9, id = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, cz = iz + k;
    const h = Math.sin(cx * 127.1 + cy * 311.7 + cz * 74.7) * 43758.5453;
    const r1 = h - Math.floor(h), r2 = (h * 1.31) - Math.floor(h * 1.31), r3 = (h * 1.73) - Math.floor(h * 1.73);
    const dx = cx + 0.15 + 0.7 * r1 - x, dy = cy + 0.15 + 0.7 * r2 - y, dz = cz + 0.15 + 0.7 * r3 - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < f1) { f2 = f1; f1 = d; id = r1; } else if (d < f2) f2 = d;
  }
  out.f1 = f1; out.f2 = f2; out.id = id;
  return out;
}
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// 甲らの輪郭（上から見た半径。前=頭の側、うしろは少しとがる）
const SHELL_L = 0.5;
const outline = (phi) => 0.46 - 0.03 * Math.cos(phi) + 0.04 * Math.cos(2 * phi) + 0.05 * Math.pow(Math.max(0, -Math.cos(phi)), 8);
// 甲らの板（背中の5枚・左右4枚ずつ）の中心。x: 前後, z: 左右（甲らの大きさで割った値）
const SCUTES = [[0.62, 0], [0.3, 0], [-0.02, 0], [-0.34, 0], [-0.64, 0]];
for (const s of [1, -1]) SCUTES.push([0.42, 0.46 * s], [0.12, 0.6 * s], [-0.2, 0.58 * s], [-0.5, 0.42 * s]);

function shellGeo() {
  // 球の極を前後に向けて作る（背中のてっぺんに、しわが寄らないように）
  const g = new THREE.SphereGeometry(1, 72, 44);
  g.rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  const nrm = [];
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i);
    const rho = Math.hypot(sx, sz), phi = Math.atan2(sz, sx);
    const R = outline(phi);
    const x = Math.cos(phi) * R * rho, z = Math.sin(phi) * R * rho;
    let y;
    if (sy >= 0) {
      // 背中: なだらかなドーム。真ん中にうすい背すじ、ふちはうすく反る
      y = 0.23 * Math.pow(sy, 0.72) * (1 + 0.08 * Math.cos(phi)) + 0.01 * Math.exp(-(z * z) / 0.004) * sy;
      y += 0.012 * smoothstep(0.82, 1.0, rho) * (1 - sy);
    } else {
      y = 0.075 * sy;   // 腹（平たい）
    }
    p.setXYZ(i, x, y, z);
    nrm.push(rho, sy, phi);
  }
  g.computeVertexNormals();
  const plast = C(0xe6d6a6), plastB = C(0xc9b47e);
  const base = C(0x463f27), amber = C(0x8a7442), olive = C(0x55593a), dark = C(0x221e16), seam = C(0xa8966a), inner = C(0x2a2419), rim = C(0x3a3424), algae = C(0x4d5e34);
  const tmp = {};
  colorize(g, (x, y, z, i) => {
    const rho = nrm[i * 3], sy = nrm[i * 3 + 1], phi = nrm[i * 3 + 2];
    if (sy < -0.05) {
      // 腹の板: クリーム色、すじは少し濃い
      const u = x / SHELL_L, v = z / 0.47;
      const line = Math.min(Math.abs(v) < 0.04 ? 0 : 1, Math.abs(Math.sin(u * 7.0)) < 0.08 ? 0.4 : 1);
      return mix3(plastB, plast, line * (0.8 + 0.2 * noise2(x * 9, z * 9)));
    }
    const u = x / SHELL_L, v = z / 0.47;
    let c;
    if (rho > 0.86) {
      // ふちの小さな板（左右に11枚ずつ）
      const k = (phi / (Math.PI * 2)) * 24;
      const fk = k - Math.floor(k);
      const e = smoothstep(0.06, 0.0, Math.min(fk, 1 - fk)) + smoothstep(0.9, 0.87, rho) * 0.9;
      c = mix3(rim, amber, 0.25 + 0.3 * noise2(k * 3.1, 2));
      c = mix3(c, seam, clamp(e) * 0.75);
    } else {
      // 背中の大きな板: いちばん近い中心と2番目の差で、さかいの線を出す
      let d1 = 9, d2 = 9, cx = 0, cz = 0;
      for (const sc of SCUTES) {
        const dx = (u - sc[0]) * 1.0, dz = (v - sc[1]) * (sc[1] === 0 ? 1.25 : 1.0);
        const d = Math.hypot(dx, dz);
        if (d < d1) { d2 = d1; d1 = d; cx = sc[0]; cz = sc[1]; } else if (d < d2) d2 = d;
      }
      const edge = smoothstep(0.05, 0.012, d2 - d1);
      const near = smoothstep(0.11, 0.05, d2 - d1);
      // 板ごとに、中心から放射状にのびる明るいすじ（アオウミガメの甲らの模様）
      const a = Math.atan2(v - cz, u - cx);
      const ray = 0.5 + 0.5 * Math.sin(a * 7 + noise2(u * 6, v * 6) * 3.0 + cx * 20);
      const rr = Math.hypot(u - cx, v - cz);
      c = mix3(base, olive, 0.5 + 0.5 * noise2(u * 4 + 7, v * 4));
      c = mix3(c, amber, Math.pow(ray, 3.0) * smoothstep(0.04, 0.22, rr) * 0.55);
      c = mix3(c, dark, smoothstep(0.1, 0.0, rr) * 0.35);
      c = mix3(c, inner, (near - edge) * 0.55);   // 板のふちの内側は濃い
      c = mix3(c, seam, edge * 0.8);             // さかいの線は明るい
    }
    // 水あかのくすみ
    const grime = smoothstep(0.2, 0.7, noise2(x * 5 + 11, z * 5)) * 0.25;
    c = mix3(c, [c[0] * 0.75, c[1] * 0.85, c[2] * 0.7], grime);
    // うしろの方には、うすく藻がつく
    return mix3(c, algae, smoothstep(0.0, -0.45, x) * smoothstep(0.3, 0.7, noise2(x * 7, z * 7 + 3)) * 0.4);
  });
  return g;
}

// 頭: 丸みのある、くちばし状の口。茶色のうろこに、黄色いふち
function headGeo() {
  const g = new THREE.SphereGeometry(1, 28, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = Math.max(0, x);
    // 前にいくほど細く、口先は下向きに丸い
    const w = 1 - 0.32 * f * f;
    y = y * w - 0.18 * f * f * f;
    z *= w;
    p.setXYZ(i, x * 0.165, y * 0.078, z * 0.086);
  }
  g.computeVertexNormals();
  const scale = C(0x4f4030), edge = C(0xbfa874), beak = C(0x6e6450), belly = C(0xd0c49a);
  const t = {};
  colorize(g, (x, y, z) => {
    if (y < -0.02 && x < 0.08) return mix3(belly, edge, 0.3);
    cells(x * 46, y * 46, z * 46, t);
    const e = smoothstep(0.08, 0.015, t.f2 - t.f1);
    let c = mix3(scale, C(0x5e4a30), t.id);
    c = mix3(c, edge, e * 0.6);
    if (x > 0.12 && y < 0.0) c = mix3(c, beak, 0.7);
    return c;
  });
  return g;
}

// ひれ: 長い櫂（かい）のかたち。s: 左右（+1 = +z の側）。うしろへ反る
function flipperGeo(len, wid, s, front) {
  const g = new THREE.SphereGeometry(1, 30, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i);
    const t = (sx + 1) * 0.5;                    // 根もと 0 → 先 1
    const w = front ? wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.82 + 0.1)), 0.75) * (1 - 0.55 * t) + 0.012
      : wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.06)), 0.6) + 0.01;
    const th = (front ? 0.03 : 0.025) * (1 - 0.75 * t) + 0.004;
    const sweep = (front ? 0.2 : 0.06) * t * t;   // うしろ（-x）へ反る
    // うしろへの反り（左右で、からだの後ろにあたる向きが逆）
    p.setXYZ(i, t * len, sy * th, sz * w + sweep * s);
  }
  g.computeVertexNormals();
  const skin = C(0x463a2a), pale = C(0xbcaa7c), under = C(0xcdbb88);
  const t = {};
  colorize(g, (x, y, z) => {
    if (y < -0.004) return mix3(under, skin, 0.25);
    cells(x * 40, y * 40, z * 40, t);
    const e = smoothstep(0.09, 0.015, t.f2 - t.f1);
    let c = mix3(skin, C(0x564530), t.id * 0.8);
    c = mix3(c, pale, e * 0.5);
    // 前のふちと先は、明るい
    return c;
  });
  return g;
}

function buildTurtle() {
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
  patchMaterial(shellMat, { underwater: true });
  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  patchMaterial(skinMat, { underwater: true });
  const group = new THREE.Group();
  const shellM = new THREE.Mesh(shellGeo(), shellMat);
  group.add(shellM);
  // 頭と首（首は、甲らの下から少しのぞく）
  const headPiv = new THREE.Group();
  headPiv.position.set(SHELL_L * 0.86, 0.0, 0);
  const neck = ellipsoid(0.13, 0.075, 0.085, 14); neck.translate(0.04, -0.005, 0);
  colorize(neck, (x, y) => (y > 0 ? C(0x4e3a22) : C(0xcdbb88)));
  const head = headGeo(); head.translate(0.18, 0.012, 0);
  const eyes = [1, -1].map((s) => { const e = ellipsoid(0.024, 0.021, 0.016, 10); e.translate(0.235, 0.036, 0.058 * s); colorize(e, () => [0.012, 0.01, 0.008]); return e; });
  headPiv.add(new THREE.Mesh(mergeGeos([neck, head, ...eyes]), skinMat));
  group.add(headPiv);
  group.userData.head = headPiv;
  // しっぽ
  const tail = ellipsoid(0.07, 0.025, 0.035, 8); tail.translate(-0.52, -0.02, 0);
  colorize(tail, () => C(0x4a3a24));
  group.add(new THREE.Mesh(tail, skinMat));
  // ひれ（前は長い櫂、うしろは小さなかじ）。回転は「ねじり→はばたき→前後」の順
  const fl = [];
  const mk = (front, s) => {
    const piv = new THREE.Group();
    piv.rotation.order = 'YZX';
    if (front) piv.position.set(0.3, -0.035, 0.24 * s);
    else piv.position.set(-0.4, -0.035, 0.16 * s);
    const geo = front ? flipperGeo(0.5, 0.095, s, true) : flipperGeo(0.2, 0.07, s, false);
    piv.add(new THREE.Mesh(geo, skinMat));
    const ang = front ? 1.2 : 2.45;               // 前からはかった向き（ラジアン）
    piv.rotation.y = -s * ang;
    group.add(piv);
    fl.push({ piv, s, ang, front });
  };
  for (const s of [1, -1]) { mk(true, s); mk(false, s); }
  group.userData.flippers = fl;
  return group;
}

export class Honu {
  constructor(scene, water, hooks = {}) {
    this.hooks = hooks;
    this.water = water;
    this.g = buildTurtle();
    this.g.visible = false;
    this.g.scale.setScalar(1.0);
    this.size = 1.3;
    scene.add(this.g);
    this.state = 'wait';
    this.wait = rand(25, 60);
    this.t = 0;
    this.seen = false;
    this.path = [];
  }

  // 入り江のなかで、深さが 0.9 m 以上の場所をたどる
  _pickPath() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const pts = [];
    const ok = (x, z) => pondSigned(x, z) < -5 && waterDepthAt(x, z) > 0.9;
    let cx = side * rand(24, 31), cz = rand(-22, -16);
    for (let k = 0; k < 40 && !ok(cx, cz); k++) { cx = side * rand(20, 30); cz = rand(-24, -12); }
    pts.push([cx, cz]);
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      let x = lerp(cx, -side * rand(22, 30), f) + rand(-4, 4), z = lerp(cz, rand(-9, 0), Math.sin(f * Math.PI) * 0.8 + f * 0.2) + rand(-3, 3);
      for (let k = 0; k < 30 && !ok(x, z); k++) { x = lerp(cx, -side * 25, f) + rand(-6, 6); z = rand(-14, 2); }
      pts.push([x, z]);
    }
    return pts;
  }

  _start() {
    this.path = this._pickPath();
    this.seg = 0; this.segT = 0;
    this.x = this.path[0][0]; this.z = this.path[0][1];
    this.heading = Math.atan2(this.path[1][1] - this.path[0][1], this.path[1][0] - this.path[0][0]);
    this.y = -1.0; this.breath = rand(8, 16); this.up = 0; this.fade = 0;
    this.state = 'swim';
    this.g.visible = true;
  }

  update(dt, time, ctx = {}) {
    const g = this.g;
    if (this.state === 'wait') {
      this.wait -= dt;
      if (this.wait <= 0 && (ctx.night ?? 0) < 0.6 && (ctx.rain ?? 0) < 0.6) this._start();
      else if (this.wait <= 0) this.wait = rand(20, 40);
      return;
    }
    // ゆっくり泳ぐ（0.35〜0.5 m/s）。次の点へ向きをかえる。
    // 最後の点を過ぎたら（leave）、向きはそのままで泳ぎ去る（その先の点は、もうない）
    const p = this.state === 'swim' ? this.path[this.seg + 1] : null;
    let dist = Infinity;
    if (p) {
      const dx = p[0] - this.x, dz = p[1] - this.z;
      dist = Math.hypot(dx, dz);
      let dh = Math.atan2(dz, dx) - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += clamp(dh, -0.4 * dt, 0.4 * dt);
    }
    const sp = this.up > 0 ? 0.22 : 0.42;
    this.x += Math.cos(this.heading) * sp * dt;
    this.z += Math.sin(this.heading) * sp * dt;
    if (dist < 1.5) {
      this.seg++;
      if (this.seg >= this.path.length - 1) { this.state = 'leave'; this.leaveT = 0; }
    }
    if (this.state === 'leave') {
      this.leaveT += dt;
      this.fade = clamp(1 - this.leaveT / 3);
      if (this.leaveT > 3) { this.state = 'wait'; this.wait = rand(70, 160); g.visible = false; return; }
    } else this.fade = clamp(this.fade + dt / 3);
    // 息つぎ: ときどき浮かんで、顔を出す
    this.breath -= dt;
    if (this.breath <= 0 && this.up <= 0) { this.up = 4.2; this.breath = rand(22, 38); }
    let ty = -0.95 + 0.15 * Math.sin(time * 0.3 + this.x);
    if (this.up > 0) {
      this.up -= dt;
      ty = -0.06;
      if (this.up > 3.5 && !this._rip) { this._rip = true; this.hooks.ripple && this.hooks.ripple(this.x + Math.cos(this.heading) * 0.5, this.z + Math.sin(this.heading) * 0.5, 0.18); }
      if (this.up <= 0) this._rip = false;
    }
    const floor = -waterDepthAt(this.x, this.z) + 0.3;
    ty = Math.max(ty, floor);
    this.y = lerp(this.y, ty, 1 - Math.exp(-1.5 * dt));
    // 水面ちかくでは、波といっしょに上下する
    const wv = this.water.waveAt ? this.water.waveAt(this.x, this.z) : null;
    const ride = wv ? smoothstep(-0.6, -0.1, this.y) : 0;
    g.position.set(this.x, this.y + (wv ? wv.y * ride : 0), this.z);
    g.rotation.set(0, -this.heading, 0.04 * Math.sin(time * 1.1));
    g.rotation.x = 0.03 * Math.sin(time * 1.1 + 1);
    g.scale.setScalar(this.size * (0.25 + 0.75 * smoothstep(0, 1, this.fade)));
    // 前ひれを、鳥が飛ぶように左右そろえて羽ばたく（下げながら後ろへ、上げながら前へ）。息つぎ中はゆっくり
    this.ph = (this.ph || 0) + dt * (this.up > 0 ? 0.8 : 1.45);
    const ph = this.ph;
    for (const f of g.userData.flippers) {
      if (f.front) {
        // 息つぎ中は、水面でひれを横にひろげて、ゆっくりこぐだけ
        this.flapK = lerp(this.flapK ?? 1, this.up > 0 ? 0.3 : 1, 1 - Math.exp(-1.2 * dt));
        const k = this.flapK;
        f.piv.rotation.z = (0.12 + 0.5 * Math.sin(ph)) * k - 0.04 * (1 - k);
        f.piv.rotation.y = -f.s * (f.ang - 0.32 * Math.sin(ph) * k);
        f.piv.rotation.x = f.s * 0.45 * Math.cos(ph) * k;
      } else {
        f.piv.rotation.z = 0.08 * Math.sin(ph + 2);
        f.piv.rotation.y = -f.s * (f.ang + 0.12 * Math.sin(ph * 0.5));
      }
    }
    // 頭: 息つぎで、顔を上げる
    const hd = g.userData.head;
    hd.rotation.z = lerp(hd.rotation.z, this.up > 0 ? 0.35 : 0.05 * Math.sin(ph * 0.5), 1 - Math.exp(-3 * dt));
    hd.rotation.y = 0.12 * Math.sin(time * 0.37);
    // はじめて近くを通ったとき
    if (!this.seen && Math.hypot(this.x - 0, this.z - 8) < 24) { this.seen = true; this.hooks.onFirst && this.hooks.onFirst(); }
  }
}
