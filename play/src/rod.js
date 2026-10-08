// 竿（リール竿 / へら竿）・ウキ・釣り糸
import { L } from './i18n.js';
import * as THREE from 'three';
import { clamp, lerp, TAU, damp, hexToLinear, mulberry32 } from './util.js';
import { canvasTexture } from './textures.js';
import { patchMaterial, G } from './materials.js';
import { colorize } from './geo.js';
import { applyEnv } from './env.js';

const lin = (h) => hexToLinear(h);

// ---------------------------------------------------------------------------
// 竿の種類。リール竿は遠投とリール巻き、へら竿（のべ竿）はリールなしで手前を狙い、竿をためて寄せる。
export const ROD_TYPES = {
  reel: {
    id: 'reel', name: L('リール竿', 'Reel rod'), sub: L('遠くまで投げて、リールで巻く', 'Cast far and reel in'),
    N: 11, length: 2.9, grip: 1, r0: 0.0125, r1: 0.0028, weightExp: 2.3, tex: 'graphite', reel: true, guides: true,
    cast: { min: 5, max: 33, flight0: 0.55, flightK: 0.026, h0: 2.2, hK: 0.12, charge: 1.2, minWater: 3 },
    pose: { idle: 0.56, wind: 1.62, cast: 0.34, float: 0.42, fightBase: 0.72, fightGain: 0.3, bendIdle: 0.1, bendWind: 0.55, bendFloat: 0.15, bendBite: 0.5, bendFightBase: 0.2, bendFightGain: 1.5 },
    reelSpeedK: 1, pullK: 1, maxDist: 60, landDist: 2.5, staminaK: 1, attract: 1, bobber: 'round', splash: 1, fightHint: L('巻いている… ゲージを見ながら', 'Reeling… watch the gauge'), reelHint: L('巻こう！（長押し）', 'Reel in! (hold)'),
  },
  hera: {
    id: 'hera', name: L('へら竿', 'Hera pole'), sub: L('リールなし。手前をそっと狙う', 'No reel. Fish close in, gently'),
    N: 18, length: 4.7, grip: 1, r0: 0.0108, r1: 0.0021, weightExp: 1.55, tex: 'lacquer', reel: false, guides: false,
    cast: { min: 4.4, max: 8.8, flight0: 0.45, flightK: 0.035, h0: 1.4, hK: 0.1, charge: 0.9, minWater: 3 },
    pose: { idle: 0.64, wind: 1.28, cast: 0.5, float: 0.5, fightBase: 0.8, fightGain: 0.4, bendIdle: 0.14, bendWind: 0.5, bendFloat: 0.2, bendBite: 0.6, bendFightBase: 0.32, bendFightGain: 1.9 },
    reelSpeedK: 0.5, pullK: 1.12, maxDist: 9.6, landDist: 3.3, staminaK: 1.35, attract: 1.9, bobber: 'hera', splash: 0.45, fightHint: L('竿をためている… ゲージを見ながら', 'Holding the rod… watch the gauge'), reelHint: L('竿をたてて寄せよう！（長押し）', 'Raise the rod and draw it in! (hold)'),
  },
};

function makeRodTexture(kind) {
  const rnd = mulberry32(kind.length * 7 + 3);
  return canvasTexture(64, 256, (g, w, h) => {
    if (kind === 'graphite') {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#080a0e'); gr.addColorStop(0.35, '#2a3646'); gr.addColorStop(0.55, '#141a22'); gr.addColorStop(1, '#06080b');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(150,170,200,${rnd() * 0.05})`; g.fillRect(rnd() * w, 0, 1, h); }
      g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, w, 3);
      g.fillStyle = '#c1272d'; g.fillRect(0, h - 14, w, 7);
      g.fillStyle = '#d9b45a'; g.fillRect(0, h - 15, w, 1.5); g.fillRect(0, h - 7, w, 1.5);
    } else if (kind === 'lacquer') {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#1d1009'); gr.addColorStop(0.4, '#5a3719'); gr.addColorStop(0.6, '#33200e'); gr.addColorStop(1, '#170d07');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '230,180,110' : '10,5,0'},${rnd() * 0.1})`; g.fillRect(rnd() * w, 0, 1 + rnd() * 2, h); }
      g.fillStyle = '#c9a24a'; g.fillRect(0, 0, w, 4);
      g.fillStyle = '#12090a'; g.fillRect(0, h - 22, w, 8);
      g.fillStyle = '#b3262b'; g.fillRect(0, h - 13, w, 4);
      g.fillStyle = '#c9a24a'; g.fillRect(0, h - 23, w, 1.5);
    } else if (kind === 'tip') {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#9a5d22'); gr.addColorStop(0.5, '#e3a85a'); gr.addColorStop(1, '#8a521c');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a2410'; g.fillRect(0, 0, w, 3);
    } else if (kind === 'cork') {
      g.fillStyle = '#c4a171'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '120,80,40' : '240,215,170'},${rnd() * 0.35})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, rnd() * 2 + 0.4, 0, 7); g.fill(); }
    } else if (kind === 'eva') {
      g.fillStyle = '#1b1d1f'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { g.fillStyle = y % 64 ? '#2a3a2e' : '#14161a'; g.fillRect(0, y, w, 14); }
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
    }
  }, { repeat: true });
}

