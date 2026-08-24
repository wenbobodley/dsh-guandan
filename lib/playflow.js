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

/** 自动推进机器人回合，直到轮到人类 / 局结束 / 整局通关（局结束不自动续局，由真人手动触发下一局） */
export function autoAdvance(game) {
  const notes = [];
  let guard = 0;
  while (guard < 400) {
    if (game.roundEnd) {
      if (game.episodeEnd) { notes.push('🏆 整局通关！'); break; }
      const winners = game.winOrder.map((i) => game.players[i].name).join('、');
      notes.push(`🔚 第${game.roundNo}局结束（头游：${winners}）→ 等待开始下一局`);
      break;
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
 * 单步推进（UI 节奏用）：只让当前机器人走一手。局结束后不自动续局（由真人手动触发下一局）。
 * 客户端每 5 秒调用一次，形成"每个机器人至少隔 5 秒出手"的行牌节奏。
 * @returns {{done: boolean, notes: string[]}} done=true 表示已轮到人类 / 局结束 / 整局通关
 */
export function advanceOne(game) {
  if (game.roundEnd) {
    // 局结束：停留显示排名，不自动开新局
    if (game.episodeEnd) return { done: true, notes: ['🏆 整局通关！'] };
    const winners = game.winOrder.map((i) => game.players[i].name).join('、');
    return { done: true, notes: [`🔚 第${game.roundNo}局结束（头游：${winners}）→ 等待开始下一局`] };
  }
  if (game.players[game.playerWaiting].isHuman) return { done: true, notes: [] };
  const pid = game.playerWaiting;
  const action = chooseAction(game, pid);
  const res = game.play(pid, action);
  if (!res.ok) return { done: true, notes: [] };
  return {
    done: false,
    notes: [res.event === 'pass' ? `${game.players[pid].name} 过牌` : `${game.players[pid].name} 出：${actionDisplay(action)}`],
  };
}

/** 真人手动开始下一局（局结束停留后调用）；通关后调用方自行 freshGame 重建 */
export function nextRoundManual(game) {
  if (!game.roundEnd || game.episodeEnd) return { ok: false, error: game.episodeEnd ? '整局已通关' : '本局尚未结束' };
  game.startRound();
  return { ok: true, notes: ['开始下一局'] };
}

/**
 * 人类出牌/过牌（含输入解析与合法性匹配）。
 * @returns {{ok:true, notes:string[]} | {ok:false, error:string, hint?:string}}
 */
export function playHuman(game, seat, { cards, pass, auto } = {}) {
  if (pass) {
    // 领出（牌权在手，lastMax 为空）时不得过牌
    if (game.lastMax === null) {
      const canPlay = game.legalActionsFor(seat).some((a) => a.type !== -1);
      if (canPlay) return { ok: false, error: '你有牌权（领出），必须出牌，不能过' };
      // 无牌可出（如只剩逢人配）时允许过
    }
    const res = game.play(seat, auto ? { type: -1, auto: true } : null);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, notes: [auto ? '你超时，自动过牌' : '你过牌'] };
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
  const idx = (str) => (str ? str.split(',').map((x) => numToCard(Number(x))).join(' ') : '');
  const need = s.lastMax ? `${idx(s.lastMax.cards)}（${typeName(s.lastMax.type)}）` : '自由出牌';
  const examples = s.legal
    .filter((a) => a.type !== -1)
    .slice(0, 6)
    .map((a) => `${idx(a.cards)}（${typeName(a.type)}）`)
    .join('；');
  return `当前需压过：${need}。示例：${examples}`;
}

function vecKeyEq(a, b) {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}
