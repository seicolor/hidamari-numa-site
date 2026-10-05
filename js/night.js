// 夜のひとこま: 電気ウキ・ほたる・花火・流れ星（2D キャンバスを、夜の背景シェーダの上に重ねる）
import { rnd, clamp, lerp, easeOut, reduced, coarse } from './util.js';
import { sound } from './sound.js';
import { displaySeason } from './world.js';
import { drawFloat } from './bite.js';

const PALETTES = [[255, 214, 120], [255, 150, 170], [140, 230, 215], [190, 170, 255], [255, 190, 110], [150, 200, 255]];
const WISHES = ['よく釣れますように', 'ぼんやり、いい一日になりますように', '沼のぬしに会えますように', 'あしたも、晴れますように', 'おじいさんが、元気でありますように', '虫の声が、ずっと聴こえますように', '大きなコイが、かかりますように'];
const FIREFLY = { spring: 0.4, summer: 1, autumn: 0.55, winter: 0 };

export function createNight({ frame, canvas, btnFw, btnMeteor, wishEl }) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, hz = 0;
  const shells = [], sparks = [], flies = [], meteors = [];
  let visible = false, last = 0, floatT = 0, mouse = { x: -1, y: -1, on: false }, wishT = 0;
  const api = { set visible(v) { visible = v; }, get visible() { return visible; }, resize };

  function resize() {
    const r = frame.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    hz = (1 - 0.44) * H;
    const n = Math.round(clamp(W / 40, 12, 40));
    while (flies.length < n) flies.push({ x: rnd(0, W), y: rnd(hz * 0.7, H * 0.95), a: rnd(0, 6.28), ph: rnd(0, 6.28), sp: rnd(0.3, 0.8), sz: rnd(1.4, 2.6), seed: rnd(0, 100) });
  }

  function launch(x) {
    const sx = x ?? rnd(W * 0.18, W * 0.82);
    shells.push({ x: sx, y: hz + H * 0.02, vy: -rnd(H * 0.55, H * 0.78), t: 0, ty: rnd(H * 0.1, hz * 0.55), pal: PALETTES[Math.floor(Math.random() * PALETTES.length)], kind: Math.random() < 0.3 ? 'willow' : Math.random() < 0.5 ? 'ring' : 'peony', trail: [] });
    sound.a?.fwLaunch(0, clamp((sx / W - 0.5) * 1.6, -0.9, 0.9));
  }
  function burst(s) {
    const n = s.kind === 'ring' ? 70 : s.kind === 'willow' ? 90 : 120;
    const sp = rnd(120, 190) * (W < 700 ? 0.7 : 1);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd(-0.03, 0.03), v = sp * (s.kind === 'ring' ? 1 : rnd(0.35, 1));
      if (s.kind === 'ring' && i % 2) v *= 0.55;
      sparks.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, dec: s.kind === 'willow' ? rnd(0.28, 0.4) : rnd(0.55, 0.9), g: s.kind === 'willow' ? 60 : 90, c: s.pal, tr: [] });
    }
    sound.a?.boom(0.05 + (1 - s.y / hz) * 0.1, 0.8 + Math.random() * 0.5, clamp((s.x / W - 0.5) * 1.6, -0.9, 0.9));
    // 水面にほんのり映る光
    api.flash = 0.35; api.flashC = s.pal; api.flashX = s.x;
  }

  function meteor() {
    meteors.push({ x: rnd(W * 0.5, W * 0.95), y: rnd(H * 0.04, H * 0.22), t: 0, len: rnd(W * 0.18, W * 0.3), dur: rnd(0.9, 1.3) });
    sound.a?.wish();
    wishT = 4.2; wishEl.textContent = WISHES[Math.floor(Math.random() * WISHES.length)]; setTimeout(() => wishEl.classList.add('on'), 700);
  }

  btnFw.addEventListener('click', (e) => { e.stopPropagation(); for (let i = 0; i < 3; i++) setTimeout(() => launch(), i * 380); });
  btnMeteor.addEventListener('click', (e) => { e.stopPropagation(); meteor(); });
  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    const r = frame.getBoundingClientRect();
    if (e.clientY - r.top > hz * 0.98) return;       // 水面より上（空）をおしたら、花火
    if (performance.now() - last < 260) return; last = performance.now();
    launch(e.clientX - r.left);
  });
  frame.addEventListener('pointermove', (e) => { const r = frame.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true; });
  frame.addEventListener('pointerleave', () => { mouse.on = false; });

  api.update = (dt) => {
    if (!visible) return;
    if (!W) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const fdt = reduced ? 0 : dt;
    floatT += fdt;
    const season = displaySeason(), fireflyAmt = FIREFLY[season];
    ctx.globalCompositeOperation = 'lighter';

    // --- 電気ウキ（右下の水面） ---
    const fx = W * (W < 760 ? 0.72 : 0.76), fy = hz + (H - hz) * 0.5, L = W < 760 ? 34 : 46;
    const bob = Math.sin(floatT * 1.5) * 0.004 + Math.sin(floatT * 2.7) * 0.002;
    // 水面に映る、縦にのびた光
    for (let i = 0; i < 3; i++) {
      const w = L * (0.32 + i * 0.3), a = 0.22 - i * 0.06;
      const g = ctx.createLinearGradient(0, fy, 0, H);
      g.addColorStop(0, `rgba(255,170,70,${a})`); g.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, fy + (H - fy) * 0.5, w * (1 + Math.sin(floatT * 2 + i) * 0.06), (H - fy) * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    const halo = ctx.createRadialGradient(fx, fy - L * 0.8, 0, fx, fy - L * 0.8, L * 4);
    halo.addColorStop(0, 'rgba(255,190,100,.28)'); halo.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = halo; ctx.fillRect(fx - L * 4, fy - L * 5, L * 8, L * 8);
    ctx.globalCompositeOperation = 'source-over';
    drawFloat(ctx, fx, fy, bob, { L, led: true, dpr });
    ctx.globalCompositeOperation = 'lighter';
    // 水面のやわらかい輪
    for (let i = 0; i < 3; i++) {
      const p = ((floatT * 0.35 + i / 3) % 1), r = L * (0.5 + p * 4.5);
      ctx.strokeStyle = `rgba(255,200,130,${(1 - p) * 0.35})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // --- ほたる ---
    if (fireflyAmt > 0) {
      const n = Math.round(flies.length * fireflyAmt);
      for (let i = 0; i < n; i++) {
        const f = flies[i];
        f.a += (Math.sin(floatT * 0.7 + f.seed) * 1.2 + Math.cos(floatT * 0.43 + f.seed * 2) * 0.9) * fdt;
        let vx = Math.cos(f.a) * f.sp * 38, vy = Math.sin(f.a) * f.sp * 26;
        // 電気ウキの光と、ポインタにすこし寄る
        const tx = mouse.on ? mouse.x : fx, ty = mouse.on ? mouse.y : fy - L;
        const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) + 1;
        const pull = (mouse.on ? 0.09 : 0.05) * clamp(1 - d / (W * 0.7));
        vx += dx / d * 60 * pull * 10; vy += dy / d * 60 * pull * 10;
        f.x += vx * fdt; f.y += vy * fdt;
        if (f.x < -20) f.x = W + 20; if (f.x > W + 20) f.x = -20;
        f.y = clamp(f.y, hz * 0.55, H * 0.98);
        const blink = Math.pow(Math.max(0, Math.sin(floatT * (0.9 + f.sp) + f.ph)), 3);
        const al = 0.12 + blink * 0.88;
        const r = f.sz * (8 + blink * 10);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(220,255,130,${al})`); g.addColorStop(0.25, `rgba(190,255,110,${al * 0.35})`); g.addColorStop(1, 'rgba(160,255,90,0)');
        ctx.fillStyle = g; ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
        // 水面にうつる
        if (f.y < hz + 2) { const ry = 2 * hz - f.y, gg = ctx.createRadialGradient(f.x, ry, 0, f.x, ry, r * 0.9); gg.addColorStop(0, `rgba(200,255,130,${al * 0.22})`); gg.addColorStop(1, 'rgba(160,255,90,0)'); ctx.fillStyle = gg; ctx.fillRect(f.x - r, ry - r, r * 2, r * 2); }
      }
    }

    // --- 花火 ---
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.t += dt; s.y += s.vy * dt; s.vy += H * 0.45 * dt; s.trail.push([s.x, s.y]); if (s.trail.length > 14) s.trail.shift();
      ctx.strokeStyle = 'rgba(255,230,180,.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); s.trail.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      if (s.vy > -H * 0.08 || s.y < s.ty) { burst(s); shells.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.vx *= 1 - 1.6 * dt; p.vy = p.vy * (1 - 1.6 * dt) + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.dec * dt;
      p.tr.push([p.x, p.y]); if (p.tr.length > 7) p.tr.shift();
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      const a = p.life * p.life, c = p.c;
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * 0.8})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); p.tr.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`; ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
      // 水面
      if (p.y < hz) { const ry = 2 * hz - p.y; ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * 0.22})`; ctx.fillRect(p.x - 1, ry - 0.5, 2, 1.4); }
    }
    if (api.flash > 0.01) {
      const c = api.flashC; api.flash *= Math.pow(0.02, dt);
      const g = ctx.createRadialGradient(api.flashX, hz, 0, api.flashX, hz, W * 0.5);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${api.flash * 0.35})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // --- 流れ星 ---
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.t += dt;
      const p = m.t / m.dur; if (p >= 1.15) { meteors.splice(i, 1); continue; }
      const e = easeOut(clamp(p)), ax = -0.82, ay = 0.57;
      const hx = m.x + ax * W * 0.55 * e, hy = m.y + ay * W * 0.55 * e;
      const a = Math.sin(Math.PI * clamp(p)) ;
      const g = ctx.createLinearGradient(hx, hy, hx - ax * m.len, hy - ay * m.len);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(180,210,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ax * m.len, hy - ay * m.len); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, 7); ctx.fill();
    }
    if (wishT > 0) { wishT -= dt; if (wishT <= 0) wishEl.classList.remove('on'); }
    ctx.globalCompositeOperation = 'source-over';
  };
  api.launch = launch; api.meteor = meteor;
  return api;
}
