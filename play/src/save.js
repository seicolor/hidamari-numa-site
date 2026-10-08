// 図鑑・記録・設定の保存（localStorage）
import { PLACE } from './place.js';
const KEY = PLACE.saveKey;

function safeGet() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}
function safeSet(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

export const Save = {
  data: { catches: {}, total: 0, kept: 0, casts: 0, settings: {}, firstPlay: true, achievements: {}, daily: null, stamps: {}, tank: [] },

  load() {
    const d = safeGet();
    if (d && typeof d === 'object') this.data = { ...this.data, ...d, catches: d.catches || {}, achievements: d.achievements || {}, settings: d.settings || {}, stamps: d.stamps || {}, daily: d.daily || null, tank: Array.isArray(d.tank) ? d.tank : [] };
    return this.data;
  },

  save() { if (!this.frozen) safeSet(this.data); },   // frozen: 記録の読み込み中（読み直すまで書かない）

  // depth: 釣れたときのエサの深さ(m)。魚ごとに、どのタナで釣れたかを覚えておく
  record(id, cm, g, depth, season) {
    const c = this.data.catches[id] || { count: 0, best: 0, bestG: 0, first: Date.now() };
    if (depth != null && isFinite(depth)) {
      const d = Math.round(depth * 10) / 10;
      c.dmin = c.dmin == null ? d : Math.min(c.dmin, d);
      c.dmax = c.dmax == null ? d : Math.max(c.dmax, d);
    }
    // 釣った季節の印（春夏秋冬）
    if (season) { c.seasons = c.seasons || {}; c.seasons[season] = (c.seasons[season] || 0) + 1; }
    const isNew = c.count === 0;
    const isRecord = cm > c.best + 0.05 && c.count > 0;
    c.count++;
    if (cm > c.best) { c.best = cm; c.bestG = g; }
    this.data.catches[id] = c;
    this.data.total++;
    this.save();
    return { isNew, isRecord, entry: c };
  },

  speciesCaught() {
    return Object.keys(this.data.catches).filter((k) => this.data.catches[k].count > 0 && k !== 'boot' && k !== 'nushi').length;
  },

  setting(k, v) {
    if (v === undefined) return this.data.settings[k];
    this.data.settings[k] = v;
    this.save();
  },

  achieve(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    this.save();
    return true;
  },
};
