// 共有ユニフォームとマテリアル拡張（水中の濁り・細部ノイズ・葉の透過光・風）
import * as THREE from 'three';
import { makeDetailTexture } from './textures.js';

export const G = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0.3) },
  uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) },
  uUnderColor: { value: new THREE.Color(0.05, 0.085, 0.05) },
  uUnderAbsorb: { value: 1.05 },
  uUnderTrans: { value: new THREE.Vector3(0.6, 0.6, 0.6) },   // 水中で物の色が薄れる速さ（RGBごと。海は赤が先に消える）
  uUnderDeep: { value: new THREE.Color(0.05, 0.085, 0.05) },  // ふかい所の水の色（浅い所は uUnderColor）
  uCaustic: { value: 0 },                                     // 海ぞこの光のゆらぎ（0 = なし）
  uUnderGain: { value: 1 },                                   // 水のなかで、物の明るさが落ちる割合（海は日ざしが強いので、おさえる）
  uWetness: { value: 0 },
  uDetail: { value: null },
  // 水槽（ひだまり浜の鑑賞モード）: 箱の中の水（ワールド座標。max.y が水面）
  uTankOn: { value: 0 },
  uTankMin: { value: new THREE.Vector3(0, -99, 0) },
  uTankMax: { value: new THREE.Vector3(0, -99, 0) },
  uTankLed: { value: new THREE.Color(0, 0, 0) },     // 照明の明るさと色（白〜青）
  uTankAct: { value: new THREE.Color(0, 0, 0) },     // 青い光（サンゴの蛍光を光らせる）
  uTankWater: { value: new THREE.Color(0, 0, 0) },   // 水の中で散る光の色
  uTankFlow: { value: new THREE.Vector2(0, 0) },     // 造波ポンプの流れ（行ったり来たり）
  uTankSpots: { value: new THREE.Vector4(0, 0, 0, 0) },  // 3つの照明の x（3つ）と z（ワールド座標）
  uTankSpotY: { value: 0 },                              // 照明の下面の高さ
};

// 水槽の水: 箱に入ってからの距離で色が抜け、水面でゆらいだ光が網になって落ちる。光の柱も
export const TANK_GLSL = /* glsl */ `
uniform float uTankOn;
uniform vec3 uTankMin;
uniform vec3 uTankMax;
uniform vec3 uTankLed;
uniform vec3 uTankAct;
uniform vec3 uTankWater;
uniform vec2 uTankFlow;
uniform vec4 uTankSpots;
uniform float uTankSpotY;
// 3つの照明それぞれの、真下ほど強い光（真下で 1、照明のあいだで弱く）
float tankSpot( vec3 p ) {
  float h = max( uTankSpotY - p.y, 0.05 ), h2 = h * h, dz = p.z - uTankSpots.w, dz2 = dz * dz;
  float s = 0.0, c;
  c = h / sqrt( h2 + dz2 + ( p.x - uTankSpots.x ) * ( p.x - uTankSpots.x ) ); s += c * c * c * c * c;
  c = h / sqrt( h2 + dz2 + ( p.x - uTankSpots.y ) * ( p.x - uTankSpots.y ) ); s += c * c * c * c * c;
  c = h / sqrt( h2 + dz2 + ( p.x - uTankSpots.z ) * ( p.x - uTankSpots.z ) ); s += c * c * c * c * c;
  return s;
}
// カメラから p までの線が、水の箱に入ってからの長さ（入った点は *entry）
float tankPath( vec3 p, out vec3 entry ) {
  vec3 rd = p - cameraPosition;
  float L = length( rd );
  rd /= max( L, 1e-4 );
  vec3 inv = 1.0 / ( rd + sign( rd ) * 1e-5 + vec3( equal( rd, vec3( 0.0 ) ) ) * 1e-5 );
  vec3 t0 = ( uTankMin - cameraPosition ) * inv, t1 = ( uTankMax - cameraPosition ) * inv;
  vec3 tn = min( t0, t1 );
  float tE = clamp( max( max( tn.x, tn.y ), tn.z ), 0.0, L );
  entry = cameraPosition + rd * tE;
  return L - tE;
}
// 水面でくだけた光の網（水槽の大きさに合わせた細かさ）
float tankCaus( vec2 q, float t ) {
  float n1 = texture2D( uDetail, q * 1.9 + vec2( t * 0.031, -t * 0.022 ) ).g;
  float n2 = texture2D( uDetail, q.yx * 1.55 + vec2( -t * 0.026, t * 0.034 ) + 0.37 ).g;
  float n3 = texture2D( uDetail, q * 2.7 + vec2( t * 0.018, t * 0.04 ) + 0.71 ).g;
  float r1 = 1.0 - abs( ( n1 + n2 ) - 1.0 ) * 1.6;
  float r2 = 1.0 - abs( ( n2 + n3 ) - 1.0 ) * 1.6;
  return pow( clamp( r1, 0.0, 1.0 ), 14.0 ) * 1.4 + pow( clamp( r2, 0.0, 1.0 ), 16.0 ) * 0.8;
}
// 光の柱（水面のゆらぎの明るいところから、まっすぐ下へ）
float tankShaft( vec3 p, float t ) {
  vec2 q = p.xz - uTankMin.xz + ( uTankMax.y - p.y ) * vec2( 0.12, 0.05 );
  float s = texture2D( uDetail, q * 0.45 + vec2( t * 0.012, -t * 0.008 ) ).g * 0.6
          + texture2D( uDetail, q.yx * 0.8 + vec2( -t * 0.01, t * 0.014 ) + 0.5 ).g * 0.4;
  return smoothstep( 0.5, 0.78, s ) * ( 0.35 + 0.9 * tankSpot( p ) );
}
vec3 tankScatter( vec3 a, vec3 b, float t ) {
  float L = length( b - a );
  float acc = 0.0;
  for ( int i = 0; i < 6; i++ ) {
    vec3 p = mix( a, b, ( float( i ) + 0.5 ) / 6.0 );
    acc += tankShaft( p, t ) * exp( -( uTankMax.y - p.y ) * 1.6 );
  }
  return ( uTankLed * 0.7 + uSunColor * max( uSunDirW.y, 0.0 ) * 0.25 ) * ( acc / 6.0 ) * L;
}
`;

