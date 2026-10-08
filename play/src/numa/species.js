// ひだまり沼の魚種データ（日本語）。共通の計算は ../species.js
export const BAITS = {
  worm: { id: 'worm', name: 'ミミズ', desc: '底の生きものが好む定番' },
  dough: { id: 'dough', name: '練りエサ', desc: 'フナ・コイの定番' },
  gluten: { id: 'gluten', name: 'グルテン', desc: '小さな口の魚に' },
};

// rarity: 1=よくいる 2=ときどき 3=めずらしい 4=ほとんど会えない
export const SPECIES = {
  funa: {
    id: 'funa', name: 'フナ', ruby: 'ふな', latin: 'Carassius langsdorfii', kind: 'swim',
    cm: [9, 33], k: 0.0145, rarity: 1, strength: 0.3, stamina: 0.55, speed: 0.26,
    bait: { worm: 0.8, dough: 1.0, gluten: 0.6 }, minDepth: 0.4, layer: [0.35, 0.95],
    active: { dawn: 1.3, day: 1.0, dusk: 1.3, night: 0.55 }, nibble: [1, 3], hook: 1.25, count: 8, seeR: 5.5,
    desc: '「釣りはフナに始まりフナに終わる」。のんびり暮らす沼のおなじみさん。',
    thumb: [0.9, 0.55],
  },
  koi: {
    id: 'koi', name: 'コイ', ruby: 'こい', latin: 'Cyprinus carpio', kind: 'swim',
    cm: [28, 78], k: 0.0185, rarity: 2, strength: 0.82, stamina: 1.0, speed: 0.34,
    bait: { worm: 0.5, dough: 1.0, gluten: 0.25 }, minDepth: 0.9, layer: [0.7, 1.5],
    active: { dawn: 1.0, day: 0.8, dusk: 1.3, night: 1.25 }, nibble: [2, 4], hook: 1.5, count: 3, seeR: 6.5,
    desc: '沼のぬし級。ひげを揺らして底をさぐる、引きの強い大物。',
    thumb: [1.0, 0.55],
  },
  tanago: {
    id: 'tanago', name: 'タナゴ', ruby: 'たなご', latin: 'Acheilognathus melanogaster', kind: 'swim',
    cm: [5, 10], k: 0.0135, rarity: 2, strength: 0.08, stamina: 0.25, speed: 0.5,
    bait: { worm: 0.1, dough: 0.35, gluten: 1.0 }, minDepth: 0.3, layer: [0.15, 0.55],
    active: { dawn: 1.1, day: 1.0, dusk: 1.4, night: 0.35 }, nibble: [3, 6], hook: 0.85, count: 7, seeR: 4.2,
    desc: '婚姻色のひれが夕陽にきらめく、小さな宝石。そっと合わせて。',
    thumb: [0.75, 0.5],
  },
  imori: {
    id: 'imori', name: 'イモリ', ruby: 'いもり', latin: 'Cynops pyrrhogaster', kind: 'newt',
    cm: [7, 14], k: 0.0085, rarity: 2, strength: 0.06, stamina: 0.2, speed: 0.07,
    bait: { worm: 1.0, dough: 0.05, gluten: 0.0 }, minDepth: 0.12, bottom: true, maxDepth: 1.1, layer: [0.1, 1.1],
    active: { dawn: 1.0, day: 1.1, dusk: 1.0, night: 0.8 }, nibble: [1, 2], hook: 1.4, count: 5, seeR: 4.2,
    desc: 'お腹の赤は毒のしるし。井戸や田んぼを守る「井守」。そっと逃がしてあげよう。',
    thumb: [0.7, 0.5],
  },
  dojo: {
    id: 'dojo', name: 'ドジョウ', ruby: 'どじょう', latin: 'Misgurnus anguillicaudatus', kind: 'swim',
    cm: [8, 21], k: 0.0042, rarity: 2, strength: 0.22, stamina: 0.4, speed: 0.12,
    bait: { worm: 1.0, dough: 0.25, gluten: 0.15 }, minDepth: 0.3, bottom: true, maxDepth: 1.5, layer: [0.2, 1.5],
    active: { dawn: 1.0, day: 0.8, dusk: 1.2, night: 1.3 }, nibble: [1, 3], hook: 1.2, count: 4, seeR: 4.6,
    desc: '泥の中の名人。ひげでエサをさぐり、ぬるりと身をくねらせる。',
    thumb: [0.85, 0.45],
  },
  zarigani: {
    id: 'zarigani', name: 'ザリガニ', ruby: 'ざりがに', latin: 'Procambarus clarkii', kind: 'crayfish',
    cm: [6, 12], k: 0.021, rarity: 1, strength: 0.18, stamina: 0.35, speed: 0.06,
    bait: { worm: 1.0, dough: 0.2, gluten: 0.0 }, minDepth: 0.1, bottom: true, maxDepth: 1.3, layer: [0.1, 1.3],
    active: { dawn: 1.0, day: 0.9, dusk: 1.3, night: 1.1 }, nibble: [2, 3], hook: 1.4, count: 6, seeR: 4.6,
    desc: '子どものころの冒険の相棒。はさみに気をつけて！',
    thumb: [0.9, 0.55],
  },
  namazu: {
    id: 'namazu', name: 'ナマズ', ruby: 'なまず', latin: 'Silurus asotus', kind: 'swim',
    cm: [28, 62], k: 0.0098, rarity: 3, strength: 0.7, stamina: 0.9, speed: 0.1,
    bait: { worm: 1.0, dough: 0.1, gluten: 0.0 }, minDepth: 1.1, layer: [1.1, 2.0],
    active: { dawn: 1.2, day: 0.3, dusk: 1.5, night: 2.0 }, nibble: [2, 3], hook: 1.4, count: 2, seeR: 5,
    desc: '雷雨の前に騒ぐと言われる沼のぬし。ぬるぬる、のっそり。',
    thumb: [1.0, 0.45],
  },
  nishiki: {
    id: 'nishiki', name: 'ニシキゴイ', ruby: 'にしきごい', latin: 'Cyprinus rubrofuscus', kind: 'swim',
    cm: [35, 66], k: 0.02, rarity: 4, strength: 0.88, stamina: 1.0, speed: 0.3,
    bait: { worm: 0.03, dough: 1.0, gluten: 0.05 }, minDepth: 1.0, layer: [0.45, 1.05],
    active: { dawn: 1.4, day: 0.9, dusk: 1.5, night: 0.5 }, nibble: [3, 5], hook: 1.6, count: 1, seeR: 4.5,
    desc: '紅白の錦。出会えたらきっと良いことがある、沼の宝もの。',
    thumb: [1.0, 0.55],
  },
  // 季節の魚: その季節にだけ沼にあらわれる（season）。ほかの季節は、設定で季節を変えれば会える。
  hibuna: {
    id: 'hibuna', name: 'ヒブナ', ruby: 'ひぶな', latin: 'Carassius auratus (red)', kind: 'swim', season: 'spring',
    cm: [14, 31], k: 0.0155, rarity: 3, strength: 0.32, stamina: 0.55, speed: 0.26,
    bait: { worm: 0.7, dough: 1.0, gluten: 0.5 }, minDepth: 0.4, layer: [0.3, 0.9],
    active: { dawn: 1.4, day: 1.0, dusk: 1.3, night: 0.4 }, nibble: [1, 3], hook: 1.25, count: 2, seeR: 5.5,
    desc: '緋色にかがやく、春だけのフナ。水の中で、ぽっとあかりがともったよう。',
    rumor: '春、水がぬるむころ、緋色のフナを見たという話がある……。',
    thumb: [0.9, 0.55],
  },
  unagi: {
    id: 'unagi', name: 'ウナギ', ruby: 'うなぎ', latin: 'Anguilla japonica', kind: 'swim', season: 'summer',
    cm: [40, 88], k: 0.0016, rarity: 4, strength: 0.66, stamina: 0.9, speed: 0.12,
    bait: { worm: 1.0, dough: 0.05, gluten: 0.0 }, minDepth: 0.9, bottom: true, maxDepth: 2.2, layer: [0.9, 2.2],
    active: { dawn: 0.9, day: 0.12, dusk: 1.4, night: 2.4 }, nibble: [2, 4], hook: 1.6, count: 2, seeR: 5,
    desc: '夏の夜、泥のなかから出てくる、ぬるりと長い影。引きは力強い。',
    rumor: '夏の夜、底のほうで長いものが動いていた……という話がある。',
    thumb: [0.95, 0.4],
  },
  herabuna: {
    id: 'herabuna', name: 'ヘラブナ', ruby: 'へらぶな', latin: 'Carassius cuvieri (hera)', kind: 'swim', season: 'autumn',
    cm: [26, 52], k: 0.0185, rarity: 2, strength: 0.52, stamina: 0.8, speed: 0.24,
    bait: { worm: 0.1, dough: 1.0, gluten: 1.0 }, minDepth: 0.8, layer: [0.5, 1.3],
    active: { dawn: 1.3, day: 1.0, dusk: 1.3, night: 0.4 }, nibble: [3, 5], hook: 1.5, count: 3, seeR: 5,
    desc: 'へら竿のふるさと。秋は荒食いで、ふだんは用心深いのに、エサをふわっと吸いこむ。',
    rumor: '秋、大きな平たいフナがエサを吸いこんでいた……という話がある。',
    thumb: [1.0, 0.55],
  },
  wakasagi: {
    id: 'wakasagi', name: 'ワカサギ', ruby: 'わかさぎ', latin: 'Hypomesus nipponensis', kind: 'swim', season: 'winter',
    cm: [6, 14], k: 0.0065, rarity: 3, strength: 0.06, stamina: 0.2, speed: 0.45,
    bait: { worm: 0.45, dough: 0.15, gluten: 1.0 }, minDepth: 0.6, layer: [0.7, 1.6],
    active: { dawn: 1.3, day: 1.0, dusk: 1.2, night: 0.3 }, nibble: [3, 6], hook: 0.9, count: 6, seeR: 4,
    desc: '冬の沼にだけやってくる、小さな銀色のさかな。冷たい水で、ちいさく群れる。',
    rumor: '雪の季節、銀色の小さな群れが沈んでいた……という話がある。',
    thumb: [0.75, 0.45],
  },
  // 沼のぬし: ふだんは姿を見せない。雨の夜、ミミズを深く沈めると寄ってくる（count: 0 は、ふつうには住んでいないということ）
  nushi: {
    id: 'nushi', model: 'namazu', legend: true, name: '沼のぬし', ruby: 'ぬまのぬし', latin: 'Silurus asotus (senex)', kind: 'swim',
    cm: [88, 118], k: 0.0098, rarity: 4, strength: 0.96, stamina: 1.3, speed: 0.12,
    bait: { worm: 1.0, dough: 0.12, gluten: 0.0 }, minDepth: 1.5, layer: [1.4, 2.4],
    active: { dawn: 0.8, day: 0.1, dusk: 1.0, night: 2.4 }, nibble: [3, 5], hook: 1.7, count: 0, seeR: 6,
    desc: '何十年も沼の底に棲むという、苔むした大ナマズ。雨の夜だけ、深みから姿をあらわす。',
    rumor: '雨の夜、ミミズを深く沈めると、大きな影が寄ってくる……という噂。',
    thumb: [1.0, 0.42], tint: 0x9aa088,
  },
  boot: {
    id: 'boot', name: '長靴', ruby: 'ながぐつ', latin: 'Calceus rusticus', kind: 'boot',
    cm: [24, 34], k: 0.02, rarity: 1, strength: 0.32, stamina: 0.3, speed: 0,
    bait: { worm: 0, dough: 0, gluten: 0 }, minDepth: 0.3, layer: [0.3, 0.5],
    active: { dawn: 1, day: 1, dusk: 1, night: 1 }, nibble: [1, 1], hook: 1.0, count: 0, seeR: 0,
    desc: '誰かの落とし物。中に小さなカエルがいた気がする……。',
    thumb: [0.7, 0.9], junk: true,
  },
};

