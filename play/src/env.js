// 空から作る環境マップ。濡れた魚・竿・ウキなどの光沢に空と太陽が映り込む。
import * as THREE from 'three';

export const ENV = { tex: null, mats: new Map() };

// マテリアルを環境マップの対象に登録
export function applyEnv(mat, intensity = 1) {
  mat.envMap = ENV.tex;
  mat.envMapIntensity = intensity;
  ENV.mats.set(mat, intensity);
  return mat;
}

export function releaseEnv(mat) {
  ENV.mats.delete(mat);
}

export class EnvProbe {
  constructor(renderer, atm, { size = 256, interval = 10 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.interval = interval;
    this.atm = atm;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = new THREE.Scene();
    const sky = new THREE.Mesh(atm.mesh.geometry, atm.mesh.material);
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.rt = null;
    this.lastHour = -99;
    this.lastOc = -1;
    this.lastT = -99;
  }

  update(time, force = false) {
    const a = this.atm;
    const hourMoved = Math.min(Math.abs(a.hour - this.lastHour), 24 - Math.abs(a.hour - this.lastHour));
    if (!force && this.rt && (time - this.lastT < this.interval || (hourMoved < 0.12 && Math.abs(a.overcast - this.lastOc) < 0.08))) return;
    this.lastT = time;
    this.lastHour = a.hour;
    this.lastOc = a.overcast;
    const prev = this.rt;
    const rt = this.pmrem.fromScene(this.scene, 0, 0.1, 10, { size: this.size });
    this.rt = rt;
    ENV.tex = rt.texture;
    for (const [m] of ENV.mats) {
      const first = m.envMap == null;
      m.envMap = rt.texture;
      if (first) m.needsUpdate = true;
    }
    if (prev) prev.dispose();
  }
}
