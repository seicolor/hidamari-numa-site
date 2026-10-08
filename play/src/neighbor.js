// 隣の釣り人（おじいさん）: ときどき手前の岸（左うしろ）にやってきて、すわって釣りをする。
// 話しかけると、ヒントや昔話をしてくれる。
import * as THREE from 'three';
import { clamp, lerp, TAU, hexToLinear, damp } from './util.js';
import { terrainHeight, pondSigned } from './terrain.js';
import { patchMaterial } from './materials.js';
import { mergeGeos, colorFlat } from './geo.js';
import { SEASON_ID } from './season.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const lin = (h) => hexToLinear(h);
const easeInOut = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };

function ell(rx, ry, rz, x, y, z, color, rot = [0, 0, 0]) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.scale(rx, ry, rz);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(x, y, z);
  return colorFlat(g, lin(color));
}
function cyl(r0, r1, h, x, y, z, color, rot = [0, 0, 0], seg = 12) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(x, y, z);
  return colorFlat(g, lin(color));
}
const stdMat = (opts) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.85, ...opts }); patchMaterial(m, { underwater: true }); return m; };

// 季節ごとの服（春は若草の甚平、夏は水色、秋は紺の半纏、冬はえんじの綿入れと毛糸の帽子）
const CLOTHES = {
  spring: { coat: 0x4f7a62, knit: false },
  summer: { coat: 0x8fb0c8, knit: false },
  autumn: { coat: 0x2d3a5a, knit: false },
  winter: { coat: 0x6a2f2f, knit: true },
};

// 岸の道すじ: x ごとの、水ぎわから少し陸がわのz
function makePath() {
  const pts = [];
  for (let x = -34; x <= -4; x += 2) {
    let z0 = null;
    for (let z = 24; z >= 8; z -= 0.25) if (pondSigned(x, z) < 0) { z0 = z; break; }
    pts.push([x, (z0 === null ? 17.2 : z0) + 1.15]);
  }
  return (x) => {
    const f = clamp((x + 34) / 2, 0, pts.length - 1.001), i = Math.floor(f);
    return lerp(pts[i][1], pts[i + 1][1], f - i);
  };
}

