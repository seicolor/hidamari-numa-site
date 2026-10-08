// ひだまり浜の景色と住人
import * as THREE from 'three';
import { clamp, TAU, smoothstep, hash1 } from '../util.js';
import { buildTerrain, buildDepthTexture, SHORE_Z, setTide, HEADS, TIDE, waterDepthAt } from './terrain.js';
import { SEASON } from './season.js';
import { G } from '../materials.js';
import { Water } from '../water.js';
import { buildPier, buildGear, buildSign, updateProps, PIER } from '../props.js';
import { buildCoral, buildLavaRocks, buildCanoe, buildBeachBits } from './decor.js';
import { buildPalms, buildHala, buildNaupaka, buildBeachGrass, buildHillTrees, buildHeliotrope, buildIlima, buildBeachVines, buildTallGrass, TRADE } from './flora.js';
import { buildIslands } from './islands.js';
import { Honu } from './honu.js';
import { Aquarium } from './aquarium.js';

// 海の色（線形）。浅瀬はターコイズ、ふかみは群青
const SEA = {
  shallow: [0.01, 0.27, 0.34], deep: [0.003, 0.05, 0.18], outDepth: 30,
  plane: [6000, 6000, 0, -1500],
  // 波（向き, 波長m, 高さm）: 北東からの貿易風のうねりと、風波
  waves: [[0.25, 1, 46, 0.42], [-0.35, 1, 27, 0.24], [0.6, 1, 15, 0.12], [-0.1, 1, 8.5, 0.06], [0.75, 1, 4.6, 0.03], [-0.6, 1, 2.6, 0.014]],
  depthAt: waterDepthAt,   // うきを波に乗せるときの水深
};

