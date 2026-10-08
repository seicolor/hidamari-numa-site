// three.js 標準の霧チャンクを差し替えて「高さ霧（谷霧・朝もや）＋遠景ヘイズ」を全マテリアルで共通化する。
// THREE.Fog の near/far を再利用:  near = 基本密度(rho),  far = 低い霧の強さ(mist)
import * as THREE from 'three';

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = length( mvPosition.xyz );
  vFogWorld = transpose( mat3( viewMatrix ) ) * mvPosition.xyz + cameraPosition;
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  float fogAmount() {
    float rho = fogNear;
    float mist = fogFar;
    float yv = max( vFogWorld.y, 0.0 );
    float yc = max( cameraPosition.y, 0.0 );
    const float K = 0.075;
    float dy = yv - yc;
    float ex = abs( K * dy ) < 1e-3 ? exp( -K * yc ) : ( exp( -K * yc ) - exp( -K * yv ) ) / ( K * dy );
    float dens = rho * ( 0.62 + mist * ex );
    float tau = dens * vFogDepth;
    return 1.0 - exp( -tau * tau );
  }
#endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogAmount() );
#endif
`;
