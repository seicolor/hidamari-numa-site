// 背景の風景（全画面のフラグメントシェーダ）を動かすところ。
// 画面の大きさ・端末の力に合わせて描く解像度を自動で調整する。
import { VERT, frag } from './shaders.js';
import { sky, SEASONS } from './sky.js';

const U = ['uRes', 'uTime', 'uHorizon', 'uZen', 'uHor', 'uGlow', 'uSunCol', 'uAmb', 'uCloudLit', 'uCloudDark', 'uWater',
  'uP0', 'uP1', 'uP2', 'uSeason', 'uPointer', 'uMisc', 'uMisc2'];

export function createGL(canvas, { quality = 2, maxScale = 1.5 } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) return { ok: false };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log); }
    return s;
  };
  let prog, loc = {}, ripLoc;
  const build = (q) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag(q)));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    if (prog) gl.deleteProgram(prog);
    prog = p; gl.useProgram(p);
    loc = {}; U.forEach((n) => { loc[n] = gl.getUniformLocation(p, n); });
    ripLoc = gl.getUniformLocation(p, 'uRip');
  };
  try { build(quality); } catch (e) { console.warn('shader', e.message); return { ok: false, error: e.message }; }
  gl.bindVertexArray(gl.createVertexArray());

  const api = {
    ok: true, canvas, gl,
    scale: Math.min(maxScale, window.devicePixelRatio || 1, quality >= 2 ? 0.85 : 0.65),   // はじめは控えめに。余裕があれば、自動で上げる
    maxScale, minScale: 0.35, quality,
    animate: true,
    pointer: [0, 0], _pt: [0, 0],
    horizon: 0.44,
    rip: new Float32Array(40), ripN: 0,
    lost: false,
    t0: performance.now(),
    // 状態（呼ぶ側が毎フレーム書きかえる）
    S: { hour: 7, season: [1, 0, 0, 0], mist: 0, lily: 0.6, parts: 1, lights: 0, rainbow: 0, wind: 1 },
  };

  let W = 0, H = 0;
  api.resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, api.maxScale);
    const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
    const s = Math.max(api.minScale, Math.min(api.scale, dpr));
    const w = Math.max(2, Math.round(cw * s)), h = Math.max(2, Math.round(ch * s));
    if (w !== W || h !== H) { canvas.width = W = w; canvas.height = H = h; gl.viewport(0, 0, w, h); }
  };

  // 画面の位置(u,v:0〜1, 下が0)に波紋を足す。水面の座標に直して持つ
  api.ripple = (u, v, strength = 1) => {
    const hz = api.horizon;
    if (v >= hz - 0.01) return false;
    const A = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
    const d = Math.max(0, Math.min(1, (hz - v) / hz));
    const zp = 0.9 / (d + 0.035);
    const wx = (u - 0.5) * A * zp;
    const now = (performance.now() - api.t0) / 1000;
    const i = api.ripN++ % 10;
    api.rip[i * 4] = wx; api.rip[i * 4 + 1] = zp; api.rip[i * 4 + 2] = now; api.rip[i * 4 + 3] = strength;
    return true;
  };

  // 描く（時間の進み方は省エネ：止めるときは同じ時刻の絵を描き直すだけ）
  let hist = [], lastT = performance.now(), warm = 0;
  api.render = (nowMs = performance.now()) => {
    if (api.lost) return;
    const dt = nowMs - lastT; lastT = nowMs;
    // 描画が重いときは解像度を落とす／余裕があれば戻す
    if (dt > 0 && dt < 500) {
      hist.push(dt); if (hist.length > 40) hist.shift();
      if (hist.length === 40 && ++warm > 40) {
        const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
        const cap = Math.min(api.maxScale, window.devicePixelRatio || 1);
        if (avg > 26 && api.scale > api.minScale + 0.01) { api.scale = Math.max(api.minScale, api.scale * 0.88); api.resize(); warm = 0; hist = []; }
        else if (avg < 15 && api.scale < cap * 0.95) { api.scale = Math.min(cap, api.scale * 1.06); api.resize(); warm = 0; hist = []; }
      }
    }
    // ポインタをなめらかに追う
    api._pt[0] += (api.pointer[0] - api._pt[0]) * 0.05; api._pt[1] += (api.pointer[1] - api._pt[1]) * 0.05;
    const S = api.S;
    const k = sky(S.hour, S.season, S.rain || 0);
    const t = (nowMs - api.t0) / 1000 + 20;
    const f3 = (n, v) => gl.uniform3f(loc[n], v[0], v[1], v[2]);
    gl.uniform2f(loc.uRes, W, H);
    gl.uniform1f(loc.uTime, t);
    gl.uniform1f(loc.uHorizon, api.horizon);
    f3('uZen', k.zen); f3('uHor', k.hor); f3('uGlow', k.glow); f3('uSunCol', k.sunCol); f3('uAmb', k.amb);
    f3('uCloudLit', k.cloudLit); f3('uCloudDark', k.cloudDark); f3('uWater', k.water);
    gl.uniform4f(loc.uP0, k.glowAmt, k.night, k.sunVis, k.exposure);
    gl.uniform4f(loc.uP1, k.sunX, k.sunH, k.moonX, k.moonH);
    gl.uniform4f(loc.uP2, k.cover, k.haze * 0.72, S.mist, S.wind);
    gl.uniform4f(loc.uSeason, S.season[0], S.season[1], S.season[2], S.season[3]);
    gl.uniform2f(loc.uPointer, api._pt[0], api._pt[1]);
    gl.uniform4f(loc.uMisc, S.lily, S.parts, S.lights, S.rainbow);
    gl.uniform4f(loc.uMisc2, api.animate ? 1 : 0, S.rain || 0, 0, 0);
    gl.uniform4fv(ripLoc, api.rip);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return k;
  };

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); api.lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { try { build(quality); gl.bindVertexArray(gl.createVertexArray()); api.lost = false; api.resize(); } catch (e) { /* あきらめる */ } });
  api.resize();
  return api;
}

export { SEASONS };
