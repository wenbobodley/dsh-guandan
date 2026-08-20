// smoke.js — 工具层 + 路由层 + 客户端 bundle 冒烟测试
import * as plugin from './index.js';
import { registerGuandanRoutes } from './host-routes.js';
import { ensureGame, freshGame } from './games.js';

/** 与 index.js 相同的路由挂载全局标记（测试间重置用） */
const ROUTE_MOUNT_KEY = Symbol.for('@zhonglianchuwei/dsh-guandan:routes-mounted');

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

// ── 1. 工具注册 ─────────────────────────────────────────────────────────────
console.log('== 工具注册 ==');
const registered = [];
const ctx = { tools: { register: (def) => registered.push(def) } };
plugin.apply(ctx, {});
const names = registered.map((t) => t.name);
console.log('注册工具:', names.join(', '));
ok('注册 4 个工具', names.length === 4);
ok('含 guandan_new', names.includes('guandan_new'));
ok('含 guandan_play', names.includes('guandan_play'));
ok('含 guandan_state', names.includes('guandan_state'));
ok('含 guandan_hint', names.includes('guandan_hint'));

const exec = { agent: { session: { id: 'smoke-test' } } };
const byName = (n) => registered.find((t) => t.name === n);

const r1 = await byName('guandan_new').execute({ seat: 0 }, exec);
ok('guandan_new 返回局面文本', typeof r1.text === 'string' && r1.text.includes('掼蛋-中联储卫'));
const r2 = await byName('guandan_state').execute({}, exec);
ok('guandan_state 返回手牌信息', r2.text.includes('你的手牌'));
const r3 = await byName('guandan_hint').execute({}, exec);
ok('guandan_hint 返回合法动作', r3.text.includes('合法动作'));
const r4 = await byName('guandan_play').execute({ cards: 'H2 H2 H2 H2 H2 H2' }, exec);
ok('非法出牌被拒绝', r4.text.startsWith('❌'));
const r5 = await byName('guandan_play').execute({}, exec);
ok('缺参数报错', r5.text.startsWith('❌'));

// ── 1.5 工具 schema 标准格式回归（DSH 硬性要求）──────────────────────────────
console.log('== 工具 schema 标准格式 ==');
{
  const badParams = registered.filter((t) => !t.parameters || t.parameters.type !== 'object' || typeof t.parameters.properties !== 'object');
  ok('4 个工具 parameters 均为 {type:"object",properties} 标准 JSON Schema', badParams.length === 0, badParams.map((t) => t.name).join(','));
  const badOut = registered.filter((t) => !t.output || !t.output.schema || t.output.schema.type !== 'object');
  ok('4 个工具 output.schema 均为 type:"object"', badOut.length === 0, badOut.map((t) => t.name).join(','));
}

// ── 2. host 路由层 ───────────────────────────────────────────────────────────
console.log('== /guandan/* 路由层 ==');
function makeReq(method, url, body) {
  const handlers = {};
  return {
    method,
    url,
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    _emit(ev, arg) { (handlers[ev] || []).forEach((fn) => fn(arg)); },
    _body: body,
  };
}
function makeRes() {
  const out = { status: 0, headers: {}, body: '' };
  return {
    out,
    writeHead(s, hdrs) { out.status = s; out.headers = hdrs || {}; },
    end(chunk) { out.body = (out.body + (chunk == null ? '' : chunk)).toString(); },
  };
}
async function invoke(handler, req) {
  const res = makeRes();
  const p = handler(req, res);
  // handler 的 readBody 会在首个 await 前同步注册 on('data'/'end')，此时再投递请求体
  if (req._body != null) req._emit('data', req._body);
  req._emit('end');
  await p;
  return { status: res.out.status, json: JSON.parse(res.out.body || '{}') };
}

const routeSpecs = [];
const fakeWS = {
  register: (spec) => { routeSpecs.push(spec); return () => {}; },
};
const disposeRoutes = registerGuandanRoutes(fakeWS, { ensureGame, freshGame });
ok('注册 1 条前缀路由', routeSpecs.length === 1 && routeSpecs[0].kind === 'prefix' && routeSpecs[0].path === '/guandan');
ok('路由可注销', typeof disposeRoutes === 'function');

