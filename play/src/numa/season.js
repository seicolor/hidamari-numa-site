// 季節: 春・夏・秋・冬。景色の色や木の姿、降るもの、魚の食いが、季節でかわる。
// 選びかた: URL の ?season= → 設定（保存）→ おまかせ（今日の日付）。切りかえは読み込み直し。
export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

// 日付から（3〜5月=春、6〜8月=夏、9〜11月=秋、12〜2月=冬）
export function seasonOfDate(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

function readSetting() {
  try {
    const d = JSON.parse(localStorage.getItem('hidamari-numa-v1') || 'null');
    return d && d.settings ? d.settings.season : null;
  } catch (e) { return null; }
}

export function pickSeason() {
  let p = null;
  try { p = new URLSearchParams(location.search).get('season'); } catch (e) { /* ignore */ }
  const s = p || readSetting();
  return SEASON_IDS.includes(s) ? s : seasonOfDate();
}

// 色は 0xRRGGBB。使うがわで hexToLinear などにする
const TABLE = {
  autumn: {
    id: 'autumn', name: '秋',
    // 地面（terrain.js）
    ground: { grassA: 0x6f8a34, grassB: 0x93a043, grassC: 0xb0a24e, grassDry: 0xc2aa5a, oakY: 0x9a7c2e, oakR: 0x9a4422, oakG: 0x566f2c, field: 0xb59a52, cedar: 0x274630, cedarB: 0x35563a, mud: 0x56442c },
    // 落葉樹の葉（flora.js）: 低い値→高い値のグラデーション
    leaf: { mode: 'full', pal: [0x4f7a30, 0x7e9c38, 0xe6b432, 0xe0702a, 0xc9361c, 0xa0562a], dull: 0x6a5a30, dullAmt: 0.22, k: 0.92 },
    cedarTint: [1, 1, 1], cedarSnow: 0,
    blade: { meadow: [0x2d3e12, 0x88a23a, 0xb59a46], tall: [0x303f14, 0x93a640, 0xb59a46], susuki: [0x3a4a1c, 0xa9a257, 0xc8b46c], reed: [0x3b4a1e, 0xa0a24c, 0xb89c54], gama: [0x33471d, 0x7f9a3a, 0xa89a4a], density: 1 },
    plumes: true, reedPlumes: true, higan: true, lilyFlower: 0.08, fruit: 1,
    hero: { kaki: [0.18, 0.28, 0.05], momiji: [0.30, 0.05, 0.02], ginkgo: [0.62, 0.30, 0.015], momiji2: [0.5, 0.12, 0.02] },
    sun: { rise: 6, set: 18, maxEl: 58 }, sky: { exposure: 1, haze: 1, cloud: 0 },
    fall: 'leaves', snow: false, dragonfly: 1, firefly: 1, frog: 0.6, fish: 1, thunder: 0.25,
    wxNames: { clear: '晴れ', cloudy: 'くもり', rain: '雨' },
  },
  spring: {
    id: 'spring', name: '春',
    ground: { grassA: 0x7ea845, grassB: 0x9ec04e, grassC: 0xb7c95d, grassDry: 0xc4c46a, oakY: 0xa8c460, oakR: 0xe0a3b4, oakG: 0x7fae48, field: 0x86a85c, cedar: 0x2a4d34, cedarB: 0x3a6040, mud: 0x5a4a30 },
    // 桜（ピンク〜白）と新緑がまだらに
    leaf: { mode: 'full', pal: [0xa4cc5c, 0xfcc2b4, 0xffe2d6, 0xf8b8ac, 0xfcd4c8, 0xfcc2b4, 0xffe2d6, 0xb4d46a], dull: 0xf4e0d0, dullAmt: 0.05, k: 1.3 },
    cedarTint: [1, 1.03, 1], cedarSnow: 0,
    blade: { meadow: [0x2f4a14, 0xa4d454, 0xc6cf6a], tall: [0x33501a, 0xa6d058, 0xc6cf6a], susuki: [0x35501c, 0x8fb04a, 0xa0b860], reed: [0x35501c, 0x8fb04a, 0xa0b860], gama: [0x2f5018, 0x84b040, 0xa0b860], density: 1 },
    plumes: false, reedPlumes: false, higan: false, lilyFlower: 0.04, fruit: 0,
    hero: { kaki: [0.24, 0.44, 0.08], momiji: [0.26, 0.46, 0.1], ginkgo: [0.34, 0.5, 0.1], momiji2: [0.85, 0.5, 0.55] },
    sun: { rise: 5.5, set: 18.5, maxEl: 56 }, sky: { exposure: 1.02, haze: 1.18, cloud: 0.05 },
    fall: 'petals', snow: false, dragonfly: 0, firefly: 0.2, frog: 1, fish: 1.08, thunder: 0.3,
    wxNames: { clear: '晴れ', cloudy: 'くもり', rain: '雨' },
  },
  summer: {
    id: 'summer', name: '夏',
    ground: { grassA: 0x4f7a26, grassB: 0x5f8f2e, grassC: 0x739c38, grassDry: 0x8da043, oakY: 0x4b7f2a, oakR: 0x3f7a30, oakG: 0x2f6a24, field: 0x5c9a3a, cedar: 0x1f4026, cedarB: 0x2c5030, mud: 0x4a3c26 },
    leaf: { mode: 'full', pal: [0x346c24, 0x437d2d, 0x568f36, 0x69a043, 0x4a8530, 0x3a7428], dull: 0x4a6a28, dullAmt: 0.12, k: 1.12 },
    cedarTint: [0.95, 1, 0.95], cedarSnow: 0,
    blade: { meadow: [0x1e3a0e, 0x6fa634, 0x93ad48], tall: [0x203f10, 0x74ac38, 0x93ad48], susuki: [0x2a4a18, 0x6f9a3a, 0x88a848], reed: [0x2a4a18, 0x6f9a3a, 0x88a848], gama: [0x24471a, 0x5f9a34, 0x88a848], density: 1.15 },
    plumes: false, reedPlumes: false, higan: false, lilyFlower: 0.3, fruit: 0,
    hero: { kaki: [0.08, 0.26, 0.04], momiji: [0.10, 0.28, 0.04], ginkgo: [0.12, 0.30, 0.05], momiji2: [0.09, 0.27, 0.04] },
    sun: { rise: 4.8, set: 19.2, maxEl: 70 }, sky: { exposure: 0.97, haze: 0.9, cloud: -0.05 },
    fall: 'none', snow: false, dragonfly: 0.4, firefly: 1.2, frog: 1, fish: 1, thunder: 1,
    wxNames: { clear: '晴れ', cloudy: 'くもり', rain: '雨' },
  },
  winter: {
    id: 'winter', name: '冬',
    // 雪の野原。岸の泥と小道の土だけが黒く残る
    ground: { grassA: 0xdde6ec, grassB: 0xe8eff3, grassC: 0xcdd8df, grassDry: 0xb7b198, oakY: 0xa49a84, oakR: 0x8a7e6c, oakG: 0x9a937f, field: 0xe6edf1, cedar: 0x2c4a3a, cedarB: 0x3d5c4a, mud: 0x4a3c2c },
    leaf: { mode: 'bare', pal: [], dull: 0, dullAmt: 0, k: 1 },
    cedarTint: [1.05, 1.08, 1.1], cedarSnow: 0.38,
    blade: { meadow: [0x6d6044, 0xcdbd8a, 0xdccf9e], tall: [0x6d6044, 0xd0c090, 0xdccf9e], susuki: [0x6a5a3a, 0xcdbd8a, 0xdccf9e], reed: [0x6a5a3a, 0xbba878, 0xcdbd8a], gama: [0x5a5034, 0xa89a6a, 0xbba878], density: 0.4 },
    plumes: true, reedPlumes: true, higan: false, lilyFlower: 0, fruit: 0.4,
    hero: { kaki: [0.2, 0.18, 0.12], momiji: [0.2, 0.18, 0.12], ginkgo: [0.2, 0.18, 0.12], momiji2: [0.2, 0.18, 0.12] },
    sun: { rise: 6.9, set: 16.8, maxEl: 32 }, sky: { exposure: 1.06, haze: 1.3, cloud: 0.1 },
    fall: 'none', snow: true, dragonfly: 0, firefly: 0, frog: 0, fish: 0.6, thunder: 0,
    wxNames: { clear: '晴れ', cloudy: 'くもり', rain: '雪' },
  },
};

export const SEASON_ID = pickSeason();
export const SEASON = TABLE[SEASON_ID];
export const SEASONS = TABLE;
