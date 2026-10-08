// 季節（場所ごと）。numa: 春夏秋冬 / hama: ハワイの乾季（夏）と雨季（冬）
import { PLACE_ID } from './place.js';
const m = await import(PLACE_ID === 'hama' ? './hama/season.js' : './numa/season.js');
export const { SEASON_IDS, SEASON_NAMES, seasonOfDate, pickSeason, SEASON_ID, SEASON, SEASONS } = m;
