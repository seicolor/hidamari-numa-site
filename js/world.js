// 「一日」の進行役。スクロールの位置から、時刻・季節・空の状態をきめる。
import { sky, SEASONS, SEASON_JA, seasonOfDate, partOfDay, SUN } from './sky.js';
import { clamp, lerp, smooth, damp, reduced, $$ } from './util.js';

export const world = {
  hour: 6.6, season: seasonOfDate(), seasonOver: null,
  sw: [0, 0, 0, 0],
  tone: 'dark',            // 空の上に置く文字の色（'dark'=墨, 'light'=生成り）
  k: null,                 // 直近の sky() の結果
  winVisible: true,
  active: null,            // いま真ん中にあるセクションのid
  surface: 'win',
  rain: 0, rainT: 0,       // 雨（0〜1）。ナビの天気ボタンで入りきりする
};
SEASONS.forEach((s, i) => { world.sw[i] = s === world.season ? 1 : 0; });

let secs = [], pts = [], vh = innerHeight, vw = innerWidth;

export const displaySeason = () => world.seasonOver || world.season;

// セクションの位置を測りなおす（大きさが変わったとき・画像が読み込まれたとき）
export function measure() {
  vh = innerHeight; vw = innerWidth;
  world.docH = document.documentElement.scrollHeight;
  const sy = scrollY;
  secs = $$('main > section').map((el) => {
    const r = el.getBoundingClientRect();
    const top = r.top + sy, h = r.height;
    const win = el.classList.contains('win');
    return { el, id: el.id, top, h, bottom: top + h, win, pin: win && h > vh * 1.2 || el.classList.contains('pin'), paper: el.classList.contains('paper'), dark: el.classList.contains('dark'),
      h0: el.dataset.h0 ? +el.dataset.h0 : null, h1: el.dataset.h1 ? +el.dataset.h1 : null };
  });
  // 時刻の目印（スクロール位置→時刻）
  pts = [];
  secs.forEach((s) => {
    if (s.h0 == null) return;
    const end = s.win && s.h > vh * 1.05 ? s.bottom - vh : s.bottom;
    pts.push([s.top, s.h0]); pts.push([Math.max(s.top + 1, end), s.h1]);
  });
  pts.sort((a, b) => a[0] - b[0]);
  return secs;
}
export const sections = () => secs;

function hourAt(y) {
  if (!pts.length) return 7;
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (y <= pts[i + 1][0]) { const t = (y - pts[i][0]) / Math.max(1, pts[i + 1][0] - pts[i][0]); return lerp(pts[i][1], pts[i + 1][1], t); }
  }
  return pts[pts.length - 1][1];
}

export function setSeason(id) { world.season = id; document.documentElement.dataset.season = displaySeason(); }

let toneHold = 'dark';
export function update(dt, gl) {
  const y = scrollY;
  const target = hourAt(y);
  world.hour = reduced ? target : damp(world.hour, target, 7, dt);
  const tgt = displaySeason();
  document.documentElement.dataset.season = tgt;
  SEASONS.forEach((s, i) => { world.sw[i] = damp(world.sw[i], s === tgt ? 1 : 0, reduced ? 40 : 2.4, dt); });
  const sum = world.sw.reduce((a, b) => a + b, 0) || 1;
  const sw = world.sw.map((v) => v / sum);

  // どのセクションが画面にあるか
  let win = false, active = null, surface = 'win';
  const mid = y + vh * 0.5, nav = y + 40;
  for (const s of secs) {
    if (s.win && s.bottom > y && s.top < y + vh) win = true;
    if (mid >= s.top && mid < s.bottom) active = s.id;
    if (nav >= s.top && nav < s.bottom) surface = s.win ? 'win' : s.dark ? 'dark' : 'paper';
  }
  world.winVisible = win; world.active = active; world.surface = surface;

  // 空の状態
  const S = gl.S;
  S.hour = world.hour; S.season = sw;
  const hr = ((world.hour % 24) + 24) % 24;
  S.mist = (1 - smooth(5.6, 9.2, hr)) * 0.5 * smooth(3.0, 5.0, hr) * (1 - sw[1] * 0.35) + smooth(17.0, 19.5, hr) * (1 - smooth(19.5, 21, hr)) * 0.12;
  S.lily = sw[1] * 1.0 + sw[0] * 0.55 + sw[2] * 0.4;
  world.rain = reduced ? world.rainT : damp(world.rain, world.rainT, 0.9, dt);
  S.rain = world.rain;
  S.parts = (1 - world.rain * 0.85 * (1 - sw[3])) + world.rain * 1.4 * sw[3];
  S.mist += world.rain * 0.28;
  const k = sky(world.hour, sw, world.rain);
  world.k = k;
  S.lights = smooth(0.25, 0.8, k.night);
  S.wind = 1;
  // ヒーローは、スクロールすると地平線が一緒に上がる（見出しの映りこみと合わせるため）
  const hp = y / vh;
  gl.horizon = 0.44 + (hp < 1.12 ? clamp(hp, 0, 1) * (1 - smooth(1, 1.12, hp)) : 0);

  // 空の上の文字の色: 空の明るさから決める（ちらつかないよう、すこし幅をもたせる）
  const e = k.exposure;
  const m = [0, 1, 2].map((i) => lerp(k.hor[i], k.zen[i], 0.45) * e);
  const L = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  if (toneHold === 'dark' && L < 0.17) toneHold = 'light'; else if (toneHold === 'light' && L > 0.3) toneHold = 'dark';
  world.tone = toneHold;
  return k;
}

export const hourLabel = (h) => partOfDay(h);
export { SEASONS, SEASON_JA, SUN };
