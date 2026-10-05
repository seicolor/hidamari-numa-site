// 景色・場面の撮影（1920×1080）。node tools/capture-scenes.mjs [名前,名前,…]
import { serve, launch, openGame, frames, look, shot, sleep } from './lib.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const Q = process.env.Q || 'high';
const { srv, port } = serve();
const browser = await launch();
const T0 = Date.now();
const SCENES = {
  // ---- 四季 ----
  spring_day: { qs: 'season=spring&hour=10.5&w=clear', run: async (p) => { await look(p, 0.08, -0.05, 58); } },
  summer_day: { qs: 'season=summer&hour=15.5&w=clear', run: async (p) => { await look(p, -0.1, -0.04, 58); } },
  autumn_day: { qs: 'season=autumn&hour=15.2&w=clear', run: async (p) => { await look(p, 0.05, -0.05, 58); } },
  winter_day: { qs: 'season=winter&hour=12.6&w=clear', run: async (p) => { await look(p, 0.1, -0.05, 58); } },
  winter_snow: { qs: 'season=winter&hour=13&w=rain', run: async (p) => { await look(p, 0, -0.05, 58); await sleep(2500); } },
  // ---- 時間・天気 ----
  dawn_mist: { qs: 'season=autumn&hour=6.1&w=clear', run: async (p) => { await look(p, -0.2, -0.03, 56); } },
  dusk: { qs: 'season=summer&hour=19.0&w=clear', run: async (p) => { await look(p, 0.25, 0.0, 60); } },
  rain_pond: { qs: 'season=autumn&hour=14&w=rain', run: async (p) => { await look(p, 0, -0.08, 58); await sleep(2500); } },
  rainbow: { qs: 'season=autumn&hour=15&w=clear', run: async (p) => { await look(p, 0, 0.1, 62); await p.evaluate(() => { __g.sky.trigger('rainbow'); __g.sky.rb.amt = 1; __g.sky.rb.hold = 1e6; }); await sleep(2500); } },
  night_float: { qs: 'season=autumn&hour=21.5&w=clear', run: async (p) => {
    await p.evaluate(() => __g.player.setHold(true));
    await p.waitForFunction(() => __g.game.power > 0.5, null, { timeout: 900000 });
    await p.evaluate(() => __g.player.setHold(false));
    await p.waitForFunction(() => __g.game.state === 'float', null, { timeout: 900000 });
    await p.evaluate(() => { __g.sim.update = function () {}; __g.game.toggleBobberZoom(); });
    await sleep(4000); await frames(p, 8);
  } },
  night_wide: { qs: 'season=autumn&hour=21.5&w=clear', run: async (p) => { await look(p, 0, -0.04, 62); await frames(p, 4); } },
  fireworks: { qs: 'season=summer&hour=22&w=clear', run: async (p) => {
    await look(p, 0, 0.25, 70);
    await p.evaluate(() => { for (let i = 0; i < 5; i++) setTimeout(() => __g.sky.trigger('firework'), i * 500); });
    await p.waitForFunction(() => __g.sky.fw.shells.filter((s) => s.phase === 'burst' && s.bt > 0.8).length >= 2, null, { timeout: 900000 });
  } },
  meteor: { qs: 'season=summer&hour=23&w=clear', run: async (p) => { await look(p, 0, 0.5, 62); await frames(p, 4); await p.evaluate(() => { __g.sky.trigger('meteor'); __g.sky.met.dur = 1000; __g.sky.met.t = 480; }); await sleep(2500); } },
  // ---- 出来事 ----
  boat_deep: { qs: 'season=summer&hour=17&w=clear', run: async (p) => {
    await p.evaluate(() => { __g.game.goBoat('deep'); });
    await p.waitForFunction(() => __g.boat.trip, null, { timeout: 60000 });
    await p.evaluate(() => { __g.boat.trip.stages.forEach((s) => { s.t = s.dur * 0.999; }); });
    await p.waitForFunction(() => !__g.boat.trip, null, { timeout: 900000 });
    await look(p, 0.12, -0.06, 60); await frames(p, 8);
  } },
  neighbor: { qs: 'season=autumn&hour=14&w=clear', run: async (p) => {
    await p.evaluate(() => { const n = __g.neighbor; n.state = 'sit'; n.t = 0; n.sitDur = 1e6; n.x = n.seatX; n.heading = Math.PI; });
    await p.evaluate(() => { const n = __g.neighbor, e = __g.player.eye, hp = n.headPos(); __g.player.baseYaw = -Math.atan2(hp.x - e.x, -(hp.z - e.z)); __g.player.basePitch = -0.1; __g.player.fov = __g.player.targetFov = 38; });
    await p.waitForFunction(() => Math.abs(__g.camera.rotation.y - __g.player.baseYaw) < 0.05 && __g.neighbor.state === 'sit', null, { timeout: 900000 });
    await sleep(2500);
  } },
  cat_dusk: { qs: 'season=autumn&hour=17.4&w=clear', run: async (p) => {
    // 猫が歩いてくるのを待たず、歩く距離をつめて、すぐ座らせる
    await p.evaluate(() => { __g.critters.trigger('cat'); __g.player.fov = __g.player.targetFov = 44; __g.player.baseYaw = -0.64; __g.player.basePitch = -0.45; });
    await p.evaluate(() => { const C = __g.critters, c = C.cts; c.pos.z = C.post.z + 0.9; });
    await p.waitForFunction(() => { const c = __g.critters.cts; return c.state === 'sit' && c.t > 2.5; }, null, { timeout: 900000 });
  } },
  kingfisher: { qs: 'season=summer&hour=12&w=clear', run: async (p) => {
    await p.evaluate(() => { const C = __g.critters, P = __g.player; C.trigger('kingfisher'); });
    await p.waitForFunction(() => __g.critters.kfs.stake, null, { timeout: 60000 });
    await p.evaluate(() => { const C = __g.critters, P = __g.player, e = C.eye, s = C.kfs.stake; const b = Math.atan2(s.x - e.x, -(s.z - e.z)); P.baseYaw = -b; P.basePitch = Math.atan2(0.55 - e.y, Math.hypot(s.x - e.x, s.z - e.z)); P.fov = P.targetFov = 24; });
    await p.waitForFunction(() => { const s = __g.critters.kfs; return s.state === 'perch' && s.t > 2; }, null, { timeout: 900000 });
  } },
  frog: { qs: 'season=spring&hour=12&w=clear', run: async (p) => {
    await p.evaluate(() => { __g.critters.trigger('frog'); });
    await p.waitForFunction(() => __g.critters.frs.pad, null, { timeout: 60000 });
    await p.evaluate(() => { const C = __g.critters, P = __g.player, e = C.eye, s = C.frs.pad; const b = Math.atan2(s.x - e.x, -(s.z - e.z)); P.baseYaw = -b; P.basePitch = Math.atan2(0.05 - e.y, Math.hypot(s.x - e.x, s.z - e.z)); P.fov = P.targetFov = 24; });
    await p.waitForFunction(() => { const s = __g.critters.frs; return s.state === 'sit' && s.t > 2; }, null, { timeout: 900000 });
  } },
  hand_funa: { qs: 'season=autumn&hour=16.5&w=clear', run: async (p) => { await p.evaluate(() => __g.game.debugCatch('funa', 22)); await p.waitForSelector('#catch', { timeout: 900000, state: 'attached' }); await p.waitForFunction(() => __g.game.showT > 2.6, null, { timeout: 900000 }); } },
  hand_koi: { qs: 'season=spring&hour=11&w=clear', run: async (p) => { await p.evaluate(() => __g.game.debugCatch('koi', 58)); await p.waitForFunction(() => __g.game.showT > 2.8, null, { timeout: 900000 }); } },
  // ---- 画面（UIあり）----
  ui_journal: { ui: true, qs: 'season=autumn&hour=16&w=clear', run: async (p) => {
    await p.evaluate(() => {
      const c = __g.save.data.catches; const S = (n, b, s) => ({ count: n, best: b, bestG: b * 8, first: 1, seasons: s });
      c.funa = S(9, 29.4, { spring: 2, summer: 2, autumn: 3, winter: 2 }); c.koi = S(4, 61, { autumn: 2, spring: 1, summer: 1 }); c.tanago = S(5, 9.2, { spring: 3, autumn: 2 });
      c.dojo = S(2, 17, { summer: 2 }); c.namazu = S(1, 48, { summer: 1 }); c.hibuna = S(1, 24, { spring: 1 }); c.wakasagi = S(3, 12, { winter: 3 }); c.unagi = S(1, 63, { summer: 1 });
      __g.ui.openJournal();
    });
    await sleep(1500);
  } },
  ui_card: { ui: true, qs: 'season=autumn&hour=16&w=clear', run: async (p) => { await p.evaluate(() => __g.game.debugCatch('koi', 58)); await p.waitForSelector('#catch', { timeout: 900000 }); await p.waitForFunction(() => __g.game.showT > 2.8, null, { timeout: 900000 }); } },
};
for (const name of (only || Object.keys(SCENES))) {
  const sc = SCENES[name]; if (!sc) continue;
  const t = Date.now();
  let page = null;
  try {
    page = await openGame(browser, port, `q=${Q}&${sc.qs}`, { ui: !!sc.ui });
    await sc.run(page);
    await frames(page, 6);
    await shot(page, name);
    console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${name} (${((Date.now() - t) / 1000).toFixed(0)}s)`, page.logs.join(' ') || 'no errors');
  } catch (e) { console.log('FAILED', name, String(e.message).slice(0, 300)); }
  finally { try { if (page) await page.close(); } catch (e) { /* ignore */ } }
}
await browser.close(); srv.close(); process.exit(0);
