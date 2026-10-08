// ファイルを保存する（写真・魚拓・記録の書き出し）。
// claude.ai の Artifact の中では、ページは「枠」の中で動いていて、ふつうのダウンロード（リンクをクリックさせる方法）は
// ブラウザに止められる。そこでは、枠の外の「ファイルを保存」機能（downloads）に渡す。見る人に確認が出て、OK で保存される。
// それ以外（ふつうのウェブページ）では、いつものダウンロードをする。

let dlPromise = null;
// 起動時に一度だけ聞いておく（押したときにすぐ保存の確認が出るように）
export function prepareDownloads() {
  if (dlPromise) return dlPromise;
  const c = typeof window !== 'undefined' ? window.claude : null;
  dlPromise = c && typeof c.use === 'function' ? c.use('downloads').catch(() => null) : Promise.resolve(null);
  return dlPromise;
}

function plainDownload(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// 結果: 'saved'（保存した／ダウンロードを始めた）, 'declined'（見る人がやめた）, 'failed'
export async function saveFile(filename, data) {
  const dl = await prepareDownloads();
  if (dl) {
    try {
      await dl.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') return 'declined';
      if (code === 'rate_limited') return 'failed';
      // 使えないとき（unavailable など）は、ふつうのダウンロードを試す
    }
  }
  try { plainDownload(filename, data); return 'saved'; } catch (e) { return 'failed'; }
}

// canvas を画像ファイルにして保存
export function saveCanvas(canvas, filename, type = 'image/png', quality) {
  return new Promise((res) => {
    canvas.toBlob((b) => { if (!b) { res('failed'); return; } saveFile(filename, b).then(res); }, type, quality);
  });
}
