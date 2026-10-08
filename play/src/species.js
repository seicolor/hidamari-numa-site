// 魚種データ（日本語）
import { SEASON_ID, SEASON_NAMES } from './season.js';
import { PLACE_ID } from './place.js';

// 魚種データは場所ごと（numa/species.js・hama/species.js）。ここは共通の計算。
const D = await import(PLACE_ID === 'hama' ? './hama/species.js' : './numa/species.js');
export const { BAITS, SPECIES, SPECIES_ORDER, QUEST } = D;
const { SEASON_ACT, LAYER_SEASON } = D;
export const DEFAULT_BITE = { tick: { amp: -0.04, dur: 0.32, up: 0.28, gap: [0.6, 1.4], snd: 'tick' }, end: { sink: -0.4, rate: 14, snd: 'sink' } };
export function seasonFactor(id) { return ((SEASON_ACT[SEASON_ID] && SEASON_ACT[SEASON_ID][id]) ?? 1) * (D.tideFactor ? D.tideFactor(id) : 1); }
// 雷のあとは、ナマズやぬしが動きだす（k: 0〜1）
export function thunderFactor(id, k) { return id === 'namazu' || id === 'nushi' ? 1 + 0.5 * k : id === 'koi' ? 1 + 0.15 * k : 1; }

// 雲の量(0〜1)と雨の強さ(0〜1)から、その魚の天気による活性を連続的に出す
export function weatherFactor(sp, overcast, rain) {
  const w = sp.wx;
  if (!w) return 1;
  const c = Math.min(1, Math.max(0, overcast / 0.7));
  const base = w.clear + (w.cloudy - w.clear) * c;
  const r = Math.min(1, Math.max(0, rain));
  return base + (w.rain - base) * r;
}

// ---------------------------------------------------------------------------
// タナ（ウキ下）
//  魚ごとに好きな深さ(layer: 水面からのm)がある。底にいる魚(bottom)は、エサが底ぎわにあるかどうかが大事。
//  晴れた昼は深く、朝夕・くもり・雨は浅いところまで浮いてくる。
export const TACKLE_MIN = 0.2;
export const TACKLE_MAX = 2.4;
export const TACKLE_STEP = 0.1;

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 魚がいるタナの伸び縮み（1が基準。晴れた昼は約1.2、雨の朝夕は約0.7）
export function layerShift(hour, overcast = 0, rain = 0) {
  const noon = sstep(8.5, 12, hour) * (1 - sstep(14.5, 17.5, hour));
  const clear = 1 - Math.min(1, Math.max(0, overcast / 0.7));
  const r = Math.min(1, Math.max(0, rain));
  return Math.max(0.6, (1 + 0.24 * noon * clear - 0.1 * (1 - noon) - 0.08 * (1 - clear) - 0.16 * r) * LAYER_SEASON[SEASON_ID]);
}

// いまの仕掛け（ウキ下）が、その魚のいるタナに合っているか(0〜1)
//  bd: エサの深さ(m・正)  floor: その場所の水深(m・正)
export function layerFit(sp, bd, floor, shift = 1) {
  if (sp.junk || !sp.layer) return 1;
  if (sp.bottom) {
    const h = Math.max(0, floor - bd); // 底からエサまでの高さ
    return 1 - sstep(0.14, 0.42, h);
  }
  // 浅いところでは、タナも水深におさまる
  const lo = Math.min(sp.layer[0] * shift, Math.max(0.1, floor - 0.15));
  const hi = Math.min(sp.layer[1] * shift, floor);
  const out = bd < lo ? lo - bd : bd > hi ? bd - hi : 0;
  return 1 - sstep(0, 0.32, out);
}

// 図鑑・ヒント用の言いかた
export function layerText(sp) {
  if (sp.junk || !sp.layer) return '';
  if (sp.bottom) return '底ぎわ（エサを底まで）';
  const [lo, hi] = sp.layer;
  const mid = (lo + hi) / 2;
  const nm = mid < 0.55 ? '浅いタナ' : mid < 1.0 ? '中ほどのタナ' : mid < 1.4 ? 'やや深いタナ' : '深いタナ';
  return `${nm}（水面から ${lo.toFixed(1)}〜${hi.toFixed(1)} m）`;
}

// 図鑑に出す「活性が高い時間・天気」
export function likesOf(sp) {
  const T = { dawn: '朝まずめ', day: '昼', dusk: '夕まずめ', night: '夜' };
  const W = { clear: '晴れ', cloudy: 'くもり', rain: '雨' };
  const times = Object.entries(sp.active).filter(([, v]) => v >= 1.2).map(([k]) => T[k]);
  const wx = sp.wx ? Object.entries(sp.wx).filter(([, v]) => v >= 1.2).map(([k]) => W[k]) : [];
  const poorT = Object.entries(sp.active).filter(([, v]) => v <= 0.4).map(([k]) => T[k]);
  const poorW = sp.wx ? Object.entries(sp.wx).filter(([, v]) => v <= 0.6).map(([k]) => W[k]) : [];
  return { times, wx, poor: [...poorT, ...poorW] };
}

// 季節の魚か／いまの季節にいる魚か
export const isSeasonal = (sp) => !!sp.season;
export const inSeason = (sp) => !sp.season || sp.season === SEASON_ID;
export const seasonLabel = (sp) => (sp.season ? `${SEASON_NAMES[sp.season]}だけ` : '');

export function weightG(sp, cm) {
  return sp.k * Math.pow(cm, 3);
}

export function fmtWeight(g) {
  if (g >= 1000) return (g / 1000).toFixed(2) + ' kg';
  if (g >= 100) return Math.round(g) + ' g';
  return g.toFixed(1) + ' g';
}

export function rollLength(sp, rng) {
  const [a, b] = sp.cm;
  const r = Math.pow(rng(), 1.8);
  return a + (b - a) * r;
}

export function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(4 - n);
}
