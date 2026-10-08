// ひだまり浜: ナビの色と、出てくるときの動きだけ
const nav = document.getElementById('nav');
new IntersectionObserver(([e]) => nav.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' }).observe(document.querySelector('.hero'));
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.rv').forEach((el) => io.observe(el));

// 入り江の一日: 区間の中の進み具合で、写真を重ねがえ、時計を進める
{
  const sec = document.getElementById('day');
  const pics = [...sec.querySelectorAll('.day-pics img')];
  const items = [...sec.querySelectorAll('.day-l li')];
  const clock = document.getElementById('dayClock'), bar = document.getElementById('dayBar');
  const T = [7, 13, 15, 18.9, 21];   // それぞれの写真の時刻
  const pad = (n) => String(n).padStart(2, '0');
  let last = -1;
  const upd = () => {
    const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
    if (Math.abs(p - last) < 0.0005) return;
    last = p;
    const x = p * (pics.length - 1), i = Math.min(pics.length - 2, Math.floor(x)), f = x - i;
    // つぎの写真へ、区間の後半で重ねがえる（前半はとどまる）
    const k = Math.min(1, Math.max(0, (f - 0.45) / 0.45)), e = k * k * (3 - 2 * k);
    pics.forEach((im, j) => { im.style.opacity = j < i ? 0 : j === i ? 1 : j === i + 1 ? e : 0; });
    if (pics[i]) pics[i].style.opacity = 1;
    const h = T[i] + (T[i + 1] - T[i]) * e;
    const hh = Math.floor(h), mm = Math.floor(((h - hh) * 60) / 5) * 5;
    clock.textContent = `${pad(hh)}:${pad(mm)}`;
    const on = e > 0.5 ? i + 1 : i;
    items.forEach((li, j) => li.classList.toggle('on', j === on));
    bar.style.width = `${(p * 100).toFixed(2)}%`;
  };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
}
