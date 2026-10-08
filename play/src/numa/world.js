// ひだまり沼の景色と、住人たち（main.js から切りだしたもの）
import { L } from '../i18n.js';
import * as THREE from 'three';
import { buildTerrain, buildDepthTexture, SHORE_Z, waterDepthAt, HOUSE } from './terrain.js';
import { SEASON, SEASON_ID } from './season.js';
import { buildGrass, buildHigan, buildTrees, buildHeroTrees, buildRocks, buildLilies } from './flora.js';
import { buildPier, buildGear, buildFarmhouse, buildHasa, buildPoles, buildJizo, buildSign, updateProps, PIER } from '../props.js';
import { Water } from '../water.js';
import { Heron } from '../heron.js';
import { Critters } from '../critters.js';
import { Neighbor } from '../neighbor.js';
import { Boat } from '../boat.js';
import { clamp } from '../util.js';

// 景色: 地面・水・草木・小屋。step(進み具合, ことば, 処理) で読み込み表示を進める
export async function buildWorld({ scene, renderer, atm, Q, step }) {
  let terrain, depthTex, water, grassGroup;
  await step(0.04, L('大地をつくっています…', 'Shaping the land…'), () => { terrain = buildTerrain(); scene.add(terrain); });
  await step(0.2, L('水をはっています…', 'Filling the pond…'), () => {
    depthTex = buildDepthTexture();
    water = new Water(renderer, atm, depthTex, { reflScale: Q.refl, samples: Q.samples });
    scene.add(water.mesh);
  });
  const camPos = new THREE.Vector3(0, PIER.y + 1.58, PIER.zEnd + 1.15);
  await step(0.32, L('草を生やしています…', 'Growing the grass…'), () => { grassGroup = buildGrass(scene, { density: Q.density, camPos }); });
  await step(0.42, L('山の木々を植えています…', 'Planting the hills…'), () => { buildTrees(scene, { density: Q.density, camPos }); buildRocks(scene); });
  await step(0.52, L('彼岸花とスイレン…', 'Spider lilies and water lilies…'), () => { if (SEASON.higan) buildHigan(scene, { density: Q.density }); if (SEASON_ID !== 'winter') buildLilies(scene, { depthAt: waterDepthAt }); });
  const props = {};
  await step(0.6, L('桟橋と古民家を建てています…', 'Building the pier and the old house…'), () => {
    props.pier = buildPier(scene);
    props.gear = buildGear(scene);
    props.farmhouse = buildFarmhouse(scene);
    props.hasa = buildHasa(scene);
    buildPoles(scene, [[54, 8], [58, -14], [60, -36], [55, -58], [48, -80]]);
    buildJizo(scene, -5.8, SHORE_Z + 3.4);
    buildSign(scene, 4.6, SHORE_Z + 2.4, Math.PI + 0.3);
    // 主役の木の色は季節ごと（秋はカキ・モミジ・イチョウ、春はモミジが桜に、冬は葉が落ちて柿だけが残る）
    buildHeroTrees(scene, [
      { kind: 'kaki', x: HOUSE.x + 12, z: HOUSE.z + 6, seed: 7, blobs: 10, spread: 2.6, size: 2.3, scale: 1.1, fruit: Math.round(100 * SEASON.fruit) },
      { kind: 'momiji', x: -28, z: SHORE_Z - 12, seed: 12, blobs: 11, spread: 2.9, size: 2.4, scale: 1.5 },
      { kind: 'ginkgo', x: 31, z: SHORE_Z - 8, seed: 21, blobs: 9, spread: 2.2, size: 2.3, scale: 1.4 },
      { kind: 'momiji2', x: -21, z: SHORE_Z + 6, seed: 33, blobs: 9, spread: 2.4, size: 2.3, scale: 1.3 },
    ].map((t) => ({ ...t, color: SEASON.hero[t.kind] })), { density: Math.min(1, Q.density) });
  });
  return {
    water, props, grassGroup, camPos,
    // 魚たちを呼んだあと、fx をつないで煙を出す
    setupFX(fx) {
      props.farmhouse.updateMatrixWorld(true);
      fx.smokeOrigin = props.farmhouse.userData.smokePos.clone().applyMatrix4(props.farmhouse.matrixWorld);
    },
    update(dt, time, atm) { updateProps(props, atm, time); },
  };
}

