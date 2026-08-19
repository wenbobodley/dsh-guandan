// smoke.js — 工具层冒烟测试：模拟 cordis ctx，验证 4 个工具注册与执行
import * as plugin from './index.js';

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

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

// 开局
const r1 = await byName('guandan_new').execute({ seat: 0 }, exec);
ok('guandan_new 返回局面文本', typeof r1.text === 'string' && r1.text.includes('掼蛋-中联储卫'));
console.log('  开局输出示例:', r1.text.split('\n').slice(0, 4).join(' | '));

// 看状态
const r2 = await byName('guandan_state').execute({}, exec);
ok('guandan_state 返回手牌信息', r2.text.includes('你的手牌'));

// 提示
const r3 = await byName('guandan_hint').execute({}, exec);
ok('guandan_hint 返回合法动作', r3.text.includes('合法动作'));

// 非法出牌被拒
const r4 = await byName('guandan_play').execute({ cards: 'H2 H2 H2 H2 H2 H2' }, exec);
ok('非法出牌被拒绝', r4.text.startsWith('❌'));

// 无参数出牌报错
const r5 = await byName('guandan_play').execute({}, exec);
ok('缺参数报错', r5.text.startsWith('❌'));

console.log(`\n冒烟结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
