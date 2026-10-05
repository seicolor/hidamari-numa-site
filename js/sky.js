// 時刻と季節から、空・光・水の色をつくる（ゲーム「ひだまり沼」の空の表を、ページ用に移したもの）
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_JA = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const SEASON_EN = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lin = (hex, m = 1) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => { v /= 255; return (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) * m; });
const mixA = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// 日の出・日の入り・南中高度（季節ごと）
export const SUN = {
  spring: { rise: 5.5, set: 18.5, maxEl: 56 },
  summer: { rise: 4.8, set: 19.2, maxEl: 70 },
  autumn: { rise: 6.0, set: 18.0, maxEl: 58 },
  winter: { rise: 6.9, set: 16.8, maxEl: 32 },
};

// 太陽高度（度）ごとのキー
const KEYS = [
  { e: -24, zen: lin(0x03060f), hor: lin(0x0a1224), glow: lin(0x201020), glowAmt: 0.0, sunCol: lin(0xff5a22), amb: lin(0x2c4478, 0.5), cloudLit: lin(0x1a2036), cloudDark: lin(0x05070e), exposure: 1.5 },
  { e: -10, zen: lin(0x0b1330), hor: lin(0x2a2a4e), glow: lin(0x6a2a4a), glowAmt: 0.25, sunCol: lin(0xff5a22), amb: lin(0x2a3768, 0.55), cloudLit: lin(0x4a3558), cloudDark: lin(0x0c1020), exposure: 1.35 },
  { e: -4, zen: lin(0x1a2a62), hor: lin(0xb8606c, 1.1), glow: lin(0xff4a2a), glowAmt: 0.85, sunCol: lin(0xff4a18), amb: lin(0x6a5a9a, 0.6), cloudLit: lin(0xff6a4a, 1.3), cloudDark: lin(0x3a3260), exposure: 1.1 },
  { e: 1, zen: lin(0x2a54a0), hor: lin(0xff8a4a, 1.2), glow: lin(0xff6a22, 1.2), glowAmt: 1.0, sunCol: lin(0xff6a22), amb: lin(0x9a86c0, 0.8), cloudLit: lin(0xffa070, 1.9), cloudDark: lin(0x5a4a78), exposure: 1.05 },
  { e: 7, zen: lin(0x4079c0), hor: lin(0xffc490, 1.0), glow: lin(0xffa04a, 1.0), glowAmt: 0.75, sunCol: lin(0xff9a48), amb: lin(0x9ab6e6, 0.95), cloudLit: lin(0xffc890, 1.8), cloudDark: lin(0x7a7aa0), exposure: 1.0 },
  { e: 18, zen: lin(0x4585d2), hor: lin(0xd2e0ec), glow: lin(0xffd9a0), glowAmt: 0.3, sunCol: lin(0xffd9a8), amb: lin(0x9fc2f0, 1.0), cloudLit: lin(0xfff0dc, 1.5), cloudDark: lin(0x8a9cc0), exposure: 0.95 },
  { e: 40, zen: lin(0x3a7bd0), hor: lin(0xbcd8ec), glow: lin(0xffe9c0), glowAmt: 0.1, sunCol: lin(0xfff0dc), amb: lin(0xa6c8f4, 1.05), cloudLit: lin(0xffffff, 1.4), cloudDark: lin(0x92a6c8), exposure: 0.9 },
  { e: 62, zen: lin(0x3277d2), hor: lin(0xb2d4ee), glow: lin(0xfff0d0), glowAmt: 0.05, sunCol: lin(0xfff4e4), amb: lin(0xaacdf6, 1.08), cloudLit: lin(0xffffff, 1.4), cloudDark: lin(0x98acce), exposure: 0.88 },
];

