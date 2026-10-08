import { L } from './i18n.js';
import './fog.js';
import * as THREE from 'three';
import { Atmosphere } from './atmosphere.js';
import { initMaterials, G } from './materials.js';
import { buildWorld, buildLife } from './world.js';
import { PostFX } from './postfx.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { Rod, FishingLine, Bobber, makeAimRing } from './rod.js';
import { SkyEvents } from './skyevents.js';
import { SEASON } from './season.js';
import { PLACE } from './place.js';
import { EnvProbe } from './env.js';
import { FishSim } from './fishsim.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Save } from './save.js';
import { Daily } from './daily.js';
import { makeThumbs, renderFishCanvas } from './thumbs.js';
import { makeGyotaku } from './gyotaku.js';
import { prepareDownloads, saveCanvas } from './download.js';
import { FISH_TEXTURE_IDS, prebakeFish, advanceWig } from './fishmodels.js';
import { SPECIES, SPECIES_ORDER, BAITS, inSeason } from './species.js';
import { clamp, damp, widenFov } from './util.js';
import { worldMap, localHour, writeSummary } from './worldmap.js';

const params = new URLSearchParams(location.search);
document.title = `${PLACE.title} — ${PLACE.sub}`;
{ const m = document.querySelector('meta[name=description]'); if (m) m.setAttribute('content', PLACE.desc); }
document.body.classList.add(`place-${PLACE.id}`);
{
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    worldMap.abort();
    document.getElementById('ui').innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;line-height:2;font-size:18px;letter-spacing:.1em;background:#0d1410;color:#f6eed9">${L('このゲームは WebGL2 を使います。<br>最近の Chrome / Edge / Firefox / Safari で開いてください。', 'This game needs WebGL2.<br>Please open it in a recent Chrome, Edge, Firefox or Safari.')}</div>`;
    throw new Error('WebGL2 is not available');
  }
}
const save = Save;
save.load();
prepareDownloads();   // claude.ai の中では、保存は枠の外の「ファイルを保存」機能を使う

// ---------------------------------------------------------------- 画質設定
const isTouch = matchMedia('(pointer: coarse)').matches;
// スマホも最初は「きれい」。重いときは、実行中に解像度と効果を自動でおさえる（下の自動調整）
const quality = params.get('q') || save.setting('quality') || 'high';
const QUALITY = {
  low: { cap: 1, scale: 0.75, shadow: 1024, refl: 0.35, samples: 0, bloom: false, god: false, density: 0.35 },
  medium: { cap: 1.5, scale: 1, shadow: 2048, refl: 0.45, samples: 2, bloom: true, god: true, density: 0.65 },
  high: { cap: 2, scale: 1, shadow: 2048, refl: 0.6, samples: 4, bloom: true, god: true, density: 1 },
  ultra: { cap: 2, scale: 1.25, shadow: 4096, refl: 0.75, samples: 4, bloom: true, god: true, density: 1.3 },
};
const Q = { ...(QUALITY[quality] || QUALITY.high) };
// スマホは画素数が多い（DPR 2〜3）ので、MSAA は2倍まで。画面の総画素数にも上限をつける（タブレット対策）
if (isTouch) Q.samples = Math.min(Q.samples, 2);
const MAX_PIXELS = isTouch ? 2.6e6 : Infinity;
const dpr = Math.min(window.devicePixelRatio || 1, Q.cap);
let pixelRatio = dpr * Q.scale;
const minPR = 0.5;
const floorPR = isTouch ? 0.85 : minPR; // 解像度の下げ止まり（これ以下にする前に、光芒・ブルームを切る）

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 4000);
camera.rotation.order = 'YXZ';

const ui = new UI(document.getElementById('ui'), camera, save);
ui.quality = quality;
// 旅の地図: 読み込みの進みを、到着の飛行機の進みにする
{
  const setLoading = ui.setLoading.bind(ui);
  ui.setLoading = (p, text) => { setLoading(p, text); worldMap.loading(p, text); };
}
// 読み込みの区切りごとに、少し待つ。旅の到着中は、地図の絵が1枚は描かれるまで待つ（飛行機がとまって見えないように）
const tick = () => new Promise((r) => {
  if (!worldMap.arriving) { setTimeout(r, 16); return; }
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 120);
});
async function step(p, text, fn) {
  ui.setLoading(p, text);
  await tick();
  const t0 = performance.now();
  const r = fn ? fn() : undefined;
  if (params.get('debug')) console.log(text, Math.round(performance.now() - t0), 'ms');
  return r;
}

