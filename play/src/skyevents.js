// 空の出来事: 流れ星・雨あがりの虹・夏の夜の遠い花火・遠雷
// 流れ星と虹は空のシェーダ（atmosphere.js）で描き、花火は遠くの粒子、稲光は空と露出のあかりで見せる。
import * as THREE from 'three';
import { SEASON, SEASON_ID } from './season.js';
import { clamp, lerp, smoothstep, TAU } from './util.js';
import { Sprites } from './fx.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const C_SOUND = 343;

// 花火の色（HDR。ブルームでにじむ）
const COL = {
  gold: [2.4, 1.4, 0.3], red: [2.6, 0.3, 0.25], green: [0.4, 2.2, 0.5], ice: [0.8, 1.6, 2.8],
  pink: [2.6, 0.6, 1.4], violet: [1.4, 0.5, 2.8], white: [2.2, 2.2, 2.4], orange: [2.6, 0.9, 0.2],
};
const SHELLS = [
  { a: 'red', b: 'orange' }, { a: 'gold', b: 'orange' }, { a: 'green', b: 'ice' }, { a: 'ice', b: 'white' },
  { a: 'pink', b: 'violet' }, { a: 'violet', b: 'ice' }, { a: 'white', b: 'gold' }, { a: 'gold', b: 'gold', kind: 'willow' },
  { a: 'pink', b: 'white', kind: 'ring' }, { a: 'green', b: 'gold', kind: 'ring' },
];
const FW_K = 1.8;          // 火花の空気抵抗
const FW_G = 7;            // 火花が落ちていく重さ

export class SkyEvents {
  constructor(scene, atm, hooks = {}, { quality = 'high' } = {}) {
    this.atm = atm;
    this.hooks = hooks;
    this.time = 0;
    this._renderH = 0;
    this.q = quality;
    this.later = [];
    const qs = new URLSearchParams(location.search);
    this.forceFw = qs.get('fw') === '1';   // 試験用: どの季節でも夜に花火

    // 流れ星
    this.met = { t: -1, dur: 1, s0: new THREE.Vector3(), v: new THREE.Vector3(), travel: 0.5, len: 0.2 };
    this.metNext = rnd(25, 70);
    // 虹（空の固定の方角に出る。見た目をそろえるため、太陽の反対ではなく正面の山のうえ）
    this.rb = { amt: 0, state: 'off', t: 0, hold: 0 };
    this.rainSeen = -1e9;
    const az = Math.PI - 0.18, el = -0.1;
    atm.u.uRbDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // 花火
    this.fw = { shells: [], left: 0, next: rnd(12, 40), shellT: 0, sprites: new Sprites(3600, { additive: true, fog: false, soft: 1.0 }), hinted: false };
    this.fw.sprites.points.renderOrder = 28;
    scene.add(this.fw.sprites.points);
    // 雷
    this.lt = { t: -1, strokes: [], strength: 0, flash: 0 };
    this.ltNext = rnd(12, 35);
    this.thunderUntil = -1;
    this.thunderHinted = false;
  }

  _later(delay, fn) { this.later.push({ t: this.time + delay, fn }); }

  // カメラから見た音の左右（正面が0、右が+）
  _pan(camera, x, z) {
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    const dx = x - camera.position.x, dz = z - camera.position.z, l = Math.hypot(dx, dz) || 1;
    return clamp((dx / l) * (-f.z) + (dz / l) * f.x, -1, 1) * 0.9;
  }

  update(dt, time, camera, started) {
    this.time = time;
    this.camera = camera;
    for (let i = this.later.length - 1; i >= 0; i--) if (time >= this.later[i].t) { const f = this.later[i].fn; this.later.splice(i, 1); f(); }
    this._meteor(dt, camera, started);
    this._rainbow(dt, time, started);
    this._fireworks(dt, time, camera, started);
    this._thunder(dt, time, started);
    // 稲光と花火のあかり
    const atm = this.atm;
    let fw = 0; const fc = [0, 0, 0];
    for (const s of this.fw.shells) {
      if (s.phase !== 'burst' || s.bt > 0.6) continue;
      const a = 0.11 * Math.exp(-s.bt * 7) * s.size;
      if (a > fw) { fw = a; const c = COL[s.a]; const m = Math.max(...c); fc[0] = c[0] / m; fc[1] = c[1] / m; fc[2] = c[2] / m; }
    }
    const lf = this.lt.flash;
    if (lf > fw) { atm.flash = lf; atm.flashCol.setRGB(0.72, 0.8, 1); }
    else { atm.flash = fw; atm.flashCol.setRGB(fc[0] * 0.8 + 0.1, fc[1] * 0.8 + 0.1, fc[2] * 0.8 + 0.1); }
    atm.thunder = clamp((this.thunderUntil - time) / 90, 0, 1);
  }

