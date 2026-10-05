// 魚の図鑑カード: ウキの動きの見本・横スクロール・釣った印
import { BiteSim, drawFloat, drawLine } from './bite.js';
import { BY_ID } from './species.js';
import { zukan } from './zukan.js';
import { sound } from './sound.js';
import { $, $$, clamp, reduced, vibrate } from './util.js';

export function initCards() {
  const rail = $('#rail'), track = $('#rail-track');
  const cards = $$('.card', track);
  const demos = [];

  cards.forEach((card) => {
    const sp = BY_ID[card.dataset.id], cv = $('.card-bite', card);
    if (!sp || !cv) return;
    const d = { card, sp, cv, ctx: cv.getContext('2d'), sim: new BiteSim(sp, { delay: 0.7 }), vis: false, hover: false, rings: [], hold: 0, W: 0, H: 0, dpr: 1, t: Math.random() * 10 };
    demos.push(d);
    const size = () => { const r = cv.getBoundingClientRect(); d.dpr = Math.min(devicePixelRatio || 1, 2); d.W = r.width; d.H = r.height; cv.width = Math.round(r.width * d.dpr); cv.height = Math.round(r.height * d.dpr); };
    d.size = size; size();
    card.addEventListener('pointerenter', () => { d.hover = true; });
    card.addEventListener('pointerleave', () => { d.hover = false; });
    card.addEventListener('focusin', () => { d.hover = true; });
    card.addEventListener('focusout', () => { d.hover = false; });
  });
  addEventListener('resize', () => demos.forEach((d) => d.size()));
  const io = new IntersectionObserver((es) => es.forEach((e) => { const d = demos.find((x) => x.card === e.target); if (d) d.vis = e.isIntersecting; }), { root: null, rootMargin: '0px 200px 0px 200px' });
  demos.forEach((d) => io.observe(d.card));

  // 釣った印
  const mark = () => {
    cards.forEach((c) => c.classList.toggle('is-caught', zukan.has(c.dataset.id)));
    const n = zukan.count();
    $('#fish-count').textContent = n; const zn = $('#zukan-n'); if (zn) zn.textContent = n;
  };
  mark(); zukan.on(mark);

  // 横スクロール: ドラッグ・ボタン・進み具合
  const prog = $('#rail-prog');
  const upd = () => { const max = rail.scrollWidth - rail.clientWidth; prog.parentElement.style.setProperty('--rp', max > 0 ? clamp(0.06 + (rail.scrollLeft / max) * 0.94) : 1); };
  rail.addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  const step = () => (cards[0] ? cards[0].getBoundingClientRect().width + 20 : 360);
  $('#rail-prev').addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: reduced ? 'auto' : 'smooth' }));
  $('#rail-next').addEventListener('click', () => rail.scrollBy({ left: step(), behavior: reduced ? 'auto' : 'smooth' }));
  rail.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { rail.scrollBy({ left: step(), behavior: 'smooth' }); e.preventDefault(); } if (e.key === 'ArrowLeft') { rail.scrollBy({ left: -step(), behavior: 'smooth' }); e.preventDefault(); } });
  let down = null, moved = 0;
  rail.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = { x: e.clientX, sl: rail.scrollLeft }; moved = 0; });
  addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x; moved = Math.max(moved, Math.abs(dx)); if (moved > 4) { rail.classList.add('is-drag'); rail.scrollLeft = down.sl - dx; } });
  addEventListener('pointerup', () => { if (down) { down = null; setTimeout(() => rail.classList.remove('is-drag'), 30); } });

  // ウキの見本を描く（見えているカードだけ）
  return {
    update(dt) {
      for (const d of demos) {
        if (!d.vis || !d.W) continue;
        d.t += dt;
        const { ctx, W, H, sim } = d;
        ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const wy = H * 0.64;
        // 空と水
        let g = ctx.createLinearGradient(0, 0, 0, wy); g.addColorStop(0, '#c9ddd6'); g.addColorStop(1, '#e3ede4'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, wy);
        g = ctx.createLinearGradient(0, wy, 0, H); g.addColorStop(0, '#5f8f86'); g.addColorStop(1, '#2f5a54'); ctx.fillStyle = g; ctx.fillRect(0, wy, W, H - wy);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 5; i++) { const yy = wy + 4 + i * (H - wy) / 5.5; ctx.fillRect(W * (0.1 + 0.17 * ((i * 3) % 5) / 2) + Math.sin(d.t * 0.8 + i) * 6, yy, W * 0.16, 1); }
        // 波紋
        for (let i = d.rings.length - 1; i >= 0; i--) { const r = d.rings[i]; r.t += dt; const p = r.t / 1.6; if (p >= 1) { d.rings.splice(i, 1); continue; } ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.55 * r.s})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(r.x, wy, 6 + p * 46 * r.s, (6 + p * 46 * r.s) * 0.2, 0, 0, 7); ctx.stroke(); }
        // ウキ
        const ev = sim.update(reduced ? 0 : dt);
        const L = Math.min(H * 0.5, 34), cx = W * 0.5, k = L / 0.11;
        for (const e of ev) {
          if (e.type === 'tick') { d.rings.push({ x: cx + sim.dx * k, t: 0, s: 0.45 + e.amp * 3 }); if (d.hover) { sound.a?.nibble(e.snd); vibrate(e.vib || 6); } }
          else if (e.type === 'end') { d.rings.push({ x: cx + sim.dx * k, t: 0, s: 0.9 + e.ripple * 0.5 }); if (d.hover) sound.a?.bite(e.snd); }
          else if (e.type === 'gone') d.hold = 0.8;
        }
        if (sim.phase === 'gone') { d.hold -= dt; if (d.hold <= 0) sim.reset(0.8); }
        const top = wy - L - sim.y * k;
        drawLine(ctx, W * 0.95, -4, cx + sim.dx * k, Math.max(top, wy - L * 1.2), { sag: 0.05, w: 1, color: 'rgba(255,255,255,.7)' });
        drawFloat(ctx, cx, wy, sim.y, { L, dx: sim.dx, dpr: d.dpr });
      }
    },
  };
}
