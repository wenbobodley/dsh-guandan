// ai.js — 掼蛋-中联储卫 简单机器人策略（V1：贪心最小牌）
// 策略：领出时出总点力最小的组合；跟牌时能压则用总点力最小的压法，
//       若最小压法是炸弹/王炸且手牌还多，有一定概率过牌保留炸弹。
import { CARD_N, RANK_TO_IDX } from './cards.js';

/** 单张点力：2最小(1)，3..K 递增，A=13，级牌=15，小王=16，大王=17 */
function cardPower(idx, curRank) {
  if (idx === 52) return 16;
  if (idx === 53) return 17;
  const r = idx % 13;
  return r === RANK_TO_IDX[curRank] ? 15 : r + 1;
}

function actionPower(a, curRank) {
  let sum = 0;
  for (let i = 0; i < CARD_N; i++) {
    if (a.cards[i]) sum += cardPower(i, curRank) * a.cards[i];
  }
  return sum;
}

export function chooseAction(game, playerId) {
  const legal = game.legalActionsFor(playerId);
  if (!legal.length) return null;
  const isLead = game.lastMax === null;
  if (isLead) {
    let best = null;
    for (const a of legal) {
      if (a.type === 14) continue; // 保留王炸
      if (!best || actionPower(a, game.curRank) < actionPower(best, game.curRank)) best = a;
    }
    return best || legal[0];
  }
  const beats = legal.filter((a) => a.type !== -1);
  if (!beats.length) return null;
  let best = null;
  for (const a of beats) {
    if (!best || actionPower(a, game.curRank) < actionPower(best, game.curRank)) best = a;
  }
  const isBomb = best.type >= 4;
  const handCount = countHand(game.players[playerId].cards);
  if (isBomb && handCount > 10 && game.rng() < 0.5) {
    return null;
  }
  return best;
}

function countHand(v) {
  let n = 0;
  for (let i = 0; i < CARD_N; i++) n += v[i];
  return n;
}
