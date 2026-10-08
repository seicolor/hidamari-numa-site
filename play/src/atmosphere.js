// 時刻・天候 → 空の色 / 太陽・月 / ライト / 霧 を決める。空ドームのシェーダも含む。
import { SEASON } from './season.js';
import * as THREE from 'three';
import { clamp, lerp, smoothstep, hexToLinear, damp } from './util.js';

const L = (hex, m = 1) => hexToLinear(hex).map((v) => v * m);
const DEG = Math.PI / 180;

// 太陽高度(度)ごとのキーフレーム
const KEYS = [
  { e: -24, zen: L(0x03060f), hor: L(0x0a1224), glow: L(0x201020), glowAmt: 0.0, sunCol: L(0xff5a22), sunI: 0, hemiSky: L(0x2c4478), hemiGnd: L(0x0e120e), hemiI: 0.95, rho: 0.0021, exposure: 1.7, cloudLit: L(0x1a2036), cloudDark: L(0x05070e) },
  { e: -10, zen: L(0x0b1330), hor: L(0x2a2a4e), glow: L(0x6a2a4a), glowAmt: 0.25, sunCol: L(0xff5a22), sunI: 0, hemiSky: L(0x2a3768), hemiGnd: L(0x0c0e0c), hemiI: 0.7, rho: 0.0022, exposure: 1.4, cloudLit: L(0x4a3558), cloudDark: L(0x0c1020) },
  { e: -4, zen: L(0x1a2a62), hor: L(0xb8606c, 1.1), glow: L(0xff4a2a), glowAmt: 0.85, sunCol: L(0xff4a18), sunI: 0.2, hemiSky: L(0x6a5a9a), hemiGnd: L(0x2a1a14), hemiI: 0.72, rho: 0.0023, exposure: 1.1, cloudLit: L(0xff6a4a, 1.3), cloudDark: L(0x3a3260) },
  { e: 1, zen: L(0x2a54a0), hor: L(0xff8a4a, 1.2), glow: L(0xff6a22, 1.2), glowAmt: 1.0, sunCol: L(0xff6a22), sunI: 1.5, hemiSky: L(0x9a86c0), hemiGnd: L(0x4a3322), hemiI: 0.85, rho: 0.0024, exposure: 1.08, cloudLit: L(0xffa070, 1.9), cloudDark: L(0x5a4a78) },
  { e: 7, zen: L(0x4079c0), hor: L(0xffc490, 1.0), glow: L(0xffa04a, 1.0), glowAmt: 0.75, sunCol: L(0xff9a48), sunI: 2.6, hemiSky: L(0x9ab6e6), hemiGnd: L(0x5a4a30), hemiI: 0.98, rho: 0.0022, exposure: 1.04, cloudLit: L(0xffc890, 1.8), cloudDark: L(0x7a7aa0) },
  { e: 18, zen: L(0x4585d2), hor: L(0xd2e0ec), glow: L(0xffd9a0), glowAmt: 0.3, sunCol: L(0xffd9a8), sunI: 3.3, hemiSky: L(0x9fc2f0), hemiGnd: L(0x5a5a3a), hemiI: 1.0, rho: 0.0019, exposure: 0.95, cloudLit: L(0xfff0dc, 1.5), cloudDark: L(0x8a9cc0) },
  { e: 40, zen: L(0x3a7bd0), hor: L(0xbcd8ec), glow: L(0xffe9c0), glowAmt: 0.1, sunCol: L(0xfff0dc), sunI: 3.8, hemiSky: L(0xa6c8f4), hemiGnd: L(0x5c5c3c), hemiI: 1.05, rho: 0.0017, exposure: 0.88, cloudLit: L(0xffffff, 1.4), cloudDark: L(0x92a6c8) },
  { e: 62, zen: L(0x3277d2), hor: L(0xb2d4ee), glow: L(0xfff0d0), glowAmt: 0.05, sunCol: L(0xfff4e4), sunI: 4.0, hemiSky: L(0xaacdf6), hemiGnd: L(0x5c5c3c), hemiI: 1.08, rho: 0.0016, exposure: 0.86, cloudLit: L(0xffffff, 1.4), cloudDark: L(0x98acce) },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpArr(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function sampleKeys(e) {
  if (e <= KEYS[0].e) return KEYS[0];
  if (e >= KEYS[KEYS.length - 1].e) return KEYS[KEYS.length - 1];
  let i = 0;
  while (e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(0, 1, (e - a.e) / (b.e - a.e));
  const o = {};
  for (const k of Object.keys(a)) {
    if (k === 'e') continue;
    o[k] = Array.isArray(a[k]) ? lerpArr(a[k], b[k], t) : lerp(a[k], b[k], t);
  }
  return o;
}

export function sunDirection(hour, out = new THREE.Vector3()) {
  // 日の出・日の入りは季節でかわる（夏は長く、冬は短い）。方位は日の出でも日の入りでもとぎれないようにつなぐ
  const { rise, set, maxEl } = SEASON.sun;
  const day = set - rise;
  let a, az;
  if (hour >= rise && hour <= set) {
    a = ((hour - rise) / day) * Math.PI;
    az = a + 0.35 * (a / Math.PI);
  } else {
    const t = ((hour - set + 24) % 24) / (24 - day);
    a = Math.PI + t * Math.PI;
    az = Math.PI + 0.35 + t * (Math.PI - 0.35);
  }
  const el = Math.sin(a) * maxEl * DEG;
  const c = Math.cos(el);
  return out.set(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c).normalize();
}

// ---------------------------------------------------------------------------
export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    this.hour = 17.3;
    this.overcast = 0; // 0..1
    this.targetOvercast = 0;
    this.rain = 0;
    this.targetRain = 0;
    this.timeScale = 0; // 時間の進み(時間/秒)
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.sunElev = 0;
    this.night = 0;
    this.daylight = 1;
    this.exposure = 1;
    this.mist = 0.4;
    this.rho = 0.002;

    this.u = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uGlowCol: { value: new THREE.Color() },
      uGlowAmt: { value: 0 },
      uSunCol: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudDark: { value: new THREE.Color() },
      uCover: { value: 0.5 },
      uCumulus: { value: (SEASON.sky && SEASON.sky.cumulus) || 0 },   // 1 = もこもこした積雲（浜の貿易風の雲）
      uNight: { value: 0 },
      uOvercast: { value: 0 },
      uSunVis: { value: 1 },
      // 水面や小物が参照する環境光
      uAmbient: { value: new THREE.Color() },
      uSunLight: { value: new THREE.Color() },
      uWind: { value: new THREE.Vector2(1, 0.3) },
      // 空の出来事（skyevents.js が動かす）: 流れ星・虹・稲光や花火のあかり
      uMetHead: { value: new THREE.Vector3(0, 1, 0) },
      uMetDir: { value: new THREE.Vector3(1, 0, 0) },
      uMetAmt: { value: 0 },
      uMetLen: { value: 0.2 },
      uRbDir: { value: new THREE.Vector3(0, 0, -1) },
      uRbR: { value: 0.52 },
      uRbAmt: { value: 0 },
      uFlash: { value: 0 },
      uFlashCol: { value: new THREE.Color(0.72, 0.8, 1) },
    };
    this.flash = 0;                                   // 稲光・花火のあかり（0〜）
    this.flashCol = new THREE.Color(0.72, 0.8, 1);
    this.thunder = 0;                                 // 雷のあとしばらく、ナマズなどが動く（0〜1）

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.hemi = new THREE.HemisphereLight(0x99bbff, 0x554433, 1);
    scene.add(this.sun, this.sun.target, this.hemi);
    this.fog = new THREE.Fog(0x99aabb, 0.002, 0.5);
    scene.fog = this.fog;

    this.horizonAt = new THREE.Color();
    this._lp = new THREE.Vector3();
    this.mesh = this._makeSky();
    scene.add(this.mesh);
    this.apply(0, null);
  }

  setWeather(kind) {
    this.targetOvercast = kind === 'clear' ? 0 : kind === 'cloudy' ? 0.7 : 1.0;
    this.targetRain = kind === 'rain' ? 1 : 0;
  }

  _makeSky() {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = position;
          mat4 vm = viewMatrix; vm[3] = vec4(0.0,0.0,0.0,1.0);
          vec4 p = projectionMatrix * vm * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: SKY_FRAG,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -1000;
    m.name = 'sky';
    return m;
  }

  // 現在カメラ方向の地平線の色（霧色に使う）
  skyHorizonColor(dir, out) {
    // 簡易: 地平線色に太陽側の光芒をわずかに混ぜる
    const u = this.u;
    out.copy(u.uHorizon.value);
    const hx = dir.x, hz = dir.z;
    const hl = Math.hypot(hx, hz) || 1;
    const sx = this.sunDir.x, sz = this.sunDir.z;
    const sl = Math.hypot(sx, sz) || 1;
    const sd = Math.max(0, (hx * sx + hz * sz) / (hl * sl));
    const g = Math.pow(sd, 3) * u.uGlowAmt.value * 0.38 * (1 - this.overcast * 0.7);
    out.r += u.uGlowCol.value.r * g * 0.5;
    out.g += u.uGlowCol.value.g * g * 0.5;
    out.b += u.uGlowCol.value.b * g * 0.5;
    return out;
  }

  update(dt, camera, time) {
    this.hour = (this.hour + this.timeScale * dt + 24) % 24;
    this.overcast = damp(this.overcast, this.targetOvercast, 0.5, dt);
    this.rain = damp(this.rain, this.targetRain, 0.4, dt);
    this.apply(time, camera);
  }

  apply(time, camera) {
    const u = this.u;
    sunDirection(this.hour, this.sunDir);
    {
      // 月: 夜のあいだ北寄りの空を弧を描いて渡る（水面に月の道ができる）
      const tn = (((this.hour - SEASON.sun.set + 24) % 24) / (24 - (SEASON.sun.set - SEASON.sun.rise))) % 2; // 日の入り→0, 日の出→1
      const el = Math.sin(Math.PI * clamp(tn, 0, 1)) * 34 * DEG + 8 * DEG;
      const az = Math.PI + 0.42 - (clamp(tn, 0, 1) - 0.5) * 0.9;
      this.moonDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    }
    const e = Math.asin(clamp(this.sunDir.y, -1, 1)) / DEG;
    this.sunElev = e;
    const k = sampleKeys(e);
    const oc = this.overcast;
    const grey = (c, a) => {
      const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
      return [lerp(c[0], l * 0.92, a), lerp(c[1], l * 0.96, a), lerp(c[2], l, a)];
    };
    // 朝は夕方よりも淡く冷たい色合いに
    const morn = smoothstep(12, 8, this.hour) * smoothstep(-14, -3, e);
    const kz = k.zen.slice(), kh = k.hor.slice(), kg = k.glow.slice(), kc = k.cloudLit.slice();
    if (morn > 0.01) {
      const lumH = kh[0] * 0.3 + kh[1] * 0.55 + kh[2] * 0.15;
      kz[0] *= 1 - 0.12 * morn; kz[2] *= 1 + 0.18 * morn;
      kh[0] = lerp(kh[0], lumH * 1.05 + 0.04, 0.4 * morn); kh[1] = lerp(kh[1], lumH * 0.95 + 0.03, 0.4 * morn); kh[2] = lerp(kh[2], lumH * 0.9 + 0.05, 0.3 * morn);
      kg[1] *= 1 + 0.25 * morn; kg[2] *= 1 + 0.35 * morn; kg[0] *= 1 - 0.12 * morn;
      kc[1] *= 1 + 0.1 * morn; kc[2] *= 1 + 0.25 * morn;
    }
    const zen = grey(kz, oc * 0.8).map((v) => v * (1 - oc * 0.25));
    const hor = grey(kh, oc * 0.7).map((v) => v * (1 - oc * 0.12));
    u.uZenith.value.setRGB(...zen);
    u.uHorizon.value.setRGB(...hor);
    u.uGlowCol.value.setRGB(...kg);
    u.uGlowAmt.value = k.glowAmt * (1 - oc * 0.75);
    u.uSunCol.value.setRGB(...k.sunCol);
    u.uCloudLit.value.setRGB(...grey(kc, oc * 0.5));
    u.uCloudDark.value.setRGB(...grey(k.cloudDark, oc * 0.6).map((v) => v * (1 - oc * 0.3)));
    u.uCover.value = clamp(lerp(0.52, 0.95, oc) + SEASON.sky.cloud, 0.3, 1);
    this.night = smoothstep(2, -12, e);
    this.daylight = smoothstep(-6, 8, e);
    u.uNight.value = this.night * (1 - oc * 0.85);
    u.uOvercast.value = oc;
    u.uSunVis.value = smoothstep(-1.5, 0.5, e) * (1 - oc * 0.92);
    u.uTime.value = time;
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);

    // 光源
    const sunI = k.sunI * (1 - oc * 0.82);
    const moonI = 0.55 * smoothstep(-2, -9, e) * (1 - oc * 0.6) * Math.max(0, this.moonDir.y * 1.4);
    let lp;
    if (sunI > 0.02 || e > -3) {
      lp = this._lp.copy(this.sunDir);
      this.sun.color.setRGB(...k.sunCol);
      this.sun.intensity = sunI * smoothstep(-3.5, 0.8, e);
    } else {
      lp = this._lp.copy(this.moonDir);
      this.sun.color.setRGB(0.55, 0.68, 1.0);
      this.sun.intensity = moonI * 2.2;
    }
    // 影がじわじわ這わないよう、光源の向きは少しずつ段階的に更新する
    if (!this._lastLp || this._lastLp.distanceTo(lp) > 0.0022) {
      this._lastLp = (this._lastLp || new THREE.Vector3()).copy(lp);
      this.sun.position.copy(lp).multiplyScalar(120).add(this.sun.target.position);
    }
    const hemiBoost = 1 + oc * 0.25;
    this.hemi.color.setRGB(...grey(k.hemiSky, oc * 0.5));
    this.hemi.groundColor.setRGB(...k.hemiGnd);
    this.hemi.intensity = k.hemiI * hemiBoost * (e < -8 ? 1 + 0.35 * this.moonDir.y : 1);

    u.uAmbient.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity);
    u.uSunLight.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);

    // 霧
    const morningMist = Math.exp(-Math.pow((this.hour - (SEASON.sun.rise - 0.2)) / 1.5, 2)) * 2.4;
    const eveningMist = Math.exp(-Math.pow((this.hour - (SEASON.sun.set + 0.8)) / 1.2, 2)) * 0.5;
    const nightMist = this.night * 0.35;
    this.mist = 0.35 + (morningMist + eveningMist + nightMist + oc * 0.5 + this.rain * 0.9) * (SEASON.sky.mistK ?? 1);
    this.rho = k.rho * (1 + oc * 0.55 + this.rain * 0.9) * SEASON.sky.haze;
    this.fog.near = this.rho;
    this.fog.far = this.mist;
    this.exposure = k.exposure * (1 + oc * 0.1) * SEASON.sky.exposure * (1 + this.flash * 0.5);
    u.uFlash.value = this.flash;
    u.uFlashCol.value.copy(this.flashCol);

    if (camera) {
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      this.skyHorizonColor(f, this.fog.color);
    } else {
      this.fog.color.copy(u.uHorizon.value);
    }
  }
}