  // ---------------------------------------------------------------- 流れ星
  _meteor(dt, camera, started) {
    const atm = this.atm, m = this.met, u = atm.u;
    if (m.t < 0) {
      u.uMetAmt.value = 0;
      const dark = atm.night > 0.75 && atm.overcast < 0.55 && atm.rain < 0.2;
      if (dark && started) { this.metNext -= dt; if (this.metNext <= 0) this._spawnMeteor(camera, false); }
      return;
    }
    m.t += dt;
    const k = m.t / m.dur;
    if (k >= 1) { m.t = -1; u.uMetAmt.value = 0; this.metNext = rnd(45, 120); return; }
    const th = m.travel * k;
    u.uMetHead.value.copy(m.s0).multiplyScalar(Math.cos(th)).addScaledVector(m.v, Math.sin(th));
    u.uMetDir.value.copy(m.s0).multiplyScalar(-Math.sin(th)).addScaledVector(m.v, Math.cos(th));
    u.uMetAmt.value = Math.pow(Math.sin(Math.PI * k), 0.6);
    u.uMetLen.value = m.len * (0.35 + 0.65 * smoothstep(0, 0.3, k)) * (1 - 0.5 * smoothstep(0.7, 1, k));
  }

  // inView: 試験用に、いまの視線の前に出す
  _spawnMeteor(camera, inView) {
    const m = this.met;
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    const fa = Math.atan2(f.x, f.z);
    const az = inView || Math.random() < 0.7 ? fa + rnd(-0.8, 0.8) : rnd(0, TAU);
    const el = inView ? rnd(0.5, 0.8) : rnd(0.45, 1.15);
    m.s0.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const e = new THREE.Vector3(0, 1, 0).cross(m.s0).normalize();
    const n = m.s0.clone().cross(e).normalize();
    const h = rnd(0, TAU);
    m.v.copy(e).multiplyScalar(Math.cos(h)).addScaledVector(n, Math.sin(h));
    if (m.v.y > 0) m.v.negate();                       // だいたい下むきに落ちる
    m.v.addScaledVector(m.s0, -m.v.dot(m.s0)).normalize();
    m.dur = rnd(0.75, 1.25); m.travel = rnd(0.38, 0.72); m.len = rnd(0.14, 0.26); m.t = 0;
    const mid = m.s0.clone().multiplyScalar(Math.cos(m.travel * 0.5)).addScaledVector(m.v, Math.sin(m.travel * 0.5));
    // 視界に入っているときだけ、願いごとができる
    if (f.dot(mid) > Math.cos(0.6) && this.hooks.onWish) this.hooks.onWish();
  }

  // ---------------------------------------------------------------- 虹
  _rainbow(dt, time, started) {
    const atm = this.atm, rb = this.rb;
    if (atm.rain > 0.6) this.rainSeen = time;
    const afterRain = time - this.rainSeen < 420 && atm.rain < 0.25;
    const day = atm.sunElev > 6 && atm.sunElev < 42 && atm.overcast < 0.88 && !SEASON.snow;
    const bad = atm.rain > 0.55 || atm.sunElev < 3 || atm.overcast > 0.95;
    if (rb.state === 'off') {
      if (started && afterRain && day) {
        rb.state = 'on'; rb.t = 0; rb.hold = rnd(130, 230); this.rainSeen = -1e9;
        if (this.hooks.onRainbow) this.hooks.onRainbow();
      }
    } else if (rb.state === 'on') {
      rb.amt = Math.min(1, rb.amt + dt / 30);
      rb.t += dt;
      if (rb.t > rb.hold || bad) rb.state = 'out';
    } else {
      rb.amt = Math.max(0, rb.amt - dt / (bad ? 12 : 40));
      if (rb.amt <= 0) rb.state = 'off';
    }
    atm.u.uRbAmt.value = rb.amt * (1 - 0.3 * atm.overcast);
  }

