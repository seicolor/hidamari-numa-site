// 場所: 'hama'（ひだまり浜・ハワイの入り江）か 'numa'（ひだまり沼）。
// 選びかた: URL の ?place= → 前回の場所 → ページの既定（meta）→ 浜。場所ごとに、記録（セーブ）も別。
// 開くたびに、まず「どちらの釣り場から始めますか」をえらんでもらう（裏では前回の場所を読み込んでおく）。
// えらんだあと・旅の地図で移動したあとは、URL に ?place= がつくので、えらぶ画面は出さない。
const KEY = 'hidamari-place';
const IDS = ['hama', 'numa'];

let choose = false, last = null;
function pick() {
  let p = null;
  try { p = new URLSearchParams(location.search).get('place'); } catch (e) { /* ignore */ }
  if (IDS.includes(p)) { try { localStorage.setItem(KEY, p); } catch (e) { /* ignore */ } return p; }
  choose = true;
  try { p = localStorage.getItem(KEY); } catch (e) { p = null; }
  if (IDS.includes(p)) last = p;
  else { try { last = localStorage.getItem('hidamari-numa-v1') ? 'numa' : localStorage.getItem('hidamari-hama-v1') ? 'hama' : null; } catch (e) { /* ignore */ } }
  if (!IDS.includes(p) && last) p = last;   // 場所の記憶がない（前の版で遊んだ）ときは、記録のある釣り場
  return IDS.includes(p) ? p : fallback();
}
// 既定の釣り場: ページに <meta name="hidamari-place" content="numa"> があれば、それ（公開する版ごとに変えられる）。なければ浜
function pageDefault() {
  let d = null;
  try { const m = document.querySelector('meta[name="hidamari-place"]'); d = m && m.getAttribute('content'); } catch (e) { /* ignore */ }
  return IDS.includes(d) ? d : null;
}
function fallback() { return pageDefault() || 'hama'; }

export const PLACE_ID = pick();
export const FIRST_VISIT = choose;   // 開いたときに、釣り場をえらぶ画面を出す
export const LAST_PLACE = last;     // 前回の釣り場（はじめてなら null）
export const PLACES = {
  hama: {
    id: 'hama', title: 'ひだまり浜', sub: 'ハワイの入り江の釣り', saveKey: 'hidamari-hama-v1', pic: 'hidamari-hama',
    // 旅の地図: 場所（オアフ島の東、ラニカイの入り江）と、現地の時刻の基準
    geo: { lat: 21.392, lon: -157.716, tz: 'Pacific/Honolulu', region: 'ハワイ・オアフ島　ラニカイの入り江', short: 'オアフ島', mark: '浜', en: 'HAWAII' },
    desc: 'ハワイの穏やかな入り江で、ウキを浮かべて波の音を聞く。澄んだ海にサンゴとヤッコ、キイロハギ。three.js で作った、のんびり南の海釣りゲーム。',
    startBefore: 0.4, water: '浜', boat: false, neighbor: false, cat: false, tank: true,
    lead: 'ハワイの、小さな入り江。<br>澄んだ水の底に、サンゴと、色あざやかな魚たち。<br>ウキをなげて、波の音を聞く時間をどうぞ。',
    rodHera: 'のべ竿', rodHeraSub: '手前・リールなし', rodLine: 'リール竿 ⇄ のべ竿（リールなし）', heraTip: null,
    legendSize: 'ウルアの貫禄。とてつもない大物！', legendBadge: '海のぬし！', zukan: 'ひだまり浜の住人たち',
    credit: 'ひだまり浜 — three.js で作った、手続き生成だけの小さな釣り場。<br>景色・魚・音はすべてプログラムで生成しています。',
    allToast: '図鑑コンプリート！浜の主になった', legendToast: 'ウルアを釣り上げた！　語りつがれるぞ', junkToast: 'ごみを持ち帰った。浜がきれいになった！',
    nushiToast: '青い底のほうで、とても大きな影が横ぎった…',
    rainbowToast: '通り雨のあとの空に、にじがかかった',
    thunderToast: '遠くで雷が鳴った…大きな魚が動きだしそう',
  },
  numa: {
    id: 'numa', title: 'ひだまり沼', sub: '田舎の釣り', saveKey: 'hidamari-numa-v1', pic: 'hidamari-numa',
    geo: { lat: 39.16, lon: 140.49, tz: 'Asia/Tokyo', region: '秋田県南部　湯沢のあたり', short: '秋田県', mark: '沼', en: 'AKITA' },
    desc: '山あいの小さな沼で、ウキを浮かべてぼんやり待つ。three.js で作った、のんびり田舎釣りゲーム。',
    startBefore: 0.7, water: '沼', boat: true, neighbor: true, cat: true, tank: false,
    lead: '山あいの小さな沼。<br>夕暮れ前の、やわらかな光。<br>ウキをなげて、ぼんやり待つ時間をどうぞ。',
    rodHera: 'へら竿', rodHeraSub: '手前・のべ竿', rodLine: 'リール竿 ⇄ へら竿（リールなし）', heraTip: 'へら竿には練りエサがよく合います',
    legendSize: '沼のぬしの貫禄。とてつもない大物！', legendBadge: '沼のぬし！', zukan: 'ひだまり沼の住人たち',
    credit: 'ひだまり沼 — three.js で作った、手続き生成だけの小さな釣り場。<br>景色・魚・音はすべてプログラムで生成しています。',
    allToast: '図鑑コンプリート！沼の主になった', legendToast: '沼のぬしを釣り上げた！　語りつがれるぞ', junkToast: 'ごみを持ち帰った。沼がきれいになった！',
    nushiToast: '水の底で、なにか大きなものが動いた…',
    rainbowToast: '雨あがりの空に、にじが出た',
    thunderToast: '遠くで雷が鳴った…ナマズが動きだしそう',
  },
};
export const PLACE = PLACES[PLACE_ID];
export const PLACE_IDS = IDS;
// 旅の地図の「準備中」のピン（これから増える釣り場の予告。位置は仮）
export const SOON = [{ lat: 51.4, lon: -116.2 }, { lat: -44.9, lon: 168.7 }];
