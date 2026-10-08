// 図鑑用のサムネイルを実際の3Dモデルから生成する（魚拓にも、同じ描画を大きく使う）
import * as THREE from 'three';
import { SPECIES, SPECIES_ORDER } from './species.js';
import { createFishObject } from './fishmodels.js';
import { ENV } from './env.js';

// 図鑑・魚拓の魚は、時間や季節の空の色に左右されないよう、ニュートラルな環境マップで描く
let NEUTRAL = null;
function neutralEnv(renderer) {
  if (NEUTRAL) return NEUTRAL;
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(5, 24, 16);
  const pos = geo.attributes.position, col = [];
  const lo = new THREE.Color(0x6b5a40), hi = new THREE.Color(0xcfe0ff), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.lerpColors(lo, hi, Math.pow(pos.getY(i) / 10 + 0.5, 0.8)); col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.4), side: THREE.DoubleSide }));
  win.position.set(-2, 3, 3.5); win.lookAt(0, 0, 0); sc.add(win);
  const pm = new THREE.PMREMGenerator(renderer);
  NEUTRAL = pm.fromScene(sc, 0, 0.1, 10, { size: 128 }).texture;
  return NEUTRAL;
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x6b5a40, 1.15));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.8);
  key.position.set(-1.5, 2.2, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.0);
  rim.position.set(2, 0.5, -1.5);
  scene.add(rim);
}

// 種類ごとの見せ方（横から／上から）
function poseFish(g, sp) {
  if (sp.kind === 'newt') { g.rotation.set(-Math.PI / 2 + 0.25, 0, 0); g.rotation.y = 0.15; }
  else if (sp.kind === 'crayfish') { g.rotation.set(-Math.PI / 2 + 0.55, 0.0, 0); g.rotation.y = 0.1; }
  else if (sp.kind === 'boot') { g.rotation.set(0.15, 0.0, 0); g.rotation.y = 0.55; }
  else { g.rotation.set(0.12, 0.0, 0); g.rotation.y = 0.0; }
}

// 読み出したピクセル(線形・乗算済みアルファ)を、sRGB のキャンバスにする
function pixelsToCanvas(buf, W, H) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const sy = H - 1 - y;
    for (let x = 0; x < W; x++) {
      const si = (sy * W + x) * 4, di = (y * W + x) * 4;
      const a = buf[si + 3] / 255;
      for (let k = 0; k < 3; k++) {
        let v = buf[si + k] / 255;
        if (a > 0.001) v = v / a;
        v = Math.min(1, v * 1.0);
        v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        img.data[di + k] = Math.round(v * 255);
      }
      img.data[di + 3] = buf[si + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// 1種類の魚を、透明な背景の大きな絵として描く（魚拓の原画）
export function renderFishCanvas(renderer, sp, W = 1600, H = 1000) {
  const prevEnv = ENV.tex; ENV.tex = neutralEnv(renderer);
  try { return renderFishCanvasInner(renderer, sp, W, H); } finally { ENV.tex = prevEnv; }
}

function renderFishCanvasInner(renderer, sp, W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
  const scene = new THREE.Scene();
  addLights(scene);
  const asp = W / H;
  const cam = new THREE.OrthographicCamera(-0.525 * asp, 0.525 * asp, 0.525, -0.525, 0.1, 20);
  cam.position.set(0, 200, 5);
  const obj = createFishObject(sp, 100);
  const g = obj.group;
  const wrap = new THREE.Group();
  wrap.add(g);
  poseFish(g, sp);
  wrap.scale.setScalar(sp.thumb ? sp.thumb[0] : 0.9);
  const box = new THREE.Box3().setFromObject(wrap);
  wrap.position.sub(box.getCenter(new THREE.Vector3()));
  const size = box.getSize(new THREE.Vector3());
  const fit = Math.min(0.525 * asp * 2 * 0.94 / size.x, 0.525 * 2 * 0.9 / size.y, 1.4);
  wrap.scale.multiplyScalar(fit);
  wrap.position.multiplyScalar(fit);
  wrap.position.y += 200;
  scene.add(wrap);
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTM = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTM;
  rt.dispose();
  if (obj.dispose) obj.dispose();
  return pixelsToCanvas(buf, W, H);
}

export function makeThumbs(renderer) {
  const prevEnv = ENV.tex; ENV.tex = neutralEnv(renderer);
  try { return makeThumbsInner(renderer); } finally { ENV.tex = prevEnv; }
}

function makeThumbsInner(renderer) {
  const W = 800, H = 500;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
  const scene = new THREE.Scene();
  addLights(scene);
  const cam = new THREE.OrthographicCamera(-0.84, 0.84, 0.525, -0.525, 0.1, 20);
  cam.position.set(0, 200, 5);
  const out = {};
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTM = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  const buf = new Uint8Array(W * H * 4);
  for (const id of SPECIES_ORDER) {
    const sp = SPECIES[id];
    const obj = createFishObject(sp, 100);
    const g = obj.group;
    g.position.set(0, 100, 0);
    const wrap = new THREE.Group();
    wrap.add(g);
    g.position.set(0, 0, 0);
    poseFish(g, sp);
    const s = sp.thumb ? sp.thumb[0] : 0.9;
    wrap.scale.setScalar(s);
    const box = new THREE.Box3().setFromObject(wrap);
    const c = box.getCenter(new THREE.Vector3());
    wrap.position.sub(c);
    // 画面に収まるように
    const size = box.getSize(new THREE.Vector3());
    const fit = Math.min(1.5 / size.x, 0.92 / size.y, 1.4);
    wrap.scale.multiplyScalar(fit);
    wrap.position.multiplyScalar(fit);
    wrap.position.y += 200;
    scene.add(wrap);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    scene.remove(wrap);
    const cv = pixelsToCanvas(buf, W, H);
    const small = document.createElement('canvas');
    small.width = 400; small.height = 250;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cv, 0, 0, 400, 250);
    out[id] = small.toDataURL('image/png');
    if (obj.dispose) obj.dispose();
  }
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTM;
  rt.dispose();
  return out;
}
