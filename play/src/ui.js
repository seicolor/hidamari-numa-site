// DOM UI: タイトル・HUD・ゲージ・釣果カード・図鑑・設定
import * as THREE from 'three';
import { SPECIES, SPECIES_ORDER, BAITS, stars, fmtWeight, weightG, likesOf, layerText, TACKLE_MIN, TACKLE_MAX } from './species.js';
import { clamp } from './util.js';
import { SEASON, SEASON_ID, SEASON_NAMES, SEASON_IDS, seasonOfDate } from './season.js';
import { PLACE } from './place.js';
import { saveCanvas, saveFile } from './download.js';
import { exportText, exportName, parseImport, applyImport } from './backup.js';
import { IN_ARTIFACT, PLAY_URL, moveLink } from './move.js';
import { L, EN, LANG, setLang } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const DEPTH_SCALE = 3.0; // ウキ下の目盛りの深さ(m)
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

const TOD = (hour) => {
  // 日の出・日の入りからの時間で区切る（秋は 4時〜・6時半〜・10時〜・15時〜・17時すぎ〜・19時〜・21時半〜）
  const r = SEASON.sun.rise, s = SEASON.sun.set;
  if (hour >= r - 2 && hour < r + 0.5) return L('明け方', 'Dawn');
  if (hour >= r + 0.5 && hour < r + 4) return L('朝', 'Morning');
  if (hour >= r + 4 && hour < s - 3) return L('昼', 'Daytime');
  if (hour >= s - 3 && hour < s - 0.8) return L('午後', 'Afternoon');
  if (hour >= s - 0.8 && hour < s + 1) return L('夕暮れ', 'Dusk');
  if (hour >= s + 1 && hour < s + 3.5) return L('宵', 'Evening');
  return L('夜', 'Night');
};


// 図鑑: 活性が高い時間・天気（釣ってみて分かるヒント）
function likeLine(sp, c) {
  if (sp.junk) return '';
  const lk = likesOf(sp);
  const good = [...lk.times, ...lk.wx].join(L('・', ', '));
  const poor = lk.poor.join(L('・', ', '));
  const fine = (t) => `<br><span style="color:var(--gold);font-size:13px">${t}</span>`;
  let out = '';
  if (good || poor) out += fine(`${good ? `${L('よく食う', 'Bites best')}: ${good}` : ''}${good && poor ? L('　／　', ' / ') : ''}${poor ? `<span style="color:var(--ink-dim)">${L('苦手', 'Poor')}: ${poor}</span>` : ''}`);
  out += fine(`${L('いるタナ', 'Depth')}: ${layerText(sp)}${sp.bottom ? '' : `<span style="color:var(--ink-dim)">${L('　朝夕・雨の日は浅く、晴れた昼は深く', ' — shallower at dawn, dusk and in rain; deeper on sunny middays')}</span>`}`);
  if (sp.season) out += fine(`${L('出会える季節', 'Season')}: ${L(`${SEASON_NAMES[sp.season]}だけ`, `${SEASON_NAMES[sp.season]} only`)}<span style="color:var(--ink-dim)">${L('　（設定の「季節」で変えられます）', ' (change it under Season in Settings)')}</span>`);
  if (c && c.count > 0 && sp.biteText) out += fine(`${L('アタリ', 'Bite')}: ${sp.biteText}`);
  if (c && c.dmin != null) out += fine(`<span style="color:var(--ink-dim)">${L('釣れたウキ下', 'Caught at depth')}: ${c.dmin === c.dmax ? c.dmin.toFixed(1) : `${c.dmin.toFixed(1)}〜${c.dmax.toFixed(1)}`} m</span>`);
  return out;
}

// ---- 釣果カードの「ものさし」 ----
// 魚の長さを実際の目盛りで見せる。うすい帯はその魚の普通のサイズ範囲。
function rulerSVG(sp, cm) {
  const maxRaw = Math.max(sp.cm[1] * 1.1, cm * 1.08);
  const unit = [1, 2, 5, 10, 20, 25, 50].find((u) => maxRaw / u <= 6) || 50;
  const max = Math.ceil(maxRaw / unit) * unit;
  const minor = unit >= 5 ? 1 : unit / 2;
  const W = 300, X0 = 8, Y = 26;
  const x = (v) => X0 + (v / max) * W;
  let t = '';
  for (let v = 0; v <= max + 1e-6; v += minor) {
    const major = Math.abs(v / unit - Math.round(v / unit)) < 1e-6;
    const xx = x(v).toFixed(1);
    t += `<line x1="${xx}" x2="${xx}" y1="${Y + 9}" y2="${Y + (major ? 17 : 12)}"/>`;
    if (major) t += `<text x="${xx}" y="${Y + 29}" text-anchor="middle">${+v.toFixed(1)}</text>`;
  }
  // 尺（30.3cm）はちょっとした自慢どころ
  if (['funa', 'koi', 'nishiki', 'namazu'].includes(sp.id) && 30.3 < max) {
    const xs = x(30.3).toFixed(1);
    t += `<line class="rl-shaku" x1="${xs}" x2="${xs}" y1="${Y - 6}" y2="${Y + 17}"/><text class="rl-shaku" x="${xs}" y="${Y + 40}" text-anchor="middle">${L('尺', '30cm')}</text>`;
  }
  const xe = x(cm);
  const anchor = xe > X0 + W * 0.78 ? 'end' : 'start';
  const lx = anchor === 'end' ? xe + 2 : xe - 2;
  return `<svg viewBox="0 0 316 62" role="img" aria-label="${L(`全長 ${cm.toFixed(1)} センチ`, `Length ${cm.toFixed(1)} cm`)}">
    <rect class="rl-track" x="${X0}" y="${Y}" width="${W}" height="3" rx="1.5"/>
    <rect class="rl-range" x="${x(sp.cm[0]).toFixed(1)}" y="${Y - 4}" width="${(x(sp.cm[1]) - x(sp.cm[0])).toFixed(1)}" height="11" rx="3"/>
    <rect class="rl-fill" x="${X0}" y="${Y - 2}" width="${(xe - X0).toFixed(1)}" height="7" rx="3.5"/>
    <path class="rl-fill" d="M${xe.toFixed(1)} ${Y - 3} l-4 -7 h8 z"/>
    <text class="rl-cm" x="${lx.toFixed(1)}" y="${Y - 14}" text-anchor="${anchor === 'end' ? 'end' : 'start'}">${cm.toFixed(1)} cm</text>
    ${t}
  </svg>`;
}

// その魚の普通の大きさの中で、どのくらいか
function sizeNote(sp, cm) {
  if (sp.junk) return '';
  if (sp.legend) return PLACE.legendSize;
  if (['funa', 'koi', 'nishiki', 'namazu'].includes(sp.id) && cm >= 30.3) return L('尺超え！ りっぱなサイズ', 'Over a shaku (30 cm)! A fine size');
  const p = (cm - sp.cm[0]) / Math.max(1, sp.cm[1] - sp.cm[0]);
  return p > 0.88 ? L(`大物！ この${PLACE.water}でも最大級`, `A big one! Among the largest in this ${PLACE.water}`) : p > 0.65 ? L('なかなかの型', 'A good size') : p > 0.3 ? L('ふつうのサイズ', 'An average size') : L('まだ若い、小さめの一匹', 'A young, small one');
}

export class UI {
  constructor(root, camera, save) {
    this.root = root;
    this.camera = camera;
    this.save = save;
    this.handlers = {};
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('touch', this.isTouch);
    this.isNarrow = false;
    this.thumbs = {};
    this.modal = null;
    this.toasts = [];
    this.daily = null;
    this.tackle = 0.8;
    this.floor = null;
    this.showMarks = save.setting('marks') !== 0;
    this._dp = { bait: null, fish: [] };
    this._build();
    addEventListener('resize', () => this._resize());
    this._resize();
  }

  _resize() {
    this.isNarrow = innerWidth < 760;
  }

