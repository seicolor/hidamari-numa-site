// 記録を守る: 記録はこのブラウザの中（localStorage）にあるので、
//  1) X・Instagram・LINE などのアプリの中で開いたとき（アプリ内ブラウザは、ふだんのブラウザと記録の置き場所が別）に、
//     ふだんのブラウザで開くよう案内する。LINE は ?openExternalBrowser=1 で、はじめから外のブラウザで開く。
//     Android は Chrome で開き直せる（記録があれば、リンクに入れて持っていく）。iPhone は「Safari で開く」を案内する。
//  2) 「記録ごとリンク」をコピーできるようにする（ふだんのブラウザに貼りつけて開くと、続きから遊べる）。
//  3) ブラウザに「この記録を消さないで」とたのむ（navigator.storage.persist）。iPhone の Safari は、しばらく開かないサイトの記録を消すことがあるので、
//     釣った数がたまって、しばらく記録を残していないときは、タイトルで「記録をリンクで残す」をすすめる。
import { L } from './i18n.js';
import { IN_ARTIFACT, moveLink } from './move.js';

const UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/.test(UA);
const STANDALONE = (() => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } })();

// アプリ内ブラウザ（見分けられるものだけ。X の iPhone 版などは、ふつうの Safari と見分けがつかない）
function detect() {
  if (IN_ARTIFACT) return null;
  const apps = [[/\bLine\//i, 'LINE'], [/Instagram/, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/Twitter|TwitterAndroid/, 'X'],
    [/MicroMessenger/, 'WeChat'], [/KAKAOTALK/i, 'KakaoTalk'], [/BytedanceWebview|musical_ly|TikTok/i, 'TikTok'], [/Pinterest/, 'Pinterest'], [/Snapchat/, 'Snapchat'], [/LinkedInApp/, 'LinkedIn']];
  for (const [re, name] of apps) if (re.test(UA)) return { app: name, ios: IOS, android: ANDROID };
  if (ANDROID && /; wv\)/.test(UA)) return { app: '', ios: false, android: true };
  if (IOS && /AppleWebKit/.test(UA) && !/Safari\//.test(UA) && !STANDALONE) return { app: '', ios: true, android: false };
  return null;
}
export const INAPP = detect();

// LINE: はじめから外のブラウザで開く（# の記録も、そのまま持っていく）
if (INAPP && INAPP.app === 'LINE') {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('openExternalBrowser')) { u.searchParams.set('openExternalBrowser', '1'); location.replace(u.toString()); }
  } catch (e) { /* ignore */ }
}

// この端末に、ひだまりの記録があるか（釣った数の合計）
export function caughtTotal() {
  let n = 0;
  for (const k of ['hidamari-hama-v1', 'hidamari-numa-v1']) {
    try { const s = JSON.parse(localStorage.getItem(k) || 'null'); if (s && s.total) n += s.total; } catch (e) { /* ignore */ }
  }
  return n;
}

// Android: Chrome で開き直す（記録があれば、リンクの ?mv= に入れて持っていく。# は intent の書きかたで使えないため）
export async function chromeUrl(place) {
  const u = new URL(location.href);
  u.hash = '';
  u.searchParams.delete('openExternalBrowser');
  if (caughtTotal() > 0) {
    try { const m = /#move=([A-Za-z0-9_-]+)/.exec(await moveLink(place)); if (m) u.searchParams.set('mv', m[1]); } catch (e) { /* ignore */ }
  }
  const rest = `${u.host}${u.pathname}${u.search}`;
  return `intent://${rest}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`https://${rest}`)};end`;
}

// 記録を残した日（リンクのコピー・書き出し）
const KEPT = 'hidamari-kept-at';
export function markKept() { try { localStorage.setItem(KEPT, String(Date.now())); } catch (e) { /* ignore */ } }
function keptAt() { try { return +localStorage.getItem(KEPT) || 0; } catch (e) { return 0; } }

// ブラウザに、記録を消さないようたのむ（Firefox は確認を出すので、たのまない）
let persisted = false;
export async function askPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) { persisted = true; return true; }
    if (/Firefox/.test(UA)) return false;
    persisted = await navigator.storage.persist();
  } catch (e) { persisted = false; }
  return persisted;
}

// タイトルで「記録をリンクで残す」をすすめるか（iPhone のブラウザで、5匹以上釣って、14日以上残していないとき）
export function shouldRemind() {
  if (IN_ARTIFACT || INAPP || !IOS || STANDALONE || persisted) return false;
  return caughtTotal() >= 5 && Date.now() - keptAt() > 14 * 864e5;
}

// 記録ごとリンクをコピーする。コピーできないときは、リンクを選んだ状態で見せる（box に入れる）
export async function copyRecordLink(place, box) {
  const url = await moveLink(place);
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); ok = true; } } catch (e) { ok = false; }
  if (!ok && box) {
    box.innerHTML = '';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.readOnly = true; inp.value = url; inp.className = 'klink';
    inp.setAttribute('aria-label', L('記録ごとリンク', 'Link with your records'));
    box.append(inp);
    inp.focus(); inp.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  }
  markKept();
  return ok;
}

export const KEEP_ENV = { IOS, ANDROID, STANDALONE };