// 住人たち: サギ・カワセミ/カエル/猫・ボート・隣のおじいさん
export function buildLife({ scene, camera, water, fx, audio, ui, save, getGame }) {
  const game = () => getGame();
  const heron = new Heron(scene, water, { onFlap: () => audio.heron() });
  // 待ち時間の小さな出来事（カワセミ・カエル）。遠いほど小さな音で、左右にも振る
  const nearVol = (x, z) => clamp(1.15 - Math.hypot(x - camera.position.x, z - camera.position.z) / 26, 0.25, 1);
  const critters = new Critters(scene, water, {
    onChirp: (x, z) => audio.chirp(game().pan(x, z), nearVol(x, z)),
    onCroak: (x, z) => audio.croak(game().pan(x, z), nearVol(x, z)),
    onPlip: (x, z) => audio.plip(0.45, game().pan(x, z)),
    onSplash: (x, z, p) => audio.splash(p, game().pan(x, z)),
    onMeow: (x, z) => audio.meow(game().pan(x, z), nearVol(x, z)),
    onFed: (x, z) => audio.purr(game().pan(x, z), nearVol(x, z)),
    onCatOffer: (on) => ui.setCatOffer(on),
    onCatArrive: (first) => ui.toast(first ? L('桟橋の杭に、猫がとびのった', 'A cat hopped onto a pier post') : L('また、猫が来ている', 'The cat is back'), 'info', 2800),
  });
  // 手こぎボート: 桟橋のわきにつないである。のりこんで、沖へこぎだせる
  const boat = new Boat(scene, {
    onStart: (spot, toPier) => { ui.toast(toPier ? L('桟橋へもどります', 'Heading back to the pier') : L(`${spot.name}へ、こぎだします`, `Rowing out to ${spot.name}`), 'info', 2400); if (!toPier) ui.setBoatLabel(false); },
    onStroke: (x, z) => { fx.splash(x + (Math.random() - 0.5) * 1.6, z + 0.2, 0.12); audio.oar(0, 0.8); },
    onMove: (x, z) => game().sim.scare(x, z, 4.5, 0.6),
    onDock: () => { audio.boatKnock(); ui.setBoatLabel(true); ui.toast(L('桟橋にもどった', 'Back at the pier'), 'info', 1800); },
    onArrive: (spot) => {
      audio.boatKnock();
      ui.toast(L(`${spot.name}　水深 ${spot.depth.toFixed(1)} m`, `${spot.name} · depth ${spot.depth.toFixed(1)} m`), 'info', 3000);
      if (save.achieve('boat')) setTimeout(() => ui.toast(L('はじめてのボート。沼がちがって見える', 'Your first boat trip. The pond looks different from here'), 'big', 2800), 1400);
    },
  });
  // 隣の釣り人（おじいさん）: 手前の岸（左うしろ）に、ときどき来る
  const neighbor = new Neighbor(scene, {
    onArrive: (first) => ui.toast(first ? L('うしろの岸（左）に、釣り人がやってきた', 'An angler has come to the bank behind you (left)') : L('おじいさんが、また来ている', 'The old man is back'), 'info', 3400),
    onTalkable: (on) => ui.setTalkOffer(on),
    onStrike: (x, z, caught) => { fx.splash(x, z, 0.3); audio.splash(0.3, game().pan(x, z)); if (caught && game().state === 'float') ui.say(L('おっ、釣れたわい', 'Oh, got one'), 2200); },
    onMutter: (t) => ui.say(t, 3200),
  });
  return {
    heron, critters, boat, neighbor,
    // game に住人をつなぐ
    attach(g) { g.heron = heron; g.critters = critters; g.boat = boat; g.neighbor = neighbor; },
    // 操作の前に（ボートの移動）
    updateBefore(dt, time, player, started) { if (started) boat.update(dt, time, player); },
    update(dt, time, { atm, player, game: g, started }) {
      heron.update(dt, time, { night: atm.night });
      if (started) critters.update(dt, time, { night: atm.night, rain: atm.rain, hour: atm.hour, sunElev: atm.sunElev, yaw: player.yaw, state: g.state, kept: g.keptList.length });
      ui.setCatOffer(critters.cts.offer && g.onPier());
      ui.setTalkOffer(neighbor.offer && neighbor.headPos().distanceTo(player.eye) <= 30);
      neighbor.update(started ? dt : 0, time, { started, sunElev: atm.sunElev, rain: atm.rain, state: g.state, eye: player.eye });
    },
  };
}
