// 待ち時間の小さな出来事: 杭にとまるカワセミ（ダイブして魚をとる）、スイレンの葉にのるカエル
import * as THREE from 'three';
import { clamp, lerp, TAU, hexToLinear } from './util.js';
import { pondSigned, waterDepthAt } from './terrain.js';
import { patchMaterial } from './materials.js';
import { mergeGeos, colorFlat } from './geo.js';
import { PIER } from './props.js';
import { SEASON } from './season.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const lin = (h) => hexToLinear(h);
const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);
const easeInOut = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };

// 楕円体のパーツ（色つき）
function ell(rx, ry, rz, x, y, z, color, rot = [0, 0, 0]) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.scale(rx, ry, rz);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(x, y, z);
  return colorFlat(g, lin(color));
}
const stdMat = (opts, patch = { underwater: true }) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.7, ...opts }); patchMaterial(m, patch); return m; };

// ---------------------------------------------------------------- カワセミ
function buildKingfisher() {
  const body = mergeGeos([
    ell(0.060, 0.042, 0.040, 0, 0, 0, 0x1f9fb5, [0, 0, 0.1]),            // 背（青緑）
    ell(0.050, 0.030, 0.036, 0.008, -0.022, 0, 0xe27a2e, [0, 0, 0.1]),   // 腹（橙）
    ell(0.036, 0.033, 0.032, 0.062, 0.022, 0, 0x2a86b8),                 // 頭
    ell(0.011, 0.012, 0.004, 0.064, 0.014, 0.030, 0xe27a2e),             // 頬
    ell(0.011, 0.012, 0.004, 0.064, 0.014, -0.030, 0xe27a2e),
    ell(0.012, 0.010, 0.012, 0.080, -0.004, 0, 0xf4f1e8),                // のどの白
    ell(0.034, 0.010, 0.020, -0.075, -0.006, 0, 0x1b6f9a, [0, 0, -0.15]), // 尾
  ]);
  const bodyMat = stdMat({ vertexColors: true });
  const bodyMesh = new THREE.Mesh(body, bodyMat);
  const dark = stdMat({ color: 0x1e1e22, roughness: 0.5 });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.0115, 0.085, 6), dark);
  beak.rotation.z = -Math.PI / 2; beak.position.set(0.122, 0.020, 0);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x0c0c0c });
  const eyes = [1, -1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 4), eyeM); e.position.set(0.084, 0.032, 0.023 * s); return e; });
  const legM = stdMat({ color: 0xd8552a, roughness: 0.6 });
  const legs = [1, -1].map((s) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 4), legM); l.position.set(0.0, -0.058, 0.016 * s); return l; });
  // 魚（くわえて飛ぶ）
  const fishM = stdMat({ color: 0xd3dde0, roughness: 0.35, emissive: new THREE.Color(0.12, 0.12, 0.12) });
  const fish = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), fishM);
  fish.scale.set(0.034, 0.008, 0.012); fish.position.set(0.138, 0.016, 0); fish.rotation.z = 0.15; fish.visible = false;
  // 翼（飛ぶときだけ）
  const wingGeo = new THREE.PlaneGeometry(0.1, 0.046, 1, 1); wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(-0.005, 0, 0.05);
  const wingM = stdMat({ color: 0x1b7fa5, roughness: 0.6, side: THREE.DoubleSide });
  const wings = [1, -1].map((s) => { const w = new THREE.Mesh(wingGeo, wingM); w.scale.z = s; w.position.set(0.01, 0.022, 0.028 * s); w.visible = false; return w; });
  const head = new THREE.Group();   // くちばし・目は頭といっしょに向きを変える
  head.position.set(0.062, 0.022, 0);
  [beak, ...eyes, fish].forEach((m) => { m.position.x -= 0.062; m.position.y -= 0.022; head.add(m); });
  const rig = new THREE.Group();
  rig.add(bodyMesh, head, ...legs, ...wings);
  const group = new THREE.Group();
  group.add(rig);
  group.scale.setScalar(2.2);
  group.visible = false;
  return { group, rig, head, wings, legs, fish, bodyMesh };
}

// 杭（カワセミの止まり木）
function buildStake(depth = 1.2) {
  const g = new THREE.Group();
  const m = stdMat({ color: 0x8a7860, roughness: 0.95, emissive: new THREE.Color(0.05, 0.04, 0.03) });
  const H = depth + 0.52 + 0.3;     // 水底にささって、水面から0.5mほど出る
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.05, H, 7, 3), m);
  post.position.y = 0.52 - H / 2;
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.22, 5), m);
  twig.position.set(0.09, 0.3, 0); twig.rotation.z = -1.0;
  g.add(post, twig);
  post.castShadow = true;
  return g;
}

