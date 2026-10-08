// 南の海のさかな（ひだまり浜）: キイロハギ・ヤッコ・ツノダシ・ムラサメモンガラ・フエヤッコダイ・ナガブダイ・ヒメスズメダイ・ロウニンアジ…
// fishmodels.js の仕組み（ロフト体＋描き込みのアトラス＋ひれ）に、registerFish で足す。
//  体の絵は (u, ang): u = 鼻先0〜尾1、b = sin(ang) = 腹-1〜背+1（左右とも同じ）
import * as THREE from 'three';
import { registerFish, bodyPaint, mixC, mul, hex, ss, an, curve, noise2, clamp, lerp, TAU } from './fishmodels.js';

// 縦のおび（u0〜u1）。soft はふちのぼかし
const bar = (u, u0, u1, soft = 0.012) => ss(u0 - soft, u0 + soft, u) * (1 - ss(u1 - soft, u1 + soft, u));
// うすい線（中心 u0・太さ w）
const line = (u, u0, w = 0.006) => Math.exp(-Math.pow((u - u0) / w, 2));
const glossy = (o = {}) => ({ rough: 0.34, metal: 0.04, coat: 0.95, coatR: 0.1, irid: 0.12, bump: 0.9, env: 1.25, ...o });

// ひれの形（s: 0=前 → 1=後ろ）
const sailTall = (s) => 0.3 + 0.7 * Math.pow(s, 1.5);                         // うしろほど高い（ヤッコの、のびたひれ）
const sailArc = (s) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.7) * (1 - 0.15 * s) + 0.08;
const sailFore = (s) => 0.25 + 0.75 * Math.pow(1 - s, 0.9);                   // 前が高い

// ---------------------------------------------------------------------------
// キイロハギ（Zebrasoma flavescens）— まっ黄色の、うすい円盤。
//  とがって突き出た口先、そこから急にせり上がるひたい、高い位置の大きな目。
//  背びれ・しりびれは高く、体とつながって、全体はほぼ丸い。尾は切れ込みが浅く、付け根に白いとげ（メス）
const tangFin = curve([[0, 0.34], [0.14, 0.52], [0.34, 0.76], [0.54, 0.94], [0.7, 1.0], [0.82, 0.93], [0.92, 0.72], [1, 0.42]]);
const tangAnal = curve([[0, 0.3], [0.16, 0.56], [0.38, 0.84], [0.58, 0.98], [0.72, 1.0], [0.84, 0.9], [0.93, 0.68], [1, 0.4]]);
registerFish('kiiroHagi', {
  body: {
    Ht: 0.3, Hb: 0.28, W: 0.058, p: 2.4, gill: 0.008, gillT: 0.3,
    yc: [[0, -0.07], [0.06, -0.064], [0.14, -0.042], [0.26, -0.014], [0.4, 0], [1, 0]],
    top: [[0, 0], [0.015, 0.07], [0.05, 0.1], [0.09, 0.15], [0.13, 0.25], [0.17, 0.42], [0.21, 0.58], [0.26, 0.73], [0.32, 0.86], [0.4, 0.96], [0.5, 1], [0.6, 0.97], [0.7, 0.86], [0.79, 0.66], [0.86, 0.44], [0.92, 0.27], [0.965, 0.19], [1, 0.16]],
    bot: [[0, 0], [0.015, 0.06], [0.05, 0.11], [0.09, 0.2], [0.14, 0.36], [0.2, 0.55], [0.27, 0.74], [0.35, 0.88], [0.45, 0.98], [0.55, 1], [0.65, 0.94], [0.74, 0.8], [0.82, 0.6], [0.88, 0.42], [0.93, 0.28], [0.97, 0.2], [1, 0.16]],
    w: [[0, 0], [0.015, 0.25], [0.06, 0.4], [0.14, 0.7], [0.25, 0.95], [0.4, 1], [0.6, 0.9], [0.8, 0.55], [0.93, 0.36], [1, 0.26]],
    fins: {
      dorsal: [0.24, 0.95, 0.21], anal: [0.4, 0.95, 0.19],
      caudal: { L: 0.17, H: 0.15, ext: (q) => (0.8 + 0.2 * Math.pow(q, 1.5)) * Math.sqrt(Math.max(0, 1 - Math.pow(q, 6) * 0.5)) },
      pect: [0.34, 0.14], pelv: [0.34, 0.11],
      dshape: tangFin, dsweep: 0.32, ashape: tangAnal, asweep: 0.3,
    },
    eye: [0.23, 0.034, 0.8],
    wig: { amp: 0.03, wave: 5, fin: 6.5 },
    // 尾の付け根の、白いとげ（さやにおさまった、メスのような刃）
    extra({ P, parts, taperTube, SW }) {
      for (const sg of [1, -1]) {
        const th = sg > 0 ? 0.08 : Math.PI - 0.08;
        const pts = [0.87, 0.9, 0.93].map((t) => { const q = P(t, th); return [q[0], q[1], q[2] + sg * 0.004]; });
        parts.push(taperTube(pts, 0.01, 0.004, SW.accent, 6, null));
      }
    },
  },
  painter: {
    body: bodyPaint({
      back: hex(0xf0c400), flank: hex(0xffd800), belly: hex(0xffe25a), nc: 90, nr: 50, rimK: 0.18, scaleK: 0.35, glint: hex(0xfff2a0), glintK: 0.2, lat: false, gillU: 0.3, gillK: 0.4, sc0: 0.31, mottle: 0.05,
      extra: (c, u, ang, b) => {
        c = mixC(c, hex(0xfff3a8), ss(0.12, 0.0, u) * 0.25);                                          // 口先は、少し明るい
        c = mixC(c, hex(0xffe680), ss(0.2, 0.0, Math.abs(b - 0.25)) * ss(0.35, 0.5, u) * 0.12);      // 体の横の、うすい光沢の帯
        const spine = Math.exp(-(Math.pow((u - 0.9) / 0.03, 2) + Math.pow((b - 0.06) / 0.14, 2)));   // とげのまわりの白
        return mixC(c, hex(0xf8f6ea), spine * 0.9);
      },
    }),
    eye: { skin: 0xe8c000, iris: 0x24241c, iris2: 0x4a4018, pupil: 0.5 },
    fin: [0xf4c800, 0xffde3a], finEdge: 0xffe868, finBase: 0xf6cc00, dark: 0x6a5410, barbel: 0xf4f0e0, accent: 0xfbfaf2, rays: 24, finA: [0.72, 0.97],
    // ひれも体と同じ、むらのない黄色（すじは、うっすら）。ふちだけ少しすける
    finPaint: (k, sl, r, c, a, ray) => {
      const y = mixC(hex(0xf6ca00), hex(0xffdc30), r);
      const cc = mixC(y, c, 0.3);
      const aa = (k === 3 ? 0.55 : 0.93) * (1 - 0.35 * ss(0.85, 1.0, r)) * (0.94 + 0.06 * ray);
      return [cc[0], cc[1], cc[2], aa];
    },
  },
  look: glossy({ irid: 0.04, coat: 0.8 }),
});

