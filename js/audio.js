// 手続き生成の環境音と効果音（外部ファイルなし）
// ゲーム「ひだまり沼」の手続き生成サウンドを、ページ用に移したもの（音ファイルは使っていません）
import { SEASON, SEASON_ID, clamp, lerp, smoothstep } from './audio-shim.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

const INSECT = { spring: 0.12, summer: 0.75, autumn: 1, winter: 0 };
const BIRD = { spring: 1.8, summer: 1, autumn: 1, winter: 0.35 };

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.8;
    this.t = 0;
    this.sched = { bird: 3, plip: 2, higurashi: 5, crow: 40, bell: 25, frog: 10, semi: 6, cricketFlip: 0 };
    this.belled = false;
    this.mix = { water: 1, wind: 1, bugs: 1, birds: 1 };   // ページの「音の層」スイッチ
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // 屋外の残響（短いインパルス）
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 3.2);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.35;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.sfxRev = ctx.createGain();
    this.sfxRev.gain.value = 0.25;
    this.sfx.connect(this.sfxRev);
    this.sfxRev.connect(this.reverb);

    this.noiseWhite = this._noise(3, 'white');
    this.noisePink = this._noise(4, 'pink');
    this.noiseBrown = this._noise(4, 'brown');
    this._buildAmbience();
    this.enabled = true;
    if (ctx.state === 'suspended') await ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return buf;
  }

  _noise(sec, type) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // ループの継ぎ目をなじませる
    const n = 600;
    for (let i = 0; i < n; i++) { const t = i / n; d[len - n + i] = d[len - n + i] * (1 - t) + d[i] * t; }
    return buf;
  }

  _loop(buf, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.loopStart = 0; s.loopEnd = buf.duration - 600 / this.ctx.sampleRate;
    s.start(0, Math.random() * buf.duration * 0.5);
    s.connect(dest);
    return s;
  }

  _buildAmbience() {
    const ctx = this.ctx;
    const amb = (this.amb = ctx.createGain());
    amb.gain.value = 1;
    amb.connect(this.master);
    amb.connect(this.reverb);

    // 風
    const windG = (this.windGain = ctx.createGain()); windG.gain.value = 0.0;
    const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 420; windF.Q.value = 0.7;
    this._loop(this.noiseBrown, windF); windF.connect(windG); windG.connect(amb);
    this.windF = windF;
    const windHi = (this.windHiGain = ctx.createGain()); windHi.gain.value = 0;
    const wf2 = ctx.createBiquadFilter(); wf2.type = 'bandpass'; wf2.frequency.value = 1800; wf2.Q.value = 0.9;
    this._loop(this.noisePink, wf2); wf2.connect(windHi); windHi.connect(amb);

    // 水のさざ波
    const waterG = (this.waterGain = ctx.createGain()); waterG.gain.value = 0.0;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 1100; wl.Q.value = 0.5;
    this._loop(this.noisePink, wl); wl.connect(waterG); waterG.connect(amb);
    this.waterLFO = ctx.createOscillator(); this.waterLFO.frequency.value = 0.23;
    const lg = ctx.createGain(); lg.gain.value = 0.012;
    this.waterLFO.connect(lg); lg.connect(waterG.gain); this.waterLFO.start();

    // 雨
    const rainG = (this.rainGain = ctx.createGain()); rainG.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1200;
    const rf2 = ctx.createBiquadFilter(); rf2.type = 'lowpass'; rf2.frequency.value = 9000;
    this._loop(this.noiseWhite, rf); rf.connect(rf2); rf2.connect(rainG); rainG.connect(amb);

    // 虫の声: スズムシ(リーンリーン) と コオロギ(コロコロ)
    this.insects = [];
    const mkSuzu = (f, pan, phase) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const vib = ctx.createOscillator(); vib.frequency.value = 7 + Math.random() * 3;
      const vg = ctx.createGain(); vg.gain.value = 18;
      vib.connect(vg); vg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0;
      const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 0.55 + Math.random() * 0.2;
      const amg = ctx.createGain(); amg.gain.value = 0.5;
      const amOff = ctx.createConstantSource ? ctx.createConstantSource() : null;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) p.pan.value = pan;
      o.connect(g);
      const ampG = ctx.createGain(); ampG.gain.value = 0;
      g.connect(ampG);
      am.connect(amg); amg.connect(g.gain);
      if (amOff) { amOff.offset.value = 0.5; amOff.connect(g.gain); amOff.start(); }
      (p ? (ampG.connect(p), p.connect(amb)) : ampG.connect(amb));
      o.start(); vib.start(); am.start(phase);
      return { ampG, base: 0.012 };
    };
    this.insects.push(mkSuzu(4350, -0.6, 0), mkSuzu(4680, 0.5, 0.3), mkSuzu(4150, 0.1, 0.7), mkSuzu(5000, -0.2, 1.1));
    const mkCricket = (f, pan, rate) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0;
      const pulse = ctx.createOscillator(); pulse.type = 'square'; pulse.frequency.value = rate;
      const pg = ctx.createGain(); pg.gain.value = 0.5;
      const off = ctx.createConstantSource ? ctx.createConstantSource() : null;
      // 数回ずつグループ化
      const grp = ctx.createOscillator(); grp.type = 'square'; grp.frequency.value = 0.9 + Math.random() * 0.5;
      const grpG = ctx.createGain(); grpG.gain.value = 0.5;
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      pulse.connect(pg); pg.connect(g.gain);
      if (off) { off.offset.value = 0.5; off.connect(g.gain); off.start(); }
      o.connect(g);
      const gg = ctx.createGain(); gg.gain.value = 0;
      g.connect(gg);
      grp.connect(grpG); grpG.connect(g2.gain);
      gg.connect(g2);
      const out = ctx.createGain(); out.gain.value = 0;
      g2.connect(out);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = pan; out.connect(p); p.connect(amb); } else out.connect(amb);
      gg.gain.value = 1;
      o.start(); pulse.start(); grp.start();
      return { ampG: out, base: 0.01 };
    };
    this.insects.push(mkCricket(3050, -0.7, 22), mkCricket(3300, 0.7, 26), mkCricket(2900, 0.0, 19));
  }

  // ---- 毎フレーム更新 ----
  update(dt, ctxInfo) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { atm, wind, near } = ctxInfo;
    const sunE = atm.sunElev;
    const night = atm.night;
    const dusk = smoothstep(14, 0, sunE) * smoothstep(-14, -2, sunE);
    const day = smoothstep(2, 20, sunE);
    const rain = atm.rain;
    const wv = clamp((wind.length() - 0.2) / 1.2);
    const M = this.mix;
    this.windGain.gain.setTargetAtTime((0.05 + wv * 0.1 + atm.overcast * 0.03 + rain * 0.03 + (SEASON.snow ? 0.03 : 0)) * M.wind, now, 0.5);
    this.windHiGain.gain.setTargetAtTime((0.004 + wv * 0.03 + rain * 0.02) * M.wind, now, 0.5);
    this.windF.frequency.setTargetAtTime(300 + wv * 400, now, 0.7);
    this.waterGain.gain.setTargetAtTime((0.012 + wv * 0.01) * M.water, now, 0.5);
    this.rainGain.gain.setTargetAtTime(rain * (SEASON.snow ? 0.012 : 0.1), now, 1.0);   // 雪はほとんど音がしない
    // 虫の声: 夕方〜夜がメイン、雨では静まる
    const insAmt = (0.25 * day + dusk * 0.8 + night * 1.0) * (1 - rain * 0.8) * (1 - atm.overcast * 0.2) * INSECT[SEASON_ID] * M.bugs;   // 秋は虫の声、夏は少なめ、春と冬はほぼなし
    this.insects.forEach((ins, i) => {
      const active = i < 4 ? (0.6 + 0.4 * Math.sin(this.t * 0.07 + i * 2)) : (0.55 + 0.45 * Math.sin(this.t * 0.05 + i));
      ins.ampG.gain.setTargetAtTime(ins.base * insAmt * (i < 4 ? 1.0 : 1.1) * active, now, 1.5);
    });

    this.t += dt;
    const s = this.sched;
    for (const k of Object.keys(s)) if (k !== 'cricketFlip') s[k] -= dt;
    // 水のぽちゃん
    if (s.plip <= 0) { s.plip = rnd(2.5, 9); if (M.water > 0.01 && Math.random() < 0.6) this.plip(rnd(0.2, 0.5), rnd(-0.6, 0.6)); }
    // 鳥のさえずり（昼）
    if (s.bird <= 0) {
      s.bird = rnd(3, 11) / Math.max(0.2, day + 0.15) / BIRD[SEASON_ID];
      if (M.birds > 0.01 && day > 0.3 && rain < 0.5) this.birdTweet();
    }
    // ヒグラシ（夏〜秋の夕方）
    if (s.higurashi <= 0) {
      s.higurashi = rnd(5, 12);
      if (M.bugs > 0.01 && (SEASON_ID === 'summer' || SEASON_ID === 'autumn') && dusk > 0.4 && sunE > -8 && rain < 0.6) this.higurashi();
    }
    // 夏の昼のセミ
    if (s.semi <= 0) {
      s.semi = rnd(3, 8);
      if (M.bugs > 0.01 && SEASON_ID === 'summer' && day > 0.4 && rain < 0.3) this.semi(rnd(-0.8, 0.8), 0.6 + Math.random() * 0.4);
    }
    // 春・夏の夕方から夜、遠くでカエルの合唱
    if (s.frog <= 0) {
      s.frog = rnd(4, 11) / (rain > 0.3 ? 2 : 1);
      if (M.birds > 0.01 && (SEASON_ID === 'spring' || SEASON_ID === 'summer') && (dusk > 0.3 || night > 0.5 || rain > 0.3)) this.croak(rnd(-0.9, 0.9), rnd(0.25, 0.5));
    }
    // カラス
    if (s.crow <= 0) {
      s.crow = rnd(35, 80);
      if (M.birds > 0.01 && sunE > -5 && sunE < 20 && rain < 0.5 && Math.random() < 0.7) this.crow();
    }
    // 遠くの鐘（夕暮れ）
    if (s.bell <= 0) {
      s.bell = rnd(100, 200);
      if (dusk > 0.5 && sunE > -6 && sunE < 7) this.bell();
    }
  }

  // ---- 効果音 ----
  _env(g, t0, a, d, peak, endV = 0.0001) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(endV, t0 + a + d);
  }

  _pan(node, pan) {
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      return p;
    }
    return node;
  }

  _noiseBurst(t0, dur, fFrom, fTo, q, peak, type = 'bandpass', pan = 0, buf = null) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf || this.noiseWhite;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(fFrom, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, fTo), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t0, Math.min(0.02, dur * 0.2), dur, peak);
    s.connect(f); f.connect(g);
    this._pan(g, pan).connect(this.sfx);
    s.start(t0, Math.random() * 1.5, dur + 0.1);
  }

  _tone(t0, freq, dur, peak, type = 'sine', fTo = null, pan = 0, attack = 0.005, dest = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (fTo) o.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
    const g = ctx.createGain();
    this._env(g, t0, attack, dur, peak);
    o.connect(g);
    this._pan(g, pan).connect(dest || this.sfx);
    o.start(t0); o.stop(t0 + dur + attack + 0.05);
  }

  // 気泡1個。水中の泡は大きさで決まる高さの音で震えて、すぐ消える（小さいほど高く、短い）。
  // 鳴りはじめより少しだけ高くなるのが「ぽこっ」「ぷくっ」に聞こえるところ。
  _bubble(t0, f0, peak, pan = 0, rise = 0.28) {
    const ctx = this.ctx;
    const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5); // 減衰の速さ(1/秒)
    const tau = 1.5 / d;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * (1 + rise), t0 + tau * 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.0015);
    g.gain.setTargetAtTime(0, t0 + 0.0015, tau);
    o.connect(g);
    this._pan(g, pan).connect(this.sfx);
    o.start(t0); o.stop(t0 + tau * 8 + 0.02);
  }

  // 水のざわめき（ノイズ）。立ち上がりのあと、指数的にすっと消える。
  _wash(t0, dur, fFrom, fTo, q, peak, pan = 0, buf = null, attack = 0.008, type = 'bandpass') {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf || this.noisePink;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(fFrom, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, fTo), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.setTargetAtTime(0, t0 + attack, dur / 4);
    s.connect(f); f.connect(g);
    this._pan(g, pan).connect(this.sfx);
    s.start(t0, Math.random() * 1.5, attack + dur * 1.6);
  }

  // 水しぶき: 着水のぴしゃ → 水が割れるざぱ → 大きな泡から小さな泡へ → 水滴がぽつぽつ戻る
  _splashCore(t, power, pan) {
    this._wash(t, 0.07 + 0.04 * power, 3000, 1700, 0.6, 0.15 * power + 0.035, pan, this.noisePink, 0.005);
    this._wash(t + 0.006, 0.22 + 0.3 * power, 2400, 1100, 0.55, 0.18 * power + 0.045, pan, this.noisePink, 0.012);
    // 大きな着水では、深いところでふくらむ大きな泡の「ぼこっ」を少しだけ足す
    if (power > 0.5) this._bubble(t + 0.025, rnd(180, 260), 0.07 * power, pan, 0.6);
    const n = Math.round(4 + 14 * power);
    for (let i = 0; i < n; i++) {
      const u = (i + Math.random() * 0.8) / n;
      const dt = 0.004 + Math.pow(u, 1.5) * (0.22 + 0.25 * power);
      const f0 = lerp(rnd(300, 700), rnd(1400, 3400), Math.pow(u, 0.7)) * (1.15 - 0.3 * power);
      this._bubble(t + dt, f0, (0.065 * power + 0.016) * rnd(0.5, 1) * (1 - 0.55 * u), pan, rnd(0.15, 0.4));
    }
    const nd = Math.round(2 + 5 * power);
    for (let i = 0; i < nd; i++) {
      const dt = 0.12 + Math.pow(Math.random(), 1.2) * (0.35 + 0.3 * power);
      this._bubble(t + dt, rnd(1800, 4200), (0.012 + 0.02 * power) * rnd(0.5, 1), pan, 0.1);
    }
  }

  ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  cast(power = 0.5) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.18 + power * 0.25, 500, 3000 + power * 2000, 1.2, 0.18 + power * 0.18, 'bandpass', 0.2, this.noisePink);
    this._noiseBurst(t + 0.02, 0.25, 2500, 900, 0.8, 0.07, 'highpass');
  }

  windup() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.3, 900, 400, 1.0, 0.05, 'bandpass', 0, this.noisePink);
  }

  splash(power = 1, pan = 0) {
    if (!this.ready()) return;
    this._splashCore(this.ctx.currentTime, power, pan);
  }

  // 魚が水面で泡をつつく「ぽちゃ」
  plip(power = 0.4, pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const f = rnd(520, 1000);
    this._bubble(t, f, 0.1 * power + 0.03, pan, 0.35);
    this._bubble(t + rnd(0.05, 0.09), f * rnd(1.5, 2.2), (0.1 * power + 0.03) * 0.4, pan, 0.25);
    this._wash(t, 0.04, 2800, 1600, 1.0, 0.012 * power + 0.003, pan, this.noisePink, 0.002);
  }

  // ウキがちょんと触られる（kind: 魚ごとのアタリの癖）
  nibble(kind = 'tick') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    if (kind === 'chiku') {          // タナゴ: ちっ、と細かく
      this._bubble(t, rnd(1700, 2300), 0.05, 0, 0.2);
      this._wash(t, 0.025, 4200, 2600, 1.2, 0.01, 0, this.noisePink, 0.001);
    } else if (kind === 'gon') {     // ナマズ・ぬし: ごつっ、と重く
      this._bubble(t, rnd(170, 230), 0.16, 0, 0.5);
      this._wash(t, 0.1, 700, 300, 0.7, 0.07, 0, this.noiseBrown, 0.004, 'lowpass');
    } else if (kind === 'buru') {    // ドジョウ: ぶるぶる
      for (let i = 0; i < 5; i++) this._bubble(t + i * 0.045, rnd(850, 1250), 0.045 * (1 - i * 0.12), 0, 0.2);
    } else if (kind === 'zuru') {    // ザリガニ: ずるずる引きずる
      this._wash(t, 0.45, 650, 1150, 1.4, 0.03, 0, this.noisePink, 0.05);
      this._bubble(t + 0.2, rnd(500, 700), 0.035, 0, 0.3);
    } else if (kind === 'yure') {    // コイ・イモリ: ゆらり
      this._bubble(t, rnd(480, 700), 0.06, 0, 0.35);
      this._wash(t, 0.2, 1400, 800, 0.8, 0.014, 0, this.noisePink, 0.03);
    } else if (kind === 'fuwa') {    // ニシキゴイ: ふわっ
      this._tone(t, 1100, 0.14, 0.03, 'sine', 1500, 0, 0.03);
      this._bubble(t + 0.04, rnd(1300, 1500), 0.04, 0, 0.3);
    } else {
      const f = rnd(900, 1300);
      this._bubble(t, f, 0.1, 0, 0.3);
      this._bubble(t + 0.05, f * 1.35, 0.06, 0, 0.25);
      this._wash(t, 0.04, 3000, 1800, 1.0, 0.02, 0, this.noisePink, 0.002);
    }
  }

  // ウキが沈む「ぽこっ」（kind: sink=ふつう / heavy=ぐっと重く / soft=やわらかく）
  bite(kind = 'sink') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    if (kind === 'heavy') {
      this._bubble(t, 170, 0.3, 0, 0.8);
      this._bubble(t + 0.06, 290, 0.18, 0, 0.6);
      this._bubble(t + 0.11, 520, 0.09, 0, 0.4);
      this._wash(t, 0.26, 1500, 500, 0.6, 0.14, 0, this.noisePink, 0.008);
    } else if (kind === 'soft') {
      this._bubble(t, 330, 0.14, 0, 0.5);
      this._bubble(t + 0.07, 560, 0.07, 0, 0.35);
      this._wash(t, 0.14, 1500, 900, 0.6, 0.05, 0, this.noisePink, 0.012);
    } else {
      this._bubble(t, 260, 0.22, 0, 0.7);
      this._bubble(t + 0.05, 420, 0.13, 0, 0.5);
      this._bubble(t + 0.09, 700, 0.08, 0, 0.35);
      this._wash(t, 0.16, 1800, 900, 0.6, 0.1, 0, this.noisePink, 0.006);
    }
  }

  hook() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.07, 5000, 2000, 2, 0.2, 'bandpass');
    this._tone(t, 900, 0.2, 0.12, 'triangle', 380);
    this._tone(t + 0.01, 160, 0.18, 0.15, 'sine', 90);
  }

  reelTick(rate = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.018, 4200 + Math.random() * 600, 2500, 3, 0.05 + 0.03 * rate, 'bandpass', 0.3);
    this._tone(t, 1700 + Math.random() * 200, 0.02, 0.025, 'square', 900, 0.3);
  }

  creak(amount = 0.5) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 180 + amount * 120, 0.18, 0.02 + amount * 0.02, 'sawtooth', 220 + amount * 160);
  }

  snap() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 3800, 0.45, 0.14, 'sine', 5200);
    this._tone(t, 2200, 0.3, 0.1, 'triangle', 600);
    this._noiseBurst(t, 0.08, 6000, 3000, 1.5, 0.15);
  }

  // 釣った魚が手のひらにのる「ぺちっ」
  grab(pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.06, 1500, 700, 0.9, 0.1, pan, this.noisePink, 0.003);
    this._bubble(t + 0.01, rnd(380, 520), 0.05, pan, 0.4);
    for (let i = 0; i < 3; i++) this._bubble(t + 0.05 + i * rnd(0.04, 0.08), rnd(1500, 3000), 0.015, pan, 0.15);
  }

  // 手の上でぴくっと跳ねる
  flop(pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.09, 2000, 900, 0.8, 0.07, pan, this.noisePink, 0.004);
    this._bubble(t + 0.015, rnd(500, 800), 0.03, pan, 0.3);
    this._bubble(t + 0.05, rnd(1400, 2600), 0.015, pan, 0.2);
  }

  // 魚が水面ではねる・暴れる
  thrash(pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._splashCore(t, 0.5, pan);
    this._splashCore(t + 0.09, 0.3, pan);
  }

  // 琴風の爪弾き（陰旋法: D E♭ G A B♭ 風）
  pluck(freq, t0, vol = 0.12, dur = 1.6) {
    const ctx = this.ctx;
    for (const [m, v, dd] of [[1, 1, 1], [2.01, 0.35, 0.55], [3.02, 0.18, 0.35], [4.98, 0.06, 0.2]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * m * 1.012, t0);
      o.frequency.exponentialRampToValueAtTime(freq * m, t0 + 0.05);
      const g = ctx.createGain();
      this._env(g, t0, 0.004, dur * dd, vol * v);
      o.connect(g); g.connect(this.sfx);
      o.start(t0); o.stop(t0 + dur * dd + 0.1);
    }
    this._noiseBurst(t0, 0.03, 4000, 2000, 2, vol * 0.25);
  }

  catchJingle(rarity = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.05;
    const base = 293.66; // D4
    const scale = [0, 2, 3, 7, 10, 12, 14, 15, 19, 22, 24]; // 陰旋法風
    const notes = rarity >= 3 ? [0, 3, 7, 12, 15, 19, 24] : rarity >= 2 ? [0, 3, 7, 12, 15] : [0, 5, 7, 12];
    notes.forEach((n, i) => this.pluck(base * Math.pow(2, n / 12), t + i * 0.13, 0.11, 1.8));
    if (rarity >= 3) this._tone(t + 0.9, 1568, 1.8, 0.03, 'sine', null, 0, 0.3);
  }

  keepSound() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 880, 0.12, 0.1, 'triangle', 700);
    this._tone(t + 0.0, 440, 0.15, 0.08, 'sine', 330);
    this._noiseBurst(t, 0.05, 1500, 800, 3, 0.05);
  }

  releaseSound() {
    this.splash(0.5);
  }

  uiTick() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 1200, 0.05, 0.05, 'triangle', 900);
  }

  uiConfirm() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.pluck(587.33, t, 0.08, 1.0);
    this.pluck(880, t + 0.08, 0.06, 1.0);
  }

  // ---- 自然の音 ----
  birdTweet() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const pan = rnd(-0.9, 0.9);
    const kind = Math.floor(Math.random() * 3);
    const base = rnd(2800, 4400);
    const n = kind === 0 ? 4 : kind === 1 ? 2 : 6;
    for (let i = 0; i < n; i++) {
      const tt = t + i * (kind === 2 ? 0.09 : 0.16);
      const f1 = base * (1 + 0.15 * Math.sin(i * 1.7));
      this._tone(tt, f1, 0.07, 0.022, 'sine', f1 * (kind === 1 ? 0.7 : 1.35), pan, 0.004, null);
    }
  }

  higurashi() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const pan = rnd(-0.8, 0.8);
    // カナカナカナ…: だんだん遅くなる
    let tt = t;
    const n = 7 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 3300 - i * 40;
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.1, tt);
      o.frequency.exponentialRampToValueAtTime(f * 0.78, tt + 0.16);
      const g = this.ctx.createGain();
      this._env(g, tt, 0.02, 0.15, 0.022);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 55;
      const lg = this.ctx.createGain(); lg.gain.value = 0.01;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); this._pan(g, pan).connect(this.amb);
      o.start(tt); o.stop(tt + 0.22); lfo.start(tt); lfo.stop(tt + 0.22);
      tt += 0.2 + i * 0.015;
    }
  }

  crow() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const pan = rnd(-0.9, 0.9);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.55;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, tt);
      o.frequency.exponentialRampToValueAtTime(330, tt + 0.38);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2.5;
      const g = this.ctx.createGain();
      this._env(g, tt, 0.04, 0.4, 0.05);
      o.connect(f); f.connect(g); this._pan(g, pan).connect(this.amb);
      o.start(tt); o.stop(tt + 0.5);
    }
  }

  heron() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const pan = rnd(-0.6, 0.6);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.55);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 1.6;
    const g = this.ctx.createGain();
    this._env(g, t, 0.05, 0.55, 0.07);
    o.connect(f); f.connect(g); this._pan(g, pan).connect(this.amb);
    o.start(t); o.stop(t + 0.7);
    this._noiseBurst(t, 0.5, 900, 400, 1.2, 0.015, 'bandpass', pan);
  }

  // セミ（ジーーーと、ふるえる高い音）
  semi(pan = 0, vol = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = rnd(2.2, 4.2);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(3400, 4200), t);
    o.frequency.linearRampToValueAtTime(rnd(3600, 4400), t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4800; f.Q.value = 3.2;
    const am = ctx.createGain(); am.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(32, 46);
    const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg); lg.connect(am.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.018 * vol, t + 0.5);
    env.gain.setValueAtTime(0.018 * vol, t + dur - 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(am); am.connect(env); this._pan(env, pan).connect(this.amb || this.sfx);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // カワセミの「ちー、ちっ」（高く、短く）
  chirp(pan = 0, vol = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 5400, 0.11, 0.05 * vol, 'sine', 7300, pan, 0.004);
    this._tone(t + 0.15, 5900, 0.085, 0.04 * vol, 'sine', 4700, pan, 0.004);
    this._tone(t + 0.15, 11800, 0.06, 0.008 * vol, 'sine', 9400, pan, 0.004);
  }

  // カエルの「ゲコッ、ゲッ」
  croak(pan = 0, vol = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const one = (t, f0, f1, dur, peak) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(420, t + dur); f.Q.value = 2.6;
      const am = ctx.createGain(); am.gain.value = 0.55;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 36;
      const lg = ctx.createGain(); lg.gain.value = 0.45;
      lfo.connect(lg); lg.connect(am.gain);
      const g = ctx.createGain(); this._env(g, t, 0.015, dur, peak);
      o.connect(f); f.connect(am); am.connect(g); this._pan(g, pan).connect(this.sfx);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.06); lfo.stop(t + dur + 0.06);
    };
    const t = ctx.currentTime;
    one(t, 170, 110, 0.2, 0.09 * vol);
    one(t + 0.27, 140, 95, 0.14, 0.07 * vol);
  }

  // 猫の「にゃあ」（声の高さと口の開きを、あとから上げて下げる）
  meow(pan = 0, vol = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.75;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(690, t + 0.22);
    o.frequency.linearRampToValueAtTime(560, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(380, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 6; const vg = ctx.createGain(); vg.gain.value = 9;
    vib.connect(vg); vg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(600, t); f1.frequency.linearRampToValueAtTime(1000, t + 0.25); f1.frequency.linearRampToValueAtTime(700, t + dur);
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6;
    f2.frequency.setValueAtTime(1500, t); f2.frequency.linearRampToValueAtTime(2700, t + 0.25); f2.frequency.linearRampToValueAtTime(1800, t + dur);
    const g1 = ctx.createGain(); g1.gain.value = 1.0;
    const g2 = ctx.createGain(); g2.gain.value = 0.55;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.11 * vol, t + 0.07);
    env.gain.setValueAtTime(0.11 * vol, t + 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); f1.connect(g1); g1.connect(env);
    o.connect(f2); f2.connect(g2); g2.connect(env);
    this._pan(env, pan).connect(this.sfx);
    o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  // 猫の「ごろごろ」
  purr(pan = 0, vol = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 3.2;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 52;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 1.2;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 24; const lg = ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.1 * vol, t + 0.5);
    env.gain.setValueAtTime(0.1 * vol, t + dur - 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(am); am.connect(env); this._pan(env, pan).connect(this.sfx);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // ---- 空の出来事 ----
  // 遠くの花火の「ドーン」。光が見えてから、距離ぶん遅れて届く
  boom(delay = 0, size = 1, pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    this._tone(t, 96, 0.55, 0.15 * size, 'sine', 38, pan, 0.006);
    this._noiseBurst(t, 0.5, 620, 90, 0.6, 0.16 * size, 'lowpass', pan, this.noiseBrown);
    // 開いた火花が、空のむこうでぱちぱちとはぜる
    const n = Math.round(10 + 8 * size);
    for (let i = 0; i < n; i++) this._noiseBurst(t + 0.2 + Math.random() * 1.1, 0.025, rnd(2600, 6500), 1500, 2, 0.011 * size * (1 - i / (n + 4)), 'bandpass', pan);
  }

  // 花火が打ち上がる「ひゅるる」（遠いので、かすかに）
  fwLaunch(delay = 0, pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    this._noiseBurst(t, 0.12, 380, 160, 0.8, 0.03, 'lowpass', pan, this.noiseBrown);
    this._tone(t + 0.1, 900, 1.2, 0.01, 'sine', 2600, pan, 0.2);
  }

  // 遠雷: 低いうなりが、うねりながら長く尾をひく
  thunder(delay = 2, strength = 1, pan = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, dur = 3.2 + 3.4 * strength;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBrown;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * strength + 0.04, t + 0.3);
    for (let tt = t + 0.5; tt < t + dur * 0.8; tt += rnd(0.3, 0.8)) g.gain.linearRampToValueAtTime((0.05 + 0.15 * Math.random()) * strength + 0.01, tt);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); this._pan(g, pan).connect(this.sfx);
    s.start(t, Math.random() * 1.5, dur + 0.2);
    this._noiseBurst(t, 0.14, 1800, 400, 0.8, 0.04 * strength, 'bandpass', pan);
  }

  // オールが水をかく音（ざぷ、ときしみ）
  oar(pan = 0, vol = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.32, 1500, 500, 0.7, 0.07 * vol, pan, this.noisePink, 0.03);
    this._bubble(t + 0.04, rnd(260, 420), 0.05 * vol, pan, 0.4);
    this._tone(t + 0.12, rnd(150, 190), 0.22, 0.012 * vol, 'sawtooth', rnd(120, 150), pan, 0.04);   // きしみ
  }

  // ボートが桟橋にコツンとあたる
  boatKnock() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 140, 0.12, 0.1, 'triangle', 80, 0, 0.003);
    this._noiseBurst(t, 0.08, 900, 300, 1, 0.07, 'bandpass');
    this._wash(t + 0.05, 0.4, 900, 400, 0.6, 0.04, 0, this.noisePink, 0.05);
  }

  // 流れ星に願いごと。高い鈴のようなきらめき
  wish() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.05;
    [1568, 2093, 2637, 3136].forEach((f, i) => this._tone(t + i * 0.11, f, 1.6, 0.028 - i * 0.004, 'sine', null, 0, 0.012));
  }

  bell() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const f0 = 138.6; // 遠くの梵鐘
    const parts = [[1, 1, 9], [2.0, 0.55, 7], [2.76, 0.4, 6], [3.5, 0.2, 4.5], [5.4, 0.12, 3], [0.5, 0.4, 10]];
    for (const [m, v, d] of parts) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = f0 * m * (1 + (Math.random() - 0.5) * 0.002);
      const g = this.ctx.createGain();
      this._env(g, t, 0.02, d, 0.05 * v);
      o.connect(g); g.connect(this.amb);
      o.start(t); o.stop(t + d + 0.2);
    }
    this._noiseBurst(t, 0.2, 800, 300, 1, 0.03);
  }
}
