// 図鑑カードと「できごと」の並びを、js/species.js から index.html に流しこむ（何度実行しても同じ結果）
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { SPECIES } = await import(path.join(ROOT, 'js/species.js'));
const TINT = {
  funa: ['#cfe3df', '#93b8b3'], koi: ['#d3e3ea', '#9bbac6'], tanago: ['#dbe5ee', '#afc2d4'], imori: ['#e8dfc8', '#c4b488'], dojo: ['#cfe0cb', '#9bbb9a'],
  zarigani: ['#d3e5de', '#98bdb0'], namazu: ['#e6dec9', '#bfae88'], nishiki: ['#c4d9e2', '#86abbf'], hibuna: ['#efdcdc', '#cfa9b2'], unagi: ['#d2e4dd', '#88b4a4'],
  herabuna: ['#eadfc2', '#d0b684'], wakasagi: ['#dae7f0', '#a6c4dc'], nushi: ['#d6dcc2', '#9ea882'], boot: ['#e1d8c5', '#bfae8e'],
};
const SEA = { spring: ['sp', '春だけ'], summer: ['su', '夏だけ'], autumn: ['au', '秋だけ'], winter: ['wi', '冬だけ'] };
const dots = (r) => '●'.repeat(Math.max(1, 5 - r)) + '○'.repeat(Math.min(4, r - 1));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const cards = SPECIES.map((s, i) => {
  const [t1, t2] = TINT[s.id];
  const sea = s.legend ? ['le', '雨のときだけ'] : s.junk ? ['ju', 'ときどき…'] : s.season ? SEA[s.season] : ['ju', 'ずっと'];
  const desc = esc(s.desc);
  return `      <li class="card" data-id="${s.id}" data-season="${s.season || ''}" tabindex="-1">
        <div class="card-img" style="--tint1:${t1};--tint2:${t2}">
          <span class="card-no">No.${String(i + 1).padStart(2, '0')}</span><span class="card-sea ${sea[0]}">${sea[1]}</span>
          <img src="assets/img/fish-${s.id}-600.webp" srcset="assets/img/fish-${s.id}-600.webp 600w, assets/img/fish-${s.id}-900.webp 900w" sizes="(max-width: 520px) 70vw, 340px" width="900" height="563" alt="${s.name}の絵" loading="lazy" decoding="async" draggable="false">
        </div>
        <canvas class="card-bite" aria-hidden="true"></canvas>
        <div class="card-body">
          <h3>${s.name}<small>${s.ruby}</small></h3>
          <p class="latin">${s.latin}</p>
          <p class="meta"><span>大きさ <b>${s.cm[0]}–${s.cm[1]}</b>cm</span><span>会いやすさ <b>${dots(s.rarity)}</b></span></p>
          <p class="desc">${desc}</p>
          <p class="bite"><span>アタリ</span>${esc(s.biteText || '—')}</p>
        </div>
      </li>`;
}).join('\n');

const MOM = [
  ['m1', 'rainbow', '虹', '雨あがりの空に、ときどき虹。うっすら、副虹までかかります。', '', 0.06],
  ['m2', 'kingfisher', 'カワセミ', '晴れた昼、杭にとまって、水面へダイブ。魚をくわえて飛び去ることも。', '', 0.1],
  ['m3', 'frog', 'カエル', '水辺に、ちいさなお客さん。ぴょんと跳ねて、ぽちゃん。', '', 0.05],
  ['m4', 'cat-dusk', '夕方の猫', '桟橋にちょこんと座って、おすそわけを待っています。', '', 0.08],
  ['m5', 'neighbor', '隣のおじいさん', 'となりで釣っています。話しかけると、ぽつりぽつり返事が。', '', 0.04],
  ['m6', 'boat-deep', '手こぎボート', '桟橋のボートで、沖の深みや岸ぎわへ。景色も、目の高さも変わります。', '', 0.06],
  ['m7', 'meteor', '流れ星', '夜のあいだに、ひとすじ。願いごとは、ひとつだけ。', '', 0.08],
  ['m8', 'fireworks', '遠くの花火', '夏の夜、ドンと音が遅れて届きます。水面にも、うつります。', '', 0.04],
];
const moments = MOM.map(([cls, name, t, cap, , par]) => `    <figure class="mo ${cls}" data-par="${par}"><img src="assets/img/${name}-1000.webp" srcset="assets/img/${name}-700.webp 700w, assets/img/${name}-1000.webp 1000w, assets/img/${name}-1500.webp 1500w" sizes="(max-width: 960px) 92vw, 52vw" width="1500" height="844" alt="${t}の場面" loading="lazy" decoding="async"><figcaption><b>${t}</b>${cap}</figcaption></figure>`).join('\n');

const f = path.join(ROOT, 'index.html');
let h = fs.readFileSync(f, 'utf8');
const sub = (name, body) => { h = h.replace(new RegExp(`(<!--build:${name}-->)[\\s\\S]*?(<!--/build:${name}-->)`), `$1\n${body}\n$2`); };
sub('cards', cards); sub('moments', moments);
fs.writeFileSync(f, h);
console.log('built', SPECIES.length, 'cards,', MOM.length, 'moments');
