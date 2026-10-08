import { mountGlobe, localTime, TRIP_KM, tripAt } from './globe.js';

mountGlobe(document.getElementById('globe'), document.getElementById('gpins'), { shift: 0.16,
  onPick: (id) => document.getElementById(`p-${id}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }),
});
// カードの現地時刻
const tick = () => { for (const e of document.querySelectorAll('.pcard-t [data-t]')) e.textContent = localTime(e.dataset.t); };
tick(); setInterval(tick, 15000);
// ナビ: ヒーローをすぎたら紙の色に
const nav = document.getElementById('nav');
const hero = document.querySelector('.shero');
new IntersectionObserver(([e]) => nav.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' }).observe(hero);
// 出てくる
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.rv').forEach((el) => io.observe(el));

// スクロールで飛ぶ旅: 区間の中の進み具合で、飛行機・距離・時刻・日付変更線・はんこ
{
  const sec = document.getElementById('fly');
  const g = mountGlobe(document.getElementById('flyglobe'), document.getElementById('flypins'), { flight: true, shift: 0.2 });
  const steps = [...sec.querySelectorAll('.fly-steps li')];
  const km = document.getElementById('flyKm'), dl = document.getElementById('flyDl'), stamp = document.getElementById('flyStamp');
  const fA = document.getElementById('flyA'), fB = document.getElementById('flyB');
  const fmt = (tz) => { try { return new Intl.DateTimeFormat('ja-JP', { timeZone: tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); } catch (e) { return ''; } };
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu' }).format(d); document.getElementById('flyDate').textContent = p.replace(/-/g, '.'); } catch (e) { document.getElementById('flyDate').textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; }
  const times = () => { fA.textContent = fmt('Asia/Tokyo'); fB.textContent = fmt('Pacific/Honolulu'); };
  times(); setInterval(times, 15000);
  let last = -1;
  const upd = () => {
    const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
    if (Math.abs(p - last) < 0.0005) return;
    last = p;
    const f = Math.min(1, Math.max(0, (p - 0.08) / 0.8));   // はじめと終わりに、少し止まる
    g.setProgress(f);
    km.textContent = Math.round(TRIP_KM * f).toLocaleString('ja-JP');
    const s = f < 0.34 ? 0 : f < 0.97 ? 1 : 2;
    steps.forEach((li, i) => li.classList.toggle('on', i === s));
    const lon = tripAt(f).lon;
    dl.classList.toggle('on', f > 0.2 && f < 0.97 && Math.abs(Math.abs(lon) - 180) < 14);
    stamp.classList.toggle('on', f >= 0.995);
  };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
}