  // ---------------------------------------------------------------- 花火
  _fireworks(dt, time, camera, started) {
    const atm = this.atm, fw = this.fw;
    const ok = (SEASON_ID === 'summer' || this.forceFw) && atm.night > 0.85 && atm.rain < 0.2 && atm.overcast < 0.85;
    if (started && ok) {
      if (fw.left <= 0) {
        fw.next -= dt;
        if (fw.next <= 0) { fw.left = Math.round(rnd(9, 13)); fw.shellT = 0.5; if (!fw.hinted) { fw.hinted = true; if (this.hooks.onFireworks) this.hooks.onFireworks(); } }
      } else {
        fw.shellT -= dt;
        if (fw.shellT <= 0) {
          this.launch(camera);
          if (fw.left <= 3 && Math.random() < 0.7) this._later(rnd(0.2, 0.5), () => this.launch(camera));   // 最後は続けざまに
          fw.left--;
          fw.shellT = fw.left <= 3 ? rnd(0.8, 1.5) : rnd(2.4, 5);
          if (fw.left <= 0) fw.next = rnd(200, 360);
        }
      }
    }
    // 打ち上げ・花開き
    const sp = fw.sprites;
    sp.begin();
    const cam = camera;
    const scale = (this._renderH || innerHeight * (window.devicePixelRatio || 1)) * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    sp.mat.uniforms.uScale.value = scale;
    for (let i = fw.shells.length - 1; i >= 0; i--) {
      const s = fw.shells[i];
      if (s.phase === 'rise') {
        s.t += dt;
        const u = Math.min(1, s.t / s.riseT);
        const y = s.y0 + (s.yb - s.y0) * (1 - (1 - u) * (1 - u));
        sp.add(s.x, y, s.z, 1.4, 0.95, 3.0, 1.9, 0.9);
        for (let j = 1; j <= 7; j++) {
          const uj = Math.max(0, u - j * 0.028);
          const yj = s.y0 + (s.yb - s.y0) * (1 - (1 - uj) * (1 - uj));
          sp.add(s.x, yj, s.z, 1.1 * (1 - j / 9), 0.5 * (1 - j / 8), 2.6, 1.4, 0.5);
        }
        if (u >= 1) { s.phase = 'burst'; s.bt = 0; this._burst(s); }
      } else {
        s.bt += dt;
        const L = s.life, t = s.bt;
        if (t >= L) { fw.shells.splice(i, 1); continue; }
        const u = t / L;
        const ca = COL[s.a], cb = COL[s.b];
        const mix = smoothstep(0.1, 0.8, u);
        const r = lerp(ca[0], cb[0], mix), g = lerp(ca[1], cb[1], mix), b = lerp(ca[2], cb[2], mix);
        const fade = Math.pow(1 - u, 1.25);
        const k = s.k, grav = FW_G * (s.kind === 'willow' ? 1.5 : 1);
        for (let j = 0; j < s.n; j++) {
          const vx = s.vel[j * 3], vy = s.vel[j * 3 + 1], vz = s.vel[j * 3 + 2];
          const tw = u > 0.5 ? 0.55 + 0.45 * Math.sin(t * 38 + s.ph[j] * 20) : 1;
          const a = fade * tw;
          for (let q = 0; q < 5; q++) {
            const tq = t - q * 0.03;
            if (tq <= 0) break;
            const e = (1 - Math.exp(-k * tq)) / k;
            sp.add(s.x + vx * e, s.yb + vy * e - 0.5 * grav * tq * tq, s.z + vz * e, s.sz * (1 - 0.35 * u) * (q === 0 ? 1 : 0.8 - q * 0.08), a * (q === 0 ? 0.95 : 0.6 - q * 0.13), r, g, b);
          }
        }
        if (t < 0.35) sp.add(s.x, s.yb, s.z, 30 * s.size, 0.5 * Math.exp(-t * 9), ca[0] * 0.4, ca[1] * 0.4, ca[2] * 0.4);
      }
    }
    sp.end();
  }

  // 打ち上げ（debug: kind を指定できる）
  launch(camera, opts = {}) {
    const fw = this.fw;
    if (fw.shells.length >= 6) return;
    const az = Math.PI + rnd(-0.75, 0.5);
    const dist = rnd(270, 430);
    const def = opts.def || SHELLS[Math.floor(Math.random() * SHELLS.length)];
    const s = {
      phase: 'rise', t: 0, riseT: rnd(1.2, 1.7), x: Math.sin(az) * dist, z: Math.cos(az) * dist, y0: rnd(15, 35), yb: rnd(100, 165),
      a: def.a, b: def.b, kind: def.kind || 'peony', size: rnd(0.85, 1.2), dist,
    };
    fw.shells.push(s);
    const pan = this._pan(camera, s.x, s.z);
    if (this.hooks.onLaunch) this._later(dist / C_SOUND, () => this.hooks.onLaunch(0, pan));
    return s;
  }

