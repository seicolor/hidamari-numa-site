// 岸辺のダイサギ：浅瀬にじっと立ち、投げ込みの音に驚くと飛び立って別の浅瀬へ。
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, TAU, hexToLinear } from './util.js';
import { terrainHeight, pondSigned, SHORE_Z } from './terrain.js';
import { patchMaterial } from './materials.js';
import { mergeGeos, colorFlat } from './geo.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const lin = (h) => hexToLinear(h);

function tube(points, r0, r1, seg = 20, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = curve.getPoint(t);
    const r = lerp(r0, r1, t);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + (N.x * c + B.x * s) * r, p.y + (N.y * c + B.y * s) * r, p.z + (N.z * c + B.z * s) * r);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ell(rx, ry, rz, x, y, z, rot = [0, 0, 0]) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.scale(rx, ry, rz);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(x, y, z);
  return g;
}

function wingGeometry(length, chord, tipSweep) {
  // 付け根(原点)から先端へ。羽毛を段にした大きな翼（+z 方向が翼端）
  const pos = [], idx = [], col = [];
  const N = 8, M = 6;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    for (let j = 0; j <= M; j++) {
      const v = j / M;
      const chordHere = chord * (1 - 0.6 * u) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, v * 1.0 + 0.05)));
      const x = -v * chord * (1 - 0.55 * u) + tipSweep * u * u;
      const z = u * length;
      const y = 0.03 * Math.sin(v * Math.PI) - 0.05 * u * u;
      pos.push(x, y, z);
      const c = 0.92 - 0.1 * v + (j === M ? -0.08 : 0);
      col.push(c, c, c * 0.98);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Heron {
  constructor(scene, water, hooks = {}) {
    this.scene = scene;
    this.water = water;
    this.hooks = hooks;
    this.group = new THREE.Group();
    this.group.name = 'heron';
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.75, vertexColors: true, side: THREE.DoubleSide });
    patchMaterial(white, { translucent: 1.6, underwater: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.8 });
    patchMaterial(dark, { underwater: true });
    const beakM = new THREE.MeshStandardMaterial({ color: 0xe8b43a, roughness: 0.5 });
    patchMaterial(beakM, {});
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x151515 });

    // 立ち姿の体（頭は上、前は +x）
    const bodyParts = [];
    const body = ell(0.2, 0.12, 0.1, 0, 0.62, 0, [0, 0, 0.25]);
    const tail = ell(0.14, 0.03, 0.06, -0.22, 0.58, 0, [0, 0, -0.1]);
    const breast = ell(0.1, 0.1, 0.08, 0.12, 0.66, 0, [0, 0, 0.3]);
    const folded = ell(0.2, 0.07, 0.115, -0.04, 0.66, 0, [0, 0, 0.12]);
    for (const g of [body, tail, breast, folded]) colorFlat(g, [1, 1, 1]);
    const neckPts = [[0.14, 0.7, 0], [0.22, 0.82, 0], [0.16, 0.98, 0], [0.22, 1.12, 0], [0.2, 1.22, 0]];
    const neck = tube(neckPts, 0.036, 0.02, 18, 6);
    colorFlat(neck, [1, 1, 1]);
    const head = ell(0.045, 0.028, 0.026, 0.235, 1.26, 0);
    colorFlat(head, [1, 1, 1]);
    this.bodyMesh = new THREE.Mesh(mergeGeos([body, tail, breast, folded, neck, head]), white);
    this.bodyMesh.castShadow = true;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.17, 6), beakM);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.35, 1.255, 0);
    const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), eyeM);
    eye1.position.set(0.255, 1.272, 0.02);
    const eye2 = eye1.clone();
    eye2.position.z = -0.02;
    this.head = new THREE.Group();
    this.head.add(beak, eye1, eye2);
    // 脚
    const legG = (sg) => {
      const pts = [[-0.02, 0.55, 0.04 * sg], [0.0, 0.3, 0.045 * sg], [-0.01, 0.1, 0.045 * sg], [-0.01, 0.01, 0.045 * sg]];
      const l = tube(pts, 0.012, 0.007, 8, 5);
      const toes = [];
      for (let k = -1; k <= 1; k++) {
        const t = tube([[-0.01, 0.01, 0.045 * sg], [0.04, 0.005, 0.045 * sg + k * 0.03]], 0.005, 0.003, 3, 4);
        toes.push(t);
      }
      return mergeGeos([l, ...toes]);
    };
    this.legL = new THREE.Mesh(legG(1), dark);
    this.legR = new THREE.Mesh(legG(-1), dark);
    // 飛ぶときの翼
    const wg = wingGeometry(0.62, 0.34, -0.1);
    this.wingL = new THREE.Mesh(wg, white);
    this.wingR = new THREE.Mesh(wg.clone().scale(1, 1, -1), white);
    this.wingL.position.set(0.0, 0.7, 0.07);
    this.wingR.position.set(0.0, 0.7, -0.07);
    this.wingL.visible = this.wingR.visible = false;
    this.neckFly = null;
    this.rig = new THREE.Group();
    this.rig.add(this.bodyMesh, this.head, this.legL, this.legR, this.wingL, this.wingR);
    this.group.add(this.rig);
    this.group.scale.setScalar(1.12);
    scene.add(this.group);

    this.spots = this._findSpots();
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.state = 'stand';
    this.t = rnd(4, 9);
    this.vel = new THREE.Vector3();
    this.target = null;
    this.flap = 0;
    this.neckT = 0;
    this.stepT = rnd(6, 14);
    this.settle(this.spots[0]);
  }

  _findSpots() {
    // 桟橋から見て左右の浅瀬（視界に入りやすい場所）
    const spots = [];
    const cx = 0, cz = SHORE_Z - 4.25;
    for (let k = 0; k < 3000 && spots.length < 10; k++) {
      const bearing = rnd(-1.15, 1.15);
      const d = rnd(13, 30);
      const x = cx + Math.sin(bearing) * d, z = cz - Math.cos(bearing) * d;
      const s = pondSigned(x, z);
      if (s > -0.7 || s < -2.6) continue;
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
      spots.push(new THREE.Vector3(x, 0, z));
    }
    if (!spots.length) spots.push(new THREE.Vector3(-14, 0, -8));
    return spots;
  }

  settle(spot) {
    this.pos.set(spot.x, 0, spot.z);
    this.spot = spot;
    this.heading = Math.atan2(-(spot.z + 8), -spot.x * 0.2) + rnd(-0.6, 0.6);
    this.state = 'stand';
    this.t = rnd(8, 20);
    this.group.position.set(spot.x, Math.min(0, terrainHeight(spot.x, spot.z)), spot.z);
    this.group.rotation.set(0, -this.heading, 0);
    this.setFly(false);
  }

  setFly(on) {
    this.wingL.visible = this.wingR.visible = on;
    this.legL.visible = this.legR.visible = true;
  }

  // 近くで大きな音（投げ込み・しぶき）がしたら驚く
  disturb(x, z, power = 1) {
    if (this.state !== 'stand') return;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d < 20 + power * 8 && Math.random() < 0.4 + power * 0.4) {
      this.state = 'alert';
      this.t = rnd(0.8, 1.6);
      this.alertFrom = new THREE.Vector2(x, z);
    }
  }

  update(dt, time, ctx) {
    this.t -= dt;
    const g = this.group;
    const night = ctx.night;
    g.visible = night < 0.85 || this.state === 'fly';
    // 暗いときは出てこない
    switch (this.state) {
      case 'stand': {
        // 首をかしげる・ゆっくり歩く
        this.neckT += dt;
        const sway = Math.sin(time * 0.6 + this.pos.x) * 0.02;
        this.rig.position.y = 0;
        this.rig.rotation.z = sway * 0.5;
        this.head.position.y = Math.sin(time * 0.25) * 0.004;
        this.stepT -= dt;
        if (this.stepT <= 0) { this.stepT = rnd(8, 18); this.stepping = rnd(1.5, 3); }
        if (this.stepping > 0) {
          this.stepping -= dt;
          const nx = this.pos.x + Math.cos(this.heading) * 0.12 * dt;
          const nz = this.pos.z + Math.sin(this.heading) * 0.12 * dt;
          if (pondSigned(nx, nz) < -0.3) { this.pos.x = nx; this.pos.z = nz; }
          this.legL.rotation.z = Math.sin(time * 3) * 0.2; this.legR.rotation.z = -Math.sin(time * 3) * 0.2;
        } else { this.legL.rotation.z = 0; this.legR.rotation.z = 0; }
        // 水面を見つめる: 時々ぴくっと首を伸ばす
        this.rig.rotation.z += Math.max(0, Math.sin(time * 0.37 + this.pos.z)) > 0.97 ? 0.12 : 0;
        g.position.copy(this.pos);
        g.position.y = Math.min(0, terrainHeight(this.pos.x, this.pos.z));
        if (this.t <= 0) {
          // 気まぐれで場所を変える
          if (Math.random() < 0.35) this.takeoff(null);
          else this.t = rnd(10, 24);
        }
        break;
      }
      case 'alert': {
        this.rig.rotation.z = damp(this.rig.rotation.z, -0.12, 6, dt);
        this.head.position.y = 0.04;
        if (this.t <= 0) this.takeoff(this.alertFrom);
        break;
      }
      case 'fly': {
        this.flap += dt * 5.2;
        const k = Math.sin(this.flap);
        this.wingL.rotation.x = k * 0.7 + 0.1;
        this.wingR.rotation.x = -k * 0.7 - 0.1;
        // 目的地へ向けてゆるやかに旋回
        const to = this.target.clone().sub(this.pos);
        const dist = Math.hypot(to.x, to.z);
        const want = Math.atan2(to.z, to.x);
        let diff = want - this.heading;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        this.heading += clamp(diff, -1.0 * dt, 1.0 * dt);
        const speed = 4.5;
        this.pos.x += Math.cos(this.heading) * speed * dt;
        this.pos.z += Math.sin(this.heading) * speed * dt;
        // 高度: 離陸でぐっと上がり、着水前になだらかに降りる
        const climb = smoothstep(0, 3, this.flyT) * 4.5;
        const approachH = 4.6 * Math.pow(clamp(dist / 14), 1.2);
        this.pos.y = Math.min(climb, approachH);
        this.flyT += dt;
        g.position.copy(this.pos);
        g.rotation.set(0, -this.heading, k * 0.05, 'YXZ');
        this.rig.rotation.z = lerp(0.12, -0.05, smoothstep(0, 1.2, this.flyT));
        this.legL.rotation.z = this.legR.rotation.z = -0.9;
        if (dist < 1.4 && this.pos.y < 0.8) this.land();
        if (this.flyT > 60) this.land();
        break;
      }
    }
  }

  takeoff(from) {
    this.state = 'fly';
    this.flyT = 0;
    this.flap = 0;
    this.setFly(true);
    this.hooks.onFlap && this.hooks.onFlap(this.pos.x, this.pos.z);
    // 次の浅瀬を選ぶ（驚いた原因から遠いところ）
    let best = null, bd = -1;
    for (const s of this.spots) {
      if (s === this.spot) continue;
      const d = from ? Math.hypot(s.x - from.x, s.z - from.y) : rnd(0, 20);
      if (d > bd) { bd = d; best = s; }
    }
    this.target = (best || this.spots[0]).clone();
    this.spot = this.target;
    this.water.addRipple(this.pos.x, this.pos.z, 0.5);
    this.heading = Math.atan2(this.target.z - this.pos.z, this.target.x - this.pos.x) + rnd(-0.8, 0.8);
  }

  land() {
    this.water.addRipple(this.pos.x, this.pos.z, 0.5);
    this.settle(this.target);
  }
}