// ---------------------------------------------------------------------------
const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform vec3 uSunDir, uMoonDir, uHorizon, uZenith, uGlowCol, uSunCol, uCloudLit, uCloudDark;
uniform float uGlowAmt, uNight, uCover, uOvercast, uSunVis, uCumulus;
uniform vec3 uMetHead, uMetDir, uRbDir, uFlashCol;
uniform float uMetAmt, uMetLen, uRbR, uRbAmt, uFlash;

float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash31(vec3 p){ p = fract(p*vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float s=0.0, a=0.5;
  mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){ s+=a*vnoise(p); p=m*p; a*=0.5; }
  return s;
}

vec4 clouds(vec3 d){
  if(d.y < 0.004) return vec4(0.0);
  vec2 uv = d.xz / (d.y*0.85 + 0.13);
  uv *= 0.5;
  uv += vec2(uTime*0.0035, uTime*0.0012);
  float n = fbm(uv*1.25);
  float thr = 1.0 - uCover;
  float dens = smoothstep(thr-0.10, thr+0.26, n);
  vec2 sd = normalize(uSunDir.xz + vec2(1e-4)) * 0.07;
  float n2 = fbm((uv + sd)*1.25);
  float thick = 0.0, base = 0.0, topk = 0.0;
  if(uCumulus > 0.0){
    // 積雲: ゆがめた雑音で、もこもこした塊に。ふちはくっきり、まん中は厚い
    vec2 w = vec2(fbm(uv*0.7 + 3.1), fbm(uv*0.7 + 7.7)) - 0.5;
    float nc = fbm(uv*1.6 + w*0.9) * 0.6 + fbm(uv*4.2 + w*1.6) * 0.4;
    float nc2 = fbm((uv + sd*0.8)*1.6 + w*0.9) * 0.6 + fbm((uv + sd*0.8)*4.2 + w*1.6) * 0.4;
    n = mix(n, nc + 0.04, uCumulus);
    n2 = mix(n2, nc2 + 0.04, uCumulus);
    dens = mix(dens, smoothstep(thr-0.02, thr+0.12, n), uCumulus);
    thick = smoothstep(thr+0.02, thr+0.3, n) * uCumulus;
    // 画面の少し上の点（空の投影では、中心へ寄る点）とくらべ、雲の下側（底）か上側（てっぺん）かを見る
    vec2 uvu = uv * 0.955;
    float nu = fbm(uvu*1.6 + w*0.9) * 0.6 + fbm(uvu*4.2 + w*1.6) * 0.4 + 0.04;
    base = clamp((nu - n) * 7.0, 0.0, 1.0) * uCumulus;
    topk = clamp((n - nu) * 7.0, 0.0, 1.0) * uCumulus;
  }
  float shade = clamp(0.55 + (n - n2)*5.5, 0.0, 1.0);
  shade = mix(shade, 0.55, uOvercast*0.6);
  // 厚いところは底が灰色にかげり、てっぺんとうすいふちは日に照らされて白い
  shade = clamp(shade - thick*0.3 - base*0.45 + topk*0.35 + (1.0 - thick)*dens*0.12*uCumulus, 0.0, 1.0);
  vec3 col = mix(uCloudDark, uCloudLit, shade);
  col *= 1.0 - base*0.22*(1.0 - uOvercast);
  float mu = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(mu, 5.0)*0.55 + pow(mu, 40.0)*1.4) * (1.0 - dens*0.55) * uSunVis;
  // 地平線側は空気遠近法で空色に溶ける
  float fade = smoothstep(0.0, 0.2, d.y);
  col = mix(uHorizon*0.9, col, smoothstep(0.0, 0.35, d.y));
  return vec4(col, dens * fade);
}

