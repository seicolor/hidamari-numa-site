// 釣り上げた魚を「手」にのせて見せる演出。
//  - 魚は実物の大きさのまま、糸の先からカメラの手元へ弧を描いて寄ってくる
//  - 下から手がのびて、魚を受けとめる（大きな魚は両手で）
//  - 魚の大きさに合わせて画角と距離を決める（小さな魚は近く・ズーム、大きな魚は離れて見せる）
//  - 手のひら幅(約9cm)が大きさの目安になる
import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { buildHands } from './hands.js';

const easeInOut = (t) => t * t * (3 - 2 * t);
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

export class Showcase {
  constructor(scene) {
    this.hands = buildHands();
    this.rig = this.hands.group;
    scene.add(this.rig);
    this.active = false;
    this.t = 0;
    this.fovDeg = 50;
    this.lightPos = new THREE.Vector3();
    this.lightK = 1;
    this._q = new THREE.Quaternion();
    this._qRig = new THREE.Quaternion();
    this._qTilt = new THREE.Quaternion();
    this._qFish = new THREE.Quaternion();
    this._qY = new THREE.Quaternion();
    this._qX = new THREE.Quaternion();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._o = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  // from: 糸の先で魚がぶらさがっていた位置と向き
  begin(fish, fromPos, fromQuat) {
    this.fish = fish;
    this.t = 0;
    this.active = true;
    this.grabbed = false;
    this.from = fromPos.clone();
    this.fromQuat = fromQuat.clone();
    this.flopAt = rand(1.8, 2.8);
    this.flopT = -1;
    this.flopDir = 1;
    this.dripT = 0;
    const o = fish.obj;
    this.two = o.len >= 0.4 && o.kind !== 'boot';
    // 右手は竿をもっているので、魚は左手にのせる（大きな魚は両手）
    this.hands.left.visible = true;
    this.hands.right.visible = this.two;
    this.rig.visible = true;
  }

  end() {
    this.active = false;
    this.rig.visible = false;
    this.fish = null;
  }

  // 魚が画面の何割かを占めるように、距離と画角を決める
  frame(camera, narrow) {
    const L = this.fish.obj.fitLen || this.fish.obj.len;
    const asp = camera.aspect || 1.6;
    const d = clamp(L * 1.7 + 0.1, 0.42, 1.6);
    const frac = narrow ? 0.8 : 0.42;
    const k = asp < 1.25 ? 1 + (1.25 - asp) * 0.75 : 1;
    const vfov = 2 * Math.atan(L / (2 * d * asp * frac));
    const fovDeg = clamp((vfov * 180) / Math.PI / k, 16, 62);
    const vf = THREE.MathUtils.degToRad(fovDeg * k);
    const H = 2 * d * Math.tan(vf / 2);
    return { d, fovDeg, W: H * asp, H };
  }

  // events: { grab, flop, drips:[Vector3...] } を返す
  update(dt, camera, narrow) {
    const ev = { grab: false, flop: false, drips: [] };
    if (!this.active) return ev;
    this.t += dt;
    const T = this.t;
    const fish = this.fish, o = fish.obj, g = o.group;
    const L = o.len;
    const fr = this.frame(camera, narrow);
    this.fovDeg = fr.fovDeg;

    const q = camera.quaternion;
    const fwd = this._fwd.set(0, 0, -1).applyQuaternion(q);
    const right = this._right.set(1, 0, 0).applyQuaternion(q);
    const up = this._up.set(0, 1, 0).applyQuaternion(q);
    const xo = narrow ? 0 : -0.2 * fr.W;
    const yo = narrow ? 0.27 * fr.H : -0.03 * fr.H;
    const center = this._c.copy(camera.position).addScaledVector(fwd, fr.d).addScaledVector(right, xo).addScaledVector(up, yo);

    // 手のひらを少し手前にかたむけて、魚の側面が見えるように
    this._qTilt.setFromAxisAngle(X, 0.42);
    const qRig = this._qRig.copy(q).multiply(this._qTilt);
    const newt = o.kind === 'newt';
    const rest = (newt ? o.backY || o.bellyY : o.bellyY) + 0.006;
    const off = this._o.set(0, rest, -0.01).applyQuaternion(qRig);
    const R0 = this.rig.position.copy(center).sub(off);
    // 手は下から入ってきて、少し行きすぎてから落ち着く
    const reach = easeOutBack(clamp(T / 0.8));
    const drop = 1 - reach;
    this.rig.position.addScaledVector(up, -0.55 * drop).addScaledVector(fwd, -0.18 * drop);
    this.rig.quaternion.copy(qRig);
    this.hands.right.position.x = 0.2 * L;
    this.hands.left.position.x = this.two ? -0.22 * L : 0;
    // 左手ひとつのときは、左がわから入ってきて、指先が少し内がわへ
    this.hands.left.rotation.y = this.two ? 0 : -0.2;

    // 魚: ぶらさがった位置 → 手のひら
    const e = easeInOut(clamp((T - 0.05) / 0.85));
    const p = this._p.lerpVectors(this.from, center, e);
    p.addScaledVector(up, Math.sin(Math.PI * e) * 0.12);
    // 受けとめたときの小さなバウンド
    const tb = T - 0.9;
    if (tb > 0) p.addScaledVector(up, 0.014 * Math.exp(-tb * 8) * Math.sin(tb * 28));
    if (!this.grabbed && T >= 0.9) { this.grabbed = true; ev.grab = true; }

    // ときどきぴくっと跳ねる
    let flopEnv = 0;
    if (this.flopT < 0 && T > this.flopAt && T > 1.4) { this.flopT = 0; this.flopDir = Math.random() < 0.5 ? -1 : 1; ev.flop = true; }
    if (this.flopT >= 0) {
      this.flopT += dt;
      flopEnv = Math.sin(Math.PI * clamp(this.flopT / 0.5));
      if (this.flopT >= 0.5) { this.flopT = -1; this.flopAt = T + rand(2.2, 4.2); }
    }
    p.addScaledVector(up, 0.012 * flopEnv * (o.kind === 'swim' ? 1 : 0.3));

    // 向き: 手の座標系に合わせて、頭が画面の右、背が上
    const sway = Math.sin(T * 0.5) * 0.12;
    let roll = Math.sin(T * 0.8) * 0.03 + flopEnv * 0.16 * this.flopDir;
    let yaw = sway;
    if (newt) roll += Math.PI * 0.94; // おなかの赤を見せる（イモリは仰向けにすると動かなくなる）
    if (o.kind === 'boot') yaw += 0.6;
    this._qY.setFromAxisAngle(Y, yaw);
    this._qX.setFromAxisAngle(X, roll);
    const qFinal = this._qFish.copy(qRig).multiply(this._qY).multiply(this._qX);
    g.position.copy(p);
    g.quaternion.copy(this.fromQuat).slerp(qFinal, e);

    // 体のうねり: 受けとめた直後は大きく、だんだん落ち着く
    if (o.wig) {
      const excite = T > 0.9 ? Math.exp(-(T - 0.9) * 1.0) : 1;
      o.wig.uWigAmp.value = 0.028 + 0.1 * excite * (o.kind === 'swim' ? 1 : 0.4) + 0.1 * flopEnv;
      o.wig.uWigFreq.value = 5 + 9 * excite + 10 * flopEnv;
      if (o.wig.uFinFreq) o.wig.uFinFreq.value = 7 + 6 * excite;
    }

    // しずく
    this.dripT -= dt;
    if (T > 0.3 && this.dripT <= 0) {
      this.dripT = rand(0.08, 0.22);
      const d = p.clone().addScaledVector(up, -rest * 0.9).addScaledVector(right, rand(-0.45, 0.45) * Math.min(L, 0.4));
      ev.drips.push(d);
    }
    if (ev.flop) for (let i = 0; i < 4; i++) ev.drips.push(p.clone().addScaledVector(right, rand(-0.5, 0.5) * L).addScaledVector(up, 0.02));

    // 魚を美しく見せる照明（遠くで見せる大きな魚ほど強く）
    this.lightPos.copy(camera.position).addScaledVector(fwd, 0.55).addScaledVector(right, -0.35).addScaledVector(up, 0.55);
    this.lightK = clamp(Math.pow(fr.d / 0.95, 1.5), 0.6, 2.4);
    return ev;
  }
}
