// 手こぎボート: 桟橋のわきにつないである。のりこんで、沖の深みや岸ぎわへこぎだせる（場所を選ぶと、こいで連れていってくれる）。
import { L } from './i18n.js';
import * as THREE from 'three';
import { clamp, lerp, TAU, hexToLinear } from './util.js';
import { pondSigned, waterDepthAt } from './terrain.js';
import { patchMaterial } from './materials.js';
import { PIER } from './props.js';

const lin = (h) => hexToLinear(h);
const easeInOut = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };

const EYE_H = 1.1;                 // ボートにすわったときの目の高さ（水面から）
const SEAT = new THREE.Vector3(0, 0, 0.15);   // ボート中心から見た、すわる位置（うしろ寄り）

function stdMat(opts) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, ...opts });
  patchMaterial(m, { underwater: true });
  return m;
}

// 船体: 船尾(u=0)から船首(u=1, +z)へ、断面はU字。ふなべりと船首が反る。
function buildHull() {
  const L = 3.3, W = 1.15, NX = 28, NY = 10;
  const pos = [], col = [], idx = [];
  const base = lin(0x8a6a44);   // [r, g, b]（線形）
  const wood = (shade) => [base[0] * shade, base[1] * shade, base[2] * shade];
  const rows = [];
  for (let i = 0; i <= NX; i++) {
    const u = i / NX;
    const w = (W / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u - 0.42) / 0.58, 2.2)), 0.7);
    const yg = 0.35 + 0.16 * Math.pow(u, 3.0);
    const yk = -0.15 + 0.10 * Math.pow(u, 3.5) + 0.02 * (1 - u);
    const z = (u - 0.5) * L;
    const row = [];
    for (let j = 0; j <= NY; j++) {
      const t = (j / NY - 0.5) * 2, side = Math.abs(t);
      const x = w * t, y = yk + (yg - yk) * Math.pow(side, 1.7);
      pos.push(x, y, z);
      row.push([x, y, z]);
      // 板のすじ（ふなべり側ほど明るく、板のつなぎ目は暗く）
      const f = side * 6, edge = Math.abs(f - Math.round(f)) < 0.07 ? 0.74 : 1;
      col.push(...wood((0.88 + 0.08 * (Math.floor(f) % 2) + 0.06 * side) * edge));
    }
    rows.push(row);
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const a = i * (NY + 1) + j, b = a + 1, c = a + (NY + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // 船尾の板（とも）: U字の輪郭を、中心から扇状にふさぐ
  const cIdx = pos.length / 3;
  const first = rows[0];
  const cx = 0, cy = (first[0][1] + first[NY / 2][1]) / 2, cz = first[0][2];
  pos.push(cx, cy, cz); col.push(...wood(0.8));
  for (let j = 0; j < NY; j++) idx.push(cIdx, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // ふなべりの縁（細い棒）
  const rail = [];
  for (const j of [0, NY]) {
    const pts = rows.map((r) => new THREE.Vector3(r[j][0], r[j][1] + 0.005, r[j][2]));
    rail.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.024, 6, false));
  }
  return { hull: g, rail, L, W };
}

function buildOar(side) {
  const g = new THREE.Group();
  const mat = stdMat({ color: 0xb08a58, roughness: 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 1.8, 6), mat);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = side * 0.5;     // 内側 -0.4 〜 外側 1.4
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.12), mat);
  blade.position.x = side * 1.25;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 6), stdMat({ color: 0x4a3622 }));
  grip.rotation.z = Math.PI / 2; grip.position.x = -side * 0.3;
  [shaft, blade, grip].forEach((m) => { m.castShadow = true; g.add(m); });
  return g;
}