// 天気ごとの活性（1.0が基準）。[晴れ, くもり, 雨]
//  ナマズは雨・くもりで活発（昼の晴れはほとんど動かない）。イモリ・ドジョウ・ザリガニも雨が好き。
//  タナゴは晴れた日の浅場を好み、雨は苦手。フナ・コイはくもり〜雨に食いがよくなる。
const WX = {
  funa: [0.9, 1.15, 1.05],
  koi: [0.85, 1.1, 1.25],
  tanago: [1.2, 0.9, 0.55],
  imori: [0.9, 1.0, 1.5],
  dojo: [0.8, 1.1, 1.4],
  zarigani: [0.9, 1.1, 1.3],
  namazu: [0.55, 1.3, 2.2],
  nushi: [0.1, 0.9, 2.8],
  nishiki: [1.1, 1.0, 0.8],
  hibuna: [1.0, 1.1, 0.9],
  unagi: [0.7, 1.2, 1.6],
  herabuna: [1.0, 1.1, 0.85],
  wakasagi: [1.0, 1.1, 0.7],
  boot: [1, 1, 1],
};
for (const [id, v] of Object.entries(WX)) SPECIES[id].wx = { clear: v[0], cloudy: v[1], rain: v[2] };

// アタリの癖: ウキの動きと音が、魚ごとにちがう。見て当てるのが楽しみ。
//  tick: ちょんちょん（amp=ウキの上下の量, dur=秒, up=浮く割合, shake=震え, drift=横ずれ, gap=つつく間隔[秒], snd=音, vib=振動ms）
//  end: 本アタリ（sink=沈む深さ, rate=沈む速さ, lift=先に持ち上がる量(食い上げ), liftT=その秒数, drift, shake, ripple, splash, snd=音）
const BITE = {
  funa: { tick: { amp: -0.03, dur: 0.3, up: 0.28, gap: [0.6, 1.4], snd: 'tick' }, end: { sink: -0.4, rate: 14, snd: 'sink' }, text: 'ツン、ツンと小さくつついて、すっとウキを引き込む' },
  koi: { tick: { amp: -0.07, dur: 0.7, up: 0, gap: [0.8, 1.7], drift: 0.05, snd: 'yure', vib: 16 }, end: { sink: -0.6, rate: 8, drift: 0.14, ripple: 0.8, splash: 0.26, snd: 'heavy' }, text: 'ウキがゆっくり横へ動いて、ぐーっと深く引きずり込む' },
  tanago: { tick: { amp: -0.013, dur: 0.13, up: 0.4, gap: [0.2, 0.55], snd: 'chiku', vib: 6 }, end: { lift: 0.035, liftT: 0.45, sink: -0.13, rate: 12, snd: 'soft' }, text: 'チクチクと細かく震えて、ウキがふっと持ち上がる（食い上げ）' },
  imori: { tick: { amp: -0.016, dur: 0.85, up: 0.4, gap: [0.9, 1.8], drift: 0.03, snd: 'yure', vib: 8 }, end: { sink: -0.2, rate: 5, snd: 'soft' }, text: 'ウキがゆらゆらと揺れて、ゆっくり沈んでいく' },
  dojo: { tick: { amp: -0.02, dur: 0.6, up: 0.2, shake: 0.011, gap: [0.5, 1.1], snd: 'buru', vib: 20 }, end: { sink: -0.3, rate: 9, shake: 0.008, drift: 0.05, snd: 'sink' }, text: 'ブルブルと震えて、ウキを底のほうへ引っぱる' },
  zarigani: { tick: { amp: -0.01, dur: 0.95, up: 0.2, drift: 0.09, gap: [0.8, 1.6], snd: 'zuru', vib: 12 }, end: { sink: -0.25, rate: 6, drift: 0.22, snd: 'soft' }, text: 'ウキがずるずると横へ引きずられて、ゆっくり沈む' },
  namazu: { tick: { amp: -0.1, dur: 0.26, up: 0.1, gap: [1.0, 2.0], snd: 'gon', vib: 30 }, end: { sink: -0.75, rate: 24, ripple: 1.1, splash: 0.4, snd: 'heavy' }, text: 'ゴンッと重く突いて、ウキごと一気に引き込む' },
  nishiki: { tick: { amp: 0.03, dur: 0.8, up: 1, gap: [0.9, 1.8], snd: 'fuwa', vib: 10 }, end: { lift: 0.04, liftT: 0.5, sink: -0.5, rate: 9, ripple: 0.7, snd: 'heavy' }, text: 'ふわっとウキを持ち上げてから、ぐいっと引き込む' },
  hibuna: { tick: { amp: -0.03, dur: 0.3, up: 0.28, gap: [0.6, 1.4], snd: 'tick' }, end: { sink: -0.4, rate: 14, snd: 'sink' }, text: 'フナのように、ツン、ツンと小さくつついて、すっと沈める' },
  unagi: { tick: { amp: -0.05, dur: 0.45, up: 0, gap: [0.7, 1.5], drift: 0.04, snd: 'zuru', vib: 18 }, end: { sink: -0.5, rate: 9, drift: 0.12, shake: 0.005, ripple: 0.7, splash: 0.22, snd: 'heavy' }, text: 'ウキがじわじわ引かれて、ぐぐっと沈んでいく' },
  herabuna: { tick: { amp: -0.02, dur: 0.5, up: 0.5, gap: [0.8, 1.7], snd: 'yure', vib: 8 }, end: { sink: -0.32, rate: 12, snd: 'soft' }, text: 'ウキがじわっと戻ったり沈んだり。すっと入ったら合わせどき' },
  wakasagi: { tick: { amp: -0.012, dur: 0.14, up: 0.6, gap: [0.2, 0.5], snd: 'chiku', vib: 6 }, end: { lift: 0.02, liftT: 0.35, sink: -0.1, rate: 12, snd: 'soft' }, text: 'コツコツと小さく震えて、ウキがふわっと動く' },
  nushi: { tick: { amp: -0.12, dur: 1.2, up: 0, gap: [1.4, 2.4], drift: 0.08, snd: 'gon', vib: 40 }, end: { sink: -0.9, rate: 4, ripple: 1.3, splash: 0.5, drift: 0.2, snd: 'heavy' }, text: 'ウキが、ゆっくり、底へ引きずりこまれていく……' },
};
for (const [id, b] of Object.entries(BITE)) { SPECIES[id].bite = { tick: b.tick, end: b.end }; SPECIES[id].biteText = b.text; }
// 季節ごとの活性（1.0が基準・秋）。冬は冬眠ぎみ、春は産卵で活発、夏は暑さと夜の魚
export const SEASON_ACT = {
  spring: { funa: 1.25, koi: 1.15, tanago: 1.35, imori: 1.1, dojo: 1.2, zarigani: 1.0, namazu: 0.9, nishiki: 1.1, nushi: 0.7, hibuna: 1.2 },
  summer: { funa: 0.9, koi: 0.95, tanago: 0.8, imori: 0.8, dojo: 1.0, zarigani: 1.3, namazu: 1.3, nishiki: 0.8, nushi: 1.1, unagi: 1.3 },
  autumn: { herabuna: 1.2 },
  winter: { funa: 0.7, koi: 0.5, tanago: 0.55, imori: 0.15, dojo: 0.5, zarigani: 0.2, namazu: 0.3, nishiki: 0.45, nushi: 0.4, wakasagi: 1.2 },
};
export const LAYER_SEASON = { spring: 0.95, summer: 1.05, autumn: 1, winter: 1.15 };   // 冬は魚が深いところにしずむ
export const SPECIES_ORDER = ['funa', 'koi', 'tanago', 'imori', 'dojo', 'zarigani', 'namazu', 'nishiki', 'hibuna', 'unagi', 'herabuna', 'wakasagi', 'nushi', 'boot'];

