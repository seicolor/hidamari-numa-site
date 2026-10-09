// 釣りの進行（投げる → 待つ → アタリ → 合わせる → やり取り → 取り込み → 図鑑）
import { L, EN } from './i18n.js';
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, TAU, noise2 } from './util.js';
import { SPECIES, DEFAULT_BITE, BAITS, weightG, fmtWeight, rollLength, SPECIES_ORDER, TACKLE_MIN, TACKLE_MAX, TACKLE_STEP, likesOf, layerText, isSeasonal, inSeason } from './species.js';
import { terrainHeight, pondSigned, waterDepthAt } from './terrain.js';
import { createFishObject, displayLength } from './fishmodels.js';
import { PIER } from './props.js';
import { SEASON_NAMES, SEASON_ID } from './season.js';
import { ROD_TYPES } from './rod.js';
import { PLACE } from './place.js';
import { Showcase } from './showcase.js';

export const ST = {
  IDLE: 'idle', CHARGE: 'charge', CAST: 'cast', FLOAT: 'float', BITE: 'bite',
  FIGHT: 'fight', LAND: 'land', SHOW: 'show', RETRIEVE: 'retrieve',
};

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const easeInOut = (t) => t * t * (3 - 2 * t);

export class Game {
  constructor(d) {
    Object.assign(this, d);
    this.state = ST.IDLE;
    this.stateT = 0;
    this.time = 0;
    this.vibOn = true;
    this.biteEnd = null; this.biteT = 0; this.biteDir = { x: 1, z: 0 };
    this.bait = this.save.setting('bait') || 'dough';
    this.power = 0;
    this.lure = { active: false, x: 0, z: 0, depth: -0.5, bait: this.bait };
    this.bobPos = new THREE.Vector3();
    this.dipY = 0;
    this.dipTarget = 0;
    this.twitch = null;
    this.ringT = 0;
    this.cast = null;
    this.retrieve = null;
    this.fight = null;
    this.show = null;
    this.catchObj = null;
    this.biteFish = null;
    this.pose = { pitch: 0.52, yaw: 0.26, bend: 0.08, bendTo: new THREE.Vector3(0, -1, 0) };
    this.tipPrev = new THREE.Vector3();
    this.keptList = [];
    this.reelTickT = 0;
    this.creakT = 0;
    this.msgCool = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this.idleSwing = 0;
    this.lastLandX = 0; this.lastLandZ = -10;
    this.waitT = 0;
    this.tension = 0;
    this.showLight = new THREE.PointLight(0xffe8c8, 0, 7, 1.5);
    this.scene.add(this.showLight);
    // 釣った魚を手にのせて見せる演出
    this.showcase = new Showcase(this.scene);
    this.cardPending = false;
    this.rodDrop = 0;
    this.fovBefore = null;
    this._eyeR = new THREE.Vector3();
    // 遠いウキの拡大（ウキのマーカーをタップ / Zキー）
    this.zoom = { on: false, fovBefore: null };
    this.zoomHinted = false;
    // ウキ下（タナ）。エサの深さ(m)。魚ごとに好きな深さがあるので、釣れないときは変えてみる
    this.tackle = clamp(Math.round((+this.save.setting('tackle') || 0.8) * 10) / 10, TACKLE_MIN, TACKLE_MAX);
    this.layT = 0; // 底に着いてウキが寝ている度合い
    this.probeT = 0;
    this.probeRes = null;
    this.depthT = 0;
    this.cue = { noticed: false, depthHint: false, emptyHint: false };
    this.tackleHinted = !!this.save.setting('tackleHint');
    // 竿の種類（リール竿 / へら竿）
    this.rodType = ROD_TYPES[this.save.setting('rod')] ? this.save.setting('rod') : 'reel';
    this.applyRod();
    this.player.on('key', (e) => this.onKey(e));
    this.ui.onCatchChoice = (c) => this.finishCatch(c);
    this.ui.setTackle(this.tackle);
  }

  // ---------------------------------------------------------------- 入力
  onKey(e) {
    if (this.ui.isModalOpen() || this.ui.framing) return;
    if (e.code === 'Digit1') this.setBait('worm');
    else if (e.code === 'Digit2') this.setBait('dough');
    else if (e.code === 'Digit3') this.setBait('gluten');
    else if (e.code === 'KeyQ') this.setRod(this.rodType === 'reel' ? 'hera' : 'reel');
    else if (e.code === 'KeyZ') this.toggleBobberZoom();
    else if (e.code === 'KeyC') this.feedCat();
    else if (e.code === 'KeyT') this.talkNeighbor();
    else if (e.code === 'KeyB') this.openBoatMenu();
    else if (e.key === '[' || e.key === '{') this.nudgeTackle(-1);
    else if (e.key === ']' || e.key === '}') this.nudgeTackle(1);
    else if (this.state === ST.SHOW) {
      if (e.code === 'KeyK' || e.code === 'Enter') this.finishCatch('keep');
      else if (e.code === 'KeyR' || e.code === 'Backspace') this.finishCatch('release');
      else if (e.code === 'KeyV' && this.tank) { e.tankDone = true; this.finishCatch('tank'); }
      else if (e.code === 'KeyG') this.ui.requestGyotaku();
    }
  }

  isIdle() { return this.state === ST.IDLE; }

  // ---------------------------------------------------------------- 猫
  // びくの魚を猫にあげる。お礼に、まだ釣れていない魚のヒントをくれることがある
  // 流れ星に願いごとをすると、しばらく魚の食いがよくなる（0〜1）
  wishLuck(sec = 90) { this.luckUntil = this.time + sec; this.luckSpan = sec; }
  luck() { return this.luckUntil && this.time < this.luckUntil ? Math.min(1, (this.luckUntil - this.time) / 20) : 0; }

  feedCat() {
    const C = this.critters;
    if (!C || !this.onPier() || !this.keptList.length || (this.state !== ST.IDLE && this.state !== ST.FLOAT)) return;
    if (!C.feed()) return;
    const given = this.keptList.pop();
    this.ui.setKept(this.keptList.length);
    this.ui.toast(L(`猫に ${SPECIES[given.id] ? SPECIES[given.id].name : '魚'} をあげた`, `You gave the cat a ${SPECIES[given.id] ? SPECIES[given.id].name : 'fish'}`), 'info', 1800);
    const first = this.save.achieve('cat');
    if (first) setTimeout(() => this.ui.toast(L('猫となかよくなった', 'You made friends with the cat'), 'big', 2400), 2200);
    setTimeout(() => this.ui.toast(this.catHint(), 'info', 5200), first ? 4800 : 2600);
  }
  // まだ釣れていない魚のヒント（style: 'cat' は「みたい」、'elder' は「らしいぞ」）
  hintMsg(style = 'cat') {
    const end = EN ? (style === 'elder' ? ', so they say' : ', it seems') : style === 'elder' ? 'らしいぞ' : 'みたい';
    const low = (s) => s.charAt(0).toLowerCase() + s.slice(1);
    const ids = SPECIES_ORDER.filter((id) => !SPECIES[id].junk);
    const caught = this.save.data.catches || {};
    const unseen = ids.filter((id) => !(caught[id] && caught[id].count > 0));
    const pool = unseen.length ? unseen : ids;
    const sp = SPECIES[pool[Math.floor(Math.random() * pool.length)]];
    const lk = likesOf(sp), lt = layerText(sp);
    const opts = [];
    if (isSeasonal(sp) && !inSeason(sp)) return L(`${sp.name}は、${SEASON_NAMES[sp.season]}にだけ姿を見せる${end}`, `The ${sp.name} only shows up in ${low(SEASON_NAMES[sp.season])}${end}`);
    if (lt) opts.push(L(`${sp.name}は、${lt}にいる${end}`, `Look for the ${sp.name}: ${low(lt)}${end}`));
    const when = [...lk.times, ...lk.wx].slice(0, 2);
    if (when.length) opts.push(L(`${sp.name}は、${when.join('・')}によく食う${end}`, `The ${sp.name} bites best at ${when.join(' and ')}${end}`));
    if (lk.poor.length) opts.push(L(`${sp.name}は、${lk.poor[0]}がにがて${end}`, `The ${sp.name} doesn't care for ${lk.poor[0]}${end}`));
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : L(`${sp.name}を見かけた${style === 'elder' ? 'ぞ' : 'よ'}`, `I saw a ${sp.name}`);
  }
  catHint() { return L(`猫が目を細めた…「${this.hintMsg('cat')}」`, `The cat narrows its eyes… “${this.hintMsg('cat')}”`); }

