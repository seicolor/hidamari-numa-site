// ひだまり浜の魚種データ（日本語）。共通の計算は ../species.js
//  ハワイの入り江にすむ魚を中心に。ヤッコ・ハギ・ツノダシ・チョウチョウウオなど、見ばえのする魚を多めに。
//  体の絵・形は ../reeffish.js
import '../reeffish.js';
import { TIDE } from './terrain.js';
import { G } from '../materials.js';

// エサ（ID は沼と同じ worm / dough / gluten。キー 1・2・3 に対応）
export const BAITS = {
  worm: { id: 'worm', name: 'オキアミ', desc: 'たいていの魚が寄ってくる定番' },
  dough: { id: 'dough', name: 'のりパン', desc: 'ハギ・ブダイなど、藻を食べる魚に' },
  gluten: { id: 'gluten', name: 'あみえび', desc: '小さな口の、ヤッコやチョウチョウウオに' },
};

// rarity: 1=よくいる 2=ときどき 3=めずらしい 4=ほとんど会えない
export const SPECIES = {
  aholehole: {
    id: 'aholehole', name: 'アホレホレ', ruby: 'あほれほれ', latin: 'Kuhlia xenura', kind: 'swim',
    cm: [10, 30], k: 0.0125, rarity: 1, strength: 0.3, stamina: 0.5, speed: 0.34,
    bait: { worm: 0.8, dough: 1.0, gluten: 0.6 }, minDepth: 0.3, layer: [0.2, 1.0],
    active: { dawn: 1.2, day: 0.8, dusk: 1.5, night: 1.6 }, nibble: [1, 3], hook: 1.2, count: 9, seeR: 5,
    desc: '夕ぐれから夜、銀色の群れで浅瀬にあらわれる、浜のおなじみさん。ハワイでは「アホレホレ」。',
    thumb: [0.95, 0.5], jumper: true, school: true,
  },
  // 群がる小魚（shoal）: 海では同じ根のまわりに集まり、水槽では大きな魚とは別枠で飼える
  himeSuzume: {
    id: 'himeSuzume', name: 'ヒメスズメダイ', ruby: 'ひめすずめだい', latin: 'Chromis vanderbilti', kind: 'swim', reef: true,
    cm: [3.5, 7], k: 0.021, rarity: 1, strength: 0.05, stamina: 0.2, speed: 0.3,
    bait: { worm: 0.55, dough: 0.15, gluten: 1.0 }, minDepth: 0.5, layer: [0.4, 1.6],
    active: { dawn: 1.0, day: 1.5, dusk: 0.8, night: 0.0 }, nibble: [2, 5], hook: 0.8, count: 9, seeR: 4,
    desc: 'ハワイのリーフでいちばん多い小魚のひとつ。わき腹の黄色に、青い小さな点の列。尾の下半分と尻びれは黒い。岩の少し上に群がって、流れてくるプランクトンをついばむ。小さな口なので、あみえびで。',
    thumb: [0.8, 0.8], school: true, shoal: true,
  },
  kiiroHagi: {
    id: 'kiiroHagi', name: 'キイロハギ', ruby: 'きいろはぎ', latin: 'Zebrasoma flavescens', kind: 'swim', reef: true,
    cm: [11, 19], k: 0.03, rarity: 2, strength: 0.4, stamina: 0.6, speed: 0.3,
    bait: { worm: 0.3, dough: 1.0, gluten: 0.15 }, minDepth: 0.5, layer: [0.3, 1.4],
    active: { dawn: 1.1, day: 1.5, dusk: 0.9, night: 0.05 }, nibble: [2, 4], hook: 1.3, count: 6, seeR: 5.5,
    desc: 'まっ黄色の、うすい円盤。ハワイでは「ラウイパラ」。とがった口先で岩の藻をついばみ、尾の付け根の白いとげ（メスのような刃）で身を守る。のりパンが大好き。',
    thumb: [0.85, 0.7], school: true, forager: true,
  },
  muramasa: {
    id: 'muramasa', name: 'ムラサメモンガラ', ruby: 'むらさめもんがら', latin: 'Rhinecanthus rectangulus', kind: 'swim', reef: true,
    cm: [13, 24], k: 0.05, rarity: 2, strength: 0.5, stamina: 0.7, speed: 0.28,
    bait: { worm: 1.0, dough: 0.2, gluten: 0.8 }, minDepth: 0.4, layer: [0.2, 1.2],
    active: { dawn: 1.1, day: 1.4, dusk: 1.0, night: 0.1 }, nibble: [2, 3], hook: 1.4, count: 3, seeR: 5,
    desc: 'ハワイの州の魚「フムフムヌクヌクアプアア」。「ブタのような鼻のモンガラ」という意味。小さな口で、エサをガブッとかじる。',
    thumb: [0.85, 0.65], forager: true,
  },
  // id の hashinaga・hifuki は、前の仮の名前のなごり。保存データ（図鑑の記録）に使うので変えない
  hashinaga: {
    id: 'hashinaga', name: 'フエヤッコダイ', ruby: 'ふえやっこだい', latin: 'Forcipiger flavissimus', kind: 'swim', reef: true,
    cm: [10, 19], k: 0.028, rarity: 2, strength: 0.25, stamina: 0.45, speed: 0.26,
    bait: { worm: 0.7, dough: 0.2, gluten: 1.0 }, minDepth: 0.5, layer: [0.5, 1.8],
    active: { dawn: 1.1, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [2, 5], hook: 1.5, count: 4, seeR: 5,
    desc: 'ピンセットのような長い口先で、サンゴのすきまの小さな虫をつまみ出す。まぶしい黄色に、黒い頭。ハワイでは「ラウウィリウィリヌクヌクオイオイ」という、とても長い名前でよばれる。',
    thumb: [0.85, 0.7], forager: true,
  },
  tsunodashi: {
    id: 'tsunodashi', name: 'ツノダシ', ruby: 'つのだし', latin: 'Zanclus cornutus', kind: 'swim', reef: true,
    cm: [12, 22], k: 0.04, rarity: 3, strength: 0.35, stamina: 0.55, speed: 0.24,
    bait: { worm: 0.3, dough: 0.7, gluten: 0.9 }, minDepth: 0.6, layer: [0.4, 1.6],
    active: { dawn: 1.0, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [2, 5], hook: 1.7, count: 2, seeR: 5.5,
    desc: 'ハワイでは「キヒキヒ」。白・黒・黄のおびと、長くなびく背びれ。見かけるだけで幸運といわれる。エサには、とても用心深い。',
    thumb: [0.8, 0.8],
  },
  potter: {
    id: 'potter', name: 'ポッターズエンゼルフィッシュ', ruby: 'ぽったーずえんぜるふぃっしゅ', latin: 'Centropyge potteri', kind: 'swim', reef: true,
    cm: [6, 11], k: 0.05, rarity: 3, strength: 0.12, stamina: 0.3, speed: 0.24,
    bait: { worm: 0.5, dough: 0.5, gluten: 1.0 }, minDepth: 0.8, layer: [0.8, 2.0],
    active: { dawn: 1.0, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [3, 6], hook: 1.0, count: 3, seeR: 4,
    desc: 'ハワイとジョンストン環礁にしかいない、小さなヤッコ。前はオレンジ、うしろは青と黒のしま。サンゴのそばの深いタナにいる。',
    thumb: [0.8, 0.8],
  },
  hifuki: {
    id: 'hifuki', name: 'フレームエンゼルフィッシュ', ruby: 'ふれーむえんぜるふぃっしゅ', latin: 'Centropyge loricula', kind: 'swim', reef: true,
    cm: [5, 9], k: 0.055, rarity: 4, strength: 0.1, stamina: 0.25, speed: 0.26,
    bait: { worm: 0.45, dough: 0.3, gluten: 1.0 }, minDepth: 1.0, layer: [1.2, 2.3],
    active: { dawn: 1.0, day: 1.6, dusk: 0.8, night: 0.0 }, nibble: [3, 6], hook: 0.9, count: 1, seeR: 3.5,
    desc: '炎（フレーム）のような赤の、小さなヤッコ。わき腹に細い黒の縦じま、ひれの後ろは黒に青いすじ。ふだんはもっと深いリーフの斜面にすみ、入り江ではめったに会えない、まぼろしの一匹。日ざしの強い昼、サンゴの陰から顔を出す。',
    thumb: [0.8, 0.8],
  },
  uhu: {
    id: 'uhu', name: 'ナガブダイ', ruby: 'ながぶだい', latin: 'Scarus rubroviolaceus', kind: 'swim', reef: true,
    cm: [20, 45], k: 0.022, rarity: 3, strength: 0.7, stamina: 0.85, speed: 0.3,
    bait: { worm: 0.2, dough: 1.0, gluten: 0.3 }, minDepth: 0.8, layer: [0.6, 1.8],
    active: { dawn: 1.1, day: 1.4, dusk: 0.9, night: 0.05 }, nibble: [2, 4], hook: 1.5, count: 2, seeR: 6,
    desc: 'ハワイでは「ウフ」。くちばしのような歯で、サンゴの上の藻を岩ごとかじりとり、白い砂をつくる。大きなオスは緑色で、体の前が濃い。尾は竪琴のような形。引きは、見かけによらず力強い。',
    thumb: [0.95, 0.5], forager: true,
  },
  papio: {
    id: 'papio', name: 'パピオ', ruby: 'ぱぴお', latin: 'Caranx ignobilis (juv.)', kind: 'swim',
    cm: [22, 55], k: 0.019, rarity: 3, strength: 0.9, stamina: 0.85, speed: 0.75,
    bait: { worm: 1.0, dough: 0.1, gluten: 0.5 }, minDepth: 0.7, layer: [0.2, 1.4],
    active: { dawn: 1.6, day: 0.7, dusk: 1.7, night: 0.8 }, nibble: [1, 2], hook: 1.3, count: 2, seeR: 7,
    desc: 'ロウニンアジの若魚。大きくなると「ウルア」と呼ばれる。朝夕のまずめに、小魚を追って入り江へ。足が速く、走る。',
    thumb: [0.95, 0.55], jumper: true,
  },
  // 海のぬし: ふだんは入り江に入ってこない。夜、にわか雨のなか、オキアミを深く沈めると寄ってくる（count: 0 は、ふつうには住んでいないということ）
  nushi: {
    id: 'nushi', model: 'ulua', legend: true, name: 'ウルア（海のぬし）', ruby: 'うるあ', latin: 'Caranx ignobilis', kind: 'swim',
    cm: [95, 130], k: 0.0185, rarity: 4, strength: 0.96, stamina: 1.3, speed: 0.7,
    bait: { worm: 1.0, dough: 0.05, gluten: 0.1 }, minDepth: 1.5, layer: [1.4, 2.4],
    active: { dawn: 0.8, day: 0.1, dusk: 1.0, night: 2.4 }, nibble: [2, 3], hook: 1.7, count: 0, seeR: 7,
    desc: '何十年も外海を渡ってきた、ロウニンアジの大物「ウルア」。夜のにわか雨のとき、リーフの外から入り江の深みへ入ってくる。',
    rumor: '雨の夜、オキアミを深く沈めると、大きな影が寄ってくる……という噂。',
    thumb: [1.0, 0.55], tint: 0xdfd6b8,
  },
  boot: {
    id: 'boot', model: 'sandal', name: 'ビーチサンダル', ruby: 'びーちさんだる', latin: 'Calceus littoralis', kind: 'boot',
    cm: [24, 30], k: 0.012, rarity: 1, strength: 0.3, stamina: 0.3, speed: 0,
    bait: { worm: 0, dough: 0, gluten: 0 }, minDepth: 0.3, layer: [0.3, 0.5],
    active: { dawn: 1, day: 1, dusk: 1, night: 1 }, nibble: [1, 1], hook: 1.0, count: 0, seeR: 0,
    desc: '誰かの落とし物。ハワイでは「スリッパ」とよばれる、浜の定番の履物。ヤドカリが引っこしの相談をしていた気がする……。',
    thumb: [0.8, 0.9], junk: true,
  },
};

// 天気ごとの活性（1.0が基準）。[晴れ, くもり, 雨]
//  礁の魚は、日ざしの強い凪の日に元気。パピオやアホレホレは、くもりやにわか雨で動きだす。
const WX = {
  aholehole: [0.9, 1.1, 1.3],
  himeSuzume: [1.2, 1.0, 0.6],
  kiiroHagi: [1.2, 0.9, 0.5],
  muramasa: [1.1, 1.0, 0.8],
  hashinaga: [1.15, 0.95, 0.55],
  tsunodashi: [1.2, 0.9, 0.5],
  potter: [1.15, 0.9, 0.6],
  hifuki: [1.25, 0.8, 0.4],
  uhu: [1.2, 0.9, 0.6],
  papio: [0.8, 1.15, 1.6],
  nushi: [0.1, 0.9, 2.8],
  boot: [1, 1, 1],
};
for (const [id, v] of Object.entries(WX)) SPECIES[id].wx = { clear: v[0], cloudy: v[1], rain: v[2] };

// アタリの癖: ウキの動きと音が、魚ごとにちがう（意味は numa/species.js を参照）
const BITE = {
  himeSuzume: { tick: { amp: -0.008, dur: 0.1, up: 0.5, gap: [0.12, 0.35], snd: 'chiku', vib: 4 }, end: { lift: 0.015, liftT: 0.25, sink: -0.12, rate: 16, snd: 'soft' }, text: 'チョン、チョンと、せわしなくつつく。群れで寄ってきて、エサの取りあい' },
  aholehole: { tick: { amp: -0.03, dur: 0.28, up: 0.3, gap: [0.5, 1.2], snd: 'tick' }, end: { sink: -0.4, rate: 14, snd: 'sink' }, text: 'ツン、ツンと細かくつついて、すっとウキを引き込む' },
  kiiroHagi: { tick: { amp: 0.025, dur: 0.7, up: 1, gap: [0.7, 1.5], snd: 'fuwa', vib: 8 }, end: { lift: 0.035, liftT: 0.45, sink: -0.4, rate: 10, snd: 'soft' }, text: 'ウキがふわっと持ち上がって、すーっと沈んでいく（藻をなでるように食べる）' },
  muramasa: { tick: { amp: -0.06, dur: 0.22, up: 0.1, gap: [0.5, 1.1], snd: 'gon', vib: 22 }, end: { sink: -0.55, rate: 20, ripple: 0.7, splash: 0.2, snd: 'heavy' }, text: 'ガブッ、ガブッと強くかじって、ウキをぐいっと引きずり込む' },
  hashinaga: { tick: { amp: -0.012, dur: 0.12, up: 0.5, gap: [0.2, 0.6], snd: 'chiku', vib: 6 }, end: { lift: 0.02, liftT: 0.3, sink: -0.12, rate: 12, snd: 'soft' }, text: 'ツンツンと、とても小さくつつく。ウキがピクッと動いたら合わせどき' },
  tsunodashi: { tick: { amp: -0.02, dur: 0.9, up: 0.5, gap: [1.0, 2.2], drift: 0.04, snd: 'yure', vib: 8 }, end: { sink: -0.25, rate: 7, drift: 0.1, snd: 'soft' }, text: 'ウキがゆらゆら。ためらいながら、そっと沈める' },
  potter: { tick: { amp: -0.011, dur: 0.12, up: 0.5, gap: [0.2, 0.5], snd: 'chiku', vib: 6 }, end: { lift: 0.025, liftT: 0.35, sink: -0.1, rate: 12, snd: 'soft' }, text: 'チクチクと小さく震えて、ウキがふっと持ち上がる（食い上げ）' },
  hifuki: { tick: { amp: -0.01, dur: 0.12, up: 0.6, gap: [0.2, 0.5], snd: 'chiku', vib: 6 }, end: { lift: 0.03, liftT: 0.4, sink: -0.08, rate: 12, snd: 'soft' }, text: 'ほんのかすかに、チクッ。ウキの動きを見のがさないで' },
  uhu: { tick: { amp: -0.04, dur: 0.6, up: 0.2, gap: [0.8, 1.6], drift: 0.05, snd: 'zuru', vib: 14 }, end: { sink: -0.55, rate: 9, drift: 0.14, ripple: 0.7, splash: 0.22, snd: 'heavy' }, text: 'ウキがじわじわ引かれて、ぐぐっと深くに沈む' },
  papio: { tick: { amp: -0.08, dur: 0.18, up: 0, gap: [0.6, 1.4], snd: 'gon', vib: 26 }, end: { sink: -0.7, rate: 30, drift: 0.2, ripple: 1.0, splash: 0.35, snd: 'heavy' }, text: 'ガツンと一気に、ウキごとひったくっていく' },
  nushi: { tick: { amp: -0.12, dur: 1.2, up: 0, gap: [1.4, 2.4], drift: 0.08, snd: 'gon', vib: 40 }, end: { sink: -0.9, rate: 4, ripple: 1.3, splash: 0.5, drift: 0.2, snd: 'heavy' }, text: 'ウキが、ゆっくり、深みへ引きずりこまれていく……' },
};
for (const [id, b] of Object.entries(BITE)) { SPECIES[id].bite = { tick: b.tick, end: b.end }; SPECIES[id].biteText = b.text; }

// 季節ごとの活性（1.0が基準）。夏（乾季）は礁の魚が活発、冬（雨季）はパピオが走り、ウルアが入りやすい
export const SEASON_ACT = {
  summer: { himeSuzume: 1.05, kiiroHagi: 1.1, hashinaga: 1.1, tsunodashi: 1.1, potter: 1.05, hifuki: 1.1, uhu: 1.05, aholehole: 1.0, papio: 0.95, nushi: 0.9 },
  winter: { himeSuzume: 0.95, kiiroHagi: 0.95, hashinaga: 0.9, tsunodashi: 0.9, potter: 0.95, hifuki: 0.85, uhu: 0.9, aholehole: 1.1, papio: 1.2, nushi: 1.3 },
};
export const LAYER_SEASON = { summer: 1.0, winter: 1.08 };

// 図鑑の並び
export const SPECIES_ORDER = ['aholehole', 'himeSuzume', 'kiiroHagi', 'muramasa', 'hashinaga', 'tsunodashi', 'potter', 'hifuki', 'uhu', 'papio', 'nushi', 'boot'];

// 今日のお題（daily.js）の材料
export const QUEST = {
  count: ['aholehole', 'aholehole', 'himeSuzume', 'kiiroHagi', 'muramasa', 'hashinaga', 'uhu'], countN: { aholehole: 3, himeSuzume: 3, kiiroHagi: 2 }, countDefault: 2,
  size: ['aholehole', 'aholehole', 'papio', 'kiiroHagi', 'uhu'],
  shallow: { max: 0.6, hint: 'ヒント: 浅いところにいるのは、アホレホレやムラサメモンガラ' },
  deep: { min: 1.2, hint: 'ヒント: 深いタナにはヤッコやブダイ。サンゴのそばを狙おう' },
  big: ['aholehole', 'papio', 'papio'],
  rare: { id: 'hifuki', hint: ' ／ 日ざしの強い昼、サンゴのそばの深いタナ' },
  many: ['aholehole', 'kiiroHagi'], manyN: { aholehole: 6, kiiroHagi: 4 }, manyDefault: 4, manyAvoid: { kiiroHagi: 'aholehole' },
  titles: [[30, '浜のぬし'], [14, '浜の達人'], [7, '浜の常連'], [3, '浜のなじみ'], [1, '見習い釣り人']],
};

// 潮の効き: 潮が動いているときは、魚の食いがよい。ひく・みちるの切り替わり（止まっている間）は、にぶい。
//  パピオ（ロウニンアジ）は、みちる潮で、リーフを越えて入ってくる。礁の魚は、満潮のほうがすこし活発。
//  波: 少し波っ気があると、パピオは白波にまぎれて小魚を追う。波が高すぎると、小さな礁の魚は岩かげにこもる。
export function tideFactor(id) {
  const r = TIDE.rate, l = TIDE.level / (TIDE.amp || 0.42);
  const w = G.seaState ? G.seaState.level : 0.8;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (id === 'papio' || id === 'nushi') return (0.8 + 0.4 * Math.max(0, r) + 0.15 * Math.abs(r)) * (1 + 0.18 * sm(0.7, 1.2, w));
  if (id === 'aholehole') return 0.88 + 0.25 * Math.abs(r);
  return (0.85 + 0.25 * Math.abs(r) + 0.1 * l) * (1 - 0.12 * sm(1.2, 1.6, w));
}
