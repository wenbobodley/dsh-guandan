// playflow.js — 人机行牌流程（工具层与 /guandan/* 路由层共享）
import { chooseAction } from './ai.js';
import { numToCard } from './cards.js';
import { typeName } from './engine.js';
import { tryParseCards, rankProfileOf, rankProfileEq } from './parse.js';

/** 动作 → 显示文本，如 "H2 H2 S2（三张）" */
export function actionDisplay(a) {
  const list = [];
  for (let i = 0; i < 54; i++) for (let k = 0; k < a.cards[i]; k++) list.push(numToCard(i));
  return `${list.join(' ')}（${typeName(a.type)}）`;
}

/** 人类座位号 */
export function humanSeat(game) {
  return game.players.findIndex((p) => p.isHuman);
}

/** 自动推进机器人回合（含局间自动进贡续局），直到轮到人类或整局通关 */
export function autoAdvance(game) {
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

/**
 * 人类出牌/过牌（含输入解析与合法性匹配）。
 * @returns {{ok:true, notes:string[]} | {ok:false, error:string, hint?:string}}
 */
export function playHuman(game, seat, { cards, pass } = {}) {
  if (pass) {
    const res = game.play(seat, null);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, notes: ['你过牌'] };
  }
  if (!cards) return { ok: false, error: '请提供 cards 或 pass=true' };
  const vec = tryParseCards(cards);
  if (vec === null) {
    // 纯点数写法（如 334455）：按点数数量匹配合法动作
    const profile = rankProfileOf(cards);
    if (!profile) return { ok: false, error: `牌面无法识别：${cards}` };
    const legal = game.legalActionsFor(seat);
    const hit = legal.find((a) => rankProfileEq(a.cards, profile));
    if (!hit) return { ok: false, error: `没有与 ${cards} 匹配的合法出牌`, hint: legalHint(game, seat) };
    const res = game.play(seat, hit);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, notes: [`你出：${actionDisplay(hit)}`] };
  }
  // 具体牌面：从合法动作中按向量匹配
  const legal = game.legalActionsFor(seat);
  const found = legal.find((a) => vecKeyEq(a.cards, vec));
  if (!found) return { ok: false, error: '不是合法出牌', hint: legalHint(game, seat) };
  const res = game.play(seat, found);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, notes: [`你出：${actionDisplay(found)}`] };
}

function legalHint(game, seat) {
  const s = game.snapshot(seat);
  const need = s.lastMax ? `${s.lastMax.cards}（${typeName(s.lastMax.type)}）` : '自由出牌';
  const examples = s.legal.slice(0, 8).map((a) => `${a.cards}（${typeName(a.type)}）`).join('；');
  return `当前需压过：${need}。示例：${examples}`;
}

function vecKeyEq(a, b) {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}
