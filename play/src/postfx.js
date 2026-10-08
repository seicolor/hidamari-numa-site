// ポストプロセス：HDR → 光芒 → ブルーム → トーンマップ → カラーグレード(周辺減光・粒子)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GodRayShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.6) },
    uStrength: { value: 0 },
    uTint: { value: new THREE.Color(1, 0.8, 0.55) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength; uniform vec3 uTint;
    varying vec2 vUv;
    #define NS 26
    // NaN・無限大・極端に明るい値は、ブルームで画面全体にひろがって「一瞬まっ黒」になるので落とす
    vec3 safeC(vec3 c){
      if(any(isnan(c)) || any(isinf(c))) return vec3(0.0);
      return clamp(c, 0.0, 48.0);
    }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      base.rgb = safeC(base.rgb);
      if(uStrength < 0.002){ gl_FragColor = base; return; }
      vec2 d = (uSun - vUv) / float(NS) * 0.95;
      vec2 uv = vUv;
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      float jitter = fract(sin(dot(vUv, vec2(12.9898,78.233)))*43758.5453);
      uv += d * jitter;
      for(int i=0;i<NS;i++){
        uv += d;
        vec3 s = safeC(texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb);
        float l = dot(s, vec3(0.3,0.55,0.15));
        acc += s * smoothstep(1.1, 2.6, l) * decay;
        decay *= 0.955;
      }
      float dist = length(uSun - vUv);
      vec3 rays = acc / float(NS) * uStrength * uTint * (1.0 - smoothstep(0.25, 1.4, dist)*0.6);
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.018 },
    uWarm: { value: 0.0 },
    uAspect: { value: 1.6 },
    uRainLens: { value: 0 },
    uSat: { value: 1.05 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uWarm, uAspect, uRainLens, uSat;
    varying vec2 vUv;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // ごく軽い色収差
      float r2 = dot(c,c);
      vec2 ca = c * r2 * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - ca).b;
      // 彩度とコントラスト
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * 1.04 + 0.5;
      // 暖色/寒色のスプリットトーン
      col += vec3(0.03,0.012,-0.02) * uWarm * (0.3 + l);
      col += vec3(-0.012,0.0,0.03) * (1.0 - uWarm) * (1.0 - l) * 0.5;
      // 周辺減光
      vec2 v = vec2(c.x*uAspect*0.62, c.y);
      float vig = smoothstep(0.82, 0.18, length(v));
      col *= mix(1.0 - uVignette, 1.0, vig);
      // フィルム粒子
      float n = h21(uv*vec2(1920.0,1080.0) + fract(uTime)*61.0) - 0.5;
      col += n * uGrain * (1.0 - l*0.6);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, { bloom = true, godrays = true, samples = 4 } = {}) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(pr);
    this._pr = pr;
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.godray = new ShaderPass(GodRayShader);
    this.godray.enabled = godrays;
    this.composer.addPass(this.godray);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.7, 1.05);
    this.bloom.enabled = bloom;
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.camera = camera;
    this._v = new THREE.Vector3();
  }

  setSize(w, h) {
    // 自動調整や写真で、描画の解像度（ピクセル比）が変わったら、効果の下地もそれに合わせる
    const pr = this.renderer.getPixelRatio();
    if (this._pr !== pr) { this._pr = pr; this.composer.setPixelRatio(pr); }
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }

  setBloom(on) { this.bloom.enabled = on; }
  setGodrays(on) { this.godray.enabled = on; }

  update(atm, time) {
    // 太陽の画面位置と強度
    const v = this._v.copy(atm.sunDir).multiplyScalar(1000).add(this.camera.position).project(this.camera);
    const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const facing = Math.max(0, fwd.dot(atm.sunDir));
    const vis = atm.u.uSunVis.value;
    const low = 1 - Math.min(1, Math.max(0, (atm.sunDir.y - 0.02) / 0.35));
    this.godray.uniforms.uSun.value.set(sx, sy);
    this.godray.uniforms.uStrength.value = vis * Math.pow(facing, 1.5) * (0.35 + 0.65 * low) * 0.62;
    this.godray.uniforms.uTint.value.copy(atm.u.uSunCol.value).lerp(new THREE.Color(1, 1, 1), 0.25);
    this.grade.uniforms.uTime.value = time;
    this.grade.uniforms.uWarm.value = THREE.MathUtils.clamp(1 - atm.sunDir.y * 1.6, 0, 1) * (1 - atm.night);
    this.renderer.toneMappingExposure = atm.exposure;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
