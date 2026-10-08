// 記録のバックアップ: この端末（ブラウザ）にある、ひだまりシリーズの記録をまとめて書き出し・読み込む。
// 図鑑・釣果・お題・水槽の魚・設定（浜と沼の両方）と、最後に遊んだ釣り場。
import { Save } from './save.js';

const PREFIX = 'hidamari-';
const NAMES = { 'hidamari-hama-v1': 'ひだまり浜', 'hidamari-numa-v1': 'ひだまり沼' };

function keys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k); } } catch (e) { /* ignore */ }
  return out.sort();
}

// 書き出す中身（JSON の文字列）
export function exportText() {
  const saves = {};
  for (const k of keys()) {
    let v = null;
    try { v = localStorage.getItem(k); } catch (e) { /* ignore */ }
    if (v == null) continue;
    try { saves[k] = JSON.parse(v); } catch (e) { saves[k] = v; }
  }
  return JSON.stringify({ app: 'hidamari', kind: 'save', version: 1, exportedAt: new Date().toISOString(), saves }, null, 1);
}

export function exportName() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `hidamari-kiroku-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}

// 読み込む前のたしかめ。{ ok, saves, lines（中身の要約） } か { ok:false, msg }
export function parseImport(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, msg: '中身が空です' };
  if (text.length > 5e6) return { ok: false, msg: 'ファイルが大きすぎます' };
  let d;
  try { d = JSON.parse(text); } catch (e) { return { ok: false, msg: 'ひだまりの記録のファイルではないようです（読めませんでした）' }; }
  if (!d || d.app !== 'hidamari' || d.kind !== 'save' || !d.saves || typeof d.saves !== 'object') return { ok: false, msg: 'ひだまりの記録のファイルではないようです' };
  const saves = {};
  for (const [k, v] of Object.entries(d.saves)) {
    if (!k.startsWith(PREFIX) || k.length > 64) continue;
    if (NAMES[k] && (typeof v !== 'object' || !v)) return { ok: false, msg: `${NAMES[k]}の記録がこわれています` };
    saves[k] = v;
  }
  if (!Object.keys(saves).length) return { ok: false, msg: '記録が入っていません' };
  const lines = [];
  for (const [k, nm] of Object.entries(NAMES)) {
    const s = saves[k];
    if (!s) continue;
    const kinds = Object.keys(s.catches || {}).filter((id) => s.catches[id] && s.catches[id].count > 0 && id !== 'boot' && id !== 'nushi').length;
    const tank = Array.isArray(s.tank) && s.tank.length ? `・水槽 ${s.tank.length}匹` : '';
    lines.push(`${nm}: 釣った数 ${s.total || 0}匹・図鑑 ${kinds}種${tank}`);
  }
  const when = d.exportedAt ? new Date(d.exportedAt) : null;
  return { ok: true, saves, lines, when: when && !isNaN(when) ? when.toLocaleString('ja-JP') : '' };
}

// 読み込んで、ページを読み直す（いまの画面の記録が、あとから上書きしないように止めてから）
export function applyImport(saves) {
  Save.frozen = true;
  for (const [k, v] of Object.entries(saves)) {
    try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { Save.frozen = false; return false; }
  }
  return true;
}