function buildPerson() {
  const C = CLOTHES[SEASON_ID];
  const skin = 0xd9b08c, trou = 0x6b5b45, boot = 0x2a2620, white = 0xf1f0ea, wood = 0x8a6a40;
  const mat = stdMat({ vertexColors: true });
  const mk = (geos) => { const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = true; return m; };

  const root = new THREE.Group();
  const hips = new THREE.Group();
  root.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(mk([
    ell(0.18, 0.27, 0.115, 0, 0.27, 0, C.coat),
    ell(0.19, 0.1, 0.12, 0, 0.06, 0, C.coat),
    cyl(0.185, 0.19, 0.03, 0, 0.1, 0, 0xcfc8b0),                  // 帯
    ell(0.115, 0.045, 0.09, 0, 0.52, 0.01, 0xf2efe2),              // 首のてぬぐい
  ]));
  // 頭
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0);
  torso.add(head);
  const headGeos = [
    ell(0.105, 0.125, 0.10, 0, 0, 0, skin),
    ell(0.022, 0.028, 0.022, 0, -0.012, 0.098, 0xcf9f7c),         // 鼻
    ell(0.085, 0.065, 0.06, 0, -0.095, 0.05, white),              // あごひげ
    ell(0.02, 0.008, 0.012, 0.042, 0.04, 0.092, white), ell(0.02, 0.008, 0.012, -0.042, 0.04, 0.092, white),   // まゆ
    ell(0.011, 0.011, 0.008, 0.042, 0.018, 0.094, 0x1b1b1b), ell(0.011, 0.011, 0.008, -0.042, 0.018, 0.094, 0x1b1b1b),
    ell(0.018, 0.04, 0.02, 0.105, -0.005, 0.0, 0xcf9f7c), ell(0.018, 0.04, 0.02, -0.105, -0.005, 0.0, 0xcf9f7c), // 耳
  ];
  if (C.knit) {
    headGeos.push(ell(0.118, 0.1, 0.116, 0, 0.07, 0, 0x8a2a2a), cyl(0.12, 0.12, 0.03, 0, 0.03, 0, 0xe8e0cc), ell(0.03, 0.03, 0.03, 0, 0.17, 0, 0xe8e0cc));
  } else {
    headGeos.push(cyl(0.29, 0.31, 0.014, 0, 0.1, 0, 0xd8c07a, [0.04, 0, 0], 28), cyl(0.12, 0.14, 0.11, 0, 0.16, 0, 0xd8c07a), cyl(0.141, 0.143, 0.03, 0, 0.125, 0, 0xa83a2a));
  }
  head.add(mk(headGeos));
  // 腕: 肩 → ひじ → 手
  const arms = [1, -1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(0.2 * s, 0.46, 0);
    torso.add(sh);
    sh.add(mk([cyl(0.05, 0.045, 0.28, 0, -0.14, 0, C.coat)]));
    const el = new THREE.Group();
    el.position.set(0, -0.28, 0);
    sh.add(el);
    el.add(mk([cyl(0.045, 0.04, 0.26, 0, -0.13, 0, C.coat), ell(0.048, 0.05, 0.045, 0, -0.29, 0, skin)]));
    return { sh, el };
  });
  // 脚: 腰 → ひざ → 足
  const legs = [1, -1].map((s) => {
    const hp = new THREE.Group();
    hp.position.set(0.085 * s, 0, 0);
    hips.add(hp);
    hp.add(mk([cyl(0.075, 0.062, 0.42, 0, -0.21, 0, trou)]));
    const kn = new THREE.Group();
    kn.position.set(0, -0.42, 0);
    hp.add(kn);
    kn.add(mk([cyl(0.06, 0.05, 0.42, 0, -0.21, 0, trou), ell(0.06, 0.05, 0.11, 0, -0.45, 0.04, boot)]));
    return { hp, kn };
  });
  // 腰かけ・びく
  const stool = mk([cyl(0.17, 0.15, 0.04, 0, 0.4, 0, wood, [0, 0, 0], 16), cyl(0.02, 0.02, 0.4, 0.1, 0.2, 0.08, wood, [0.1, 0, 0.1]), cyl(0.02, 0.02, 0.4, -0.1, 0.2, 0.08, wood, [0.1, 0, -0.1]), cyl(0.02, 0.02, 0.4, 0, 0.2, -0.1, wood, [-0.1, 0, 0])]);
  root.add(stool);
  const bucket = mk([cyl(0.12, 0.09, 0.2, 0, 0.1, 0, 0xb89a64, [0, 0, 0], 12)]);
  root.add(bucket);
  // 竿（先へ細くなる）
  const rodGeo = new THREE.CylinderGeometry(0.0035, 0.012, 3.0, 6);
  rodGeo.rotateX(Math.PI / 2);        // +z 向き（先が +z）…下の位置合わせで、太いほうを手元に
  rodGeo.translate(0, 0, 1.5);
  const rod = new THREE.Mesh(rodGeo, stdMat({ color: 0x3b2a1a, roughness: 0.5 }));
  rod.castShadow = true;
  root.add(rod);
  // ウキ・糸・つれた魚
  const floatMesh = new THREE.Mesh(
    mergeGeos([ell(0.016, 0.04, 0.016, 0, 0.02, 0, 0xe2442a), ell(0.012, 0.025, 0.012, 0, -0.02, 0, 0xf4efe2)]),
    stdMat({ vertexColors: true, roughness: 0.4 })
  );
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.55 }));
  line.frustumCulled = false;
  const fish = new THREE.Mesh(mergeGeos([ell(0.07, 0.025, 0.016, 0, 0, 0, 0xc9d2d4), ell(0.02, 0.026, 0.004, -0.075, 0, 0, 0xb4bcbc)]), stdMat({ vertexColors: true, roughness: 0.35 }));
  fish.visible = false;
  return { root, hips, torso, head, arms, legs, stool, bucket, rod, floatMesh, line, fish };
}

