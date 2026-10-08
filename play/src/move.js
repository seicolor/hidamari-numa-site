// 引っ越し: claude.ai の Artifact で遊んだ記録を、GitHub Pages のひだまり（ふつうのウェブページ）へ持っていく。
// Artifact と Pages は記録の置き場所（localStorage）が別なので、記録をリンクの # のうしろに入れて、新しいタブで Pages を開く。
// Pages のほうでは、開いたときに # を読んで「この記録を読み込みますか」とたずね、読み込んだら # を消して開き直す。
// （# のうしろはサーバーに送られない。リンクを見せたり、だれかに送ったりしないこと）
import { L } from './i18n.js';
import { exportText, parseImport, applyImport } from './backup.js';

export const PLAY_URL = 'https://seicolor.github.io/hidamari-numa-site/play/';

// いま claude.ai の Artifact の中で動いているか
export const IN_ARTIFACT = (() => {
  try { return /claudeusercontent\.com$|claude\.ai$/.test(location.hostname) || !!(window.claude && typeof window.claude.use === 'function'); } catch (e) { return false; }
})();

const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// 記録を入れた、Pages へのリンク（place: そこから始める釣り場）
export async function moveLink(place) {
  const raw = new TextEncoder().encode(exportText());
  let tag = 'j', data = raw;
  if (typeof CompressionStream === 'function') { try { data = await pipe(raw, new CompressionStream('deflate-raw')); tag = 'z'; } catch (e) { data = raw; tag = 'j'; } }
  return `${PLAY_URL}${place ? `?place=${place}` : ''}#move=${tag}${b64u(data)}`;
}

async function readMove(h) {
  const tag = h[0], bytes = unb64u(h.slice(1));
  const raw = tag === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return new TextDecoder().decode(raw);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Pages 側: # に記録があれば、たずねて読み込む（Android でアプリ内ブラウザから Chrome へ移るときは ?mv= に入っている）
async function receive() {
  let m = /[#&]move=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  if (!m) m = /[?&]mv=([A-Za-z0-9_-]+)/.exec(location.search || '');
  if (!m) return;
  const clean = () => { try { const u = new URL(location.href); u.hash = ''; u.searchParams.delete('mv'); history.replaceState(history.state, '', u.toString()); } catch (e) { /* ignore */ } };
  let r;
  try { r = parseImport(await readMove(m[1])); } catch (e) { r = { ok: false, msg: L('記録を読めませんでした（リンクが途中で切れているかもしれません）', 'Could not read the records (the link may have been cut off)') }; }
  clean();
  const el = document.createElement('div');
  el.id = 'wmove';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'wmvT');
  el.innerHTML = r.ok ? `
    <div class="wm-in">
      <div class="wc-k">${L('引っ越し', 'Moving in')}</div>
      <h2 id="wmvT">${L('記録を、こちらへ移しますか', 'Bring your records here?')}</h2>
      <ul class="wm-l">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="wc-note">${L('このブラウザにある、ここでの記録は、持ってきた記録に入れかわります。もとの場所（アプリの中のブラウザや claude.ai）の記録も、そのまま残ります。', 'Any records already saved here in this browser will be replaced. The records where they came from (the in-app browser or claude.ai) stay as they are.')}</p>
      <div class="wm-a"><button type="button" class="btn primary" data-a="yes"><span class="seal">釣</span>${L('この記録で遊ぶ', 'Play with these records')}</button><button type="button" class="btn small" data-a="no">${L('移さない', 'Not now')}</button></div>
    </div>` : `
    <div class="wm-in">
      <div class="wc-k">${L('引っ越し', 'Moving in')}</div>
      <h2 id="wmvT">${L('記録を移せませんでした', 'Could not move your records')}</h2>
      <p class="wc-note">${esc(r.msg)}${L('。claude.ai のゲームの設定にある「記録の書き出し」から、ファイルで移すこともできます。', '. You can also move them as a file with “Export / import records” in the game settings on claude.ai.')}</p>
      <div class="wm-a"><button type="button" class="btn small" data-a="no">${L('とじる', 'Close')}</button></div>
    </div>`;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const first = el.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'yes' && r.ok) {
      if (applyImport(r.saves)) { location.reload(); return; }
      el.querySelector('.wc-note').textContent = L('記録を書きこめませんでした（ブラウザの保存領域が使えないようです）', 'Could not save the records (browser storage seems unavailable)');
      return;
    }
    el.remove();
  });
}

if (!IN_ARTIFACT) receive();