  // ---------------------------------------------------------------- ボート
  onPier() { return !this.boat || (this.boat.at === 'pier' && !this.boat.trip); }
  openBoatMenu() {
    const B = this.boat;
    if (!B || B.busy) return;
    if (this.state !== ST.IDLE) { this.ui.toast(L('ウキをあげてから、ボートに乗ろう', 'Reel in before getting in the boat'), 'info', 2200); return; }
    this.ui.openBoat(B.spots, B.at);
  }
  goBoat(id) {
    const B = this.boat;
    if (!B || B.busy || this.state !== ST.IDLE) return;
    B.moveTo(id);
  }

  // ---------------------------------------------------------------- 隣の釣り人（おじいさん）
  talkNeighbor() {
    const N = this.neighbor;
    if (!N || !N.canTalk || (this.state !== ST.IDLE && this.state !== ST.FLOAT)) return;
    if (N.headPos().distanceTo(this.player.eye) > 30) { this.ui.toast(L('遠くて、声がとどかない', 'Too far away to talk'), 'info', 1800); return; }
    const sv = this.save;
    const caught = sv.data.catches || {};
    const hint = Math.random() < 0.7 ? this.hintMsg('elder') : null;
    const r = N.talk({ met: !!sv.setting('neighborMet'), hint: hint ? L(`${hint}。`, `${hint}.`) : null, nushiCaught: !!(caught.nushi && caught.nushi.count > 0), keptN: this.keptList.length });
    sv.setting('neighborMet', 1);
    this.ui.say(r.text, 3400 + r.text.length * 110);
    // 彼のほうへ、そっと視線をむける
    const hp = N.headPos(), e = this.player.eye;
    const dx = hp.x - e.x, dz = hp.z - e.z;
    let yaw = -Math.atan2(dx, -dz);
    yaw += Math.round((this.player.baseYaw - yaw) / TAU) * TAU;
    this.lookTo = { yaw, pitch: clamp(Math.atan2(hp.y - e.y, Math.hypot(dx, dz)), -0.5, 0.3), t: 0, fov: this.player.targetFov };
    this.player.targetFov = Math.min(this.player.targetFov, 38);
    if (r.luck) {
      this.wishLuck(120);
      setTimeout(() => { this.audio.wish(); this.ui.toast(L('おまじないをもらった（しばらく、釣れそうな気がする）', 'You got a good-luck charm (feeling lucky for a while)'), 'info', 3600); }, 2600 + r.text.length * 70);
    }
    if (sv.achieve('neighbor')) setTimeout(() => this.ui.toast(L('釣り友だちができた', 'You made a fishing friend'), 'big', 2600), 1800);
  }

  // ---------------------------------------------------------------- ウキの拡大
  toggleBobberZoom() {
    if (this.zoom.on) { this.endBobberZoom(true); return; }
    if (this.state !== ST.FLOAT && this.state !== ST.BITE) return;
    this.zoom.on = true;
    this.zoom.fovBefore = this.player.targetFov;
    this.player.mouseLook = false;
    this.ui.setMarkerZoom(true);
    this.audio.uiTick();
    this.ui.toast(L('ウキを拡大中（もう一度タップで戻る）', 'Zoomed in on the bobber (tap again to go back)'), 'info', 2200);
  }

  endBobberZoom(user) {
    if (!this.zoom.on) return;
    this.zoom.on = false;
    this.player.targetFov = this.zoom.fovBefore ?? 62;
    this.player.mouseLook = true;
    this.ui.setMarkerZoom(false);
    if (user) this.audio.uiTick();
  }

  // 拡大中は、ウキを画面の中央に追いかけ、距離に合わせて画角をしぼる
  updateZoom() {
    if (!this.zoom.on) return;
    if (this.state !== ST.FLOAT && this.state !== ST.BITE) { this.endBobberZoom(false); return; }
    const e = this.player.eye, b = this.bobPos;
    const dx = b.x - e.x, dz = b.z - e.z, dy = b.y + 0.12 - e.y, hd = Math.hypot(dx, dz);
    this.player.baseYaw = clamp(Math.atan2(-dx, -dz), -2.2, 2.2);
    this.player.basePitch = clamp(Math.atan2(dy, hd), -0.6, 0.85);
    const asp = this.camera.aspect || 1.6;
    const k = asp < 1.25 ? 1 + (1.25 - asp) * 0.75 : 1;
    const vfov = 2 * Math.atan(5.5 / (2 * Math.max(Math.hypot(hd, dy), 4))); // ウキ(約30cm)が画面の高さの6%ほどに
    this.player.targetFov = clamp(THREE.MathUtils.radToDeg(vfov) / k, 7, 30);
  }

  // ---------------------------------------------------------------- ウキ下（タナ）
  canTackle() {
    return this.state === ST.IDLE || this.state === ST.CHARGE || this.state === ST.FLOAT;
  }

  nudgeTackle(dir) {
    this.setTackle(this.tackle + dir * TACKLE_STEP, true);
  }

  setTackle(v, byKey) {
    v = clamp(Math.round(v * 10) / 10, TACKLE_MIN, TACKLE_MAX);
    if (!this.canTackle()) {
      if (byKey && this.time - (this._tkToast || -9) > 2) { this._tkToast = this.time; this.ui.toast(L('ウキ下は、ウキが浮いているときに変えられます', 'You can change the depth while the bobber is floating'), 'info', 1600); }
      return;
    }
    if (v === this.tackle) return;
    const deeper = v > this.tackle;
    this.tackle = v;
    this.save.setting('tackle', v);
    this.ui.setTackle(v);
    this.audio.uiTick();
    if (this.state === ST.FLOAT) {
      // 仕掛けを上げ下げするので、水面に小さな波紋
      this.water.addRipple(this.bobPos.x, this.bobPos.z, 0.08);
      const floor = this.lure.floor;
      if (v > floor - 0.02) this.ui.toast(L('エサが底についた（ウキが寝る）', 'The bait is on the bottom (the bobber lies flat)'), 'info', 1400);
      else this.ui.toast(deeper ? L(`ウキ下 ${v.toFixed(1)} m　エサをしずめる`, `Depth ${v.toFixed(1)} m · bait lowered`) : L(`ウキ下 ${v.toFixed(1)} m　エサを浮かせる`, `Depth ${v.toFixed(1)} m · bait raised`), 'info', 1200);
    }
  }

  // エサの深さをウキ下にむけて、しずめたり浮かせたりする
  updateLureDepth(dt) {
    const L = this.lure;
    if (!L.active) return;
    const tgt = -Math.min(this.tackle, Math.max(0.1, L.floor - 0.04));
    const v = tgt < L.depth ? 0.38 : 0.75;
    L.depth += clamp(tgt - L.depth, -v * dt, v * dt);
    // 底にとどいてウキが寝る（ウキ下 > 水深）
    const lay = this.state === ST.FLOAT && this.tackle > L.floor - 0.02 ? 1 : 0;
    this.layT = damp(this.layT, lay, 3, dt);
  }

  // 右のウキ下の目盛りに、エサの深さと近くの魚影を映す
  updateDepthView(dt) {
    this.depthT -= dt;
    if (this.depthT > 0) return;
    this.depthT = 0.12;
    const L = this.lure;
    if (!(L.active && (this.state === ST.FLOAT || this.state === ST.BITE))) { this.ui.setDepthView(null, []); return; }
    const yaw = this.player.yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const R = 6;
    const marks = [];
    for (const f of this.sim.fish) {
      if (f.hooked || !f.alive) continue;
      const dx = f.x - L.x, dz = f.z - L.z;
      const d2 = Math.hypot(dx, dz);
      if (d2 > R) continue;
      marks.push({
        lx: clamp((dx * rx + dz * rz) / R, -1, 1), d: -f.y, cm: f.cm,
        dir: Math.cos(f.heading) * rx + Math.sin(f.heading) * rz, near: 1 - d2 / R,
        hot: f.state === 'approach' || f.state === 'inspect' || f.state === 'bitten' ? 1 : 0,
      });
    }
    this.ui.setDepthView(-L.depth, marks);
  }