// GET state
{
  const r = await invoke(routeSpecs[0].handler, makeReq('GET', '/guandan/api/state?session=route-test'));
  ok('GET state 200 + ok', r.status === 200 && r.json.ok === true);
  const humanCards = r.json.value.hands.find((h) => h.isHuman).cards;
  ok('state 含 4 家手牌与 27 张', r.json.value.hands.length === 4 && humanCards.length === 27);
  ok('手牌为可读牌名（非索引）', humanCards.every((c) => /^(?:[HSDC][2-9TJQKA]|SB|HR)$/.test(c)), humanCards.slice(0, 5).join(','));
  ok('state 含级牌/轮次/合法动作', typeof r.json.value.level === 'string' && r.json.value.playerWaiting >= 0 && r.json.value.legalCount > 0);
}
// POST new
{
  const r = await invoke(routeSpecs[0].handler, makeReq('POST', '/guandan/api/new?session=route-test2'));
  ok('POST new 200 + 新局', r.status === 200 && r.json.ok === true && r.json.value.state.round === 1);
}
// POST play（过牌）
{
  const r = await invoke(routeSpecs[0].handler, makeReq('POST', '/guandan/api/play?session=route-test', JSON.stringify({ pass: true })));
  ok('POST play pass 200 + notes', r.status === 200 && r.json.ok === true && Array.isArray(r.json.value.notes));
}
// POST play（非法）
{
  const r = await invoke(routeSpecs[0].handler, makeReq('POST', '/guandan/api/play?session=route-test', JSON.stringify({ cards: 'H2 H2 H2 H2 H2 H2' })));
  ok('POST play 非法 400', r.status === 400 && r.json.ok === false);
}
// POST hint
{
  const r = await invoke(routeSpecs[0].handler, makeReq('POST', '/guandan/api/hint?session=route-test'));
  ok('POST hint 200 + legal', r.status === 200 && r.json.ok === true && Array.isArray(r.json.value.legal));
}
// POST end（结束牌局）
{
  const r1 = await invoke(routeSpecs[0].handler, makeReq('POST', '/guandan/api/end?session=route-test'));
  ok('POST end 200 + ended=true', r1.status === 200 && r1.json.ok === true && r1.json.value.ended === true);
  const r2 = await invoke(routeSpecs[0].handler, makeReq('POST', '/guandan/api/end?session=route-test'));
  ok('重复 end 幂等 ended=false', r2.json.ok === true && r2.json.value.ended === false);
}
// 404
{
  const r = await invoke(routeSpecs[0].handler, makeReq('GET', '/guandan/api/nope?session=route-test'));
  ok('未知路径 404', r.status === 404);
}
// 无 webServer 时 apply 不抛错（防御性降级路径）
{
  let threw = false;
  try {
    const bare = { tools: { register: () => {} } };
    plugin.apply(bare, {});
  } catch { threw = true; }
  ok('无 webServer 降级不抛错', !threw);
}
// 有 webServer（且实现 ctx.inject）时 apply 注册路由
{
  let captured = [];
  const withWS = {
    tools: { register: () => {} },
    webServer: { register: (spec) => { captured.push(spec); return () => {}; } },
    effect: (fn) => fn(),
    inject: (_names, cb) => cb(withWS),
  };
  delete globalThis[ROUTE_MOUNT_KEY];
  plugin.apply(withWS, {});
  ok('有 webServer 时注册 /guandan 路由', captured.some((s) => s.path === '/guandan'));
}