  _build() {
    const r = this.root;
    r.innerHTML = '';
    // ---- タイトル ----
    this.title = h(`
      <div id="title">
        <div class="wrap">
          <h1>${PLACE.title}</h1>
          <div class="sub">${PLACE.id === 'hama' ? L('のんびり南の海釣り', 'Slow fishing in the tropics') : L('のんびり田舎釣り', 'Slow fishing in the countryside')}</div>
          <div class="menu">
            <div class="lead">${PLACE.lead}</div>
            <div class="tq" id="tq"></div>
            <button class="btn primary" id="startbtn" disabled><span class="seal">釣</span><span id="startlbl">${L('じゅんび中…', 'Loading…')}</span></button>
            <div><div id="loadbar"><i></i></div><div id="loadtxt"></div></div>
            <button class="tmap" id="tmapbtn" hidden title="${L('ほかの釣り場へ出かける', 'Travel to another fishing spot')}"><span class="globe" aria-hidden="true"></span>${L('旅の地図　ほかの釣り場へ', 'Travel map · other spots')}</button>
            ${IN_ARTIFACT ? `<div class="tmove"><b>${L('ひだまりは、引っ越しました。', 'Hidamari has moved.')}</b>${L('これからは、ブラウザで直接ひらける新しい場所で遊べます。この画面の記録（図鑑・釣果・水槽）も持っていけます。', 'You can now play at a new address that opens directly in your browser, and bring your records (field guide, catches, aquarium) with you.')}<a id="tmovea" href="${PLAY_URL}" target="_blank" rel="noopener">${L('記録を持って、引っ越す →', 'Move with my records →')}</a></div>` : ''}
            <div class="tips">
              ${EN ? `<b>Cast</b><span>Left click (Space): <kbd>hold</kbd>, then <kbd>release</kbd></span>
              <b>Bite</b><span>When the bobber sinks, click right away to strike</span>
              <b>Fight</b><span>Hold to reel in. When the gauge turns red, <kbd>let go</kbd></span>
              <b>Look</b><span>Move the mouse / right-drag / <kbd>A</kbd><kbd>D</kbd> · wheel to zoom</span>
              <b>Bait</b><span><kbd>1</kbd> ${BAITS.worm.name} · <kbd>2</kbd> ${BAITS.dough.name} · <kbd>3</kbd> ${BAITS.gluten.name} · <kbd>J</kbd> Guide · <kbd>O</kbd> Tasks</span>
              <b>Rod</b><span><kbd>Q</kbd> ${PLACE.rodLine}</span>
              <b>Depth</b><span><kbd>[</kbd> shallower · <kbd>]</kbd> deeper (or use the scale on the right). Each fish has a favourite depth</span>
              <b>Zoom</b><span>Tap the ring around a far bobber (<kbd>Z</kbd>) to zoom in</span>` : `<b>投げる</b><span>左クリック（スペース）を<kbd>押し続けて</kbd>、<kbd>はなす</kbd></span>
              <b>アタリ</b><span>ウキが沈んだら、すぐにクリックで合わせる</span>
              <b>やりとり</b><span>押し続けて巻く。ゲージが赤いときは<kbd>はなす</kbd></span>
              <b>見回す</b><span>マウスを動かす／右ドラッグ／<kbd>A</kbd><kbd>D</kbd>　ホイールでズーム</span>
              <b>エサ</b><span><kbd>1</kbd> ${BAITS.worm.name}　<kbd>2</kbd> ${BAITS.dough.name}　<kbd>3</kbd> ${BAITS.gluten.name}　<kbd>J</kbd> 図鑑　<kbd>O</kbd> お題</span>
              <b>竿</b><span><kbd>Q</kbd> ${PLACE.rodLine}</span>
              <b>ウキ下</b><span><kbd>[</kbd> 浅く　<kbd>]</kbd> 深く（右の目盛りでも）。魚ごとに好きな深さがあります</span>
              <b>拡大</b><span>遠いウキは、まわりの輪をタップ（<kbd>Z</kbd>）で拡大</span>`}
            </div>
          </div>
        </div>
      </div>`);
    // ---- HUD ----
    this.hud = h(`
      <div id="hud">
        <div id="flash"></div><div id="danger"></div>
        <div class="tlc hudpart">
          <div class="tl panel"><div class="wx" id="wx">☀</div><div><div class="clock" id="clock">17:20</div><div class="tod" id="tod"></div><div class="act" id="act"></div></div></div>
          <button class="quest panel" id="quest" title="${L('今日のお題 (O)', 'Today\'s tasks (O)')}"><b id="questTag">${L('お題', 'Task')}</b><span id="questTxt"></span></button>
        </div>
        <div class="dp panel hudpart" id="depth">
          <div class="dp-h"><span class="dp-k">${L('ウキ下', 'Depth')}</span><span class="dp-n"><b id="dpv">0.8</b> m</span></div>
          <div class="dp-bt"><button id="dpUp" aria-label="${L('浅く', 'Shallower')}" title="${L('浅く', 'Shallower')} ( [ )">▲</button><button id="dpDn" aria-label="${L('深く', 'Deeper')}" title="${L('深く', 'Deeper')} ( ] )">▼</button></div>
          <canvas id="dpc"></canvas>
          <div class="dp-w" id="dpw">${L('水深', 'Water')} --</div>
        </div>
        <div class="tr hudpart">
          <button class="panel iconbtn" id="btnMap" title="${L('旅の地図　ほかの釣り場へ', 'Travel map · other spots')}"><span class="globe" aria-hidden="true"></span><span class="ml">${L('地図', 'Map')}</span></button>
          <button class="panel iconbtn" id="btnJournal" title="${L('図鑑 (J)', 'Field guide (J)')}">${L('図鑑', 'Guide')}</button>
          <button class="panel iconbtn" id="btnSound" title="${L('音 (M)', 'Sound (M)')}">♪</button>
          <button class="panel iconbtn" id="btnSettings" title="${L('設定 (Esc)', 'Settings (Esc)')}">${L('設定', 'Settings')}</button>
        </div>
        <div class="bl panel hudpart"><p class="lbl">${L('竿', 'Rod')}　<span class="k">[Q]</span></p><div class="baits" id="rods"></div><p class="lbl" style="margin-top:8px">${L('エサ', 'Bait')}</p><div class="baits" id="baits"></div></div>
        <div class="br hudpart"><button class="btn small" id="tankBtn" title="${L('水槽を見る (V)', 'View the aquarium (V)')}">${L('水槽を見る', 'Aquarium')}<kbd>V</kbd></button><button class="btn small" id="boatBtn" title="${L('ボートでこぎだす (B)', 'Row out in the boat (B)')}">${L('ボートにのる', 'Take the boat')}<kbd>B</kbd></button><button class="btn small" id="talkBtn" title="${L('おじいさんに話しかける (T)', 'Talk to the old man (T)')}">${L('おじいさんと話す', 'Talk to the old man')}<kbd>T</kbd></button><button class="btn small" id="catBtn" title="${L('猫に魚をあげる (C)', 'Give the cat a fish (C)')}">${L('ねこに魚をあげる', 'Feed the cat')}<kbd>C</kbd></button><div class="kept panel" id="kept">${L('びく', 'Creel')}　<b id="keptn">0</b> ${L('匹', '')}</div><button id="actbtn">${L('つる', 'Fish')}</button></div>
        <div class="bc">
          <div id="hint"></div>
          <div class="gauge" id="power"><div class="name"><span>${L('投げる力', 'Cast power')}</span></div><div class="gbar"><div class="fill"></div></div></div>
          <div class="gauge" id="tension"><div class="name"><span>${L('糸の張り', 'Line tension')}</span><span>${L('巻く：押す　ゆるめる：はなす', 'Reel: hold · Ease: release')}</span></div><div class="gbar"><div class="zone"></div><div class="redz"></div><div class="mark" style="left:0%"></div></div></div>
        </div>
        <div id="toast"></div>
        <div id="marker"></div>
        <div id="fps" class="hidden"></div>
      </div>`);
    r.append(this.hud, this.title);
    const baits = $('#baits', this.hud);
    for (const b of Object.values(BAITS)) {
      const el = h(`<button class="chip" data-b="${b.id}">${b.name}<small>${BAITS[b.id].key || ''}</small></button>`);
      el.addEventListener('click', () => this.handlers.onBait && this.handlers.onBait(b.id));
      baits.append(el);
    }
    const rodsEl = $('#rods', this.hud);
    for (const [id, nm, sub] of [['reel', L('リール竿', 'Reel rod'), L('遠投・巻く', 'Long cast · reel')], ['hera', PLACE.rodHera, PLACE.rodHeraSub]]) {
      const el = h(`<button class="chip" data-r="${id}">${nm}<small>${sub}</small></button>`);
      el.addEventListener('click', () => this.handlers.onRod && this.handlers.onRod(id));
      rodsEl.append(el);
    }
    this.rodsEl = rodsEl;
    const keys = { worm: '1', dough: '2', gluten: '3' };
    baits.querySelectorAll('.chip').forEach((c) => (c.querySelector('small').textContent = `[${keys[c.dataset.b]}]`));
    $('#btnJournal', this.hud).addEventListener('click', () => this.toggleJournal());
    $('#btnMap', this.hud).addEventListener('click', () => this.handlers.onMap && this.handlers.onMap());
    $('#tmapbtn', this.title).addEventListener('click', () => this.handlers.onMap && this.handlers.onMap());
    // 引っ越しのリンクに、いまの記録を入れておく（押したときに、すぐ開けるように）
    if (IN_ARTIFACT) {
      const a = $('#tmovea', this.title);
      const fill = () => moveLink(PLACE.id).then((u) => { a.href = u; }).catch(() => {});
      fill(); setInterval(fill, 15000);
    }
    $('#btnSettings', this.hud).addEventListener('click', () => this.toggleSettings());
    $('#btnSound', this.hud).addEventListener('click', () => this.handlers.onMute && this.handlers.onMute());
    this.tankBtn = $('#tankBtn', this.hud);
    if (!PLACE.tank) this.tankBtn.style.display = 'none';
    this.tankBtn.addEventListener('click', () => this.handlers.onTank && this.handlers.onTank());
    this.boatBtn = $('#boatBtn', this.hud);
    if (!PLACE.boat) this.boatBtn.style.display = 'none';
    if (!PLACE.neighbor) { const t = $('#talkBtn', this.hud); if (t) t.style.display = 'none'; }
    this.boatBtn.addEventListener('click', () => this.handlers.onBoatMenu && this.handlers.onBoatMenu());
    this.talkBtn = $('#talkBtn', this.hud);
    this.talkBtn.addEventListener('click', () => this.handlers.onTalk && this.handlers.onTalk());
    this.catBtn = $('#catBtn', this.hud);
    this.catBtn.addEventListener('click', () => this.handlers.onCat && this.handlers.onCat());
    const act = $('#actbtn', this.hud);
    const down = (e) => { e.preventDefault(); act.classList.add('down'); this.handlers.onAction && this.handlers.onAction(true); };
    const up = (e) => { e.preventDefault(); act.classList.remove('down'); this.handlers.onAction && this.handlers.onAction(false); };
    act.addEventListener('pointerdown', down);
    act.addEventListener('pointerup', up);
    act.addEventListener('pointercancel', up);
    act.addEventListener('pointerleave', (e) => { if (act.classList.contains('down')) up(e); });
    this.el = {
      clock: $('#clock', this.hud), tod: $('#tod', this.hud), act: $('#act', this.hud), wx: $('#wx', this.hud), hint: $('#hint', this.hud),
      power: $('#power', this.hud), tension: $('#tension', this.hud), toast: $('#toast', this.hud),
      flash: $('#flash', this.hud), danger: $('#danger', this.hud), marker: $('#marker', this.hud),
      kept: $('#keptn', this.hud), baits, fps: $('#fps', this.hud), start: $('#startbtn', this.title),
      startlbl: $('#startlbl', this.title), loadbar: $('#loadbar i', this.title), loadtxt: $('#loadtxt', this.title),
      sound: $('#btnSound', this.hud),
      quest: $('#quest', this.hud), questTag: $('#questTag', this.hud), questTxt: $('#questTxt', this.hud), tq: $('#tq', this.title),
      dpv: $('#dpv', this.hud), dpc: $('#dpc', this.hud), dpw: $('#dpw', this.hud), depth: $('#depth', this.hud),
    };
    this.el.quest.addEventListener('click', () => this.toggleDaily());
    // ウキ下: ▲▼ ボタン、目盛りをタップ/ドラッグ
    $('#dpUp', this.hud).addEventListener('click', () => this.handlers.onDepthStep && this.handlers.onDepthStep(-1));
    $('#dpDn', this.hud).addEventListener('click', () => this.handlers.onDepthStep && this.handlers.onDepthStep(1));
    {
      const c = this.el.dpc;
      let drag = false;
      const set = (e) => {
        const r = c.getBoundingClientRect();
        const m = ((e.clientY - r.top) / Math.max(1, r.height)) * DEPTH_SCALE;
        this.handlers.onDepth && this.handlers.onDepth(clamp(Math.round(m * 10) / 10, TACKLE_MIN, TACKLE_MAX));
      };
      c.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = true; c.setPointerCapture(e.pointerId); set(e); });
      c.addEventListener('pointermove', (e) => { if (drag) set(e); });
      const end = () => { drag = false; };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
    }
    // ウキのまわりの輪をタップすると拡大（もう一度で戻る）
    this.el.marker.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.handlers.onMarker && this.handlers.onMarker(); });
    this.setBait(this.save.setting('bait') || 'dough');
  }

  // ---------------------------------------------------------------- ローディング
  setLoading(p, text) {
    this.el.loadbar.style.width = `${Math.round(p * 100)}%`;
    if (text !== undefined) this.el.loadtxt.textContent = text;
  }

  ready(onStart) {
    this.el.start.disabled = false;
    this.el.startlbl.textContent = L('釣りに出かける', 'Go fishing');
    this.el.loadtxt.textContent = '';
    this.el.loadbar.parentElement.style.display = 'none';
    $('#tmapbtn', this.title).hidden = false;
    this.el.start.addEventListener('click', () => {
      this.title.classList.add('out');
      this.hud.classList.add('on');
      onStart();
    });
  }

  // ---------------------------------------------------------------- HUD
  setClock(hour, weather, activity, extra = '') {
    if (activity != null) {
      // 魚の気配（時間と天気で変わる沼全体の活発さ）
      const n = activity >= 1.2 ? 3 : activity >= 0.95 ? 2 : 1;
      // 場所ごとの様子（潮・波など）は別の span に（せまい画面では2行目に）
      const t = `${L('魚の気配', 'Fish activity')} ${'●'.repeat(n)}${'○'.repeat(3 - n)}`;
      const k = `${t}|${extra}`;
      if (this._act !== k) {
        this._act = k;
        this.el.act.textContent = t;
        if (extra) { const e = document.createElement('span'); e.className = 'ex'; e.textContent = extra; this.el.act.append(e); }
      }
    }
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.el.tod.textContent = TOD(hour);
    this.el.wx.textContent = weather === 'rain' ? (SEASON.snow ? '❄' : '☂') : weather === 'cloudy' ? '☁' : (hour >= SEASON.sun.set + 0.8 || hour < SEASON.sun.rise - 1 ? '☾' : '☀');
  }

  setHint(t) {
    if (this._hint !== t) { this._hint = t; this.el.hint.textContent = t; }
  }

  setPower(v) {
    const g = this.el.power;
    if (v == null) { g.classList.remove('on'); return; }
    g.classList.add('on');
    $('.fill', g).style.width = `${Math.round(v * 100)}%`;
  }

  setTension(v) {
    const g = this.el.tension;
    if (v == null) { g.classList.remove('on', 'hot'); this.el.danger.style.opacity = 0; return; }
    g.classList.add('on');
    $('.mark', g).style.left = `${clamp(v, 0, 1.05) / 1.05 * 100}%`;
    this._hot = this._hot ? v > 0.76 : v > 0.86;
    g.classList.toggle('hot', this._hot);
    const tgt = (this._hot ? Math.min(0.9, (v - 0.76) * 5) : 0) * (document.body.classList.contains('calm') ? 0.45 : 1);
    this._dang = (this._dang || 0) + (tgt - (this._dang || 0)) * 0.25;
    this.el.danger.style.opacity = this._dang;
  }

  toast(text, kind = 'info', ms = 1800) {
    const t = h(`<div class="toast ${kind}">${text}</div>`);
    const box = this.el.toast;
    while (box.children.length > 2) box.firstChild.remove();
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, ms);
  }

  flashBite() {
    if (document.body.classList.contains('calm')) return;
    const f = this.el.flash;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  setBait(id) {
    this.el.baits.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.b === id));
  }

  setRod(id) {
    if (!this.rodsEl) return;
    this.rodsEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.r === id));
  }

  setKept(n) { this.el.kept.textContent = n; }
  // 桟橋の猫がびくの魚をほしそうにしているとき、あげるボタンを出す
  setCatOffer(on) { this.catBtn.classList.toggle('on', !!on); }
  // ボートの行き先を選ぶ
  openBoat(spots, at) {
    const here = at === 'pier' ? 'pier' : at;
    const rows = spots.map((s) => `
      <button class="bspot${s.id === here ? ' here' : ''}" data-id="${s.id}">
        <span class="bn">${s.name}${s.id === here ? `<em>${L('いまここ', 'You are here')}</em>` : ''}</span>
        <span class="bd">${s.id === 'pier' ? '' : `${L('水深', 'Depth')} ${s.depth.toFixed(1)} m · `}${s.note}</span>
      </button>`).join('');
    const el = h(`
      <div class="modal" data-k="boat">
        <div class="box panel" style="width:min(560px,94vw)">
          <button class="close">×</button>
          <h2>${L('ボート', 'Boat')}</h2>
          <div class="sub">${L('どこへこぎだそうか', 'Where shall we row?')}</div>
          <div class="boatlist">${rows}</div>
        </div>
      </div>`);
    el.querySelectorAll('.bspot').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.id === here) { this.closeModal(); return; }
      this.handlers.onTick && this.handlers.onTick();
      this.closeModal();
      this.handlers.onBoat && this.handlers.onBoat(b.dataset.id);
    }));
    this._openModal(el);
    el.dataset.k = 'boat';
  }
  setBoatLabel(onPier) { this.boatBtn.firstChild.textContent = onPier ? L('ボートにのる', 'Take the boat') : L('ボートで移動', 'Row elsewhere'); }
  setTalkOffer(on) { this.talkBtn.classList.toggle('on', !!on); }
  // おじいさんの話しことば
  say(text, ms = 4200) { this.toast(`<b>${L('おじいさん', 'Old man')}</b>${text}`, 'say', ms); }

  setSoundIcon(on) { this.el.sound.textContent = on ? '♪' : L('無音', 'Muted'); }

  // 遠いウキを拡大中は、マーカーを目立たせて、近くても消さない
  setMarkerZoom(on) {
    this.markerZoom = !!on;
    this.el.marker.classList.toggle('zoomed', !!on);
  }

  updateBobberMarker(pos) {
    const m = this.el.marker;
    if (!pos) { m.style.opacity = 0; m.style.pointerEvents = 'none'; return; }
    const cam = this.camera;
    const v = new THREE.Vector3(pos.x, pos.y + 0.25, pos.z);
    const d = v.distanceTo(cam.position);
    v.project(cam);
    if (v.z > 1 || (d < 9 && !this.markerZoom)) { m.style.opacity = 0; m.style.pointerEvents = 'none'; return; }
    const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    const op = this.markerZoom ? 0.9 : Math.min(0.9, (d - 9) / 8) * 0.75;
    m.style.opacity = op;
    m.style.pointerEvents = op > 0.15 ? 'auto' : 'none';
    m.style.transform = `translate(${x}px,${y}px)`;
    m.style.left = '0'; m.style.top = '0';
  }

  setFps(txt) {
    this.el.fps.textContent = txt;
  }


  // ---------------------------------------------------------------- ウキ下（タナ）
  setTackle(v) {
    this.tackle = v;
    this.el.dpv.textContent = v.toFixed(1);
    this.drawDepth();
  }

  // いま見ている場所の水深(m)。null で消す
  setWater(floor) {
    if (this.floor === floor) return;
    this.floor = floor;
    this.el.dpw.textContent = floor == null ? `${L('水深', 'Water')} --` : `${L('水深', 'Water')} ${floor.toFixed(1)} m`;
    this.drawDepth();
  }

  // bait: エサの深さ(m)。fish: [{ lx(-1..1), d(m), cm, dir(±1), hot(0..1), near(0..1) }]
  setDepthView(bait, fish) {
    if (bait == null && this._dp.bait == null && !this._dp.fish.length && !fish.length) return;
    this._dp.bait = bait;
    this._dp.fish = this.showMarks ? fish : [];
    this.drawDepth();
  }

  setMarks(on) {
    this.showMarks = !!on;
    this.save.setting('marks', on ? 1 : 0);
    if (!on) this._dp.fish = [];
    this.drawDepth();
  }

  // 水中を横から見た図: 水面・水底・エサ・近くの魚影
  drawDepth() {
    const c = this.el.dpc;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const Y = (d) => (d / DEPTH_SCALE) * h;
    const X0 = 17, X1 = w - 9, CX = (X0 + X1) / 2;
    g.save();
    g.beginPath();
    const r = 8;
    g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath();
    g.clip();
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(150,208,196,.46)'); gr.addColorStop(0.55, 'rgba(46,96,92,.62)'); gr.addColorStop(1, 'rgba(10,28,28,.82)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 水底
    if (this.floor != null && this.floor < DEPTH_SCALE) {
      const y = Y(this.floor);
      g.fillStyle = 'rgba(66,48,30,.96)'; g.fillRect(0, y, w, h - y);
      g.fillStyle = 'rgba(132,102,66,.95)'; g.fillRect(0, y, w, 2);
      g.strokeStyle = 'rgba(30,20,12,.5)'; g.lineWidth = 1;
      for (let x = 4; x < w; x += 9) { g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 5, Math.min(h, y + 9)); g.stroke(); }
    }
    // 目盛り
    g.font = '9px "Shippori Mincho", serif';
    g.textBaseline = 'middle';
    for (let m = 0.5; m < DEPTH_SCALE - 0.01; m += 0.5) {
      const y = Y(m), major = Math.abs(m - Math.round(m)) < 1e-6;
      g.strokeStyle = major ? 'rgba(255,240,210,.55)' : 'rgba(255,240,210,.3)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(major ? 10 : 6, y); g.stroke();
      if (major) { g.fillStyle = 'rgba(255,240,210,.8)'; g.fillText(String(m), 12, y); }
    }
    // 水面
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(w, 1); g.stroke();
    // 魚影
    const fish = this._dp.fish || [];
    for (const f of fish) {
      const x = CX + f.lx * (X1 - X0) * 0.5, y = clamp(Y(f.d), 4, h - 3);
      const L = clamp(4 + f.cm * 0.26, 5, 17), H = L * 0.38;
      const a = 0.28 + 0.55 * f.near;
      g.save();
      g.translate(x, y);
      g.scale(f.dir >= 0 ? 1 : -1, 1);
      g.fillStyle = `rgba(255,236,190,${a})`;
      g.beginPath(); g.ellipse(0, 0, L / 2, H / 2, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-L / 2 + 1, 0); g.lineTo(-L / 2 - L * 0.28, -H * 0.55); g.lineTo(-L / 2 - L * 0.28, H * 0.55); g.closePath(); g.fill();
      if (f.hot > 0) { g.strokeStyle = `rgba(255,200,90,${0.55 + 0.45 * f.hot})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, 0, L / 2 + 2, H / 2 + 2, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
    }
    // ウキ下の設定（金の三角と細い線）
    const yt = Y(this.tackle);
    g.strokeStyle = 'rgba(232,200,114,.32)'; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(0, yt); g.lineTo(w, yt); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#e8c872';
    g.beginPath(); g.moveTo(w, yt - 5); g.lineTo(w - 8, yt); g.lineTo(w, yt + 5); g.closePath(); g.fill();
    // 糸・ウキ・エサ
    const bait = this._dp.bait;
    const yb = bait == null ? yt : Y(bait);
    g.strokeStyle = bait == null ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.85)'; g.lineWidth = 1;
    if (bait == null) g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(CX, 4); g.lineTo(CX, yb); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff5a36'; g.beginPath(); g.arc(CX, 3, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = bait == null ? 'rgba(255,170,90,.45)' : '#ffb25a'; g.strokeStyle = 'rgba(80,36,10,.9)'; g.lineWidth = 1;
    g.beginPath(); g.arc(CX, yb, 3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- 今日のお題
  // HUD の短い表示
  setQuest() {
    const d = this.daily;
    if (!d || !this.el.quest) return;
    const s = d.summary();
    this.el.quest.classList.toggle('done', !!s.all);
    const t = s.all ? L('✔ すべて達成！', '✔ All done!') : s.text;
    if (this._q !== t) { this._q = t; this.el.questTxt.textContent = t; this.el.questTag.textContent = s.tag; }
    this.renderTitleQuest();
  }

  renderTitleQuest() {
    const d = this.daily;
    if (!d || !this.el.tq) return;
    const rows = d.list.map((c, i) => `<div class="tqr ${d.isDone(i) ? 'ok' : ''}"><span class="tqm">${d.isDone(i) ? '✔' : '○'}</span><span><small>${c.label}</small>${c.text}${c.goal > 1 && !d.isDone(i) ? ` <i>${d.progress(i)}/${c.goal}</i>` : ''}</span></div>`).join('');
    const st = d.streak(), tt = d.title();
    this.el.tq.innerHTML = `<div class="tqh">${L('今日のお題', 'Today\'s tasks')}<span>${d.key.replace(/-/g, '/')}</span>${st > 0 ? `<em>${L(`${st}日連続`, `${st}-day streak`)}</em>` : ''}</div>${rows}${tt ? `<div class="tqt">${L('称号', 'Title')}　${tt}</div>` : ''}`;
  }

  toggleDaily() { if (this.modal && this.modal.dataset.k === 'daily') this.closeModal(); else this.openDaily(); }

  openDaily() {
    const d = this.daily;
    if (!d) return;
    d.refresh();
    const cards = d.list.map((c, i) => {
      const done = d.isDone(i), p = d.progress(i);
      return `<div class="dq ${done ? 'ok' : ''} ${c.bonus ? 'bonus' : ''}">
        <div class="dq-h"><span class="dq-m">${done ? '✔' : c.bonus ? '★' : '○'}</span><span class="dq-l">${c.label}</span>${done ? `<span class="dq-s">${L('達成', 'Done')}</span>` : ''}</div>
        <div class="dq-t">${c.text}</div>
        ${c.goal > 1 ? `<div class="prog" style="margin:8px 0 4px"><i style="width:${(p / c.goal) * 100}%"></i></div><div class="dq-p">${p} / ${c.goal}</div>` : ''}
        <div class="dq-n">${c.hint}</div>
      </div>`;
    }).join('');
    const cal = d.recent(14).map((r) => `<div class="cl ${r.today ? 'today' : ''} n${r.n}" title="${r.key}"><i>${r.n >= 2 ? '◎' : r.n === 1 ? '●' : '·'}</i><small>${Number(r.key.slice(8))}</small></div>`).join('');
    const st = d.streak(), tt = d.title();
    const el = h(`
      <div class="modal" data-k="daily">
        <div class="box panel" style="width:min(640px,94vw)">
          <button class="close">×</button>
          <h2>${L('今日のお題', 'Today\'s tasks')}</h2>
          <div class="sub">${d.key.replace(/-/g, '/')}　　${L(`印 ${d.stampCount()} こ`, `${d.stampCount()} stamps`)}${st > 0 ? `　　${L(`${st}日連続`, `${st}-day streak`)}` : ''}${tt ? `　　${L(`称号「${tt}」`, `Title: ${tt}`)}` : ''}</div>
          <div class="dqs">${cards}</div>
          <div class="cal-h">${L('ここ2週間の印', 'Stamps from the last two weeks')}</div>
          <div class="cal">${cal}</div>
          <div class="dq-note">${L('お題は日付で決まるので、同じ日は誰でも同じお題です。達成すると印がつき、ふたつとも達成すると◎になります。', 'Tasks are set by the date, so everyone gets the same tasks on the same day. Finish one for a stamp, both for a ◎.')}</div>
          <div class="acts" style="margin-top:12px"><button class="btn small" id="dqCopy">${L('結果をコピー', 'Copy results')}</button></div>
          <textarea id="dqTxt" class="dq-ta hidden" readonly rows="4"></textarea>
        </div>
      </div>`);
    el.querySelector('#dqCopy').addEventListener('click', async () => {
      const txt = d.shareText();
      const ta = el.querySelector('#dqTxt');
      try { await navigator.clipboard.writeText(txt); this.toast(L('結果をコピーしました', 'Results copied'), 'info', 1600); }
      catch (e) { ta.value = txt; ta.classList.remove('hidden'); ta.select(); this.toast(L('下の文字をコピーしてください', 'Please copy the text below'), 'info', 2200); }
    });
    this._openModal(el);
    el.dataset.k = 'daily';
  }

  // ---------------------------------------------------------------- 釣果カード
  showCatch(info, junk) {
    this.hideCatch();
    const sp = info.sp;
    const badges = [];
    if (junk) badges.push(`<div class="badge">${L('あらら', 'Oops')}</div>`);
    else if (sp.legend) badges.push(`<div class="badge gold">${info.isNew ? `${PLACE.legendBadge}  ${L('はじめて', 'First!')}` : PLACE.legendBadge}</div>`);
    else if (info.isNew) badges.push(`<div class="badge">NEW  ${L('はじめて！', 'First catch!')}</div>`);
    else if (info.isRecord) badges.push(`<div class="badge gold">${L('自己ベスト更新', 'New personal best')}</div>`);
    const g = info.g;
    const best = info.entry && info.entry.best ? info.entry.best : info.cm;
    const keepLabel = junk ? L('ひろって帰る', 'Take it home') : L('びくに入れる', 'Keep in creel');
    const relLabel = junk ? L('もどす', 'Put back') : L('逃がす', 'Release');
    // ひだまり浜: 水槽へ（入らない魚は、理由をそえて押せないように）
    let tankBtn = '';
    if (PLACE.tank && !junk && this.tankCheck) {
      const r = this.tankCheck(sp, info.cm);
      tankBtn = r.ok ? `<button class="btn tkb" data-c="tank" title="${L('砂浜の水槽で飼う', 'Keep it in the beach aquarium')}">${L('水槽で飼う', 'To the aquarium')}<kbd>V</kbd></button>`
        : `<button class="btn tkb" disabled title="${r.msg}">${L('水槽で飼う', 'To the aquarium')}<small>${r.msg.replace(/（.*）| \(.*\)/, '')}</small></button>`;
    }
    const el = h(`
      <div id="catch" class="panel">
        ${badges.join('')}
        <div class="nm">${sp.name}</div>
        <div class="ruby">${sp.ruby ? `${sp.ruby}　` : ''}<i style="opacity:.6">${sp.latin}</i></div>
        ${junk ? '' : `<div class="stars">${stars(sp.rarity)}</div>`}
        <div class="sz">
          <div><span class="l">${L('全長', 'Length')}</span><span class="v">${info.cm.toFixed(1)}</span><span class="u">cm</span></div>
          <div><span class="l">${L('重さ', 'Weight')}</span><span class="v">${fmtWeight(g).replace(/ (g|kg)$/, '')}</span><span class="u">${/kg/.test(fmtWeight(g)) ? 'kg' : 'g'}</span></div>
        </div>
        <div class="ruler">${rulerSVG(sp, info.cm)}</div>
        ${sizeNote(sp, info.cm) ? `<div class="szn">${sizeNote(sp, info.cm)}</div>` : ''}
        ${!junk && info.depth != null ? `<div class="szn tk">${L(`ウキ下 ${info.depth.toFixed(1)} m ・ ${BAITS[info.bait] ? BAITS[info.bait].name : ''}で釣れた`, `Caught at ${info.depth.toFixed(1)} m · on ${BAITS[info.bait] ? BAITS[info.bait].name.toLowerCase() : ''}`)}</div>` : ''}
        ${!junk && !info.isNew && info.entry ? `<div class="rec">${L(`これまでの最大 ${info.entry.best.toFixed(1)} cm ・ ${info.entry.count}匹目`, `Best so far ${info.entry.best.toFixed(1)} cm · catch no. ${info.entry.count}`)}</div>` : ''}
        <p class="ds">${sp.desc}</p>
        <div class="acts">
          <button class="btn primary" data-c="keep">${keepLabel}<kbd>K</kbd></button>
          <button class="btn" data-c="release">${relLabel}<kbd>R</kbd></button>
          ${tankBtn}
          <button class="btn gyb" data-g="1" title="${L('魚拓（和紙に墨で刷った記念画像）', 'Gyotaku — a fish print in ink on washi paper')}">${L('魚拓', 'Fish print')}<kbd>G</kbd></button>
        </div>
      </div>`);
    el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => this.onCatchChoice && this.onCatchChoice(b.dataset.c)));
    el.querySelector('[data-g]').addEventListener('click', () => this.requestGyotaku());
    this._catchInfo = info;
    this.hud.append(el);
    this.catchEl = el;
    this.setHint('');
  }

  // ---- 魚拓 ----
  requestGyotaku() {
    if (this._catchInfo && this.catchEl && this.handlers.onGyotaku) this.handlers.onGyotaku(this._catchInfo);
  }
  openGyotaku(cv, info) {
    const sp = info.sp;
    const canShare = !!(navigator.canShare && navigator.share);
    const url = cv.toDataURL('image/jpeg', 0.92);
    const el = h(`
      <div class="modal" data-k="gyotaku">
        <div class="box panel gy">
          <button class="close">×</button>
          <h2>${L('魚拓', 'Fish print (gyotaku)')}</h2>
          <div class="sub">${sp.name}　${info.cm.toFixed(1)} cm</div>
          <img class="gyimg" src="${url}" alt="${L(`${sp.name}の魚拓`, `Gyotaku print of a ${sp.name}`)}">
          <div class="acts">
            <button class="btn primary" id="gySave">${L('画像を保存', 'Save image')}</button>
            ${canShare ? `<button class="btn" id="gyShare">${L('共有する', 'Share')}</button>` : ''}
          </div>
        </div>
      </div>`);
    const name = `hidamari-gyotaku-${sp.id}-${info.cm.toFixed(1)}cm.jpg`;
    const toFile = () => new Promise((res) => cv.toBlob((b) => res(b ? new File([b], name, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92));
    el.querySelector('#gySave').addEventListener('click', async () => {
      const r = await saveCanvas(cv, name, 'image/jpeg', 0.92);
      if (r === 'saved') this.toast(L('魚拓を保存しました', 'Gyotaku saved'), 'info', 1500);
      else if (r === 'failed') this.toast(L('魚拓を保存できませんでした', 'Could not save the gyotaku'), 'warn', 2200);
    });
    const sh = el.querySelector('#gyShare');
    if (sh) sh.addEventListener('click', async () => {
      const f = await toFile(); if (!f) return;
      try {
        if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: L(`${PLACE.title}の魚拓`, `Gyotaku from ${PLACE.title}`), text: L(`${sp.name} ${info.cm.toFixed(1)} cm を釣りました（${PLACE.title}）`, `I caught a ${info.cm.toFixed(1)} cm ${sp.name} (${PLACE.title})`) });
      } catch (e) { /* 共有をやめたとき */ }
    });
    this._openModal(el);
    el.dataset.k = 'gyotaku';
  }

  // 魚を手にのせて見せている間は、手前の操作パネルを引っこめる
  setShowing(on) { this.hud.classList.toggle('showing', !!on); }
  // ヒット中: メーター・ヒント・ボタンだけを残して、ほかの表示を消す
  setFighting(on) { this.hud.classList.toggle('fighting', !!on); }

  // ---------------------------------------------------------------- 写真の構図
  openFraming(list, screenAsp) {
    this.closeFraming();
    this.framing = true;
    document.body.classList.add('framing');
    const ico = (a) => { const r = a || screenAsp; const w = r >= 1 ? 22 : 22 * r, hh = r >= 1 ? 22 / r : 22; return `<span class="ico" style="width:${w.toFixed(1)}px;height:${hh.toFixed(1)}px"></span>`; };
    const el = h(`
      <div id="frm">
        <div class="frm-box"><i class="g v1"></i><i class="g v2"></i><i class="g h1"></i><i class="g h2"></i><span class="frm-px"></span><div class="frm-flash"></div></div>
        <div class="frm-bar panel">
          <div class="frm-asp" role="radiogroup" aria-label="${L('写真の形', 'Photo shape')}">${list.map((p) => `<button class="frm-a" role="radio" data-k="${p.k}" title="${p.title}">${ico(p.a)}<b>${p.name}</b></button>`).join('')}</div>
          <div class="frm-act">
            <button class="btn small" data-a="close" title="${L('写真をやめる (Esc)', 'Stop taking photos (Esc)')}">${L('おわる', 'Done')}<kbd>Esc</kbd></button>
            <button class="frm-shut" data-a="shoot" title="${L('撮る (P / Enter)', 'Shoot (P / Enter)')}" aria-label="${L('撮る', 'Shoot')}"><i></i></button>
            <span class="frm-tip">${L('枠の中が写真になります。ドラッグで向きを変えられます', 'The frame is your photo. Drag to change the view')}</span>
          </div>
        </div>
      </div>`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k],[data-a]');
      if (!b) return;
      const H = this.handlers;
      if (b.dataset.k) H.onFrameAspect && H.onFrameAspect(b.dataset.k);
      else if (b.dataset.a === 'shoot') H.onShoot && H.onShoot();
      else if (b.dataset.a === 'close') H.onFrameClose && H.onFrameClose();
    });
    this.root.append(el);
    this.frameEl = el;
  }
  frameBarH() { const b = this.frameEl && this.frameEl.querySelector('.frm-bar'); return b ? b.offsetHeight + 10 : 0; }
  layoutFrame(r, info, key) {
    const el = this.frameEl;
    if (!el) return;
    const box = el.querySelector('.frm-box');
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    el.querySelector('.frm-px').textContent = info || '';
    for (const b of el.querySelectorAll('.frm-a')) { const on = b.dataset.k === key; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
  }
  frameFlash() {
    const f = this.frameEl && this.frameEl.querySelector('.frm-flash');
    if (!f) return;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  closeFraming() {
    if (this.frameEl) { this.frameEl.remove(); this.frameEl = null; }
    this.framing = false;
    document.body.classList.remove('framing');
  }

  // ---------------------------------------------------------------- 水槽（ひだまり浜の鑑賞モード）
  fade(fn) {
    let f = this._fadeEl;
    if (!f) { f = this._fadeEl = h('<div id="fade"></div>'); this.root.append(f); }
    f.classList.add('on');
    setTimeout(() => { try { fn(); } finally { setTimeout(() => f.classList.remove('on'), 60); } }, 380);
  }
  openTank(st) {
    this.closeTank();
    this.hud.classList.add('aqmode');
    const el = h(`
      <div id="aq">
        <div class="aq-list panel"></div>
        <div class="aq-bar">
          <button class="btn small" data-a="view" title="${L('見る位置を変える', 'Change the viewpoint')}">${L('視点', 'View')} <b class="aq-vn"></b></button>
          <button class="btn small" data-a="stand" title="${L('水槽台の上／砂の上に直置き', 'On a stand / straight on the sand')}">${L('置き方', 'Setting')} <b class="aq-st"></b></button>
          <button class="btn small" data-a="photo" title="${L('写真の形を選んで、高画質で撮る (P)', 'Choose a shape and take a high-quality photo (P)')}">${L('写真をとる', 'Photo')}<kbd>P</kbd></button>
          <button class="btn small" data-a="hide" title="${L('表示を消して、水槽だけを見る (H)', 'Hide the interface and just watch (H)')}">${L('表示を消す', 'Hide UI')}<kbd>H</kbd></button>
          <button class="btn small" data-a="settings" title="${L('時刻・天気を変える', 'Change time and weather')}">${L('時刻と天気', 'Time & weather')}</button>
          <button class="btn small primary" data-a="close" title="${L('釣りにもどる (V / Esc)', 'Back to fishing (V / Esc)')}">${L('釣りにもどる', 'Back to fishing')}<kbd>V</kbd></button>
        </div>
        <button class="aq-show panel" data-a="show">${L('表示する', 'Show UI')}</button>
        <div class="aq-help">${L('ドラッグで回る・ホイール（ピンチ）で寄る', 'Drag to orbit · wheel (pinch) to zoom')}</div>
      </div>`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a, H = this.handlers;
      if (a === 'view') { const n = H.onTankView && H.onTankView(); if (n) el.querySelector('.aq-vn').textContent = n; }
      else if (a === 'stand') H.onTankStand && H.onTankStand();
      else if (a === 'photo') H.onPhoto && H.onPhoto();
      else if (a === 'hide') el.classList.add('bare');
      else if (a === 'settings') this.openSettings();
      else if (a === 'show') el.classList.remove('bare');
      else if (a === 'close') H.onTank && H.onTank();
      else if (a === 'rel') H.onTankRelease && H.onTankRelease(+b.dataset.i);
      else if (a === 'add') H.onTankAdd && H.onTankAdd(+b.dataset.i);
    });
    this.root.append(el);
    this.tankEl = el;
    this.renderTank(st);
  }
  renderTank(st) {
    const el = this.tankEl;
    if (!el) return;
    el.querySelector('.aq-vn').textContent = st.view || '';
    el.querySelector('.aq-st').textContent = st.stand || '';
    const img = (id) => (this.thumbs[id] ? `<img src="${this.thumbs[id]}" alt="">` : '');
    const fish = st.fish.length
      ? st.fish.map((f) => `<li>${img(f.id)}<span class="n">${f.name}</span><span class="c">${f.cm.toFixed(1)}cm</span><button class="mini" data-a="rel" data-i="${f.i}" title="${L('海へ帰す', 'Return to the sea')}">${L('海へ帰す', 'Release')}</button></li>`).join('')
      : `<li class="empty">${L(`まだ魚がいません。釣った魚を、釣果のカードの「水槽へ」で入れられます（${st.maxCm}cm まで）。`, `No fish yet. Add a catch with “To the aquarium” on its card (up to ${st.maxCm} cm).`)}</li>`;
    const kept = st.kept.length
      ? `<div class="aq-h">${L('びくの魚', 'In your creel')}</div><ul>${st.kept.map((f) => `<li>${img(f.id)}<span class="n">${f.name}</span><span class="c">${f.cm.toFixed(1)}cm</span>${f.ok ? `<button class="mini on" data-a="add" data-i="${f.i}">${L('水槽へ', 'To the tank')}</button>` : `<small class="why">${f.why.replace(/（.*）/, '')}</small>`}</li>`).join('')}</ul>` : '';
    const cnt = `${st.big ?? st.fish.length} / ${st.cap}${L(' 匹', ' fish')}${st.small ? `　${L('小魚', 'small')} ${st.small} / ${st.smallCap}` : ''}`;
    el.querySelector('.aq-list').innerHTML = `<div class="aq-t">${L('わたしの水槽', 'My aquarium')}<span>${cnt}</span></div><ul>${fish}</ul>${kept}`;
  }
  tankBare() { if (this.tankEl) this.tankEl.classList.toggle('bare'); }
  closeTank() {
    if (this.tankEl) { this.tankEl.remove(); this.tankEl = null; }
    this.hud.classList.remove('aqmode');
  }

  hideCatch() {
    if (this.catchEl) { this.catchEl.remove(); this.catchEl = null; }
  }

  // ---------------------------------------------------------------- モーダル
  isModalOpen() { return !!this.modal; }

  closeModal() {
    if (this.modal) { this.modal.remove(); this.modal = null; this.handlers.onModal && this.handlers.onModal(false); }
  }

  _openModal(el) {
    this.closeModal();
    this.modal = el;
    this.root.append(el);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.closeModal(); });
    el.querySelector('.close').addEventListener('click', () => this.closeModal());
    this.handlers.onModal && this.handlers.onModal(true);
  }

  toggleJournal() { if (this.modal && this.modal.dataset.k === 'journal') this.closeModal(); else this.openJournal(); }
  toggleSettings() { if (this.modal && this.modal.dataset.k === 'settings') this.closeModal(); else this.openSettings(); }

  setThumbs(map) { this.thumbs = map; }

  openJournal(selectId) {
    const d = this.save.data;
    const got = this.save.speciesCaught();
    const total = SPECIES_ORDER.filter((i) => !SPECIES[i].junk && !SPECIES[i].legend).length;
    // 季節の印: ふつうの魚は、春夏秋冬のそれぞれで釣ると印がつく。4つそろうと金の枠
    const marked = SPECIES_ORDER.filter((i) => !SPECIES[i].junk && !SPECIES[i].legend && !SPECIES[i].season);
    const markOf = (c, sid) => !!(c && c.seasons && c.seasons[sid]);
    let marks = 0;
    for (const id of marked) for (const sid of SEASON_IDS) if (markOf(d.catches[id], sid)) marks++;
    const cards = SPECIES_ORDER.map((id, i) => {
      const sp = SPECIES[id];
      const c = d.catches[id];
      const known = c && c.count > 0;
      const mk = known && marked.includes(id);
      const full = mk && SEASON_IDS.every((sid) => markOf(c, sid));
      const seasonRow = mk ? `<div class="cs">${SEASON_IDS.map((sid) => `<i class="${markOf(c, sid) ? 'on' : ''}" title="${SEASON_NAMES[sid]}">${SEASON_NAMES[sid]}</i>`).join('')}</div>` : '';
      const img = this.thumbs[id] ? `<img src="${this.thumbs[id]}" alt="">` : '';
      return `
        <div class="card ${known ? '' : 'unk'}${sp.legend ? ' legend' : ''}${full ? ' full' : ''}" data-id="${id}">
          <span class="no">No.${String(i + 1).padStart(2, '0')}${sp.season ? `　${L(`${SEASON_NAMES[sp.season]}だけ`, `${SEASON_NAMES[sp.season]} only`)}` : ''}</span>
          <span class="st">${known ? stars(sp.rarity) : ''}</span>
          <div class="th" style="margin-top:14px">${img}</div>
          <div class="n">${known ? sp.name : L('？？？', '???')}</div>
          <div class="m">${known ? L(`最大 ${c.best.toFixed(1)} cm ・ ${c.count}匹`, `Best ${c.best.toFixed(1)} cm · ${c.count} caught`) : L('まだ出会っていない', 'Not met yet')}</div>
          ${seasonRow}
        </div>`;
    }).join('');
    const el = h(`
      <div class="modal" data-k="journal">
        <div class="box panel">
          <button class="close">×</button>
          <h2>${L('魚図鑑', 'Field guide')}</h2>
          <div class="sub">${PLACE.zukan}　${L(`${got} / ${total} 種　　釣った数 ${d.total} 匹　　投げた回数 ${d.casts}　　季節の印 ${marks} / ${marked.length * SEASON_IDS.length}`, `${got} / ${total} species　　${d.total} caught　　${d.casts} casts　　season marks ${marks} / ${marked.length * SEASON_IDS.length}`)}</div>
          <div class="prog"><i style="width:${(got / total) * 100}%"></i></div>
          <div class="grid">${cards}</div>
          <div class="detail" id="jdetail">${L('カードを選ぶと説明が出ます。', 'Select a card to read about it.')}</div>
        </div>
      </div>`);
    const showDetail = (id) => {
      const sp = SPECIES[id];
      const c = d.catches[id];
      const known = c && c.count > 0;
      const baits = Object.entries(sp.bait).filter(([, v]) => v >= 0.5).map(([k]) => BAITS[k].name).join(L('・', ', ')) || '—';
      $('#jdetail', el).innerHTML = known
        ? `<b style="letter-spacing:.14em;font-size:18px">${sp.name}</b>　<span style="color:var(--ink-dim);font-size:12px">${EN && sp.ruby ? `${sp.ruby}　` : ''}${sp.latin}</span><br>${sp.desc}<br><span style="color:var(--ink-dim);font-size:13px">${L(`好きなエサ: ${baits}　／　体長 ${sp.cm[0]}〜${sp.cm[1]} cm`, `Favourite bait: ${baits} / length ${sp.cm[0]}–${sp.cm[1]} cm`)}</span>${likeLine(sp, c)}`
        : `<b>${L('？？？', '???')}</b><br><span style="color:var(--ink-dim)">${sp.rumor || L('どんなエサ、どんな時間に会えるだろう。', 'Which bait, and what time of day? Who knows.')}</span>`;
    };
    el.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { this.handlers.onTick && this.handlers.onTick(); showDetail(c.dataset.id); }));
    this._openModal(el);
    el.dataset.k = 'journal';
    if (selectId) showDetail(selectId);
  }

  openSettings() {
    const H = this.handlers;
    const s = this.settings || {};
    const cur = (k, d) => (s[k] ?? d);
    const q = new URLSearchParams(location.search).get('q') || this.save.setting('quality') || this.quality || 'high';
    const el = h(`
      <div class="modal" data-k="settings">
        <div class="box panel" style="width:min(640px,94vw)">
          <button class="close">×</button>
          <h2>${L('設定', 'Settings')}</h2>
          <div class="sub">${L('お好みに合わせて', 'Make yourself at home')}</div>
          <div class="row"><div><div class="t">言語 / Language</div><div class="d">${L('変更するとページを読み込み直します', 'The page reloads when you change this')}</div></div>
            <div class="seg" id="sLang"><button data-l="ja">日本語</button><button data-l="en">English</button></div></div>
          <div class="row"><div><div class="t">${L('釣り場', 'Fishing spot')}</div><div class="d">${L(`いまは${PLACE.title}（${PLACE.geo.short}）。旅の地図から、ひだまりシリーズのほかの釣り場へ出かけられます（図鑑や記録は、釣り場ごとに別です）`, `You are at ${PLACE.title} (${PLACE.geo.short}). Use the travel map to visit the other Hidamari spots (each spot keeps its own field guide and records)`)}</div></div>
            <button class="btn small" id="sPlace">${L('旅の地図をひらく', 'Open the travel map')}</button></div>
          <div class="row"><div><div class="t">${L('季節', 'Season')}</div><div class="d">${L(`景色・降るもの・魚の食いが変わります。変更するとページを読み込み直します。「おまかせ」は今日の日付（いまは${SEASON_NAMES[seasonOfDate()]}）`, `Changes the scenery, what falls from the sky and how the fish bite. The page reloads. “Auto” follows today's date (now: ${SEASON_NAMES[seasonOfDate()]})`)}</div></div>
            <div class="seg" id="sSeason"><button data-v="auto">${L('おまかせ', 'Auto')}</button>${SEASON_IDS.map((k) => `<button data-v="${k}">${SEASON_NAMES[k]}</button>`).join('')}</div></div>
          <div class="row"><div><div class="t">${L('時刻', 'Time of day')}</div><div class="d">${L('朝・昼・夕・夜で景色も魚も変わります', 'The scenery and the fish change from morning to night')}</div></div>
            <div class="rctl">
              <input type="range" id="sTime" min="0" max="24" step="0.05" value="${cur('hour', 17.3).toFixed(2)}">
              <div class="seg" id="sTod">
                <button data-h="${(SEASON.sun.rise - 0.2).toFixed(1)}">${L('朝', 'Morning')}</button><button data-h="12">${L('昼', 'Noon')}</button><button data-h="${(SEASON.sun.set - PLACE.startBefore).toFixed(1)}">${L('夕', 'Dusk')}</button><button data-h="${(SEASON.sun.set + 3.5).toFixed(1)}">${L('夜', 'Night')}</button>
              </div>
            </div></div>
          <div class="row"><div><div class="t">${L('時間の流れ', 'Passing of time')}</div><div class="d">${L('自動で日が傾き、星が出ます', 'The sun sets and the stars come out on their own')}</div></div>
            <div class="seg" id="sSpeed"><button data-s="0">${L('止める', 'Stop')}</button><button data-s="0.006">${L('ゆっくり', 'Slow')}</button><button data-s="0.05">${L('はやい', 'Fast')}</button></div></div>
          <div class="row"><div><div class="t">${L('天気', 'Weather')}</div></div>
            <div class="seg" id="sWx"><button data-w="auto">${L('おまかせ', 'Auto')}</button><button data-w="clear">${SEASON.wxNames.clear}</button><button data-w="cloudy">${SEASON.wxNames.cloudy}</button><button data-w="rain">${SEASON.wxNames.rain}</button></div></div>
          <div class="row"><div><div class="t">${L('音量', 'Volume')}</div></div><input type="range" id="sVol" min="0" max="1" step="0.05" value="${cur('volume', 0.8)}"></div>
          <div class="row"><div><div class="t">${L('画質', 'Graphics')}</div><div class="d">${L('変更するとページを読み込み直します。重いときは、解像度や効果を自動でおさえます', 'The page reloads. If things get slow, resolution and effects are reduced automatically')}</div></div>
            <div class="seg" id="sQ"><button data-q="low">${L('軽い', 'Light')}</button><button data-q="medium">${L('ふつう', 'Normal')}</button><button data-q="high">${L('きれい', 'Fine')}</button><button data-q="ultra">${L('最高', 'Best')}</button></div></div>
          <div class="row"><div><div class="t">${L('写真', 'Photos')}</div><div class="d">${L('写真の形（横長・正方形・縦長など）を選んで、高画質で保存します（Pキー）。Hキーで画面の表示を消せます', 'Pick a shape (wide, square, tall…) and save a high-quality photo (P key). Press H to hide the interface')}</div></div><button class="btn small" id="sPhoto">${L('撮影する', 'Take a photo')}</button></div>
          <div class="row"><div><div class="t">${L('水中の魚影', 'Fish finder')}</div><div class="d">${L('右の「ウキ下」の目盛りに、近くの魚の深さを映します', 'Shows the depth of nearby fish on the depth scale at the right')}</div></div><div class="seg" id="sMarks"><button data-m="0">${L('なし', 'Off')}</button><button data-m="1">${L('あり', 'On')}</button></div></div>
          <div class="row"><div><div class="t">${L('動きをおさえる', 'Reduce motion')}</div><div class="d">${L('画面の揺れ・ヒット時の視点の動き・フラッシュを弱めます。はじめは、端末の「視差効果を減らす」設定にしたがいます', 'Softens screen shake, camera moves on a strike and flashes. Follows your device’s “reduce motion” setting at first')}</div></div><div class="seg" id="sCalm"><button data-r="0">${L('ふつう', 'Normal')}</button><button data-r="1">${L('おさえる', 'Reduced')}</button></div></div>
          <div class="row"><div><div class="t">${L('ヒット中の視点', 'Camera while fighting')}</div><div class="d">${L('魚がかかると、視点が魚のほうへ向きます。画面の動きが苦手な方は「固定」に', 'When a fish is on, the camera turns toward it. Choose “Fixed” if motion bothers you')}</div></div><div class="seg" id="sFollow"><button data-c="1">${L('追う', 'Follow')}</button><button data-c="0">${L('固定', 'Fixed')}</button></div></div>
          ${navigator.vibrate ? `<div class="row"><div><div class="t">${L('振動', 'Vibration')}</div><div class="d">${L('アタリや合わせのとき、端末がふるえます（対応する端末だけ）', 'Your device vibrates on bites and strikes (supported devices only)')}</div></div><div class="seg" id="sVib"><button data-v="0">${L('なし', 'Off')}</button><button data-v="1">${L('あり', 'On')}</button></div></div>` : ''}
          <div class="row"><div><div class="t">${L('FPS表示', 'Show FPS')}</div></div><div class="seg" id="sFps"><button data-f="0">${L('なし', 'Off')}</button><button data-f="1">${L('あり', 'On')}</button></div></div>
          ${IN_ARTIFACT ? `<div class="row"><div><div class="t">${L('新しい場所へ引っ越す', 'Move to the new address')}</div><div class="d">${L('ひだまりは、ブラウザで直接ひらける場所へ引っ越しました。押すと、この記録を持って新しいタブで開きます（claude.ai のほうの記録も、そのまま残ります）', 'Hidamari has moved to an address that opens directly in your browser. This opens it in a new tab with your records (your records here on claude.ai stay as they are)')}</div></div><a class="btn small" id="sMove" href="${PLAY_URL}" target="_blank" rel="noopener">${L('記録を持って引っ越す', 'Move with my records')}</a></div>` : ''}
          <div class="row"><div><div class="t">${L('記録の書き出し・読み込み', 'Export / import records')}</div><div class="d">${L('図鑑・釣果・お題・水槽の魚・設定を（浜と沼の両方）ファイルにまとめて保存し、ほかの端末やブラウザで読み込めます', 'Save your field guide, catches, tasks, aquarium and settings (for both spots) to a file, and load it on another device or browser')}</div></div>
            <div class="bk-b"><button class="btn small" id="sExport">${L('書き出す', 'Export')}</button><button class="btn small" id="sImport">${L('読み込む', 'Import')}</button><input type="file" id="sFile" accept=".json,application/json" hidden></div></div>
          <div class="bk" id="sBk" hidden>
            <div class="bk-msg" id="sBkMsg"></div>
            <div class="bk-b" id="sBkYes" hidden><button class="btn small primary" id="sBkGo">${L('今の記録を上書きして読み込む', 'Replace my current records')}</button><button class="btn small" id="sBkNo">${L('やめる', 'Cancel')}</button></div>
          </div>
          <details class="bk-t"><summary>${L('ファイルが使えないとき（テキストで写す）', 'If files don’t work (copy as text)')}</summary>
            <div class="d">${L('「書き出す」の中身をここに出します。ぜんぶ選んでコピーし、読み込む側では貼りつけて「この中身を読み込む」を押してください', 'This shows the exported data as text. Copy all of it, then on the other side paste it here and press “Import this text”')}</div>
            <textarea id="sText" rows="4" spellcheck="false" placeholder="${L('ここに、書き出した中身を貼りつけ', 'Paste the exported text here')}"></textarea>
            <div class="bk-b"><button class="btn small" id="sTextOut">${L('中身を出す', 'Show text')}</button><button class="btn small" id="sTextIn">${L('この中身を読み込む', 'Import this text')}</button></div>
          </details>
          <div class="credit">${PLACE.credit}</div>
        </div>
      </div>`);
    const mark = (sel, attr, val) => el.querySelectorAll(`${sel} button`).forEach((b) => b.classList.toggle('on', String(b.dataset[attr]) === String(val)));
    { const mv = el.querySelector('#sMove'); if (mv) moveLink(PLACE.id).then((u) => { mv.href = u; }).catch(() => {}); }
    mark('#sSpeed', 's', cur('timeScale', 0));
    mark('#sWx', 'w', cur('weather', 'auto'));
    mark('#sQ', 'q', q);
    mark('#sFps', 'f', cur('fps', 0));
    {
      let sv = 'auto';
      try { sv = new URLSearchParams(location.search).get('season') || this.save.setting('season') || 'auto'; } catch (e) { /* ignore */ }
      mark('#sSeason', 'v', SEASON_IDS.includes(sv) ? sv : 'auto');
      el.querySelectorAll('#sSeason button').forEach((b) => b.addEventListener('click', () => { H.onSeason && H.onSeason(b.dataset.v); }));
    }
    el.querySelector('#sPlace').addEventListener('click', () => { H.onMap && H.onMap(); });
    mark('#sLang', 'l', LANG);
    el.querySelectorAll('#sLang button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.l !== LANG) { setLang(b.dataset.l); const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.toString(); } }));
    mark('#sCalm', 'r', cur('calm', 0));
    el.querySelectorAll('#sCalm button').forEach((b) => b.addEventListener('click', () => { mark('#sCalm', 'r', b.dataset.r); H.onCalm && H.onCalm(b.dataset.r === '1'); }));
    mark('#sVib', 'v', cur('vib', 1));
    el.querySelectorAll('#sVib button').forEach((b) => b.addEventListener('click', () => { mark('#sVib', 'v', b.dataset.v); H.onVibrate && H.onVibrate(b.dataset.v === '1'); }));
    mark('#sFollow', 'c', cur('follow', 1));
    el.querySelectorAll('#sFollow button').forEach((b) => b.addEventListener('click', () => { mark('#sFollow', 'c', b.dataset.c); H.onFollow && H.onFollow(b.dataset.c === '1'); }));
    mark('#sMarks', 'm', this.showMarks ? 1 : 0);
    el.querySelectorAll('#sMarks button').forEach((b) => b.addEventListener('click', () => { mark('#sMarks', 'm', b.dataset.m); this.setMarks(b.dataset.m === '1'); }));
    el.querySelector('#sTime').addEventListener('input', (e) => { H.onTime && H.onTime(parseFloat(e.target.value)); });
    el.querySelectorAll('#sTod button').forEach((b) => b.addEventListener('click', () => { H.onTime && H.onTime(parseFloat(b.dataset.h)); el.querySelector('#sTime').value = b.dataset.h; }));
    el.querySelectorAll('#sSpeed button').forEach((b) => b.addEventListener('click', () => { mark('#sSpeed', 's', b.dataset.s); H.onTimeScale && H.onTimeScale(parseFloat(b.dataset.s)); }));
    el.querySelectorAll('#sWx button').forEach((b) => b.addEventListener('click', () => { mark('#sWx', 'w', b.dataset.w); H.onWeather && H.onWeather(b.dataset.w); }));
    el.querySelector('#sVol').addEventListener('input', (e) => H.onVolume && H.onVolume(parseFloat(e.target.value)));
    el.querySelectorAll('#sQ button').forEach((b) => b.addEventListener('click', () => { H.onQuality && H.onQuality(b.dataset.q); }));
    el.querySelector('#sPhoto').addEventListener('click', () => { this.closeModal(); setTimeout(() => H.onPhoto && H.onPhoto(), 80); });
    el.querySelectorAll('#sFps button').forEach((b) => b.addEventListener('click', () => { mark('#sFps', 'f', b.dataset.f); H.onFps && H.onFps(b.dataset.f === '1'); }));
    // ---- 記録の書き出し・読み込み
    {
      const box = el.querySelector('#sBk'), msg = el.querySelector('#sBkMsg'), yes = el.querySelector('#sBkYes');
      let pending = null;
      const show = (text, ask = false) => { box.hidden = false; msg.textContent = text; yes.hidden = !ask; };
      el.querySelector('#sExport').addEventListener('click', async () => {
        const r = await saveFile(exportName(), exportText());
        if (r === 'saved') show(L('記録を書き出しました。ほかの端末では、設定の「読み込む」でこのファイルを選んでください', 'Records exported. On the other device, choose this file with Import in Settings'));
        else if (r === 'failed') show(L('書き出せませんでした。下の「テキストで写す」をお使いください', 'Could not export. Please use “copy as text” below'));
      });
      const check = (text) => {
        const r = parseImport(text);
        if (!r.ok) { pending = null; show(r.msg); return; }
        pending = r.saves;
        show(L(`${r.when ? `${r.when} に書き出した記録です。` : ''}${r.lines.join(' ／ ')}。読み込むと、この端末の今の記録は上書きされます`, `${r.when ? `Records exported on ${r.when}. ` : ''}${r.lines.join(' / ')}. Importing replaces the records on this device`), true);
      };
      const file = el.querySelector('#sFile');
      el.querySelector('#sImport').addEventListener('click', () => { file.value = ''; file.click(); });
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) return;
        f.text().then(check, () => show(L('ファイルを読めませんでした', 'Could not read the file')));
      });
      el.querySelector('#sBkNo').addEventListener('click', () => { pending = null; box.hidden = true; });
      el.querySelector('#sBkGo').addEventListener('click', () => {
        if (!pending) return;
        if (!applyImport(pending)) { show(L('読み込めませんでした（保存先がいっぱいか、使えません）', 'Could not import (storage is full or unavailable)')); return; }
        show(L('読み込みました。ページを読み直します…', 'Imported. Reloading…'));
        setTimeout(() => location.reload(), 700);
      });
      const ta = el.querySelector('#sText');
      el.querySelector('#sTextOut').addEventListener('click', () => { ta.value = exportText(); ta.focus(); ta.select(); });
      el.querySelector('#sTextIn').addEventListener('click', () => check(ta.value));
    }
    this._openModal(el);
    el.dataset.k = 'settings';
  }
}