  // 釣れないときのヒント（そのキャストで一度ずつ）
  updateCue(dt) {
    if (this.state !== ST.FLOAT) return;
    this.probeT -= dt;
    if (this.probeT > 0) return;
    this.probeT = 1;
    const pr = this.probeRes = this.sim.probe(this.lure);
    const c = this.cue;
    if (!c.noticed && !c.depthHint && this.waitT > 20 && pr.near > 0 && pr.fit === 0) {
      c.depthHint = true;
      const want = pr.want, cur = -this.lure.depth;
      const dir = want > cur + 0.2 ? L('もう少し深いタナ', 'a little deeper') : want < cur - 0.2 ? L('もう少し浅いタナ', 'a little shallower') : L('ちがうタナ', 'at another depth');
      this.ui.toast(L(`魚の気配はあるのに食ってこない… ${dir}にいるのかも`, `Fish are around, but not biting… maybe they are ${dir}`), 'info', 4200);
      if (!this.tackleHinted) { this.tackleHinted = true; this.save.setting('tackleHint', 1); setTimeout(() => this.ui.toast(this.ui.isTouch ? L('右の目盛りをタップ／▲▼で「ウキ下」を変えられます', 'Tap the scale on the right or ▲▼ to change the depth') : L('右の目盛りをクリック、または [ ] キーで「ウキ下」を変えられます', 'Click the scale on the right, or press [ ], to change the depth'), 'info', 4600), 4400); }
    } else if (!c.noticed && !c.emptyHint && this.waitT > 50 && pr.near === 0) {
      c.emptyHint = true;
      this.ui.toast(L('このあたりは魚が少ないみたい。場所をかえてみよう', 'Not many fish around here. Try another spot'), 'info', 3600);
    }
  }

  setBait(id) {
    if (!BAITS[id]) return;
    if (this.state === ST.FLOAT || this.state === ST.BITE || this.state === ST.FIGHT || this.state === ST.CAST || this.state === ST.LAND || this.state === ST.SHOW) {
      this.ui.toast(L('エサは釣り糸を巻き上げてから変えよう', 'Reel in before changing bait'), 'info', 1800);
      return;
    }
    this.bait = id;
    this.lure.bait = id;
    this.save.setting('bait', id);
    this.ui.setBait(id);
    this.audio.uiTick();
    this.ui.toast(L(`${BAITS[id].name} をつけた`, `Baited with ${BAITS[id].name}`), 'info', 1200);
  }

  applyRod() {
    this.cfg = ROD_TYPES[this.rodType];
    this.rod = this.rods[this.rodType];
    for (const [id, r] of Object.entries(this.rods)) r.setVisible(id === this.rodType);
    this.bobber.setStyle(this.cfg.bobber);
    this.pose.pitch = this.cfg.pose.idle;
    this.ui.setRod && this.ui.setRod(this.rodType);
  }