// ---------------------------------------------------------------------------
// ポッターズエンゼルフィッシュ（Centropyge potteri）— ハワイとジョンストン環礁にしかいない小さなヤッコ。
//  さび色のオレンジの体に、ふぞろいな青灰色の細い縦線が、体じゅうに入る。体の下とうしろは青黒い。
//  背びれ・しりびれ・尾は青黒く、あざやかな青のすじとふち。胸びれ・腹びれはオレンジ
registerFish('potter', {
  body: {
    Ht: 0.3, Hb: 0.285, W: 0.075, p: 2.2, gill: 0.012, gillT: 0.22,
    yc: [[0, -0.02], [0.1, -0.004], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.16], [0.05, 0.4], [0.11, 0.66], [0.2, 0.88], [0.32, 1], [0.44, 0.99], [0.56, 0.92], [0.68, 0.78], [0.8, 0.58], [0.9, 0.38], [0.965, 0.26], [1, 0.16]],
    bot: [[0, 0], [0.012, 0.16], [0.05, 0.4], [0.11, 0.66], [0.2, 0.9], [0.32, 1], [0.46, 0.98], [0.58, 0.9], [0.7, 0.76], [0.82, 0.56], [0.91, 0.38], [0.97, 0.26], [1, 0.16]],
    w: [[0, 0], [0.012, 0.3], [0.05, 0.64], [0.14, 0.9], [0.3, 1], [0.55, 0.92], [0.8, 0.55], [0.95, 0.28], [1, 0.1]],
    fins: { dorsal: [0.22, 0.9, 0.2], anal: [0.5, 0.93, 0.18], caudal: { L: 0.15, H: 0.18, notch: 0, round: true }, pect: [0.27, 0.16], pelv: [0.4, 0.12], dshape: sailTall, dsweep: 0.55, ashape: sailTall, asweep: 0.5 },
    eye: [0.095, 0.03, 0.5],
    wig: { amp: 0.03, wave: 5, fin: 7 },
  },
  painter: {
    body: bodyPaint({
      back: hex(0xc8501a), flank: hex(0xe2681e), belly: hex(0xd25a26), nc: 52, nr: 32, rimK: 0.3, scaleK: 0.45, glint: hex(0xffc890), glintK: 0.16, lat: false, gillU: 0.22, gillK: 0.6, sc0: 0.23,
      extra: (c, u, ang, b) => {
        // 体の下とうしろは青黒い（オスほど広い）
        c = mixC(c, hex(0x18234e), clamp(ss(-0.05, -0.75, b) * 0.85 + ss(0.6, 0.92, u) * 0.55 * ss(0.9, 0.2, b)));
        // ふぞろいに波うつ、細い青灰色の縦線（体じゅう）
        const ph = (u + 0.008 * Math.sin(b * 8 + u * 37) + 0.004 * Math.sin(b * 19)) / 0.021;
        const ln = ss(0.16, 0.05, Math.abs(ph - Math.floor(ph) - 0.5)) * ss(0.13, 0.2, u) * ss(0.98, 0.94, u);
        c = mixC(c, hex(0x40609e), ln * 0.75);
        // 顔の青い線
        c = mixC(c, hex(0x4a90e8), line(u, 0.1, 0.005) * 0.45 * ss(-0.3, 0.6, b));
        return mul(c, 0.82 + 0.18 * (1 - Math.pow(Math.abs(b), 4)));
      },
    }),
    eye: { skin: 0xa04418, iris: 0xe8a838, iris2: 0x8a4a14, pupil: 0.4 },
    fin: [0x18234e, 0x2a56c8], finEdge: 0x4ab4ff, finBase: 0xc8501a, dark: 0x101c50, barbel: 0xe9b080, accent: 0x40a8ff, rays: 15, finA: [0.55, 0.95],
    finPaint: (k, s, r, c, a, ray) => {
      const navy = hex(0x141c44), blue = hex(0x3aa8ff), org = hex(0xd85a1e);
      if (k === 0 || k === 1 || k === 2) {
        let col = mixC(navy, org, (k === 2 ? 0.25 : 0.55) * ss(0.35, 0.0, r) * (k === 2 ? 1 : ss(0.7, 0.2, s)));
        const st = Math.max(Math.exp(-Math.pow((r - 0.58) / 0.035, 2)), Math.exp(-Math.pow((r - 0.76) / 0.03, 2)));
        col = mixC(col, blue, st * 0.8 * (k === 2 ? 0.5 : 1));
        col = mixC(col, blue, ss(0.88, 0.97, r) * 0.95);
        return [col[0], col[1], col[2], 0.93 * (0.92 + 0.08 * ray)];
      }
      const col = mixC(hex(0xe86a1e), hex(0xffa040), r);
      if (k === 3) return [col[0], col[1], col[2], 0.55 * (0.8 + 0.2 * ray)];
      const pv = mixC(col, blue, ss(0.2, 0.0, s) * 0.8);
      return [pv[0], pv[1], pv[2], 0.92];
    },
  },
  look: glossy({ irid: 0.15 }),
});

// ---------------------------------------------------------------------------
// フレームエンゼルフィッシュ（Centropyge loricula）— 頭から尾まで炎のような赤。わき腹に細い黒の縦じま。
//  背びれ・しりびれの後ろは黒く、青いすじが入る
registerFish('hifuki', {
  body: {
    Ht: 0.295, Hb: 0.275, W: 0.07, p: 2.2, gill: 0.012, gillT: 0.22,
    yc: [[0, -0.02], [0.1, -0.004], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.16], [0.05, 0.4], [0.11, 0.66], [0.2, 0.88], [0.32, 1], [0.44, 0.99], [0.56, 0.92], [0.68, 0.78], [0.8, 0.58], [0.9, 0.38], [0.965, 0.26], [1, 0.16]],
    bot: [[0, 0], [0.012, 0.16], [0.05, 0.4], [0.11, 0.66], [0.2, 0.9], [0.32, 1], [0.46, 0.98], [0.58, 0.9], [0.7, 0.76], [0.82, 0.56], [0.91, 0.38], [0.97, 0.26], [1, 0.16]],
    w: [[0, 0], [0.012, 0.3], [0.05, 0.64], [0.14, 0.9], [0.3, 1], [0.55, 0.92], [0.8, 0.55], [0.95, 0.28], [1, 0.1]],
    fins: { dorsal: [0.24, 0.9, 0.2], anal: [0.5, 0.93, 0.17], caudal: { L: 0.15, H: 0.17, notch: 0, round: true }, pect: [0.27, 0.15], pelv: [0.4, 0.1], dshape: sailTall, dsweep: 0.6, ashape: sailTall, asweep: 0.5 },
    eye: [0.095, 0.03, 0.5],
    wig: { amp: 0.03, wave: 5, fin: 7 },
  },
  painter: {
    body: bodyPaint({
      back: hex(0xd8200e), flank: hex(0xf43a10), belly: hex(0xff621a), nc: 52, nr: 32, rimK: 0.32, scaleK: 0.5, glint: hex(0xffa060), glintK: 0.18, lat: false, gillU: 0.22, gillK: 0.6, sc0: 0.23,
      extra: (c, u, ang, b) => {
        // 体は頭から尾まで、炎の赤。わき腹のまん中は、明るい橙
        c = mixC(c, hex(0xff8a1c), ss(0.5, 0.0, Math.abs(b + 0.05)) * ss(0.2, 0.4, u) * (1 - ss(0.72, 0.95, u)) * 0.5);
        c = mixC(c, hex(0xb81408), ss(0.5, 0.95, b) * 0.35);
        // 黒い縦じま（細く、少し波うつ）。背から、わき腹の下のほうまで
        for (const [u0, w] of [[0.34, 0.014], [0.425, 0.017], [0.505, 0.017], [0.585, 0.014]]) {
          const wv = u0 + 0.007 * Math.sin(b * 7 + u0 * 31);
          c = mixC(c, hex(0x14090c), ss(w, w * 0.4, Math.abs(u - wv)) * ss(-0.6, 0.0, b) * 0.92);
        }
        return mul(c, 0.86 + 0.14 * (1 - Math.pow(Math.abs(b), 4)));
      },
    }),
    eye: { skin: 0xc82a10, iris: 0xe8b838, iris2: 0x7a3a14, pupil: 0.4 },
    fin: [0xe0280e, 0xff5a1a], finEdge: 0x4a8cff, finBase: 0xe02a10, dark: 0x14090c, barbel: 0xe05020, accent: 0x40a0ff, rays: 15, finA: [0.55, 0.95],
    // 背びれ・しりびれの後ろ半分は黒く、ふちに沿って青いすじが何本か。尾と胸びれは赤〜橙で、ふちがすける
    finPaint: (k, sl, r, c, a, ray) => {
      const red = mixC(hex(0xe0260c), hex(0xff5418), r);
      if (k === 0 || k === 1) {
        const rear = ss(k === 0 ? 0.32 : 0.15, k === 0 ? 0.6 : 0.42, sl);
        let col = mixC(red, hex(0x0c0814), rear * ss(0.22, 0.48, r) * 0.95);
        const st = Math.max(Math.exp(-Math.pow((r - 0.6) / 0.04, 2)), Math.exp(-Math.pow((r - 0.78) / 0.035, 2)), Math.exp(-Math.pow((r - 0.94) / 0.04, 2)));
        col = mixC(col, hex(0x3c78ff), st * rear * 0.95);
        col = mixC(col, hex(0x4a8cff), (1 - rear) * ss(0.84, 0.98, r) * 0.55);   // 前のとげの先は、青
        return [col[0], col[1], col[2], 0.95 * (1 - 0.2 * ss(0.9, 1.0, r)) * (0.92 + 0.08 * ray)];
      }
      if (k === 2) { const col = mixC(hex(0xe8300c), hex(0xff7a24), r); return [col[0], col[1], col[2], (0.95 - 0.25 * r) * (0.88 + 0.12 * ray)]; }
      if (k === 3) { const col = mixC(hex(0xf05a1a), hex(0xffa050), r); return [col[0], col[1], col[2], 0.5 * (0.8 + 0.2 * ray)]; }
      const col = mixC(mixC(hex(0xe83010), hex(0xff6a20), r), hex(0x3a70ff), ss(0.25, 0.0, sl) * 0.8);
      return [col[0], col[1], col[2], 0.9];
    },
  },
  look: glossy({ irid: 0.2 }),
});