export async function buildWorld({ scene, renderer, atm, Q, step, save }) {
  // 水のなかの見え方: 澄んでいて、赤い光から先に消える。底には光のゆらぎ
  G.uUnderColor.value.setRGB(0.01, 0.2, 0.27);
  G.uUnderDeep.value.setRGB(0.003, 0.05, 0.18);
  G.uUnderAbsorb.value = 0.12;
  G.uUnderTrans.value.set(1.5, 0.6, 0.38);
  G.uCaustic.value = 1;
  G.uUnderGain.value = 0.55;

  const land = new THREE.Group();   // 潮で上下する「陸」（地面と飾り）
  land.name = 'land';
  scene.add(land);
  let terrain, depthTex, water;
  await step(0.04, '砂浜をならしています…', () => { terrain = buildTerrain(); land.add(terrain); });
  await step(0.2, '海をみたしています…', () => {
    depthTex = buildDepthTexture();
    water = new Water(renderer, atm, depthTex, { reflScale: Q.refl, samples: Q.samples, sea: SEA });
    scene.add(water.mesh);
  });
  const camPos = new THREE.Vector3(0, PIER.y + 1.58, PIER.zEnd + 1.15);
  await step(0.28, '沖の島を浮かべています…', () => { buildIslands(land); });
  await step(0.34, 'サンゴを育てています…', () => { buildCoral(land); });
  await step(0.42, '溶岩の岩を並べています…', () => { buildLavaRocks(land); });
  let palms;
  await step(0.5, 'ヤシを植えています…', () => {
    palms = buildPalms(land, { count: Math.round(44 * Math.min(1, Q.density + 0.2)) });
    buildHala(land, { count: Q.density < 0.5 ? 6 : 10 });
  });
  await step(0.56, '浜に草を生やしています…', () => {
    const d = Math.min(1, Q.density + 0.15);
    buildNaupaka(land, { count: Math.round(210 * d), density: d });
    buildBeachGrass(land, { count: Math.round(3200 * Q.density) });
    buildTallGrass(land, { count: Math.round(3000 * Q.density) });
    buildBeachVines(land, { count: Math.round(30 * d), density: d });
    buildIlima(land, { count: Math.round(90 * d), density: d });
    buildHeliotrope(land, { count: Q.density < 0.5 ? 6 : 10 });
    buildHillTrees(land, { count: Math.round(1150 * d) });
    buildBeachBits(land, palms.positions);
  });
  const props = {};
  await step(0.6, '桟橋を直しています…', () => {
    props.pier = buildPier(scene);
    props.gear = buildGear(scene, { style: 'hama' });
    props.canoe = buildCanoe(land, -7.2, SHORE_Z + 3.6, 0.12);
    buildSign(land, 4.4, SHORE_Z + 2.6, Math.PI + 0.35, 'ひだまり浜', 'ヤッコ・ハギ・パピオ　釣り場');
  });
  let aquarium = null;
  await step(0.62, '水槽にサンゴをならべています…', () => { aquarium = new Aquarium({ land, scene, atm, save, renderer }); });
  // ---- 潮: 半日周期（12.42 時間）。日づけから位相を決め、ゲーム内の時間にあわせて進む
  // 時計（atm.hour）に合わせて進める。日づけをまたいだら1日すすめ、時刻を戻したら戻す
  let day = Math.floor(Date.now() / 86400000), lastHour = atm.hour;
  let H = day * 24 + atm.hour;
  const syncH = (h) => {
    if (h < lastHour - 12) day++;
    else if (h > lastHour + 12) day--;
    lastHour = h;
    H = day * 24 + h;
  };
  const amp = (SEASON.sea && SEASON.sea.tideAmp) || 0.42;
  TIDE.amp = amp;
  const lvl = (h) => amp * (0.82 * Math.sin((TAU * h) / 12.42) + 0.18 * Math.sin((TAU * h) / 24.84 + 0.7));
  const rateAt = (h) => clamp((lvl(h + 0.15) - lvl(h - 0.15)) / 0.3 / (amp * (TAU / 12.42) * 0.85), -1, 1);
  let tideNow = 0;
  const applyTide = () => {
    const v = lvl(H), r = rateAt(H);
    if (Math.abs(v - tideNow) > 0.0015 || Math.abs(r - TIDE.rate) > 0.02) {
      tideNow = v;
      setTide(v, r);
      land.position.y = -v;
      water.material.uniforms.uTide.value = v;
    }
  };
  applyTide();

  // ---- 海の状態: 季節のうねり（日によって大小がある）、貿易風（昼すぎに強まり、夜明けは凪ぐ）、天気、潮。
  // 満ち潮のときやうねりの大きい日は、リーフをこえて入り江の中まで波が入り、引き潮ではリーフで砕ける
  const S = SEASON.sea || {};
  const byDay = (h, seed) => {
    const d = h / 24 + seed, i = Math.floor(d), f = d - i, e = f * f * (3 - 2 * f);
    return hash1(i * 7.13 + seed) * (1 - e) + hash1((i + 1) * 7.13 + seed) * e;   // 0..1、日をまたいでなめらか
  };
  const SEA_STATE = { swell: 1, wind: 1, lagoon: 1, surf: 1, level: 1 };
  G.seaState = SEA_STATE;
  const seaTarget = (a) => {
    const swell = (S.swell ?? 1) * (0.7 + 0.6 * byDay(H, 0.37));
    const dh = ((a.hour - 14.5 + 36) % 24) - 12;
    const diurnal = 0.4 + 0.6 * Math.exp(-(dh / 5.5) * (dh / 5.5));
    const wind = (S.trade ?? 1) * diurnal * (0.8 + 0.4 * byDay(H, 5.1)) + a.overcast * 0.15 + a.rain * 0.45;
    const tn = clamp(TIDE.level / Math.max(TIDE.amp, 0.05), -1, 1);
    const lagoon = (0.6 + 0.5 * swell) * (1 + 0.55 * tn) * (S.lagoon ?? 1);
    const surf = swell * (1 - 0.3 * tn);
    return { swell, wind, lagoon, surf };
  };
  const applySea = (a, dt) => {
    const tg = seaTarget(a);
    const k = dt < 0 ? 1 : 1 - Math.exp(-0.25 * dt);
    for (const key of ['swell', 'wind', 'lagoon', 'surf']) SEA_STATE[key] += (tg[key] - SEA_STATE[key]) * k;
    const { swell, wind, lagoon, surf } = SEA_STATE;
    const u = water.material.uniforms;
    u.uWaveMix.value.set(swell, Math.max(0.1, 1.25 * wind - 0.15), lagoon, smoothstep(0.45, 1.3, wind));
    u.uSwell.value = clamp(0.35 + 0.6 * surf, 0.3, 1.6);
    // 入り江の中で、うきが感じる波の大きさ（ことば・音に使う）
    SEA_STATE.level = swell * lagoon * 0.55 + wind * 0.45;
    TRADE.value = 0.45 + 0.7 * wind;
  };
  applySea(atm, -1);
  SEA_STATE.snap = (a) => { syncH(a.hour); applyTide(); applySea(a, -1); };   // 時刻を飛ばしたとき（確認用）に、すぐ合わせる
  const seaWord = () => {
    const l = SEA_STATE.level;
    return l < 0.62 ? 'おだやか' : l < 0.95 ? 'ふつう' : l < 1.35 ? 'やや高い' : '高い';
  };
  return {
    water, props, grassGroup: null, camPos, land, aquarium,
    setupFX() {},
    setupSim(sim) { sim.homes = HEADS; },
    setupPost(post) { post.grade.uniforms.uSat.value = 1.06; },   // 彩度を上げすぎると、おもちゃのように見える
    status() {
      const r = TIDE.rate, l = TIDE.level;
      // スマホの幅でも、ウキ下の目盛りに隠れない長さに
      const tide = Math.abs(r) < 0.22 ? (l > 0 ? '満潮' : '干潮') : r > 0 ? '満ち潮↗' : '引き潮↘';
      return `${tide}・波 ${seaWord()}`;
    },
    update(dt, time, atm) {
      syncH(atm.hour);
      applyTide();
      applySea(atm, dt);
      // 風のさざ波は、貿易風の強さと突風で（fx の値を上書きする）
      const gust = clamp((G.uWind.value.x - 0.15) / 0.9, 0, 2);
      const w = SEA_STATE.wind;
      water.material.uniforms.uRough.value = (0.3 + 0.6 * w) * (0.75 + 0.25 * gust) + atm.rain * 0.4;
      G.uWind.value.multiplyScalar(0.55 + 0.5 * w);
      updateProps(props, atm, time);
      aquarium.update(dt, time, atm);
    },
  };
}

// 住人たち: ホヌ（ウミガメ）が、ときどき入り江をよこぎる
export function buildLife({ scene, camera, water, fx, audio, ui, save, getGame }) {
  const honu = new Honu(scene, water, {
    ripple: (x, z, a) => water.addRipple(x, z, a),
    onFirst: () => {
      ui.toast('入り江を、ウミガメ（ホヌ）が泳いでいく。そっと見守ろう', 'info', 4600);
      if (save.achieve('honu')) setTimeout(() => ui.toast('ホヌに出会えた。いいことありそう', 'big', 3000), 2400);
    },
  });
  return {
    heron: null, critters: null, boat: null, neighbor: null, honu,
    attach() {},
    updateBefore() {},
    update(dt, time, { atm, started }) { if (started) honu.update(dt, time, { night: atm.night, rain: atm.rain }); },
  };
}
