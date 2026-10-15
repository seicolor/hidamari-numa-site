// 季節（ひだまり港）: 沖縄の夏（5〜10月、台風の季節）と冬（11〜4月、北風の季節）。ID は夏 summer / 冬 winter
//  夏: 日ざしが強く、夕なぎ。入道雲が立ち、台風の前は空と海がざわつく。
//  冬: 日が短く、北風でくもりがち。波が高く、にわか雨も。
// 選びかた: URL の ?season= → 設定（保存）→ おまかせ（今日の日付）。切りかえは読み込み直し。
import { L } from '../i18n.js';
export const SEASON_IDS = ['summer', 'winter'];
export const SEASON_NAMES = { summer: L('夏', 'Summer'), winter: L('冬', 'Winter') };

export function seasonOfDate(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 5 && m <= 10 ? 'summer' : 'winter';
}

function readSetting() {
  try {
    const d = JSON.parse(localStorage.getItem('hidamari-oki-v1') || 'null');
    return d && d.settings ? d.settings.season : null;
  } catch (e) { return null; }
}

export function pickSeason() {
  let p = null;
  try { p = new URLSearchParams(location.search).get('season'); } catch (e) { /* ignore */ }
  const s = p || readSetting();
  return SEASON_IDS.includes(s) ? s : seasonOfDate();
}

// 共通のコードが読む項目。景色の色は oki/terrain.js・oki/world.js が持つ。
//  sun は日本標準時（沖縄は東京より日の入りが遅い: 夏は19時半ごろ、冬は18時前）、maxEl は正午の太陽の高さ
const TABLE = {
  summer: {
    id: 'summer', name: L('夏', 'Summer'),
    sun: { rise: 6.2, set: 19.5, maxEl: 78 }, sky: { exposure: 0.98, haze: 0.9, cloud: -0.05, mistK: 0.5, cumulus: 1 },
    fall: 'none', snow: false, dragonfly: 0, firefly: 0, frog: 0, fish: 1, thunder: 0.12,
    wxNames: { clear: L('晴れ', 'Clear'), cloudy: L('くもり', 'Cloudy'), rain: L('スコール', 'Squall') },
    // 波・潮の目安（oki だけが読む）。tideAmp は半日周期の振れ幅(m)。実際の沖縄の大潮は干満差2mほど（ここは遊びやすく縮めてある）
    sea: { swell: 0.9, trade: 0.8, shower: 0.45, tideAmp: 0.5, lagoon: 1.0 },
  },
  winter: {
    id: 'winter', name: L('冬', 'Winter'),
    sun: { rise: 7.1, set: 17.9, maxEl: 41 }, sky: { exposure: 1.0, haze: 1.05, cloud: 0.2, mistK: 0.6, cumulus: 0 },
    fall: 'none', snow: false, dragonfly: 0, firefly: 0, frog: 0, fish: 0.88, thunder: 0.15,
    wxNames: { clear: L('晴れ', 'Clear'), cloudy: L('くもり', 'Cloudy'), rain: L('小雨', 'Drizzle') },
    sea: { swell: 1.6, trade: 1.1, shower: 0.6, tideAmp: 0.5, lagoon: 0.85 },
  },
};

export const SEASON_ID = pickSeason();
export const SEASON = TABLE[SEASON_ID];
export const SEASONS = TABLE;
