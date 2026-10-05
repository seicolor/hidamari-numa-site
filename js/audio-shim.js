// audio.js が、ゲーム本体の季節・道具に頼っていた部分の代わり
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export let SEASON_ID = 'autumn';
export const SEASON = { snow: false };
export function setSeason(id) { SEASON_ID = id; SEASON.snow = id === 'winter'; }