// ---------------------------------------------------------------------------
// ツノダシ（Zanclus cornutus）— とても平たく背の高い体に、つき出た口先。背びれの3本目のとげが白い長いむちになる。
//  体の前は白く、うしろへいくほど黄色。黒い帯が2本: 前の帯は目をつつみ、下へいくほど太く胸と腹びれまで。
//  うしろの帯は背びれ・しりびれまでのび、うしろを白と黒の細い線でふちどる。口先に黒ぶちの橙のくら、あごは黒。尾は黒く、ふちが白い
const idolBand1 = (u, b) => { const f = 0.245 - 0.06 * (1 - b) / 2, g = 0.36 + 0.14 * (1 - b) / 2; return ss(f - 0.012, f + 0.008, u) * ss(g + 0.012, g - 0.008, u); };
const idolDark = (u) => ss(0.655, 0.67, u) * ss(0.81, 0.795, u) + ss(0.832, 0.838, u) * ss(0.85, 0.844, u);
registerFish('tsunodashi', {
  body: {
    Ht: 0.46, Hb: 0.42, W: 0.055, p: 2.3, gill: 0.006, gillT: 0.3,
    yc: [[0, -0.01], [0.2, -0.004], [0.4, 0], [1, 0]],
    top: [[0, 0], [0.01, 0.07], [0.06, 0.1], [0.14, 0.13], [0.21, 0.2], [0.27, 0.45], [0.34, 0.74], [0.42, 0.94], [0.52, 1], [0.62, 0.96], [0.72, 0.82], [0.82, 0.6], [0.9, 0.38], [0.96, 0.22], [1, 0.14]],
    bot: [[0, 0], [0.01, 0.07], [0.06, 0.09], [0.14, 0.11], [0.21, 0.17], [0.27, 0.4], [0.34, 0.68], [0.42, 0.9], [0.52, 1], [0.62, 0.96], [0.72, 0.8], [0.82, 0.58], [0.9, 0.38], [0.96, 0.22], [1, 0.14]],
    w: [[0, 0], [0.01, 0.4], [0.06, 0.4], [0.16, 0.46], [0.28, 0.9], [0.42, 1], [0.7, 0.8], [0.92, 0.4], [1, 0.1]],
    fins: {
      dorsal: [0.3, 0.76, 0.3], anal: [0.44, 0.86, 0.24],
      caudal: { L: 0.15, H: 0.18, ext: (q) => (0.72 + 0.28 * Math.pow(q, 1.4)) * Math.sqrt(Math.max(0, 1 - Math.pow(q, 6) * 0.4)) },
      pect: [0.33, 0.15], pelv: [0.38, 0.13],
      dshape: (s) => 0.35 + 0.65 * Math.sin(Math.PI * Math.pow(s, 0.65)), dsweep: 0.42,
      ashape: (s) => 0.3 + 0.7 * Math.sin(Math.PI * Math.pow(s, 0.6)), asweep: 0.45, dKx: 1.2,
    },
    eye: [0.26, 0.03, 0.55],
    wig: { amp: 0.025, wave: 5, fin: 6 },
    extentBox: [-0.6, 0.51],
    // 背びれから流れる、白い長いむち
    extra({ P, parts, taperTube, SW }) {
      const A = P(0.46, Math.PI / 2);
      const pts = [
        [A[0], A[1] + 0.02, 0], [A[0] - 0.1, A[1] + 0.3, 0], [A[0] - 0.32, A[1] + 0.48, 0], [A[0] - 0.62, A[1] + 0.5, 0], [A[0] - 0.9, A[1] + 0.34, 0],
      ];
      parts.push(taperTube(pts, 0.0075, 0.0018, SW.barbel, 5, -0.01, -1));
    },
  },
  painter: {
    body: bodyPaint({
      back: hex(0xf4f0e2), flank: hex(0xf7f3e6), belly: hex(0xfaf7ee), nc: 40, nr: 30, rimK: 0.15, scaleK: 0.25, glintK: 0.12, lat: false, gillU: 0.3, gillK: 0.3, sc0: 0.3,
      extra: (c, u, ang, b) => {
        // 前は白、うしろへいくほど黄色（帯のあいだの上のほうと、尾の付け根）
        c = mixC(c, hex(0xf4d22a), ss(0.44, 0.62, u) * ss(-0.5, 0.15, b) * 0.95);
        c = mixC(c, hex(0xf0dc6a), ss(0.85, 0.9, u) * 0.8);
        // 黒い帯2本と、うしろの帯のうしろの白・黒の細線
        c = mixC(c, hex(0x14120f), clamp(idolBand1(u, b) + idolDark(u)) * 0.97);
        c = mixC(c, hex(0xfaf8f0), ss(0.81, 0.818, u) * ss(0.832, 0.826, u) * 0.9);
        // 口先: 黒ぶちの橙のくら（上側）。あごは黒
        const sad = bar(u, 0.05, 0.14, 0.012) * ss(-0.05, 0.3, b);
        const rim = bar(u, 0.04, 0.15, 0.012) * ss(-0.15, 0.2, b) - sad;
        c = mixC(c, hex(0x1a1612), clamp(rim) * 0.85);
        c = mixC(c, hex(0xf29a30), sad * 0.95);
        c = mixC(c, hex(0x14120f), ss(0.2, 0.12, u) * ss(-0.25, -0.55, b) * 0.9);
        return c;
      },
    }),
    eye: { skin: 0x14120f, iris: 0xb89a40, iris2: 0x3a2a10, pupil: 0.46 },
    fin: [0x14120f, 0xf4f0e0], finEdge: 0xf6f2e6, finBase: 0x14120f, dark: 0x14120f, barbel: 0xf6f4ee, accent: 0xf0d030, rays: 15, finA: [0.6, 0.97],
    // ひれ: 帯の位置で黒く、そのほかは白〜黄。尾は黒く、ふちが白い。腹びれは黒
    finPaint: (k, s, r, c, a, ray) => {
      const white = hex(0xf6f2e4), yel = hex(0xf2d84a), blk = hex(0x14120f);
      if (k === 0 || k === 1) {
        const u = k === 0 ? lerp(0.3, 0.76, s) + 0.08 * r : lerp(0.44, 0.86, s) + 0.08 * r;
        const bb = k === 0 ? 1 : -1;
        let col = mixC(white, yel, ss(0.5, 0.65, u) * 0.6);
        col = mixC(col, blk, clamp(idolBand1(u, bb) + idolDark(u) + (u > 0.84 ? 1 : 0)) * 0.95);
        col = mixC(col, white, ss(0.86, 0.97, r) * 0.7);
        return [col[0], col[1], col[2], (0.9 + 0.08 * ray) * (1 - 0.2 * ss(0.9, 1, r))];
      }
      if (k === 2) { const col = mixC(blk, white, ss(0.8, 0.9, r)); return [col[0], col[1], col[2], 0.95 * (0.9 + 0.1 * ray)]; }
      if (k === 3) return [235, 232, 220, 0.3 * (0.8 + 0.2 * ray)];
      return [blk[0], blk[1], blk[2], 0.95];
    },
  },
  look: glossy({ irid: 0.05, coat: 0.8 }),
});