export function initMaterials() {
  G.uDetail.value = makeDetailTexture(256);
}

const COMMON_VERT = /* glsl */ `
varying vec3 vWPos;
uniform float uTime;
`;
const POS_VERT = /* glsl */ `
  vec4 wp_ = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    wp_ = instanceMatrix * wp_;
  #endif
  vWPos = ( modelMatrix * wp_ ).xyz;
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vWPos;
uniform float uTime;
uniform sampler2D uDetail;
uniform vec3 uUnderColor;
uniform float uUnderAbsorb;
uniform vec3 uUnderTrans;
uniform vec3 uUnderDeep;
uniform float uCaustic;
uniform float uUnderGain;
uniform vec3 uSunDirW;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uWetness;
` + TANK_GLSL;

// 海ぞこにゆれる、光の網（水面でくだけた日ざし）
const CAUSTICS = /* glsl */ `
          if ( uCaustic > 0.0 ) {
            vec2 cp = vWPos.xz;
            float ct = uTime * 0.55;
            float n1 = texture2D( uDetail, cp * 0.23 + vec2( ct * 0.04, -ct * 0.03 ) ).g;
            float n2 = texture2D( uDetail, cp * 0.31 + vec2( -ct * 0.035, ct * 0.045 ) + 0.37 ).b;
            float n3 = texture2D( uDetail, cp * 0.53 + vec2( ct * 0.02, ct * 0.06 ) + 0.71 ).g;
            float rr = 1.0 - abs( ( n1 + n2 ) - 1.0 );
            float rr2 = 1.0 - abs( ( n2 + n3 ) - 1.0 );
            float ca = pow( clamp( rr, 0.0, 1.0 ), 7.0 ) + pow( clamp( rr2, 0.0, 1.0 ), 9.0 ) * 0.7;
            float fade = smoothstep( 0.0, 0.25, db ) * exp( -db * 0.42 );
            lit += diffuseColor.rgb * uSunColor * ca * fade * uCaustic * 1.1;
          }`;

// 水槽の中の物: 照明・光の網・水の色（水の中を通った長さで）
const TANK_FRAG = /* glsl */ `
          vec3 ent;
          float dw = tankPath( vWPos, ent );
          float dd = max( uTankMax.y - vWPos.y, 0.0 );
          vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
          float upK = clamp( nW.y * 0.5 + 0.5, 0.0, 1.0 );
          float tt = uTime * 1.5;
          float ca = tankCaus( vWPos.xz - uTankMin.xz + uTankFlow * 0.012, tt ) * smoothstep( -0.1, 0.7, nW.y );
          float sunIn = max( uSunDirW.y, 0.0 );
          vec3 lit = gl_FragColor.rgb;
          vec3 led = uTankLed * ( 0.3 + 0.55 * upK * upK ) * exp( -dd * 0.8 ) * ( 0.5 + 0.65 * tankSpot( vWPos ) );
          lit += diffuseColor.rgb * ( led + ( uTankLed * 1.6 + uSunColor * sunIn * 0.7 ) * ca * exp( -dd * 1.1 ) );
          vec3 trn = exp( -dw * vec3( 0.62, 0.17, 0.09 ) );
          gl_FragColor.rgb = lit * trn + uTankWater * ( 1.0 - exp( -dw * 0.35 ) ) + tankScatter( ent, vWPos, uTime ) * 0.09;
`;

