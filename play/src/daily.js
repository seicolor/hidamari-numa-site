// 今日のお題（日替わり）。日付から決まるので、同じ日はだれでも同じお題。
//  お題が2つ: ふつうのお題と、ちょっと難しい「大物のお題」。達成すると「釣果の印」がたまる。
import { L } from './i18n.js';
import { mulberry32 } from './util.js';
import { PLACE } from './place.js';
import { SPECIES, BAITS, layerText, QUEST } from './species.js';

const pad = (n) => String(n).padStart(2, '0');
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayNum(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function seedOf(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 長さの下限: その魚が「ふつうに釣れる大きさ」のうち上位 p の割合になるcm（rollLength は r^1.8 で偏る）
function cmAbove(sp, p) {
  const q = Math.pow(1 - p, 1.8);
  return Math.round(sp.cm[0] + (sp.cm[1] - sp.cm[0]) * q);
}
const bestBait = (sp) => Object.entries(sp.bait).sort((a, b) => b[1] - a[1])[0][0];
const spHint = (sp) => L(`ヒント: ${BAITS[bestBait(sp)].name} ／ ${layerText(sp)}`, `Hint: ${BAITS[bestBait(sp)].name} / ${layerText(sp)}`);

const pick = (rng, a) => a[Math.floor(rng() * a.length)];

function makeMain(rng) {
  const t = pick(rng, ['count', 'count', 'size', 'variety', 'shallow', 'deep', 'bait']);
  if (t === 'count') {
    const id = pick(rng, QUEST.count);
    const sp = SPECIES[id];
    const n = QUEST.countN[id] ?? QUEST.countDefault;
    return { kind: 'count', sp: id, goal: n, text: L(`${sp.name}を ${n}匹 釣ろう`, `Catch ${n} × ${sp.name}`), hint: spHint(sp) };
  }
  if (t === 'size') {
    const id = pick(rng, QUEST.size);
    const sp = SPECIES[id];
    const cm = cmAbove(sp, 0.3);
    return { kind: 'size', sp: id, cm, goal: 1, text: L(`${sp.name} ${cm}cm 以上を釣ろう`, `Catch a ${sp.name} of ${cm} cm or more`), hint: spHint(sp) };
  }
  if (t === 'variety') return { kind: 'variety', goal: 3, text: L('3種類の魚を釣ろう', 'Catch 3 different species'), hint: L('ヒント: エサやウキ下をいろいろ変えてみよう', 'Hint: try different baits and depths') };
  if (t === 'shallow') return { kind: 'depth', max: QUEST.shallow.max, goal: 2, text: L(`ウキ下 ${QUEST.shallow.max}m 以内の浅いタナで 2匹釣ろう`, `Catch 2 fish at a depth of ${QUEST.shallow.max} m or less`), hint: QUEST.shallow.hint };
  if (t === 'deep') return { kind: 'depth', min: QUEST.deep.min, goal: 1, text: L(`ウキ下 ${QUEST.deep.min}m 以上の深いタナで 1匹釣ろう`, `Catch a fish at a depth of ${QUEST.deep.min} m or more`), hint: QUEST.deep.hint };
  const b = pick(rng, ['worm', 'dough', 'gluten']);
  return { kind: 'bait', bait: b, goal: 3, text: L(`${BAITS[b].name}で 3匹釣ろう`, `Catch 3 fish with ${BAITS[b].name}`), hint: L('ヒント: 魚によってエサの好みがちがう', 'Hint: each fish has its favorite bait') };
}

function makeBonus(rng, main) {
  const t = pick(rng, ['big', 'big', 'big', 'rare', 'many', 'variety']);
  if (t === 'big') {
    const id = pick(rng, QUEST.big);
    const sp = SPECIES[id];
    const cm = cmAbove(sp, 0.16);
    return { kind: 'size', sp: id, cm, goal: 1, text: L(`${sp.name} ${cm}cm 以上の大物を釣ろう`, `Land a big ${sp.name} of ${cm} cm or more`), hint: spHint(sp) };
  }
  if (t === 'rare') return { kind: 'count', sp: QUEST.rare.id, goal: 1, text: L(`${SPECIES[QUEST.rare.id].name}を 1匹 釣ろう`, `Catch a ${SPECIES[QUEST.rare.id].name}`), hint: `${spHint(SPECIES[QUEST.rare.id])}${QUEST.rare.hint}` };
  if (t === 'many') {
    const id = QUEST.manyAvoid[main.sp] || pick(rng, QUEST.many);
    const sp = SPECIES[id];
    const n = QUEST.manyN[id] ?? QUEST.manyDefault;
    return { kind: 'count', sp: id, goal: n, text: L(`${sp.name}を ${n}匹 釣ろう`, `Catch ${n} × ${sp.name}`), hint: spHint(sp) };
  }
  return { kind: 'variety', goal: 5, text: L('5種類の魚を釣ろう', 'Catch 5 different species'), hint: L('ヒント: 浅場・深場・底ぎわをめぐろう', 'Hint: try the shallows, the deep water and the bottom') };
}

// その日のお題を作る
export function makeDaily(key) {
  const rng = mulberry32(seedOf(key));
  const main = makeMain(rng);
  let bonus = makeBonus(rng, main);
  // 同じようなお題にならないように
  for (let i = 0; i < 6 && bonus.kind === main.kind && bonus.sp === main.sp && bonus.goal <= main.goal; i++) bonus = makeBonus(rng, main);
  return [{ ...main, bonus: false, label: L('お題', 'Task') }, { ...bonus, bonus: true, label: L('大物のお題', 'Big-fish task') }];
}

// 釣った魚がお題の条件に合うか
function hits(c, info) {
  switch (c.kind) {
    case 'count': return info.id === c.sp;
    case 'size': return info.id === c.sp && info.cm >= c.cm;
    case 'variety': return true;
    case 'depth': return info.depth != null && (c.max == null || info.depth <= c.max + 0.05) && (c.min == null || info.depth >= c.min - 0.05);
    case 'bait': return info.bait === c.bait;
    default: return false;
  }
}

const TITLES = QUEST.titles;

export class Daily {
  constructor(save) {
    this.save = save;
    this.key = '';
    this.list = [];
    this.refresh();
  }

  // 日付がかわっていたら、新しいお題にする
  refresh() {
    const key = dateKey();
    if (key === this.key && this.list.length) return false;
    this.key = key;
    const defs = makeDaily(key);
    let st = this.save.data.daily;
    if (!st || st.key !== key) {
      st = { key, p: [0, 0], done: [false, false], seen: [] };
      this.save.data.daily = st;
      this.save.save();
    }
    this.st = st;
    this.list = defs.map((d, i) => Object.assign(d, { i }));
    return true;
  }

  progress(i) {
    const c = this.list[i];
    return c.kind === 'variety' ? Math.min(c.goal, this.st.seen.length) : Math.min(c.goal, this.st.p[i] || 0);
  }

  isDone(i) { return !!this.st.done[i]; }

  // 釣り上げたとき。新しく達成したお題の番号を返す
  record(info) {
    this.refresh();
    if (!info || info.junk) return [];
    const st = this.st;
    if (!st.seen.includes(info.id)) st.seen.push(info.id);
    const finished = [];
    this.list.forEach((c, i) => {
      if (st.done[i]) return;
      if (c.kind === 'variety') { if (st.seen.length >= c.goal) { st.done[i] = true; finished.push(i); } return; }
      if (hits(c, info)) st.p[i] = (st.p[i] || 0) + 1;
      if (st.p[i] >= c.goal) { st.done[i] = true; finished.push(i); }
    });
    if (finished.length) {
      const n = st.done.filter(Boolean).length;
      this.save.data.stamps[this.key] = Math.max(this.save.data.stamps[this.key] || 0, n);
    }
    this.save.save();
    return finished;
  }

  // HUDに出す短い表示（まだ終わっていないお題を優先）
  summary() {
    this.refresh();
    const i = this.list.findIndex((c, k) => !this.st.done[k]);
    if (i < 0) return { tag: L('お題', 'Task'), text: L('すべて達成！', 'All done!'), done: true, all: true };
    const c = this.list[i];
    const g = c.goal > 1 ? ` ${this.progress(i)}/${c.goal}` : '';
    return { tag: c.bonus ? L('大物', 'Big') : L('お題', 'Task'), text: `${c.text}${g}`, done: false, all: false, i };
  }

  stampCount() { return Object.values(this.save.data.stamps).filter((v) => v > 0).length; }

  // つづけて印がついている日数（今日まだなら、昨日までの連続）
  streak() {
    const S = this.save.data.stamps;
    let d = dayNum(this.key);
    const has = (n) => {
      const dt = new Date(n * 86400000);
      return (S[`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`] || 0) > 0;
    };
    if (!has(d)) d -= 1;
    let n = 0;
    while (has(d)) { n++; d--; }
    return n;
  }

  title() {
    const n = this.stampCount();
    const t = TITLES.find(([k]) => n >= k);
    return t ? t[1] : '';
  }

  // 直近 n 日分の印 [{key, n}]（古い順）
  recent(n = 14) {
    const out = [];
    const today = dayNum(this.key);
    for (let k = n - 1; k >= 0; k--) {
      const dt = new Date((today - k) * 86400000);
      const key = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
      out.push({ key, n: this.save.data.stamps[key] || 0, today: k === 0 });
    }
    return out;
  }

  // 共有用のテキスト
  shareText() {
    this.refresh();
    const mark = (i) => (this.st.done[i] ? '✅' : '⬜');
    const lines = [L(`${PLACE.title} ${this.key} 今日のお題`, `${PLACE.title} ${this.key} Today's tasks`)];
    this.list.forEach((c, i) => lines.push(`${mark(i)} ${c.text}${c.goal > 1 && !this.st.done[i] ? L(`（${this.progress(i)}/${c.goal}）`, ` (${this.progress(i)}/${c.goal})`) : ''}`));
    const s = this.streak();
    if (s > 0) lines.push(L(`🎣 ${s}日連続`, `🎣 ${s}-day streak`));
    return lines.join('\n');
  }
}