// ---------------------------------------------------------------------------
// ムラサメモンガラ（Rhinecanthus rectangulus、フムフムヌクヌクアプアア）— ハワイの州の魚。
//  モンガラカワハギのなかまらしい、ひし形の体と長い口先。目は頭の高いところ、ずっと後ろ。
//  背は黄土色、腹と頭の下は白。目から しりびれへ、ななめの太い黒帯。目のあいだに青と黒のすじ、
//  上くちびるに青い線。尾の付け根には、前を向いた黒いくさびと、その前に黄色いV字が2本
const trigSoft = (s) => (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05 + 0.12)), 0.6)) * (1 - 0.3 * s);
registerFish('muramasa', {
  body: {
    Ht: 0.26, Hb: 0.24, W: 0.09, p: 2.2, gill: 0.004, gillT: 0.34,
    yc: [[0, -0.03], [0.1, -0.02], [0.3, -0.004], [0.5, 0], [1, 0]],
    top: [[0, 0], [0.02, 0.1], [0.08, 0.28], [0.15, 0.47], [0.22, 0.66], [0.3, 0.84], [0.4, 0.96], [0.5, 1], [0.6, 0.97], [0.7, 0.85], [0.8, 0.64], [0.88, 0.45], [0.94, 0.33], [1, 0.28]],
    bot: [[0, 0], [0.02, 0.1], [0.08, 0.25], [0.15, 0.42], [0.25, 0.66], [0.35, 0.86], [0.45, 0.98], [0.52, 1], [0.62, 0.94], [0.72, 0.8], [0.82, 0.6], [0.9, 0.42], [0.95, 0.33], [1, 0.28]],
    w: [[0, 0], [0.02, 0.3], [0.1, 0.6], [0.25, 0.9], [0.4, 1], [0.6, 0.9], [0.8, 0.6], [0.95, 0.42], [1, 0.32]],
    // 背びれ: 目のすぐ後ろに、太いとげ（引き金）の小さなひれ。うしろの軟らかいひれは extra で足す（しりびれと対になる）
    fins: {
      dorsal: [0.31, 0.38, 0.12], anal: [0.56, 0.87, 0.1],
      caudal: { L: 0.15, H: 0.14, ext: (q) => 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - Math.pow(q, 2.2))) },
      pect: [0.38, 0.09], pelv: [0.52, 0.02],
      dshape: (s) => 1 - 0.6 * s, dsweep: 0.6, ashape: trigSoft, asweep: 0.25, dKx: 0.5,
    },
    eye: [0.27, 0.03, 0.95],
    wig: { amp: 0.025, wave: 4, fin: 8 },
    extra({ P, fins, fin }) {
      const fd0 = 0.56, fd1 = 0.87, h = 0.11;
      fins.push(fin(
        (s) => P(lerp(fd0, fd1, s), Math.PI / 2),
        (s) => { const b = P(lerp(fd0, fd1, s), Math.PI / 2); const sh = trigSoft(s); return [b[0] - 0.03 * s - h * 0.25 * sh, b[1] + h * sh, b[2]]; },
        { N: 14, K: 4, type: 1, kx: 0.8 },
      ));
    },
  },
  painter: {
    body: bodyPaint({
      back: hex(0xa48a58), flank: hex(0xcdb684), belly: hex(0xf4f0e6), nc: 26, nr: 22, rimK: 0.45, scaleK: 0.7, glint: hex(0xfff0c8), glintK: 0.1, lat: false, gillU: 0.34, gillK: 0.3, sc0: 0.3,
      extra: (c, u, ang, b) => {
        c = mixC(c, hex(0xf6f2ea), ss(0.05, -0.4, b) * 0.9);                       // 腹と頭の下は白
        // 目（u 0.27・b 0.8）から しりびれの前（u 0.55・腹）へ、ななめの黒帯。下ほど太い
        const k = (0.81 - b) / 1.81;
        const ul = 0.27 + k * 0.28, w = 0.03 + 0.085 * k, du = Math.abs(u - ul);
        c = mixC(c, hex(0x141210), ss(w + 0.008, w - 0.004, du) * ss(0.98, 0.9, b) * 0.96);
        // 目のあいだ: 黒い帯の両わきに青い細線。頭の上を横切って、反対の目へつながる
        const top = ss(0.5, 0.7, b);
        c = mixC(c, hex(0x3a8ae6), top * Math.max(Math.exp(-Math.pow((du - w - 0.009) / 0.0045, 2)), Math.exp(-Math.pow((du - w - 0.026) / 0.0045, 2))) * 0.95);
        c = mixC(c, hex(0x161412), top * ss(0.024, 0.018, Math.abs(du - w - 0.0175)) * ss(w + 0.003, w + 0.008, du) * 0.8);
        // 上くちびるの青い線と、口先の明るい黄色み
        c = mixC(c, hex(0xe8d496), ss(0.12, 0.02, u) * ss(-0.3, 0.2, b) * 0.4);
        c = mixC(c, hex(0x2f7ad8), ss(0.04, 0.025, u) * ss(-0.15, 0.05, b) * ss(0.5, 0.3, b) * 0.9);
        // 尾の付け根: 前を向いた黒いくさび、その前に黄色いV字が2本
        const ab = Math.abs(b);
        const wedge = ss(0.8, 0.82, u) * ss(4.0 * (u - 0.8) + 0.04, 4.0 * (u - 0.8) - 0.02, ab) * ss(0.995, 0.97, u);
        for (const u0 of [0.765, 0.73]) {
          const v = ss(0.08, 0.03, Math.abs(ab - 4.0 * (u - u0))) * ss(u0 - 0.005, u0 + 0.01, u) * ss(0.8, 0.65, ab);
          c = mixC(c, hex(0xf0c234), v * 0.9);
        }
        c = mixC(c, hex(0x121010), wedge * 0.95);
        return c;
      },
    }),
    eye: { skin: 0x2a2620, iris: 0x8a6a2a, iris2: 0x3a2a14, pupil: 0.5 },
    fin: [0xcbbd94, 0xf2ecd8], finBase: 0xb8a878, dark: 0x2e2216, barbel: 0xc8b88a, accent: 0xe0a448, rays: 11, finA: [0.3, 0.78],
  },
  look: glossy({ irid: 0.04, bump: 1.6, coat: 0.55, rough: 0.45 }),
});

