// ゲームの魚種データから、ページ用の js/species.js を作る（二重管理しないため）
import fs from 'fs'; import path from 'path';
const GAME = process.env.GAME_DIR || '/home/user/fishing_inaka';
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {} };
globalThis.window = globalThis.window || { location: { search: '' } };
globalThis.location = globalThis.location || { search: '' };
const m = await import(path.join(GAME, 'src/species.js'));
const order = m.SPECIES_ORDER;
const out = order.map((id) => {
  const s = m.SPECIES[id];
  return {
    id, name: s.name, ruby: s.ruby, latin: s.latin, cm: s.cm, rarity: s.rarity, kind: s.kind,
    season: s.season || null, legend: !!s.legend, junk: !!s.junk,
    nibble: s.nibble, desc: s.desc, rumor: s.rumor || null, biteText: s.biteText || null,
    bite: s.bite || null, layer: s.layer, bottom: !!s.bottom,
    active: s.active,
  };
});
const body = `// 魚種データ（ゲーム本体の src/species.js から tools/build-species.mjs で生成）
export const SPECIES = [\n${out.map((o) => JSON.stringify(o)).join(',\n')}\n];
export const BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
`;
fs.writeFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../js/species.js'), body);
console.log('species', out.length, order.join(','));
