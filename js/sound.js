// ページ全体の音。ゲームと同じ合成の仕組み（audio.js）を、時刻と季節に合わせて鳴らす。
import { setSeason } from './audio-shim.js';
import { world } from './world.js';

let a = null, on = false, t = 0, busy = null;
const KEY = 'hnm.sound';

export const sound = {
  get on() { return on; },
  get a() { return on && a && a.ready() ? a : null; },
  get remembered() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
  async enable() {
    if (on) return;
    on = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* なにもしない */ }
    if (!a) { const m = await import('./audio.js'); a = new m.Audio(); }   // 音の部品は、音を入れるときに読みこむ
    busy = a.init().then(() => {
      a.enabled = on;
      if (a.master) a.master.gain.setTargetAtTime(a.volume, a.ctx.currentTime, 0.4);
      if (a.ctx.state === 'suspended') return a.ctx.resume();
    });
    await busy;
  },
  async disable() {
    on = false;
    try { localStorage.setItem(KEY, '0'); } catch (e) { /* なにもしない */ }
    if (a && a.ctx) {
      a.enabled = false;
      a.master.gain.setTargetAtTime(0.0001, a.ctx.currentTime, 0.2);
      setTimeout(() => { if (!on && a.ctx.state === 'running') a.ctx.suspend(); }, 700);
    }
  },
  async toggle() { if (on) await sound.disable(); else await sound.enable(); return on; },
  setMix(k, v) { if (a) a.mix[k] = v ? 1 : 0; else (sound._mix ||= {})[k] = v ? 1 : 0; },
  setSeason(id) { setSeason(id); },
  // 毎フレーム: 空の状態（sky() の返り値）から、環境音の量を決める
  update(dt, k) {
    if (!on || !a || !a.enabled) return;
    if (sound._mix) { Object.assign(a.mix, sound._mix); sound._mix = null; }
    t += dt;
    if (t < 0.1) return;
    a.update(t, { atm: { sunElev: k.elev, night: k.night, rain: world.rain, overcast: 0.25 + world.rain * 0.5 }, wind: { length: () => 0.55 + 0.25 * Math.sin(performance.now() / 6000) }, near: 0 });
    t = 0;
  },
};

// タブが裏にまわったら、音はそっと止める
document.addEventListener('visibilitychange', () => {
  if (!a || !a.ctx || !on) return;
  if (document.hidden) { a.master.gain.setTargetAtTime(0.0001, a.ctx.currentTime, 0.15); setTimeout(() => { if (document.hidden && a.ctx.state === 'running') a.ctx.suspend(); }, 500); }
  else { a.ctx.resume().then(() => a.master.gain.setTargetAtTime(a.volume, a.ctx.currentTime, 0.4)); }
});
