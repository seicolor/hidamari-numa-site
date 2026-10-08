import { mountGlobe, localTime } from './globe.js';

mountGlobe(document.getElementById('globe'), document.getElementById('gpins'), {
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
