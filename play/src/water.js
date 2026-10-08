// 水面：平面反射 + 解析的な波紋 + 水深による濁り/縁 + 雨粒の波紋
import * as THREE from 'three';
import { DEPTH_WIN } from './terrain.js';
import { makeWaterNormalMap } from './textures.js';
import { G } from './materials.js';

export const MAX_RIPPLES = 28;

export class Water {
  constructor(renderer, atm, depthTex, opts = {}) {
    this.renderer = renderer;
    this.atm = atm;
    this.reflScale = opts.reflScale ?? 0.5;
    this.rt = new THREE.WebGLRenderTarget(512, 288, {
      type: THREE.HalfFloatType,
      samples: Math.max(2, opts.samples ?? 4), // 低画質でも、映り込みの細い輪郭が荒れないよう最低限のMSAA
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.rt.texture.generateMipmaps = true;
    this.virtualCam = new THREE.PerspectiveCamera();
    this.texMat = new THREE.Matrix4();
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1000, 0));
    this.rippleHead = 0;
    this.normalMap = makeWaterNormalMap(256);
    this.hideInReflection = [];

    // 海（ひだまり浜）: opts.sea = { shallow, deep, plane: [幅, 奥行, 中心x, 中心z], outDepth }。ないときは沼
    const sea = opts.sea || null;
    this.sea = sea;
    const u = {
      uSea: { value: sea ? 1 : 0 },
      uShallow: { value: new THREE.Color(...(sea ? sea.shallow : [0, 0, 0])) },
      uDeepCol: { value: new THREE.Color(...(sea ? sea.deep : [0, 0, 0])) },
      uOutDepth: { value: sea ? sea.outDepth : 0 },
      uTide: { value: 0 },
      uSwell: { value: sea ? 1 : 0 },
      // 波（向きx, 向きz, 波長m, 高さm）。外海ではそのまま、浅い入り江の中では小さくなる
      uWaves: { value: (sea ? sea.waves : [[1, 0, 10, 0]]).map((w) => { const l = Math.hypot(w[0], w[1]) || 1; return new THREE.Vector4(w[0] / l, w[1] / l, w[2], w[3]); }) },
      uWaveK: { value: sea ? 1 : 0 },
      // 海の状態（x: うねりの大きさ, y: 風波の大きさ, z: 入り江に入りこむ波の割合, w: 白波の出やすさ）
      uWaveMix: { value: new THREE.Vector4(1, 1, 1, 0.5) },
      tReflect: { value: this.rt.texture },
      tNormal: { value: this.normalMap },
      tDepth: { value: depthTex },
      uTexMat: { value: this.texMat },
      uWin: { value: new THREE.Vector4(DEPTH_WIN.x0, DEPTH_WIN.z0, DEPTH_WIN.w, DEPTH_WIN.h) },
      uRipples: { value: this.ripples },
      uRough: { value: 0.35 }, // 風によるさざ波の強さ
      uRain: { value: 0 },
      uTime: G.uTime,
      uSunDir: atm.u.uSunDir,
      uSunCol: atm.u.uSunLight,
      uAmbient: atm.u.uAmbient,
      uSunVis: atm.u.uSunVis,
      uHorizon: atm.u.uHorizon,
      uNight: atm.u.uNight,
      uUnderColor: G.uUnderColor,
      uMoonDir: atm.u.uMoonDir,
      ...THREE.UniformsLib.fog,
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      defines: { MAXR: MAX_RIPPLES, NW: sea ? sea.waves.length : 1 },
    });
    const pl = sea && sea.plane ? sea.plane : [DEPTH_WIN.w, DEPTH_WIN.h, DEPTH_WIN.x0 + DEPTH_WIN.w / 2, DEPTH_WIN.z0 + DEPTH_WIN.h / 2];
    let geo;
    if (sea) {
      // 海: 桟橋のまわりほど細かい格子（遠くは粗く、水平線まで）。頂点を波で上下させる
      const N = 360, R = 2600, pos = [], idx = [];
      const m = (i) => { const u = (i / N) * 2 - 1; return Math.sign(u) * Math.pow(Math.abs(u), 2.2) * R; };
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(m(i), 0, m(j) + 8);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
    } else {
      geo = new THREE.PlaneGeometry(pl[0], pl[1], 1, 1);
      geo.rotateX(-Math.PI / 2);
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    if (!sea) this.mesh.position.set(pl[2], 0, pl[3]);
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';

    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._tmp = {
      cp: new THREE.Vector3(), rot: new THREE.Matrix4(), look: new THREE.Vector3(),
      tgt: new THREE.Vector3(), view: new THREE.Vector3(),
    };
  }

