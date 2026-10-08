// 一人称の視点操作と入力（マウス・キーボード・タッチ）
import * as THREE from 'three';
import { clamp, damp, noise2, lerp, widenFov } from './util.js';
import { PIER } from './props.js';

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.eye = new THREE.Vector3(0, PIER.y + 1.58, PIER.zEnd + 1.15);
    this.baseYaw = 0;
    this.basePitch = -0.05;
    this.yaw = 0;
    this.pitch = -0.05;
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseS = new THREE.Vector2(0, 0);
    this.fov = 62;
    this.targetFov = 62;
    this.shake = 0;
    this.time = 0;
    this.keys = new Set();
    this.hold = false;
    this.pressed = false;
    this.released = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = true;
    this.mouseLook = true;
    // ヒット中: 魚の方へ視線をそっと向ける（{ yaw, pitch, roll } を game から毎フレーム渡す）
    this.follow = null;
    this.followOn = true;
    this.reduce = false;      // 「動きをおさえる」: 揺れ・視点の追従・寄りを弱める
    this.followW = 0;
    this.manualT = 0;
    this.roll = 0;
    this.punch = 0;
    this.nod = 0;
    this.zoomT = 0;
    this.home = null;       // ヒットの前に向いていた視線 { yaw, pitch }。待機に戻ったらそっと戻る
    this.returning = false;
    this.handlers = {};
    camera.rotation.order = 'YXZ';
    this._bind();
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, ...a) { (this.handlers[name] || []).forEach((fn) => fn(...a)); }

  setHold(v) {
    if (v && !this.hold) this.pressed = true;
    if (!v && this.hold) this.released = true;
    this.hold = v;
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.pointerType === 'mouse') {
        // 写真の構図を決めているあいだは、左ドラッグでも見回すだけ（投げない）
        if (e.button === 0 && this.lookOnly) { this.dragging = true; d.setPointerCapture(e.pointerId); }
        else if (e.button === 0) this.setHold(true);
        else if (e.button === 2 || e.button === 1) { this.dragging = true; d.setPointerCapture(e.pointerId); }
      } else {
        // タッチ: ドラッグで見回す（アクションは画面のボタン）
        this.dragging = true;
        d.setPointerCapture(e.pointerId);
      }
    });
    d.addEventListener('pointermove', (e) => {
      const w = window.innerWidth, h = window.innerHeight;
      if (e.pointerType === 'mouse') {
        this.mouse.set((e.clientX / w) * 2 - 1, (e.clientY / h) * 2 - 1);
      }
      if (this.dragging) {
        const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
        const k = e.pointerType === 'mouse' ? 0.0042 : 0.0055;
        this.baseYaw += dx * k;
        this.basePitch = clamp(this.basePitch + dy * k * 0.8, -0.6, 0.85);
      }
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    const up = (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.setHold(false);
      this.dragging = false;
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => { this.setHold(false); this.keys.clear(); });
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetFov = clamp(this.targetFov + e.deltaY * 0.025, 22, 70);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // 文字を入力しているときは、ゲームの操作にしない（記録を貼りつけるときなど）
      const tg = e.target && e.target.tagName;
      if (tg === 'TEXTAREA' || (tg === 'INPUT' && e.target.type !== 'range')) return;
      if (e.code === 'Space') { if (this.enabled && !this.lookOnly) this.setHold(true); e.preventDefault(); }
      this.keys.add(e.code);
      this.emit('key', e);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.setHold(false);
      this.keys.delete(e.code);
    });
  }

  // かかった瞬間の、ぐっと寄る・ガクッとうなずく衝撃
  // ヒット中の視点の動きを使うか（設定の「追う」かつ、動きをおさえていないとき）
  get follows() { return this.followOn && !this.reduce; }
  kick(punch = -8, nod = -0.05) { if (this.follows) { this.punch = punch; this.nod = nod; } }

  zoomBy(dir) {
    this.targetFov = clamp(this.targetFov + dir * 6, 22, 70);
  }

  update(dt, tension = 0) {
    this.time += dt;
    const k = this.keys;
    const turn = ((k.has('ArrowLeft') || k.has('KeyA')) ? 1 : 0) - ((k.has('ArrowRight') || k.has('KeyD')) ? 1 : 0);
    const look = ((k.has('ArrowUp') || k.has('KeyW')) ? 1 : 0) - ((k.has('ArrowDown') || k.has('KeyS')) ? 1 : 0);
    this.baseYaw += turn * dt * 1.05 * (this.fov / 62);
    this.basePitch = clamp(this.basePitch + look * dt * 0.6, -0.6, 0.85);
    // ヒット中は魚を追う。自分で見回している間は手を出さず、はなして約1秒で、また魚へ
    if (turn || look || this.dragging) this.manualT = 1.0; else this.manualT = Math.max(0, this.manualT - dt);
    const F = this.follow;
    const want = F && this.follows && this.manualT <= 0 ? 1 : 0;
    this.followW = damp(this.followW, want, want ? 2.4 : 5, dt);
    if (F && this.follows && this.followW > 0.01) {
      const kk = (1 - Math.exp(-2.6 * dt)) * this.followW;
      const maxS = 0.85 * dt;
      this.baseYaw += clamp((F.yaw - this.baseYaw) * kk, -maxS, maxS);
      this.basePitch = clamp(this.basePitch + clamp((F.pitch - this.basePitch) * kk, -maxS * 0.6, maxS * 0.6), -0.6, 0.85);
    }
    // ヒットが終わって待機にもどったら、はじめの視線へそっと戻す（自分で動かしたらそこで止める）
    if (this.home) {
      if (turn || look || this.dragging) this.home = null;
      else if (this.returning) {
        const hk = 1 - Math.exp(-2.2 * dt);
        this.baseYaw += (this.home.yaw - this.baseYaw) * hk;
        this.basePitch += (this.home.pitch - this.basePitch) * hk;
        if (Math.abs(this.home.yaw - this.baseYaw) < 0.008 && Math.abs(this.home.pitch - this.basePitch) < 0.008) this.home = null;
      }
    }
    const rollT = F && this.follows ? F.roll : 0;
    this.roll = damp(this.roll, rollT, 3.2, dt);
    // 遠い魚は少し大きく、張りが強いほどほんの少し画角をしぼる（寄ってくると、すっと広がる）
    const zoomTo = F && this.follows ? (F.zoom || 0) - 3.5 * clamp((tension - 0.4) / 0.6) : 0;
    this.zoomT = damp(this.zoomT, zoomTo, 2.4, dt);
    this.punch = damp(this.punch, 0, 4.5, dt);
    this.nod = damp(this.nod, 0, 6, dt);
    this.baseYaw = clamp(this.baseYaw, -2.2, 2.2);
    // 視点: マウス位置でも少し見回せる
    this.mouseS.x = damp(this.mouseS.x, this.mouseLook ? this.mouse.x : 0, 4, dt);
    this.mouseS.y = damp(this.mouseS.y, this.mouseLook ? this.mouse.y : 0, 4, dt);
    const fovK = this.fov / 62;
    const targetYaw = this.baseYaw - this.mouseS.x * 0.34 * fovK;
    const targetPitch = this.basePitch - this.mouseS.y * 0.17 * fovK;
    this.yaw = damp(this.yaw, targetYaw, 12, dt);
    this.pitch = damp(this.pitch, targetPitch, 12, dt);
    this.fov = damp(this.fov, this.targetFov, 7, dt);

    // 呼吸と手ぶれ
    const t = this.time;
    const calmK = this.reduce ? 0.25 : 1;
    const sway = 0.0022 + (this.shake * 0.01 + tension * 0.006) * calmK;
    const ox = noise2(t * 0.6, 1.3) * sway, oy = noise2(t * 0.5, 7.7) * sway;
    this.camera.position.copy(this.eye);
    this.camera.position.y += Math.sin(t * 1.15) * 0.004;
    this.camera.position.x += Math.sin(t * 0.37) * 0.004;
    this.camera.rotation.set(this.pitch + oy + this.nod, this.yaw + ox, this.roll);
    // 写真の構図: 枠（frame.asp の形）の中が、その形の画面で見たときと同じになるように、まわりを広げて見せる
    const fr = this.frame;
    const asp = fr ? fr.asp : this.camera.aspect || 1.6;
    const fov = Math.min(100, (this.fov + this.punch + this.zoomT) * (asp < 1.25 ? 1 + (1.25 - asp) * 0.75 : 1));
    this.camera.fov = fr ? widenFov(fov, fr.k) : fov;
    this.camera.updateProjectionMatrix();
    this.shake = damp(this.shake, 0, 6, dt);
  }

  consumePressed() { const p = this.pressed; this.pressed = false; return p; }
  consumeReleased() { const r = this.released; this.released = false; return r; }
}
