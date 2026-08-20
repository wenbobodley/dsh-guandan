// index.js — 掼蛋-中联储卫（GUANDAN-中联储卫）DSH 插件入口（V2：双端）
// 工具：guandan_new / guandan_state / guandan_play / guandan_hint（V1 保留）
// 路由：/guandan/*（V2 新增，浏览器 UI 直连接口）
import { ensureGame, freshGame } from './games.js';
import { autoAdvance, playHuman, humanSeat, actionDisplay } from './playflow.js';
import { typeName } from './engine.js';
import { registerGuandanRoutes } from './host-routes.js';

export const name = 'guandan';
export const inject = ['tools'];

const BRAND = '掼蛋-中联储卫（GUANDAN-中联储卫）';

function gameFor(exec) {
  const sid = exec?.agent?.session?.id ?? 'default';
  return ensureGame(sid);
}

function buildView(game) {
  const s = game.snapshot(humanSeat(game));
  const me = s.hands.find((h) => h.isHuman);
  const cur = s.hands[s.playerWaiting];
  return { state: s, me, cur };
}

function renderGame(view, extra = []) {
  const s = view.state;
  const lines = [];
  lines.push(`🃏 ${BRAND} · 第${s.round}局 · 级牌 ${s.level}`);
  lines.push(`轮次：${s.hands.map((h) => (h.id === s.playerWaiting ? `【${h.name}】` : h.name)).join(' ')}`);
  lines.push(`你的手牌（${view.me.count} 张）：${view.me.cards || ''}`);
  for (const t of s.tributeLog) lines.push(`📤 ${t}`);
  if (s.lastMax) {
    lines.push(`当前最大：${s.hands[s.lastMax.player]?.name ?? '?'} 出 ${s.lastMax.cards}（${typeName(s.lastMax.type)}）`);
  }
  for (const h of s.history) {
    lines.push(h.pass ? `· ${s.hands[h.player]?.name} 过` : `· ${s.hands[h.player]?.name} 出 ${h.cards}`);
  }
  lines.push(...extra);
  if (s.roundEnd && !s.episodeEnd) lines.push(`🔚 本局结束，头游：${s.winOrder.map((i) => s.hands[i]?.name).join('、')} —— 已自动进入下一局`);
  if (s.episodeEnd) lines.push(`🏆 通关！整局结束（过 A 达成）`);
  lines.push(`轮到：${s.hands[s.playerWaiting]?.name}${s.hands[s.playerWaiting]?.isHuman ? '（你）' : ''}`);
  return lines.join('\n');
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'guandan_new',
    description: `开一局${BRAND}掼蛋（4 人两副牌，含逢人配/进贡还贡/升级）。可选参数 seat 指定你坐的位置（默认 0），其余位置由机器人自动行牌。返回当前局面。`,
    parameters: {
      seat: { type: 'integer', required: false, description: '你坐的座位号 0-3，默认 0（队友为 2）' }
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: value.text }]
    },
    execute(args, exec) {
      const sid = exec?.agent?.session?.id ?? 'default';
      const seat = args.seat === undefined ? 0 : ((args.seat % 4) + 4) % 4;
      const g = freshGame(sid, seat);
      const notes = autoAdvance(g);
      const view = buildView(g);
      return Promise.resolve({ text: renderGame(view, notes.map((n) => `🤖 ${n}`)) });
    }
  });

  ctx.tools.register({
    name: 'guandan_state',
    description: `查看当前${BRAND}牌局状态：你的手牌、当前级牌、轮到谁、场上最大牌、合法出牌数。`,
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: value.text }]
    },
    execute(_args, exec) {
      const g = gameFor(exec);
      const view = buildView(g);
      const s = view.state;
      const lines = [renderGame(view)];
      lines.push(`可选动作 ${s.legalCount} 个，示例：${s.legal.slice(0, 10).map((a) => `${a.cards}（${typeName(a.type)}）`).join('；')}`);
      return Promise.resolve({ text: lines.join('\n') });
    }
  });

  ctx.tools.register({
    name: 'guandan_play',
    description: `在${BRAND}牌局中出牌或过牌。cards 传入要出的牌（如 "H2 H2 S2" 或 "33 44 55"），pass=true 表示过牌。非法出牌会返回错误并给出提示。机器人会自动接续行牌直到轮到你。`,
    parameters: {
      cards: { type: 'string', required: false, description: '要出的牌，用空格分隔，如 "H2 H2 S2 C3 D3"；支持中文花色与 10/J/Q/K/A' },
      pass: { type: 'boolean', required: false, description: 'true = 过牌（本轮不跟）' }
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: value.text }]
    },
    execute(args, exec) {
      const g = gameFor(exec);
      const seat = humanSeat(g);
      const r = playHuman(g, seat, { cards: args.cards, pass: args.pass });
      if (!r.ok) {
        return Promise.resolve({ text: `❌ ${r.error}${r.hint ? `。${r.hint}` : ''}` });
      }
      const notes = [...r.notes, ...autoAdvance(g).map((n) => `🤖 ${n}`)];
      const view = buildView(g);
      return Promise.resolve({ text: renderGame(view, notes) });
    }
  });

  ctx.tools.register({
    name: 'guandan_hint',
    description: `列出${BRAND}牌局当前你（人类座位）所有合法出牌，含牌型说明。`,
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: value.text }]
    },
    execute(_args, exec) {
      const g = gameFor(exec);
      const seat = humanSeat(g);
      const s = g.snapshot(seat);
      const lines = [`当前需压过：${s.lastMax ? s.lastMax.cards + '（' + typeName(s.lastMax.type) + '）' : '自由出牌'}`];
      lines.push(`共 ${s.legalCount} 个合法动作：`);
      for (const a of s.legal) lines.push(`  ${a.cards}（${typeName(a.type)}）`);
      return Promise.resolve({ text: lines.join('\n') });
    }
  });

  // V2：浏览器 UI 直连路由（webServer 存在才挂；TUI/无 web 环境自动降级为纯工具）
  const webServer = ctx.webServer ?? ctx.get?.('webServer');
  if (webServer && typeof webServer.register === 'function') {
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => registerGuandanRoutes(webServer, { ensureGame, freshGame }), 'guandan: host routes');
    } else {
      registerGuandanRoutes(webServer, { ensureGame, freshGame });
    }
  }
}