// ---------------------------------------------------------------- カエル
function buildFrog() {
  const body = mergeGeos([
    ell(0.050, 0.030, 0.040, 0, 0.032, 0, 0x5c9a3c),
    ell(0.046, 0.016, 0.034, 0.004, 0.014, 0, 0xcfdc9c),
    ell(0.030, 0.022, 0.032, 0.052, 0.046, 0, 0x62a540),
    ell(0.040, 0.004, 0.010, 0.000, 0.060, 0, 0xd2e59c),
    ell(0.036, 0.012, 0.012, -0.030, 0.026, 0.040, 0x4d8a32, [0, 0, 0.4]),
    ell(0.036, 0.012, 0.012, -0.030, 0.026, -0.040, 0x4d8a32, [0, 0, 0.4]),
    ell(0.022, 0.005, 0.012, -0.048, 0.006, 0.052, 0x4d8a32),
    ell(0.022, 0.005, 0.012, -0.048, 0.006, -0.052, 0x4d8a32),
    ell(0.011, 0.020, 0.008, 0.046, 0.018, 0.030, 0x5c9a3c),
    ell(0.011, 0.020, 0.008, 0.046, 0.018, -0.030, 0x5c9a3c),
  ]);
  const mesh = new THREE.Mesh(body, stdMat({ vertexColors: true, roughness: 0.45, emissive: new THREE.Color(0.02, 0.05, 0.02) }));
  const eyeM = stdMat({ color: 0xd9b43a, roughness: 0.3 });
  const pupM = new THREE.MeshBasicMaterial({ color: 0x0c0c0c });
  const eyes = [1, -1].map((s) => {
    const e = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 8, 6), eyeM);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 4), pupM); pup.position.set(0.006, 0.002, 0.004 * s);
    e.add(ball, pup); e.position.set(0.058, 0.07, 0.022 * s);
    return e;
  });
  const rig = new THREE.Group();
  rig.add(mesh, ...eyes);
  const group = new THREE.Group();
  group.add(rig);
  group.scale.setScalar(2.4);
  group.visible = false;
  return { group, rig, eyes, mesh };
}