const _bx = new THREE.Vector3(), _bz = new THREE.Vector3(), _by = new THREE.Vector3(), _bm = new THREE.Matrix4();
function orient(obj, dir, upRef) {
  _by.copy(dir);
  _bx.crossVectors(_by, upRef);
  if (_bx.lengthSq() < 1e-4) _bx.set(1, 0, 0);
  _bx.normalize();
  _bz.crossVectors(_bx, _by);
  _bm.makeBasis(_bx, _by, _bz);
  obj.quaternion.setFromRotationMatrix(_bm);
}

export class Rod {
  constructor(scene, typeId = 'reel') {
    const cfg = (this.cfg = ROD_TYPES[typeId]);
    this.type = typeId;
    this.group = new THREE.Group();
    this.group.name = 'rod-' + typeId;
    this.N = cfg.N;
    this.length = cfg.length;
    this.segs = [];
    const mk = (kind, rough = 0.35, metal = 0) => {
      const m = new THREE.MeshStandardMaterial({ map: makeRodTexture(kind), roughness: rough, metalness: metal });
      patchMaterial(m, { translucent: 0.5 });
      m.userData.patchKey = 'rod-' + kind;
      applyEnv(m, 0.9);
      return m;
    };
    const bodyMat = mk(cfg.tex, cfg.tex === 'graphite' ? 0.22 : 0.3, cfg.tex === 'graphite' ? 0.2 : 0);
    const gripMat = mk(cfg.tex === 'graphite' ? 'eva' : 'cork', 0.85);
    const tipMat = typeIdIsHera(typeId) ? mk('tip', 0.4) : bodyMat;
    this.segLen = [];
    const N = this.N;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const r0 = lerp(cfg.r0, cfg.r1, Math.pow(t0, 0.8));
      const r1 = lerp(cfg.r0, cfg.r1, Math.pow(t1, 0.8));
      const len = this.length / N;
      this.segLen.push(len);
      const bigGrip = i < cfg.grip;
      const geo = new THREE.CylinderGeometry(r1 * (bigGrip ? 1.3 : 1), r0 * (bigGrip ? 1.35 : 1), len * 1.04, 10, 1);
      geo.translate(0, len / 2, 0);
      const mat = bigGrip ? gripMat : (typeIdIsHera(typeId) && i >= N - 4 ? tipMat : bodyMat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.segs.push(mesh);
    }
    // 穂先の赤い目印
    this.tipMark = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0042, 0.07, 6),
      new THREE.MeshStandardMaterial({ color: 0xd82a1a, roughness: 0.5, emissive: new THREE.Color(0.35, 0.02, 0.0) })
    );
    this.group.add(this.tipMark);

    // ガイド（リール竿は下向きのリング）
    this.guides = [];
    if (cfg.guides) {
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.25, metalness: 0.9 });
      applyEnv(ringMat, 1.0);
      const idxs = [3, 5, 6, 8, 9, 10];
      for (const i of idxs) {
        if (i >= N) continue;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011 - i * 0.0004, 0.0016, 5, 12), ringMat);
        ring.rotation.set(Math.PI / 2, 0, 0);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.014), ringMat);
        foot.position.set(0, 0, 0.004);
        const holder = new THREE.Group();
        holder.add(ring, foot);
        holder.position.set(0, this.segLen[i] * 0.5, -0.012 - i * 0.0004);
        this.segs[i].add(holder);
        this.guides.push(holder);
      }
    }

    // リール（スピニング）
    this.reel = null;
    if (cfg.reel) {
      const R = new THREE.Group();
      const silver = new THREE.MeshStandardMaterial({ color: 0xbfc6cf, roughness: 0.28, metalness: 0.9 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.45, metalness: 0.4 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 });
      const line = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.7 });
      [silver, dark, gold].forEach((m) => applyEnv(m, 1.1));
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.1, 0.05), dark);
      leg.position.set(0, 0.035, -0.03);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), silver);
      body.scale.set(0.034, 0.06, 0.04);
      body.position.set(0, 0.04, -0.08);
      const bodyBand = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.012, 16), dark);
      bodyBand.position.set(0, 0.07, -0.08);
      const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.034, 20), gold);
      spool.position.set(0, 0.106, -0.082);
      const lineWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.026, 20), line);
      lineWrap.position.set(0, 0.108, -0.082);
      const rotor = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 10, 0, TAU, 0, 1.45), dark);
      rotor.rotation.x = -Math.PI / 2;
      rotor.position.set(0, 0.085, -0.082);
      this.handle = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.075), silver);
      arm.position.set(0.0, 0, -0.037);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 6), silver);
      stem.rotation.z = Math.PI / 2;
      stem.position.set(0.015, 0, 0);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), dark);
      knob.position.set(0.034, 0, -0.075);
      this.handle.add(arm, stem, knob);
      this.handle.position.set(0.04, 0.04, -0.08);
      R.add(leg, body, bodyBand, spool, lineWrap, rotor, this.handle);
      R.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(R);
      this.reel = R;
      this.reelAngle = 0;
    }
    scene.add(this.group);

    this.pitch = cfg.pose.idle;
    this.yaw = 0.26;
    this.bend = 0.1;
    this.bendDir = new THREE.Vector3(0, -1, 0);
    this.tip = new THREE.Vector3();
    this.tipDir = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._pts = [];
    for (let i = 0; i <= N; i++) this._pts.push(new THREE.Vector3());
  }

  setVisible(v) { this.group.visible = v; }

  spinReel(rad) {
    if (!this.reel) return;
    this.reelAngle += rad;
    this.handle.rotation.x = this.reelAngle;
  }

  update(camPos, camYaw, camPitch, pose, time) {
    const fwd = this._a.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = this._b.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    this.base.copy(camPos)
      .addScaledVector(right, 0.27)
      .addScaledVector(fwd, 0.32);
    this.base.y -= 0.43 - camPitch * 0.08;

    const ang = camYaw - pose.yaw;
    const pitch = pose.pitch;
    const dir = this._d.set(-Math.sin(ang) * Math.cos(pitch), Math.sin(pitch), -Math.cos(ang) * Math.cos(pitch)).normalize();

    const bendTo = pose.bendTo || this._up.clone().multiplyScalar(-1);
    const axis = this._axis.crossVectors(dir, bendTo);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const totalBend = pose.bend;
    const N = this.N;
    let sumW = 0;
    const weights = [];
    for (let i = 0; i < N; i++) {
      const w = Math.pow((i + 0.5) / N, this.cfg.weightExp);
      weights.push(w);
      sumW += w;
    }
    const p = this._pts[0].copy(this.base);
    const cur = new THREE.Vector3().copy(dir);
    const q = this._q;
    const upRef = this._up;
    let dir2 = null;
    for (let i = 0; i < N; i++) {
      const a = (totalBend * weights[i]) / sumW;
      q.setFromAxisAngle(axis, a);
      cur.applyQuaternion(q);
      const seg = this.segs[i];
      seg.position.copy(p);
      orient(seg, cur, upRef);
      if (i === 1) dir2 = cur.clone();
      p.addScaledVector(cur, this.segLen[i]);
      this._pts[i + 1].copy(p);
    }
    this.tip.copy(p);
    this.tipDir.copy(cur);
    this.tipMark.position.copy(p).addScaledVector(cur, -0.03);
    this.tipMark.quaternion.setFromUnitVectors(this._up, cur);
    if (this.reel && dir2) {
      this.reel.position.copy(this._pts[2]);
      orient(this.reel, dir2, upRef);
    }
  }

  pointAt(t, out) {
    const f = clamp(t) * this.N;
    const i = Math.min(this.N - 1, Math.floor(f));
    return out.copy(this._pts[i]).lerp(this._pts[i + 1], f - i);
  }
}

