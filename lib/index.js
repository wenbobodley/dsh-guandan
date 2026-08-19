// index.js — 掼蛋-中联储卫（GUANDAN-中联储卫）DSH 插件入口
// 工具：guandan_new / guandan_state / guandan_play / guandan_hint
import { GuandanGame } from './game.js';
import { chooseAction } from './ai.js';
import { numToCard } from './cards.js';
import { typeName } from './engine.js';
import { tryParseCards, rankProfileOf, rankProfileEq } from './parse.js';

export const name = 'guandan';
export const inject = ['tools'];

const BRAND = '掼蛋-中联储卫（GUANDAN-中联储卫）';

/** 会话级游戏实例表 */
const games = new Map();

function gameFor(exec) {
  const sid = exec?.agent?.session?.id ?? 'default';
  if (!games.has(sid)) {
    const g = new GuandanGame();
    g.setPlayer(0, { name: '你', isHuman: true });
    g.setPlayer(1, { name: '机器人甲', isHuman: false });
    g.setPlayer(2, { name: '机器人乙', isHuman: false });
    g.setPlayer(3, { name: '机器人丙', isHuman: false });
    g.startRound();
    games.set(sid, g);
  }
  return games.get(sid);
}

/** 自动推进机器人回合（含局间自动进贡续局），直到轮到人类或整局通关 */
function autoAdvance(game) {
  const notes = [];
  let guard = 0;
  while (guard < 400) {
    if (game.roundEnd) {
      if (game.episodeEnd) break;
      const winners = game.winOrder.map((i) => game.players[i].name).join('、');
      const prev = game.roundNo;
      game.startRound();
      notes.push(`🔚 第${prev}局结束（头游：${winners}）→ 自动进贡并进入第${game.roundNo}局（级牌 ${game.curRank}）`);
      continue;
    }
    if (game.players[game.playerWaiting].isHuman) break;
    const pid = game.playerWaiting;
    const action = chooseAction(game, pid);
    const res = game.play(pid, action);
    if (!res.ok) break;
    if (res.event === 'pass') {
      notes.push(`${game.players[pid].name} 过牌`);
    } else {
      notes.push(`${game.players[pid].name} 出：${actionDisplay(action)}`);
    }
    guard++;
  }
  return notes;
}

function actionDisplay(a) {
  const list = [];
  for (let i = 0; i < 54; i++) for (let k = 0; k < a.cards[i]; k++) list.push(numToCard(i));
  return `${list.join(' ')}（${typeName(a.type)}）`;
}

function humanSeat(game) {
  return game.players.findIndex((p) => p.isHuman);
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
      const g = new GuandanGame();
      const seat = args.seat === undefined ? 0 : ((args.seat % 4) + 4) % 4;
      for (let i = 0; i < 4; i++) {
        g.setPlayer(i, { name: i === seat ? '你' : `机器人${['甲', '乙', '丙'][i < seat ? i : i - 1] ?? '丁'}`, isHuman: i === seat });
      }
      g.startRound();
      const notes = autoAdvance(g);
      games.set(sid, g);
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
      const notes = [];
      if (args.pass) {
        const res = g.play(seat, null);
        if (!res.ok) return Promise.resolve({ text: `❌ ${res.error}` });
        notes.push('你过牌');
      } else if (args.cards) {
        const vec = tryParseCards(args.cards);
        if (vec === null) {
          // 纯点数写法（如 334455 / 33 44 55 / JJQQKK）：按点数数量匹配合法动作
          const profile = rankProfileOf(args.cards);
          if (!profile) return Promise.resolve({ text: `❌ 牌面无法识别：${args.cards}` });
          const legal2 = g.legalActionsFor(seat);
          const hit = legal2.find((a) => rankProfileEq(a.cards, profile));
          if (!hit) {
            const s = g.snapshot(seat);
            return Promise.resolve({
              text: `❌ 没有与 ${args.cards} 匹配的合法出牌。当前需压过：${s.lastMax ? s.lastMax.cards + '（' + typeName(s.lastMax.type) + '）' : '自由出牌'}。示例：${s.legal.slice(0, 8).map((a) => `${a.cards}（${typeName(a.type)}）`).join('；')}`
            });
          }
          const res2 = g.play(seat, hit);
          if (!res2.ok) return Promise.resolve({ text: `❌ ${res2.error}` });
          notes.push(`你出：${actionDisplay(hit)}`);
          const botNotes2 = autoAdvance(g);
          notes.push(...botNotes2.map((n) => `🤖 ${n}`));
          const view2 = buildView(g);
          return Promise.resolve({ text: renderGame(view2, notes) });
        }
        // 具体牌面：从合法动作中匹配（向量一致）
        const legal = g.legalActionsFor(seat);
        const found = legal.find((a) => vecKeyEq(a.cards, vec));
        if (!found) {
          const s = g.snapshot(seat);
          return Promise.resolve({
            text: `❌ 不是合法出牌。当前需压过：${s.lastMax ? s.lastMax.cards + '（' + typeName(s.lastMax.type) + '）' : '自由出牌'}。示例合法动作：${s.legal.slice(0, 8).map((a) => `${a.cards}（${typeName(a.type)}）`).join('；')}`
          });
        }
        const res = g.play(seat, found);
        if (!res.ok) return Promise.resolve({ text: `❌ ${res.error}` });
        notes.push(`你出：${actionDisplay(found)}`);
      } else {
        return Promise.resolve({ text: '❌ 请提供 cards 或 pass=true' });
      }
      const botNotes = autoAdvance(g);
      notes.push(...botNotes.map((n) => `🤖 ${n}`));
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
}

function vecKeyEq(a, b) {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}
