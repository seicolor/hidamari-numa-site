// ウキの動きをつくる・描く。アタリの癖の数値は、ゲーム本体（src/species.js）のものをそのまま使っています。
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const ease = (t) => t * t * (3 - 2 * t);

// 1匹ぶんのアタリの進行。update(dt) が、起きたできごと（音・波紋・合わせどき）の配列を返す
export class BiteSim {
  constructor(sp, { delay = 0.9 } = {}) { this.sp = sp; this.b = sp.bite; this.reset(delay); }

  reset(delay = 0.9) {
    this.t = 0; this.phase = 'wait'; this.timer = delay;
    this.ticks = rint(this.sp.nibble[0], this.sp.nibble[1]);
    this.cur = null; this.off = 0; this.dx = 0; this.dxT = 0; this.age = 0; this.striking = false; this.dir = Math.random() < 0.5 ? -1 : 1;
  }

  // 本アタリのあと、合わせられる時間（秒）
  get window() { return 1.5; }

  update(dt) {
    const ev = [];
    this.t += dt;
    const T = this.b.tick, E = this.b.end;
    let off = 0, shake = 0;
    if (this.phase === 'wait') {
      this.timer -= dt;
      off = 0.004 * Math.sin(this.t * 2.1);
      if (this.timer <= 0) {
        if (this.ticks > 0) this.startTick(ev); else this.startEnd(ev);
      }
    }
    if (this.phase === 'tick') {
      const c = this.cur; c.t += dt;
      const s = Math.min(1, c.t / T.dur);
      off = c.dir * Math.abs(T.amp) * Math.sin(Math.PI * s) * (c.dir > 0 ? 0.7 : 1);
      shake = (T.shake || 0) * Math.sin(Math.PI * s);
      this.dxT = (T.drift || 0) * c.side * ease(s);
      if (s >= 1) { this.phase = 'gap'; this.timer = rnd(T.gap[0], T.gap[1]); this.ticks--; }
    } else if (this.phase === 'gap') {
      this.timer -= dt;
      off = 0.004 * Math.sin(this.t * 2.1);
      this.dxT *= Math.exp(-dt * 1.2);
      if (this.timer <= 0) { if (this.ticks > 0) this.startTick(ev); else this.startEnd(ev); }
    } else if (this.phase === 'end') {
      this.age += dt;
      const lift = E.lift || 0, liftT = E.liftT || 0;
      if (this.age < liftT) { off = lift * ease(this.age / liftT); }
      else {
        if (!this.sunk) { this.sunk = true; this.striking = true; ev.push({ type: 'end', snd: E.snd, ripple: E.ripple || 0.5, splash: E.splash || 0 }); }
        const tgt = E.sink;
        this.off += (tgt - this.off) * (1 - Math.exp(-(E.rate || 10) * dt));
        off = this.off;
        shake = (E.shake || 0);
        this.dxT = (E.drift || 0) * this.dir;
      }
      if (this.age > liftT + this.window) { this.striking = false; this.phase = 'gone'; ev.push({ type: 'gone' }); }
    } else if (this.phase === 'gone') {
      this.off += (0 - this.off) * (1 - Math.exp(-3 * dt));
      off = this.off; this.dxT *= Math.exp(-dt * 2);
    }
    if (this.phase !== 'end') this.off = off; else if (!this.sunk) this.off = off;
    this.dx += (this.dxT - this.dx) * (1 - Math.exp(-6 * dt));
    this.shakeV = shake ? shake * Math.sin(this.t * 70) : 0;
    return ev;
  }

  startTick(ev) {
    const T = this.b.tick;
    this.phase = 'tick';
    this.cur = { t: 0, dir: Math.random() < (T.up || 0) ? 1 : -1, side: Math.random() < 0.5 ? -1 : 1 };
    ev.push({ type: 'tick', snd: T.snd, vib: T.vib || 0, amp: Math.abs(T.amp) });
  }
  startEnd(ev) { this.phase = 'end'; this.age = 0; this.sunk = false; this.off = 0; ev.push({ type: 'strike-start' }); }

  // ウキの上下の位置（m）と横ずれ
  get y() { return this.off + (this.shakeV || 0); }
}

// ---- 描画 ----
// ウキの形（赤と白の円筒）。水面より下は、うすく透けて見える
function pill(ctx, cx, top, L, W, opt) {
  const r = W / 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, top + r);
  ctx.arc(cx, top + r, r, Math.PI, 0);
  ctx.lineTo(cx + r, top + L - r);
  ctx.arc(cx, top + L - r, r, 0, Math.PI);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, opt.dark); g.addColorStop(0.35, opt.mid); g.addColorStop(1, opt.dark);
  ctx.fillStyle = g; ctx.fill();
}