  // 映り込みの解像度は、画面の見た目の大きさ(CSSピクセル)から決める。
  // 自動調整で画面の解像度を下げても、映り込みまで荒くしない（細い木や岩の輪郭がちらつくため）。
  setSize(w, h, cssW = w, cssH = h) {
    const sc = Math.max(this.reflScale, Math.min(1, Math.sqrt(250000 / Math.max(1, cssW * cssH))));
    this.rt.setSize(Math.max(64, Math.floor(w * sc)), Math.max(64, Math.floor(h * sc)));
  }

  addRipple(x, z, amp = 1) {
    this.ripples[this.rippleHead].set(x, z, G.uTime.value, amp);
    this.rippleHead = (this.rippleHead + 1) % MAX_RIPPLES;
  }

  // 海の波で、水面に浮かぶ点（静かなときの位置 x, z）がどう動くか。シェーダの gerstner と同じ式。
  // out = { x, y, z: ずれ, sx, sz: 水面の傾き（dy/dx, dy/dz） }。沼では null
  waveAt(x, z, out = this._wv || (this._wv = { x: 0, y: 0, z: 0, sx: 0, sz: 0 })) {
    if (!this.sea) return null;
    const u = this.material.uniforms;
    const K = u.uWaveK.value, mix = u.uWaveMix.value, t = G.uTime.value;
    const W = DEPTH_WIN;
    const inWin = x >= W.x0 && x <= W.x0 + W.w && z >= W.z0 && z <= W.z0 + W.h;
    const depth = inWin && this.sea.depthAt ? Math.min(30, this.sea.depthAt(x, z)) : u.uOutDepth.value;
    const cp = this._tmp.cp;
    const fade = Math.hypot(x - cp.x, z - cp.z);
    const sm = (a, b, v) => { const q = Math.min(1, Math.max(0, (v - a) / (b - a))); return q * q * (3 - 2 * q); };
    const ws = u.uWaves.value, NW = ws.length;
    let dx = 0, dy = 0, dz = 0, gx = 0, gz = 0, J = 1;
    for (let i = 0; i < NW; i++) {
      const w = ws[i];
      const k = (Math.PI * 2) / w.z, c = Math.sqrt(9.8 / k);
      const minA = w.z < WIND_SEA ? 0.5 : Math.min(0.05 * mix.z, 0.5);
      let A = w.w * (w.z >= SWELL_MIN ? mix.x : mix.y) * (minA + (1 - minA) * sm(1.5, 13, depth)) * K;
      A /= 1 + fade / (w.z * 18);
      const Q = Math.min(A / Math.max(w.w, 1e-4), 1) / (k * Math.max(A, 1e-5) * NW);
      const f = k * (w.x * x + w.y * z - c * t) + i * 1.7;
      const cf = Math.cos(f), sf = Math.sin(f);
      dx += Q * A * w.x * cf; dz += Q * A * w.y * cf; dy += A * sf;
      gx += w.x * k * A * cf; gz += w.y * k * A * cf;
      J -= Q * k * A * sf;
    }
    const j = Math.max(J, 0.4);
    out.x = dx; out.y = dy; out.z = dz; out.sx = gx / j; out.sz = gz / j;
    return out;
  }

