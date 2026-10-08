// 手続き的に生成するテクスチャ群
import * as THREE from 'three';
import { tileNoise, mulberry32, clamp, hash2 } from './util.js';

function fbmTile(x, y, period, oct = 5) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * tileNoise(x * f, y * f, period * f);
    norm += a;
    a *= 0.5;
    f *= 2;
  }
  return s / norm; // ~ -1..1
}

export function canvasTexture(w, h, draw, { repeat = false, srgb = true, aniso = 8, mip = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// 地面・葉の細かな粒状感（R: 粗い, G: 中, B: 細かい）
export function makeDetailTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const P = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const r = fbmTile(u * P, v * P, P, 4) * 0.5 + 0.5;
      const g = fbmTile(u * P * 2.7 + 11, v * P * 2.7 + 5, P * 2.7 | 0 || 1, 3) * 0.5 + 0.5;
      const b = hash2(x * 1.37 + 3, y * 2.11 + 7) * 0.6 + (fbmTile(u * 32, v * 32, 32, 2) * 0.5 + 0.5) * 0.4;
      const i = (y * size + x) * 4;
      data[i] = clamp(r) * 255;
      data[i + 1] = clamp(g) * 255;
      data[i + 2] = clamp(b) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// 水面の細波用ノーマルマップ（タイル可能）
export function makeWaterNormalMap(size = 256) {
  const P = 8;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size * P, v = y / size * P;
      // 少し尖った波（リッジ）を混ぜて水面らしく
      const a = fbmTile(u, v, P, 5);
      const r = 1 - Math.abs(fbmTile(u * 1.7 + 3.1, v * 1.7 + 8.2, P * 1.7 | 0 || 1, 3));
      h[y * size + x] = a * 0.7 + r * r * 0.5;
    }
  const data = new Uint8Array(size * size * 4);
  const S = 3.2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const hl = h[y * size + ((x - 1 + size) % size)];
      const hr = h[y * size + ((x + 1) % size)];
      const hu = h[((y - 1 + size) % size) * size + x];
      const hd = h[((y + 1) % size) * size + x];
      let nx = (hl - hr) * S, ny = (hu - hd) * S;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = 255 * (nz / l * 0.5 + 0.5);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// 古びた木材（桟橋・杭・小屋）
export function makeWoodTexture({ base = '#7b6244', dark = '#4b3a27', light = '#9d8461', planks = 1, size = 512 } = {}) {
  return canvasTexture(size, size, (g, w, h) => {
    const rnd = mulberry32(77);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const pw = w / planks;
    for (let p = 0; p < planks; p++) {
      const x0 = p * pw;
      const tone = (rnd() - 0.5) * 0.35;
      g.fillStyle = `rgba(${tone > 0 ? '255,240,210' : '20,12,6'},${Math.abs(tone) * 0.5})`;
      g.fillRect(x0, 0, pw, h);
      // 木目
      for (let i = 0; i < 90; i++) {
        const x = x0 + rnd() * pw;
        const wob = (rnd() - 0.5) * 6;
        g.strokeStyle = rnd() > 0.5 ? dark : light;
        g.globalAlpha = 0.05 + rnd() * 0.16;
        g.lineWidth = 0.6 + rnd() * 1.6;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + wob, h * 0.3, x - wob, h * 0.6, x + wob * 0.5, h);
        g.stroke();
      }
      g.globalAlpha = 1;
      // 節
      if (rnd() > 0.35) {
        const kx = x0 + rnd() * pw, ky = rnd() * h;
        for (let r = 9; r > 1; r -= 2) {
          g.strokeStyle = dark;
          g.globalAlpha = 0.18;
          g.beginPath();
          g.ellipse(kx, ky, r * 0.9, r * 2.0, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      // 板の継ぎ目
      g.fillStyle = 'rgba(15,10,5,0.55)';
      g.fillRect(x0, 0, 2, h);
    }
    // 汚れ・苔
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${60 + rnd() * 40},${70 + rnd() * 40},${40},${rnd() * 0.07})`;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, rnd() * 18 + 2, 0, 7);
      g.fill();
    }
  }, { repeat: true });
}

// 茅葺き屋根
export function makeThatchTexture(size = 512) {
  return canvasTexture(size, size, (g, w, h) => {
    const rnd = mulberry32(31);
    g.fillStyle = '#6d5a35';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * w, y = rnd() * h;
      const len = 30 + rnd() * 90;
      const hue = 36 + rnd() * 10;
      const l = 22 + rnd() * 30;
      g.strokeStyle = `hsla(${hue},${34 + rnd() * 22}%,${l}%,${0.35 + rnd() * 0.4})`;
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 6, y + len);
      g.stroke();
    }
    // 横の結い目
    for (let y = 40; y < h; y += 64) {
      g.fillStyle = 'rgba(30,22,10,0.25)';
      g.fillRect(0, y, w, 3);
    }
    // 苔と古び
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(70,90,40,${rnd() * 0.12})`;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, 10 + rnd() * 40, 0, 7);
      g.fill();
    }
  }, { repeat: true });
}

// 土壁・漆喰の壁
export function makePlasterTexture(size = 256, tint = '#e6dcc4') {
  return canvasTexture(size, size, (g, w, h) => {
    const rnd = mulberry32(5);
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,250' : '90,75,50'},${rnd() * 0.06})`;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, rnd() * 5 + 1, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 24; i++) {
      const g2 = g.createLinearGradient(0, 0, 0, h);
      const x = rnd() * w;
      g.strokeStyle = `rgba(70,60,40,${0.05 + rnd() * 0.08})`;
      g.lineWidth = 2 + rnd() * 4;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (rnd() - 0.5) * 20, h);
      g.stroke();
    }
  }, { repeat: true });
}

// 黒い瓦屋根
export function makeTileTexture(size = 256) {
  return canvasTexture(size, size, (g, w, h) => {
    const rnd = mulberry32(8);
    g.fillStyle = '#2b2d33';
    g.fillRect(0, 0, w, h);
    const cols = 8, rows = 12;
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = r * rh;
        const gr = g.createLinearGradient(0, y, 0, y + rh);
        const l = 34 + rnd() * 14;
        gr.addColorStop(0, `rgb(${l - 8},${l - 6},${l})`);
        gr.addColorStop(0.75, `rgb(${l + 14},${l + 15},${l + 22})`);
        gr.addColorStop(1, `rgb(${l - 14},${l - 14},${l - 8})`);
        g.fillStyle = gr;
        g.fillRect(x + 1, y, cw - 2, rh);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(x, y, 2, rh);
      }
  }, { repeat: true });
}

// 立て看板用
export function makeSignTexture(text, sub) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#c9b184';
    g.fillRect(0, 0, w, h);
    const rnd = mulberry32(91);
    for (let i = 0; i < 80; i++) {
      g.strokeStyle = `rgba(80,55,25,${0.05 + rnd() * 0.1})`;
      g.lineWidth = 1 + rnd() * 2;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 10, w * 0.7, y + (rnd() - 0.5) * 10, w, y + (rnd() - 0.5) * 6);
      g.stroke();
    }
    g.strokeStyle = 'rgba(40,25,10,0.55)';
    g.lineWidth = 8;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#2a1c10';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 104px "Shippori Mincho","Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';
    g.fillText(text, w / 2, h * 0.42);
    g.font = '600 38px "Shippori Mincho","Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';
    g.fillText(sub, w / 2, h * 0.78);
  }, { repeat: false });
}