// ---------------------------------------------------------------------------
const TIPS = [
  'ウキ下はな、魚によって好みがあるんじゃ。合うておらんと、気づいてもらえんぞ。',
  'ウキをよう見とると、だれが来たか分かってくる。ツン、ツンと来るのは、たいていフナじゃな。',
  'ぼーっとするのも、釣りのうちじゃよ。',
  '朝夕のまずめどきは、魚の機嫌がええ。',
  '雨の日は、魚の警戒がうすれるでな。ふだん会えん顔が出るかもしれんぞ。',
  '夜は電気ウキが光るじゃろう。あれは便利なもんじゃ。',
  'ウキがすーっと入ったら、すぐ合わせるんじゃ。もたもたしとると、吐き出されてしまう。',
  '大物は、焦って巻いたらいかん。ゲージが赤いときは、いったん休ませるんじゃ。',
  '桟橋の麦わら帽子な、あれはわしのじゃ。風で飛ばされてのう。',
];
const SEASON_TIPS = {
  spring: ['桜の頃はな、ヒブナという緋色のフナが出るんじゃ。', '春は魚も浮かれとる。タナゴもよう食うぞ。'],
  summer: ['夏の夜は、遠くで花火が上がることもある。ウナギは底ぎわをねらうのがコツじゃ。', '夏はザリガニとナマズじゃな。雷が鳴ったあとは、ナマズが動きだすぞ。'],
  autumn: ['秋はヘラブナの荒食いよ。グルテンを丸めて、ふわっと落としてやるんじゃ。', '紅葉を見ながらの釣りは、格別じゃのう。'],
  winter: ['雪の日は、ワカサギじゃ。深めに、グルテンでの。', '冬は魚も眠たそうでの。のんびり待つのが、ええんじゃ。'],
};
const NUSHI = 'この沼にはな、ぬしがおるそうじゃ。雨の夜に、ミミズを深ーく沈めてみい。';
const MUTTERS = ['ふぅ…ええ天気じゃ。', 'ほほう、今日は静かじゃのう。', 'ん？ 気のせいか…。', 'そろそろ、お茶にするかのう。', 'ええ風じゃ。'];