// ── 2.5 注入守卫回归（V2 启动崩溃的根因）────────────────────────────────────
console.log('== inject 修复（cordis 守卫 ctx + ctx.inject 延迟注入）==');
// 模拟 cordis 的上下文守卫：未声明/不可解析的服务属性访问即抛
// "cannot get property '<name>' without inject"（与真实 cordis 报错一致）
function guardedCtx(provided) {
  const ctx = new Proxy(
    { ...provided, effect: (fn) => fn(), logger: { warn: () => {} } },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        throw new Error(`cannot get property "${String(prop)}" without inject`);
      },
    }
  );
  // 模拟 ctx.inject：声明的服务在 provided 中才回调（webServer 缺失则不回调）
  ctx.inject = (names, cb) => {
    const need = Array.isArray(names) ? names : [names];
    if (need.some((n) => n === 'webServer' && !provided.webServer)) return;
    cb(ctx);
  };
  return ctx;
}
// 1) 注入就绪：tools + webServer 都可用 → apply 不抛错，4 工具 + 路由都注册
{
  let tools = [];
  let captured = [];
  const gctx = guardedCtx({
    tools: { register: (def) => tools.push(def) },
    webServer: { register: (spec) => { captured.push(spec); return () => {}; } },
  });
  delete globalThis[ROUTE_MOUNT_KEY];
  let threw = false;
  try { plugin.apply(gctx, {}); } catch (e) { threw = true; console.log('  ❌ apply 抛错:', e.message); }
  ok('inject 就绪后 apply 不抛错', !threw);
  ok('4 个工具注册', tools.length === 4);
  ok('/guandan 路由注册', captured.some((s) => s.path === '/guandan'));
}
// 2) 回归：webServer 不可解析（旧 bug 场景）→ apply 不抛错、工具仍注册
{
  let tools = [];
  const gctx2 = guardedCtx({ tools: { register: (def) => tools.push(def) } });
  delete globalThis[ROUTE_MOUNT_KEY];
  let threw = false;
  try { plugin.apply(gctx2, {}); } catch (e) { threw = true; console.log('  ❌ apply 抛错:', e.message); }
  ok('webServer 缺失时 apply 不抛错', !threw);
  ok('webServer 缺失时工具仍注册', tools.length === 4);
}
// 3) 重复 apply（同包双实例）→ 路由只挂一次、不抛错
{
  let captured = [];
  const gctx3 = guardedCtx({
    tools: { register: () => {} },
    webServer: { register: (spec) => { captured.push(spec); return () => {}; } },
  });
  delete globalThis[ROUTE_MOUNT_KEY];
  let threw = false;
  try { plugin.apply(gctx3, {}); plugin.apply(gctx3, {}); } catch (e) { threw = true; }
  ok('重复 apply 不抛错且路由只挂一次', !threw && captured.filter((s) => s.path === '/guandan').length === 1);
}

// ── 3. 客户端 bundle ─────────────────────────────────────────────────────────
console.log('== 客户端 bundle ==');
let loaded = null;
globalThis.window = { __ModuleLoader__: { load: (def) => { loaded = def; } } };
const clientMod = await import('./client.js');
ok('client 注册到 __ModuleLoader__', loaded !== null && loaded.id === '@zhonglianchuwei/dsh-guandan');
const reactStub = {
  useState: () => [null, () => {}],
  useEffect: () => {},
  useCallback: (f) => f,
};
const exported = loaded.factory((spec) => {
  if (spec === 'react') return reactStub;
  throw new Error('unexpected require: ' + spec);
});
ok('client 导出 apply/inject', typeof exported.apply === 'function' && Array.isArray(exported.inject));
// V2.1：入口从输入框 dock 移到侧边栏底部 + 浮层 + 插件设置卡
let slotRegs = [];
const clientCtx = {
  effect: (fn) => fn(),
  locale: { register: () => {} },
  get: () => undefined,
  inject: (_names, fn) => fn({ slots: { inject: (slot, cb) => { slotRegs.push({ slot, reg: cb() }); }, register: (def) => def } }),
};
exported.apply(clientCtx);
ok('侧边栏底部入口槽位 sidebar.footer.action', slotRegs.some((r) => r.slot === 'sidebar.footer.action'));
ok('侧边栏入口 id=guandan-trigger', slotRegs.some((r) => r.slot === 'sidebar.footer.action' && r.reg && r.reg.id === 'guandan-trigger'));
ok('浮层槽位 shell.overlay', slotRegs.some((r) => r.slot === 'shell.overlay'));
ok('浮层 id=guandan-panel', slotRegs.some((r) => r.slot === 'shell.overlay' && r.reg && r.reg.id === 'guandan-panel'));
ok('插件组设置卡 web-ui.plugin.item', slotRegs.some((r) => r.slot === 'web-ui.plugin.item' && r.reg && r.reg.id === 'guandan'));
ok('不再占用输入框 dock', !slotRegs.some((r) => r.slot === 'conversation.input.dock'));
ok('组件均可渲染函数', typeof exported.GuandanBoard === 'function' && typeof exported.GuandanTrigger === 'function' && typeof exported.GuandanOverlay === 'function');

console.log(`\n冒烟结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