vec3 stars(vec3 d){
  vec3 p = d * 85.0;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash31(id);
  vec3 off = (vec3(hash31(id+1.7), hash31(id+5.3), hash31(id+9.1)) - 0.5) * 0.7;
  float dist = length(f - off);
  float on = step(0.955, h);
  float tw = 0.75 + 0.25*sin(uTime*(2.0+h*5.0) + h*80.0);
  float mag = pow(hash31(id+3.3), 3.0);
  vec3 tint = mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.7), hash31(id+7.7));
  float s = on * smoothstep(0.17, 0.0, dist) * (0.35 + 2.2*mag) * tw;
  // 天の川っぽい淡い帯
  float band = exp(-pow(dot(d, normalize(vec3(0.35,0.75,-0.55)))*3.2, 2.0));
  float cloud = fbm(d.xz*7.0 + d.y*5.0);
  vec3 mw = vec3(0.05,0.055,0.075) * band * (0.4+cloud*1.3);
  return tint * s + mw;
}

void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  // 太陽側の夕焼けの帯
  vec2 hd = normalize(d.xz + vec2(1e-5));
  vec2 sdh = normalize(uSunDir.xz + vec2(1e-5));
  float sd = max(dot(hd, sdh), 0.0);
  col += uGlowCol * uGlowAmt * (pow(sd, 3.0)*0.65 + pow(sd, 14.0)*0.9) * exp(-h*5.5);
  // 地平線のごく薄い帯
  col = mix(col, uHorizon, exp(-h*28.0)*0.5);
  if(d.y < 0.0) col = mix(uHorizon, uHorizon*0.6, clamp(-d.y*4.0, 0.0, 1.0));

  float mu = dot(d, uSunDir);
  float sunMask = uSunVis;
  // 太陽: 円盤 + ハロー
  float disc = smoothstep(0.99985, 0.99996, mu);
  col += uSunCol * disc * 16.0 * sunMask;
  col += uSunCol * (pow(max(mu,0.0), 1500.0)*3.0 + pow(max(mu,0.0), 120.0)*0.4 + pow(max(mu,0.0), 8.0)*0.2*uGlowAmt) * sunMask;

  // 星と月
  float nightAmt = uNight;
  vec4 cl = clouds(d);
  if(nightAmt > 0.01 && d.y > 0.0){
    col += stars(d) * nightAmt * smoothstep(0.0, 0.12, d.y) * (1.0 - cl.a);
  }
  if(nightAmt > 0.01){
    float mm = dot(d, uMoonDir);
    float R = 0.026;
    if(mm > 0.99){
      vec3 t1 = normalize(cross(uMoonDir, vec3(0.0,1.0,0.0)));
      vec3 t2 = cross(t1, uMoonDir);
      vec2 p = vec2(dot(d,t1), dot(d,t2)) / R;
      float r2 = dot(p,p);
      float edge = smoothstep(1.0, 0.94, r2);
      vec3 n = vec3(p, sqrt(max(1.0 - r2, 0.0)));
      float lit = clamp(dot(n, normalize(vec3(0.18, 0.12, 0.95))), 0.0, 1.0);
      float maria = fbm(p*2.3 + 4.0)*0.6 + fbm(p*7.0)*0.25;
      vec3 moon = vec3(1.25,1.2,1.05) * (0.55 + 0.6*lit) * (0.62 + 0.55*maria);
      col = mix(col, moon, edge * nightAmt * (1.0 - cl.a*0.8));
    }
    col += vec3(0.55,0.65,1.0) * (pow(max(mm,0.0), 220.0)*0.5 + pow(max(mm,0.0), 28.0)*0.08) * nightAmt;
  }

  // 流れ星: 頭の光点と、うしろにのびる尾
  if(uMetAmt > 0.001 && d.y > 0.0){
    float dh = dot(d, uMetHead);
    if(dh > 0.9){
      vec3 w = cross(uMetHead, uMetDir);
      float along = dot(d, uMetDir);
      float perp = dot(d, w);
      float tl = -along / max(uMetLen, 0.01);
      float line = step(0.0, tl) * step(tl, 1.0) * smoothstep(0.0034*(1.0 - 0.7*tl), 0.0, abs(perp)) * pow(1.0 - tl, 1.5);
      float head = smoothstep(0.0055, 0.0, length(vec2(along, perp)));
      col += vec3(0.8, 0.92, 1.2) * (line * 2.4 + head * 3.2) * uMetAmt * smoothstep(0.0, 0.08, d.y) * (1.0 - cl.a);
    }
  }

  // うろこ雲（高い層）
  if(d.y > 0.02){
    vec2 uv2 = d.xz / (d.y*0.7 + 0.2) * 1.3 + vec2(uTime*0.002, uTime*0.0008);
    float band = smoothstep(0.35, 0.8, fbm(uv2*0.22 + 7.0));
    vec2 w = uv2 * 5.0 + 1.3*vec2(fbm(uv2*1.4), fbm(uv2*1.4+9.0));
    float cell = vnoise(w);
    float puff = smoothstep(0.52, 0.8, cell) * band * (1.0 - uOvercast*0.7);
    puff *= smoothstep(0.02, 0.2, d.y) * (1.0 - cl.a*0.8);
    float mu2 = max(dot(d, uSunDir), 0.0);
    vec3 cc = mix(uCloudDark, uCloudLit, 0.6 + 0.4*smoothstep(0.3, 0.8, cell));
    cc += uSunCol * pow(mu2, 6.0) * 0.5 * uSunVis;
    col = mix(col, cc, puff * 0.62);
  }
  col = mix(col, cl.rgb, cl.a * 0.97);
  // 虹: 内がわが紫、外がわが赤。外にうすい副虹（色が逆）
  if(uRbAmt > 0.001){
    float ang = acos(clamp(dot(d, uRbDir), -1.0, 1.0));
    float W = 0.05;
    float u1 = (uRbR - ang) / W;
    float m1 = smoothstep(-0.12, 0.12, u1) * smoothstep(1.12, 0.88, u1);
    vec3 c1 = clamp(abs(fract(u1*0.78 + vec3(0.0, 0.6667, 0.3333))*6.0 - 3.0) - 1.0, 0.0, 1.0);
    float u2 = (ang - uRbR*1.2) / (W*1.2);
    float m2 = smoothstep(-0.12, 0.12, u2) * smoothstep(1.12, 0.88, u2) * 0.3;
    vec3 c2 = clamp(abs(fract(u2*0.78 + vec3(0.0, 0.6667, 0.3333))*6.0 - 3.0) - 1.0, 0.0, 1.0);
    float inside = smoothstep(uRbR, uRbR - 0.22, ang) * 0.05;
    float fadeR = smoothstep(-0.03, 0.05, d.y);
    col += (c1*m1 + c2*m2 + inside) * uRbAmt * fadeR * 0.5;
  }
  // 稲光・花火のあかり（雲があるほどよく光る）
  col += uFlashCol * uFlash * (0.3 + 0.7*cl.a) * (1.0 - 0.45*h);
  gl_FragColor = vec4(col, 1.0);
}
`;