// ---------------------------------------------------------------------------
// フエヤッコダイ（Forcipiger flavissimus）— 黄色い体に、ピンセットのような長い口先。
//  頭の上半分は黒く、下半分とのどは銀白色。しりびれのうしろの端に黒い点。尾びれはすきとおる
registerFish('hashinaga', {
  body: {
    Ht: 0.36, Hb: 0.33, W: 0.06, p: 2.3, gill: 0.006, gillT: 0.38,
    yc: [[0, -0.01], [0.2, -0.004], [0.4, 0], [1, 0]],
    top: [[0, 0], [0.01, 0.08], [0.08, 0.1], [0.18, 0.13], [0.28, 0.17], [0.35, 0.34], [0.42, 0.62], [0.5, 0.88], [0.6, 1], [0.7, 0.94], [0.8, 0.74], [0.88, 0.5], [0.95, 0.3], [1, 0.18]],
    bot: [[0, 0], [0.01, 0.07], [0.08, 0.09], [0.18, 0.11], [0.28, 0.15], [0.35, 0.34], [0.42, 0.62], [0.5, 0.9], [0.6, 1], [0.7, 0.94], [0.8, 0.74], [0.88, 0.5], [0.95, 0.3], [1, 0.18]],
    w: [[0, 0], [0.01, 0.3], [0.08, 0.3], [0.2, 0.4], [0.34, 0.7], [0.46, 1], [0.7, 0.88], [0.92, 0.42], [1, 0.1]],
    fins: { dorsal: [0.42, 0.88, 0.2], anal: [0.55, 0.88, 0.17], caudal: { L: 0.12, H: 0.2, notch: 0, round: true }, pect: [0.4, 0.13], pelv: [0.5, 0.15], dshape: sailArc, dsweep: 0.45, ashape: sailArc, asweep: 0.3 },
    eye: [0.38, 0.026, 0.55],
    wig: { amp: 0.03, wave: 5, fin: 7 },
  },
  painter: {
    body: bodyPaint({
      back: hex(0xf2c400), flank: hex(0xffd814), belly: hex(0xffe85a), nc: 48, nr: 30, rimK: 0.3, scaleK: 0.55, glint: hex(0xfff2a0), glintK: 0.2, lat: false, gillU: 0.38, gillK: 0.5, sc0: 0.4,
      extra: (c, u, ang, b) => {
        // 頭の上半分（口先の上・目・うなじ）は黒、下半分とのどは銀白色
        const head = ss(0.43, 0.36, u);
        c = mixC(c, hex(0x14120f), head * ss(-0.05, 0.25, b) * 0.97);
        c = mixC(c, hex(0xeef0ee), head * ss(0.0, -0.3, b) * 0.95);
        return c;
      },
    }),
    eye: { skin: 0x14120f, iris: 0x2a2418, iris2: 0x14100a, pupil: 0.5 },
    fin: [0xf2c400, 0xffe65a], finEdge: 0x14120f, finBase: 0xf4cc10, dark: 0x14120f, barbel: 0x2a2824, accent: 0xf8f6ee, rays: 15, finA: [0.55, 0.95],
    finPaint: (k, s, r, c, a, ray) => {
      const y = mixC(hex(0xf4c600), hex(0xffd830), r);
      if (k === 0 || k === 1) {
        let col = mixC(y, hex(0x1a1612), Math.exp(-Math.pow((r - 0.86) / 0.03, 2)) * 0.85);   // ふちの内側の黒い細線
        col = mixC(col, hex(0x9ad2ff), ss(0.9, 0.98, r) * 0.7);                              // ふちは淡い青
        if (k === 1) col = mixC(col, hex(0x0e0c0a), ss(0.11, 0.06, Math.hypot((s - 0.86) * 1.3, r - 0.5)) * 0.97);   // しりびれの黒い点
        return [col[0], col[1], col[2], 0.92 * (0.92 + 0.08 * ray)];
      }
      if (k === 2 || k === 3) return [236, 236, 228, (k === 2 ? 0.28 : 0.3) * (0.8 + 0.2 * ray)];
      return [y[0], y[1], y[2], 0.9];
    },
  },
  look: glossy({ irid: 0.04 }),
});