// ---------------------------------------------------------------- 猫
function catParts(pose) {
  const O = 0xd98a3d, W = 0xf2ece0, D = 0xa8641f;
  const parts = [];
  if (pose === 'sit') {
    parts.push(
      ell(0.085, 0.075, 0.075, -0.02, 0.07, 0, O),
      ell(0.060, 0.100, 0.055, 0.050, 0.130, 0, O, [0, 0, 0.15]),
      ell(0.030, 0.070, 0.040, 0.088, 0.120, 0, W),
      ell(0.062, 0.055, 0.058, 0.075, 0.245, 0, 0xdc9444),
      ell(0.026, 0.020, 0.030, 0.125, 0.232, 0, W),
      ell(0.007, 0.006, 0.008, 0.149, 0.238, 0, 0xd98a8a),
      ell(0.022, 0.075, 0.022, 0.070, 0.065, 0.032, O), ell(0.022, 0.075, 0.022, 0.070, 0.065, -0.032, O),
      ell(0.028, 0.012, 0.022, 0.082, 0.012, 0.032, W), ell(0.028, 0.012, 0.022, 0.082, 0.012, -0.032, W),
      // しま
      ell(0.004, 0.050, 0.070, -0.050, 0.090, 0, D), ell(0.004, 0.050, 0.072, -0.020, 0.095, 0, D), ell(0.004, 0.045, 0.068, 0.010, 0.100, 0, D),
      ell(0.040, 0.004, 0.012, 0.075, 0.292, 0, D),
    );
  } else {
    parts.push(
      ell(0.135, 0.068, 0.066, 0, 0.165, 0, O),
      ell(0.075, 0.040, 0.050, 0.095, 0.150, 0, W),
      ell(0.060, 0.052, 0.056, 0.185, 0.205, 0, 0xdc9444),
      ell(0.025, 0.019, 0.028, 0.235, 0.192, 0, W),
      ell(0.007, 0.006, 0.008, 0.258, 0.198, 0, 0xd98a8a),
      ell(0.004, 0.040, 0.066, -0.05, 0.172, 0, D), ell(0.004, 0.040, 0.066, 0.0, 0.176, 0, D), ell(0.004, 0.038, 0.062, 0.05, 0.178, 0, D),
    );
  }
  return parts;
}
function earsAndEyes(x, y, scale = 1) {
  const m = new THREE.Group();
  const earM = stdMat({ color: 0xd98a3d, roughness: 0.8 });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xb8d54a });
  const pupM = new THREE.MeshBasicMaterial({ color: 0x101010 });
  const eyes = [];
  for (const sz of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.052, 4), earM);
    ear.position.set(x - 0.015, y + 0.052, 0.036 * sz); ear.rotation.z = -0.15; ear.rotation.x = 0.25 * sz;
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), eyeM); e.scale.set(0.011, 0.012, 0.007);
    e.position.set(x + 0.052, y + 0.014, 0.030 * sz);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), pupM); pu.scale.set(0.0035, 0.011, 0.004);
    pu.position.set(x + 0.0585, y + 0.014, 0.0315 * sz);
    m.add(ear, e, pu); eyes.push(e, pu);
  }
  m.scale.setScalar(scale);
  return { m, eyes };
}
function buildCat() {
  const mat = stdMat({ vertexColors: true, roughness: 0.85, emissive: new THREE.Color(0.03, 0.02, 0.01) });
  // 座り姿
  const sit = new THREE.Group();
  sit.add(new THREE.Mesh(mergeGeos(catParts('sit')), mat));
  const head = new THREE.Group(); head.position.set(0.075, 0.245, 0);
  const se = earsAndEyes(0.075, 0.245); se.m.position.set(-0.075, -0.245, 0); head.add(se.m);
  sit.add(head);
  // しっぽ（ゆれる）
  const tailPts = [[0, 0, 0], [-0.05, 0.004, 0.025], [-0.10, 0.006, 0.07], [-0.12, 0.01, 0.12], [-0.10, 0.03, 0.16]];
  const tailG = (pts, r0, r1) => mergeGeos(pts.map((p, i) => { const t = i / (pts.length - 1); return ell(lerp(r0, r1, t), lerp(r0, r1, t), lerp(r0, r1, t), p[0], p[1], p[2], i === pts.length - 1 ? D_TIP : 0xd98a3d); }));
  const D_TIP = 0x7a4a1a;
  const tail = new THREE.Mesh(tailG(tailPts, 0.02, 0.014), mat); tail.position.set(-0.09, 0.02, 0);
  sit.add(tail);
  sit.visible = false;
  // 歩き姿
  const walk = new THREE.Group();
  walk.add(new THREE.Mesh(mergeGeos(catParts('walk')), mat));
  const we = earsAndEyes(0.185, 0.205); walk.add(we.m);
  const legs = [];
  for (const [lx, lz] of [[0.09, 0.034], [0.09, -0.034], [-0.09, 0.034], [-0.09, -0.034]]) {
    const lg = new THREE.Group(); lg.position.set(lx, 0.13, lz);
    const leg = new THREE.Mesh(mergeGeos([ell(0.018, 0.07, 0.018, 0, -0.065, 0, 0xd98a3d), ell(0.024, 0.011, 0.02, 0.01, -0.128, 0, 0xf2ece0)]), mat);
    lg.add(leg); walk.add(lg); legs.push(lg);
  }
  const wtail = new THREE.Mesh(tailG([[0, 0, 0], [-0.06, 0.03, 0], [-0.11, 0.08, 0], [-0.13, 0.14, 0], [-0.12, 0.2, 0.01]], 0.02, 0.014), mat);
  wtail.position.set(-0.13, 0.17, 0); walk.add(wtail);
  walk.visible = false;
  const group = new THREE.Group();
  group.add(sit, walk);
  group.scale.setScalar(1.15);
  group.visible = false;
  return { group, sit, walk, head, tail, legs, wtail, eyesSit: se.eyes };
}

export class Critters {
  constructor(scene, water, hooks = {}) {
    this.scene = scene;
    this.water = water;
    this.hooks = hooks;
    this.eye = new THREE.Vector3(PIER.x, PIER.y + 1.58, PIER.zEnd + 1.15);

    // ---- カワセミと杭
    this.kf = buildKingfisher();
    scene.add(this.kf.group);
    this.stakes = this._findStakes().map((p) => { const s = buildStake(p.dep); s.position.set(p.x, 0, p.z); scene.add(s); return { x: p.x, z: p.z, top: 0.52, mesh: s }; });
    this.kfs = { state: 'idle', t: 0, pos: new THREE.Vector3(), from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(), heading: 0, stake: null, fishOn: false, chirped: false };
    this.kfWait = rnd(25, 55);

    // ---- カエル
    this.fr = buildFrog();
    scene.add(this.fr.group);
    this.frs = { state: 'idle', t: 0, pad: null, pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), heading: 0, croaks: 0, blink: 3 };
    this.frWait = rnd(15, 40);
    this.pads = null;
    this.ownPads = SEASON.frog > 0 ? this._makePads() : [];   // 桟橋の近くにも、カエルののる葉を少し浮かべておく（冬はカエルがいない）