function sample(e) {
  if (e <= KEYS[0].e) return KEYS[0];
  if (e >= KEYS[KEYS.length - 1].e) return KEYS[KEYS.length - 1];
  let i = 0;
  while (e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = sstep(0, 1, (e - a.e) / (b.e - a.e));
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? mixA(a[k], b[k], t) : lerp(a[k], b[k], t);
  return o;
}

// 季節ごとの色合い
const SEASON_LOOK = {
  spring: { sat: 1.0, haze: 1.18, cloud: 0.05, water: lin(0x143a34), accent: '#f2a9b8' },
  summer: { sat: 1.08, haze: 0.9, cloud: -0.05, water: lin(0x0d3a30), accent: '#7fd6a0' },
  autumn: { sat: 1.0, haze: 1.0, cloud: 0.0, water: lin(0x1a3a2a), accent: '#f0a05a' },
  winter: { sat: 0.7, haze: 1.3, cloud: 0.1, water: lin(0x1c3238), accent: '#bcd8ea' },
};
export const ACCENT = Object.fromEntries(Object.entries(SEASON_LOOK).map(([k, v]) => [k, v.accent]));

// seasonW: [春, 夏, 秋, 冬] の重み（合計1）。季節をなめらかにつなぐ
export function sky(hour, seasonW, rain = 0) {
  // 季節の重みつきで、日の出・日の入り・南中高度を混ぜる
  let rise = 0, set = 0, maxEl = 0, haze = 0, cloud = 0, sat = 0;
  const water = [0, 0, 0];
  SEASONS.forEach((s, i) => {
    const w = seasonW[i];
    rise += SUN[s].rise * w; set += SUN[s].set * w; maxEl += SUN[s].maxEl * w;
    haze += SEASON_LOOK[s].haze * w; cloud += SEASON_LOOK[s].cloud * w; sat += SEASON_LOOK[s].sat * w;
    for (let k = 0; k < 3; k++) water[k] += SEASON_LOOK[s].water[k] * w;
  });
  const h = ((hour % 24) + 24) % 24;
  const day = set - rise;
  let a, dayFrac, nightFrac = 0;
  if (h >= rise && h <= set) { a = ((h - rise) / day) * Math.PI; dayFrac = (h - rise) / day; }
  else { const t = ((h - set + 24) % 24) / (24 - day); a = Math.PI + t * Math.PI; dayFrac = h > set ? 1 : 0; nightFrac = t; }
  const elev = Math.sin(a) * maxEl;
  const k = sample(elev);
  const night = sstep(2, -12, elev);
  const sunVis = sstep(-1.5, 0.5, elev);
  // 太陽: 左から右へ。月: 夜のあいだに左から右へ
  const sunX = lerp(-0.78, 0.78, clamp(dayFrac));
  const sunSin = Math.max(Math.sin(a), -0.2);
  const moonT = clamp(nightFrac);
  const moonX = lerp(-0.7, 0.7, moonT);
  const moonY = 0.13 + 0.2 * Math.sin(Math.PI * moonT);
  // 色の彩度（冬は白っぽく）
  // 雨のときは、色が灰色がかって、すこし暗くなる
  const gr = clamp(rain) * 0.62, dk = 1 - clamp(rain) * 0.22;
  const desat = (c) => { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return c.map((v) => lerp(lerp(l, v, sat), l, gr) * dk); };
  return {
    elev, night, sunVis: sunVis * (1 - clamp(rain) * 0.92), exposure: k.exposure,
    zen: desat(k.zen), hor: desat(k.hor), glow: desat(k.glow), glowAmt: k.glowAmt * (1 - clamp(rain) * 0.85), sunCol: k.sunCol.map((v) => v * (1 - clamp(rain) * 0.5)), amb: desat(k.amb),
    cloudLit: desat(k.cloudLit), cloudDark: desat(k.cloudDark), cover: lerp(clamp(0.4 + cloud, 0.15, 0.95), 0.97, clamp(rain)),
    sunX, sunH: sunSin * 0.4, moonX, moonH: moonY, haze, water,
    daylight: sstep(-6, 8, elev),
  };
}

// 時刻の呼び名
export function partOfDay(h) {
  h = ((h % 24) + 24) % 24;
  if (h < 4.5) return '夜更け';
  if (h < 6) return '明け方';
  if (h < 9) return '朝';
  if (h < 14) return '昼';
  if (h < 16.5) return '午後';
  if (h < 18.5) return '夕方';
  if (h < 20) return '夕暮れ';
  if (h < 22.5) return '宵';
  return '夜';
}

export function seasonOfDate(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}
