// 釣った魚の記録（このブラウザの localStorage にだけ残る）
const KEY = 'hnm.zukan.v1';
let set = new Set();
try { set = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* 使えない環境 */ }
const subs = [];
export const zukan = {
  has: (id) => set.has(id),
  count: () => set.size,
  ids: () => [...set],
  add(id) {
    const fresh = !set.has(id);
    set.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch (e) { /* 保存できなくても遊べる */ }
    subs.forEach((f) => f(id, fresh));
    return fresh;
  },
  on(fn) { subs.push(fn); },
};