export function drawFloat(ctx, x, wy, off, o = {}) {
  const L = o.L || 40, W = L * 0.3, k = L / 0.11;
  const cx = x + (o.dx || 0) * k;
  const top = wy - L - off * k;
  const cw = ctx.canvas.width / (o.dpr || 1), ch = ctx.canvas.height / (o.dpr || 1);
  const led = !!o.led;
  const body = led ? { dark: '#3a2a10', mid: '#ffcf70' } : { dark: '#a8281c', mid: '#ee5442' };
  // 水面の上
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, wy); ctx.clip();
  pill(ctx, cx, top, L, W, body);
  if (!led) {
    // 白い帯
    ctx.fillStyle = '#f6efe2'; ctx.fillRect(cx - W / 2, top + L * 0.42, W, L * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(cx - W * 0.22, top + L * 0.1, W * 0.14, L * 0.78);
  } else {
    const g = ctx.createRadialGradient(cx, top + W * 0.6, 0, cx, top + W * 0.6, L * 1.6);
    g.addColorStop(0, 'rgba(255,200,110,.85)'); g.addColorStop(0.25, 'rgba(255,170,70,.25)'); g.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(cx - L * 2, top - L * 1.5, L * 4, L * 4);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  // 水面の下（透けて見える）
  if (top + L > wy) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, wy, cw, ch); ctx.clip(); ctx.globalAlpha = led ? 0.5 : 0.3;
    pill(ctx, cx, top, L, W, led ? { dark: '#2a2010', mid: '#d9a040' } : { dark: '#3a1a1a', mid: '#8a3a30' });
    ctx.restore();
  }
  // 水面との接点（ふちの輪）
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(cx, wy, W * 0.95 + Math.abs(off) * k * 0.12, W * 0.26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  return { x: cx, top };
}

// 糸: 竿先からウキまで、ゆるやかなたるみをつけて
export function drawLine(ctx, x0, y0, x1, y1, o = {}) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const sag = len * (o.sag ?? 0.07);
  ctx.save();
  ctx.lineWidth = o.w || 1.1; ctx.lineCap = 'round';
  ctx.strokeStyle = o.color || 'rgba(255,252,244,.82)';
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + (o.wob || 0), (y0 + y1) / 2 + sag, x1, y1);
  ctx.stroke(); ctx.restore();
}

// 竿: 画面の右下から、先細りに立ちあがる
export function drawRod(ctx, tx, ty, bx, by, o = {}) {
  const dx = bx - tx, dy = by - ty, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const bend = o.bend || 0;
  const mx = (tx + bx) / 2 + nx * (len * 0.035 + bend), my = (ty + by) / 2 + ny * (len * 0.035 + bend);
  const wTip = 0.9, wBut = o.w || 9;
  const pt = (t, w) => {
    const u = 1 - t;
    const x = u * u * tx + 2 * u * t * mx + t * t * bx, y = u * u * ty + 2 * u * t * my + t * t * by;
    const px = 2 * u * (mx - tx) + 2 * t * (bx - mx), py = 2 * u * (my - ty) + 2 * t * (by - my);
    const l = Math.hypot(px, py) || 1;
    return [x - (py / l) * w / 2, y + (px / l) * w / 2, x + (py / l) * w / 2, y - (px / l) * w / 2];
  };
  const N = 28; const A = [], B = [];
  for (let i = 0; i <= N; i++) { const t = i / N; const w = wTip + (wBut - wTip) * Math.pow(t, 1.35); const p = pt(t, w); A.push([p[0], p[1]]); B.push([p[2], p[3]]); }
  ctx.save();
  ctx.beginPath(); ctx.moveTo(A[0][0], A[0][1]);
  for (const p of A) ctx.lineTo(p[0], p[1]);
  for (let i = B.length - 1; i >= 0; i--) ctx.lineTo(B[i][0], B[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(tx, ty, bx, by);
  g.addColorStop(0, '#2a2f2c'); g.addColorStop(0.6, '#171b19'); g.addColorStop(1, '#0d100f');
  ctx.fillStyle = g; ctx.fill();
  // つやの線
  ctx.beginPath(); ctx.moveTo(A[2][0], A[2][1]); for (let i = 3; i < N - 2; i++) ctx.lineTo(A[i][0], A[i][1]);
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.restore();
  return { tipX: tx, tipY: ty };
}
