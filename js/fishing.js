// ヒーローの小さな釣りあそび: 水面をクリックして糸をたらし、ウキが沈んだらクリックして合わせる。
import { BiteSim, drawFloat, drawLine, drawRod } from './bite.js';
import { SPECIES, BY_ID } from './species.js';
import { zukan } from './zukan.js';
import { sound } from './sound.js';
import { rnd, clamp, lerp, ease, easeOut, vibrate, coarse } from './util.js';
import { displaySeason, world } from './world.js';

const BASE = ['funa', 'koi', 'tanago', 'imori', 'dojo', 'zarigani', 'namazu', 'nishiki', 'boot'];
const SEASONAL = { spring: 'hibuna', summer: 'unagi', autumn: 'herabuna', winter: 'wakasagi' };
const RW = { 1: 4, 2: 2, 3: 1, 4: 0.5 };

function pick() {
  const ids = [...BASE, SEASONAL[displaySeason()], 'nushi'];
  const w = ids.map((id) => (id === 'boot' ? 0.45 : id === 'nushi' ? (world.rainT > 0.5 ? 0.35 : 0) : RW[BY_ID[id].rarity] ?? 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return BY_ID[ids[i]]; }
  return BY_ID.funa;
}
const sizeOf = (sp) => { const [a, b] = sp.cm; return Math.round(a + (b - a) * Math.pow(Math.random(), 1.7)); };

export function createFishing({ gl, frame, canvas, hit, hint, hintEl, log, onCatch }) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, hz = 0, tip = [0, 0], butt = [0, 0];
  let st = 'idle', t = 0, flyT = 0, reelT = 0;
  let bx = 0, by = 0, L = 30, sp = null, sim = null, cm = 0, caught = false, from = [0, 0], busy = false, pulse = 0;
  const api = { get state() { return st; }, release() { busy = false; }, resize };

  function resize() {
    const r = frame.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    hz = (1 - 0.44) * H;
    const portrait = W < 760;
    tip = portrait ? [W * 0.8, hz - H * 0.05] : [W * 0.9, hz - H * 0.075];
    butt = [W * 1.1, H * 1.1];
  }

  const setHint = (txt, on) => { hint.textContent = txt; hintEl.classList.toggle('is-active', !!on); };
  const say = (txt) => { log.textContent = txt; };
  setHint(coarse ? '水面をタップして、釣り糸をたらす' : '水面をクリックして、釣り糸をたらす');

  // 画面の位置 → 背景シェーダの水面に波紋
  const ripple = (x, y, s) => {
    gl.ripple(x / W, 1 - (y - scrollY) / innerHeight, s);
  };
  const Lat = (y) => lerp(15, 46, clamp((y - hz) / (H - hz)));

  function cast(x, y) {
    if (busy || st !== 'idle') return;
    bx = clamp(x, W * 0.08, W * 0.92); by = clamp(y, hz + H * 0.07, H * 0.93);
    L = Lat(by);
    sp = pick(); cm = sizeOf(sp); caught = false;
    from = [tip[0], tip[1]]; flyT = 0; st = 'fly';
    sound.a?.cast(0.5);
    setHint('…', true); say('');
  }

  function land() {
    ripple(bx, by, 1.2); sound.a?.splash(0.55, clamp((bx / W - 0.5) * 1.6, -0.8, 0.8));
    sim = new BiteSim(sp, { delay: rnd(1.5, 3.0) });
    st = 'float'; t = 0; pulse = 1.2;
    setHint('ウキを見つめて…', true); say('ウキが浮かびました。');
  }

  function startReel(withFish) {
    caught = withFish; from = [bx + (sim ? sim.dx : 0) * L / 0.11, by]; reelT = 0; st = 'reel';
    sound.a?.reelTick(1);
  }

  function strike() {
    if (!sim) return;
    if (sim.striking) {
      // 合わせ成功
      sound.a?.hook(); vibrate(40);
      ripple(bx, by, 1.5); sound.a?.splash(0.8, 0);
      startReel(true);
      setHint('…！', true);
    } else {
      startReel(false);
      setHint('まだ、早かったみたい', true); say('まだ早かったようです。ウキが沈んだら、すぐにクリックします。');
    }
  }

  function finish() {
    st = 'idle';
    if (caught) {
      const fresh = zukan.add(sp.id);
      sound.a?.catchJingle(sp.rarity); vibrate([30, 40, 60]);
      busy = true;
      say(`${sp.name}が釣れました。${cm}センチ。`);
      onCatch(sp, cm, fresh);
    } else {
      setHint(coarse ? '水面をタップして、釣り糸をたらす' : '水面をクリックして、釣り糸をたらす', false);
    }
  }

  function onHit(e) {
    if (busy) return;
    const r = frame.getBoundingClientRect();
    let x, y;
    if (e.detail === 0 && !e.clientX) { x = W * 0.5 + rnd(-0.12, 0.12) * W; y = hz + H * 0.2; }   // キーボード
    else { x = e.clientX - r.left; y = e.clientY - r.top; }
    if (st === 'idle') cast(x, y);
    else if (st === 'float') strike();
  }
  hit.addEventListener('click', onHit);

  api.update = (dt) => {
    if (!W) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    t += dt;
    // 竿（いつも、画面のすみに）
    const sway = [Math.sin(t * 0.9) * 1.2, Math.sin(t * 1.3 + 1) * 0.9];
    let nod = 0;
    if (st === 'float' && sim) nod = clamp(-sim.y, 0, 0.8) * 26;
    const tx = tip[0] + sway[0], ty = tip[1] + sway[1] + nod;
    drawRod(ctx, tx, ty, butt[0], butt[1], { w: Math.max(7, W * 0.0065), bend: nod * 0.4 });

    if (st === 'fly') {
      flyT += dt;
      const p = clamp(flyT / 0.72);
      const e = easeOut(p);
      const x = lerp(from[0], bx, e), y = lerp(from[1], by, e) - Math.sin(Math.PI * p) * H * 0.2;
      const l = lerp(14, L, e);
      drawLine(ctx, tx, ty, x, y - l, { sag: 0.02 });
      drawFloat(ctx, x, y + l, 0, { L: l, dpr });
      if (p >= 1) land();
    } else if (st === 'float' && sim) {
      const ev = sim.update(dt);
      for (const e of ev) {
        if (e.type === 'tick') {
          ripple(bx + sim.dx * (L / 0.11), by, 0.2 + e.amp * 3.2); sound.a?.nibble(e.snd); vibrate(e.vib || 8);
          setHint('ウキが動いた…まだ、まだ', true); say('ウキが、ちょんと動きました。');
        } else if (e.type === 'end') {
          ripple(bx, by, 0.6 + e.ripple * 0.6); sound.a?.bite(e.snd); vibrate(36);
          if (e.splash) sound.a?.splash(e.splash, 0);
          setHint('いま！ クリック！', true); say('ウキが沈みました。いま、クリックします。');
        } else if (e.type === 'gone') {
          startReel(false); setHint('逃げられた…', true); say('魚は逃げてしまいました。');
        }
      }
      pulse -= dt; if (pulse <= 0) { pulse = rnd(2.4, 3.6); ripple(bx, by, 0.16); }
      const k = L / 0.11;
      const cx = bx + sim.dx * k;
      const top = by - L - sim.y * k;
      drawLine(ctx, tx, ty, cx, Math.max(top, by - L * 1.2), { sag: 0.035, wob: Math.sin(t * 1.1) * 2 });
      drawFloat(ctx, bx, by, sim.y, { L, dx: sim.dx, dpr });
    } else if (st === 'reel') {
      reelT += dt;
      const p = clamp(reelT / 0.6), e = ease(p);
      const x = lerp(from[0], tx, e), y = lerp(from[1], ty, e) - Math.sin(Math.PI * p) * H * 0.1;
      drawLine(ctx, tx, ty, x, y - L * (1 - e), { sag: 0.015 });
      if (p < 0.92) drawFloat(ctx, x, y, 0, { L: L * (1 - e * 0.5), dpr });
      if (caught && p > 0.2 && p < 0.3 && reelT - dt <= 0.2 + 1e-6) ripple(from[0], from[1], 1.0);
      if (p >= 1) finish();
    }
  };
  return api;
}
