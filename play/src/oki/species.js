// ひだまり港の魚種データ（日本語）。共通の計算は ../species.js
import { EN } from '../i18n.js';
//  沖縄の港・堤防で釣れる魚を中心に。夕方〜夜のタマンやガーラ、礁の魚たち。
//  体の絵・形は、浜の魚（../reeffish.js）を使いまわす（model）。沖縄ならではの魚の体は、あとで足していく。
import '../reeffish.js';
import { TIDE } from './terrain.js';
import { G } from '../materials.js';

// エサ（ID は沼・浜と同じ worm / dough / gluten。キー 1・2・3 に対応）
export const BAITS = {
  worm: { id: 'worm', name: 'オキアミ', desc: 'たいていの魚が寄ってくる定番' },
  dough: { id: 'dough', name: 'のりパン', desc: 'ブダイなど、藻を食べる魚に' },
  gluten: { id: 'gluten', name: 'あみえび', desc: '小さな口の魚に' },
};

// rarity: 1=よくいる 2=ときどき 3=めずらしい 4=ほとんど会えない
export const SPECIES = {
  yugoi: {
    id: 'yugoi', model: 'aholehole', name: 'ユゴイ', ruby: 'ゆごい', latin: 'Kuhlia marginata', kind: 'swim',
    cm: [10, 28], k: 0.0125, rarity: 1, strength: 0.3, stamina: 0.5, speed: 0.34,
    bait: { worm: 0.8, dough: 1.0, gluten: 0.6 }, minDepth: 0.4, layer: [0.2, 1.2],
    active: { dawn: 1.2, day: 0.8, dusk: 1.5, night: 1.6 }, nibble: [1, 3], hook: 1.2, count: 9, seeR: 5,
    desc: '港の中を、銀色の群れで泳ぎまわる、港のおなじみさん。夕ぐれから夜に、よく食いつく。',
    thumb: [0.95, 0.5], jumper: true, school: true,
  },
  muramasa: {
    id: 'muramasa', name: 'ムラサメモンガラ', ruby: 'むらさめもんがら', latin: 'Rhinecanthus rectangulus', kind: 'swim', reef: true,
    cm: [13, 24], k: 0.05, rarity: 2, strength: 0.5, stamina: 0.7, speed: 0.28,
    bait: { worm: 1.0, dough: 0.2, gluten: 0.8 }, minDepth: 0.5, layer: [0.2, 1.4],
    active: { dawn: 1.1, day: 1.4, dusk: 1.0, night: 0.1 }, nibble: [2, 3], hook: 1.4, count: 3, seeR: 5,
    desc: '堤防の石組みやサンゴのまわりにいる、ちいさな岩場の魚。小さな口で、エサをガブッとかじる。',
    thumb: [0.85, 0.65], forager: true,
  },
  hashinaga: {
    id: 'hashinaga', name: 'フエヤッコダイ', ruby: 'ふえやっこだい', latin: 'Forcipiger flavissimus', kind: 'swim', reef: true,
    cm: [10, 19], k: 0.028, rarity: 2, strength: 0.25, stamina: 0.45, speed: 0.26,
    bait: { worm: 0.7, dough: 0.2, gluten: 1.0 }, minDepth: 0.6, layer: [0.5, 1.8],
    active: { dawn: 1.1, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [2, 5], hook: 1.5, count: 4, seeR: 5,
    desc: 'ピンセットのような長い口先で、岩のすきまの小さな虫をつまみ出す。まぶしい黄色に、黒い頭。',
    thumb: [0.85, 0.7], forager: true,
  },
  tsunodashi: {
    id: 'tsunodashi', name: 'ツノダシ', ruby: 'つのだし', latin: 'Zanclus cornutus', kind: 'swim', reef: true,
    cm: [12, 22], k: 0.04, rarity: 3, strength: 0.35, stamina: 0.55, speed: 0.24,
    bait: { worm: 0.3, dough: 0.7, gluten: 0.9 }, minDepth: 0.7, layer: [0.4, 1.8],
    active: { dawn: 1.0, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [2, 5], hook: 1.7, count: 2, seeR: 5.5,
    desc: '白・黒・黄のおびと、長くなびく背びれ。見かけるだけで幸運といわれる。エサには、とても用心深い。',
    thumb: [0.8, 0.8],
  },
  irabucha: {
    id: 'irabucha', model: 'uhu', name: 'イラブチャー（ナガブダイ）', ruby: 'いらぶちゃー', latin: 'Scarus rubroviolaceus', kind: 'swim', reef: true,
    cm: [20, 50], k: 0.022, rarity: 3, strength: 0.7, stamina: 0.85, speed: 0.3,
    bait: { worm: 0.2, dough: 1.0, gluten: 0.3 }, minDepth: 0.9, layer: [0.6, 2.0],
    active: { dawn: 1.1, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [2, 4], hook: 1.5, count: 2, seeR: 6,
    desc: '沖縄では「イラブチャー」。くちばしのような歯で、岩の藻をかじりとる。見かけによらず、引きが強い。',
    thumb: [0.95, 0.5], forager: true,
  },
  taman: {
    id: 'taman', model: 'aholehole', tint: 0xcfc8a0, name: 'タマン（ハマフエフキ）', ruby: 'たまん', latin: 'Lethrinus nebulosus', kind: 'swim', reef: true,
    cm: [30, 75], k: 0.0155, rarity: 3, strength: 0.85, stamina: 0.95, speed: 0.55,
    bait: { worm: 1.0, dough: 0.05, gluten: 0.3 }, minDepth: 1.2, layer: [1.2, 2.3],
    active: { dawn: 1.2, day: 0.3, dusk: 1.6, night: 2.0 }, nibble: [1, 3], hook: 1.4, count: 1, seeR: 6.5,
    desc: '沖縄の釣り人があこがれる、夜の大物。夕方から夜、浅場へ寄ってくる。重たい引きで、岩に潜ろうとする。',
    thumb: [0.95, 0.55],
  },
  gara: {
    id: 'gara', model: 'papio', name: 'ガーラ（ロウニンアジの若魚）', ruby: 'がーら', latin: 'Caranx ignobilis (juv.)', kind: 'swim',
    cm: [22, 55], k: 0.019, rarity: 3, strength: 0.9, stamina: 0.85, speed: 0.75,
    bait: { worm: 1.0, dough: 0.1, gluten: 0.5 }, minDepth: 0.8, layer: [0.2, 1.6],
    active: { dawn: 1.6, day: 0.7, dusk: 1.7, night: 0.8 }, nibble: [1, 2], hook: 1.3, count: 2, seeR: 7,
    desc: '沖縄では、アジの仲間の大物を「ガーラ」とよぶ。朝夕のまずめに、小魚を追って港へ。足が速く、走る。',
    thumb: [0.95, 0.55], jumper: true,
  },
  // 港のぬし: ふだんは港に入ってこない。夜、にわか雨のなか、オキアミを深く沈めると寄ってくる（count: 0 は、ふつうには住んでいないということ）
  nushi: {
    id: 'nushi', model: 'ulua', legend: true, name: '巨大ガーラ（港のぬし）', ruby: 'がーら', latin: 'Caranx ignobilis', kind: 'swim',
    cm: [95, 130], k: 0.0185, rarity: 4, strength: 0.96, stamina: 1.3, speed: 0.7,
    bait: { worm: 1.0, dough: 0.05, gluten: 0.1 }, minDepth: 1.6, layer: [1.5, 2.5],
    active: { dawn: 0.8, day: 0.1, dusk: 1.0, night: 2.4 }, nibble: [2, 3], hook: 1.7, count: 0, seeR: 7,
    desc: '何十年も外海を渡ってきた、ロウニンアジの大物。夜のにわか雨のとき、堤防の先の暗がりから、港の深みへ入ってくる。',
    rumor: '雨の夜、オキアミを深く沈めると、大きな影が寄ってくる……という噂。',
    thumb: [1.0, 0.55], tint: 0xdfd6b8,
  },
  boot: {
    id: 'boot', model: 'sandal', name: '島ぞうり', ruby: 'しまぞうり', latin: 'Calceus insularis', kind: 'boot',
    cm: [24, 30], k: 0.012, rarity: 1, strength: 0.3, stamina: 0.3, speed: 0,
    bait: { worm: 0, dough: 0, gluten: 0 }, minDepth: 0.3, layer: [0.3, 0.5],
    active: { dawn: 1, day: 1, dusk: 1, night: 1 }, nibble: [1, 1], hook: 1.0, count: 0, seeR: 0,
    desc: '誰かの落とし物。沖縄では「島ぞうり」とよばれる、島の定番の履物。',
    thumb: [0.8, 0.9], junk: true,
  },
};

// 天気ごとの活性（1.0が基準）。[晴れ, くもり, 雨]
const WX = {
  yugoi: [0.9, 1.1, 1.3], muramasa: [1.1, 1.0, 0.8], hashinaga: [1.15, 0.95, 0.55], tsunodashi: [1.2, 0.9, 0.5],
  irabucha: [1.2, 0.9, 0.6], taman: [0.8, 1.1, 1.5], gara: [0.8, 1.15, 1.6], nushi: [0.1, 0.9, 2.8], boot: [1, 1, 1],
};
for (const [id, v] of Object.entries(WX)) SPECIES[id].wx = { clear: v[0], cloudy: v[1], rain: v[2] };

// アタリの癖: ウキの動きと音が、魚ごとにちがう（意味は numa/species.js を参照）
const BITE = {
  yugoi: { tick: { amp: -0.03, dur: 0.28, up: 0.3, gap: [0.5, 1.2], snd: 'tick' }, end: { sink: -0.4, rate: 14, snd: 'sink' }, text: 'ツン、ツンと細かくつついて、すっとウキを引き込む' },
  muramasa: { tick: { amp: -0.06, dur: 0.22, up: 0.1, gap: [0.5, 1.1], snd: 'gon', vib: 22 }, end: { sink: -0.55, rate: 20, ripple: 0.7, splash: 0.2, snd: 'heavy' }, text: 'ガブッ、ガブッと強くかじって、ウキをぐいっと引きずり込む' },
  hashinaga: { tick: { amp: -0.012, dur: 0.12, up: 0.5, gap: [0.2, 0.6], snd: 'chiku', vib: 6 }, end: { lift: 0.02, liftT: 0.3, sink: -0.12, rate: 12, snd: 'soft' }, text: 'ツンツンと、とても小さくつつく。ウキがピクッと動いたら合わせる' },
  tsunodashi: { tick: { amp: -0.02, dur: 0.9, up: 0.5, gap: [1.0, 2.2], drift: 0.04, snd: 'yure', vib: 8 }, end: { sink: -0.25, rate: 7, drift: 0.1, snd: 'soft' }, text: 'ウキがゆらゆら。ためらいながら、そっと沈める' },
  irabucha: { tick: { amp: -0.04, dur: 0.6, up: 0.2, gap: [0.8, 1.6], drift: 0.05, snd: 'zuru', vib: 14 }, end: { sink: -0.55, rate: 9, drift: 0.14, ripple: 0.7, splash: 0.22, snd: 'heavy' }, text: 'ウキがじわじわ引かれて、ぐぐっと深くに沈む' },
  taman: { tick: { amp: -0.05, dur: 0.5, up: 0.15, gap: [1.0, 2.0], drift: 0.04, snd: 'gon', vib: 18 }, end: { sink: -0.7, rate: 11, drift: 0.16, ripple: 0.9, splash: 0.3, snd: 'heavy' }, text: 'ゴン、と重いアタリ。ウキがゆっくり、しかし力強く沈んでいく' },
  gara: { tick: { amp: -0.08, dur: 0.18, up: 0, gap: [0.6, 1.4], snd: 'gon', vib: 26 }, end: { sink: -0.7, rate: 30, drift: 0.2, ripple: 1.0, splash: 0.35, snd: 'heavy' }, text: 'ガツンと一気に、ウキごとひったくっていく' },
  nushi: { tick: { amp: -0.12, dur: 1.2, up: 0, gap: [1.4, 2.4], drift: 0.08, snd: 'gon', vib: 40 }, end: { sink: -0.9, rate: 4, ripple: 1.3, splash: 0.5, drift: 0.2, snd: 'heavy' }, text: 'ウキが、ゆっくり、深みへ引きずりこまれていく…' },
};
for (const [id, b] of Object.entries(BITE)) { SPECIES[id].bite = { tick: b.tick, end: b.end }; SPECIES[id].biteText = b.text; }

// 季節ごとの活性（1.0が基準）。夏は台風前にガーラが走り、冬はタマンが少しにぶる
export const SEASON_ACT = {
  summer: { yugoi: 1.0, muramasa: 1.05, hashinaga: 1.05, tsunodashi: 1.05, irabucha: 1.05, taman: 1.15, gara: 1.1, nushi: 1.0 },
  winter: { yugoi: 1.1, muramasa: 0.9, hashinaga: 0.9, tsunodashi: 0.9, irabucha: 0.9, taman: 0.85, gara: 0.95, nushi: 1.2 },
};
export const LAYER_SEASON = { summer: 1.0, winter: 1.08 };

// 図鑑の並び
export const SPECIES_ORDER = ['yugoi', 'muramasa', 'hashinaga', 'tsunodashi', 'irabucha', 'taman', 'gara', 'nushi', 'boot'];

// 今日のお題（daily.js）の材料
export const QUEST = {
  count: ['yugoi', 'yugoi', 'muramasa', 'hashinaga', 'irabucha', 'gara'], countN: { yugoi: 3, muramasa: 2 }, countDefault: 2,
  size: ['yugoi', 'yugoi', 'gara', 'taman', 'irabucha'],
  shallow: { max: 0.7, hint: 'ヒント: 浅いところにいるのは、ユゴイやムラサメモンガラ' },
  deep: { min: 1.3, hint: 'ヒント: 深いタナにはタマンやブダイ。岸壁のきわを狙おう' },
  big: ['yugoi', 'gara', 'taman', 'taman'],
  rare: { id: 'taman', hint: ' ／ 夕方から夜、岸壁のきわの深いタナ' },
  many: ['yugoi', 'muramasa'], manyN: { yugoi: 6, muramasa: 3 }, manyDefault: 4, manyAvoid: { muramasa: 'yugoi' },
  titles: [[30, '港のぬし'], [14, '港の達人'], [7, '港の常連'], [3, '港のなじみ'], [1, '見習い釣り人']],
};

// 潮の効き: 潮が動いているときは、魚の食いがよい。ひく・みちるの切り替わり（止まっている間）は、にぶい。
//  ガーラ・タマンは、みちる潮で港へ入ってくる。波が高すぎると、小さな魚は岩かげにこもる。
export function tideFactor(id) {
  const r = TIDE.rate, l = TIDE.level / (TIDE.amp || 0.5);
  const w = G.seaState ? G.seaState.level : 0.8;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (id === 'gara' || id === 'nushi' || id === 'taman') return (0.8 + 0.4 * Math.max(0, r) + 0.15 * Math.abs(r)) * (1 + 0.15 * sm(0.7, 1.2, w));
  if (id === 'yugoi') return 0.88 + 0.25 * Math.abs(r);
  return (0.85 + 0.25 * Math.abs(r) + 0.1 * l) * (1 - 0.12 * sm(1.2, 1.6, w));
}

// ---------------------------------------------------------------------------
// 英語
const EN_TEXT = {
  bait: {
    worm: ['Krill', 'A classic that draws most fish'],
    dough: ['Nori Bread', 'For algae eaters like parrotfish'],
    gluten: ['Mysid Shrimp', 'For small mouths'],
  },
  fish: {
    yugoi: ['Striped Flagtail', 'Yugoi', 'A familiar face of the harbor, roaming in silvery schools. It bites best from dusk into night.'],
    muramasa: ['Reef Triggerfish', 'Muramasamongara', 'A small fish of the rock work and coral. It bites the bait hard with its small mouth.'],
    hashinaga: ['Forcepsfish', 'Fueyakkodai', 'It plucks tiny worms from cracks in the rocks with its tweezer-like snout. Dazzling yellow with a black head.'],
    tsunodashi: ['Moorish Idol', 'Tsunodashi', 'White, black and yellow bands and a long, trailing dorsal fin. Seeing one is said to bring good luck. Very cautious about bait.'],
    irabucha: ['Redlip Parrotfish', 'Irabuchā', 'In Okinawa it is “irabuchā”. It scrapes algae off the rocks with its beak-like teeth, and pulls much harder than it looks.'],
    taman: ['Spangled Emperor', 'Taman', 'The big night catch every Okinawan angler dreams of. At dusk and after dark it comes into the shallows. It fights heavy and dives for the rocks.'],
    gara: ['Giant Trevally (young)', 'Gāra', 'In Okinawa the big jacks are called “gāra”. At dawn and dusk it chases small fish into the harbor. Fast, and it runs.'],
    nushi: ['Giant Gara, Lord of the Harbor', 'Gāra', 'A great giant trevally that has roamed the open ocean for decades. During a night-time shower it slips in from the dark past the breakwater into the deep water of the harbor.', 'On a rainy night, sink krill deep and a huge shadow draws near… so they say.'],
    boot: ['Island Sandal', 'Shimazōri', 'Someone lost this. In Okinawa they are called “shimazōri”, the everyday footwear of the islands.'],
  },
  bite: {
    yugoi: 'Fine little taps, then the bobber slides under',
    muramasa: 'Hard bites — gabu, gabu — then the bobber is dragged under',
    hashinaga: 'Very tiny pecks. When the bobber twitches, strike',
    tsunodashi: 'The bobber sways. Hesitantly, it sinks a little',
    irabucha: 'The bobber is drawn slowly, then pulled down deep',
    taman: 'A heavy “gon”. The bobber sinks slowly, but with real power',
    gara: 'One sudden strike that snatches the bobber away',
    nushi: 'The bobber is slowly, slowly dragged down into the depths…',
  },
  quest: {
    shallow: 'Hint: flagtails and triggerfish stay in the shallows',
    deep: 'Hint: spangled emperors and parrotfish stay deep. Aim along the quay wall',
    rare: ' / dusk into night, deep, along the quay wall',
    titles: ['Lord of the Harbor', 'Harbor Master', 'Harbor Regular', 'Familiar Face', 'Apprentice Angler'],
  },
};
if (EN) {
  for (const [id, [n, d]] of Object.entries(EN_TEXT.bait)) Object.assign(BAITS[id], { name: n, desc: d });
  for (const [id, [n, r, d, rumor]] of Object.entries(EN_TEXT.fish)) Object.assign(SPECIES[id], { name: n, ruby: r, desc: d }, rumor ? { rumor } : {});
  for (const [id, t] of Object.entries(EN_TEXT.bite)) SPECIES[id].biteText = t;
  QUEST.shallow.hint = EN_TEXT.quest.shallow; QUEST.deep.hint = EN_TEXT.quest.deep; QUEST.rare.hint = EN_TEXT.quest.rare;
  QUEST.titles.forEach((t, i) => { t[1] = EN_TEXT.quest.titles[i]; });
}
