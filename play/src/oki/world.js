// ひだまり港の景色と住人（浜の海のしくみ＋沖縄の漁港）
import { L } from '../i18n.js';
import * as THREE from 'three';
import { clamp, TAU, smoothstep, hash1 } from '../util.js';
import { buildTerrain, buildDepthTexture, SHORE_Z, setTide, HEADS, TIDE, waterDepthAt, pondSigned } from './terrain.js';
import { SEASON } from './season.js';
import { G } from '../materials.js';
import { Water } from '../water.js';
import { buildPier, buildGear, buildSign, buildPoles, updateProps, PIER } from '../props.js';
import { buildCoral, buildLavaRocks } from './decor.js';
import { buildBeachGrass, buildHillTrees, buildTallGrass, TRADE } from './flora.js';
import { buildIslands } from './islands.js';
import { buildVillage, buildFukugi, buildQuayProps, buildTetrapods, buildLighthouse, buildFishingBoats } from './village.js';

// 海の色（線形）。浅瀬はターコイズ、ふかみは群青
const SEA = {
  shallow: [0.02, 0.28, 0.30], deep: [0.004, 0.07, 0.17], outDepth: 30,
  plane: [6000, 6000, 0, -1500],
  // 波（向き, 波長m, 高さm）: 港の外のうねりと、風波（港の中は、堤防でさえぎられて、おだやか）
  waves: [[0.25, 1, 46, 0.34], [-0.35, 1, 27, 0.18], [0.6, 1, 15, 0.09], [-0.1, 1, 8.5, 0.045], [0.75, 1, 4.6, 0.025], [-0.6, 1, 2.6, 0.012]],
  depthAt: waterDepthAt,   // うきを波に乗せるときの水深
};

// x の列で、岸（水ぎわ）から s メートル奥（負は海がわ）の z
function zAtS(x, sv) {
  let lo = -40, hi = 90;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pondSigned(x, mid) < sv) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export async function buildWorld({ scene, renderer, atm, Q, step, save }) {
  // 水のなかの見え方: 澄んでいて、赤い光から先に消える。底には光のゆらぎ
  G.uUnderColor.value.setRGB(0.02, 0.2, 0.24);
  G.uUnderDeep.value.setRGB(0.003, 0.05, 0.18);
  G.uUnderAbsorb.value = 0.16;
  G.uUnderTrans.value.set(1.5, 0.6, 0.38);
  G.uCaustic.value = 1;
  G.uUnderGain.value = 0.55;

  const land = new THREE.Group();   // 潮で上下する「陸」（地面と飾り）
  land.name = 'land';
  scene.add(land);
  let terrain, depthTex, water;
  await step(0.04, L('岸壁をならしています…', 'Pouring the quay…'), () => { terrain = buildTerrain(); land.add(terrain); });
  await step(0.2, L('港に水をみたしています…', 'Filling the harbor…'), () => {
    depthTex = buildDepthTexture();
    water = new Water(renderer, atm, depthTex, { reflScale: Q.refl, samples: Q.samples, sea: SEA });
    scene.add(water.mesh);
  });
  const camPos = new THREE.Vector3(0, PIER.y + 1.58, PIER.zEnd + 1.15);
  await step(0.28, L('沖の島を浮かべています…', 'Floating the islands…'), () => { buildIslands(land); });
  await step(0.34, L('港の底の岩を沈めています…', 'Sinking rocks on the harbor floor…'), () => { buildCoral(land); });
  await step(0.42, L('石灰岩の岩を並べています…', 'Placing limestone rocks…'), () => { buildLavaRocks(land); buildTetrapods(land, { count: Math.round(260 * Math.min(1, Q.density + 0.3)) }); });
  let village = null, quay = null, light = null, boats = null;
  await step(0.5, L('村をつくっています…', 'Building the village…'), () => {
    village = buildVillage(land);
    buildFukugi(land, { count: Q.density < 0.5 ? 20 : 34 });
    buildPoles(land, [[-33, zAtS(-33, 9)], [-14, zAtS(-14, 9)], [6, zAtS(6, 9)], [26, zAtS(26, 9)], [42, zAtS(42, 9)]]);
  });
  await step(0.56, L('草を生やしています…', 'Growing the grass…'), () => {
    const d = Math.min(1, Q.density + 0.15);
    buildBeachGrass(land, { count: Math.round(2600 * Q.density) });
    buildTallGrass(land, { count: Math.round(2200 * Q.density) });
    buildHillTrees(land, { count: Math.round(1150 * d) });
  });
  const props = {};
  await step(0.6, L('桟橋と岸壁の灯りを直しています…', 'Fixing the pier and the quay lights…'), () => {
    props.pier = buildPier(scene);
    props.gear = buildGear(scene, { style: 'hama' });
    quay = buildQuayProps(land);
    light = buildLighthouse(land);
    boats = buildFishingBoats(land, [[-19, zAtS(-19, -2.7), 0.04], [-12.5, zAtS(-12.5, -2.7), -0.03], [13, zAtS(13, -2.7), 0.05], [21, zAtS(21, -2.7), -0.04]]);
    const sx = 5.2;
    buildSign(land, sx, zAtS(sx, 3.4), Math.PI + 0.2, 'ひだまり港', 'グルクン・タマン・ガーラ　釣り場');
  });
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
  const amp = (SEASON.sea && SEASON.sea.tideAmp) || 0.5;
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
    return l < 0.62 ? L('おだやか', 'calm') : l < 0.95 ? L('ふつう', 'moderate') : l < 1.35 ? L('やや高い', 'choppy') : L('高い', 'rough');
  };
  return {
    water, props, grassGroup: null, camPos, land, aquarium: null,
    setupFX() {},
    setupSim(sim) { sim.homes = HEADS; },
    setupPost(post) { post.grade.uniforms.uSat.value = 1.05; },   // 彩度を上げすぎると、おもちゃのように見える
    status() {
      const r = TIDE.rate, l = TIDE.level;
      // スマホの幅でも、ウキ下の目盛りに隠れない長さに
      const tide = Math.abs(r) < 0.22 ? (l > 0 ? L('満潮', 'High tide') : L('干潮', 'Low tide')) : r > 0 ? L('満ち潮↗', 'Rising↗') : L('引き潮↘', 'Falling↘');
      return L(`${tide}・波 ${seaWord()}`, `${tide} · waves ${seaWord()}`);
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
      // 夕方から夜: 窓・街灯・自販機・灯台が灯る
      const night = clamp(atm.night * 1.1 + smoothstep(8, -2, atm.sunElev) * 0.35);
      const dusk = smoothstep(14, -1, atm.sunElev);
      if (village) village.winMat.emissiveIntensity = dusk * 1.25 + 0.01;
      if (quay) {
        for (const l of quay.lamps) l.intensity = night * 11 * (0.96 + 0.04 * Math.sin(time * 7.3 + l.position.x));
        quay.lampGlassMat.emissiveIntensity = night * 3.0;
        quay.vFront.emissiveIntensity = 0.12 + dusk * 1.1;
      }
      if (light) {
        const blink = Math.max(0, Math.sin(time * 1.9));
        light.lampMat.emissiveIntensity = night * (0.3 + 2.2 * blink * blink);
        light.light.intensity = night * (2 + 22 * blink * blink);
      }
      if (boats) boats.update(time);
    },
  };
}

// 住人たち: 港には、まだ住人はいない（あとで、岸壁の猫・おじいさんなどを足す）
export function buildLife() {
  return { heron: null, critters: null, boat: null, neighbor: null, honu: null, attach() {}, updateBefore() {}, update() {} };
}