  _burst(s) {
    const low = this.q === 'low';
    const n = Math.round((s.kind === 'ring' ? 52 : s.kind === 'willow' ? 64 : 80) * (low ? 0.6 : 1) * s.size);
    s.n = n;
    s.vel = new Float32Array(n * 3);
    s.ph = new Float32Array(n);
    s.k = s.kind === 'willow' ? 1.25 : FW_K;
    s.life = s.kind === 'willow' ? rnd(3.8, 4.6) : rnd(2.5, 3.3);
    s.sz = s.kind === 'willow' ? 2.0 : 2.6;
    const R = (s.kind === 'willow' ? rnd(38, 50) : rnd(48, 68)) * s.size;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), nrm = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1)).normalize();
    a.set(nrm.y, -nrm.x, 0).normalize(); if (a.lengthSq() < 0.01) a.set(1, 0, 0); b.crossVectors(nrm, a).normalize();
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (s.kind === 'ring') {
        const ph = (i / n) * TAU;
        x = a.x * Math.cos(ph) + b.x * Math.sin(ph); y = a.y * Math.cos(ph) + b.y * Math.sin(ph); z = a.z * Math.cos(ph) + b.z * Math.sin(ph);
        x += rnd(-0.05, 0.05); y += rnd(-0.05, 0.05); z += rnd(-0.05, 0.05);
      } else {
        const u = rnd(-1, 1), ph = rnd(0, TAU), r = Math.sqrt(1 - u * u);
        x = r * Math.cos(ph); y = u; z = r * Math.sin(ph);
      }
      const v = R * s.k * (s.kind === 'peony' ? rnd(0.82, 1.02) : rnd(0.85, 1));
      s.vel[i * 3] = x * v; s.vel[i * 3 + 1] = y * v; s.vel[i * 3 + 2] = z * v;
      s.ph[i] = Math.random();
    }
    // 光ったあと、距離ぶん遅れて音が届く
    const delay = s.dist / C_SOUND;
    const pan = this.camera ? this._pan(this.camera, s.x, s.z) : 0;
    if (this.hooks.onBoom) this.hooks.onBoom(delay, s.size, pan);
  }

  // ---------------------------------------------------------------- 雷
  _thunder(dt, time, started) {
    const atm = this.atm, lt = this.lt;
    if (lt.t < 0) {
      const stormy = atm.rain > 0.6 && SEASON.thunder > 0;
      if (started && stormy) { this.ltNext -= dt * SEASON.thunder; if (this.ltNext <= 0) this.lightning(rnd(0.5, 1)); }
      lt.flash = 0;
      return;
    }
    lt.t += dt;
    let f = 0;
    for (const [t0, a] of lt.strokes) if (lt.t >= t0) f += a * Math.exp(-(lt.t - t0) / 0.075);
    lt.flash = f * lt.strength * 0.85;
    if (lt.t > 1.2) { lt.t = -1; lt.flash = 0; }
  }

  lightning(strength = 0.8) {
    const lt = this.lt;
    lt.t = 0; lt.strength = strength;
    lt.strokes = [[0, 1]];
    if (Math.random() < 0.7) lt.strokes.push([rnd(0.1, 0.18), rnd(0.4, 0.8)]);
    if (Math.random() < 0.5) lt.strokes.push([rnd(0.25, 0.4), rnd(0.5, 0.95)]);
    this.ltNext = rnd(22, 60);
    const delay = rnd(1.2, 6.5);
    const pan = rnd(-0.6, 0.6);
    this.thunderUntil = this.time + delay + 90;
    if (this.hooks.onThunder) this._later(0, () => this.hooks.onThunder(delay, strength, pan));
    if (!this.thunderHinted && this.hooks.onThunderHint) { this.thunderHinted = true; this._later(delay + 0.5, () => this.hooks.onThunderHint()); }
  }

  // 試験・遊び用に、いま起こす
  trigger(kind) {
    const cam = this.camera;
    if (kind === 'meteor') this._spawnMeteor(cam, true);
    else if (kind === 'rainbow') { this.rb.state = 'on'; this.rb.t = 0; this.rb.hold = 200; if (this.hooks.onRainbow) this.hooks.onRainbow(); }
    else if (kind === 'firework') this.launch(cam);
    else if (kind === 'thunder') this.lightning(0.9);
  }
}
