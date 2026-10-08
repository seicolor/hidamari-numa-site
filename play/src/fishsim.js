// 沼の中の魚たちの行動（回遊・エサへの接近・ウキつつき・アタリ・ジャンプ・逃避）
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, TAU } from './util.js';
import { terrainHeight, pondSigned, waterDepthAt } from './terrain.js';
import { SPECIES, rollLength, weatherFactor, layerShift, layerFit, seasonFactor, thunderFactor, inSeason } from './species.js';
import { createFishObject } from './fishmodels.js';
import { SEASON } from './season.js';

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const RAR = [0, 1.0, 0.85, 0.5, 0.3];
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

function timeFactor(sp, hour) {
  // 朝まずめ・夕まずめは、日の出・日の入りの前後（秋は 4時12分〜7時半・16時12分〜19時48分）
  const h = hour, r = SEASON.sun.rise, st = SEASON.sun.set;
  const a = sp.active;
  if (h >= r - 1.8 && h < r + 1.5) return a.dawn;
  if (h >= r + 1.5 && h < st - 1.8) return a.day;
  if (h >= st - 1.8 && h < st + 1.8) return a.dusk;
  return a.night;
}

export class FishSim {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // {ripple(x,z,amp), splash(x,z,power), onNibble(f), onBite(f), onSpit(f)}
    this.fish = [];
    this.group = new THREE.Group();
    this.group.name = 'fish';
    scene.add(this.group);
    this.time = 0;
    this.jumpCooldown = 8;
    this.respawnQueue = [];
    this.shift = 1; // いまの魚のタナの伸び縮み（時間・天気で変わる）
    this.nushiT = 0;      // 条件がそろっている時間（沼のぬしを呼ぶまで）
    this.nushiCool = 0;   // 釣り上げたあと、しばらく出てこない
  }

  populate() {
    for (const sp of Object.values(SPECIES)) {
      if (sp.junk || !inSeason(sp)) continue;
      for (let i = 0; i < sp.count; i++) this.spawn(sp);
    }
  }

  spawn(sp, near) {
    const cm = rollLength(sp, Math.random);
    const obj = createFishObject(sp, cm);
    const f = {
      sp, cm, obj,
      x: 0, z: 0, y: -0.5, heading: rand(0, TAU), speed: 0, pitch: 0, roll: 0,
      tx: 0, tz: 0, ty: -0.5, state: 'wander', t: rand(0, 3), cool: rand(0, 8),
      hunger: rand(0.5, 1), nibbles: 0, nibbleT: 0, window: 0, turn: 0,
      phase: Math.random() * 10, home: null, wanderR: rand(3, 8), vy: 0, school: null,
      sizeK: Math.cbrt(cm / ((sp.cm[0] + sp.cm[1]) / 2)),
      alive: true, hooked: false, dive: 0, roll: 0, pitchBias: 0, pitchWant: 0, forageCool: rand(2, 12),
    };
    // 初期位置
    for (let k = 0; k < 80; k++) {
      const x = rand(-34, 34), z = rand(-24, 24);
      if (this.okPos(f, x, z)) { f.x = x; f.z = z; break; }
    }
    if (near) { f.x = near.x; f.z = near.z; }
    if (sp.id === 'namazu' || sp.id === 'nushi') f.home = { x: f.x, z: f.z };
    // 岩礁の魚は、サンゴの根のまわりにすみつく（this.homes = サンゴの根のリスト）
    if (sp.reef && this.homes && this.homes.length && !near) {
      const h = this.homes[Math.floor(Math.random() * this.homes.length)];
      f.home = { x: h.x + rand(-1, 1) * h.r * 0.5, z: h.z + rand(-1, 1) * h.r * 0.5 };
      // 群がる小魚（ヒメスズメダイ）は、たいてい仲間と同じ根のまわりに
      const mate = sp.shoal && Math.random() < 0.75 && this.fish.find((o) => o.sp === sp && o.home);
      if (mate) f.home = { x: mate.home.x + rand(-0.6, 0.6), z: mate.home.z + rand(-0.6, 0.6) };
      for (let k = 0; k < 30; k++) { const x = f.home.x + rand(-2, 2), z = f.home.z + rand(-2, 2); if (this.okPos(f, x, z)) { f.x = x; f.z = z; break; } }
    }
    this.pickTarget(f);
    this.place(f, 0);
    f.obj.group.position.set(f.x, f.y, f.z);
    this.group.add(f.obj.group);
    this.fish.push(f);
    return f;
  }

  okPos(f, x, z, margin = 1.3) {
    const s = pondSigned(x, z);
    if (s > -margin) return false;
    const d = waterDepthAt(x, z);
    if (d < f.sp.minDepth) return false;
    if (f.sp.maxDepth && d > f.sp.maxDepth) return false;
    return true;
  }

  pickTarget(f) {
    const sp = f.sp;
    for (let k = 0; k < 24; k++) {
      let x, z;
      if (f.home && Math.random() < 0.85) {
        const a = rand(0, TAU), r = rand(0.5, 3.5);
        x = f.home.x + Math.cos(a) * r; z = f.home.z + Math.sin(a) * r;
      } else {
        const a = rand(0, TAU), r = rand(2, f.wanderR);
        x = f.x + Math.cos(a) * r; z = f.z + Math.sin(a) * r;
      }
      if (!this.okPos(f, x, z, 1.0)) continue;
      if (sp.id === 'tanago' && pondSigned(x, z) < -11) continue;
      f.tx = x; f.tz = z;
      const bottom = terrainHeight(x, z);
      const L = sp.layer;
      f.ty = clamp(-rand(L[0], L[1]) * this.shift, bottom + 0.1, -0.12);
      if (sp.kind === 'newt') f.ty = bottom + 0.04;
      if (sp.kind === 'crayfish') f.ty = bottom + 0.02;
      return true;
    }
    // 見つからなければ沼の中心へ
    f.tx = f.x * 0.9; f.tz = f.z * 0.9;
    return false;
  }

  // いまの時間・天気での、沼全体の魚の気配（0.85前後がふつう。大きいほど活発）
  activity(hour, overcast, rain) {
    let sum = 0, n = 0;
    for (const sp of Object.values(SPECIES)) {
      if (sp.junk || !inSeason(sp)) continue;
      sum += sp.count * timeFactor(sp, hour) * weatherFactor(sp, overcast, rain) * seasonFactor(sp.id);
      n += sp.count;
    }
    return n ? sum / n : 1;
  }

  // 近くの魚をおどろかせる
  scare(x, z, radius, power = 1) {
    for (const f of this.fish) {
      if (f.hooked) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < radius) {
        if (f.sp.kind === 'swim' || f.sp.kind === 'newt' || f.sp.kind === 'crayfish') {
          f.state = 'flee';
          f.t = rand(2.5, 5) * power;
          f.fleeFrom = { x, z };
          f.cool = Math.max(f.cool, rand(10, 22));
        }
      }
    }
  }

  lureGone() {
    for (const f of this.fish) {
      if (f.state === 'approach' || f.state === 'inspect' || f.state === 'bitten') {
        f.state = 'flee';
        f.t = rand(1.5, 3);
        f.fleeFrom = { x: this.lastLure ? this.lastLure.x : f.x, z: this.lastLure ? this.lastLure.z : f.z };
        f.cool = rand(8, 16);
      }
    }
    this.lastLure = null;
  }

  // 釣り上げ・逃がしたあとの扱い
  remove(f) {
    f.alive = false;
    this.group.remove(f.obj.group);
    if (f.obj.dispose) f.obj.dispose();
    this.fish = this.fish.filter((x) => x !== f);
    if (f.sp.legend) { this.nushiCool = rand(600, 900); this.nushiT = 0; return; }   // ぬしは、ふつうの入れかわりには入れない
    this.respawnQueue.push({ sp: f.sp, t: f.sp.rarity >= 3 ? rand(240, 420) : rand(25, 60) });
  }

  // 沼のぬし: 夜・雨（かくもり）・ミミズ・深いタナ、そのすべてが25秒つづくと、エサの近くにあらわれる
  _nushi(dt, ctx) {
    const sp = SPECIES.nushi;
    if (!sp) return;
    const { lure, hour } = ctx;
    const night = hour >= SEASON.sun.set + 2 || hour < SEASON.sun.rise - 1.5;
    const wet = (ctx.rain || 0) > 0.25;
    const have = this.fish.find((f) => f.sp === sp);
    if (have) {
      if (have.hooked) return;
      have.life = (have.life || 0) + dt;
      have.badT = night && wet ? 0 : (have.badT || 0) + dt;
      // 夜や雨がおわって1分、またはあらわれて6分たつと、深みに帰っていく
      if (have.badT > 60 || have.life > 360) { this.remove(have); this.nushiCool = rand(120, 240); }
      return;
    }
    if (this.nushiCool > 0) { this.nushiCool -= dt; return; }
    const deep = lure && lure.active && lure.bait === 'worm' && -lure.depth >= 1.2 && lure.floor >= 1.7;
    if (night && wet && deep) {
      this.nushiT += dt;
      if (this.nushiT >= 25) {
        this.nushiT = 0;
        const a = Math.random() * Math.PI * 2, d = rand(3.5, 5.5);
        const f = this.spawn(sp, { x: lure.x + Math.cos(a) * d, z: lure.z + Math.sin(a) * d });
        if (f) this.hooks.onNushi && this.hooks.onNushi(f);
      }
    } else this.nushiT = Math.max(0, this.nushiT - dt * 2);
  }

  baitWeight(sp, bait) {
    return sp.bait[bait] ?? 0;
  }

  update(dt, ctx) {
    this.time += dt;
    const { lure, hour, rain } = ctx;
    this.shift = layerShift(hour, ctx.overcast || 0, rain || 0);
    this.lastLure = lure && lure.active ? lure : this.lastLure;
    // respawn
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i].t -= dt;
      if (this.respawnQueue[i].t <= 0) {
        this.spawn(this.respawnQueue[i].sp);
        this.respawnQueue.splice(i, 1);
      }
    }
    // ジャンプ
    this.jumpCooldown -= dt;
    if (this.jumpCooldown <= 0) {
      this.jumpCooldown = rand(10, 28) / (hour > SEASON.sun.set - 2 && hour < SEASON.sun.set + 1.5 ? 1.8 : 1);
      const cands = this.fish.filter((f) => f.sp.jumper && f.state === 'wander' && !f.hooked);
      if (cands.length) {
        const f = cands[Math.floor(Math.random() * cands.length)];
        if (waterDepthAt(f.x, f.z) > 0.6) this.startJump(f);
      }
    }

    this._nushi(dt, ctx);
    for (const f of this.fish) {
      if (f.hooked) continue;
      this.step(f, dt, ctx);
      this.place(f, dt);
    }
  }

  startJump(f) {
    f.state = 'jump';
    f.vy = f.sp.id === 'koi' || f.sp.id === 'nishiki' ? 2.6 : 2.2;
    f.y = -0.15;
    f.speed = f.sp.id === 'tanago' ? 1.0 : 1.4;
    f.t = 0;
  }

  // ルアー(エサ)のタナが、その魚に合っている度合い(0〜1)
  fitOf(f, lure) {
    return layerFit(f.sp, -lure.depth, lure.floor ?? 3, this.shift);
  }

  // エサのまわりの魚のようす: { near: 近くにいる数, fit: タナが合っている数, want: 近くの魚が好むタナの平均(m) }
  probe(lure, radius = 6) {
    const r = { near: 0, fit: 0, want: 0 };
    if (!lure || !lure.active) return r;
    let sw = 0;
    for (const f of this.fish) {
      if (f.hooked || f.sp.junk) continue;
      if (Math.hypot(f.x - lure.x, f.z - lure.z) > radius) continue;
      if (this.baitWeight(f.sp, lure.bait) < 0.3) continue;
      r.near++;
      const fit = this.fitOf(f, lure);
      if (fit > 0.5) r.fit++;
      r.want += (f.sp.bottom ? Math.max(0.1, (lure.floor ?? 1) - 0.1) : (f.sp.layer[0] + f.sp.layer[1]) * 0.5 * this.shift); sw++;
    }
    if (sw) r.want /= sw;
    return r;
  }

  // ルアーに気づいて寄ってくるか
  noticeLure(f, lure, tf, dt, range = 1, mul = 1) {
    const sp = f.sp;
    if (!lure || !lure.active || f.cool > 0 || sp.junk) return false;
    const d = Math.hypot(lure.x - f.x, lure.z - f.z);
    const w = this.baitWeight(sp, lure.bait);
    const at = lure.attract || 1;
    if (d < sp.seeR * at * range && w > 0.05) {
      // エサのタナが、その魚のいる深さに合っているか
      const fit = this.fitOf(f, lure);
      if (fit < 0.08) return false;
      const rate = at * w * fit * fit * tf * f.hunger * 0.95 * mul * RAR[sp.rarity] * (1 + (sp.seeR - d) / sp.seeR);
      if (Math.random() < rate * dt) {
        f.state = 'approach'; f.t = 0; f.approachT = 0;
        return true;
      }
    }
    return false;
  }

  step(f, dt, ctx) {
    const sp = f.sp;
    f.t -= dt;
    f.cool -= dt;
    f.hunger = clamp(f.hunger + dt * 0.02, 0, 1);
    const tf = timeFactor(sp, ctx.hour) * weatherFactor(sp, ctx.overcast || 0, ctx.rain || 0) * seasonFactor(sp.id) * thunderFactor(sp.id, ctx.thunder || 0) * (1 + 0.3 * (ctx.luck || 0));
    const lure = ctx.lure;
    let desiredSpeed = sp.speed * f.sizeK * (0.7 + 0.5 * Math.sin(this.time * 0.4 + f.phase));
    if (f.state === 'wander') desiredSpeed *= 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(this.time * (1.3 + sp.speed * 1.5) + f.phase * 3));
    let turnRate = 1.6 + sp.speed * 2.5;
    let tx = f.tx, tz = f.tz;

    switch (f.state) {
      case 'wander': {
        if (Math.hypot(tx - f.x, tz - f.z) < 0.6 || f.t < -14) {
          if (Math.random() < 0.35) { f.state = 'rest'; f.t = rand(2, 8); } else this.pickTarget(f);
        }
        // ルアーに気づく
        if (this.noticeLure(f, lure, tf, dt)) break;
        // 底をつつく（フナ・コイ・ドジョウ）
        f.forageCool -= dt;
        if (f.forageCool <= 0 && sp.forager) {
          f.forageCool = rand(6, 22);
          const bottom = terrainHeight(f.x, f.z);
          if (waterDepthAt(f.x, f.z) < 1.9 && Math.random() < 0.55 && !(lure && lure.active && Math.hypot(lure.x - f.x, lure.z - f.z) < 3)) {
            f.state = 'forage'; f.t = rand(4, 9); f.ty = bottom + 0.05 + (f.cm / 100) * 0.22;
            f.tx = f.x + Math.cos(f.heading) * 0.8; f.tz = f.z + Math.sin(f.heading) * 0.8;
            break;
          }
        }
        // 群れ（タナゴ）
        if (sp.school) {
          let cx = 0, cz = 0, n = 0, hx = 0, hz = 0, sx = 0, sz = 0;
          for (const o of this.fish) if (o !== f && o.sp === sp && !o.hooked) {
            const d = Math.hypot(o.x - f.x, o.z - f.z);
            if (d < 5) { cx += o.x; cz += o.z; hx += Math.cos(o.heading); hz += Math.sin(o.heading); n++; }
            if (d < 0.4 && d > 1e-3) { sx += (f.x - o.x) / d * (0.4 - d); sz += (f.z - o.z) / d * (0.4 - d); }
          }
          if (n > 0) {
            tx = lerp(tx, cx / n, 0.3); tz = lerp(tz, cz / n, 0.3);
            // 仲間のむきにそろえる
            tx = lerp(tx, f.x + hx / n * 3, 0.25); tz = lerp(tz, f.z + hz / n * 3, 0.25);
          }
          tx += sx * 6; tz += sz * 6;
        }
        break;
      }
      case 'rest': {
        desiredSpeed = sp.kind === 'swim' ? sp.speed * 0.12 : 0;
        if (f.t <= 0) { f.state = 'wander'; this.pickTarget(f); }
        this.noticeLure(f, lure, tf, dt, 0.8, 0.74);
        break;
      }
      case 'forage': {
        // 鼻先を底にむけて、ゆっくり進みながらエサをさがす
        const bottom = terrainHeight(f.x, f.z);
        f.ty = bottom + 0.04 + (f.cm / 100) * 0.22;
        desiredSpeed = sp.speed * 0.16;
        f.pitchWant = -0.55 + 0.1 * Math.sin(this.time * 3.1 + f.phase);
        if (Math.random() < dt * 0.25 && f.y < bottom + 0.2) this.hooks.ripple(f.x, f.z, 0.05);
        if (this.noticeLure(f, lure, tf, dt, 0.8, 0.8)) break;
        if (f.t <= 0) { f.state = 'wander'; this.pickTarget(f); }
        break;
      }
      case 'approach': {
        if (!lure || !lure.active) { f.state = 'wander'; this.pickTarget(f); break; }
        tx = lure.x; tz = lure.z;
        f.ty = clamp(lure.depth, terrainHeight(lure.x, lure.z) + 0.05, -0.1);
        desiredSpeed = sp.speed * 2.2 * f.sizeK + 0.05;
        turnRate *= 1.8;
        f.approachT += dt;
        const d = Math.hypot(lure.x - f.x, lure.z - f.z);
        if (d < 0.22 + f.cm * 0.003) {
          f.state = 'inspect';
          f.nibbles = Math.round(rand(sp.nibble[0], sp.nibble[1]));
          f.nibbleT = rand(0.5, 1.1);
          f.t = 0;
        } else if (f.approachT > 14) { f.state = 'wander'; f.cool = 10; }
        break;
      }
      case 'inspect': {
        if (!lure || !lure.active) { f.state = 'wander'; this.pickTarget(f); break; }
        tx = lure.x; tz = lure.z;
        desiredSpeed = sp.speed * 0.15;
        f.nibbleT -= dt;
        if (f.nibbleT <= 0) {
          // 途中でエサのタナを変えられたら、興味をなくす
          const fitNow = this.fitOf(f, lure);
          if (fitNow < 0.25) { f.state = 'flee'; f.t = rand(1.2, 2.2); f.fleeFrom = { x: lure.x, z: lure.z }; f.cool = rand(8, 16); break; }
          if (f.nibbles > 0) {
            f.nibbles--;
            const gap = (sp.bite && sp.bite.tick.gap) || [0.6, 1.4];
            f.nibbleT = rand(gap[0], gap[1]);
            this.hooks.onNibble && this.hooks.onNibble(f, f.nibbles === 0);
            this.hooks.ripple(f.x, f.z, 0.18);
          } else {
            // 食うか？
            const w = this.baitWeight(sp, lure.bait);
            const p = clamp(0.28 + 0.65 * w, 0, 0.95) * (0.6 + 0.4 * fitNow);
            if (Math.random() < p) {
              f.state = 'bitten';
              f.window = sp.hook * rand(0.85, 1.2);
              this.hooks.onBite && this.hooks.onBite(f);
            } else {
              f.state = 'flee'; f.t = 2; f.fleeFrom = { x: lure.x, z: lure.z }; f.cool = rand(12, 24);
            }
          }
        }
        break;
      }
      case 'bitten': {
        if (!lure || !lure.active) { f.state = 'wander'; break; }
        tx = lure.x; tz = lure.z;
        desiredSpeed = 0.02;
        f.window -= dt;
        if (f.window <= 0) {
          this.hooks.onSpit && this.hooks.onSpit(f);
          f.state = 'flee'; f.t = rand(2, 3.5); f.fleeFrom = { x: lure.x, z: lure.z }; f.cool = rand(15, 30);
          this.hooks.ripple(f.x, f.z, 0.5);
        }
        break;
      }
      case 'flee': {
        const from = f.fleeFrom || { x: f.x + 1, z: f.z };
        const a = Math.atan2(f.z - from.z, f.x - from.x);
        tx = f.x + Math.cos(a) * 5; tz = f.z + Math.sin(a) * 5;
        desiredSpeed = (sp.speed * 3 + 0.15) * f.sizeK;
        turnRate *= 2.2;
        if (f.t <= 0) { f.state = 'wander'; this.pickTarget(f); }
        break;
      }
      case 'jump': {
        f.vy -= 9.8 * dt;
        f.y += f.vy * dt;
        f.pitch = Math.atan2(f.vy, f.speed) * 0.9;
        desiredSpeed = f.speed;
        if (f.y < -0.08 && f.vy < 0) {
          f.state = 'wander';
          f.y = -0.3;
          this.hooks.splash(f.x, f.z, 0.7);
          this.hooks.ripple(f.x, f.z, 0.9);
          this.pickTarget(f);
        }
        break;
      }
    }

    // 向きの制御
    if (f.state !== 'jump') {
      const want = Math.atan2(tz - f.z, tx - f.x);
      const diff = angDiff(want, f.heading);
      const maxTurn = turnRate * dt;
      const turn = clamp(diff, -maxTurn, maxTurn);
      f.heading += turn;
      f.turn = damp(f.turn, turn / Math.max(dt, 1e-3) / turnRate, 6, dt);
      f.speed = damp(f.speed, desiredSpeed, 2.2, dt);
    }
    let nx = f.x + Math.cos(f.heading) * f.speed * dt;
    let nz = f.z + Math.sin(f.heading) * f.speed * dt;
    if (f.state !== 'jump' && !this.okPos(f, nx, nz, 0.6)) {
      // 岸に近づいたら向きを変える
      f.heading += Math.PI * 0.6 * (Math.random() < 0.5 ? 1 : -1);
      f.speed *= 0.4;
      if (f.state === 'wander') this.pickTarget(f);
      nx = f.x; nz = f.z;
    }
    f.x = nx; f.z = nz;

    if (f.state !== 'jump') {
      // 深さ
      const bottom = terrainHeight(f.x, f.z);
      let ty = f.ty;
      if (sp.kind === 'swim') {
        ty = clamp(ty + 0.05 * Math.sin(this.time * 0.7 + f.phase), bottom + 0.08, -0.1);
        // たまに水面近くでパクパク（コイ）
        if ((sp.id === 'koi' || sp.id === 'nishiki') && f.state === 'wander' && Math.sin(this.time * 0.11 + f.phase * 3) > 0.96) ty = -0.1;
      }
      const prevY = f.y;
      f.y = damp(f.y, ty, 1.8, dt);
      const pw = f.state === 'forage' ? (f.pitchWant || 0) : f.state === 'inspect' ? -0.16 : 0;
      f.pitchBias = damp(f.pitchBias, pw, 2.2, dt);
      f.pitch = damp(f.pitch, clamp(clamp((f.y - prevY) / Math.max(dt, 1e-3) * 0.7, -0.5, 0.5) + f.pitchBias, -0.7, 0.6), 4, dt);
      if (sp.kind === 'newt') {
        // たまに息つぎで水面へ
        if (f.state === 'wander' && Math.sin(this.time * 0.05 + f.phase * 5) > 0.985 && waterDepthAt(f.x, f.z) < 1.3 && !f.breathe) {
          f.breathe = 6;
        }
        if (f.breathe > 0) {
          f.breathe -= dt;
          f.y = damp(f.y, -0.06, 1.2, dt);
          if (f.breathe < 4.8 && f.breathe > 4.6 && !f.rippled) { f.rippled = true; this.hooks.ripple(f.x, f.z, 0.25); }
          if (f.breathe <= 0) f.rippled = false;
        }
        f.y = Math.max(f.y, bottom + 0.03);
      } else if (sp.kind === 'crayfish') {
        f.y = bottom + 0.02;
      } else {
        f.y = Math.max(f.y, bottom + 0.05);
      }
      if (f.state === 'wander' && f.speed > 0.15 * sp.speed && Math.random() < dt * 0.3 * (f.y > -0.3 ? 1 : 0.05) && sp.kind === 'swim') {
        this.hooks.ripple(f.x, f.z, 0.06 + f.speed * 0.1);
      }
    }
  }

  place(f, dt) {
    const o = f.obj;
    const g = o.group;
    g.position.set(f.x, f.y, f.z);
    g.rotation.order = 'YZX';
    g.rotation.y = -f.heading;
    g.rotation.z = f.pitch || 0;
    // 旋回では内側にかたむく（背中が曲がる側へ）
    f.roll = damp(f.roll || 0, clamp((f.turn || 0) * 0.32, -0.4, 0.4), 5, Math.max(dt, 1 / 60));
    g.rotation.x = f.roll;
    const sp = f.sp;
    if (o.wig) {
      const sp01 = clamp(f.speed / Math.max(sp.speed, 0.05) / 2.5, 0, 2);
      o.wig.uWigFreq.value = 3.5 + clamp(f.speed * 16, 0, 12) + sp01 * 1.5;
      const baseAmp = o.wigAmp ?? (sp.id === 'dojo' ? 0.1 : sp.kind === 'newt' ? 0.08 : 0.065);
      o.wig.uWigAmp.value = baseAmp * (0.3 + clamp(f.speed * 1.8, 0, 0.9));
      o.wig.uTurn.value = f.turn * 0.1;   // 曲がる側へ体をしならせる（尾は内側へ）
      // ひれは止まっていてもゆらゆら。泳ぐほど速く
      o.wig.uFinFreq.value = (o.finBase ?? 4.5) + clamp(f.speed * 14, 0, 9);
      // エサをつつくときは口をぱくぱく
      const peck = f.hooked || f.state === 'inspect' || f.state === 'bitten' || f.state === 'forage';
      o.wig.uBreath.value = damp(o.wig.uBreath.value, peck ? 9 : o.breath0, 4, Math.max(dt, 1 / 60));
      if (o.wig.uLeg) o.wig.uLeg.value = damp(o.wig.uLeg.value, clamp(f.speed * 14, 0, 1), 6, Math.max(dt, 1 / 60));
    }
    if (sp.kind === 'crayfish' || sp.kind === 'newt') {
      const w = Math.sin(this.time * 6 + f.phase) * clamp(f.speed * 10, 0, 1);
      o.mesh.rotation.x = w * 0.03;
    }
  }
}