// 行動の印（fishsim.js が読む）: 底をつつく・ジャンプする・群れる
for (const id of ['funa', 'koi', 'nishiki', 'dojo']) SPECIES[id].forager = true;
for (const id of ['funa', 'koi', 'tanago', 'nishiki']) SPECIES[id].jumper = true;
SPECIES.tanago.school = true;

// 今日のお題（daily.js）の材料。配列の中身と順番は、日付から決まる出題に影響する
export const QUEST = {
  count: ['funa', 'funa', 'tanago', 'zarigani', 'dojo', 'imori'], countN: { funa: 3, tanago: 3, zarigani: 3 }, countDefault: 2,
  size: ['funa', 'funa', 'koi', 'tanago', 'dojo'],
  shallow: { max: 0.6, hint: 'ヒント: 浅いところにいるのは、タナゴやフナ' },
  deep: { min: 1.2, hint: 'ヒント: 深いタナにはコイやナマズ。水深も見よう' },
  big: ['funa', 'koi', 'koi'],
  rare: { id: 'namazu', hint: ' ／ 夜や雨の日がねらいめ' },
  many: ['funa', 'tanago'], manyN: { funa: 6, tanago: 5 }, manyDefault: 5, manyAvoid: { tanago: 'funa' },
  titles: [[30, '沼のぬし'], [14, '沼の達人'], [7, '沼の常連'], [3, '沼のなじみ'], [1, '見習い釣り人']],
};