async function main() {
  let needResize = false;
  let rsW = 0, rsH = 0, rsPR = 0;
  let framing = null;   // 写真の構図を決めているとき { key, asp, k }
  initMaterials();
  const atm = new Atmosphere(scene);
  atm.hour = parseFloat(params.get('hour') ?? save.setting('hour') ?? (SEASON.sun.set - PLACE.startBefore));   // はじめは夕方（日の入りの少しまえ）
  // 旅の地図で着いたときは、現地のいまの時刻から
  if (worldMap.arriving) atm.hour = localHour(PLACE.geo.tz);
  // 天気: 'auto'(おまかせ。晴れ・くもり・雨がしぜんに移り変わる) か、固定
  const wx0 = params.get('w') || save.setting('weather') || 'auto';
  atm.setWeather(wx0 === 'auto' ? 'clear' : wx0);
  atm.overcast = atm.targetOvercast; atm.rain = atm.targetRain;
  atm.timeScale = parseFloat(params.get('ts') ?? save.setting('timeScale') ?? 0.006);
  const env = new EnvProbe(renderer, atm, { size: 128, interval: isTouch ? 40 : 15 });
  env.update(0, true);
  // スマホではGPUメモリ不足などで描画コンテキストが失われることがある。戻ったときに環境マップと影を作り直す。
  let ctxLost = 0;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctxLost++; console.warn('WebGL context lost'); });
  canvas.addEventListener('webglcontextrestored', () => {
    console.warn('WebGL context restored');
    env.update(0, true);
    renderer.shadowMap.needsUpdate = true;
    needResize = true;
  });
  // 影
  const sun = atm.sun;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 10; sc.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.07;
  sun.target.position.set(0, 0, -6);

  let post;
  const W = await buildWorld({ scene, renderer, atm, Q, step, save });
  const { water, props, grassGroup } = W;

  let fx, sim, thumbs, sky;
  const audio = new Audio();
  audio.volume = save.setting('volume') ?? 0.8;
  let game = null;
  // その場所にいる魚の体の絵だけを、先に描いておく
  const texIds = [...new Set(SPECIES_ORDER.map((id) => SPECIES[id].model || id))].filter((id) => FISH_TEXTURE_IDS.includes(id));
  for (let i = 0; i < texIds.length; i++) {
    await step(0.64 + (0.06 * i) / texIds.length, L('魚のうろこを描いています…', 'Painting fish scales…'), () => prebakeFish(texIds[i]));
  }
  await step(0.7, L('魚たちを呼んでいます…', 'Calling the fish…'), () => {
    fx = new FX(scene, atm, water, { quality });
    W.setupFX(fx);
    sim = new FishSim(scene, {
      ripple: (x, z, a) => water.addRipple(x, z, a),
      splash: (x, z, p) => { fx.splash(x, z, p); audio.splash(p, game ? game.pan(x, z) : 0); },
      onNibble: (f, last) => game && game.onNibble(f, last),
      onBite: (f) => game && game.onBite(f),
      onSpit: (f) => game && game.onSpit(f),
      onNushi: (f) => {
        // 沼のぬしが寄ってきた合図: 水面がざわつき、重い水音がする
        ui.toast(PLACE.nushiToast, 'big', 3400);
        water.addRipple(f.x, f.z, 0.7);
        audio.thrash(game ? game.pan(f.x, f.z) : 0);
      },
    });
    if (W.setupSim) W.setupSim(sim);
    sim.populate();
    // 映り込みには、細かく動くものを入れない（トンボ・鳥・落ち葉・雨・粒子は、低解像度の映り込みでちらつく）
    const hi = quality === 'high' || quality === 'ultra';
    for (const c of fx.group.children) water.hideInReflection.push(c);
    // 草・ススキは、低〜ふつうの画質では映り込みから外す
    if (!hi && grassGroup) water.hideInReflection.push(grassGroup);
    // 葉のカードは、輪郭のすき間（暗い点・明るい点）が映り込みの低い解像度でちらつくので、最高画質以外は映り込みから外す
    if (quality !== 'ultra') scene.traverse((o) => { if (o.userData && o.userData.cards) water.hideInReflection.push(o); });
  });
  await step(0.84, L('図鑑をととのえています…', 'Tidying the field guide…'), () => {
    thumbs = makeThumbs(renderer);
    ui.setThumbs(thumbs);
  });

  const rods = { reel: new Rod(scene, 'reel'), hera: new Rod(scene, 'hera') };
  const rod = rods.reel;
  const line = new FishingLine(scene);
  const bobber = new Bobber(scene);
  const ring = makeAimRing(scene);
  const player = new Player(camera, canvas);
  player.enabled = false;

  await step(0.92, L('光をあつめています…', 'Gathering the light…'), () => {
    post = new PostFX(renderer, scene, camera, { bloom: Q.bloom, godrays: Q.god, samples: Q.samples });
    if (W.setupPost) W.setupPost(post);
    resize();
    renderer.compile(scene, camera);
  });
  ui.setLoading(1, '');

  // ---------------------------------------------------------------- リサイズ
  function resize() {
    // 大きさが変わっていないのにレンダーターゲットを作り直さない（スマホはツールバーの出入りでresizeが頻発する）
    const pr = Math.min(pixelRatio, Math.sqrt(MAX_PIXELS / Math.max(1, innerWidth * innerHeight)));
    if (innerWidth === rsW && innerHeight === rsH && pr === rsPR) return;
    rsW = innerWidth; rsH = innerHeight; rsPR = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
    const bw = renderer.domElement.width, bh = renderer.domElement.height;
    water.setSize(bw, bh, innerWidth, innerHeight);
    line.mat.uniforms.uRes.value.set(bw, bh);
    if (fx) fx._renderH = bh;
    if (sky) sky._renderH = bh;
    if (framing) layoutFrame();
  }
  // リサイズは必ずフレームの先頭（描画の前）で行う。描画のあとにキャンバスの大きさを変えると、
  // 描いた絵が消えて一瞬真っ黒なフレームが出る。
  addEventListener('resize', () => { needResize = true; });
  addEventListener('orientationchange', () => { needResize = true; });

  // ---------------------------------------------------------------- ゲーム
  // ---- 天気のおまかせモード ----
  const WX_NEXT = {
    clear: [['clear', 0.35], ['cloudy', 0.55], ['rain', 0.1]],
    cloudy: [['clear', 0.35], ['cloudy', 0.15], ['rain', 0.5]],
    rain: [['cloudy', 0.7], ['clear', 0.1], ['rain', 0.2]],
  };
  const WX_DUR = { clear: [240, 480], cloudy: [180, 360], rain: [150, 300] }; // 秒
  const WX_MSG = {
    'clear>cloudy': L('空が曇ってきた', 'Clouds are rolling in'), 'cloudy>rain': L('ぽつぽつと雨が降りだした', 'It is starting to rain'), 'clear>rain': L('急に雨が降りだした', 'A sudden shower'),
    'rain>cloudy': L('雨が小降りになってきた', 'The rain is easing off'), 'cloudy>clear': L('雲が切れて、日がさしてきた', 'The clouds part and the sun comes out'), 'rain>clear': L('雨があがった。空が明るくなっていく', 'The rain has stopped. The sky is brightening'),
  };
  const wxNow = () => (atm.rain > 0.5 ? 'rain' : atm.overcast > 0.35 ? 'cloudy' : 'clear');
  const wxRand = (a, b) => a + Math.random() * (b - a);
  let wxMode = wx0;
  let wxCur = wx0 === 'auto' ? 'clear' : wx0;
  let wxT = wxRand(...WX_DUR.clear);
  const pickWeather = (cur) => {
    let r = Math.random();
    for (const [k, p] of WX_NEXT[cur]) { if ((r -= p) <= 0) return k; }
    return cur;
  };
  // 天気が変わったとき、その天気で動きだす魚をヒントにする（釣ったことのある魚だけ名前を出す）
  const weatherHint = (to) => {
    const known = SPECIES_ORDER.filter((id) => !SPECIES[id].junk && inSeason(SPECIES[id]) && save.data.catches[id] && save.data.catches[id].count > 0 && SPECIES[id].wx[to] >= 1.4);
    const shallow = to === 'rain' ? L('　魚が浅いタナに浮いてきそう', '. Fish may rise to the shallows') : '';
    if (known.length) return L(`　${known.map((id) => SPECIES[id].name).join('・')}が動きだしそう${shallow}`, `. ${known.map((id) => SPECIES[id].name).join(', ')} may start to move${shallow}`);
    return to === 'rain' ? L('　こんな日は、ふだん会えない魚が顔を出すかも。浅いタナにも浮いてきそう', '. On days like this, rare fish may show up, even in the shallows') : '';
  };
  let started = false;
  let hudHidden = false;
  let shootReq = false;
  let showFps = !!save.setting('fps') || !!params.get('fps');
  let muted = false;
  const daily = new Daily(save);
  ui.daily = daily;
  ui.setQuest();
  game = new Game({ scene, camera, player, atm, water, fx, audio, sim, rods, line, bobber, ring, ui, save, post, daily });
  // 住人たち（サギ・猫・ボート・おじいさん…）は、場所ごと
  const life = buildLife({ scene, camera, water, fx, audio, ui, save, getGame: () => game });
  life.attach(game);
  // 空の出来事（流れ星・虹・花火・遠雷）
  sky = new SkyEvents(scene, atm, {
    onWish: () => { ui.toast(L('ながれぼし… ねがいごとをした（釣れそうな気がする）', 'A shooting star… you made a wish (feeling lucky)'), 'info', 3600); audio.wish(); game.wishLuck(90); },
    onRainbow: () => ui.toast(PLACE.rainbowToast, 'info', 4200),
    onFireworks: () => ui.toast(L('遠くで、花火が上がっている', 'Fireworks in the distance'), 'info', 4200),
    onLaunch: (d, pan) => audio.fwLaunch(d, pan),
    onBoom: (delay, size, pan) => audio.boom(delay, size, pan),
    onThunder: (delay, s, pan) => audio.thunder(delay, s, pan),
    onThunderHint: () => ui.toast(PLACE.thunderToast, 'info', 4200),
  }, { quality });
  sky._renderH = renderer.domElement.height;
  function toggleMute() {
    muted = !muted;
    if (audio.master) audio.master.gain.setTargetAtTime(muted ? 0 : audio.volume, audio.ctx.currentTime, 0.05);
    ui.setSoundIcon(!muted);
  }
  ui.handlers = {
    onBait: (id) => game.setBait(id),
    onRod: (id) => game.setRod(id),
    onAction: (down) => player.setHold(down),
    onMarker: () => game && game.toggleBobberZoom(),
    onDepth: (m) => game && game.setTackle(m, true),
    onDepthStep: (d) => game && game.nudgeTackle(d),
    onMute: () => toggleMute(),
    onModal: (open) => { player.enabled = !open && started && !(AQ && AQ.active); },
    onTick: () => audio.uiTick(),
    onTime: (h) => { atm.hour = h; save.setting('hour', h); },
    onTimeScale: (s) => { atm.timeScale = s; save.setting('timeScale', s); },
    onWeather: (w) => {
      save.setting('weather', w);
      wxMode = w;
      if (w === 'auto') { wxCur = wxNow(); wxT = wxRand(60, 150); } // いまの天気から、しばらくして移り変わりはじめる
      else { atm.setWeather(w); wxCur = w; }
    },
    onVolume: (v) => { audio.setVolume(v); save.setting('volume', v); },
    onQuality: (q) => { save.setting('quality', q); const u = new URL(location.href); u.searchParams.set('q', q); location.href = u.toString(); },
    onFps: (on) => { showFps = on; ui.el.fps.classList.toggle('hidden', !on); save.setting('fps', on ? 1 : 0); },
    onGyotaku: async (info) => {
      if (ui.gyBusy) return;
      ui.gyBusy = true;
      ui.toast(L('魚拓をすっています…', 'Making the fish print…'), 'info', 1500);
      await new Promise((r) => setTimeout(r, 40));
      try {
        const fc = renderFishCanvas(renderer, info.sp, 1600, 1000);
        const cv = await makeGyotaku(fc, { sp: info.sp, cm: info.cm, depth: info.depth ?? null, bait: (BAITS[info.bait] && BAITS[info.bait].name) || '' });
        ui.openGyotaku(cv, info);
      } catch (e) { console.warn('gyotaku', e); ui.toast(L('魚拓がうまくとれませんでした', 'Could not make the fish print'), 'warn', 2200); }
      ui.gyBusy = false;
    },
    onSeason: (v) => {
      save.setting('season', v);
      const u = new URL(location.href);
      if (v === 'auto') u.searchParams.delete('season'); else u.searchParams.set('season', v);
      location.href = u.toString();
    },
    onMap: () => openMap(),
    onCalm: (on) => applyCalm(on),
    onCat: () => game.feedCat(),
    onTalk: () => game.talkNeighbor(),
    onBoatMenu: () => game.openBoatMenu(),
    onBoat: (id) => game.goBoat(id),
    onFollow: (on) => { player.followOn = on; save.setting('follow', on ? 1 : 0); },
    onVibrate: (on) => { game.vibOn = on; save.setting('vibrate', on ? 1 : 0); if (on) game.vibrate(40); },
    onPhoto: () => openFraming(),
    onFrameAspect: (k) => setFrameAspect(k),
    onShoot: () => { shootReq = true; },
    onFrameClose: () => closeFraming(),
    onTank: () => toggleTank(),
    onTankView: () => AQ && AQ.nextView(),
    onTankStand: () => AQ && ui.fade(() => AQ.toggleStand()),
    onTankRelease: (i) => AQ && AQ.release(i),
    onTankAdd: (i) => AQ && AQ.fromCreel(i),
  };
  // ---- 水槽（ひだまり浜の鑑賞モード）
  const AQ = W.aquarium || null;
  function toggleTank() {
    if (!AQ || !started) return;
    closeFraming();
    if (AQ.active) { ui.fade(() => AQ.exit()); return; }
    if (!game.isIdle()) { ui.toast(L('ウキをあげてから、水槽を見に行こう', 'Reel in first, then visit the aquarium'), 'info', 2200); return; }
    if (ui.isModalOpen()) ui.closeModal();
    ui.fade(() => AQ.enter());
  }
  if (AQ) {
    game.tank = AQ;
    ui.tankCheck = (sp, cm) => AQ.canAdd(sp, cm);
    AQ.attach({ camera, player, ui, game, canvas, hide: [rods.reel.group, rods.hera.group, line.mesh, bobber.group, ring] });
  }
  player.followOn = save.setting('follow') !== 0;
  game.vibOn = save.setting('vibrate') !== 0;
  // 動きをおさえる: 保存した設定があればそれ、なければ端末の「視差効果を減らす」にしたがう
  const prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const calm0 = save.setting('calm');
  let calmOn = calm0 == null ? prefersReduced : !!calm0;
  function applyCalm(on, persist = true) {
    calmOn = !!on; player.reduce = calmOn; document.body.classList.toggle('calm', calmOn);
    worldMap.calm = calmOn;
    if (persist) save.setting('calm', calmOn ? 1 : 0);
  }
  applyCalm(calmOn, false);
  ui.settings = { hour: atm.hour, timeScale: atm.timeScale, weather: wx0, volume: audio.volume, fps: save.setting('fps') || 0, follow: player.followOn ? 1 : 0, calm: calmOn ? 1 : 0, vib: game.vibOn ? 1 : 0 };
  ui.el.fps.classList.toggle('hidden', !showFps);
  ui.setKept(0);
  ui.setBait(game.bait);

  player.on('key', (e) => {
    if (worldMap.isOpen) return;   // 地図が出ているあいだは、地図の操作だけ
    if (!started) return;
    // 写真の構図を決めているあいだは、撮る・やめるだけ
    if (framing) {
      if (e.code === 'Escape') closeFraming();
      else if (e.code === 'KeyP' || e.code === 'Enter' || e.code === 'NumpadEnter') { shootReq = true; e.preventDefault(); }
      return;
    }
    if (e.code === 'Escape') { if (ui.isModalOpen()) ui.closeModal(); else if (AQ && AQ.active) toggleTank(); else ui.openSettings(); }
    else if (e.code === 'KeyV' && AQ && !e.tankDone && (AQ.active || game.isIdle())) toggleTank();
    else if (e.code === 'KeyJ') ui.toggleJournal();
    else if (e.code === 'KeyO') ui.toggleDaily();
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'KeyH') { if (AQ && AQ.active) ui.tankBare(); else { hudHidden = !hudHidden; ui.hud.classList.toggle('off', hudHidden); } }
    else if (e.code === 'KeyP') openFraming();
    else if (e.code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') player.zoomBy(-1);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') player.zoomBy(1);
  });

  ui.ready(async () => {
    started = true;
    player.enabled = !worldMap.isOpen;
    player.fov = 80; // ゆっくり寄っていく導入
    try { await audio.init(); audio.setVolume(audio.volume); audio.uiConfirm(); } catch (e) { console.warn('audio', e); }
    ui.setHint(game.hintFor());
    setTimeout(() => ui.toast(L('のんびり、いきましょう', 'Take it easy'), 'info', 3200), 800);
  });

  // ---------------------------------------------------------------- 旅の地図
  // 釣り場ごとのまとめ（地図のカードで、ほかの釣り場から見る）
  const summary = () => ({
    got: save.speciesCaught(),
    total: SPECIES_ORDER.filter((i) => !SPECIES[i].junk && !SPECIES[i].legend).length,
    nushi: !!(save.data.catches.nushi && save.data.catches.nushi.count > 0),
    last: Date.now(),
  });
  writeSummary(summary());
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeSummary(summary()); });
  const duck = (on) => { if (audio.master && !muted) audio.master.gain.setTargetAtTime(on ? audio.volume * 0.3 : audio.volume, audio.ctx.currentTime, 0.25); };
  function openMap() {
    if (worldMap.isOpen) return;
    closeFraming();
    if (ui.isModalOpen()) ui.closeModal();
    player.setHold(false);
    player.enabled = false;
    worldMap.open();
  }
  Object.assign(worldMap.hooks, {
    summary,
    kept: () => game.keptList.length,
    onOpen: () => duck(true),
    onClose: () => { player.enabled = started && !(AQ && AQ.active) && !ui.isModalOpen(); duck(false); },
    // 出発: 記録を保存して、次の釣り場のページへ（季節・時刻の指定は持っていかない）
    onTravel: (id) => {
      writeSummary(summary());
      save.save();
      try { localStorage.setItem('hidamari-place', id); } catch (e) { /* ignore */ }
      const u = new URL(location.href);
      u.searchParams.set('place', id); u.searchParams.set('from', PLACE.id);
      u.searchParams.delete('season'); u.searchParams.delete('hour');
      location.assign(u.toString());
    },
    // 到着: 景色が開くときは、タイトルの文字を出さない（「はじめる」で、そのまま釣りへ）
    onReveal: () => ui.title.classList.add('veil'),
    onStart: () => { atm.hour = localHour(PLACE.geo.tz); ui.settings.hour = atm.hour; ui.el.start.click(); },
  });
  worldMap.loaded();

  // ---------------------------------------------------------------- 写真
  // 「写真をとる」で構図を決める画面へ。写真の形（画面のまま・16:9・3:2・1:1・4:5・9:16）を選ぶと、
  // 画面にその形の枠が出て、枠の中がそのまま写真になる（枠の外は、まわりが少し広く見える）。
  // 撮るときは、画面の解像度とは別に、写真の大きさで描き直してから保存する（スマホで画面の解像度を下げていても、写真はきれい）。
  const PHOTO_ASPECTS = [
    { k: 'screen', name: L('画面', 'Screen'), a: 0, title: L('いまの画面の形', 'Same shape as the screen') },
    { k: 'wide', name: '16:9', a: 16 / 9, title: L('横長（パソコン・テレビの形）', 'Wide (computer / TV)') },
    { k: 'photo', name: '3:2', a: 3 / 2, title: L('横（写真の形）', 'Landscape (photo)') },
    { k: 'square', name: '1:1', a: 1, title: L('正方形', 'Square') },
    { k: 'insta', name: '4:5', a: 4 / 5, title: L('少し縦長', 'Slightly tall') },
    { k: 'story', name: '9:16', a: 9 / 16, title: L('縦長（スマホの画面の形）', 'Tall (phone screen)') },
  ];
  let shooting = false;
  const photoKey = () => (AQ && AQ.active ? 'photoAspTank' : 'photoAsp');
  function openFraming() {
    if (!started || framing) return;
    if (ui.isModalOpen()) ui.closeModal();
    const saved = save.setting(photoKey());
    // 水槽は横に長いので、はじめは横長の写真に
    const key = PHOTO_ASPECTS.some((p) => p.k === saved) ? saved : AQ && AQ.active ? 'wide' : 'screen';
    framing = { key, asp: 1, k: 1 };
    player.lookOnly = true;
    ui.openFraming(PHOTO_ASPECTS, innerWidth / innerHeight);
    layoutFrame();
  }
  function closeFraming() {
    if (!framing) return;
    framing = null;
    player.lookOnly = false;
    player.frame = null;
    if (AQ) AQ.photoFit = null;
    ui.closeFraming();
  }
  function setFrameAspect(key) {
    if (!framing) return;
    framing.key = key;
    save.setting(photoKey(), key);
    layoutFrame();
  }
  // 枠は画面のまん中に（下の操作の帯にかからない大きさで）。枠の中＝写真のカメラ
  function layoutFrame() {
    if (!framing) return;
    const W0 = innerWidth, H0 = innerHeight;
    const p = PHOTO_ASPECTS.find((q) => q.k === framing.key) || PHOTO_ASPECTS[0];
    const asp = p.a || W0 / H0;
    const my = Math.max(14, ui.frameBarH() + 10), mx = 14;
    const aw = Math.max(60, W0 - 2 * mx), ah = Math.max(60, H0 - 2 * my);
    let w = aw, h = aw / asp;
    if (h > ah) { h = ah; w = ah * asp; }
    framing.asp = asp;
    framing.k = H0 / h;
    const fit = { asp, k: framing.k };
    player.frame = fit;
    if (AQ) AQ.photoFit = AQ.active ? fit : null;
    const [pw, ph] = photoSize(asp);
    ui.layoutFrame({ x: (W0 - w) / 2, y: (H0 - h) / 2, w, h }, `${pw} × ${ph}`, framing.key);
  }
  // 写真の大きさ: パソコンは 4K（3840×2160 と同じ画素数）、スマホは 2560×1440 と同じ画素数。画面のほうが大きければ画面に合わせる
  let glLim = 0;
  function photoSize(asp) {
    if (!glLim) {
      const gl = renderer.getContext();
      const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096, 4096];
      glLim = Math.min(4096, renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, vp[0], vp[1]);
    }
    const budget = quality === 'low' ? 1920 * 1080 : isTouch ? 2560 * 1440 : 3840 * 2160;
    const px = Math.max(budget, Math.min(renderer.domElement.width * renderer.domElement.height, 1.6e7));
    let w = Math.sqrt(px * asp), h = w / asp;
    const s = Math.min(1, glLim / Math.max(w, h));
    return [Math.round((w * s) / 2) * 2, Math.round((h * s) / 2) * 2];
  }
  // 写真の大きさで描き直して、別の画像（canvas）に写しとる。終わったら、すぐに画面の大きさで描きもどす
  function renderPhoto() {
    const fr = framing;
    const [w, h] = photoSize(fr.asp);
    const fovS = camera.fov, fovP = widenFov(fovS, 1 / fr.k);
    const bh = renderer.domElement.height;
    // 点で描くもの（しぶき・花火・水槽の粒）の大きさと、釣り糸の太さも、写真の大きさに合わせる
    const r = (h / Math.tan((fovP * Math.PI) / 360)) / (bh / Math.tan((fovS * Math.PI) / 360));
    const scaled = [];
    scene.traverse((o) => {
      const u = o.material && o.material.uniforms;
      if (!u) return;
      for (const nm of ['uScale', 'uPx']) if (u[nm] && typeof u[nm].value === 'number' && !scaled.some((q) => q[0] === u[nm])) { scaled.push([u[nm], u[nm].value]); u[nm].value *= r; }
    });
    const lw = line.mat.uniforms.uWidth.value;
    const keep = { asp: camera.aspect, bloom: post.bloom.enabled, god: post.godray.enabled };
    let out = null;
    try {
      // 自動調整で切った効果も、写真では入れる
      post.setBloom(Q.bloom); post.setGodrays(Q.god);
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      water.setSize(w, h, w, h);
      line.mat.uniforms.uRes.value.set(w, h);
      line.mat.uniforms.uWidth.value = (lw * h) / bh;
      camera.aspect = w / h; camera.fov = fovP;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
      water.renderReflection(scene, camera);
      if (AQ) AQ.renderMirror(renderer, scene, camera);
      post.update(atm, time);
      post.render(1 / 60);
      out = document.createElement('canvas');
      out.width = w; out.height = h;
      out.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    } catch (e) { console.warn('photo', e); out = null; }
    for (const [u, v] of scaled) u.value = v;
    line.mat.uniforms.uWidth.value = lw;
    post.setBloom(keep.bloom); post.setGodrays(keep.god);
    camera.aspect = keep.asp; camera.fov = fovS; camera.updateProjectionMatrix();
    rsW = -1; resize();
    water.renderReflection(scene, camera);
    if (AQ) AQ.renderMirror(renderer, scene, camera);
    post.update(atm, time);
    post.render(0);
    return out;
  }
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  function shoot() {
    if (!framing || shooting) return;
    const out = renderPhoto();
    ui.frameFlash();
    if (!out) { ui.toast(L('写真を保存できませんでした', 'Could not save the photo'), 'warn', 2200); return; }
    shooting = true;
    saveCanvas(out, `${PLACE.pic}-${stamp()}.jpg`, 'image/jpeg', 0.92).then((r) => {
      shooting = false;
      if (r === 'saved') ui.toast(L(`写真を保存しました（${out.width}×${out.height}）`, `Photo saved (${out.width}×${out.height})`), 'info', 2000);
      else if (r === 'failed') ui.toast(L('写真を保存できませんでした', 'Could not save the photo'), 'warn', 2200);
    });
  }

  // ---------------------------------------------------------------- メインループ
  let last = performance.now();
  let time = 0;
  let frame = 0;
  let clockT = 0;
  let questT = 0;
  let fpsAcc = 0, fpsN = 0, perfT = 0;
  const adaptOK = !params.get('noadapt');
  let lowN = 0, highN = 0, lastAdapt = 0, ceiling = dpr * Q.scale, adaptN = 0, degrade = 0;
  const DTMAX = parseFloat(params.get('dtmax') || '0.05');
  // どれか1つの更新でエラーが出ても、そのフレームの描画は続ける（画面が固まったままにならないように）。
  // 同じ場所のエラーは、最初の1回だけ記録する
  const errSeen = new Set();
  const guard = (tag, fn) => {
    try { fn(); } catch (e) { if (!errSeen.has(tag)) { errSeen.add(tag); console.error(`[${tag}]`, e); } }
  };
  function loop(now) {
    requestAnimationFrame(loop);
    if (window.__pause || worldMap.covering) { last = now; return; }   // 地図が画面をおおっているあいだは、描かない
    if (needResize) { needResize = false; resize(); }
    const dt = Math.min(DTMAX, (now - last) / 1000);
    last = now;
    time += dt;
    G.uTime.value = time;

    const viewing = !!(AQ && AQ.active);
    if (started) {
      if (!viewing) {
        guard('life.before', () => life.updateBefore(dt, time, player, started));
        player.update(dt, game.tension);
      }
    } else {
      // タイトル画面: ゆっくり景色を見渡す
      player.baseYaw = Math.sin(time * 0.11) * 0.22;
      player.basePitch = -0.04;
      player.mouse.set(0, 0);
      player.update(dt, 0);
    }
    camera.updateMatrixWorld();
    atm.update(dt, camera, time);
    G.uSunDirW.value.copy(atm.sunDir);
    G.uSunColor.value.copy(atm.u.uSunLight.value);
    G.uAmbient.value.copy(atm.u.uAmbient.value);

    if (!viewing) guard('game', () => game.update(started ? dt : 0));
    if (!started) guard('sim', () => sim.update(dt, { lure: { active: false }, hour: atm.hour, rain: atm.rain, overcast: atm.overcast }));
    if (started && wxMode === 'auto') {
      wxT -= dt;
      if (wxT <= 0) {
        const nxt = pickWeather(wxCur);
        if (nxt !== wxCur) {
          atm.setWeather(nxt);
          ui.toast((WX_MSG[wxCur + '>' + nxt] || L('空模様が変わってきた', 'The weather is changing')) + weatherHint(nxt), 'info', 4600);
        }
        wxCur = nxt;
        wxT = wxRand(...WX_DUR[nxt]);
      }
    }
    guard('fx', () => fx.update(dt, camera, time));
    guard('sky', () => sky.update(dt, time, camera, started));
    guard('life', () => life.update(dt, time, { atm, player, game, started }));
    guard('env', () => env.update(time));
    guard('world', () => W.update(dt, time, atm));
    guard('audio', () => audio.update(dt, { atm, wind: G.uWind.value }));
    advanceWig(dt);   // 魚の体・ひれ・えらの動きを、この1フレームぶん進める
    camera.updateMatrixWorld();

    if (frame++ % 2 === 0) renderer.shadowMap.needsUpdate = true;
    water.renderReflection(scene, camera);
    if (AQ) guard('tank.mirror', () => AQ.renderMirror(renderer, scene, camera));
    post.update(atm, time);
    post.render(dt);
    if (frame === 4) worldMap.sceneReady();   // 景色が描けた（旅の到着で、景色を開いてよい）

    if (shootReq) { shootReq = false; guard('photo', shoot); }

    clockT -= dt;
    if (clockT <= 0) {
      clockT = 0.25;
      ui.setClock(atm.hour, wxNow(), sim.activity(atm.hour, atm.overcast, atm.rain), W.status ? W.status() : '');
      // 日付がかわったら、お題を入れかえる（1分ごとに確認）
      if ((questT += 0.25) >= 60) { questT = 0; ui.setQuest(); }
    }

    // FPS と自動解像度調整
    fpsAcc += dt; fpsN++;
    perfT += dt;
    if (perfT >= 1) {
      const fps = fpsN / fpsAcc;
      if (showFps) ui.setFps(`${fps.toFixed(0)} fps  ${renderer.domElement.width}×${renderer.domElement.height}  ${quality}${ctxLost ? '  ctxlost ' + ctxLost : ''}`);
      if (started && adaptOK) {
        // 解像度の自動調整は「急に重い状態が続いたときだけ」下げ、戻すのはごくゆっくり
        // （上げ下げを繰り返すと画面がちらつくため）
        if (fps < 24) { lowN++; highN = 0; } else if (fps > 57) { highN++; lowN = 0; } else { lowN = 0; highN = 0; }
        if (lowN >= 3 && time - lastAdapt > (adaptN === 0 ? 3 : 6)) {
          if (pixelRatio > floorPR + 0.01) {
            // まず解像度を下げる（最初は素早く、下げ止まりまで）
            pixelRatio = Math.max(floorPR, pixelRatio * 0.82);
            ceiling = Math.min(ceiling, pixelRatio * 1.15);
            needResize = true;
          } else if (degrade < 2) {
            // 解像度が下げ止まりでも重いなら、重い効果から順に切る
            if (degrade === 0) post.setGodrays(false); else post.setBloom(false);
            degrade++;
          } else if (pixelRatio > minPR + 0.01) {
            pixelRatio = Math.max(minPR, pixelRatio * 0.85);
            needResize = true;
          }
          adaptN++; lastAdapt = time; lowN = 0;
        } else if (highN >= 40 && pixelRatio < ceiling - 0.01 && time - lastAdapt > 60) {
          pixelRatio = Math.min(ceiling, pixelRatio * 1.1);
          lastAdapt = time; highN = 0; needResize = true;
        }
      }
      fpsAcc = 0; fpsN = 0; perfT = 0;
    }
  }
  requestAnimationFrame(loop);

  window.__g = { G, daily, wxSkip: () => { wxT = 0; }, scene, camera, atm, water, renderer, post, THREE, game, sim, fx, player, ui, audio, rod, bobber, save, SPECIES, life, heron: life.heron, critters: life.critters, sky, neighbor: life.neighbor, boat: life.boat, aquarium: AQ, start: () => ui.el.start.click() };
}

main().catch((e) => {
  console.error(e);
  worldMap.abort();
  const t = document.getElementById('loadtxt');
  if (t) t.textContent = L('エラー: ', 'Error: ') + e.message;
});
