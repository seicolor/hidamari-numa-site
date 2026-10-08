// 景色と住人（場所ごと）。ここは入口。中身は numa/world.js と hama/world.js
import { PLACE_ID } from './place.js';
const m = await import(PLACE_ID === 'hama' ? './hama/world.js' : './numa/world.js');
export const { buildWorld, buildLife } = m;
