// index.js — 掼蛋-中联储卫（GUANDAN-中联储卫）DSH 插件入口（V2：双端）
// 工具：guandan_new / guandan_state / guandan_play / guandan_hint（V1 保留）
// 路由：/guandan/*（V2 新增，浏览器 UI 直连接口）
import { ensureGame, freshGame } from './games.js';
import { autoAdvance, playHuman, humanSeat, actionDisplay } from './playflow.js';
import { typeName } from './engine.js';
import { registerGuandanRoutes } from './host-routes.js';

export const name = 'guandan';
// 静态注入只声明 apply 阶段必需的 tools。
// webServer 不在此声明：它只在 V2 的 ctx.inject 回调里访问（方案一延迟注入），
// 由 cordis 保证"webServer 服务就绪后才执行回调"，从根本上避免
// "cannot get property 'webServer' without inject" 启动崩溃。
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
    description: `开一局${BRAND}掼蛋（4人两副牌）。可选参数seat指定你的座位，默认0。`,
    parameters: {
      type: "object",
      properties: {
        seat: { type: 'integer', description: '你坐的座位号 0-3，默认 0（队友为 2）' }
      },
      required: []
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' }
        }
      },
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
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' }
        }
      },
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
      type: "object",
      properties: {
        cards: { type: 'string', description: '要出的牌，用空格分隔，如 "H2 H2 S2 C3 D3"；支持中文花色与 10/J/Q/K/A' },
        pass: { type: 'boolean', description: 'true = 过牌（本轮不跟）' }
      },
      required: []
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' }
        }
      },
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
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' }
        }
      },
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

  // V2：浏览器 UI 直连路由。方案一：ctx.inject(['webServer'], ...) 延迟注入 ——
  // cordis 保证 webServer 服务就绪后才调用回调，回调内访问 inner.webServer 不会
  // 触发 "without inject" 守卫。挂载标记防同包双实例重复注册；try/catch 保证
  // 即使路由注册意外失败也只降级 UI 路由，4 个工具始终可用，绝不阻断 DSH 启动。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (inner) => {
      try {
        if (globalThis[ROUTE_MOUNT_KEY]) return;
        globalThis[ROUTE_MOUNT_KEY] = true;
        if (typeof inner.effect === 'function') {
          inner.effect(() => registerGuandanRoutes(inner.webServer, { ensureGame, freshGame }), 'guandan: host routes');
        } else {
          registerGuandanRoutes(inner.webServer, { ensureGame, freshGame });
        }
      } catch (e) {
        try {
          inner.logger?.warn?.(`guandan: /guandan/* 路由注册失败（工具不受影响）: ${String(e?.message ?? e)}`);
        } catch { /* 无 logger 时静默 */ }
      }
    });
  }
  // （等价替代方案二：ctx.on('webServer/ready', ...) 事件监听；
  //  两者效果相同，挂载标记保证只挂一次，这里采用方案一。）
}

/** 路由只挂载一次的全局标记（同包双实例防重复注册） */
const ROUTE_MOUNT_KEY = Symbol.for('@zhonglianchuwei/dsh-guandan:routes-mounted');