  // 反射パスを描画（水面メッシュは非表示）
  renderReflection(scene, camera) {
    const t = this._tmp;
    const renderer = this.renderer;
    const vc = this.virtualCam;
    camera.updateMatrixWorld();
    t.cp.setFromMatrixPosition(camera.matrixWorld);
    t.rot.extractRotation(camera.matrixWorld);
    t.look.set(0, 0, -1).applyMatrix4(t.rot).add(t.cp);
    // y=0 の平面で鏡映
    t.view.set(t.cp.x, -t.cp.y, t.cp.z);
    t.tgt.set(t.look.x, -t.look.y, t.look.z);
    vc.position.copy(t.view);
    vc.up.set(0, 1, 0).applyMatrix4(t.rot);
    vc.up.y *= -1;
    vc.lookAt(t.tgt);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.fov = camera.fov;
    vc.aspect = camera.aspect;
    vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();

    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(vc.projectionMatrix);
    this.texMat.multiply(vc.matrixWorldInverse);

    // 斜め近平面クリップ（水面より下を描かない）
    this._plane.set(new THREE.Vector3(0, 1, 0), -0.004);
    this._plane.applyMatrix4(vc.matrixWorldInverse);
    const cl = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vc.projectionMatrix;
    const q = this._q;
    q.x = (Math.sign(cl.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cl.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cl.multiplyScalar(2.0 / cl.dot(q));
    pm.elements[2] = cl.x;
    pm.elements[6] = cl.y;
    pm.elements[10] = cl.z + 1.0 - 0.003;
    pm.elements[14] = cl.w;

    const prevRT = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    this.mesh.visible = false;
    // 映り込みでだけ隠す。元の表示/非表示を覚えておき、描いたあとで元にもどす
    // （もともと非表示のもの＝いない鳥の群れや降っていない雨を、表示に変えてしまわないように）
    const hid = this._hidPrev || (this._hidPrev = []);
    hid.length = this.hideInReflection.length;
    for (let i = 0; i < hid.length; i++) { const o = this.hideInReflection[i]; hid[i] = o.visible; o.visible = false; }
    renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    this.mesh.visible = true;
    for (let i = 0; i < hid.length; i++) this.hideInReflection[i].visible = hid[i];
  }
}

// 波の式は、シェーダと Water.waveAt（うきを波に乗せる）の両方で同じにする
const SWELL_MIN = 20;   // これより長い波は「うねり」、短い波は「風波」
const WIND_SEA = 10;    // これより短い波は、入り江の中でも風でたつ（浅くてもあまり小さくならない）

const WAVES = /* glsl */ `
uniform vec4 uWaves[NW];
uniform float uWaveK;
uniform vec4 uWaveMix;
// 水深で波の高さをおさえる（長い波ほど、浅瀬で小さく。満ち潮やうねりの大きい日は、リーフをこえて入り江にも入る）
float waveAtt(float lambda, float depth){
  float minA = lambda < ${WIND_SEA.toFixed(1)} ? 0.5 : min(0.05 * uWaveMix.z, 0.5);
  return mix(minA, 1.0, smoothstep(1.5, 13.0, depth));
}
// Gerstner 波: 横ずれ(xz)・高さ(y)・法線の傾き(dHdx,dHdz)・とがり(J)
void gerstner(vec2 p, float t, float depth, float fadeDist, out vec3 disp, out vec2 grad, out float J, out float crest){
  disp = vec3(0.0); grad = vec2(0.0); J = 1.0; crest = 0.0;
  for(int i=0;i<NW;i++){
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.z;
    float c = sqrt(9.8 / k);
    float A = w.w * (w.z >= ${SWELL_MIN.toFixed(1)} ? uWaveMix.x : uWaveMix.y) * waveAtt(w.z, depth) * uWaveK;
    A *= 1.0 / (1.0 + fadeDist / (w.z * 18.0));
    // とがり: 波が高いほど波頭が尖る（重なって輪にならないよう上限）
    float Q = min(A / max(w.w, 1e-4), 1.0) / (k * max(A, 1e-5) * float(NW));
    float f = k * (dot(w.xy, p) - c * t) + float(i) * 1.7;
    float cf = cos(f), sf = sin(f);
    disp.xz += Q * A * w.xy * cf;
    disp.y += A * sf;
    grad += w.xy * k * A * cf;
    J -= Q * k * A * sf;
    crest += A * sf / max(w.w, 1e-4) * (w.w > 0.08 ? 1.0 : 0.0);
  }
}
`;

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vBase;
uniform float uSea, uTime, uOutDepth, uTide;
uniform sampler2D tDepth;
uniform vec4 uWin;
${WAVES}
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vBase = wp.xz;
  if(uSea > 0.5){
    vec2 duv = (wp.xz - uWin.xy) / uWin.zw;
    float inWin = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
    float depth = max(mix(uOutDepth, textureLod(tDepth, clamp(duv, 0.0, 1.0), 0.0).r + uTide, inWin), 0.0);
    vec3 d; vec2 gr; float J, cr;
    float dc = length(wp.xz - cameraPosition.xz);
    gerstner(wp.xz, uTime, depth, dc, d, gr, J, cr);
    wp.xyz += d;
  }
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec2 vBase;
uniform sampler2D tReflect, tNormal, tDepth;
uniform mat4 uTexMat;
uniform vec4 uWin;
uniform vec4 uRipples[MAXR];
uniform float uRough, uRain, uTime, uSunVis, uNight;
uniform float uSea, uOutDepth, uTide, uSwell;
uniform vec3 uShallow, uDeepCol;
${WAVES}
uniform vec3 uSunDir, uSunCol, uAmbient, uHorizon, uUnderColor, uMoonDir;
#include <fog_pars_fragment>

float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
}

// 同心円状の波紋イベントの勾配
vec2 rippleGrad(vec2 p, out float edge){
  vec2 g = vec2(0.0);
  edge = 0.0;
  for(int i=0;i<MAXR;i++){
    vec4 e = uRipples[i];
    float age = uTime - e.z;
    if(age < 0.0 || age > 7.0) continue;
    vec2 d = p - e.xy;
    float dist = length(d) + 1e-4;
    float front = (0.34 + 0.2*e.w) * pow(age, 0.82) + 0.01;
    float x = dist - front;
    float sig = 0.06 + 0.075*sqrt(age) + 0.03*e.w;
    float env = exp(-x*x/(sig*sig));
    if(env < 0.004) continue;
    float k = 24.0 / (1.0 + age*0.25);
    float A = 0.012 * e.w * exp(-age*0.62) / sqrt(1.0 + front*3.0);
    float dh = A*env*(k*cos(k*x) - 2.0*x/(sig*sig)*sin(k*x));
    // 発生直後の中心は少しもりあがる
    float core = exp(-dist*dist/0.04) * exp(-age*3.0) * e.w;
    g += (d/dist) * (dh - core*0.6*dist*8.0);
    edge += env * exp(-age*0.8) * 0.2 * e.w;
  }
  return g;
}

// 雨粒の波紋
vec2 rainGrad(vec2 p){
  vec2 g = vec2(0.0);
  for(int layer=0; layer<2; layer++){
    float sc = layer==0 ? 2.1 : 3.4;
    vec2 q = p*sc + float(layer)*17.3;
    vec2 cell = floor(q);
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
      vec2 c = cell + vec2(float(i), float(j));
      float h = hash21(c);
      if(h > uRain*0.9) continue;
      float ph = fract(uTime*(0.55+0.4*hash21(c+3.1)) + hash21(c+7.7));
      vec2 ctr = c + 0.2 + 0.6*vec2(hash21(c+1.3), hash21(c+5.9));
      vec2 d = q - ctr;
      float dist = length(d) + 1e-4;
      float rad = ph*0.55;
      float x = dist - rad;
      float env = exp(-x*x*260.0) * (1.0-ph)*(1.0-ph);
      float dh = env*(sin(x*60.0)*-520.0*x*0.04 + cos(x*60.0)*1.9);
      g += (d/dist) * dh * 0.020 * sc * 0.5;
    }
  }
  return g;
}

