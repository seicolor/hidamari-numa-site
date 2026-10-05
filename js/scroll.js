// スクロールに連動する演出: 固定セクションの進み具合・視差・四季のきりかわり・ナビの色
import { world, sections, SEASONS, SEASON_JA, displaySeason } from './world.js';
import { $, $$, clamp, lerp, ease, reduced, fmtHour } from './util.js';
import { partOfDay, SUN } from './sky.js';

export function initScroll() {
  const hero = $('#hero'), heroFrame = $('#hero-frame');
  const seasonsSec = $('#seasons'), figs = $$('.sea-fig'), stage = $('#sea-stage'), items = $$('#sea-list li'), ticks = $$('.seasons-prog i'), capK = $('#sea-cap-k');
  const progBar = $('#progress-bar');
  const ring = document.createElement('div'); ring.className = 'sea-ring'; stage.appendChild(ring);
  const ORIGIN = [[0.5, 0.62], [0.28, 0.68], [0.74, 0.64], [0.5, 0.7]];
  const pars = $$('[data-par]'), dots = $$('.dots a'), pins = $$('.beat, .night, .play');
  const clockT = $('#clock-time'), clockP = $('#clock-part'), arcDot = $('#arc-dot'), heroNow = $('#hero-now');
  let lastClock = '', lastPart = '', lastSeasonTxt = '', idx = 0;
  const live = $$('.beat .beat-time .num, .night .beat-time .num, .play .beat-time .num');

  const api = {
    measure() { pars.forEach((el) => { const r = el.getBoundingClientRect(); el._c = r.top + scrollY + r.height / 2; }); },
    get stageIndex() { return idx; },
    // 四季のステージ i の中央までのスクロール量
    seasonY(i) { const s = sections().find((x) => x.id === 'seasons'); if (!s) return 0; const range = s.h - innerHeight; return s.top + range * ((i + 0.5) / 4); },
    update() {
      const secs = sections(); const y = scrollY, vh = innerHeight;
      // 固定セクションの進み具合
      for (const s of secs) {
        if (!(s.el.classList.contains('beat') || s.el.classList.contains('night') || s.el.classList.contains('pin') || s.el.classList.contains('play'))) continue;
        if (y + vh < s.top - 50 || y > s.bottom + 50) continue;
        const p = clamp((y - s.top) / Math.max(1, s.h - vh));
        s.el.style.setProperty('--p', p.toFixed(4));
        s.el.classList.toggle('in', y + vh * 0.62 > s.top);
      }
      // ヒーロー
      const hp = clamp(y / (vh * 0.78));
      heroFrame.style.setProperty('--hp', hp.toFixed(3));

      // 視差
      for (const el of pars) {
        const c = (el._c - y - vh / 2) / vh;
        if (c > 1.4 || c < -1.4) continue;
        el.style.setProperty('--py', `${(-c * 90 * parseFloat(el.dataset.par)).toFixed(1)}px`);
      }

      // 四季
      const s = secs.find((x) => x.id === 'seasons');
      if (s) {
        const range = s.h - vh, p = clamp((y - s.top) / range);
        const midIn = y + vh * 0.5 > s.top && y + vh * 0.5 < s.bottom;
        idx = clamp(Math.floor(p * 4 + 1e-4), 0, 3);
        world.seasonOver = midIn ? SEASONS[idx] : null;
        if (y + vh > s.top - 100 && y < s.bottom + 100) {
          const w = stage.clientWidth, h = stage.clientHeight;
          let ringOn = false;
          figs.forEach((f, i) => {
            const z = 1.07 - 0.06 * clamp((p * 4 - (i - 0.2)) / 1.2);
            f.style.setProperty('--zoom', z.toFixed(4));
            if (i === 0) return;
            const t = clamp((p - (i / 4 - 0.075)) / 0.15);
            const [ox, oy] = ORIGIN[i];
            const R = Math.hypot(Math.max(ox, 1 - ox) * w, Math.max(oy, 1 - oy) * h) * 1.04;
            const r = ease(t) * R;
            f.style.setProperty('--cx', `${ox * 100}%`); f.style.setProperty('--cy', `${oy * 100}%`);
            f.style.setProperty('--r', `${r.toFixed(1)}px`);
            if (t > 0 && t < 1 && !ringOn) { ringOn = true; ring.style.left = `${ox * 100}%`; ring.style.top = `${oy * 100}%`; ring.style.width = ring.style.height = `${(r * 2).toFixed(1)}px`; ring.style.opacity = (Math.sin(Math.PI * t) * 0.9).toFixed(3); }
          });
          if (!ringOn) ring.style.opacity = '0';
          items.forEach((li, i) => li.classList.toggle('is-on', i === idx));
          ticks.forEach((tk, i) => tk.style.setProperty('--f', clamp(p * 4 - i).toFixed(3)));
          if (capK.textContent !== SEASON_JA[SEASONS[idx]]) capK.textContent = SEASON_JA[SEASONS[idx]];
        }
      }

      // ページ全体の進み具合
      progBar.style.setProperty('--sp', clamp(y / Math.max(1, (world.docH || 1) - vh)).toFixed(4));

      // ナビの色
      const tone = world.surface === 'paper' ? 'dark' : world.surface === 'dark' ? 'light' : world.tone;
      document.body.dataset.nav = tone; document.body.dataset.surface = world.surface;
      document.documentElement.style.setProperty('--sky-fg', tone === 'dark' ? 'var(--ink)' : 'var(--cream)');
      // 窓のなかの文字の色（空の明るさにあわせる）
      document.body.dataset.sky = world.tone;
      dots.forEach((a) => a.classList.toggle('is-on', a.dataset.for === world.active));

      // 時計
      const h = ((world.hour % 24) + 24) % 24;
      const tx = fmtHour(h); if (tx !== lastClock) { lastClock = tx; clockT.textContent = tx; live.forEach((n) => { n.textContent = tx; }); }
      const pt = partOfDay(h); if (pt !== lastPart) { lastPart = pt; clockP.textContent = pt; }
      const ss = SUN[displaySeason()], day = h >= ss.rise && h <= ss.set;
      const tt = day ? (h - ss.rise) / (ss.set - ss.rise) : ((h - ss.set + 24) % 24) / (24 - (ss.set - ss.rise));
      arcDot.setAttribute('cx', (3 + 38 * clamp(tt)).toFixed(1)); arcDot.setAttribute('cy', (21 - Math.sin(Math.PI * clamp(tt)) * 19).toFixed(1));
      arcDot.setAttribute('fill', day ? 'currentColor' : 'none'); arcDot.setAttribute('stroke', 'currentColor'); arcDot.setAttribute('stroke-width', day ? '0' : '1');
      const txt = `${SEASON_JA[displaySeason()]}の${h < 4.5 ? '夜更け' : h < 9 ? '朝' : h < 15 ? '昼' : h < 19 ? '夕方' : '夜'}`;
      if (txt !== lastSeasonTxt) { lastSeasonTxt = txt; heroNow.textContent = txt; }
    },
  };
  return api;
}
