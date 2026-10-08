// 季節（ひだまり浜）: ハワイの乾季（夏）と雨季（冬）。ID は夏 summer / 冬 winter
//  夏: 日ざしが強く、貿易風が安定。雲は少なく、空も海も青い。
//  冬: 日が短く、にわか雨が増える。波も少し高く、空には雲が多い。
// 選びかた: URL の ?season= → 設定（保存）→ おまかせ（今日の日付）。切りかえは読み込み直し。
export const SEASON_IDS = ['summer', 'winter'];
export const SEASON_NAMES = { summer: '夏', winter: '冬' };

// 日付から（5〜10月=夏の乾季、11〜4月=冬の雨季）
export function seasonOfDate(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 5 && m <= 10 ? 'summer' : 'winter';
}

function readSetting() {
  try {
    const d = JSON.parse(localStorage.getItem('hidamari-hama-v1') || 'null');
    return d && d.settings ? d.settings.season : null;
  } catch (e) { return null; }
}

export function pickSeason() {
  let p = null;
  try { p = new URLSearchParams(location.search).get('season'); } catch (e) { /* ignore */ }
  const s = p || readSetting();
  return SEASON_IDS.includes(s) ? s : seasonOfDate();
}

// numa/season.js と同じ項目のうち、共通のコードが読むものだけ。景色の色は hama/terrain.js・hama/world.js が持つ。
const TABLE = {
  summer: {
    id: 'summer', name: '夏',
    sun: { rise: 5.8, set: 19.2, maxEl: 64 }, sky: { exposure: 0.98, haze: 0.78, cloud: -0.14, mistK: 0.45, cumulus: 1 },
    fall: 'none', snow: false, dragonfly: 0, firefly: 0, frog: 0, fish: 1, thunder: 0.05,
    wxNames: { clear: '晴れ', cloudy: 'くもり', rain: 'にわか雨' },
    // 貿易風・波・潮の目安（hama だけが読む）
    sea: { swell: 0.8, trade: 1.0, shower: 0.35, tideAmp: 0.42, lagoon: 1.0 },
  },
  winter: {
    id: 'winter', name: '冬',
    sun: { rise: 7.0, set: 17.9, maxEl: 46 }, sky: { exposure: 1.0, haze: 1.0, cloud: 0.12, mistK: 0.6, cumulus: 1 },
    fall: 'none', snow: false, dragonfly: 0, firefly: 0, frog: 0, fish: 0.92, thunder: 0.22,
    wxNames: { clear: '晴れ', cloudy: 'くもり', rain: 'にわか雨' },
    sea: { swell: 1.5, trade: 0.7, shower: 0.9, tideAmp: 0.42, lagoon: 0.85 },
  },
};

export const SEASON_ID = pickSeason();
export const SEASON = TABLE[SEASON_ID];
export const SEASONS = TABLE;