// ---------------------------------------------------------------------------
// ナガブダイ（Scarus rubroviolaceus、ハワイでは「ウフ」）— ハワイでいちばん大きなブダイのなかま。
//  まるい頭に、くちばしのような緑の歯。大きな鱗、低く長い背びれ。大きなオスは緑色で、体の前が濃く、うしろが明るい。
//  尾は竪琴（たてごと）のように、上下の先がのびる
registerFish('uhu', {
  body: {
    Ht: 0.19, Hb: 0.17, W: 0.1, p: 2.2, gill: 0.016, gillT: 0.22,
    yc: [[0, -0.02], [0.1, -0.008], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.01, 0.38], [0.035, 0.62], [0.08, 0.8], [0.15, 0.92], [0.26, 0.99], [0.4, 1], [0.55, 0.96], [0.68, 0.84], [0.8, 0.64], [0.9, 0.46], [0.96, 0.38], [1, 0.32]],
    bot: [[0, 0], [0.01, 0.3], [0.04, 0.55], [0.09, 0.74], [0.17, 0.88], [0.3, 0.98], [0.45, 1], [0.58, 0.94], [0.7, 0.8], [0.82, 0.6], [0.91, 0.44], [0.97, 0.36], [1, 0.32]],
    w: [[0, 0], [0.01, 0.42], [0.05, 0.74], [0.12, 0.92], [0.24, 1], [0.5, 0.98], [0.72, 0.74], [0.9, 0.46], [1, 0.3]],
    fins: {
      dorsal: [0.24, 0.86, 0.085], anal: [0.6, 0.86, 0.08],
      caudal: { L: 0.2, H: 0.2, ext: (q) => 0.42 + 0.58 * Math.pow(q, 1.5) + 0.32 * ss(0.78, 1.0, q) },
      pect: [0.27, 0.18], pelv: [0.37, 0.08],
      dshape: (s) => 0.82 + 0.18 * Math.sin(Math.PI * s), dsweep: 0.25,
    },
    eye: [0.1, 0.022, 0.62],
    wig: { amp: 0.045, wave: 6, fin: 6 },
    // くちばし（歯がくっついた板）: 口の上下に、緑の板
    extra({ P, parts, taperTube, SW }) {
      const F = P(0, 0);
      for (const [dy, r] of [[0.013, 0.0085], [-0.011, 0.0075]]) {
        const pts = [[F[0] - 0.022, F[1] + dy * 0.8, 0.026], [F[0] - 0.004, F[1] + dy, 0.014], [F[0] + 0.003, F[1] + dy, 0], [F[0] - 0.004, F[1] + dy, -0.014], [F[0] - 0.022, F[1] + dy * 0.8, -0.026]];
        parts.push(taperTube(pts, r, r * 0.9, SW.accent, 7, null));
      }
    },
  },
  painter: {
    body: bodyPaint({
      back: hex(0x1d7a58), flank: hex(0x3aa880), belly: hex(0x9ad6c0), nc: 22, nr: 22, rimK: 0.75, scaleK: 1.0, glint: hex(0xd8fff0), glintK: 0.24, lat: false, gillU: 0.22, sc0: 0.23,
      extra: (c, u, ang, b, S) => {
        // 体の前は濃い緑、うしろは明るい緑
        c = mixC(c, hex(0x14603f), ss(0.55, 0.15, u) * 0.45);
        c = mixC(c, hex(0x6fd0aa), ss(0.45, 0.85, u) * 0.35 * ss(-0.6, 0.4, b));
        // 鱗のふちは、ほんのりサーモン色
        c = mixC(c, hex(0xe0907a), S.rim * 0.32 * ss(0.25, 0.45, u) * ss(0.9, -0.3, b));
        // 口もとから目へ、目のうしろへ、細いオレンジの線
        c = mixC(c, hex(0xf0905a), line(b, 0.12 - u * 1.2, 0.03) * ss(0.0, 0.03, u) * ss(0.16, 0.08, u) * 0.6);
        c = mixC(c, hex(0xf0905a), line(b, 0.55, 0.03) * ss(0.12, 0.14, u) * ss(0.22, 0.16, u) * 0.5);
        return c;
      },
    }),
    eye: { skin: 0x1e7a58, iris: 0xe0a838, iris2: 0x8a4a14, pupil: 0.4 },
    fin: [0x2a9a80, 0xf09080], finEdge: 0x3aa0e0, finBase: 0x2a9a80, dark: 0x1a6a50, barbel: 0x9ae0c0, accent: 0x86d6b0, rays: 14, finA: [0.45, 0.9],
    // ひれ: 付け根は緑、まん中はサーモン色の帯、ふちは青。尾は緑に、サーモン色の三日月と青いふち
    finPaint: (k, s, r, c, a, ray) => {
      const g = hex(0x2a9a7a), sal = hex(0xf0907a), bl = hex(0x3a9ae6);
      if (k === 0 || k === 1) {
        let col = mixC(g, sal, ss(0.2, 0.4, r) * ss(0.92, 0.75, r));
        col = mixC(col, bl, ss(0.78, 0.92, r));
        return [col[0], col[1], col[2], 0.9 * (0.9 + 0.1 * ray)];
      }
      if (k === 2) {
        const lobe = Math.abs(s - 0.5) * 2;
        let col = mixC(g, sal, ss(0.25, 0.45, r) * ss(0.8, 0.6, r) * ss(0.85, 0.5, lobe));
        col = mixC(col, bl, clamp(ss(0.82, 0.95, r) + ss(0.8, 0.95, lobe) * 0.7));
        return [col[0], col[1], col[2], 0.92 * (0.9 + 0.1 * ray)];
      }
      if (k === 3) { const col = mixC(hex(0x3aa6b0), sal, ss(0.3, 0.0, s) * 0.5); return [col[0], col[1], col[2], 0.55 * (0.85 + 0.15 * ray)]; }
      const col = mixC(sal, bl, ss(0.2, 0.0, s) * 0.8);
      return [col[0], col[1], col[2], 0.9];
    },
  },
  look: glossy({ irid: 0.2, bump: 2.0, coat: 0.7 }),
});

// ---------------------------------------------------------------------------
// アホレホレ（Kuhlia xenura、ハワイの固有種）— 銀色の群れ魚。大きな目、少しくぼんだ頭の背、
//  深く切れこんだひとつながりの背びれ、二又の尾。ひれはすきとおり、尾のふちは黒っぽい
const flagDorsal = curve([[0, 0.5], [0.14, 1], [0.32, 0.86], [0.48, 0.42], [0.56, 0.34], [0.66, 0.6], [0.82, 0.6], [1, 0.36]]);
registerFish('aholehole', {
  body: {
    Ht: 0.165, Hb: 0.15, W: 0.06, p: 2.3, gill: 0.012, gillT: 0.22,
    yc: [[0, -0.03], [0.12, -0.008], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.16], [0.045, 0.32], [0.1, 0.48], [0.18, 0.72], [0.3, 0.94], [0.42, 1], [0.54, 0.94], [0.66, 0.76], [0.78, 0.54], [0.88, 0.38], [0.96, 0.3], [1, 0.14]],
    bot: [[0, 0], [0.012, 0.18], [0.045, 0.4], [0.1, 0.6], [0.2, 0.82], [0.34, 0.98], [0.5, 1], [0.62, 0.84], [0.74, 0.6], [0.84, 0.44], [0.93, 0.34], [0.98, 0.3], [1, 0.14]],
    w: [[0, 0], [0.012, 0.3], [0.05, 0.62], [0.14, 0.86], [0.3, 1], [0.55, 0.95], [0.8, 0.55], [0.95, 0.28], [1, 0.08]],
    fins: { dorsal: [0.36, 0.76, 0.17], anal: [0.6, 0.8, 0.11], caudal: { L: 0.21, H: 0.15, notch: 0.5 }, pect: [0.25, 0.12], pelv: [0.4, 0.1], dshape: flagDorsal, dsweep: 0.3 },
    eye: [0.1, 0.037, 0.42],
  },
  painter: {
    body: bodyPaint({
      back: hex(0x5a7480), flank: hex(0xcad9de), belly: hex(0xf6f9fa), nc: 44, nr: 30, rimK: 0.3, glint: hex(0xffffff), glintK: 0.5,
      extra: (c, u, ang, b, S) => {
        c = mixC(c, hex(0x3e5560), ss(0.2, 0.7, b) * 0.28 * ss(0.22, 0.4, u));
        // 頭の上は、銀と黒の網目
        const net = an(u, ang, 60, 3, 2);
        c = mixC(c, hex(0x2a3a44), ss(0.55, 0.9, b) * ss(0.3, 0.12, u) * ss(0.45, 0.7, net) * 0.6);
        return mixC(c, hex(0xf2e8b0), S.lit * 0.06 * ss(0.5, 0.9, u));
      },
    }),
    eye: { skin: 0x9aa8a8, iris: 0x1a1a18, iris2: 0x3a3a30, pupil: 0.55 },
    fin: [0xc8d2d6, 0xe8eef0], finBase: 0xb8c4c8, dark: 0x3a4a52, barbel: 0xe0e8ea, accent: 0xf4ecb0, rays: 12, finA: [0.22, 0.62],
    // 尾のふちは黒っぽい
    finPaint: (k, s, r, c, a, ray) => {
      if (k !== 2) return null;
      const col = mixC(c, hex(0x22303a), ss(0.7, 0.92, r) * 0.85);
      return [col[0], col[1], col[2], lerp(a, 0.85, ss(0.7, 0.9, r))];
    },
  },
  look: { rough: 0.28, metal: 0.22, coat: 0.9, coatR: 0.1, irid: 0.5, bump: 1.0, env: 1.4 },
});