export class Neighbor {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks;
    this.P = buildPerson();
    this.path = makePath();
    this.seatX = -8.2;
    this.seat = new THREE.Vector3(this.seatX, terrainHeight(this.seatX, this.path(this.seatX)), this.path(this.seatX) + 0.2);
    // ウキの位置（水のうえ）
    this.floatPos = new THREE.Vector3(this.seatX - 0.8, 0, this.seat.z - 5.0);
    scene.add(this.P.root, this.P.floatMesh, this.P.line, this.P.fish);
    this.P.root.visible = this.P.floatMesh.visible = this.P.line.visible = false;
    this.state = 'away';
    this.wait = rnd(25, 50);
    this.t = 0;            // 状態の経過時間
    this.x = -34;
    this.heading = Math.PI / 2;
    this.walk = 0;
    this.sitDur = 0;
    this.announced = false;
    this.visits = 0;
    this.talkT = 0;        // 話しているあいだの時間
    this.strikeWait = rnd(18, 40);
    this.strike = null;
    this.muttered = rnd(50, 110);
    this.gave = false;
    this.lastLine = -1;
    this.offer = false;
    this.headY = 1.2;
  }

  get canTalk() { return this.state === 'sit' && this.talkT <= 0; }
  get present() { return this.state !== 'away'; }

  headPos(out = new THREE.Vector3()) { return out.copy(this.seat).add(new THREE.Vector3(0, 1.1, 0)); }

  _setOffer(on) {
    if (on === this.offer) return;
    this.offer = on;
    if (this.hooks.onTalkable) this.hooks.onTalkable(on);
  }

  // 話しかけられたとき。{ text, luck } を返す
  talk(ctx) {
    this.talkT = 6;
    let text;
    let luck = false;
    const first = !ctx.met;
    if (first) {
      text = 'おお、見かけん顔じゃのう。ここはええ沼じゃよ。ま、ゆっくりやんなされ。';
      luck = true;
    } else {
      const pool = [];
      TIPS.forEach((t) => pool.push({ w: 1, t }));
      (SEASON_TIPS[SEASON_ID] || []).forEach((t) => pool.push({ w: 1.6, t }));
      if (ctx.hint) pool.push({ w: 4, t: `${ctx.hint}` });
      if (!ctx.nushiCaught) pool.push({ w: 1.2, t: NUSHI });
      if (ctx.keptN > 0) pool.push({ w: 1.5, t: 'ほう、もう釣れとるのか。腕がええのう。' });
      let tot = 0; for (const p of pool) tot += p.w;
      let r = Math.random() * tot, pick = pool[0];
      for (const p of pool) { r -= p.w; if (r <= 0) { pick = p; break; } }
      text = pick.t;
      if (!this.gave && Math.random() < 0.5) luck = true;
    }
    if (luck) { this.gave = true; text += ' そうじゃ、おまじないをしてやろう。ほれ。'; }
    this.hooks.onTalked && this.hooks.onTalked({ first });
    return { text, luck, first };
  }

  // ---------------------------------------------------------------------------
  update(dt, time, ctx) {
    const P = this.P;
    // 昼から夕暮れまで（夜と、雨のひどい日はいない）
    const ok = ctx.started && ctx.sunElev > -3 && ctx.rain < 0.5;
    const bad = ctx.rain > 0.75 || ctx.sunElev < -7;
    this.t += dt;
    if (this.talkT > 0) this.talkT -= dt;

    switch (this.state) {
      case 'away':
        if (ok) { this.wait -= dt; if (this.wait <= 0) { this.state = 'arrive'; this.t = 0; this.x = -34; this.heading = Math.PI / 2; this.announced = false; this.visits++; this.gave = false; } }
        break;
      case 'arrive': {
        this.x += 1.2 * dt;
        this.walk += dt * 6.2;
        if (!this.announced && this.x > -17) { this.announced = true; this.hooks.onArrive && this.hooks.onArrive(this.visits === 1); }
        if (this.x >= this.seatX) { this.x = this.seatX; this.state = 'sitdown'; this.t = 0; }
        break;
      }
      case 'sitdown':
        this.heading = this._turn(this.heading, Math.PI, 3.2, dt);
        if (this.t > 1.4) { this.state = 'sit'; this.t = 0; this.sitDur = rnd(150, 300); this.strikeWait = rnd(14, 34); this.muttered = rnd(40, 90); }
        break;
      case 'sit': {
        if (this.t > this.sitDur || bad) { this.state = 'standup'; this.t = 0; this._setOffer(false); break; }
        this._setOffer(this.talkT <= 0);
        // 魚がかかる
        if (!this.strike) {
          this.strikeWait -= dt;
          if (this.strikeWait <= 0) { this.strike = { t: 0, caught: Math.random() < 0.7 }; this.strikeWait = rnd(35, 80); }
        }
        // ひとりごと（話しているとき・やりとり中は言わない）
        this.muttered -= dt;
        if (this.muttered <= 0) {
          this.muttered = rnd(80, 160);
          if (this.talkT <= 0 && ctx.state === 'float' && this.hooks.onMutter) this.hooks.onMutter(MUTTERS[Math.floor(Math.random() * MUTTERS.length)]);
        }
        break;
      }
      case 'standup':
        if (this.t > 1.2) { this.state = 'leave'; this.t = 0; this.heading = -Math.PI / 2; }
        break;
      case 'leave':
        this.x -= 1.25 * dt;
        this.walk += dt * 6.2;
        this.heading = this._turn(this.heading, -Math.PI / 2, 4, dt);
        if (this.x < -34) { this.state = 'away'; this.wait = rnd(150, 360); this.strike = null; this._setOffer(false); }
        break;
    }
    const vis = this.state !== 'away';
    P.root.visible = vis;
    P.floatMesh.visible = P.line.visible = vis && (this.state === 'sit' || this.state === 'sitdown');
    if (!vis) { P.fish.visible = false; return; }
    this._pose(dt, time, ctx);
  }

  _turn(cur, to, rate, dt) {
    let d = ((to - cur + Math.PI * 3) % TAU) - Math.PI;
    return cur + d * (1 - Math.exp(-rate * dt));
  }

  // ---- 姿勢・動き ----
  _pose(dt, time, ctx) {
    const P = this.P;
    const walking = this.state === 'arrive' || this.state === 'leave';
    const sitting = this.state === 'sit' || this.state === 'sitdown';
    const standing = this.state === 'standup';
    // 位置
    let px, pz;
    if (sitting || standing) { px = this.seat.x; pz = this.seat.z; } else { px = this.x; pz = this.path(this.x); }
    const gy = terrainHeight(px, pz);
    P.root.position.set(px, gy, pz);
    P.root.rotation.y = this.heading;
    // すわる度合い（0=立つ, 1=すわる）
    let sit = sitting ? (this.state === 'sit' ? 1 : easeInOut(this.t / 1.4)) : standing ? 1 - easeInOut(this.t / 1.2) : 0;
    P.stool.visible = sit > 0.01;
    P.bucket.visible = sit > 0.5;
    P.bucket.position.set(-0.5, 0, 0.05);
    P.rod.visible = sit > 0.5;
    // 腰の高さ
    const hipY = lerp(0.86, 0.46, sit);
    P.hips.position.y = hipY;
    const sw = walking ? Math.sin(this.walk) : 0;
    const bob = walking ? Math.abs(Math.cos(this.walk)) * 0.025 : Math.sin(time * 1.3) * 0.004;
    P.hips.position.y += bob;
    // 脚
    P.legs.forEach((l, i) => {
      const s = i === 0 ? 1 : -1;
      const swing = sw * 0.55 * s;
      l.hp.rotation.x = lerp(-swing, -1.45, sit);
      l.kn.rotation.x = lerp(Math.max(0, swing * 0.9 + 0.1) * (walking ? 1 : 0), 1.45, sit);
      l.hp.rotation.z = lerp(0, 0.05 * s, sit);
    });
    // 上半身（すわるときは、少し前かがみ）
    P.torso.rotation.x = lerp(0.04, 0.14, sit) + Math.sin(time * 1.3) * 0.01;
    P.torso.position.set(0, 0, 0);
    // 頭: 話しているときは、プレイヤーのほうへ向く
    const toEye = ctx.eye ? Math.atan2(ctx.eye.x - this.seat.x, ctx.eye.z - this.seat.z) : 0;   // 向き(z+が0)
    let want = 0;
    if (this.talkT > 0 && sitting) want = clamp(this._wrap(toEye - this.heading), -1.0, 1.0);
    else if (sitting) want = Math.sin(time * 0.37) * 0.22;
    P.head.rotation.y = damp(P.head.rotation.y, want, 4, dt);
    P.head.rotation.x = (this.talkT > 0 ? Math.sin(time * 5) * 0.06 : Math.sin(time * 0.9) * 0.02) + (this.strike ? 0.1 : 0);
    // 腕
    const R = P.arms[0], L = P.arms[1];   // 右手がウキ竿、左手はそえる
    const swingA = walking ? Math.sin(this.walk) * 0.5 : 0;
    // 竿のかまえ（すわり）
    let rodUp = 0;
    if (this.strike) {
      this.strike.t += dt;
      const t = this.strike.t;
      if (t < 0.35) rodUp = easeInOut(t / 0.35);
      else if (t < 2.2) rodUp = 1;
      else if (t < 3.0) rodUp = 1 - easeInOut((t - 2.2) / 0.8);
      if (t > 0.35 && !this.strike.hooked) { this.strike.hooked = true; if (this.hooks.onStrike) this.hooks.onStrike(this.floatPos.x, this.floatPos.z, this.strike.caught); }
      if (t > 3.0) this.strike = null;
    }
    const wave = this.talkT > 4.2 && sitting;   // はじめにちょっと手をあげる
    R.sh.rotation.x = lerp(-swingA, -1.0 - 0.45 * rodUp, sit);
    R.el.rotation.x = lerp(0.1, -0.7 - 0.2 * rodUp, sit);
    L.sh.rotation.x = lerp(swingA, wave ? -2.7 : -0.95, sit);
    L.el.rotation.x = lerp(0.1, wave ? -0.3 + Math.sin(time * 14) * 0.35 : -0.8, sit);
    L.sh.rotation.z = wave ? -0.2 : 0;
    // 竿: 手元から前上へ
    const base = new THREE.Vector3(0.2, 0.78, 0.34);
    P.rod.position.copy(base);
    P.rod.rotation.set(-(0.62 + 0.5 * rodUp) + Math.sin(time * 0.8) * 0.01, 0.06, 0);
    // 竿先・ウキ・糸（ワールド座標）
    P.root.updateMatrixWorld(true);
    const tipLocal = new THREE.Vector3(0, 0, 3.0).applyEuler(P.rod.rotation).add(base);
    const tip = P.root.localToWorld(tipLocal.clone());
    const fl = this.floatPos;
    const bobY = 0.012 + Math.sin(time * 1.9) * 0.004 - (this.strike && this.strike.t > 0.15 && this.strike.t < 0.5 ? 0.04 : 0);
    // 竿をあげたときは、ウキを引き寄せる
    const pull = this.strike ? easeInOut(clamp((this.strike.t - 0.3) / 0.5)) * (this.strike.t < 2.2 ? 1 : 1 - clamp((this.strike.t - 2.2) / 0.8)) : 0;
    const fx = lerp(fl.x, tip.x, pull * 0.7), fz = lerp(fl.z, tip.z, pull * 0.7);
    const fy = lerp(bobY, tip.y - 0.3, pull);
    P.floatMesh.position.set(fx, fy, fz);
    const pos = P.line.geometry.attributes.position;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, (tip.x + fx) / 2, Math.max(fy, (tip.y + fy) / 2 - 0.25), (tip.z + fz) / 2);
    pos.setXYZ(2, fx, fy + 0.03, fz);
    pos.needsUpdate = true;
    // 釣れた魚（竿の先にぶらさがる）
    const showFish = !!this.strike && this.strike.caught && this.strike.t > 0.9 && this.strike.t < 2.6;
    P.fish.visible = showFish;
    if (showFish) { P.fish.position.set(tip.x, tip.y - 0.55, tip.z); P.fish.rotation.set(0, this.heading + Math.PI / 2, Math.sin(time * 9) * 0.3); }
    this.headY = gy + hipY + 0.64 + 0.12;
  }

  _wrap(a) { return ((a + Math.PI * 3) % TAU) - Math.PI; }
}
