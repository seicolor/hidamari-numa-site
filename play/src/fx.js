// 演出：しぶき・煙・蛍・トンボ・鳥・舞う落ち葉・花粉・雨
import { SEASON } from './season.js';
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32, TAU, noise2, fbm2, hexToLinear } from './util.js';
import { terrainHeight, pondSigned, HOUSE, SHORE_Z, waterDepthAt } from './terrain.js';
import { PIER } from './props.js';
import { G } from './materials.js';
import { M } from './geo.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// 汎用ソフトスプライト粒子
export class Sprites {
  constructor(max, { additive = false, fog = true, soft = 1.0, lightMul = 1 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.count = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const u = {
      uScale: { value: 600 },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uSoft: { value: soft },
      ...THREE.UniformsLib.fog,
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        uniform float uScale;
        varying float vA; varying vec3 vC;
        #include <fog_pars_vertex>
        void main(){
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(aSize * uScale / max(-mvPosition.z, 0.05), 0.0, 256.0);
          vA = aAlpha; vC = aColor;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; uniform float uSoft;
        varying float vA; varying vec3 vC;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          float a = smoothstep(1.0, 1.0 - uSoft*0.9, d) * vA;
          if(a < 0.003) discard;
          gl_FragColor = vec4(vC * uLight, a);
          ${fog ? '#include <fog_fragment>' : ''}
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: fog,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }
  begin() { this.count = 0; }
  add(x, y, z, size, alpha, r, g, b) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.size[i] = size; this.alpha[i] = alpha;
    this.color[i * 3] = r; this.color[i * 3 + 1] = g; this.color[i * 3 + 2] = b;
  }
  end() {
    this.geo.setDrawRange(0, this.count);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export class FX {
  constructor(scene, atm, water, { quality = 'high' } = {}) {
    this.scene = scene;
    this.atm = atm;
    this.water = water;
    this.time = 0;
    this.q = quality;
    this.camPos = new THREE.Vector3();
    this.drops = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.dropSprites = new Sprites(900, { fog: false, soft: 0.7 });
    this.smokeSprites = new Sprites(160, { fog: true, soft: 1.0 });
    this.dustSprites = new Sprites(500, { additive: true, fog: false, soft: 1.0 });
    this.flySprites = new Sprites(120, { additive: true, fog: false, soft: 1.0 });
    this.foamSprites = new Sprites(80, { fog: false, soft: 1.0 });
    for (const s of [this.dropSprites, this.smokeSprites, this.dustSprites, this.flySprites, this.foamSprites]) this.group.add(s.points);

    this.foams = [];
    this.smoke = [];
    this.smokeT = 0;
    this._initDust();
    this._initFireflies();
    this._initDragonflies();
    this._initBirds();
    this._initLeaves();
    this._initRain();
    this._initSnow();
    this.lightCol = new THREE.Color();
    this.smokeOrigin = null;
    this.ambT = 1;
  }

  // ---- 水しぶき ----
  splash(x, z, power = 1, y = 0.02) {
    const n = Math.floor(10 + 34 * power);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(0.3, 1.0) * (0.6 + power * 0.9);
      const vh = sp * rnd(0.3, 0.9);
      this.drops.push({
        x: x + Math.cos(a) * 0.05, y: y, z: z + Math.sin(a) * 0.05,
        vx: Math.cos(a) * vh, vy: rnd(1.2, 3.2) * (0.5 + power * 0.6), vz: Math.sin(a) * vh,
        size: rnd(0.012, 0.03) * (0.7 + power * 0.5), life: 2,
      });
    }
    // 白い泡の輪
    this.foams.push({ x, z, t: 0, size0: 0.15 * power, size1: 0.9 * power + 0.3, life: 0.9 });
    this.water.addRipple(x, z, 0.9 * power + 0.3);
    this.water.addRipple(x + rnd(-0.05, 0.05), z + rnd(-0.05, 0.05), 0.5 * power);
  }

  // ---- 細かな粒（花粉・ちり）----
  _initDust() {
    const N = this.q === 'low' ? 30 : 90;
    this.dust = Array.from({ length: N }, () => ({
      x: rnd(-14, 14), y: rnd(0.2, 8), z: rnd(-30, 5), ph: rnd(0, 10), s: rnd(0.012, 0.03),
    }));
  }

  _initFireflies() {
    const rng = mulberry32(333);
    this.fireflies = [];
    const N = this.q === 'low' ? 14 : 46;
    for (let i = 0; i < N; i++) {
      // 岸辺のススキの近く
      let x, z;
      for (let k = 0; k < 40; k++) {
        const a = rng() * TAU, r = 18 + rng() * 14;
        x = Math.cos(a) * r * 1.3; z = Math.sin(a) * r;
        const s = pondSigned(x, z);
        if (s > -1 && s < 8) break;
      }
      this.fireflies.push({ cx: x, cz: z, ph: rng() * 20, sp: 0.4 + rng() * 0.5, r: 1.2 + rng() * 2.5, h: 0.6 + rng() * 1.8, blink: 0.35 + rng() * 0.4 });
    }
  }

  // ---- トンボ ----
  _initDragonflies() {
    this.dragonflies = [];
    const N = this.q === 'low' ? 3 : 8;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8402a, roughness: 0.5, emissive: new THREE.Color(0.12, 0.02, 0.0) });
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xdfe6e8, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
    const bodyGeo = (() => {
      const g = new THREE.CylinderGeometry(0.0035, 0.0018, 0.075, 6, 1);
      g.rotateZ(Math.PI / 2);
      const h = new THREE.SphereGeometry(0.006, 6, 5);
      h.translate(0.04, 0, 0);
      const t = new THREE.SphereGeometry(0.0055, 6, 5);
      t.translate(0.025, 0.001, 0);
      return [g, h, t];
    })();
    const wingGeo = new THREE.PlaneGeometry(0.045, 0.011, 1, 1);
    wingGeo.translate(0, 0, 0.0225);
    wingGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo[0], bodyMat);
      const head = new THREE.Mesh(bodyGeo[1], bodyMat);
      g.add(body, head);
      const wings = [];
      for (const sx of [1, -1])
        for (const px of [0.018, 0.006]) {
          const w = new THREE.Mesh(wingGeo, wingMat);
          w.position.set(px, 0.002, 0);
          w.scale.z = sx;
          g.add(w);
          wings.push({ m: w, sx });
        }
      g.scale.setScalar(1.7);
      this.group.add(g);
      const a = rnd(0, TAU), r = rnd(6, 16);
      this.dragonflies.push({
        g, wings, pos: new THREE.Vector3(Math.cos(a) * r, rnd(0.8, 2.5), SHORE_Z - rnd(6, 24)),
        vel: new THREE.Vector3(), target: new THREE.Vector3(), t: 0, ph: rnd(0, 10), perch: 0,
      });
      this._dfTarget(this.dragonflies[i]);
    }
  }
  _dfTarget(d) {
    const a = rnd(0, TAU), r = rnd(2, 24);
    d.target.set(Math.cos(a) * r * 1.2, rnd(0.7, 3.2), SHORE_Z - rnd(5, 35) + Math.sin(a) * 8);
    d.t = rnd(0.6, 2.4);
  }

  // ---- 鳥の群れ ----
  _initBirds() {
    const n = 9;
    const geo = new THREE.BufferGeometry();
    // 胴 + 左右の翼（三角形）
    const pos = new Float32Array([
      0, 0, 0.5, 0, 0, -0.5, 0.18, 0.0, 0,       // 胴
      0, 0, 0.1, 0, 0, -0.2, 1.8, 0.0, 0.3,      // 右翼
      0, 0, 0.1, 0, 0, -0.2, -1.8, 0.0, 0.3,     // 左翼
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.birdMat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uCol: { value: new THREE.Color(0.01, 0.01, 0.015) }, ...THREE.UniformsLib.fog },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec2 iParam; // yaw, phase
        uniform float uTime;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          float fl = sin(uTime*7.0 + iParam.y) * 0.7;
          p.y += abs(p.x) * fl * 0.5;
          float cy = cos(iParam.x), sy = sin(iParam.x);
          p = vec3(p.x*cy - p.z*sy, p.y, p.x*sy + p.z*cy);
          p *= 4.0;
          vec4 mvPosition = viewMatrix * vec4(iPos + p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol;
        #include <fog_pars_fragment>
        void main(){
          gl_FragColor = vec4(uCol, 1.0);
          #include <fog_fragment>
        }`,
      side: THREE.DoubleSide,
      fog: true,
    });
    const ig = new THREE.InstancedBufferGeometry();
    ig.setAttribute('position', geo.attributes.position);
    this.birdPos = new Float32Array(n * 3);
    this.birdParam = new Float32Array(n * 2);
    ig.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.birdPos, 3).setUsage(THREE.DynamicDrawUsage));
    ig.setAttribute('iParam', new THREE.InstancedBufferAttribute(this.birdParam, 2).setUsage(THREE.DynamicDrawUsage));
    ig.instanceCount = n;
    this.birds = new THREE.Mesh(ig, this.birdMat);
    this.birds.frustumCulled = false;
    this.birds.visible = false;
    this.group.add(this.birds);
    this.birdFlock = { active: false, t: 0, next: 12, n, off: Array.from({ length: n }, (_, i) => [rnd(-18, 18), rnd(-6, 6), rnd(-12, 12), rnd(0, 6)]), dir: 1, z: -400, y: 160 };
  }

  // ---- 落ち葉 ----
  _initLeaves() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.5);
    shape.bezierCurveTo(0.25, 0.3, 0.3, -0.2, 0, -0.5);
    shape.bezierCurveTo(-0.3, -0.2, -0.25, 0.3, 0, 0.5);
    const lg = new THREE.ShapeGeometry(shape, 6);
    lg.rotateX(-Math.PI / 2);
    this.leafGeo = lg;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    this.leafMat = mat;
    // 秋は紅葉、春は桜の花びら（ピンク）、夏と冬は舞い落ちるものがない
    const palSeason = SEASON.fall === 'petals' ? ['#f6c9d6', '#fbe3ea', '#f1b6c8', '#fde9ef', '#f4d0dc', '#ffffff'] : ['#b9341b', '#d9612a', '#e3a82e', '#9c4a22', '#c4821e', '#8a9a3a'];
    const pal = palSeason.map((c) => new THREE.Color(c));
    // 水面に浮かぶ
    const nF = this.q === 'low' ? 20 : 60;
    this.floatLeaves = new THREE.InstancedMesh(lg, mat, nF);
    this.floatData = [];
    for (let i = 0; i < nF; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 40; k++) { x = i % 3 === 0 ? rnd(-14, 14) : rnd(-34, 34); z = i % 3 === 0 ? rnd(SHORE_Z - 18, SHORE_Z - 4) : rnd(-24, 24); if (pondSigned(x, z) < -1.5) break; }
      this.floatData.push({ x, z, r: rnd(0, TAU), s: rnd(0.07, 0.13), sp: rnd(0.3, 1), ph: rnd(0, 10) });
      this.floatLeaves.setColorAt(i, pal[i % pal.length].clone().multiplyScalar(rnd(0.5, 0.9)));
    }
    this.floatLeaves.receiveShadow = false;
    this.group.add(this.floatLeaves);
    // 舞い落ちる
    const nA = this.q === 'low' ? 16 : 56;
    this.airLeaves = new THREE.InstancedMesh(lg, mat, nA);
    this.airData = [];
    for (let i = 0; i < nA; i++) {
      this.airData.push(this._newAirLeaf());
      this.airLeaves.setColorAt(i, pal[i % pal.length].clone().multiplyScalar(rnd(0.6, 1.0)));
    }
    this.airLeaves.frustumCulled = false;
    this.group.add(this.airLeaves);
    this.fallOn = SEASON.fall !== 'none';
    this.floatLeaves.visible = this.airLeaves.visible = this.fallOn;
    this.petal = SEASON.fall === 'petals';
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }
  _newAirLeaf(spawnY) {
    const a = rnd(0, TAU), r = Math.sqrt(Math.random()) * 26;
    return { x: Math.cos(a) * r * 1.2, y: spawnY ?? rnd(2, 14), z: SHORE_Z - 8 + Math.sin(a) * r, rx: rnd(0, TAU), ry: rnd(0, TAU), rz: rnd(0, TAU), ph: rnd(0, 10), s: rnd(0.07, 0.12), v: rnd(0.35, 0.8) };
  }

  // ---- 雨 ----
  _initRain() {
    const n = this.q === 'low' ? 1200 : 3600;
    const pos = new Float32Array(n * 2 * 3);
    const seed = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = rnd(-22, 22), z = rnd(-22, 22), y = rnd(0, 24);
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        seed[o] = x; seed[o + 1] = y; seed[o + 2] = z;
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uLight: { value: new THREE.Color(0.7, 0.75, 0.8) }, uWind: G.uWind },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; attribute float aEnd;
        uniform float uTime; uniform vec3 uCam; uniform float uAmount; uniform vec2 uWind;
        varying float vA;
        void main(){
          float H = 24.0;
          float y = mod(aSeed.y - uTime * 15.0, H);
          vec3 base = vec3(aSeed.x, y, aSeed.z);
          // カメラ周りに巻き付ける
          base.xz = mod(base.xz - uCam.xz + 22.0, 44.0) - 22.0 + uCam.xz;
          base.y += uCam.y - 4.0 - 6.0;
          base.xz += uWind * (H - y) * 0.06;
          vec3 p = base + (aEnd > 0.5 ? vec3(uWind.x*0.06, 1.0, uWind.y*0.06) * 0.55 : vec3(0.0));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float vis = step(fract(aSeed.x*13.37 + aSeed.z*7.7), uAmount);
          vA = vis * (aEnd > 0.5 ? 0.0 : 1.0) * 0.5 + vis * (aEnd > 0.5 ? 0.22 : 0.0);
          if (vis < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; varying float vA;
        void main(){ gl_FragColor = vec4(uLight, vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 40;
    this.group.add(this.rain);
  }

  // ---- 雪 ----
  _initSnow() {
    const n = this.q === 'low' ? 4000 : 8000;
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { seed[i * 3] = rnd(-22, 22); seed[i * 3 + 1] = rnd(0, 22); seed[i * 3 + 2] = rnd(-22, 22); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.snowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uScale: { value: 800 }, uLight: { value: new THREE.Color(0.8, 0.85, 0.9) }, uWind: G.uWind },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uAmount; uniform float uScale; uniform vec2 uWind;
        varying float vA;
        void main(){
          float H = 22.0;
          float sp = 0.8 + fract(aSeed.x * 7.13) * 0.9;
          float y = mod(aSeed.y - uTime * sp, H);
          vec3 base = vec3(aSeed.x + sin(uTime * 0.6 + aSeed.z * 3.0) * 0.45 + uWind.x * (H - y) * 0.05, y, aSeed.z + cos(uTime * 0.5 + aSeed.x * 2.0) * 0.45 + uWind.y * (H - y) * 0.05);
          base.xz = mod(base.xz - uCam.xz + 22.0, 44.0) - 22.0 + uCam.xz;
          base.y += uCam.y - 4.0 - 6.0;
          vec4 mv = viewMatrix * vec4(base, 1.0);
          gl_Position = projectionMatrix * mv;
          float vis = step(fract(aSeed.x * 13.37 + aSeed.z * 7.7), uAmount);
          float size = 0.03 + fract(aSeed.z * 5.31) * 0.05;
          gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 1.6, 26.0);
          vA = vis * (0.55 + 0.35 * fract(aSeed.y * 3.7));
          if (vis < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.2, r) * vA;
          gl_FragColor = vec4(uLight, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.snow = new THREE.Points(g, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 41;
    this.snow.visible = false;
    this.group.add(this.snow);
  }

  update(dt, camera, time, quality) {
    this.time = time;
    const atm = this.atm;
    camera.getWorldPosition(this.camPos);
    const cam = this.camPos;
    const L = this.lightCol.copy(atm.u.uAmbient.value).multiplyScalar(0.55).add(atm.u.uSunLight.value.clone().multiplyScalar(0.28));
    const vh = window.innerHeight * (window.devicePixelRatio || 1);
    const scale = (vh * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    for (const s of [this.dropSprites, this.smokeSprites, this.dustSprites, this.flySprites, this.foamSprites]) {
      s.mat.uniforms.uScale.value = (this._renderH || vh) * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    }

    // 杭のまわりのちいさな波（水が寄せる）
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 1.2 + Math.random() * 2.2;
      const sx = Math.random() < 0.5 ? -1 : 1;
      const pz = PIER.zEnd + 0.1 + (Math.random() < 0.5 ? 0 : 1.9);
      this.water.addRipple(PIER.x + sx * (PIER.w / 2 + 0.04) + (Math.random() - 0.5) * 0.06, pz, 0.08 + Math.random() * 0.06);
    }

    // しぶき
    this.dropSprites.begin();
    const dl = this.dropSprites.mat.uniforms.uLight.value;
    dl.copy(atm.u.uAmbient.value).multiplyScalar(0.9).add(atm.u.uSunLight.value.clone().multiplyScalar(0.55)).addScalar(0.15);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.life -= dt;
      if (d.y < 0.0 && d.vy < 0) {
        if (Math.random() < 0.18) this.water.addRipple(d.x, d.z, 0.12);
        this.drops.splice(i, 1);
        continue;
      }
      if (d.life <= 0) { this.drops.splice(i, 1); continue; }
      this.dropSprites.add(d.x, d.y, d.z, d.size * 2.2, 0.85, 0.85, 0.92, 1.0);
    }
    this.dropSprites.end();

    // 泡
    this.foamSprites.begin();
    const fl = this.foamSprites.mat.uniforms.uLight.value;
    fl.copy(atm.u.uAmbient.value).multiplyScalar(0.7).add(atm.u.uSunLight.value.clone().multiplyScalar(0.3)).addScalar(0.1);
    for (let i = this.foams.length - 1; i >= 0; i--) {
      const f = this.foams[i];
      f.t += dt;
      const u = f.t / f.life;
      if (u >= 1) { this.foams.splice(i, 1); continue; }
      this.foamSprites.add(f.x, 0.04, f.z, lerp(f.size0, f.size1, Math.sqrt(u)), (1 - u) * (1 - u) * 0.35, 0.9, 0.95, 1.0);
    }
    this.foamSprites.end();

    // 煙
    if (this.smokeOrigin) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.5;
        this.smoke.push({ x: this.smokeOrigin.x + rnd(-0.2, 0.2), y: this.smokeOrigin.y, z: this.smokeOrigin.z + rnd(-0.2, 0.2), t: 0, life: rnd(14, 20), s0: rnd(0.8, 1.2), ph: rnd(0, 10) });
      }
      this.smokeSprites.begin();
      this.smokeSprites.mat.uniforms.uLight.value.copy(L).multiplyScalar(1.6);
      for (let i = this.smoke.length - 1; i >= 0; i--) {
        const s = this.smoke[i];
        s.t += dt;
        if (s.t > s.life) { this.smoke.splice(i, 1); continue; }
        const u = s.t / s.life;
        s.y += (0.9 - u * 0.4) * dt;
        s.x += (G.uWind.value.x * 0.9 + Math.sin(s.ph + s.t * 0.4) * 0.15) * dt;
        s.z += (G.uWind.value.y * 0.9) * dt;
        const a = Math.sin(u * Math.PI) * 0.16;
        this.smokeSprites.add(s.x, s.y, s.z, 1.2 + u * 6.0, a, 0.8, 0.8, 0.82);
      }
      this.smokeSprites.end();
    }

    // ちり・花粉（太陽のほうを向くと光る）
    this.dustSprites.begin();
    const night = atm.night;
    const sunVis = atm.u.uSunVis.value;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const toSun = fwd.dot(atm.sunDir);
    const glowK = (0.15 + 0.85 * Math.pow(Math.max(toSun, 0), 3)) * sunVis * (1 - atm.overcast * 0.6);
    if (glowK > 0.01 && atm.rain < 0.5) {
      for (const d of this.dust) {
        d.x += Math.sin(time * 0.3 + d.ph) * 0.12 * dt + G.uWind.value.x * 0.25 * dt;
        d.z += Math.cos(time * 0.27 + d.ph * 1.3) * 0.1 * dt + G.uWind.value.y * 0.25 * dt;
        d.y += Math.sin(time * 0.5 + d.ph * 2.0) * 0.08 * dt;
        // カメラ周りの箱でラップ
        const dx = ((d.x - cam.x + 15) % 30 + 30) % 30 - 15, dz = ((d.z - cam.z + 15) % 30 + 30) % 30 - 15;
        d.x = cam.x + dx; d.z = cam.z + dz;
        const dy = d.y - cam.y;
        if (d.y < 0.3) d.y += 8; if (d.y > 9) d.y -= 8.5;
        const tw = 0.6 + 0.4 * Math.sin(time * 2 + d.ph * 9);
        const c = atm.u.uSunCol.value;
        this.dustSprites.add(d.x, d.y, d.z, d.s * 5.0, 0.28 * glowK * tw, c.r * 1.1, c.g * 0.95, c.b * 0.75);
      }
    }
    this.dustSprites.end();

    // 蛍
    this.flySprites.begin();
    const ffAmt = smoothstep(2, -6, atm.sunElev) * (1 - atm.rain * 0.8) * SEASON.firefly;
    if (ffAmt > 0.02) {
      for (const f of this.fireflies) {
        const a = time * f.sp * 0.5 + f.ph;
        const x = f.cx + Math.sin(a) * f.r + Math.sin(a * 2.3) * 0.5;
        const z = f.cz + Math.cos(a * 0.8) * f.r;
        const y = Math.max(terrainHeight(x, z), 0) + f.h + Math.sin(a * 1.7) * 0.4;
        const b = Math.pow(Math.max(0, Math.sin(time * f.blink * 5 + f.ph * 7)), 3);
        this.flySprites.add(x, y, z, 0.2, b * ffAmt, 1.8, 2.6, 0.45);
        this.flySprites.add(x, y, z, 0.06, b * ffAmt, 3.5, 4.0, 1.4);
      }
    }
    this.flySprites.end();

    // トンボ
    const dfAmt = smoothstep(3, 14, atm.sunElev) * (1 - atm.rain);
    const dfShow = Math.ceil(this.dragonflies.length * SEASON.dragonfly);   // 秋は大ぜい、夏は少し、春と冬は出ない
    for (let di = 0; di < this.dragonflies.length; di++) {
      const d = this.dragonflies[di];
      d.g.visible = dfAmt > 0.2 && di < dfShow;
      if (!d.g.visible) continue;
      d.t -= dt;
      if (d.t <= 0) this._dfTarget(d);
      const to = d.target.clone().sub(d.pos);
      const dist = to.length();
      const sp = Math.min(5.0, 1.2 + dist * 1.6);
      d.vel.lerp(to.normalize().multiplyScalar(sp), 1 - Math.exp(-4 * dt));
      d.pos.addScaledVector(d.vel, dt);
      d.pos.y = Math.max(d.pos.y, Math.max(0.5, terrainHeight(d.pos.x, d.pos.z) + 0.5));
      d.g.position.copy(d.pos);
      const yaw = Math.atan2(-d.vel.z, d.vel.x);
      d.g.rotation.set(0, yaw, Math.atan2(d.vel.y, Math.hypot(d.vel.x, d.vel.z)) * 0.4);
      const flap = Math.sin(time * 31 + d.ph) * 0.55;
      d.wings.forEach((w, i) => {
        w.m.rotation.x = w.sx * (flap * (i % 2 ? -1 : 1) * 0.9);
      });
    }

    // 鳥
    const fl_ = this.birdFlock;
    const birdTime = atm.sunElev > -3 && atm.rain < 0.6;
    fl_.next -= dt;
    if (!fl_.active && fl_.next <= 0 && birdTime) {
      fl_.active = true; fl_.t = 0;
      fl_.dir = Math.random() < 0.5 ? 1 : -1;
      fl_.z = -rnd(280, 520);
      fl_.y = rnd(70, 180);
      fl_.next = rnd(70, 150);
      this.birds.visible = true;
    }
    if (fl_.active) {
      fl_.t += dt;
      const span = 900;
      const x = (-0.5 + fl_.t / 70) * span * fl_.dir;
      if (fl_.t > 70) { fl_.active = false; this.birds.visible = false; }
      for (let i = 0; i < fl_.n; i++) {
        const o = fl_.off[i];
        this.birdPos[i * 3] = x + o[0] * 2.2 + Math.sin(fl_.t * 0.4 + o[3]) * 6;
        this.birdPos[i * 3 + 1] = fl_.y + o[1] * 2 + Math.sin(fl_.t * 0.6 + o[3]) * 4;
        this.birdPos[i * 3 + 2] = fl_.z + o[2] * 2.2;
        this.birdParam[i * 2] = fl_.dir > 0 ? 0 : Math.PI;
        this.birdParam[i * 2 + 1] = o[3] * 3 + i;
      }
      this.birds.geometry.attributes.iPos.needsUpdate = true;
      this.birds.geometry.attributes.iParam.needsUpdate = true;
      this.birdMat.uniforms.uCol.value.setRGB(0.03, 0.03, 0.04).lerp(atm.u.uHorizon.value, 0.25);
    }

    // 水面の落ち葉
    const mm = this._m, qq = this._q, ee = this._e, ss = this._s, pp = this._p;
    const lightMul = clamp(0.5 + atm.daylight * 0.6, 0.5, 1.1);
    for (let i = 0; this.fallOn && i < this.floatData.length; i++) {
      const f = this.floatData[i];
      f.x += (G.uWind.value.x * 0.04 + Math.sin(time * 0.1 + f.ph) * 0.01) * dt * f.sp;
      f.z += (G.uWind.value.y * 0.04 + Math.cos(time * 0.13 + f.ph) * 0.01) * dt * f.sp;
      f.r += Math.sin(time * 0.2 + f.ph) * 0.05 * dt;
      if (pondSigned(f.x, f.z) > -0.8) {
        for (let k = 0; k < 20; k++) { f.x = rnd(-34, 34); f.z = rnd(-24, 24); if (pondSigned(f.x, f.z) < -2) break; }
      }
      ee.set(Math.sin(time * 0.8 + f.ph) * 0.03, f.r, Math.cos(time * 0.7 + f.ph) * 0.03);
      qq.setFromEuler(ee);
      ss.setScalar(f.s * 1.6);
      pp.set(f.x, 0.012, f.z);
      mm.compose(pp, qq, ss);
      this.floatLeaves.setMatrixAt(i, mm);
    }
    this.floatLeaves.instanceMatrix.needsUpdate = true;

    // 舞う葉
    for (let i = 0; this.fallOn && i < this.airData.length; i++) {
      const a = this.airData[i];
      a.y -= a.v * dt * (this.petal ? 0.55 : 1);
      a.x += (G.uWind.value.x * 0.6 + Math.sin(time * 0.9 + a.ph) * 0.4) * dt;
      a.z += (G.uWind.value.y * 0.6 + Math.cos(time * 0.8 + a.ph * 1.7) * 0.4) * dt;
      a.rx += dt * 1.3; a.ry += dt * 0.9; a.rz += dt * 1.1;
      const ground = Math.max(terrainHeight(a.x, a.z), 0);
      if (a.y < ground + 0.03) {
        if (pondSigned(a.x, a.z) < -1 && Math.random() < 0.7) this.water.addRipple(a.x, a.z, 0.05);
        Object.assign(a, this._newAirLeaf(rnd(9, 15)));
      }
      ee.set(a.rx, a.ry, a.rz);
      qq.setFromEuler(ee);
      ss.setScalar(a.s * (this.petal ? 1.0 : 1.8));
      pp.set(a.x, a.y, a.z);
      mm.compose(pp, qq, ss);
      this.airLeaves.setMatrixAt(i, mm);
    }
    this.airLeaves.instanceMatrix.needsUpdate = true;

    // 雨
    this.rainMat.uniforms.uAmount.value = atm.rain;
    this.rainMat.uniforms.uCam.value.copy(cam);
    this.rain.visible = !SEASON.snow && atm.rain > 0.02;
    // 冬は、雨のかわりに雪（粒がゆっくり舞い落ちる。水面にはあめの輪が出ない）
    this.snow.visible = SEASON.snow && atm.rain > 0.02;
    if (this.snow.visible) {
      const su = this.snowMat.uniforms;
      su.uAmount.value = atm.rain; su.uCam.value.copy(cam);
      su.uScale.value = (this._renderH || vh) * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      su.uLight.value.copy(atm.u.uAmbient.value).multiplyScalar(0.9).addScalar(0.45);
    }
    { const rc = this.rainMat.uniforms.uLight.value.copy(atm.u.uAmbient.value).multiplyScalar(0.9).addScalar(0.12); rc.r = Math.min(1, rc.r); rc.g = Math.min(1, rc.g); rc.b = Math.min(1, rc.b); }
    this.water.material.uniforms.uRain.value = SEASON.snow ? 0 : atm.rain;

    // 風
    const g = 0.7 + 0.5 * Math.sin(time * 0.31) + 0.25 * Math.sin(time * 0.83 + 1.7);
    G.uWind.value.set(0.9 * g + 0.15, 0.3 * g);
    atm.u.uWind.value.copy(G.uWind.value);
    this.water.material.uniforms.uRough.value = 0.28 + 0.35 * clamp(g * 0.5) + atm.overcast * 0.25 + atm.rain * 0.5;
  }
}