// ---------------------------------------------------------------------------
// ヒメスズメダイ（Chromis vanderbilti / Pycnochromis vanderbilti）— ハワイのリーフにとても多い、6cmほどの小魚。
//  背はくすんだオリーブ、わき腹は黄色で、青い小さな点が鱗の列ごとにならび、すじのように見える。
//  背びれは前のとげの部分のふちが広く黄色。尻びれは青黒く、ふちが青。尾は深く切れこみ、上の葉は黄、下の葉は黒
const chromisDorsal = curve([[0, 0.35], [0.08, 0.62], [0.22, 0.6], [0.45, 0.52], [0.6, 0.56], [0.72, 0.82], [0.84, 1.0], [0.93, 0.78], [1, 0.3]]);
const chromisAnal = curve([[0, 0.3], [0.16, 0.62], [0.4, 0.8], [0.62, 0.95], [0.76, 1.0], [0.88, 0.78], [1, 0.3]]);
// 鱗の列ごとの、青い小さな点（nr 列・nc 個）
const chromisDots = (u, ang, nc, nr) => {
  const row = (ang / TAU) * nr, ri = Math.floor(row), rf = row - ri;
  const col = u * nc + (ri & 1) * 0.5, cf = col - Math.floor(col);
  const d = Math.hypot((cf - 0.5) * 1.15, (rf - 0.5) * 1.25);
  return ss(0.3, 0.16, d);
};
registerFish('himeSuzume', {
  body: {
    Ht: 0.2, Hb: 0.19, W: 0.072, p: 2.25, gill: 0.012, gillT: 0.27,
    yc: [[0, -0.012], [0.12, -0.002], [0.3, 0], [1, 0]],
    top: [[0, 0], [0.012, 0.2], [0.04, 0.42], [0.09, 0.64], [0.16, 0.84], [0.26, 0.97], [0.38, 1], [0.5, 0.96], [0.62, 0.84], [0.73, 0.64], [0.83, 0.42], [0.91, 0.28], [0.965, 0.23], [1, 0.2]],
    bot: [[0, 0], [0.012, 0.16], [0.04, 0.36], [0.1, 0.6], [0.2, 0.84], [0.32, 0.98], [0.44, 1], [0.56, 0.93], [0.67, 0.78], [0.77, 0.58], [0.86, 0.4], [0.93, 0.28], [0.975, 0.23], [1, 0.2]],
    w: [[0, 0], [0.012, 0.34], [0.05, 0.66], [0.14, 0.9], [0.3, 1], [0.55, 0.9], [0.8, 0.52], [0.95, 0.3], [1, 0.12]],
    fins: {
      dorsal: [0.26, 0.86, 0.1], anal: [0.6, 0.87, 0.095],
      // 深く切れこんだ二又の尾。葉の先はとがる
      caudal: { L: 0.31, H: 0.21, ext: (q) => (0.2 + 0.8 * Math.pow(q, 1.2)) * (1 - 0.22 * Math.pow(q, 12)) },
      pect: [0.29, 0.15], pelv: [0.36, 0.12],
      dshape: chromisDorsal, dsweep: 0.34, ashape: chromisAnal, asweep: 0.38,
    },
    eye: [0.09, 0.042, 0.42],
    // 胸びれで、こまめにはばたいて泳ぐ（体はあまりくねらせない）
    wig: { amp: 0.035, wave: 5.5, fin: 8 },
  },
  painter: {
    body: bodyPaint({
      back: hex(0x5e5222), flank: hex(0xe6c21c), belly: hex(0xeedc7a), nc: 26, nr: 22, rimK: 0.2, scaleK: 0.45, glint: hex(0xfff0b0), glintK: 0.2, lat: false, gillU: 0.27, gillK: 0.5, sc0: 0.28, mottle: 0.05,
      extra: (c, u, ang, b) => {
        // 背は くすんだオリーブ茶、目の上から背びれの付け根へ少し暗く
        c = mixC(c, hex(0x4a4020), ss(0.4, 0.95, b) * 0.55);
        // 青い点の列（鱗の列ごと）。わき腹から背に。腹のほうと頭の先は少なく
        const dots = chromisDots(u, ang, 26, 22) * ss(0.18, 0.28, u) * ss(0.97, 0.9, u) * ss(-0.6, -0.2, b) * (1 - 0.35 * ss(0.65, 0.95, b));
        c = mixC(c, hex(0x2e9cff), dots * 0.95);
        // 目の前の、青いすじ
        c = mixC(c, hex(0x5ab0ff), line(u, 0.06, 0.005) * ss(-0.1, 0.5, b) * 0.45);
        // 尾の付け根の下は、尾の黒につづいて少し暗く
        c = mixC(c, hex(0x22262e), ss(0.9, 1.0, u) * ss(0.1, -0.6, b) * 0.6);
        return c;
      },
    }),
    eye: { skin: 0x7a6a26, iris: 0x3a4a5a, iris2: 0x1a2028, pupil: 0.52 },
    fin: [0x5a5620, 0xd8c040], finEdge: 0x60b8ff, finBase: 0x6a6326, dark: 0x1a1e2a, barbel: 0xe0d8a0, accent: 0x48a8ff, rays: 14, finA: [0.55, 0.95],
    finPaint: (k, s, r, c, a, ray) => {
      const yel = hex(0xf0cc30), oli = hex(0x6a6326), blk = hex(0x161a24), blu = hex(0x4ab0ff);
      if (k === 0) {
        // 背びれ: 付け根はオリーブ、ふちの手前が広く黄色（前のとげの部分ほど広い）、いちばん外は細い青
        let col = mixC(mixC(oli, yel, 0.35), yel, ss(0.3, 0.55, r) * (0.6 + 0.4 * ss(0.75, 0.35, s)));
        col = mixC(col, blu, ss(0.9, 0.98, r) * 0.6);
        return [col[0], col[1], col[2], (0.62 + 0.14 * ray) * (1 - 0.3 * ss(0.92, 1.0, r))];
      }
      if (k === 1) {
        // 尻びれ: 青黒く、ふちが青
        const col = mixC(blk, blu, ss(0.86, 0.97, r) * 0.85);
        return [col[0], col[1], col[2], 0.9 * (0.92 + 0.08 * ray)];
      }
      if (k === 2) {
        // 尾: 上の葉は黄、下の葉は黒（s: 0=上 → 1=下）
        const low = ss(0.46, 0.56, s);
        let col = mixC(mixC(oli, yel, ss(0.0, 0.35, r)), blk, low);
        col = mixC(col, blu, low * ss(0.88, 0.98, r) * 0.35);
        return [col[0], col[1], col[2], lerp(0.72, 0.92, low) * (0.9 + 0.1 * ray) * (1 - 0.3 * ss(0.9, 1.0, r))];
      }
      if (k === 3) {
        // 胸びれ: すきとおった、うすい黄色
        const col = mixC(hex(0xd8c868), hex(0xf4e8a0), r);
        return [col[0], col[1], col[2], 0.32 * (0.8 + 0.2 * ray)];
      }
      // 腹びれ: くすんだ黄に、前のふちが青白い
      const col = mixC(mixC(oli, yel, 0.5), blu, ss(0.18, 0.0, s) * 0.6);
      return [col[0], col[1], col[2], 0.85];
    },
  },
  look: glossy({ irid: 0.25, coat: 0.85 }),
});