export class Boat {
  constructor(scene, hooks = {}) {
    this.hooks = hooks;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    const { hull, rail } = buildHull();
    const hm = new THREE.Mesh(hull, stdMat({ vertexColors: true, side: THREE.DoubleSide }));
    hm.castShadow = true; hm.receiveShadow = true;
    this.group.add(hm);
    const railMat = stdMat({ color: 0x5a3d20, roughness: 0.7 });
    rail.forEach((r) => { const m = new THREE.Mesh(r, railMat); m.castShadow = true; this.group.add(m); });
    // こしかけ
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.3), stdMat({ color: 0x9a7a4a }));
    seat.position.set(0, 0.14, 0.12);
    this.group.add(seat);
    // 船首のつなぎ綱（ひも）
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 12), stdMat({ color: 0xcdbd8c }));
    rope.position.set(0, 0.46, 1.62); rope.rotation.x = Math.PI / 2;
    this.group.add(rope);
    // オール（おもりのように、手元のあたりを軸に回す）
    this.oars = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.6 * s, 0.4, 0.1);
      pivot.add(buildOar(s));
      this.group.add(pivot);
      return { pivot, s };
    });
    this.group.rotation.y = Math.PI;      // 船首は −z（沖のほう）
    scene.add(this.group);

    this.moored = new THREE.Vector3(PIER.x + PIER.w / 2 + 1.3, 0, PIER.zEnd + 1.9);
    this.pos = this.moored.clone();
    this.at = 'pier';
    this.trip = null;
    this.time = 0;
    this.phase = 0;
    this.stroked = 0;
    this.rowK = 0;               // こいでいる度合い（0〜1）
    this.scareT = 0;
    this.pierEye = new THREE.Vector3(PIER.x, PIER.y + 1.58, PIER.zEnd + 1.15);
    this.spots = this._makeSpots();
    this.group.position.copy(this.pos);
  }

  get busy() { return !!this.trip; }
  get aboard() { return this.at !== 'pier' || (this.trip && this.trip.stage().type !== 'climb'); }

  // 水の中の、のぞみの場所をさがす（岸から遠く、そこそこ深いところ）
  _find(x, z, minDepth, maxDepth = 9) {
    for (let r = 0; r < 14; r += 1) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU + r * 0.7, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const d = waterDepthAt(px, pz);
        if (pondSigned(px, pz) < -3 && d >= minDepth && d <= maxDepth && Math.hypot(px - PIER.x, pz - PIER.zEnd) > 5) return { x: px, z: pz, d };
      }
    }
    return { x, z, d: waterDepthAt(x, z) };
  }

  _makeSpots() {
    const mk = (id, name, x, z, minD, maxD, note) => { const p = this._find(x, z, minD, maxD); return { id, name, x: p.x, z: p.z, depth: p.d, note }; };
    return [
      { id: 'pier', name: L('桟橋', 'Pier'), x: PIER.x, z: PIER.zEnd + 1.15, depth: waterDepthAt(PIER.x, PIER.zEnd - 2), note: L('もといた場所', 'Where you started') },
      mk('deep', L('沖の深み', 'Deep Middle'), -2, -3, 2.6, 9, L('沼のまんなか。深いところにいる大物をねらえる', 'The middle of the pond. Big fish wait in the deep')),
      mk('far', L('奥の岸ぎわ', 'Far Bank'), -6, -14, 0.8, 1.5, L('むこう岸のきわ。浅くて、静かな場所', 'Along the far bank. Shallow and quiet')),
      mk('left', L('左の岸ぎわ', 'Left Bank'), -21, 5, 0.8, 1.6, L('左の岸のきわ。底のものがいそう', 'Along the left bank. Bottom dwellers live here')),
      mk('right', L('右の浅場', 'Right Shallows'), 17, -6, 0.8, 1.5, L('右の浅い入り江。小さな魚が集まる', 'A shallow inlet on the right. Small fish gather here')),
    ];
  }

  spot(id) { return this.spots.find((s) => s.id === id); }

  // 目の位置（ボートのすわる場所）
  seatEye(boatPos, out, bob = 0) {
    return out.set(boatPos.x + SEAT.x, EYE_H + bob, boatPos.z + SEAT.z);
  }

  // いまの位置から id へこぎだす。ウキがあがっているとき（待機中）だけ呼ぶこと
  moveTo(id) {
    if (this.trip || id === this.at) return false;
    const dest = this.spot(id);
    if (!dest) return false;
    const stages = [];
    const eye0 = new THREE.Vector3();
    if (this.at === 'pier') {
      stages.push({ type: 'board', dur: 1.5, eyeFrom: this.pierEye.clone(), eyeTo: this.seatEye(this.moored, eye0.clone()) });
    }
    if (id === 'pier') {
      stages.push({ type: 'row', from: this.pos.clone(), to: this.moored.clone() });
      stages.push({ type: 'climb', dur: 1.5, eyeFrom: this.seatEye(this.moored, eye0.clone()), eyeTo: this.pierEye.clone() });
    } else {
      stages.push({ type: 'row', from: this.at === 'pier' ? this.moored.clone() : this.pos.clone(), to: new THREE.Vector3(dest.x - SEAT.x, 0, dest.z - SEAT.z) });
    }
    for (const s of stages) {
      if (s.type === 'row') s.dur = Math.max(4, s.from.distanceTo(s.to) / 2.3);
      s.t = 0;
    }
    this.trip = { stages, i: 0, id, stage() { return this.stages[this.i]; } };
    this.hooks.onStart && this.hooks.onStart(dest, id === 'pier');
    return true;
  }

  update(dt, time, player) {
    this.time += dt;
    const t = this.time;
    const g = this.group;
    const tr = this.trip;
    let rowing = false;
    const eye = player.eye;
    if (tr) {
      const st = tr.stage();
      st.t += dt;
      const u = clamp(st.t / st.dur);
      if (st.type === 'row') {
        rowing = true;
        const e = easeInOut(u);
        this.pos.lerpVectors(st.from, st.to, e);
        this.pos.x += Math.sin(u * 7) * 0.05 * Math.sin(Math.PI * u);
        this.seatEye(this.pos, eye, Math.sin(t * 1.3) * 0.012);
        // こぎはじめは、ゆっくり
        this.phase += dt / 1.9 * (0.4 + 0.6 * Math.sin(Math.PI * u));
        if (Math.floor(this.phase) > this.stroked) {
          this.stroked = Math.floor(this.phase);
          this.hooks.onStroke && this.hooks.onStroke(this.pos.x, this.pos.z);
        }
        this.scareT -= dt;
        if (this.scareT <= 0) { this.scareT = 0.6; this.hooks.onMove && this.hooks.onMove(this.pos.x, this.pos.z); }
      } else {
        // のりこむ／あがる: 目が弧をえがいて移動
        const e = easeInOut(u);
        eye.lerpVectors(st.eyeFrom, st.eyeTo, e);
        eye.y += Math.sin(Math.PI * u) * 0.28;
      }
      if (u >= 1) {
        tr.i++;
        if (tr.i >= tr.stages.length) {
          this.trip = null;
          this.at = tr.id;
          if (tr.id === 'pier') { this.pos.copy(this.moored); eye.copy(this.pierEye); this.hooks.onDock && this.hooks.onDock(); }
          else { this.hooks.onArrive && this.hooks.onArrive(this.spot(tr.id)); }
        } else if (tr.stages[tr.i].type === 'row' && this.at === 'pier') {
          this.at = 'sea';          // つないだ縄をほどいて、岸をはなれる
        }
      }
    } else if (this.at !== 'pier') {
      // 沖でのんびり: 波にゆられる
      this.seatEye(this.pos, eye, Math.sin(t * 0.8) * 0.014 + Math.sin(t * 1.9) * 0.004);
    }
    this.rowK = damp(this.rowK, rowing ? 1 : 0, 3, dt);
    // ボートのゆれ
    const sway = this.at === 'pier' && !this.trip ? 0.6 : 1;
    g.position.set(this.pos.x, Math.sin(t * 0.8 + 1) * 0.012 * sway, this.pos.z);
    g.rotation.y = Math.PI + (rowing ? Math.sin(t * 0.9) * 0.015 : Math.sin(t * 0.21) * 0.01);
    g.rotation.z = Math.sin(t * 0.6) * 0.018 * sway + (rowing ? Math.sin(this.phase * TAU) * 0.012 : 0);
    g.rotation.x = Math.sin(t * 0.5 + 2) * 0.01 * sway;
    // オール: こいでいるときは前後にふり、水に入れて（ドライブ）、もちあげる（もどし）。ほかのときは、そっと水平に
    const ph = (this.phase % 1 + 1) % 1;
    const drive = ph < 0.45 ? easeInOut(ph / 0.45) : 1 - easeInOut((ph - 0.45) / 0.55);   // 0=キャッチ(船首がわ) 1=フィニッシュ(船尾がわ)
    const inWater = ph < 0.5 ? easeInOut(ph / 0.08) : 1 - easeInOut((ph - 0.5) / 0.08);
    const dip = lerp(0.12, -0.3, clamp(inWater));
    for (const o of this.oars) {
      o.pivot.rotation.y = lerp(0.1, 0.45 - 0.9 * drive, this.rowK) * o.s;
      o.pivot.rotation.z = lerp(0.06, dip, this.rowK) * o.s;
    }
  }
}

function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
