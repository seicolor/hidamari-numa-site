// 地形（場所ごと）。ここは入口。中身は numa/terrain.js と hama/terrain.js
import { PLACE_ID } from './place.js';
const m = await import(PLACE_ID === 'hama' ? './hama/terrain.js' : './numa/terrain.js');
export const {
  pondSigned, SHORE_Z, HOUSE, PATH, FIELD, pathDistance,
  terrainHeight, waterDepthAt, buildTerrain, DEPTH_WIN, buildDepthTexture,
} = m;
