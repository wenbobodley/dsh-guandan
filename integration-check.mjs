// integration-check.mjs — 真实 cordis 宿主集成验证（本地一次性脚本，不打入发布包）
// 用 DSH 实际携带的 cordis 建最小宿主：provide('tools') + provide('webServer')，
// 再 app.plugin(本插件)，验证：
//   1) inject ['tools','webServer'] 被 cordis 正确解析（不再抛 "without inject"）
//   2) 4 个工具注册成功
//   3) /guandan/* 路由注册成功
//   4) 路由 handler 真实响应 GET /guandan/api/state
import { Context } from 'file:///C:/Users/Dell/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js';
import * as plugin from './lib/index.js';

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

const toolDefs = [];
const routeSpecs = [];

const app = new Context();
app.provide('tools', { register: (def) => toolDefs.push(def) });
app.provide('webServer', { register: (spec) => { routeSpecs.push(spec); return () => {}; } });

let loadError = null;
try {
  app.plugin(plugin);
  // cordis 4 无 app.start()：fiber 异步激活，等生命周期沉降
  await new Promise((r) => setTimeout(r, 150));
} catch (e) {
  loadError = e;
  console.log('  ❌ 插件加载失败:', e.message);
}

console.log('== 真实 cordis 注入解析 ==');
ok('插件加载不抛错', loadError === null, loadError?.message ?? '');
ok('4 个工具注册', toolDefs.length === 4, `got ${toolDefs.length}`);
ok('工具名正确', ['guandan_new', 'guandan_state', 'guandan_play', 'guandan_hint'].every((n) => toolDefs.some((d) => d.name === n)));
ok('/guandan 前缀路由注册', routeSpecs.some((s) => s.kind === 'prefix' && s.path === '/guandan'));

console.log('== 真实路由 handler 响应 ==');
const handler = routeSpecs.find((s) => s.kind === 'prefix' && s.path === '/guandan')?.handler;
if (handler) {
  const res = {
    writeHead(s, h) { this.status = s; },
    end(b) { this.body = String(b); },
  };
  await handler({ method: 'GET', url: '/guandan/api/state?session=integration-check' }, res);
  const data = JSON.parse(res.body);
  ok('GET state 200', res.status === 200);
  ok('state ok=true', data.ok === true);
  ok('state 含 4 家与 27 张', data.value.hands.length === 4 && data.value.hands.find((h) => h.isHuman).cards.length === 27);
} else {
  ok('路由 handler 存在', false, 'handler 未找到');
}

console.log(`\n集成结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