function typeIdIsHera(id) { return id === 'hera'; }

// ---------------------------------------------------------------------------
// 糸（画面上で一定の細い太さのリボン）
export class FishingLine {
  constructor(scene, N = 36) {
    this.N = N;
    const pos = new Float32Array(N * 2 * 3);
    const tan = new Float32Array(N * 2 * 3);
    const side = new Float32Array(N * 2);
    const idx = [];
    for (let i = 0; i < N; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < N - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('tangent', new THREE.BufferAttribute(tan, 3));
    g.setAttribute('side', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uRes: { value: new THREE.Vector2(1280, 720) },
        uWidth: { value: 1.7 },
        uColor: { value: new THREE.Color(0.9, 0.95, 1.0) },
        uSunDir: G.uSunDirW,
        uSunCol: G.uSunColor,
        uAmb: G.uAmbient,
      },
      vertexShader: /* glsl */ `
        attribute vec3 tangent; attribute float side;
        uniform vec2 uRes; uniform float uWidth;
        varying float vFacing; varying vec3 vWorld;
        void main(){
          vec4 p0 = projectionMatrix * viewMatrix * vec4(position, 1.0);
          vec4 p1 = projectionMatrix * viewMatrix * vec4(position + tangent, 1.0);
          vec2 s0 = p0.xy / p0.w, s1 = p1.xy / p1.w;
          vec2 d = (s1 - s0) * uRes;
          float l = length(d);
          vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          gl_Position = p0;
          gl_Position.xy += nrm * side * uWidth / uRes * p0.w;
          vWorld = position;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
        varying vec3 vWorld;
        void main(){
          vec3 V = normalize(vWorld - cameraPosition);
          float glint = pow(max(dot(V, uSunDir), 0.0), 6.0);
          vec3 col = uColor * (uAmb*0.8 + uSunCol*0.5 + 0.08) + uSunCol * glint * 1.2;
          gl_FragColor = vec4(col, 0.78);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.visible = true;
  }

  setPoints(points) {
    const N = this.N;
    const pos = this.geo.attributes.position.array;
    const tan = this.geo.attributes.tangent.array;
    for (let i = 0; i < N; i++) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)], b = points[Math.min(N - 1, i + 1)];
      const tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
        tan[o] = tx; tan[o + 1] = ty; tan[o + 2] = tz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.tangent.needsUpdate = true;
  }

  // 竿先 a → ウキ b のたるんだ糸。slack: たるみ量(m)  waterLen: 水面に浮く長さ
  build(a, b, slack, waterLen = 0) {
    const N = this.N;
    const dist = a.distanceTo(b);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = this.pts[i];
      p.lerpVectors(a, b, t);
      const s = Math.sin(t * Math.PI);
      p.y -= s * slack;
      if (waterLen > 0) {
        const wt = clamp((t - (1 - waterLen / Math.max(dist, 0.01))) / Math.max(waterLen / Math.max(dist, 0.01), 1e-3));
        if (wt > 0) p.y = lerp(p.y, Math.max(0.006, b.y * 0.2), wt * wt);
      }
      if (p.y < 0.006 && i < N - 1 && p.y < a.y) p.y = Math.max(p.y, 0.006);
    }
    this.setPoints(this.pts);
  }
}

// ---------------------------------------------------------------------------
// ウキ：丸いコルク風の棒ウキ（リール竿）と、細長いヘラウキ（へら竿）
export class Bobber {
  constructor(scene) {
    this.group = new THREE.Group();
    const mk = (prof, colorFn) => {
      const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
      colorize(geo, colorFn);
      return geo;
    };
    this.geos = {
      round: mk(
        [[0.0, 0.3], [0.006, 0.297], [0.008, 0.28], [0.009, 0.2], [0.009, 0.12], [0.011, 0.06], [0.022, 0.0], [0.026, -0.04], [0.018, -0.1], [0.008, -0.15], [0.0, -0.16]],
        (x, y) => {
          if (y > 0.2) return lin(0xff3a14);
          if (y > 0.17) return lin(0xfff2cc);
          if (y > 0.12) return lin(0xff3a14);
          if (y > 0.0) return lin(0xfff2cc);
          if (y > -0.05) return lin(0x1d6a3a);
          return lin(0x15110e);
        }
      ),
      // ヘラウキ：細いトップに赤・白・黒の帯、下にバルサのふくらみ
      hera: mk(
        [[0.0, 0.52], [0.0034, 0.516], [0.0036, 0.4], [0.0042, 0.14], [0.0095, 0.115], [0.0165, 0.06], [0.0175, 0.0], [0.0125, -0.06], [0.005, -0.12], [0.0, -0.135]],
        (x, y) => {
          if (y > 0.46) return lin(0xff3322);
          if (y > 0.43) return lin(0xfff6e0);
          if (y > 0.37) return lin(0x15110e);
          if (y > 0.33) return lin(0xfff6e0);
          if (y > 0.27) return lin(0xff3322);
          if (y > 0.23) return lin(0xfff6e0);
          if (y > 0.17) return lin(0x15110e);
          if (y > 0.115) return lin(0xfff6e0);
          if (y > 0.03) return lin(0x5a3a1e);
          return lin(0x2a1a0e);
        }
      ),
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.0, emissive: new THREE.Color(0.2, 0.03, 0.0) });
    patchMaterial(mat, { underwater: true });
    mat.userData.patchKey = 'bobber';
    applyEnv(mat, 0.8);
    this.body = new THREE.Mesh(this.geos.round, mat);
    this.body.castShadow = true;
    this.group.add(this.body);
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.15) })
    );
    this.glow.position.y = 0.29;
    this.group.add(this.glow);
    // 電気ウキ: 夜は、ウキの先が光る（リール用は緑、へらウキは赤）
    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 2.6, 0.7), fog: false });
    this.led = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.07, 10), this.ledMat);
    this.led.position.y = 0.265;
    this.led.visible = false;
    this.group.add(this.led);
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    { const g = hc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    const hTex = new THREE.CanvasTexture(hc); hTex.colorSpace = THREE.SRGBColorSpace;
    this.haloMat = new THREE.SpriteMaterial({ map: hTex, color: new THREE.Color(0.2, 1.4, 0.5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(0.14);
    this.halo.position.y = 0.285;
    this.halo.visible = false;
    this.halo.renderOrder = 12;
    this.group.add(this.halo);
    this.styleName = 'round';
    this.scale = 1.9;
    this.eyeY = 0.3;
    this.group.scale.setScalar(this.scale);
    this.group.visible = false;
    scene.add(this.group);
    this.eye = new THREE.Vector3();
  }

  setStyle(name) {
    this.styleName = name;
    this.body.geometry = this.geos[name];
    if (name === 'hera') {
      this.glow.position.y = 0.515; this.glow.scale.setScalar(0.6); this.scale = 1.5; this.eyeY = 0.05;
      this.led.position.y = 0.482; this.led.scale.set(0.52, 1, 0.52); this.halo.position.y = 0.5; this.halo.scale.setScalar(0.1);
      this.ledMat.userData.col = [3.0, 0.35, 0.2]; this.haloMat.userData.col = [1.5, 0.2, 0.12];
    } else {
      this.glow.position.y = 0.29; this.glow.scale.setScalar(1); this.scale = 1.9; this.eyeY = 0.3;
      this.led.position.y = 0.265; this.led.scale.set(1, 1, 1); this.halo.position.y = 0.285; this.halo.scale.setScalar(0.14);
      this.ledMat.userData.col = [0.15, 2.6, 0.7]; this.haloMat.userData.col = [0.2, 1.4, 0.5];
    }
    this.setNight(this._night || 0);
  }

  // k: 0（昼）〜1（夜）。夜は先が光って、遠くからでも見つけやすい
  setNight(k, dist = 0) {
    this._night = k;
    // 遠くのウキは、光のにじみを少し大きくして見つけやすく
    this.halo.scale.setScalar((this.styleName === 'hera' ? 0.1 : 0.14) * (1 + 0.05 * Math.min(40, Math.max(0, dist - 8))));
    const on = k > 0.02;
    this.led.visible = on; this.halo.visible = on;
    this.glow.visible = k < 0.25;
    const lc = this.ledMat.userData.col || [0.15, 2.6, 0.7], hc = this.haloMat.userData.col || [0.2, 1.4, 0.5];
    this.ledMat.color.setRGB(lc[0] * k, lc[1] * k, lc[2] * k);
    this.haloMat.color.setRGB(hc[0], hc[1], hc[2]);
    this.haloMat.opacity = 0.7 * k;
  }

  eyePos(out) {
    return out.set(0, this.eyeY * this.group.scale.x, 0).add(this.group.position);
  }
}

// 狙い位置のリング
export function makeAimRing(scene) {
  const g = new THREE.RingGeometry(0.85, 1.0, 48);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.6), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(g, m);
  ring.position.y = 0.02;
  ring.renderOrder = 15;
  ring.visible = false;
  scene.add(ring);
  return ring;
}
