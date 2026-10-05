// 水辺の風景を、ひとつのフラグメントシェーダで描く（空・雲・星・月・山の森・古民家・水面・波紋・スイレン・舞うもの）。
// 画像は使わない。時刻と季節は uniform から。

export const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const frag = (q = 2) => `#version 300 es
precision highp float;
#define QUALITY ${q}
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uHorizon;
uniform vec3 uZen, uHor, uGlow, uSunCol, uAmb, uCloudLit, uCloudDark, uWater;
uniform vec4 uP0;      // x: 夕焼けの強さ  y: 夜  z: 太陽が見える度合い  w: 露出
uniform vec4 uP1;      // x: 太陽の横位置(-1..1)  y: 太陽の高さ  z: 月の横位置  w: 月の高さ
uniform vec4 uP2;      // x: 雲の量  y: もや(遠景のかすみ)  z: 朝もや  w: 風・時間の速さ
uniform vec4 uSeason;  // 春 夏 秋 冬
uniform vec4 uRip[10]; // 波紋: x,z(水面の座標) / 始まった時刻 / 強さ
uniform vec2 uPointer;
uniform vec4 uMisc;    // x: スイレン  y: 舞うものの量  z: 窓の灯り  w: 虹
uniform vec4 uMisc2;   // x: 1=動かす 0=止める

const float PI = 3.14159265;
float A;   // 画面の縦横比

float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = M2 * p; a *= .5; } return s; }
float fbm3(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++){ s += a * vn(p); p = M2 * p; a *= .5; } return s; }
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(h11(i), h11(i + 1.), f); }
float fbm1(float x){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * n1(x); x = x * 2.03 + 1.7; a *= .5; } return s; }

// 雨すじ（縦に細長いすじが、列ごとに、斜めに降る）
float rainLayer(vec2 uv, float scale, float speed, float seed){
  vec2 p = vec2(uv.x * A * scale + uv.y * scale * .16, uv.y * scale * .07);
  float c = floor(p.x), fx = fract(p.x);
  float off = h11(c * 1.7 + seed);
  float y = fract(p.y + uTime * speed * uMisc2.x + off);
  float streak = smoothstep(.0, .05, y) * smoothstep(.3, .05, y);
  float w = smoothstep(.07, .02, abs(fx - .5 + (h11(c + seed * 3.) - .5) * .5));
  return streak * w * step(.55, h11(c * 1.37 + seed));
}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

// ---- 空 ----
vec3 hsvRainbow(float u){ return clamp(abs(fract(u * .78 + vec3(0., .6667, .3333)) * 6. - 3.) - 1., 0., 1.); }

vec3 sky(vec2 w, bool lite){
  float hh = clamp((w.y - uHorizon) / max(1. - uHorizon, .05), 0., 1.);
  vec3 col = mix(uHor, uZen, pow(hh, .45));
  float sx = uP1.x * .42 * A, sy = uHorizon + uP1.y;
  float mx = uP1.z * .42 * A, my = uHorizon + uP1.w;
  float sd = exp(-pow((w.x - sx) / A, 2.) * 5.);
  col += uGlow * uP0.x * (pow(sd, 3.) * .65 + pow(sd, 14.) * .9) * exp(-hh * 5.5);
  col = mix(col, uHor, exp(-hh * 28.) * .5);
  // 太陽
  float ds = length(vec2((w.x - sx), (w.y - sy)));
  float vis = uP0.z;
  col += uSunCol * (smoothstep(.034, .028, ds) * 9. + exp(-ds * ds * 900.) * .9 + exp(-ds * ds * 45.) * .3 + exp(-ds * ds * 7.) * .09 + exp(-ds * 5.) * .06 * uP0.x) * vis;
  // 月
  float nt = uP0.y;
  if (nt > .01){
    vec2 dm = (w - vec2(mx, my));
    float R = .03, rr = length(dm);
    float disc = smoothstep(R, R * .9, rr);
    float maria = fbm3(dm * 52. + 4.) * .6;
    vec3 moon = vec3(1.25, 1.2, 1.05) * (.62 + .45 * clamp(dm.x / R * .5 + .55, 0., 1.)) * (.7 + .5 * maria);
    col = mix(col, moon, disc * nt);
    col += vec3(.45, .55, 1.) * (exp(-rr * rr * 1100.) * .5 + exp(-rr * rr * 60.) * .07) * nt;
  }
  // 雲
  vec4 cl = vec4(0.);
  if (hh > .002){
    vec2 uv = vec2(w.x * 1.15, 1.) / (hh * .85 + .13) * .5;
    uv += vec2(uTime * .0035 * uP2.w, uTime * .0012);
    float n = lite ? fbm3(uv * 1.25) : fbm(uv * 1.25);
    float dens = smoothstep(1. - uP2.x - .10, 1. - uP2.x + .26, n);
    vec2 ld = normalize(vec2(sx - w.x, .35)) * .07;
    float n2 = lite ? fbm3((uv + ld) * 1.25) : fbm((uv + ld) * 1.25);
    float shade = clamp(.55 + (n - n2) * 5.5, 0., 1.);
    vec3 cc = mix(uCloudDark, uCloudLit, shade);
    float mu = exp(-pow(length(vec2((w.x - sx) * .7, (w.y - sy) * 1.2)), 2.) * 4.);
    cc += uSunCol * (mu * .5 + pow(mu, 6.) * .9) * (1. - dens * .55) * vis;
    cc = mix(uHor * .9, cc, smoothstep(0., .35, hh));
    cl = vec4(cc, dens * smoothstep(0., .2, hh));
  }
  // 星
  if (nt > .01 && hh > .01){
    vec2 g = vec2(w.x, w.y) * 120.;
    vec2 ci = floor(g), f = fract(g) - .5;
    float r = h21(ci);
    vec2 off = (h22(ci + 1.7) - .5) * .7;
    float tw = .75 + .25 * sin(uTime * (2. + r * 5.) + r * 80.);
    float s = step(.955, r) * smoothstep(.18, 0., length(f - off)) * (.35 + 2.4 * pow(h21(ci + 3.3), 3.)) * tw;
    float band = exp(-pow(dot(w - vec2(0., .62), normalize(vec2(.55, .83))) * 3.4, 2.));
    vec3 mw = vec3(.05, .055, .08) * band * (.4 + 1.3 * fbm3(w * 7.));
    col += (vec3(.8, .88, 1.) * s + mw) * nt * smoothstep(0., .14, hh) * (1. - cl.a);
  }
  col = mix(col, cl.rgb, cl.a * .97);
  // 虹（雨あがりの、副虹つき）
  if (uMisc.w > .001){
    vec2 c = vec2(.1 * A, uHorizon - .13);
    float ang = length(w - c), R = .6, W = .034;
    float u1 = (R - ang) / W;
    float m1 = smoothstep(-.12, .12, u1) * smoothstep(1.12, .88, u1);
    float u2 = (ang - R * 1.2) / (W * 1.2);
    float m2 = smoothstep(-.12, .12, u2) * smoothstep(1.12, .88, u2) * .3;
    float inside = smoothstep(R, R - .22, ang) * .05;
    col += (hsvRainbow(u1) * m1 + hsvRainbow(u2) * m2 + inside) * uMisc.w * smoothstep(-.02, .05, w.y - uHorizon) * .5;
  }
  return col;
}

// ---- 山の森 ----
const float AMP[3] = float[3](.21, .125, .062);
const float FRQ[3] = float[3](1.15, 1.9, 3.1);
const float TIP[3] = float[3](.0034, .0085, .016);
const float TRF[3] = float[3](150., 96., 130.);
const float PAR[3] = float[3](.012, .03, .07);
const float HAZ[3] = float[3](.42, .22, .06);

float ridge(int i, float X){
  float fi = float(i);
  float b = fbm1(X * FRQ[i] + fi * 9.3 + 2.1);
  float h = AMP[i] * pow(clamp(b * 1.25 - .12, 0., 1.), 1.35);
  float cell = X * TRF[i];
  float tri = 1. - abs(fract(cell) * 2. - 1.);
  float tr = h11(floor(cell) + fi * 31.);
  float conif = smoothstep(.3, .55, vn(vec2(X * 5. + fi * 3., 1.7)));
  h += TIP[i] * pow(tri, 2.2) * (.25 + .75 * tr) * mix(.35, 1., conif);
  return h;
}

vec3 foliage(float X, float Y, float fi, float t){
  float pch = fbm3(vec2(X * 2.6 + fi * 7.3, Y * 6.));
  float speck = vn(vec2(X * 110., Y * 170.));
  float cm = smoothstep(.34, .56, vn(vec2(X * 5. + fi * 3., 1.7)));
  vec3 conifer = mix(vec3(.022, .07, .045), vec3(.05, .12, .07), pch);
  vec3 spring = mix(vec3(.2, .34, .09), vec3(.78, .44, .55), smoothstep(.4, .6, pch));
  vec3 summer = mix(vec3(.03, .11, .04), vec3(.075, .21, .065), pch);
  vec3 autumn = mix(mix(vec3(.14, .22, .05), vec3(.78, .5, .07), smoothstep(.28, .48, pch)), vec3(.62, .12, .04), smoothstep(.52, .72, pch));
  vec3 winter = mix(vec3(.12, .09, .07), vec3(.72, .78, .82), smoothstep(.45, .66, pch) * .55);
  vec3 broad = spring * uSeason.x + summer * uSeason.y + autumn * uSeason.z + winter * uSeason.w;
  vec3 c = mix(broad, conifer, cm * mix(.8, .55, uSeason.w));
  c = mix(c, vec3(.8, .85, .9), uSeason.w * smoothstep(.45, .0, t) * .6);
  return c * (.82 + .32 * speck);
}

vec3 land(vec2 w, vec3 col){
  float aa = 1.4 / uRes.y;
  vec3 light = uAmb * .95 + uSunCol * uP0.z * .22 + vec3(.02);
  float sx = uP1.x * .42 * A;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float X = w.x + uPointer.x * PAR[i] * 1.6;
    float hg = uHorizon + ridge(i, X);
    float m = smoothstep(aa, -aa, w.y - hg);
    if (m <= 0.) continue;
    float t = clamp((hg - w.y) / (AMP[i] + .03), 0., 1.);
    vec3 c = foliage(X, w.y, fi, t) * light;
    // 家（中景の左）
    if (i == 1){
      float xh = -.5 * A * .62;
      float base = uHorizon + ridge(1, xh + uPointer.x * PAR[1] * 1.6) * .6 + .004;
      vec2 q = vec2((X - xh) / .052, (w.y - base) / .03);
      float roof = step(abs(q.x), 1.3 - q.y * .95) * step(0., q.y) * step(q.y, 1.);
      float wall = step(abs(q.x), .95) * step(-.8, q.y) * step(q.y, 0.);
      float win = step(abs(q.x - .35), .22) * step(abs(q.y + .38), .16) + step(abs(q.x + .45), .22) * step(abs(q.y + .38), .16);
      c = mix(c, vec3(.2, .13, .06) * light, roof);
      c = mix(c, vec3(.06, .05, .045) * light, wall);
      c += vec3(1., .62, .25) * win * wall * uMisc.z * 1.8;
      float sm = smoothstep(.03, .0, abs(X - xh - .04 - .008 * sin(w.y * 55. + uTime * .6))) * smoothstep(base + .02, base + .08, w.y) * (1. - smoothstep(base + .1, base + .28, w.y));
      c = mix(c, uHor * 1.05, sm * .22 * (uSeason.x * .5 + uSeason.z + uSeason.w * 1.3) * step(.5, uMisc2.x));
      m = max(m, max(roof, wall) * step(w.y, base + .04));
    }
    // もや
    float hz = HAZ[i] * uP2.y;
    c = mix(c, uHor * 1.02 + uGlow * uP0.x * .12 * exp(-pow((X - sx) / (A * .6), 2.)), clamp(hz * (.35 + .65 * (1. - t)) + uP2.z * .4 * (1. - t), 0., .95));
    // 太陽側のふちが光る
    float rim = smoothstep(.016, 0., hg - w.y) * uP0.z * exp(-pow((X - sx) / (A * .5), 2.));
    c += uSunCol * rim * (.5 - .2 * fi) * (1. - uP2.y * .2) * (.12 + .88 * (1. - smoothstep(.0, .2, uP1.y)));
    col = mix(col, c, m);
  }
  return col;
}

vec3 scene(vec2 w, bool lite){
  vec3 col = sky(w, lite);
  return land(w, col);
}

// ---- 水面 ----
vec3 waterShade(vec2 uv, vec2 w){
  float d = clamp((uHorizon - uv.y) / uHorizon, 0., 1.);
  float zp = .9 / (d + .035);
  vec2 wp = vec2(w.x * zp, zp);
  float t = uTime * uP2.w;
  vec2 g = vec2(0.);
  g += vec2(.8, .3) * cos(dot(wp, vec2(.8, .3)) * 1.7 + t * 1.1) * .05;
  g += vec2(-.5, .7) * cos(dot(wp, vec2(-.5, .7)) * 2.6 + t * 1.5) * .035;
  g += vec2(.2, -.9) * cos(dot(wp, vec2(.2, -.9)) * 4.3 + t * 2.1) * .02;
  g += (vec2(vn(wp * 1.3 + t * .1), vn(wp * 1.3 + 17. + t * .1)) - .5) * .07;
  float rip = 0.;
  for (int i = 0; i < 10; i++){
    vec4 r = uRip[i];
    if (r.w <= 0.) continue;
    vec2 dv = wp - r.xy;
    float rr = length(dv), age = uTime - r.z;
    float R = age * .85 + .05;
    float prof = exp(-pow((rr - R) / (.09 + age * .07), 2.)) * exp(-age * .85) * r.w;
    g += dv / max(rr, 1e-3) * prof * sin((rr - R) * 17.) * .9;
    rip += prof * abs(sin((rr - R) * 17.));
  }
  // 雨だれの輪
  float rn = uMisc2.y;
  if (rn > .01){
    for (int L = 0; L < 2; L++){
      float sc = L == 0 ? 1.15 : 2.2;
      vec2 q = wp * sc, ci = floor(q), f = fract(q) - .5;
      float h = h21(ci + float(L) * 17.);
      vec2 ctr = (h22(ci + 3.) - .5) * .4;
      float ph = fract(uTime * uMisc2.x / (1.1 + h * .9) + h * 7.);
      float dd = length(f - ctr);
      float ring = exp(-pow((dd - ph * .42) / .04, 2.)) * smoothstep(.0, .06, ph) * (1. - ph) * step(h21(ci + 9.), rn * .85) * smoothstep(.04, .3, d);
      g += (f - ctr) / max(dd, 1e-3) * ring * .5;
      rip += ring * .5;
    }
  }
  vec2 off = g * (.012 + .06 * d);
  vec2 rw = vec2(w.x + off.x * 1.6, 2. * uHorizon - uv.y + off.y);
  #if QUALITY >= 1
    vec3 refl = scene(rw, true);
  #else
    vec3 refl = sky(rw, true);
  #endif
  vec3 body = uWater * (uAmb * .9 + .06);
  body = mix(body * 1.5, body * .5, smoothstep(0., .8, d));
  float ndv = mix(.06, .75, d);
  float F = .04 + .96 * pow(1. - ndv, 4.);
  vec3 col = mix(body, refl, clamp(F * 1.05, 0., 1.));
  // 太陽・月の光の道
  float sx = uP1.x * .42 * A, mx = uP1.z * .42 * A;
  float glit = smoothstep(.5, 1., vn(wp * vec2(7., 15.) + t * .6) + g.x * 2.5);
  col += uSunCol * glit * exp(-pow((w.x - sx) / (.04 + .22 * d), 2.)) * uP0.z * (.5 + 1.8 * (1. - d)) * smoothstep(.0, .06, uP1.y + .02);
  col += vec3(.5, .6, 1.) * glit * exp(-pow((w.x - mx) / (.03 + .16 * d), 2.)) * uP0.y * .7 * smoothstep(0., .05, uP1.w);
  col += uAmb * rip * .22;
  // スイレン（かたまりで浮かぶ。葉にはすじと、濡れたつや）
  #if QUALITY >= 2
  if (uMisc.x > .01 && d > .03){
    vec2 q = wp / 1.5, ci = floor(q);
    for (int j = -1; j <= 1; j++){
      for (int i = -1; i <= 1; i++){
        vec2 c = ci + vec2(float(i), float(j));
        vec2 cp = (c + .2 + .6 * h22(c + 3.1)) * 1.5;
        float clus = smoothstep(.42, .7, vn(cp * .16 + 3.));
        if (h21(c) > uMisc.x * .9 * clus) continue;
        float rad = .13 + .15 * h21(c + 9.);
        vec2 dv = wp - cp + g * .05;
        float rr = length(dv);
        if (rr > rad + .08) continue;
        float ang = atan(dv.y, dv.x);
        float notch = smoothstep(.22, .1, abs(ang - (h21(c + 5.) * 6. - 3.)));
        float m = smoothstep(rad, rad - .03, rr) * (1. - notch * step(rr, rad));
        float shadow = smoothstep(rad + .08, rad - .02, rr) * .22;
        col *= 1. - shadow * (1. - m) * (1. - uSeason.w);
        if (m <= 0.) continue;
        float nr = rr / rad;
        vec3 pad = mix(vec3(.035, .12, .045), vec3(.12, .27, .08), clamp(dv.y / rad * .5 + .5, 0., 1.) * .6 + .25 * h21(c + 2.));
        pad = mix(pad, vec3(.5, .36, .1), uSeason.z * .6);
        pad *= 1. - pow(abs(sin(ang * 9. + h21(c) * 6.)), 20.) * .3 * smoothstep(.1, .5, nr);
        pad *= mix(.7, 1.15, smoothstep(.55, 1., nr));
        pad *= (uAmb * .8 + uSunCol * uP0.z * .16 + .02);
        pad += refl * .16 * (1. - nr * .4);
        float fl = step(h21(c + 11.), .38);
        vec2 fv = dv - vec2(.04, .02) * rad / .2;
        float fr = length(fv), fa = atan(fv.y, fv.x);
        float fm = smoothstep(.07, .05, fr * (1. + .22 * cos(fa * 7.))) * fl;
        vec3 flc = mix(vec3(.98, .8, .88), vec3(1., .95, .9), smoothstep(.0, .05, fr));
        pad = mix(pad, flc * (uAmb * .9 + .25), fm * (uSeason.y + uSeason.x * .5));
        col = mix(col, pad, m * (1. - uSeason.w));
      }
    }
  }
  #endif
  // 氷（冬）のうすい光
  col += vec3(.1, .13, .15) * uSeason.w * glit * .3;
  // 水平線のぼかし・もや
  col = mix(col, uHor * 1.05, exp(-d * 22.) * .55);
  col += uHor * exp(-pow((uv.y - uHorizon + .02) / .05, 2.)) * uP2.z * .5 * (.6 + .4 * vn(vec2(w.x * 2.4 + uTime * .02, uv.y * 20.)));
  return col;
}

// ---- 舞うもの（桜の花びら・落ち葉・雪） ----
vec3 particles(vec2 uv, vec3 col){
  float amt = uMisc.y;
  if (amt < .01) return col;
  float wind = uP2.w;
  for (int L = 0; L < 3; L++){
    float fl = float(L);
    float sc = 7. + fl * 8.;
    vec2 p = vec2(uv.x * A, uv.y) * sc;
    float spd = (.28 + .2 * fl);
    p.y += uTime * spd * (.6 + .4 * wind) * uMisc2.x;
    p.x += (sin(uTime * .35 + fl * 2.) * .8 + uTime * .25) * uMisc2.x;
    vec2 ci = floor(p), f = fract(p);
    float r = h21(ci + fl * 17.);
    float dens = (.12 * uSeason.x + .11 * uSeason.z + .2 * uSeason.w) * amt * (.6 + .4 * fl);
    if (r > dens) continue;
    vec2 pos = .25 + .5 * h22(ci + fl * 5.);
    pos.x += .18 * sin(uTime * (.8 + r * 1.4) + r * 20.);
    vec2 dv = f - pos;
    float size = (.045 + .06 * h21(ci + 9.)) * (.85 + fl * .45);
    float ang = uTime * (.5 + r) * uMisc2.x + r * 6.28;
    vec2 q = vec2(cos(ang) * dv.x - sin(ang) * dv.y, sin(ang) * dv.x + cos(ang) * dv.y);
    float aS = smoothstep(size * .8, size * .25, length(dv));
    float aP = smoothstep(1., .3, length(vec2(q.x / (size * 1.8), q.y / (size * .9))));
    float aL = smoothstep(1., .5, abs(q.x) / (size * 1.7) + abs(q.y) / (size * .85));
    vec3 petal = mix(vec3(1., .72, .8), vec3(1., .9, .92), h21(ci + 2.));
    float lk = h21(ci + 4.);
    vec3 leaf = lk < .4 ? vec3(.85, .4, .06) : (lk < .75 ? vec3(.7, .12, .05) : vec3(.86, .66, .1));
    float a = aP * uSeason.x * (1. - uSeason.w) + aL * uSeason.z + aS * uSeason.w;
    vec3 c = (petal * aP * uSeason.x + leaf * aL * uSeason.z + vec3(.95, .97, 1.) * aS * uSeason.w) / max(a, 1e-3);
    float lit = dot(uAmb, vec3(.33)) + uP0.z * .25 + .05;
    col = mix(col, c * (lit + .1), clamp(a, 0., 1.) * (.85 - .15 * fl));
  }
  return col;
}

void main(){
  A = uRes.x / uRes.y;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 w = vec2((uv.x - .5) * A, uv.y);
  vec3 col = uv.y >= uHorizon ? scene(w, false) : waterShade(uv, w);
  col = particles(uv, col);
  float rs = uMisc2.y * (1. - uSeason.w);
  if (rs > .01){
    float r1 = rainLayer(uv, 44., 2.4, 3.), r2 = rainLayer(uv, 80., 3.2, 11.);
    col += vec3(.7, .8, .95) * (r1 * .6 + r2 * .45) * rs * (.08 + .36 * (1. - uP0.y) + .14 * uP0.z);
  }
  col *= uP0.w;
  col = aces(col);
  // 周辺をすこし暗く、影にほのかな青
  vec2 v = (uv - .5) * vec2(A * .62, 1.);
  col *= mix(.7, 1., smoothstep(.95, .2, length(v)));
  col += vec3(-.004, .0, .01) * (1. - dot(col, vec3(.33)));
  col = pow(col, vec3(1. / 2.2));
  // フィルム粒子（階調のすじを消す）
  float n = h21(gl_FragCoord.xy + fract(uTime) * 61.) + h21(gl_FragCoord.xy * 1.7 + 7.) - 1.;
  col += n * .012;
  fragColor = vec4(col, 1.);
}`;