/**
 * 標準マテリアルを拡張。
 * opts.underwater: 水面下で濁りの色に溶かす
 * opts.detail: 'terrain' | 'leaf' | 'wood' | null  (粒状感)
 * opts.translucent: 逆光で葉が透ける
 * opts.wind: 頂点を風で揺らす (instanced)
 * opts.extra: {frag?:fn(shaderSnippet)}
 */
export function patchMaterial(mat, opts = {}) {
  const key = JSON.stringify(opts) + (mat.userData.patchKey || '');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = G.uTime;
    shader.uniforms.uDetail = G.uDetail;
    shader.uniforms.uUnderColor = G.uUnderColor;
    shader.uniforms.uUnderAbsorb = G.uUnderAbsorb;
    shader.uniforms.uUnderTrans = G.uUnderTrans;
    shader.uniforms.uUnderDeep = G.uUnderDeep;
    shader.uniforms.uCaustic = G.uCaustic;
    shader.uniforms.uUnderGain = G.uUnderGain;
    shader.uniforms.uSunDirW = G.uSunDirW;
    shader.uniforms.uSunColor = G.uSunColor;
    shader.uniforms.uAmbient = G.uAmbient;
    shader.uniforms.uWetness = G.uWetness;
    for (const k of ['uTankOn', 'uTankMin', 'uTankMax', 'uTankLed', 'uTankAct', 'uTankWater', 'uTankFlow', 'uTankSpots', 'uTankSpotY']) shader.uniforms[k] = G[k];
    if (mat.userData.extraUniforms) Object.assign(shader.uniforms, mat.userData.extraUniforms);

    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', '#include <common>\n' + COMMON_VERT + (mat.userData.vertPars || ''));
    if (opts.normalVertex) vs = vs.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + opts.normalVertex);
    if (opts.vertex) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + opts.vertex);
    vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + POS_VERT);
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + FRAG_PARS + (mat.userData.fragPars || ''));

    if (opts.detail) {
      let snippet = '';
      if (opts.detail === 'terrain') {
        snippet = /* glsl */ `
          {
            vec2 w2 = vWPos.xz;
            float dl = texture2D(uDetail, w2 * 0.022).r;
            float dm = texture2D(uDetail, w2 * 0.31).g;
            float dh = texture2D(uDetail, w2 * 1.7).b;
            float dx = texture2D(uDetail, w2 * 0.09 + 0.37).g;
            float distFade = 1.0 - smoothstep(30.0, 140.0, length(vWPos - cameraPosition));
            float g = 0.78 + 0.5 * (dl * 0.45 + dm * 0.35 + dx * 0.2);
            g += (dh - 0.5) * 0.34 * distFade;
            // 遠景の山肌は森の樹冠のまだら
            float canopy = texture2D(uDetail, w2 * 0.045).g * 0.6 + texture2D(uDetail, w2 * 0.21).b * 0.4;
            float far = smoothstep(60.0, 220.0, length(vWPos.xz));
            g *= mix(1.0, 0.55 + 0.9 * canopy, far);
            diffuseColor.rgb *= g;
          }`;
      } else if (opts.detail === 'leaf') {
        snippet = /* glsl */ `
          {
            vec2 c2 = vWPos.xz * 0.9 + vWPos.y * vec2(0.37, 0.61);
            float d1 = texture2D(uDetail, c2).b;
            float d2 = texture2D(uDetail, c2 * 0.27 + 0.5).g;
            diffuseColor.rgb *= 0.55 + 0.9 * (d1 * 0.55 + d2 * 0.45);
          }`;
      } else if (opts.detail === 'wood') {
        snippet = /* glsl */ `
          {
            float d = texture2D(uDetail, vWPos.xz * 0.6 + vWPos.y * 0.3).g;
            diffuseColor.rgb *= 0.82 + 0.3 * d;
          }`;
      }
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + snippet);
      if (opts.detail === 'leaf') {
        // 面のカクカクをごまかす微小な法線のゆらぎ
        fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 nn = vec3(texture2D(uDetail, vWPos.xz*1.7 + vWPos.y*0.9).b,
                           texture2D(uDetail, vWPos.zy*1.5 + 0.31).g,
                           texture2D(uDetail, vWPos.xy*1.6 + 0.62).b) - 0.5;
            normal = normalize(normal + nn * 0.85);
          }`);
      }
    }

    if (opts.grass) {
      // 草地: 草の色のところだけ、葉先の細かな明暗・株のあいだの影・ところどころの枯れ色をのせる（芝生のような一枚の緑にしない）
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 dc = diffuseColor.rgb;
          float gr = clamp( ( dc.g - dc.b * 1.6 ) * 6.0, 0.0, 1.0 ) * clamp( ( dc.g - dc.r * 0.75 ) * 12.0, 0.0, 1.0 );   // 緑〜枯れ草色のところ（砂・岩はのぞく）
          if ( gr > 0.001 ) {
            vec2 w = vWPos.xz;
            float fade = 1.0 - smoothstep( 25.0, 90.0, length( vWPos - cameraPosition ) );
            float b1 = texture2D( uDetail, w * 2.3 ).b, b2 = texture2D( uDetail, w * 5.1 + 0.4 ).g;
            float clump = texture2D( uDetail, w * 0.21 + 0.2 ).r;
            float dry = smoothstep( 0.52, 0.78, texture2D( uDetail, w * 0.06 + 0.6 ).g );
            vec3 c = dc * ( 0.6 + 0.8 * ( b1 * 0.6 + b2 * 0.4 ) );
            float clump2 = texture2D( uDetail, w * 0.045 + 0.7 ).g;   // 数メートルの、草のこい所とうすい所
            c *= ( 0.5 + 0.75 * smoothstep( 0.2, 0.75, clump ) ) * ( 0.65 + 0.6 * smoothstep( 0.25, 0.75, clump2 ) );
            c = mix( c, vec3( 0.36, 0.3, 0.14 ) * ( 0.7 + 0.6 * b2 ), dry * 0.5 * ( 0.5 + 0.5 * b1 ) );
            diffuseColor.rgb = mix( dc, c, gr * mix( 0.55, 1.0, fade ) );
          }
        }`);
    }

    if (opts.wet) {
      // 波にぬれる岩: 水ぎわほど暗く、つやが出て、潮の満ち引きの高さに藻の帯ができる
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        float wetK = smoothstep( 0.6, -0.05, vWPos.y ) * step( -1.6, vWPos.y );
        diffuseColor.rgb *= mix( 1.0, 0.5, wetK );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.16, 0.07 ), smoothstep( 0.3, 0.0, abs( vWPos.y + 0.15 ) ) * 0.45 );`);
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.28, wetK );`);
    }

    if (opts.translucent) {
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 sunV = normalize( ( viewMatrix * vec4( uSunDirW, 0.0 ) ).xyz );
          vec3 vv = normalize( vViewPosition );
          float back = pow( max( dot( -vv, sunV ), 0.0 ), 3.0 );
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * back * ${(opts.translucent * 0.22).toFixed(3)};
        }`
      );
    }

    if (opts.underwater) {
      fs = fs.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        if ( vWPos.y < 0.0 ) {
          float db = -vWPos.y;
          float a = 1.0 - exp( -db * uUnderAbsorb );
          vec3 uc = mix( uUnderColor, uUnderDeep, smoothstep( 2.0, 14.0, db ) );
          vec3 murk = uc * ( uAmbient * 0.9 + uSunColor * 0.25 );
          vec3 lit = gl_FragColor.rgb;
          ${opts.caustics ? CAUSTICS : ''}
          gl_FragColor.rgb = mix( lit * exp( -db * uUnderTrans ) * mix( 1.0, uUnderGain, 1.0 - exp( -db * 3.0 ) ), murk, a * 0.92 );
        } else if ( uTankOn > 0.5 && all( greaterThan( vWPos, uTankMin ) ) && all( lessThan( vWPos, uTankMax + vec3( 0.0, 0.006, 0.0 ) ) ) ) {
          ${TANK_FRAG}
        }`
      );
    }
    if (opts.fragment) fs = opts.fragment(fs);
    shader.fragmentShader = fs;
    if (mat.userData.onShader) mat.userData.onShader(shader);
  };
  mat.needsUpdate = true;
  return mat;
}

// 便利: 標準マテリアル作成
export function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });
}
