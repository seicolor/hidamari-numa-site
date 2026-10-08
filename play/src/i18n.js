// ことば（日本語・英語）。
// えらびかた: URL の ?lang=en|ja → 設定でえらんだもの（localStorage 'hidamari-lang'）→ ブラウザの言語（日本語なら ja、ほかは en）
// 文言は、使うところで L('日本語', 'English') と並べて書く（どちらの言葉も、同じ場所で読めるように）。
const KEY = 'hidamari-lang';

function pick() {
  let v = null;
  try { v = new URLSearchParams(location.search).get('lang'); } catch (e) { /* ignore */ }
  if (v === 'ja' || v === 'en') { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } return v; }
  try { v = localStorage.getItem(KEY); } catch (e) { v = null; }
  if (v === 'ja' || v === 'en') return v;
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
  return /^ja\b/i.test(nav) ? 'ja' : 'en';
}

export const LANG = pick();
export const EN = LANG === 'en';
export const L = (ja, en) => (EN ? en : ja);
export function setLang(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } }
// 数の区切り・日付
export const NUM_LOCALE = EN ? 'en-US' : 'ja-JP';
// 英語のときの句読点の間隔（日本語の「　」を英語では 2 つの空白に）
export const SP = EN ? ' · ' : '　';
document.documentElement.lang = LANG;