// ---------------------------------------------------------------------------
// パピオ（ロウニンアジ Caranx ignobilis の若魚）／ウルア（おとな）— アジのなかま。
//  急な ひたいの、高い体。小さなとげの背びれのあと、鎌のようにとがった2つめの背びれ・しりびれ。
//  長い鎌形の胸びれ、深く切れこんだ三日月の尾。体のうしろの まっすぐな側線に、かたい鱗（ぜいご）が並ぶ
const jackLobe = curve([[0, 0.55], [0.05, 1], [0.14, 0.62], [0.3, 0.36], [0.6, 0.3], [1, 0.22]]);
const jackBody = (o = {}) => ({
  Ht: 0.22, Hb: 0.2, W: 0.075, p: 2.25, gill: 0.012, gillT: 0.24,
  yc: [[0, -0.06], [0.08, -0.03], [0.2, -0.008], [0.35, 0], [1, 0]],
  top: o.top || [[0, 0], [0.012, 0.28], [0.04, 0.52], [0.09, 0.76], [0.16, 0.92], [0.26, 1], [0.38, 0.98], [0.5, 0.88], [0.62, 0.7], [0.74, 0.5], [0.84, 0.32], [0.92, 0.2], [0.97, 0.13], [1, 0.1]],
  bot: [[0, 0], [0.012, 0.2], [0.05, 0.42], [0.12, 0.68], [0.22, 0.9], [0.34, 1], [0.46, 0.95], [0.58, 0.78], [0.7, 0.56], [0.8, 0.38], [0.9, 0.22], [0.97, 0.14], [1, 0.1]],
  w: [[0, 0], [0.012, 0.3], [0.05, 0.6], [0.14, 0.86], [0.3, 1], [0.55, 0.9], [0.8, 0.5], [0.94, 0.3], [1, 0.16]],
  fins: {
    dorsal: [0.48, 0.9, 0.16], anal: [0.56, 0.9, 0.14],
    caudal: { L: 0.3, H: 0.26, ext: (q) => (0.16 + 0.84 * Math.pow(q, 1.15)) * Math.sqrt(Math.max(0, 1 - Math.pow(q, 8) * 0.3)) },
    pect: [0.24, 0.26], pelv: [0.36, 0.09],
    dshape: jackLobe, dsweep: 0.55, ashape: jackLobe, asweep: 0.5,
  },
  eye: [0.09, 0.034, 0.5],
  wig: { amp: 0.06, wave: 7, fin: 5.5 },
  // 先に、小さなとげの背びれ
  extra({ P, fins, fin }) {
    const fd0 = 0.3, fd1 = 0.44, h = 0.08;
    fins.push(fin(
      (s) => P(lerp(fd0, fd1, s), Math.PI / 2),
      (s) => { const b = P(lerp(fd0, fd1, s), Math.PI / 2); return [b[0] - 0.04 * s, b[1] + h * (1 - 0.7 * s) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, s * 1.15 + 0.1))), b[2]]; },
      { N: 8, K: 3, type: 1, kx: 0.5 },
    ));
  },
});
// 側線のうしろの まっすぐな部分に並ぶ、かたい鱗（ぜいご）
const scutes = (c, u, b, dark, light) => {
  const on = ss(0.6, 0.63, u) * ss(0.985, 0.96, u);
  const k = (u - 0.6) / 0.019, f = k - Math.floor(k);
  const v = ss(0.07, 0.02, Math.abs(Math.abs(b - 0.02) - f * 0.07)) * ss(0.08, 0.05, Math.abs(b - 0.02));
  c = mixC(c, dark, on * ss(0.075, 0.03, Math.abs(b - 0.02)) * 0.45);
  return mixC(c, light, on * v * 0.5);
};
const jackFin = (tint) => (k, s, r, c, a, ray) => {
  const [base, tip, al] = tint[k];
  const col = mixC(hex(base), hex(tip), r);
  return [col[0], col[1], col[2], al * (0.88 + 0.12 * ray)];
};
registerFish('papio', {
  body: jackBody(),
  painter: {
    body: bodyPaint({
      back: hex(0x3e5868), flank: hex(0xc4ccc8), belly: hex(0xeeeee6), nc: 44, nr: 30, rimK: 0.25, glint: hex(0xfffbe0), glintK: 0.45, gillU: 0.24,
      extra: (c, u, ang, b, S) => {
        c = mixC(c, hex(0xe4c35a), ss(-0.2, 0.3, b) * ss(0.7, 0.3, b) * 0.16 * ss(0.3, 0.6, u));   // ほんのり金色のつや
        c = mixC(c, hex(0x26343e), ss(0.5, 1.0, b) * 0.35);
        return scutes(c, u, b, hex(0x2a343a), hex(0xe8ece8));
      },
    }),
    eye: { skin: 0x9aa8a8, iris: 0xc8a440, iris2: 0x7a5a1c, pupil: 0.42 },
    fin: [0x6a7a84, 0xd8c878], finEdge: 0x2a3a44, finBase: 0x8aa0a8, dark: 0x2a3a44, barbel: 0xd8e0e0, accent: 0xe8d884, rays: 12, finA: [0.45, 0.9],
    // 背びれ・尾はくすんだ灰色、しりびれ・腹びれ・胸びれは黄色み（若魚）
    finPaint: jackFin([[0x5a6a74, 0x7a8a90, 0.85], [0xc8b45a, 0xe8d888, 0.85], [0x6a7a7c, 0x4a5a60, 0.88], [0xd0c070, 0xe8dc9a, 0.5], [0xe0d49a, 0xf4ecc8, 0.85]]),
  },
  look: { rough: 0.3, metal: 0.2, coat: 0.9, coatR: 0.1, irid: 0.45, bump: 1.0, env: 1.4 },
});
// ウルア（おとなのロウニンアジ、海のぬし）— ひたいはさらに急で、体は黒っぽい銀
registerFish('ulua', {
  body: jackBody({ top: [[0, 0], [0.012, 0.34], [0.04, 0.6], [0.09, 0.82], [0.16, 0.95], [0.26, 1], [0.38, 0.98], [0.5, 0.88], [0.62, 0.7], [0.74, 0.5], [0.84, 0.32], [0.92, 0.2], [0.97, 0.13], [1, 0.1]] }),
  painter: {
    body: bodyPaint({
      back: hex(0x26323a), flank: hex(0x7a8488), belly: hex(0xc4c8c4), nc: 50, nr: 32, rimK: 0.3, glint: hex(0xe8eef0), glintK: 0.35, gillU: 0.24,
      extra: (c, u, ang, b, S) => {
        c = mixC(c, hex(0x1a2228), ss(0.4, 1.0, b) * 0.4);
        const sp = an(u, ang, 30, 4, 2);
        c = mixC(c, hex(0x1e262c), ss(0.6, 0.8, sp) * 0.18 * ss(0.3, 0.5, u) * ss(-0.3, 0.4, b));   // 年を経た、くすんだまだら
        return scutes(c, u, b, hex(0x161c20), hex(0xa8b0b0));
      },
    }),
    eye: { skin: 0x5a6468, iris: 0xb89a40, iris2: 0x6a4a1c, pupil: 0.44 },
    fin: [0x3a464c, 0x5a666a], finEdge: 0x1a2226, finBase: 0x3a464c, dark: 0x1a2226, barbel: 0xa0a8a8, accent: 0x6a7478, rays: 12, finA: [0.5, 0.92],
    finPaint: jackFin([[0x2e383e, 0x3e484e, 0.9], [0x3a4448, 0x56606a, 0.9], [0x2e383e, 0x20282c, 0.92], [0x4a5458, 0x6a7478, 0.6], [0x5a6468, 0x8a9498, 0.85]]),
  },
  look: { rough: 0.32, metal: 0.18, coat: 0.85, coatR: 0.12, irid: 0.3, bump: 1.1, env: 1.3 },
});
