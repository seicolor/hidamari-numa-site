// 画面まわりの小さな部品: 季節の印・音のボタン・モーダル・カーソル・コイの見くらべ・音の層
import { world, sections, setSeason, SEASONS, SEASON_JA, displaySeason } from './world.js';
import { sound } from './sound.js';
import { SPECIES } from './species.js';
import { zukan } from './zukan.js';
import { $, $$, clamp, lerp, reduced, coarse } from './util.js';
import { partOfDay } from './sky.js';

export function initUI({ scroll, fishing, gl }) {
  const body = document.body;
  const api = {};

  // ---- 見出しや文のあらわれ ----
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
  $$('.rv, .statement, .sec-title, .beat-line, .play-title, .beat-sub, .gp').forEach((el) => io.observe(el));

  // ---- 季節の印 ----
  const seals = $$('.seal');
  const refreshSeals = () => seals.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === displaySeason())));
  seals.forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.s, i = SEASONS.indexOf(id);
    sound.a?.uiTick();
    const s = sections().find((x) => x.id === 'seasons');
    if (s && world.seasonOver) { scrollTo({ top: scroll.seasonY(i), behavior: reduced ? 'auto' : 'smooth' }); return; }
    setSeason(id); world.seasonOver = null;
    sound.setSeason(id); refreshSeals();
    // 季節をかえたことが、はっきり分かるように、水面にふわっと波紋
    gl.ripple(0.5, 0.2, 1.0);
  }));
  sound.setSeason(world.season);
  refreshSeals();

  // ---- 天気（雨・雪） ----
  const wx = $('#weather'), wxl = $('#weather-l');
  const paintWx = () => {
    const on = world.rainT > 0.5, snow = displaySeason() === 'winter', nm = on ? (snow ? '雪' : '雨') : '晴れ';
    wx.dataset.on = String(on); wxl.textContent = nm;
    wx.setAttribute('aria-label', `天気 ${nm}。押すと${on ? '晴れにします' : snow ? '雪をふらせます' : '雨をふらせます'}`);
  };
  wx.addEventListener('click', () => { world.rainT = world.rainT > 0.5 ? 0 : 1; sound.a?.uiTick(); paintWx(); });
  paintWx();

  // ---- 音 ----
  const snd = $('#sound'), sndL = $('#sound-l');
  const paintSound = () => { snd.dataset.on = String(sound.on); snd.setAttribute('aria-label', sound.on ? '音 オン。押すと音を止めます' : '音 オフ。押すと音を出します'); sndL.textContent = sound.on ? '音 オン' : '音 オフ'; paintMix(); };
  snd.addEventListener('click', async () => { await sound.toggle(); paintSound(); if (sound.on) sound.a?.uiConfirm(); });
  const mixOn = $('#mix-on'), mixState = $('#mix-state');
  const paintMix = () => {
    mixOn.textContent = sound.on ? '音を止める' : '音を入れる';
    mixState.textContent = sound.on ? `いま、${SEASON_JA[displaySeason()]}の${partOfDay(world.hour)}の音を合成して鳴らしています。` : '音がオフです。ボタンを押すと、鳴りはじめます。';
  };
  mixOn.addEventListener('click', async () => { await sound.toggle(); paintSound(); });
  $$('[data-mix]').forEach((c) => c.addEventListener('change', () => { sound.setMix(c.dataset.mix, c.checked); sound.a?.uiTick(); }));
  let lastMixKey = '';
  const mixTick = () => { const k = displaySeason() + partOfDay(world.hour) + sound.on; if (k !== lastMixKey) { lastMixKey = k; paintMix(); refreshSeals(); paintWx(); } };

  // ---- 釣れたカード ----
  const catchEl = $('#catch'), catchCard = $('#catch-card');
  let lastFocus = null;
  const trap = (root) => (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('button, [href], input, video[controls]', root).filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); }
  };
  const catchTrap = trap(catchEl);
  function showCatch(sp, cm, fresh) {
    const idx = SPECIES.findIndex((s) => s.id === sp.id) + 1;
    const card = $(`.card[data-id="${sp.id}"]`);
    if (card) { const cs = getComputedStyle(card.querySelector('.card-img')); catchEl.style.setProperty('--tint1', cs.getPropertyValue('--tint1')); catchEl.style.setProperty('--tint2', cs.getPropertyValue('--tint2')); }
    $('#catch-no').textContent = `No.${String(idx).padStart(2, '0')}`;
    const im = $('#catch-img'); im.src = `assets/img/fish-${sp.id}-600.webp`; im.alt = `${sp.name}の絵`;
    $('#catch-n').textContent = sp.name; $('#catch-l').textContent = sp.latin;
    $('#catch-size').innerHTML = `<b>${cm}</b> cm`;
    $('#catch-d').textContent = sp.junk ? sp.desc : sp.desc;
    $('#catch-new').textContent = fresh ? `図鑑に載りました（${zukan.count()} / ${SPECIES.length}）` : 'もう図鑑に載っています';
    gyo = { sp, cm, done: false, busy: false }; catchCard.classList.remove('is-gyo'); gyoBtn.textContent = '魚拓にする'; gyoBtn.disabled = false;
    lastFocus = document.activeElement;
    catchEl.hidden = false; requestAnimationFrame(() => { catchEl.classList.add('is-on'); catchCard.focus(); });
    catchEl.addEventListener('keydown', catchTrap);
    body.style.overflow = 'hidden';
  }
  function hideCatch() {
    catchEl.classList.remove('is-on'); body.style.overflow = '';
    setTimeout(() => { catchEl.hidden = true; }, 450);
    catchEl.removeEventListener('keydown', catchTrap);
    fishing.release(); sound.a?.releaseSound();
    (lastFocus && lastFocus.focus) ? lastFocus.focus({ preventScroll: true }) : $('#water-hit').focus({ preventScroll: true });
  }
  // 魚拓: いま釣れた魚の絵から、和紙に墨で刷ったような画像をつくる（ゲームと同じ仕組み）
  let gyo = null;
  const gyoBtn = $('#catch-gyo');
  async function gyoClick() {
    if (gyo && gyo.done) {
      const a = document.createElement('a'); a.href = gyo.url; a.download = `hidamari-gyotaku-${gyo.sp.id}-${gyo.cm}cm.jpg`; document.body.appendChild(a); a.click(); a.remove();
      $('#catch-new').textContent = '魚拓を保存しました'; return;
    }
    if (!gyo || gyo.busy) return;
    gyo.busy = true; gyoBtn.disabled = true; gyoBtn.textContent = '刷っています…';
    try {
      const im = $('#catch-img'); if (im.decode) await im.decode().catch(() => {});
      const fc = document.createElement('canvas'); fc.width = im.naturalWidth || 900; fc.height = im.naturalHeight || 563;
      fc.getContext('2d').drawImage(im, 0, 0, fc.width, fc.height);
      const { makeGyotaku } = await import('./gyotaku.js');   // 魚拓の部品は、刷るときに読みこむ
      const cv = await makeGyotaku(fc, { sp: gyo.sp, cm: gyo.cm, date: new Date() });
      gyo.url = cv.toDataURL('image/jpeg', 0.9); gyo.done = true;
      im.src = gyo.url; im.alt = `${gyo.sp.name}の魚拓`; catchCard.classList.add('is-gyo');
      gyoBtn.textContent = '魚拓を保存する'; $('#catch-new').textContent = '魚拓ができました。保存できないときは、画像を長押し（右クリック）';
      sound.a?.uiConfirm();
    } catch (e) { gyoBtn.textContent = 'うまく刷れませんでした'; }
    gyo.busy = false; gyoBtn.disabled = false;
  }
  gyoBtn.addEventListener('click', gyoClick);
  $('#catch-close').addEventListener('click', hideCatch);
  catchEl.addEventListener('pointerdown', (e) => { if (e.target === catchEl) hideCatch(); });

  // ---- 予告編 ----
  const tr = $('#trailer'), tv = $('#trailer-v');
  const trTrap = trap(tr);
  let trFocus = null;
  const openTrailer = () => {
    trFocus = document.activeElement;
    tv.src = 'assets/media/trailer.mp4'; tr.hidden = false; requestAnimationFrame(() => tr.classList.add('is-on'));
    body.style.overflow = 'hidden'; tv.play().catch(() => {}); $('#trailer-x').focus(); tr.addEventListener('keydown', trTrap);
    if (sound.on) sound.disable().then(() => { tr._muted = true; paintSound(); });
  };
  const closeTrailer = () => {
    tr.classList.remove('is-on'); tv.pause(); body.style.overflow = '';
    setTimeout(() => { tr.hidden = true; tv.removeAttribute('src'); tv.load(); }, 450);
    tr.removeEventListener('keydown', trTrap);
    if (tr._muted) { tr._muted = false; sound.enable().then(paintSound); }
    trFocus && trFocus.focus({ preventScroll: true });
  };
  $('#btn-trailer').addEventListener('click', openTrailer);
  $('#trailer-x').addEventListener('click', closeTrailer);
  tr.addEventListener('pointerdown', (e) => { if (e.target === tr) closeTrailer(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!catchEl.hidden) hideCatch(); else if (!tr.hidden) closeTrailer(); } });

  // ---- コイの見くらべ ----
  const ks = $('#koi-stage'), ki = $('#koi-input');
  const setK = (v) => { v = clamp(v, 0, 100); ks.style.setProperty('--kx', v + '%'); ki.value = v; };
  setK(55);
  let kd = false;
  const kpos = (e) => { const r = ks.getBoundingClientRect(); setK(((e.clientX - r.left) / r.width) * 100); };
  ks.addEventListener('pointerdown', (e) => { kd = true; ks.setPointerCapture(e.pointerId); kpos(e); });
  ks.addEventListener('pointermove', (e) => { if (kd) kpos(e); });
  ks.addEventListener('pointerup', () => { kd = false; }); ks.addEventListener('pointercancel', () => { kd = false; });
  ki.addEventListener('input', () => setK(+ki.value));
  const kio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; kio.disconnect();
    if (reduced) return;
    const t0 = performance.now(); const run = (n) => { const p = clamp((n - t0) / 2200); const v = p < 0.5 ? lerp(55, 12, p * 2) : lerp(12, 62, (p - 0.5) * 2); if (!kd) setK(v + Math.sin(p * Math.PI) * 0); if (p < 1 && !kd) requestAnimationFrame(run); }; requestAnimationFrame(run);
  }), { threshold: 0.5 });
  kio.observe(ks);

  // ---- 数字のカウントダウン（0 になる） ----
  const fio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; fio.unobserve(e.target);
    const el = e.target, from = +el.dataset.from || 0, to = +el.dataset.count || 0;
    if (reduced) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1800;
    const run = (n) => { const p = clamp((n - t0) / dur), v = Math.round(lerp(from, to, 1 - Math.pow(1 - p, 3))); el.textContent = v; if (p < 1) requestAnimationFrame(run); };
    requestAnimationFrame(run);
  }), { threshold: 0.8 });
  $$('[data-count]').forEach((el) => { el.textContent = el.dataset.from || el.textContent; fio.observe(el); });

  // ---- 水面に触れると波紋（窓のセクション） ----
  const tap = $('#tap-ring');
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, input, label, .rail, .koi-stage, #catch, #trailer, #gate')) return;
    tap.style.left = e.clientX + 'px'; tap.style.top = e.clientY + 'px'; tap.classList.remove('go'); void tap.offsetWidth; tap.classList.add('go');
    const inWin = e.target.closest('.win');
    if (inWin && world.winVisible && !e.target.closest('.hero')) {
      const u = e.clientX / innerWidth, v = 1 - e.clientY / innerHeight;
      if (gl.ripple(u, v, 1.0)) sound.a?.plip(0.5, clamp((u - 0.5) * 1.6, -0.8, 0.8));
    }
  });

  // ---- 水面は、マウスの動きにも、すこし応える ----
  let lr = { x: 0, y: 0, t: 0 };
  addEventListener('pointermove', (e) => {
    if (!world.winVisible || e.pointerType === 'touch' || reduced) return;
    const u = e.clientX / innerWidth, v = 1 - e.clientY / innerHeight;
    const now0 = performance.now();
    // 空にある題字の上では、水面にうつった題字のほうに波紋（鏡のように）
    if (v > gl.horizon + 0.02 && world.active === 'hero' && scrollY < innerHeight * 0.4) {
      const vm = 2 * gl.horizon - v;
      if (vm > 0.04 && now0 - lr.t > 140) { lr = { x: e.clientX, y: e.clientY, t: now0 }; gl.ripple(u, vm, 0.16); }
      return;
    }
    if (v >= gl.horizon - 0.02) return;
    const now = performance.now();
    if (now - lr.t < 110 || Math.hypot(e.clientX - lr.x, e.clientY - lr.y) < 70) return;
    lr = { x: e.clientX, y: e.clientY, t: now }; gl.ripple(u, v, 0.2);
  }, { passive: true });

  // ---- カーソルの輪（マウスのときだけ） ----
  if (!coarse) {
    const cur = document.createElement('div'); cur.className = 'cursor'; cur.setAttribute('aria-hidden', '0'); cur.innerHTML = '<span></span>'; cur.setAttribute('aria-hidden', 'true'); body.appendChild(cur);
    const lab = cur.firstChild; let cx = -100, cy = -100, tx = -100, ty = -100, on = false;
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; if (!on) { on = true; cx = tx; cy = ty; cur.classList.add('on'); } const el = e.target.closest && e.target.closest('a, button, .rail, .koi-stage, .water-hit, label'); cur.classList.toggle('big', !!el); cur.classList.toggle('water', !!(e.target.closest && e.target.closest('.water-hit'))); lab.textContent = e.target.closest && e.target.closest('.water-hit') ? 'たらす' : e.target.closest && e.target.closest('.rail') ? 'ひく' : ''; });
    document.documentElement.addEventListener('mouseleave', () => cur.classList.remove('on'));
    cur._step = () => {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18; cur.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      // 釣りの最中は、輪をちいさく（投げたウキを、かくさないように）
      const busy = cur.classList.contains('water') && fishing.state !== 'idle';
      if (busy !== cur._busy) { cur._busy = busy; cur.classList.toggle('busy', busy); if (busy) lab.textContent = ''; else if (cur.classList.contains('water')) lab.textContent = 'たらす'; }
    };
    api.cursor = cur;
  }

  // ---- 磁石のように寄るボタン ----
  $$('[data-magnet], .btn-big').forEach((el) => {
    if (coarse || reduced) return;
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * 0.18}px, ${(e.clientY - (r.top + r.height / 2)) * 0.28}px)`; });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });

  Object.assign(api, { paintSound, refreshSeals, showCatch, mixTick, paintMix });
  return api;
}