  setRod(type) {
    if (!ROD_TYPES[type] || type === this.rodType) return;
    if (this.state !== ST.IDLE) {
      this.ui.toast(L('竿を替えるには、いったん糸を巻き上げよう', 'Reel in before switching rods'), 'info', 1800);
      return;
    }
    this.rodType = type;
    this.save.setting('rod', type);
    this.applyRod();
    this.audio.uiTick();
    this.ui.toast(L(`${this.cfg.name} に持ち替えた`, `Switched to the ${this.cfg.name}`), 'info', 1600);
    if (type === 'hera' && this.bait !== 'dough' && PLACE.heraTip) this.ui.toast(PLACE.heraTip, 'info', 2600);
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  pan(x, z) {
    const e = this.player.eye;
    const yaw = this.player.yaw;
    const dx = x - e.x, dz = z - e.z;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return clamp((dx * rx + dz * rz) / Math.max(6, Math.hypot(dx, dz)), -0.9, 0.9);
  }

  // デバッグ: 指定した魚を今すぐ食いつかせる
  debugForceBite(id) {
    if (this.state !== ST.FLOAT) return false;
    let f = this.sim.fish.find((o) => (!id || o.sp.id === id) && !o.hooked && o.alive);
    if (!f) return false;
    f.x = this.lure.x; f.z = this.lure.z; f.y = this.lure.depth;
    f.state = 'bitten'; f.window = 6;
    this.onBite(f);
    return f.sp.id;
  }

  // デバッグ: 釣果表示をすぐ見る
  debugCatch(id, cm) {
    const sp = SPECIES[id];
    if (this.catchObj && this.catchObj.obj) { this.scene.remove(this.catchObj.obj.group); if (this.catchObj.obj.dispose) this.catchObj.obj.dispose(); }
    cm = cm || (sp.cm[0] + sp.cm[1]) / 2;
    const obj = createFishObject(sp, cm);
    this.scene.add(obj.group);
    const fish = { sp, cm, obj, x: 0, z: -10, y: -0.3, heading: 0, alive: true, hooked: true, isJunk: !!sp.junk };
    this.catchObj = fish;
    const g = weightG(sp, cm);
    this.pendingInfo = { sp, cm, g, depth: 0.8, bait: this.bait, isNew: true, isRecord: false, entry: { best: cm, count: 1 } };
    const cam = this.camera;
    const from = cam.position.clone()
      .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), 0.35)
      .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), -0.5)
      .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), 0.7);
    obj.group.position.copy(from);
    obj.group.rotation.set(0, 0, Math.PI / 2);
    this.state = ST.SHOW;
    this.enterShow(fish, from, obj.group.quaternion);
  }

  // ---------------------------------------------------------------- 更新
  update(dt) {
    this.time += dt;
    this.stateT += dt;
    const player = this.player;
    const eye = this._eye.copy(player.eye);
    const lock = this.inputLocked || (this.boat && this.boat.busy);
    const pressed = lock ? false : player.consumePressed();
    const released = lock ? false : player.consumeReleased();
    if (lock) { player.pressed = false; player.released = false; }
    const held = player.hold && !lock;
    // おじいさんに話しかけたあと、視線を彼のほうへむけ、しばらくして元の画角にもどす
    if (this.lookTo) {
      const L = this.lookTo;
      L.t += dt;
      if (L.t < 2.4) { player.baseYaw = damp(player.baseYaw, L.yaw, 4, dt); player.basePitch = damp(player.basePitch, L.pitch, 4, dt); }
      if (L.t > 7) { player.targetFov = L.fov; this.lookTo = null; }
    }

    switch (this.state) {
      case ST.IDLE: this.updateIdle(dt, pressed); break;
      case ST.CHARGE: this.updateCharge(dt, released, held); break;
      case ST.CAST: this.updateCast(dt); break;
      case ST.FLOAT: this.updateFloat(dt, pressed); break;
      case ST.BITE: this.updateBite(dt, pressed); break;
      case ST.FIGHT: this.updateFight(dt, held); break;
      case ST.LAND: this.updateLand(dt); break;
      case ST.SHOW: this.updateShow(dt, pressed); break;
      case ST.RETRIEVE: this.updateRetrieve(dt); break;
    }

    // ヒットから取り込みまでは、画面の表示を最小限に
    const fighting = this.state === ST.FIGHT || this.state === ST.LAND;
    if (fighting !== this._fighting) { this._fighting = fighting; this.ui.setFighting(fighting); }
    if (this.state !== ST.FIGHT && player.follow) player.follow = null;
    if (player.home) {
      const st = this.state;
      player.returning = st === ST.IDLE;
      if (st !== ST.IDLE && st !== ST.FIGHT && st !== ST.LAND && st !== ST.SHOW) player.home = null;
    }

    this.updateZoom();
    // はじめて遠くに投げたら、拡大のしかたを一度だけ教える
    if (!this.zoomHinted && this.state === ST.FLOAT && this.stateT > 3 && !this.save.setting('zoomHint')) {
      const e0 = this.player.eye;
      if (Math.hypot(this.bobPos.x - e0.x, this.bobPos.z - e0.z) >= 12) {
        this.zoomHinted = true;
        this.save.setting('zoomHint', 1);
        this.ui.toast(L('遠いウキは、ウキのまわりの輪をタップ（Zキー）で拡大できます', 'Tap the ring around a distant bobber (Z key) to zoom in'), 'info', 3600);
      }
    }
    if (!this.ledHinted && this.state === ST.FLOAT && this.stateT > 2 && this.atm.night > 0.5 && !this.save.setting('ledHint')) {
      this.ledHinted = true;
      this.save.setting('ledHint', 1);
      this.ui.toast(L('夜は、ウキの先が光ります（電気ウキ）', 'At night the bobber tip glows (electric bobber)'), 'info', 3600);
    }
    this.updateRodAndLine(dt);
    this.updateLureDepth(dt);
    this.updateCue(dt);
    this.updateDepthView(dt);
    this.sim.update(dt, { lure: this.lure, hour: this.atm.hour, rain: this.atm.rain, overcast: this.atm.overcast, thunder: this.atm.thunder, luck: this.luck() });
    // 水面のウキのまわりに小さな波紋
    if (this.state === ST.FLOAT || this.state === ST.BITE) {
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 1.3 + Math.random() * 0.8;
        this.water.addRipple(this.bobPos.x, this.bobPos.z, 0.1);
      }
    }
    this.ui.updateBobberMarker(this.bobber.group.visible && this.state !== ST.SHOW ? this.bobber.group.position : null);
  }

  // ---------------------------------------------------------------- IDLE
  updateIdle(dt, pressed) {
    this.lure.active = false;
    if (pressed) {
      this.setState(ST.CHARGE);
      this.power = 0;
      this.audio.windup();
      this.ring.visible = true;
    }
    const h = this.hintFor();
    this.ui.setHint(h);
  }

  hintFor() {
    if (this.boat && this.boat.busy) return L('ボートをこいでいます…', 'Rowing…');
    if (this.ui.isTouch) return L('ボタンを押し続けて、はなして投げる', 'Hold the button, release to cast');
    return L('押し続けて、はなして投げる　／　ホイールでズーム', 'Hold, then release to cast  /  wheel to zoom');
  }

  // ---------------------------------------------------------------- CHARGE
  updateCharge(dt, released, held) {
    this.power = Math.min(1, this.power + dt / this.cfg.cast.charge);
    this.ui.setPower(this.power);
    this.ui.setHint(L('はなして投げる！', 'Release to cast!'));
    // 予想着水点
    const tgt = this.computeLanding(this.power, this.player.yaw);
    this.ring.position.set(tgt.x, 0.02, tgt.z);
    const r = 0.35 + tgt.d * 0.03;
    this.ring.scale.set(r, 1, r);
    this.ring.material.opacity = 0.22 + 0.16 * Math.sin(this.time * 6) + this.power * 0.2;
    this.aimTarget = tgt;
    this.ui.setWater(waterDepthAt(tgt.x, tgt.z));
    if (released || !held) {
      this.ring.visible = false;
      this.ui.setPower(null);
      if (this.power < 0.08) { this.setState(ST.IDLE); return; }
      this.startCast(tgt);
    }
  }

  computeLanding(power, yaw) {
    const e = this.player.eye;
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    const cc = this.cfg.cast;
    let D = cc.min + (cc.max - cc.min) * Math.pow(power, 1.1);
    let lastWater = 0;
    for (let d = 1; d <= 60; d += 0.5) {
      const x = e.x + dx * d, z = e.z + dz * d;
      if (pondSigned(x, z) < -1.5 && waterDepthAt(x, z) > 0.25) lastWater = d; else break;
    }
    const maxD = Math.max(cc.minWater, lastWater - 0.8);
    D = Math.min(D, maxD);
    // 少しだけばらつかせる
    const jitter = 1 + (Math.random() - 0.5) * 0.04;
    return { x: e.x + dx * D, z: e.z + dz * D, d: D, dx, dz };
  }

  startCast(tgt) {
    const tip = this.rod.tip.clone();
    const D = tgt.d;
    const tau = this.cfg.cast.flight0 + D * this.cfg.cast.flightK;
    this.cast = {
      t: 0, tau, start: tip, end: new THREE.Vector3(tgt.x + (Math.random() - 0.5) * 0.3, 0, tgt.z + (Math.random() - 0.5) * 0.3),
      h: this.cfg.cast.h0 + D * this.cfg.cast.hK, power: this.power, D,
    };
    this.save.data.casts++;
    this.bobber.group.visible = true;
    this.bobber.group.position.copy(tip);
    this.audio.cast(this.power);
    this.setState(ST.CAST);
    this.ui.setHint('');
  }

  // ---------------------------------------------------------------- CAST
  updateCast(dt) {
    const c = this.cast;
    c.t += dt;
    const u = clamp(c.t / c.tau);
    const p = this.bobber.group.position;
    p.lerpVectors(c.start, c.end, u);
    p.y += 4 * c.h * u * (1 - u) * 0.9;
    // 飛んでいるウキは少し傾く
    this.bobber.group.rotation.z = -0.5 * (1 - u) + 0.1 * u;
    if (u >= 1) {
      p.copy(c.end);
      p.y = 0;
      this.bobber.group.rotation.set(0, 0, 0);
      this.landBobber(c);
    }
  }

  landBobber(c) {
    const p = this.bobber.group.position;
    this.bobPos.set(p.x, 0, p.z);
    const pw = (0.35 + c.power * 0.5) * this.cfg.splash;
    this.fx.splash(p.x, p.z, pw);
    this.audio.splash(pw, this.pan(p.x, p.z));
    // 雨の日は水面がざわついて、魚の警戒心がうすれる
    this.sim.scare(p.x, p.z, (3.2 + c.power * 2.5) * (0.5 + 0.5 * this.cfg.splash) * (1 - 0.3 * this.atm.rain));
    if (this.heron) this.heron.disturb(p.x, p.z, c.power);
    if (this.critters) this.critters.disturb(p.x, p.z, c.power);
    this.dipY = -0.1;
    this.dipTarget = 0;
    // エサは水面から、ウキ下(または底)までしずんでいく
    const floor = waterDepthAt(p.x, p.z);
    this.lure = { active: true, x: p.x, z: p.z, floor, depth: -0.1, bait: this.bait, attract: this.cfg.attract };
    this.cue = { noticed: false, depthHint: false, emptyHint: false };
    this.probeT = 2;
    this.layT = 0;
    this.ui.setWater(floor);
    if (!this.save.setting('tackleIntro')) {
      this.save.setting('tackleIntro', 1);
      setTimeout(() => this.ui.toast(this.ui.isTouch ? L(`水深 ${floor.toFixed(1)}m ／ ウキ下 ${this.tackle.toFixed(1)}m　右の目盛りで深さを変えられます`, `Water ${floor.toFixed(1)} m / bait depth ${this.tackle.toFixed(1)} m · change it with the scale on the right`) : L(`水深 ${floor.toFixed(1)}m ／ ウキ下 ${this.tackle.toFixed(1)}m　右の目盛り（[ ] キー）で深さを変えられます`, `Water ${floor.toFixed(1)} m / bait depth ${this.tackle.toFixed(1)} m · change it with the scale on the right ([ ] keys)`), 'info', 5200), 1800);
    }
    this.biteFish = null;
    this.waitT = 0;
    this.setState(ST.FLOAT);
    this.lastLandX = p.x; this.lastLandZ = p.z;
  }

  // ---------------------------------------------------------------- FLOAT
  updateFloat(dt, pressed) {
    this.waitT += dt;
    this.updateBobberBob(dt);
    this.ui.setHint(this.waitT < 3 ? L('ウキをじっと見守ろう…', 'Watch the bobber…') : L('ウキが沈んだら、すぐクリック！（クリックで巻き上げ）', 'Click as soon as the bobber sinks! (click to reel in)'));
    if (pressed) {
      this.startRetrieve();
    }
  }

  updateBobberBob(dt) {
    // ばねで追従
    let target = this.dipTarget;
    let ox = 0, oz = 0, shk = 0;
    if (this.twitch) {
      const tw = this.twitch;
      tw.t += dt;
      const u = tw.t / tw.dur;
      if (u >= 1) this.twitch = null;
      else {
        const s = Math.sin(Math.PI * u);
        target += tw.amp * s * (1 - 0.3 * u);
        ox = (tw.dx || 0) * s; oz = (tw.dz || 0) * s; shk = (tw.shake || 0) * s;
      }
    }
    // 本アタリ: 魚ごとの沈みかた（食い上げ・横走り・震え）
    const be = this.state === ST.BITE ? this.biteEnd : null;
    if (be) {
      this.biteT += dt;
      target = be.lift != null && this.biteT < (be.liftT || 0.4) ? be.lift : be.sink;
      const k = 1 - Math.exp(-this.biteT * 1.5), d = be.drift || 0;
      ox += d * k * this.biteDir.x; oz += d * k * this.biteDir.z;
      shk += (be.shake || 0) * Math.min(1, this.biteT * 3);
    }
    this.dipY = damp(this.dipY, target, be ? be.rate : 14, dt);
    // 海では、本当の波に乗って上下・前後にゆれる。沼では、かすかなさざ波だけ
    const sea = this.seaBob(this.bobPos.x, this.bobPos.z, dt);
    const bob = sea.on ? 0 : Math.sin(this.time * 1.7 + this.bobPos.x) * 0.006 + Math.sin(this.time * 2.9) * 0.003;
    const p = this.bobber.group.position;
    p.set(this.bobPos.x + ox + sea.x, this.dipY + bob + sea.y + (shk ? Math.sin(this.time * 70) * shk : 0), this.bobPos.z + oz + sea.z);
    // 風でわずかにゆらぐ（海では、波の斜面にあわせても傾く）
    this.bobber.group.rotation.set(Math.sin(this.time * 0.9) * 0.05 + 0.25 * this.layT + sea.rx, 0, Math.cos(this.time * 0.7) * 0.05 + 0.62 * this.layT + sea.rz + (shk ? Math.sin(this.time * 63) * shk * 6 : 0));
  }

  // 水面に浮かぶうきが、海の波でどう動くか（静かなときの位置 x, z）。沼ではすべて 0
  seaBob(x, z, dt) {
    const s = this._sea || (this._sea = { on: false, x: 0, y: 0, z: 0, rx: 0, rz: 0 });
    const w = this.water.waveAt ? this.water.waveAt(x, z) : null;
    if (!w) { s.on = false; s.x = s.y = s.z = s.rx = s.rz = 0; return s; }
    s.on = true; s.x = w.x; s.y = w.y; s.z = w.z;
    // 下におもりがあるので、水面の傾きよりひかえめに、少しおくれて傾く
    const k = 1 - Math.exp(-5 * dt);
    s.rx += (clamp(-Math.atan(w.sz) * 0.7, -0.45, 0.45) - s.rx) * k;
    s.rz += (clamp(Math.atan(w.sx) * 0.7, -0.45, 0.45) - s.rz) * k;
    return s;
  }

  // 端末の振動（対応する端末だけ。「動きをおさえる」のときは使わない）
  vibrate(pattern) {
    if (!this.vibOn || (this.player && this.player.reduce)) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  // フックの先でつつかれた（魚ごとの「アタリの癖」でウキが動く）
  onNibble(f, last) {
    this.cue.noticed = true;
    if (this.state !== ST.FLOAT) return;
    const st = ((f.sp.bite || DEFAULT_BITE).tick);
    const up = Math.random() < st.up;
    const a = Math.random() * TAU, d = st.drift || 0;
    const amp = up ? Math.abs(st.amp) * 0.9 : -Math.abs(st.amp) * (0.8 + Math.random() * 0.4);
    this.twitch = { t: 0, dur: st.dur * (up ? 1.25 : 1), amp, shake: st.shake || 0, dx: Math.cos(a) * d, dz: Math.sin(a) * d };
    this.audio.nibble(st.snd || 'tick');
    this.vibrate(st.vib || 10);
    this.water.addRipple(this.bobPos.x, this.bobPos.z, 0.16 + Math.min(0.2, Math.abs(st.amp) * 2));
  }

  onBite(f) {
    if (this.state !== ST.FLOAT) { f.state = 'flee'; f.t = 2; return; }
    const be = (f.sp.bite || DEFAULT_BITE).end;
    this.biteFish = f;
    this.biteEnd = be; this.biteT = 0;
    const a = Math.random() * TAU; this.biteDir = { x: Math.cos(a), z: Math.sin(a) };
    this.dipTarget = be.sink;
    this.twitch = null;
    this.setState(ST.BITE);
    this.audio.bite(be.snd || 'sink');
    this.vibrate([30, 30, 60]);
    this.water.addRipple(this.bobPos.x, this.bobPos.z, be.ripple || 0.6);
    this.fx.splash(this.bobPos.x, this.bobPos.z, be.splash || 0.18);
    this.ui.toast(L('ウキが沈んだ！　いまだ！', 'The bobber sank! Now!'), 'big', 1300);
    this.ui.flashBite();
  }

  onSpit(f) {
    if (this.state === ST.BITE && this.biteFish === f) {
      this.biteFish = null;
      this.dipTarget = 0;
      this.dipY = -0.1;
      this.setState(ST.FLOAT);
      this.ui.toast(L('逃げられた… もう少し早く！', 'It got away… a little quicker!'), 'warn', 1800);
    }
  }

  // ---------------------------------------------------------------- BITE
  updateBite(dt, pressed) {
    this.updateBobberBob(dt);
    this.ui.setHint(L('いまだ！クリック！', 'Now! Click!'));
    if (!this.biteFish || !this.biteFish.alive) { this.dipTarget = 0; this.setState(ST.FLOAT); return; }
    if (pressed) this.hookSet();
  }

  hookSet() {
    const f = this.biteFish;
    if (!f) return;
    this.audio.hook();
    this.vibrate(50);
    this.player.shake = 0.5;
    this.startFight(f);
  }

  // ---------------------------------------------------------------- FIGHT
  startFight(f) {
    // ごくまれに長靴
    let fish = f;
    let junk = null;
    if (!f.sp.legend && Math.random() < 0.035) {
      const sp = SPECIES.boot;
      const cm = rollLength(sp, Math.random);
      junk = { sp, cm, obj: createFishObject(sp, cm), x: f.x, z: f.z, y: -0.3, heading: f.heading, speed: 0, alive: true, hooked: true, isJunk: true };
      this.sim.group.add(junk.obj.group);
      f.state = 'flee'; f.t = 3; f.cool = 20; f.fleeFrom = { x: f.x, z: f.z };
      fish = junk;
    } else {
      f.hooked = true;
      f.state = 'hooked';
    }
    this.hookDepth = Math.max(0.1, -this.lure.depth);
    this.lure.active = false;
    const e = this.player.eye;
    const dx = fish.x - e.x, dz = fish.z - e.z;
    const sp = fish.sp;
    this.fight = {
      f: fish, sp,
      dist: Math.hypot(dx, dz), ang: Math.atan2(dx, -dz),
      tension: 0.3, stamina: 1, running: true, runT: rand(1.0, 1.8), runPow: clamp(sp.strength * 0.9 + 0.1), runDir: Math.random() < 0.5 ? -1 : 1,
      highT: 0, t: 0, thrashT: 1.5, rodShake: 0, rippleT: 0,
      hint: 0, skipFirst: true,
    };
    this.tension = 0.3;
    this.setState(ST.FIGHT);
    this.dipTarget = -0.18;
    this.ui.setTension(0.3);
    this.ui.toast(sp.junk ? L('なにか重いぞ…！', 'Something heavy…!') : L('かかった！', 'Fish on!'), 'big', 1000);
    this.audio.thrash(this.pan(fish.x, fish.z));
    // 視線は、ヒットのまえの向きを覚えておく（終わったら戻る）
    if (this.player.follows) this.player.home = { yaw: this.player.baseYaw, pitch: this.player.basePitch };
    this.player.kick(-9, -0.05);
  }

  updateFight(dt, held) {
    const F = this.fight;
    const sp = F.sp;
    const fish = F.f;
    F.t += dt;
    const reeling = held;
    // ---- 引きの波
    F.runT -= dt;
    if (F.runT <= 0) {
      if (F.running) {
        F.running = false;
        F.runT = rand(0.7, 2.0) / (0.45 + sp.strength * 0.8);
      } else {
        F.running = true;
        F.runT = rand(0.7, 1.9);
        F.runPow = clamp(sp.strength * rand(0.6, 1.15) * (0.35 + 0.65 * F.stamina) + 0.05, 0.03, 1);
        F.runDir = Math.random() < 0.5 ? -1 : 1;
        if (sp.strength > 0.2) this.audio.thrash(this.pan(fish.x, fish.z));
        if (sp.strength > 0.5) this.vibrate(25);
      }
    }
    const calm = 0.1 * sp.strength * (0.3 + 0.7 * F.stamina);
    const pull = Math.min(1, (F.running ? F.runPow : calm) * this.cfg.pullK);

    // ---- 張力
    const target = 0.1 + pull * 0.64 + (reeling ? 0.28 + 0.12 * pull : 0) + (F.atCap ? 0.12 + 0.2 * pull : 0);
    F.tension = damp(F.tension, target, 6, dt) + (noise2(this.time * 5, 3.3) * 0.012);
    F.tension = clamp(F.tension, 0, 1.15);
    this.tension = F.tension;
    this.ui.setTension(F.tension);

    // ---- 距離
    if (reeling && F.tension < 0.97) {
      const spd = (2.4 - 0.9 * F.stamina * sp.strength) * (1 - 0.8 * pull) * this.cfg.reelSpeedK;
      F.dist -= Math.max(0.05, spd) * dt;
      F.stamina -= (0.045 + 0.06 * pull) * dt * this.cfg.staminaK / Math.max(0.15, sp.stamina) * (F.tension > 0.35 ? 1 : 0.5);
      this.rod.spinReel(dt * 24);
    } else {
      F.dist += pull * 2.4 * dt * (reeling ? 0.3 : 1);
      F.stamina -= 0.01 * dt / Math.max(0.15, sp.stamina);
    }
    F.stamina = clamp(F.stamina, 0, 1);
    // 走る方向へ円弧を描く
    F.ang += F.runDir * (F.running ? 0.28 * F.runPow : 0.04) * dt;
    F.atCap = F.dist > this.cfg.maxDist;
    F.dist = clamp(F.dist, 1.2, Math.min(40, this.cfg.maxDist));

    // 沼の外に出ないように
    const e = this.player.eye;
    const nx = e.x + Math.sin(F.ang) * F.dist, nz = e.z - Math.cos(F.ang) * F.dist;
    if (pondSigned(nx, nz) > -1.0 || waterDepthAt(nx, nz) < 0.2) {
      F.ang -= F.runDir * 0.9 * dt * 2;
      F.runDir *= -1;
      F.dist = Math.max(1.5, F.dist - 3 * dt);
    }
    fish.x = e.x + Math.sin(F.ang) * F.dist;
    fish.z = e.z - Math.cos(F.ang) * F.dist;
    const sx = fish.x - e.x, sz = fish.z - e.z;
    fish.heading = Math.atan2(sz, sx) + Math.sin(this.time * 6) * 0.3 * (F.running ? 1 : 0.4);
    fish.speed = 0.5 + pull * 1.5;

    // ---- 失敗判定
    if (F.tension >= 1.0) F.highT += dt; else F.highT = Math.max(0, F.highT - dt * 2);
    if (F.highT > 0.28) { this.lineBreak(); return; }

    // ---- 水面での暴れ
    F.thrashT -= dt;
    const shallow = F.dist < 6;
    if (F.thrashT <= 0) {
      F.thrashT = rand(0.9, 2.3) * (1.4 - F.stamina * 0.6);
      if (F.running && (shallow || Math.random() < 0.35) && sp.strength > 0.15) {
        this.fx.splash(fish.x, fish.z, 0.35 + sp.strength * 0.5);
        this.audio.splash(0.35 + sp.strength * 0.4, this.pan(fish.x, fish.z));
        F.surface = 0.45;
      }
    }
    F.surface = Math.max(0, (F.surface || 0) - dt);
    const depthNow = lerp(-0.1, -0.5, F.stamina);
    fish.y = damp(fish.y ?? -0.3, F.surface > 0 ? 0.05 : depthNow, 8, dt);
    fish.pitch = F.surface > 0 ? 0.5 * Math.sin(F.surface * 20) : 0;

    // ---- 波紋
    F.rippleT -= dt;
    if (F.rippleT <= 0) {
      F.rippleT = 0.18;
      this.water.addRipple(fish.x, fish.z, 0.12 + pull * 0.35);
    }

    // ---- ウキは魚の少し手前
    const bx = fish.x - Math.sin(F.ang) * 0.3, bz = fish.z + Math.cos(F.ang) * 0.3;
    this.bobPos.set(bx, 0, bz);
    this.dipTarget = F.running ? -0.22 : -0.1;
    this.dipY = damp(this.dipY, this.dipTarget, 8, dt);
    const sea = this.seaBob(bx, bz, dt);
    this.bobber.group.position.set(bx + sea.x, this.dipY + sea.y, bz + sea.z);
    this.bobber.group.rotation.set(Math.sin(this.time * 5) * 0.2 * pull + sea.rx, 0, 0.3 * pull + sea.rz);

    // ---- 音
    if (reeling && F.tension < 0.97) {
      this.reelTickT -= dt;
      if (this.reelTickT <= 0) { this.reelTickT = 0.075; if (this.cfg.reel) this.audio.reelTick(F.tension); }
    }
    this.creakT -= dt;
    if (this.creakT <= 0 && F.tension > 0.7) { this.creakT = 0.5; this.audio.creak(F.tension); }

    this.sim.place(fish, dt);

    // ---- 視点: 魚のほうへ。遠いうちはほぼ水平、寄るほど水面を見下ろす。走る向きへ、ほんの少しかたむく
    const fo = (this.followTo ||= { yaw: 0, pitch: 0, roll: 0, zoom: 0 });
    fo.yaw = -F.ang;
    fo.pitch = Math.max(-0.24, Math.atan2((fish.y ?? -0.3) - e.y, Math.max(F.dist, 1.5)) * 0.7);
    fo.roll = -F.runDir * (F.running ? F.runPow : 0) * 0.045;
    fo.zoom = -10 * clamp((F.dist - 8) / 16);
    this.player.follow = fo;

    // ---- ヒント
    const warn = F.tension > 0.82;
    this.ui.setHint(warn ? L('はなして！糸が切れそう！', 'Let go! The line is about to snap!') : reeling ? this.cfg.fightHint : (F.tension < 0.3 ? this.cfg.reelHint : L('ゲージが赤いときははなす', 'Let go when the gauge is red')));

    // ---- 取り込み
    if (F.dist <= this.cfg.landDist) {
      if (F.stamina < 0.55 || sp.strength < 0.2) {
        this.startLand();
      } else if (F.running === false) {
        // まだ元気: ひと走り
        F.running = true; F.runT = rand(0.8, 1.4); F.runPow = clamp(sp.strength * 0.8 + 0.1);
        F.dist = Math.min(this.cfg.maxDist, F.dist + 1.2);
        this.ui.toast(L('まだ元気だ！', 'Still full of fight!'), 'info', 900);
      }
    }
  }

  lineBreak() {
    const F = this.fight;
    this.audio.snap();
    this.player.shake = 0.8;
    this.ui.toast(L('糸が切れた！…', 'The line snapped!…'), 'warn', 2200);
    this.releaseFish(F.f, true);
    this.ui.setTension(null);
    this.fight = null;
    this.endToIdle();
  }

  // ---------------------------------------------------------------- LAND
  startLand() {
    const F = this.fight;
    const fish = F.f;
    this.setState(ST.LAND);
    this.land = { t: 0, from: new THREE.Vector3(fish.x, fish.y ?? -0.2, fish.z) };
    this.ui.setTension(null);
    this.ui.setHint('');
    this.audio.splash(0.5, this.pan(fish.x, fish.z));
    this.fx.splash(fish.x, fish.z, 0.6);
    this.catchObj = fish;
    // 記録
    const sp = fish.sp;
    const g = weightG(sp, fish.cm);
    const depth = this.hookDepth || -this.lure.depth;
    const rec = this.save.record(sp.id, fish.cm, g, sp.junk ? null : depth, sp.junk ? null : SEASON_ID);
    this.pendingInfo = { sp, cm: fish.cm, g, depth, bait: this.bait, ...rec };
  }

  updateLand(dt) {
    const L = this.land;
    L.t += dt;
    const u = clamp(L.t / 1.1);
    const f = this.catchObj;
    const tip = this.rod.tip;
    const hang = this._v.set(tip.x, tip.y - 0.55, tip.z);
    const p = this._v2.lerpVectors(L.from, hang, easeInOut(u));
    p.y += Math.sin(u * Math.PI) * 0.5;
    f.obj.group.position.copy(p);
    f.obj.group.rotation.set(0, -f.heading + Math.sin(L.t * 9) * 0.3, Math.PI * 0.5 * easeInOut(u) + Math.sin(L.t * 14) * 0.15 * (1 - u));
    f.obj.group.rotation.order = 'YZX';
    if (f.obj.wig) { f.obj.wig.uWigAmp.value = 0.12; f.obj.wig.uWigFreq.value = 18; }
    this.bobPos.set(p.x, p.y + 0.3, p.z);
    this.bobber.group.position.copy(this.bobPos);
    if (Math.random() < dt * 14 && u > 0.1) this.fx.drops.push({ x: p.x, y: p.y, z: p.z, vx: rand(-0.2, 0.2), vy: 0, vz: rand(-0.2, 0.2), size: 0.015, life: 1.5 });
    if (u >= 1) {
      this.setState(ST.SHOW);
      this.enterShow(f, f.obj.group.position, f.obj.group.quaternion);
    }
  }

  // 手にのせて見せる演出のはじまり（糸の先でぶらさがっていた位置から）
  enterShow(fish, pos, quat) {
    this.showT = 0;
    this.bobber.group.visible = false;
    this.fovBefore = this.fovBefore ?? this.player.targetFov;
    this.cardPending = true;
    this.ui.setShowing(true);
    this.showcase.begin(fish, pos, quat);
  }

  // カードの表示（魚が手にのるころ）
  revealCard() {
    this.cardPending = false;
    const info = this.pendingInfo;
    this.ui.showCatch(info, this.sp_isJunk(info.sp));
    this.audio.catchJingle(info.sp.junk ? 1 : info.sp.rarity + (info.isNew ? 1 : 0));
    this.achievements(info);
  }

  sp_isJunk(sp) { return !!sp.junk; }

  // 今日のお題の進みぐあい
  dailyRecord(info) {
    const d = this.daily;
    if (!d) return;
    d.refresh();
    const before = d.list.map((c, i) => d.progress(i));
    const fin = d.record({ id: info.sp.id, cm: info.cm, depth: info.depth, bait: info.bait, junk: !!info.sp.junk });
    this.ui.setQuest();
    if (info.sp.junk) return;
    const msgs = [];
    d.list.forEach((c, i) => {
      const p = d.progress(i);
      if (fin.includes(i)) return;
      if (p > before[i] && c.goal > 1) msgs.push(L(`${c.label}　${p} / ${c.goal}`, `${c.label} · ${p} / ${c.goal}`));
    });
    if (msgs.length) setTimeout(() => this.ui.toast(msgs[0], 'info', 2200), 1200);
    if (fin.length) {
      const all = d.list.every((c, i) => d.isDone(i));
      setTimeout(() => {
        this.ui.toast(all ? L('今日のお題 すべて達成！', 'All of today\'s tasks done!') : L(`${d.list[fin[0]].label}達成！　印がついた`, `${d.list[fin[0]].label} done! You earned a stamp`), 'big', 3400);
        this.audio.catchJingle(3);
      }, 1500);
    }
  }

  achievements(info) {
    const sv = this.save;
    this.dailyRecord(info);
    if (!info.sp.junk && sv.achieve('first')) this.ui.toast(L('はじめての一匹！', 'Your first fish!'), 'big', 2400);
    const n = sv.speciesCaught();
    if (n >= 5 && sv.achieve('five')) this.ui.toast(L('図鑑 5種達成！', '5 species in your field guide!'), 'big', 2400);
    const base = SPECIES_ORDER.filter((id) => !SPECIES[id].junk && !SPECIES[id].legend && !isSeasonal(SPECIES[id]));
    const got = (id) => sv.data.catches[id] && sv.data.catches[id].count > 0;
    if (base.every(got) && sv.achieve('all')) this.ui.toast(PLACE.allToast, 'big', 3500);
    const seasonal = SPECIES_ORDER.filter((id) => isSeasonal(SPECIES[id]));
    if (seasonal.length && seasonal.every(got) && sv.achieve('seasons')) this.ui.toast(L('四季の魚をすべて釣った！　一年を味わった', 'You caught every seasonal fish! A full year of fishing'), 'big', 4000);
    if (info.sp.id === 'nishiki' && sv.achieve('nishiki')) this.ui.toast(L('錦鯉に出会えた。いいことありそう', 'You met an ornamental koi. Something good may happen'), 'big', 3500);
    if (info.sp.legend && sv.achieve('nushi')) this.ui.toast(PLACE.legendToast, 'big', 4200);
    if (info.sp.junk && sv.achieve('boot')) this.ui.toast(L(`${info.sp.name}を釣った…！`, `You caught… a ${info.sp.name}!`), 'big', 2400);
  }

  // ---------------------------------------------------------------- SHOW
  updateShow(dt) {
    this.showT += dt;
    const f = this.catchObj;
    const ev = this.showcase.update(dt, this.camera, this.ui.isNarrow);
    // 魚の大きさに合わせて画角を決める（小さな魚はぐっと寄る）
    this.player.targetFov = this.showcase.fovDeg;
    this.bobber.group.visible = false;
    if (ev.grab) {
      this.audio.grab(0);
      for (let i = 0; i < 8; i++) this.fx.drops.push({ x: f.obj.group.position.x, y: f.obj.group.position.y, z: f.obj.group.position.z, vx: rand(-0.35, 0.35), vy: rand(0.4, 1.0), vz: rand(-0.35, 0.35), size: 0.014, life: 1.6 });
    }
    if (ev.flop) this.audio.flop(0);
    for (const d of ev.drips) this.fx.drops.push({ x: d.x, y: d.y, z: d.z, vx: rand(-0.03, 0.03), vy: 0, vz: rand(-0.03, 0.03), size: 0.011, life: 1.8 });
    if (this.cardPending && this.showT > 0.45) this.revealCard();
    // 魚を美しく見せる照明
    this.showLight.position.copy(this.showcase.lightPos);
    this.showLight.intensity = damp(this.showLight.intensity, 5.5 * this.showcase.lightK, 5, dt);
  }

  finishCatch(choice) {
    if (this.state !== ST.SHOW) return;
    if (this.showT < 0.7) return;
    const info = this.pendingInfo;
    const f = this.catchObj;
    this.cardPending = false;
    this.ui.hideCatch();
    this.audio.uiTick();
    this.showcase.end();
    this.ui.setShowing(false);
    if (this.fovBefore != null) { this.player.targetFov = this.fovBefore; this.fovBefore = null; }
    const g = f.obj.group;
    g.scale.setScalar(1);
    g.rotation.set(0, 0, 0);
    if (f.isJunk) {
      // 長靴: 持ち帰る or 水に戻す
      this.sim.group.remove(g);
      if (choice === 'keep') this.ui.toast(PLACE.junkToast, 'info', 2200);
      else this.ui.toast(L('そっと元の場所に…', 'Gently put it back…'), 'info', 1500);
      this.audio.keepSound();
    } else if (choice === 'tank' && this.tank) {
      // 水槽へ（入らないときは、びくへ）
      const r = this.tank.add(f.sp.id, f.cm);
      if (!r.ok) this.keptList.push({ id: f.sp.id, cm: f.cm });
      this.sim.remove(f);
      this.ui.setKept(this.keptList.length);
      this.audio.keepSound();
      if (r.ok) this.ui.toast(L(`${f.sp.name} ${f.cm.toFixed(1)}cm を水槽に入れた。右下の「水槽を見る」（V）で見られます`, `Put the ${f.sp.name} (${f.cm.toFixed(1)} cm) in the tank. See it with “Aquarium” (V) at the bottom right`), 'info', 3200);
      else this.ui.toast(L(`${r.msg}。びくに入れた`, `${r.msg}. Kept it in your creel`), 'info', 2600);
      this.save.save();
    } else if (choice === 'keep') {
      this.save.data.kept++;
      this.keptList.push({ id: f.sp.id, cm: f.cm });
      this.sim.remove(f);
      this.ui.setKept(this.keptList.length);
      this.audio.keepSound();
      this.ui.toast(L(`${f.sp.name} ${f.cm.toFixed(1)}cm をびくに入れた`, `Kept the ${f.sp.name} (${f.cm.toFixed(1)} cm) in your creel`), 'info', 2000);
      this.save.save();
    } else {
      this.releaseFish(f, false);
      this.ui.toast(L(`${f.sp.name}を逃がした。また会おうね`, `Released the ${f.sp.name}. See you again`), 'info', 1800);
    }
    this.catchObj = null;
    this.fight = null;
    this.showLight.intensity = 0;
    this.endToIdle();
  }

  releaseFish(f, escaped) {
    // 水にもどして逃げ去る
    f.hooked = false;
    if (f.isJunk) { this.sim.group.remove(f.obj.group); return; }
    f.obj.group.scale.setScalar(1);
    const e = this.player.eye;
    if (!escaped) {
      f.x = e.x + Math.sin(this.fight.ang) * 3.5; f.z = e.z - Math.cos(this.fight.ang) * 3.5;
      if (pondSigned(f.x, f.z) > -1.5) { f.x = this.lastLandX; f.z = this.lastLandZ; }
    }
    f.y = -0.2;
    f.pitch = 0;
    f.state = 'flee';
    f.t = 4;
    f.fleeFrom = { x: e.x, z: e.z };
    f.cool = 25;
    f.speed = 1.0;
    this.fx.splash(f.x, f.z, 0.5);
    this.audio.splash(0.5, this.pan(f.x, f.z));
  }

  // ---------------------------------------------------------------- RETRIEVE
  startRetrieve() {
    this.sim.lureGone();
    this.lure.active = false;
    this.biteFish = null;
    this.retrieve = { speed: 4 };
    this.setState(ST.RETRIEVE);
    if (this.cfg.reel) this.audio.reelTick(1); else this.audio.splash(0.15, this.pan(this.bobPos.x, this.bobPos.z));
  }

  updateRetrieve(dt) {
    const e = this.player.eye;
    const p = this.bobPos;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    this.retrieve.speed = Math.min(9, this.retrieve.speed + dt * 6);
    const step = Math.min(d, this.retrieve.speed * dt);
    p.x += (dx / d) * step; p.z += (dz / d) * step;
    this.dipY = damp(this.dipY, 0, 10, dt);
    const sea = this.seaBob(p.x, p.z, dt);
    this.bobber.group.position.set(p.x + sea.x, this.dipY + 0.004 + sea.y, p.z + sea.z);
    this.bobber.group.rotation.set(0.2 + sea.rx, 0, 0.15 + sea.rz);
    this.reelTickT -= dt;
    if (this.reelTickT <= 0) { this.reelTickT = 0.06; if (this.cfg.reel) this.audio.reelTick(0.8); }
    this.rod.spinReel(dt * 30);
    if (Math.random() < dt * 8) this.water.addRipple(p.x, p.z, 0.14);
    if (d < 3.0 || pondSigned(p.x, p.z) > -0.8) {
      this.endToIdle();
    }
    this.ui.setHint(L('巻き上げ中…', 'Reeling in…'));
  }

  endToIdle() {
    this.setState(ST.IDLE);
    this.lure.active = false;
    this.biteFish = null;
    this.twitch = null;
    this.dipTarget = 0;
    this.dipY = 0;
    this.ui.setTension(null);
    this.ui.setPower(null);
    this.ui.setWater(null);
    this.ring.visible = false;
    this.bobber.group.rotation.set(0, 0, 0);
    this.layT = 0;
    this.pose.bend = 0.05;
  }

  // ---------------------------------------------------------------- 竿と糸
  updateRodAndLine(dt) {
    const rod = this.rod, line = this.line, bobber = this.bobber, pl = this.player;
    const pose = this.pose;
    const st = this.state;
    const tipNow = rod.tip;
    const P = this.cfg.pose;
    let tPitch = P.idle, tYaw = 0.26, tBend = P.bendIdle;
    const bendTo = pose.bendTo;
    let rate = 8;
    const tension = this.fight ? this.fight.tension : 0;

    // ウキは手元ではふつうの大きさ、水に浮かべたら見やすい大きさに
    {
      const target = (st === ST.IDLE || st === ST.CHARGE) ? 1.0 : bobber.scale;
      bobber.group.scale.setScalar(damp(bobber.group.scale.x, target, 5, dt));
    }
    // 糸の先 (ウキの目)
    const eyeP = this._v.copy(bobber.group.position);
    eyeP.y += bobber.eyeY * bobber.group.scale.x;

    // ---- 竿の姿勢
    if (st === ST.IDLE) {
      this.idleSwing += dt;
      tPitch = P.idle + Math.sin(this.time * 0.6) * 0.012;
      tBend = P.bendIdle;
      bendTo.set(0, -1, 0);
      // ウキはぶら下がる
      bobber.group.visible = true;
      const sw = this.idleSwing;
      const hang = this._v2.set(tipNow.x + Math.sin(sw * 1.3) * 0.04, tipNow.y - (this.cfg.reel ? 0.95 : 1.5), tipNow.z + Math.cos(sw * 1.1) * 0.04);
      bobber.group.position.lerp(hang, 0.35);
      bobber.group.rotation.set(0, 0, Math.sin(sw * 1.7) * 0.15);
      eyeP.copy(bobber.group.position); eyeP.y += bobber.eyeY * bobber.group.scale.x;
    } else if (st === ST.CHARGE) {
      const k = easeInOut(clamp(this.stateT / 0.55));
      tPitch = lerp(P.idle, P.wind, k);
      tYaw = lerp(0.26, 0.18, k);
      tBend = lerp(P.bendIdle, P.bendWind, k) + Math.sin(this.time * 14) * 0.02 * this.power;
      bendTo.set(Math.sin(pl.yaw), -0.3, Math.cos(pl.yaw)).normalize();
      rate = 10;
      bobber.group.visible = true;
      const hang = this._v2.set(tipNow.x, tipNow.y - 0.9, tipNow.z);
      bobber.group.position.lerp(hang, 0.3);
      eyeP.copy(bobber.group.position); eyeP.y += bobber.eyeY * bobber.group.scale.x;
    } else if (st === ST.CAST) {
      const t = this.stateT;
      const k = clamp(t / 0.22);
      tPitch = lerp(P.wind, P.cast, easeInOut(k));
      tBend = 0.6 * (1 - k) * -1 + (t > 0.2 ? 0.3 * Math.exp(-(t - 0.2) * 6) : 0);
      bendTo.set(0, -1, 0);
      rate = 28;
    } else if (st === ST.FLOAT || st === ST.BITE) {
      tPitch = P.float + (st === ST.BITE ? 0.05 : 0);
      tBend = (st === ST.BITE ? P.bendBite : P.bendFloat) + Math.sin(this.time * 2.0) * 0.01;
      bendTo.copy(eyeP).sub(tipNow).normalize();
      rate = 6;
    } else if (st === ST.FIGHT) {
      tPitch = P.fightBase + P.fightGain * tension;
      tYaw = 0.2;
      tBend = P.bendFightBase + P.bendFightGain * tension;
      bendTo.copy(eyeP).sub(tipNow).normalize();
      rate = 9;
    } else if (st === ST.LAND || st === ST.SHOW) {
      tPitch = 0.85;
      tBend = 0.5;
      bendTo.set(0, -1, 0);
    } else if (st === ST.RETRIEVE) {
      tPitch = 0.5; tBend = 0.3;
      bendTo.copy(eyeP).sub(tipNow).normalize();
    }
    pose.pitch = damp(pose.pitch, tPitch, rate, dt);
    pose.yaw = damp(pose.yaw, tYaw, 8, dt);
    pose.bend = damp(pose.bend, tBend, st === ST.CAST ? 30 : 9, dt);
    // 魚を手にのせて見せている間は、竿を足もとへおろす
    this.rodDrop = damp(this.rodDrop, st === ST.SHOW ? 0.85 : 0, st === ST.SHOW ? 4 : 6, dt);
    const eyeR = this._eyeR.copy(pl.eye);
    eyeR.y -= this.rodDrop;
    rod.update(eyeR, pl.yaw, pl.pitch, { pitch: pose.pitch, yaw: pose.yaw, bend: pose.bend, bendTo }, this.time);
    // 見せている間は周辺を少し暗くして、魚と手に目がいくように
    if (this.post) {
      const vu = this.post.grade.uniforms.uVignette;
      vu.value = damp(vu.value, st === ST.SHOW ? 0.55 : 0.32, 3, dt);
    }

    // ---- 糸
    line.mesh.visible = true;
    const tip = rod.tip;
    if (st === ST.IDLE || st === ST.CHARGE) {
      line.build(tip, eyeP, 0.02, 0);
    } else if (st === ST.CAST) {
      const d = tip.distanceTo(eyeP);
      line.build(tip, eyeP, d * 0.05 + 0.1, 0);
    } else if (st === ST.FLOAT || st === ST.BITE) {
      const d = tip.distanceTo(eyeP);
      const settle = clamp(this.stateT / 1.6);
      line.build(tip, eyeP, Math.min(d * 0.07, 0.5) * (1.0 - 0.3 * settle) + 0.15, Math.min(d * 0.55, 10));
    } else if (st === ST.FIGHT) {
      const d = tip.distanceTo(eyeP);
      line.build(tip, eyeP, Math.pow(1 - clamp(tension), 2) * d * 0.06, 0);
    } else if (st === ST.LAND || st === ST.SHOW) {
      eyeP.copy(this.bobber.group.position);
      const f = this.catchObj;
      line.build(tip, f ? f.obj.group.position : eyeP, 0.02, 0);
      line.mesh.visible = st === ST.LAND;
    } else if (st === ST.RETRIEVE) {
      const d = tip.distanceTo(eyeP);
      line.build(tip, eyeP, Math.min(d * 0.08, 0.6), Math.min(d * 0.6, 8));
    }
    // 夜は電気ウキ（先端が光る）。夕方のうす暗いころから、少しずつともる
    {
      const n = this.atm.night;
      const k = clamp(n * 1.1 + smoothstep(4, -5, this.atm.sunElev) * 0.5);
      bobber.setNight(k, bobber.group.position.distanceTo(this.player.eye));
      bobber.glow.material.color.setRGB(2.4, 0.5, 0.15).multiplyScalar(1 + n * 3.5);
      bobber.body.material.emissive.setRGB(0.2, 0.03, 0.0).multiplyScalar(1 + n * 5);
    }
    // 魚を見せている間はウキを隠す
    bobber.group.visible = st !== ST.SHOW && (st !== ST.LAND);
  }
}