void main(){
  vec2 p = vWorld.xz;
  vec3 toCam = cameraPosition - vWorld;
  float distCam = length(toCam);
  vec3 V = toCam / distCam;

  // 風のさざ波（ゆっくり流れる3層）
  float patchN = 0.45 + 0.9 * vnoise(p*0.06 + vec2(uTime*0.01, 0.0));
  float calm = clamp(uRough * patchN, 0.0, 1.4);
  vec3 n1 = texture2D(tNormal, p*0.17 + vec2(uTime*0.010, uTime*0.006)).xyz*2.0-1.0;
  vec3 n2 = texture2D(tNormal, p*0.43 + vec2(-uTime*0.016, uTime*0.011)).xyz*2.0-1.0;
  vec3 n3 = texture2D(tNormal, p*1.35 + vec2(uTime*0.028, -uTime*0.019)).xyz*2.0-1.0;
  vec2 g = (n1.xy*0.55 + n2.xy*0.36 + n3.xy*0.22) * 0.11 * calm;

  float waveJ = 1.0, waveCrest = 0.0, waveH = 0.0;
  if(uSea > 0.5){
    // 波の傾きを、ピクセルごとに計算（頂点の動きと同じ式）
    g *= 0.55 / (1.0 + distCam*0.012);
    vec2 duv0 = (vBase - uWin.xy) / uWin.zw;
    float inW0 = step(0.0, duv0.x) * step(duv0.x, 1.0) * step(0.0, duv0.y) * step(duv0.y, 1.0);
    float dep0 = max(mix(uOutDepth, texture2D(tDepth, clamp(duv0, 0.0, 1.0)).r + uTide, inW0), 0.0);
    vec3 dd0; vec2 gr0;
    gerstner(vBase, uTime, dep0, distCam, dd0, gr0, waveJ, waveCrest);
    waveH = dd0.y;
    g += gr0 / max(waveJ, 0.25);
  }
  float edgeFx;
  g += rippleGrad(p, edgeFx);
  if(uRain > 0.01) g += rainGrad(p);

  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98*pow(1.0 - cosT, 5.0);

  // 反射（さざ波で縦に伸びる。遠いほど縦方向のゆらぎが大きい）
  vec4 rc = uTexMat * vec4(vWorld, 1.0);
  vec2 ruv = rc.xy / rc.w;
  vec3 camR = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec3 camF = normalize(vec3(-viewMatrix[0][2], 0.0, -viewMatrix[2][2]));
  float sx = dot(N.xz, camR.xz), sy = dot(N.xz, camF.xz);
  float kx = 0.55 / (1.0 + distCam*0.03);
  float ky = min(0.9 + distCam*0.055, 2.2);
  ruv += vec2(sx*kx, -sy*ky) * 0.45;
  ruv = clamp(ruv, vec2(0.006), vec2(0.994));
  // 遠いほど映り込みをぼかす（細い黒い点が、さざ波でちらつかないように）
  float bias = clamp(length(g)*9.0 + 0.3 + distCam*0.014, 0.0, 3.2);
  vec3 refl = texture2D(tReflect, ruv, bias).rgb;
  vec2 o = vec2(0.0012, 0.0016) * (1.0 + length(g)*22.0);
  o = min(o, min(ruv - 0.002, 0.998 - ruv));
  refl = refl*0.4 + 0.15*(
    texture2D(tReflect, ruv+vec2( o.x, o.y), bias).rgb + texture2D(tReflect, ruv+vec2(-o.x, o.y), bias).rgb +
    texture2D(tReflect, ruv+vec2( o.x,-o.y), bias).rgb + texture2D(tReflect, ruv+vec2(-o.x,-o.y), bias).rgb);

  // 水深
  vec2 duv = (p - uWin.xy) / uWin.zw;
  vec4 dd = texture2D(tDepth, clamp(duv, 0.0, 1.0));
  float inWin = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
  float depth = max(mix(uOutDepth, dd.r + uTide, inWin), 0.0);

  vec3 col; float alpha;
  if(uSea > 0.5){
    // 海: 浅いところは明るいターコイズ、ふかくなると群青。底が透けて見える（底の色は、地面のシェーダが水のなかで染める）
    float dmix = 1.0 - exp(-depth*0.16);
    vec3 light = uAmbient*0.7 + uSunCol*0.16 + vec3(0.003);
    vec3 bodyCol = mix(uShallow*light, uDeepCol*light, dmix);
    float sunSide = pow(max(dot(-V, uSunDir), 0.0), 3.0);
    bodyCol += vec3(0.04,0.1,0.1) * uSunCol * sunSide * 0.08 * (0.3 + dmix);
    float bodyA = clamp(0.05 + 0.8*(1.0 - exp(-depth*0.3)), 0.0, 1.0);
    // 岸とリーフの白い波（ひろがる泡）
    float lap = 0.5 + 0.5*sin(depth*7.0 - uTime*1.25 + vnoise(p*0.7)*5.0);
    float shoreW = smoothstep(0.45, 0.02, depth);
    float foam = shoreW * (0.25 + 0.75*vnoise(p*vec2(2.6, 3.4) + vec2(uTime*0.07, uTime*0.16)));
    foam *= 0.35 + 0.65*lap;
    foam += smoothstep(0.12, 0.0, depth) * 0.5;
    // リーフのふちで砕ける波（ゆっくり寄せては引く）
    float crest = smoothstep(1.6, 0.35, depth) * smoothstep(0.05, 0.3, depth) * mix(1.0, smoothstep(0.53, 0.47, dd.g), inWin);   // 入り江の中のサンゴの上では砕けない
    float surge = smoothstep(0.2, 0.9, 0.5 + 0.5*sin(uTime*0.62 + p.x*0.09 + vnoise(p*0.2)*6.0));
    foam += crest * (0.35 + 0.65*surge) * (0.4 + 0.6*vnoise(p*vec2(1.3, 2.6) + uTime*0.08)) * 1.3 * uSwell;
    // 白波: 波頭がとがって、くずれるところ（外海ほど多い）
    float cap = smoothstep(0.8, 0.4, waveJ) * (0.45 + 0.55*vnoise(p*vec2(1.7, 2.3) + uTime*0.2));
    cap *= smoothstep(0.3, 0.9, vnoise(p*0.13 + vec2(uTime*0.03, -uTime*0.02)) + 0.05 + 0.6*uWaveMix.w);
    foam += cap * 0.95;
    // 波頭のすけた光（太陽の側から見ると、波の山が明るい青緑に光る）
    bodyCol += vec3(0.0, 0.16, 0.14) * uSunCol * clamp(waveH*2.5 + 0.2, 0.0, 1.0) * (0.25 + sunSide) * 0.35;
    foam = clamp(foam, 0.0, 1.0);
    vec3 foamCol = vec3(0.95,0.98,1.0) * (uAmbient*0.7 + uSunCol*0.35);
    float F2 = F * 0.42;
    refl *= vec3(0.8, 0.93, 1.0);
    alpha = F2 + (1.0 - F2) * bodyA;
    col = refl*F2 + bodyCol*(1.0 - F2)*bodyA;
    col = col / max(alpha, 1e-3);
    col = mix(col, foamCol, foam*0.85);
    alpha = clamp(alpha + foam*0.8, 0.0, 1.0);
  } else {
  // 水の色：浅いところは黄緑がかった茶、深いところは濁った緑。
  // 水中の物体・底は自前で濁りの色に溶けるので、水面は反射を主役にして薄く重ねる。
  vec3 shallowCol = vec3(0.17, 0.2, 0.07);
  float dmix = 1.0 - exp(-depth*0.7);
  vec3 light = uAmbient*0.75 + uSunCol*0.12 + vec3(0.002);
  vec3 murk = uUnderColor * (uAmbient*0.9 + uSunCol*0.25);
  vec3 bodyCol = mix(shallowCol*light, murk, dmix);
  float sunSide = pow(max(dot(-V, uSunDir), 0.0), 3.0);
  bodyCol += vec3(0.05,0.07,0.02) * uSunCol * sunSide * 0.06 * (0.3 + dmix);

  float bodyA = clamp(0.08 + 0.2*(1.0 - exp(-depth*0.9)), 0.0, 1.0);

  // 岸のきわ：細かな泡/花粉の膜
  float shore = smoothstep(0.16, 0.0, depth);
  float film = shore * (0.35 + 0.65*vnoise(p*7.0 + uTime*0.05)) * smoothstep(0.1, 0.9, vnoise(p*1.6));
  vec3 filmCol = vec3(0.55,0.54,0.38) * (uAmbient*0.5 + uSunCol*0.12);

  alpha = F + (1.0 - F) * bodyA;
  col = refl*F + bodyCol*(1.0 - F)*bodyA;
  col = col / max(alpha, 1e-3);
  col = mix(col, filmCol, film*0.35);
  alpha = clamp(alpha + film*0.25, 0.0, 1.0);

  }

  // 波紋の頂点にうっすら空の照り返し
  col += uHorizon * edgeFx * 0.05 * (1.0 - F);

  // 太陽・月の「光の道」＋細かなきらめき
  vec3 Hs = normalize(V + uSunDir);
  vec2 hs = Hs.xz / max(Hs.y, 0.03);
  float sig = 0.045 + 0.09*calm;
  float broad = exp(-dot(hs,hs)/(2.0*sig*sig));
  vec2 dl = hs + g*1.0;
  float spark = exp(-dot(dl,dl)/(2.0*0.018*0.018)) * 0.55 / (1.0 + distCam*0.02);
  float shimmer = 0.55 + 0.9*vnoise(p*5.0 + vec2(uTime*0.4, -uTime*0.3));
  float glint = (broad*0.22*shimmer + spark*1.6) * uSunVis;
  col += uSunCol * glint * (0.25 + 0.75*F) * 1.2;
  vec3 Hm = normalize(V + uMoonDir);
  vec2 hm = Hm.xz / max(Hm.y, 0.03);
  float mb = exp(-dot(hm,hm)/(2.0*sig*sig))*0.2*shimmer + exp(-dot(hm+g,hm+g)/(2.0*0.010*0.010))*1.2;
  col += vec3(0.55,0.68,1.0) * mb * uNight * 1.4 * (0.25 + 0.75*F);

  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;