    // ---- 猫（桟橋の先の杭にとびのる）
    this.cat = buildCat();
    scene.add(this.cat.group);
    this.deckY = PIER.y + 0.03;
    this.post = new THREE.Vector3(PIER.x + PIER.w / 2 + 0.04, PIER.y + 0.85, PIER.zEnd + 0.1);
    this.cts = { state: 'idle', t: 0, pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), heading: -Math.PI / 2, phase: 0, meowed: 0, offer: false, blink: 3 };
    this.catWait = rnd(55, 110);
    this.catSeen = false;

    this.gap = 0;         // 出来事のあいだの最低のすきま
    this.busy = null;
  }

  // 杭の場所: 桟橋の少し前の水面（左右ななめ前）
  _findStakes() {
    const out = [];
    for (let k = 0; k < 4000 && out.length < 2; k++) {
      const side = out.length === 0 ? -1 : 1;
      const b = side * rnd(0.14, 0.42), d = rnd(4.8, 6.8);
      const x = this.eye.x + Math.sin(b) * d, z = this.eye.z - Math.cos(b) * d;
      if (pondSigned(x, z) > -1.6) continue;
      const dep = waterDepthAt(x, z);
      if (dep < 0.45 || dep > 3.4) continue;
      out.push({ x, z, dep });
    }
    return out;
  }

  _makePads() {
    const geo = new THREE.CircleGeometry(1, 28); geo.rotateX(-Math.PI / 2);
    const mat = stdMat({ color: 0x5f8a34, roughness: 0.55, side: THREE.DoubleSide }, { translucent: 1.5 });
    const out = [];
    for (let k = 0; k < 4000 && out.length < 3; k++) {
      const side = out.length % 2 ? 1 : -1;
      const b = side * rnd(0.42, 0.75), d = rnd(4.8, 7);
      const x = this.eye.x + Math.sin(b) * d, z = this.eye.z - Math.cos(b) * d;
      if (pondSigned(x, z) > -1.6 || waterDepthAt(x, z) < 0.45) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.5)) continue;
      const r = rnd(0.32, 0.44);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0.012, z); m.scale.setScalar(r); m.rotation.y = rnd(0, TAU); m.receiveShadow = true;
      this.scene.add(m);
      out.push({ x, z, y: 0.02, r, own: true });
    }
    return out;
  }

  // スイレンの葉の位置（instancedMesh から）
  _lilyPads() {
    if (this.pads) return this.pads;
    this.pads = [...this.ownPads];
    const m = this.scene.getObjectByName('lilies');
    if (m && m.isInstancedMesh) {
      const mat = new THREE.Matrix4();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mat);
        const e = mat.elements;
        const sc = Math.hypot(e[0], e[2]);
        this.pads.push({ x: e[12], z: e[14], y: e[13], r: sc });
      }
    }
    return this.pads;
  }

  // 近くで大きな音（投げ込み）がしたら、びっくりして去る
  disturb(x, z, power = 1) {
    const k = this.kfs, f = this.frs;
    if (k.state === 'perch' && Math.hypot(x - k.pos.x, z - k.pos.z) < 4.5 + power * 2.5) this._kfLeave(false);
    if (f.state === 'sit' && Math.hypot(x - f.pos.x, z - f.pos.z) < 3.5 + power * 2) this._frLeave();
  }

  // 試験用: すぐ起こす
  trigger(kind) {
    if (kind === 'kingfisher') { this.kfs.state = 'idle'; this._kfStart(); }
    else if (kind === 'frog') { this.frs.state = 'idle'; this._frStart({ yaw: 0 }); }
    else if (kind === 'cat') { this.cts.state = 'idle'; this._catStart(); }
  }

  update(dt, time, ctx) {
    this.gap = Math.max(0, this.gap - dt);
    const calm = ctx.state === 'idle' || ctx.state === 'float';
    const day = ctx.night < 0.35 && ctx.rain < 0.45 && ctx.sunElev > 8;
    // カワセミ: 昼の晴れた時間
    if (this.kfs.state === 'idle') {
      if (day && calm) this.kfWait -= dt;
      if (this.kfWait <= 0 && this.gap <= 0 && !this.busy && day && calm) this._kfStart();
    }
    // カエル: 雨の日はよく出る。夜もいる
    if (this.frs.state === 'idle') {
      if (calm && ctx.night < 0.9) this.frWait -= dt * (ctx.rain > 0.3 ? 2 : 1) * SEASON.frog;
      if (this.frWait <= 0 && this.gap <= 0 && !this.busy && calm && ctx.night < 0.9 && SEASON.frog > 0) this._frStart(ctx);
    }
    // 猫: 夕方と明け方、静かなとき
    const dusk = ctx.sunElev > -6 && ctx.sunElev < 14;   // 日の出・日の入りのまえあと
    if (this.cts.state === 'idle' && dusk && calm && ctx.rain < 0.7) {
      this.catWait -= dt;
      if (this.catWait <= 0 && this.gap <= 0 && !this.busy) this._catStart();
    }
    this.kept = ctx.kept || 0;
    this._kfUpdate(dt, time);
    this._frUpdate(dt, time);
    this._catUpdate(dt, time, calm);
  }

  // ------------------------------------------------------------ カワセミの動き
  _kfStart() {
    const k = this.kfs;
    if (!this.stakes.length) { this.kfWait = 60; return; }
    k.stake = this.stakes[Math.floor(Math.random() * this.stakes.length)];
    const s = k.stake;
    k.to.set(s.x, s.top + 0.045, s.z);
    // 沼の外側（遠く）から飛んでくる
    const ang = Math.atan2(s.x - this.eye.x, -(s.z - this.eye.z)) + rnd(-0.9, 0.9);
    const d = rnd(16, 24);
    k.from.set(this.eye.x + Math.sin(ang) * d, rnd(1.4, 2.4), this.eye.z - Math.cos(ang) * d);
    k.ctrl.set((k.from.x + k.to.x) / 2, Math.max(k.from.y, 1.6) + 0.6, (k.from.z + k.to.z) / 2);
    k.state = 'arrive'; k.t = 0; k.dur = rnd(2.3, 3.0); k.chirped = false; k.fishOn = false;
    k.heading = 0; k.pos.copy(k.from);
    this.busy = 'kingfisher';
    this.kf.group.visible = true;
    this._kfPose(true);
  }
  _kfPose(fly) {
    this.kf.wings.forEach((w) => { w.visible = fly; });
    this.kf.legs.forEach((l) => { l.visible = !fly; });
  }
  _kfLeave(withFish) {
    const k = this.kfs;
    k.state = 'leave'; k.t = 0; k.fishOn = !!withFish;
    this.kf.fish.visible = !!withFish;
    this._kfPose(true);
    // 飛び去る向き: 沼のおくへ
    k.leaveDir = Math.atan2(k.pos.z - this.eye.z, k.pos.x - this.eye.x) + rnd(-0.5, 0.5);
    this.hooks.onChirp && this.hooks.onChirp(k.pos.x, k.pos.z);
  }
  _kfUpdate(dt, time) {
    const k = this.kfs, K = this.kf;
    if (k.state === 'idle') return;
    k.t += dt;
    const g = K.group;
    switch (k.state) {
      case 'arrive': {
        const u = clamp(k.t / k.dur), e = easeOut(u);
        // 2次ベジェで、ふわっとおりる
        const a = 1 - e;
        const px = a * a * k.from.x + 2 * a * e * k.ctrl.x + e * e * k.to.x;
        const py = a * a * k.from.y + 2 * a * e * k.ctrl.y + e * e * k.to.y;
        const pz = a * a * k.from.z + 2 * a * e * k.ctrl.z + e * e * k.to.z;
        const hd = Math.atan2(pz - k.pos.z, px - k.pos.x);
        if (Math.hypot(pz - k.pos.z, px - k.pos.x) > 1e-4) k.heading = hd;
        k.pos.set(px, py, pz);
        const flap = Math.sin(time * 42);
        K.wings[0].rotation.x = flap * 0.9; K.wings[1].rotation.x = -flap * 0.9;
        K.rig.rotation.z = lerp(0.15, 0.0, u);
        if (u >= 1) {
          k.state = 'perch'; k.t = 0; k.dur = rnd(7, 13); this._kfPose(false); k.chirped = false;
          // 横向きにとまる（青い背中が見えるように）
          const toCam = Math.atan2(this.eye.z - k.to.z, this.eye.x - k.to.x);
          k.heading = toCam + (k.stake.x < this.eye.x ? -1 : 1) * (Math.PI / 2) * 0.9;
          this.water.addRipple(k.to.x, k.to.z, 0.0);
        }
        break;
      }
      case 'perch': {
        K.rig.position.y = Math.sin(time * 1.1) * 0.002;
        K.rig.rotation.z = 0.05 + Math.max(0, Math.sin(time * 0.7)) * 0.04;       // 前かがみで水面をにらむ
        K.head.rotation.y = Math.sin(time * 0.9 + k.stake.x) * 0.5 * (0.5 + 0.5 * Math.sin(time * 0.31));
        K.head.rotation.z = Math.sin(time * 1.6) * 0.06;
        if (!k.chirped && k.t > 1.2) { k.chirped = true; this.hooks.onChirp && this.hooks.onChirp(k.to.x, k.to.z); }
        if (k.t > k.dur) this._kfDive();
        break;
      }
      case 'dive': {
        const u = clamp(k.t / k.dur2);
        const p = this._lerp3(k.to, k.dive, u);
        p.y = lerp(k.to.y, 0.02, Math.pow(u, 1.7));
        k.pos.copy(p);
        K.rig.rotation.z = -1.15 * easeInOut(u * 1.2);
        if (u >= 1) {
          this.hooks.onSplash && this.hooks.onSplash(k.dive.x, k.dive.z, 0.35);
          this.water.addRipple(k.dive.x, k.dive.z, 0.55);
          g.visible = false; k.state = 'under'; k.t = 0; k.dur3 = rnd(0.6, 1.0);
          k.gotFish = Math.random() < 0.62;
        }
        break;
      }
      case 'under': {
        if (k.t > k.dur3) {
          this.water.addRipple(k.dive.x, k.dive.z, 0.4);
          this.hooks.onSplash && this.hooks.onSplash(k.dive.x, k.dive.z, 0.2);
          g.visible = true; k.pos.set(k.dive.x, 0.05, k.dive.z);
          k.heading = k.diveHeading;
          this._kfLeave(k.gotFish);
        }
        break;
      }
      case 'leave': {
        const sp = 6.5, climb = Math.min(2.6, k.t * 2.4);
        const flap = Math.sin(time * 42);
        K.wings[0].rotation.x = flap * 0.9; K.wings[1].rotation.x = -flap * 0.9;
        k.heading = k.leaveDir;
        k.pos.x += Math.cos(k.leaveDir) * sp * dt;
        k.pos.z += Math.sin(k.leaveDir) * sp * dt;
        k.pos.y = Math.max(k.pos.y, 0.05) + (climb - (k.pos.y)) * Math.min(1, dt * 3);
        K.rig.rotation.z = -0.15;
        if (k.t > 4.5) this._kfEnd();
        break;
      }
    }
    g.position.copy(k.pos);
    g.rotation.set(0, -k.heading, 0);
  }
  _kfDive() {
    const k = this.kfs;
    k.state = 'dive'; k.t = 0; k.dur2 = 0.42;
    // 杭から少しはなれた水面へ
    const a = rnd(0, TAU), r = rnd(0.7, 1.2);
    k.dive = new THREE.Vector3(k.to.x + Math.cos(a) * r, 0, k.to.z + Math.sin(a) * r);
    k.diveHeading = Math.atan2(k.dive.z - k.to.z, k.dive.x - k.to.x);
    k.heading = k.diveHeading;
    this._kfPose(true);
    this.kf.wings.forEach((w) => { w.rotation.x = 0.7 * (w.scale.z > 0 ? 1 : -1); });
  }
  _kfEnd() {
    const k = this.kfs;
    k.state = 'idle'; this.kf.group.visible = false; this.kf.fish.visible = false;
    this.kfWait = rnd(110, 230); this.gap = 22; if (this.busy === 'kingfisher') this.busy = null;
  }

  // ------------------------------------------------------------ カエルの動き
  _frStart(ctx) {
    const f = this.frs;
    const pads = this._lilyPads().filter((p) => p.r > 0.26);
    // いまの視線のさきの、手前〜中距離の葉をえらぶ
    let best = null, bs = 1e9;
    for (const p of pads) {
      const dx = p.x - this.eye.x, dz = p.z - this.eye.z;
      const d = Math.hypot(dx, dz);
      if (d < 4 || d > 15) continue;
      const bearing = Math.atan2(dx, -dz);
      const diff = Math.abs(bearing + (ctx.yaw || 0));
      const score = diff + Math.abs(d - 7) * 0.04 + (p.own ? 0 : 0.3) + Math.random() * 0.25;
      if (score < bs) { bs = score; best = p; }
    }
    if (!best) { this.frWait = 60; return; }
    f.pad = best;
    const ang = rnd(0, TAU);
    f.from.set(best.x + Math.cos(ang) * (best.r + 0.5), 0.0, best.z + Math.sin(ang) * (best.r + 0.5));
    f.to.set(best.x + Math.cos(ang) * best.r * 0.2, best.y + 0.045, best.z + Math.sin(ang) * best.r * 0.2);
    f.state = 'jumpIn'; f.t = 0; f.dur = 0.62; f.croaks = 0; f.blink = rnd(2, 5);
    f.heading = Math.atan2(f.to.z - f.from.z, f.to.x - f.from.x);
    f.pos.copy(f.from);
    this.busy = 'frog';
    this.fr.group.visible = true;
    this.water.addRipple(f.from.x, f.from.z, 0.25);
  }
  _frLeave() {
    const f = this.frs;
    const ang = Math.atan2(f.pos.z - this.eye.z, f.pos.x - this.eye.x) + rnd(-0.6, 0.6);
    f.from.copy(f.pos);
    f.to.set(f.pos.x + Math.cos(ang) * 1.0, 0, f.pos.z + Math.sin(ang) * 1.0);
    f.heading = ang;
    f.state = 'jumpOut'; f.t = 0; f.dur = 0.55;
  }
  _frUpdate(dt, time) {
    const f = this.frs, F = this.fr;
    if (f.state === 'idle') return;
    f.t += dt;
    const g = F.group;
    switch (f.state) {
      case 'jumpIn':
      case 'jumpOut': {
        const u = clamp(f.t / f.dur);
        f.pos.x = lerp(f.from.x, f.to.x, u); f.pos.z = lerp(f.from.z, f.to.z, u);
        f.pos.y = lerp(f.from.y, f.to.y, u) + Math.sin(Math.PI * u) * 0.28;
        F.rig.rotation.z = -0.5 * Math.sin(Math.PI * u) + (u < 0.15 ? 0.2 : 0);
        F.eyes.forEach((e) => { e.scale.y = 1; });
        if (u >= 1) {
          if (f.state === 'jumpIn') {
            f.state = 'sit'; f.t = 0; f.dur = rnd(13, 26);
            this.hooks.onPlip && this.hooks.onPlip(f.pos.x, f.pos.z);
            this.water.addRipple(f.pad.x, f.pad.z, 0.18);
          } else {
            this.hooks.onSplash && this.hooks.onSplash(f.to.x, f.to.z, 0.2);
            this.water.addRipple(f.to.x, f.to.z, 0.45);
            g.visible = false; f.state = 'idle';
            this.frWait = rnd(50, 130); this.gap = 18; if (this.busy === 'frog') this.busy = null;
          }
        }
        break;
      }
      case 'sit': {
        // のどをふくらませて息をする。ときどき、まばたき・ゲコッ
        const br = 1 + 0.05 * Math.sin(time * 4.2);
        F.rig.scale.set(1, br, 1);
        F.rig.rotation.z = 0.0;
        f.blink -= dt;
        const bl = f.blink < 0.12 && f.blink > 0 ? 0.15 : 1;
        F.eyes.forEach((e) => { e.scale.y = bl; });
        if (f.blink <= 0) f.blink = rnd(2.5, 6);
        if (f.croaks < 2 && f.t > 4 + f.croaks * 6) { f.croaks++; this.hooks.onCroak && this.hooks.onCroak(f.pos.x, f.pos.z); }
        // 葉のゆれにあわせて少し上下
        f.pos.y = f.to.y + Math.sin(time * 1.3 + f.pad.x) * 0.004;
        if (f.t > f.dur) this._frLeave();
        break;
      }
    }
    F.rig.scale.y = f.state === 'sit' ? F.rig.scale.y : 1;
    g.position.copy(f.pos);
    g.rotation.set(0, -f.heading, 0);
  }

  // ------------------------------------------------------------ 猫の動き
  _catStart() {
    const c = this.cts;
    c.pos.set(PIER.x + 0.6, this.deckY, PIER.zStart - 0.3);
    c.state = 'walk'; c.t = 0; c.heading = -Math.PI / 2; c.meowed = 0; c.offer = false; c.fed = false;
    this.busy = 'cat';
    this.cat.group.visible = true; this.cat.walk.visible = true; this.cat.sit.visible = false;
  }
  _catOffer(on) {
    const c = this.cts;
    if (c.offer === on) return;
    c.offer = on;
    this.hooks.onCatOffer && this.hooks.onCatOffer(on);
  }
  // 魚をあげる（成功したら true）
  feed() {
    const c = this.cts;
    if (c.state !== 'sit' || c.fed) return false;
    c.fed = true; c.state = 'eat'; c.t = 0;
    this._catOffer(false);
    return true;
  }
  _catUpdate(dt, time, calm) {
    const c = this.cts, C = this.cat;
    if (c.state === 'idle') return;
    c.t += dt;
    const g = C.group;
    switch (c.state) {
      case 'walk': {
        // 桟橋の右はしを、岸のほうから歩いてくる
        const sp = 0.9;
        c.pos.z -= sp * dt;
        c.phase += dt * 9;
        C.legs.forEach((lg, i) => { lg.rotation.z = Math.sin(c.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7; });
        C.wtail.rotation.z = 0.2 + Math.sin(time * 2.2) * 0.12;
        c.pos.y = this.deckY + Math.abs(Math.sin(c.phase)) * 0.008;
        if (c.pos.z <= this.post.z + 0.8) {
          c.state = 'leap'; c.t = 0; c.dur = 0.55; c.from.copy(c.pos); c.to.copy(this.post);
          c.toHeading = Math.atan2(this.eye.z - this.post.z, this.eye.x - this.post.x);
        }
        break;
      }
      case 'leap': {
        const u = clamp(c.t / c.dur);
        c.pos.x = lerp(c.from.x, c.to.x, u); c.pos.z = lerp(c.from.z, c.to.z, u);
        c.pos.y = lerp(c.from.y, c.to.y, easeInOut(u)) + Math.sin(Math.PI * u) * 0.3;
        c.heading = lerp(-Math.PI / 2, c.toHeading, easeInOut(u));
        C.legs.forEach((lg) => { lg.rotation.z = -0.9 * Math.sin(Math.PI * u); });
        if (u >= 1) {
          c.state = 'sit'; c.t = 0; c.dur = rnd(48, 75); c.blink = rnd(2, 5);
          C.walk.visible = false; C.sit.visible = true;
          c.pos.copy(this.post);
          this.hooks.onCatArrive && this.hooks.onCatArrive(!this.catSeen);
          this.catSeen = true;
        }
        break;
      }
      case 'sit': {
        C.tail.rotation.y = Math.sin(time * 1.3) * 0.45;
        C.head.rotation.y = Math.sin(time * 0.35) * 0.35 * (0.4 + 0.6 * Math.sin(time * 0.17) ** 2);
        C.head.rotation.z = Math.sin(time * 0.5) * 0.04;
        c.blink -= dt;
        const bl = c.blink < 0.12 && c.blink > 0 ? 0.12 : 1;
        C.sit.scale.y = 1 + Math.sin(time * 1.9) * 0.008;          // 息
        if (c.blink <= 0) c.blink = rnd(2.5, 6);
        C.eyesSit.forEach((e, i) => { if (i % 2 === 0) e.visible = bl > 0.5; });   // 目（まばたきでかくす）
        if (c.meowed === 0 && c.t > 1.2) { c.meowed = 1; this.hooks.onMeow && this.hooks.onMeow(this.post.x, this.post.z); }
        if (c.meowed === 1 && c.t > 17 + (c.dur - 17) * 0.4 && c.dur > 30) { c.meowed = 2; this.hooks.onMeow && this.hooks.onMeow(this.post.x, this.post.z); }
        // びくに魚があれば「ほしそう」
        this._catOffer(this.kept > 0 && calm && c.t > 2.5);
        if (c.t > c.dur) this._catLeave();
        break;
      }
      case 'eat': {
        // 魚をもらって、うれしそう
        const u = clamp(c.t / 1.0);
        C.head.rotation.z = -0.55 * easeInOut(u) * (c.t < 4 ? 1 : 0.3);
        C.tail.rotation.y = Math.sin(time * 3.2) * 0.6;
        C.sit.scale.y = 1 + Math.sin(time * 22) * 0.012;           // ごろごろ
        if (c.t > 0.8 && !c.purred) { c.purred = true; this.hooks.onFed && this.hooks.onFed(this.post.x, this.post.z); }
        if (c.t > 5.5) { c.purred = false; this._catLeave(); }
        break;
      }
      case 'leave': {
        const u = clamp(c.t / c.dur);
        if (c.stage === 0) {
          c.pos.x = lerp(c.from.x, c.to.x, u); c.pos.z = lerp(c.from.z, c.to.z, u);
          c.pos.y = lerp(c.from.y, c.to.y, easeInOut(u)) + Math.sin(Math.PI * u) * 0.25;
          c.heading = lerp(c.heading, Math.PI / 2, 0.08);
          if (u >= 1) { c.stage = 1; c.t = 0; c.heading = Math.PI / 2; }
        } else {
          const sp = 1.2;
          c.pos.z += sp * dt; c.phase += dt * 11;
          C.legs.forEach((lg, i) => { lg.rotation.z = Math.sin(c.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7; });
          C.wtail.rotation.z = 0.2 + Math.sin(time * 2.2) * 0.12;
          c.pos.y = this.deckY + Math.abs(Math.sin(c.phase)) * 0.008;
          if (c.pos.z > PIER.zStart - 0.2) { g.visible = false; c.state = 'idle'; this.catWait = rnd(300, 520); this.gap = 25; if (this.busy === 'cat') this.busy = null; }
        }
        break;
      }
    }
    g.position.copy(c.pos);
    g.rotation.set(0, -c.heading, 0);
  }
  _catLeave() {
    const c = this.cts, C = this.cat;
    this._catOffer(false);
    C.sit.visible = false; C.walk.visible = true; C.sit.scale.y = 1; C.head.rotation.set(0, 0, 0);
    c.state = 'leave'; c.stage = 0; c.t = 0; c.dur = 0.5;
    c.from.copy(c.pos); c.to.set(PIER.x + 0.62, this.deckY, this.post.z + 0.7);
  }

  _lerp3(a, b, u) { return new THREE.Vector3(lerp(a.x, b.x, u), lerp(a.y, b.y, u), lerp(a.z, b.z, u)); }
}
