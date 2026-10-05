// Artifact（claude.ai の公開ページ）用に、index.html から外側のタグを取りのぞいた artifact.html をつくる。
// 使い方: node tools/make-artifact.mjs  → dist/artifact.html（本文と、css/js への相対リンクだけ）
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const body = h.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
const head = `<title>ひだまり沼 紹介サイト</title>\n<link rel="stylesheet" href="css/style.css">\n<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">\n`;
const out = head + body.replace(/<script type="module" src="js\/main.js"><\/script>/, '<script type="module" src="js/main.js"></script>');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/artifact.html'), out);
console.log('wrote dist/artifact.html', out.length, 'bytes');
