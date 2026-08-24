// ai.js — 掼蛋-中联储卫 机器人策略（V5：拿牌权第一 + 对家配合 + 防对手走完）
// 掼蛋智慧核心（基础智商教育）：
//   1. 拿牌权、不让对方走牌是第一原则——对手出牌必须压（最小压法优先；压不过就用炸弹炸），
//      第一次就压/炸，打乱对方节奏，绝不让对手连续出你没有的牌型
//      （对方出 3带2 你不要、下次还出，就必须炸他；单张同理，你不要对方就会继续出）
//   2. 对家已出完离场 → 1v2 局面，全力拿牌权，任何对手的牌都坚决压
//   3. 90%+ 不压对家——对家当前最大时直接过；对家出 A、上家过，你也要过，
//      不能拿小王压对家的 A（一家团队，配合对方走完）
//   4. 顺小牌——对家出 3、上家压 5，你顺 6/7（最小压法压过上家，不浪费大牌）
//   5. 防对手走完——下家/上家（对手）剩 1~5 张时，避免出相同张数的牌型，
//      防止对手"顺手走完"；对手快走完时坚决压住不放跑
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

function countHand(v) {
  let n = 0;
  for (let i = 0; i < CARD_N; i++) n += v[i];
  return n;
}

/** 动作的张数（几张牌：单1/对2/三3/炸弹4+…） */
function actionCount(a) {
  let n = 0;
  for (let i = 0; i < CARD_N; i++) n += a.cards[i];
  return n;
}

/** 选最小点力的压法；allPass 时返回 null */
function minBeat(beats, curRank) {
  let best = null;
  for (const a of beats) {
    if (!best || actionPower(a, curRank) < actionPower(best, curRank)) best = a;
  }
  return best;
}

export function chooseAction(game, playerId) {
  const legal = game.legalActionsFor(playerId);
  if (!legal.length) return null;
  const isLead = game.lastMax === null;
  const partnerId = (playerId + 2) % 4;
  const nextId = (playerId + 1) % 4;   // 下家（右）
  const prevId = (playerId + 3) % 4;   // 上家（左）
  const myCount = countHand(game.players[playerId].cards);
  const partnerCount = countHand(game.players[partnerId].cards);
  const nextCount = countHand(game.players[nextId].cards);
  const prevCount = countHand(game.players[prevId].cards);
  // 对家是否已出完离场（onTable 不含对家）→ 1v2 局面，全力拿牌权
  const partnerGone = !!(game.onTable && !game.onTable.includes(partnerId));

  // 对手（下家/上家）剩 1~5 张 = 快走完，需防：避免出相同张数的牌型让其顺手走完
  const avoid = new Set();
  if (nextCount >= 1 && nextCount <= 5) avoid.add(nextCount);
  if (prevCount >= 1 && prevCount <= 5) avoid.add(prevCount);
  const isAvoid = (a) => {
    const c = actionCount(a);
    return c <= 5 && avoid.has(c);
  };
  const enemyFast = (nextCount >= 1 && nextCount <= 5) || (prevCount >= 1 && prevCount <= 5);

  // 本墩对家是否出过牌（history 中当前 trick 的最近非过牌记录）
  let partnerPlayed = false;
  if (game.history && game.history.length) {
    const curTrick = game.trickNo;
    for (let i = game.history.length - 1; i >= 0; i--) {
      const h = game.history[i];
      if (h.trick !== curTrick) break;
      if (h.player === partnerId && !h.pass) { partnerPlayed = true; break; }
    }
  }

  if (isLead) {
    // ★ 对家快走完 → 领出对家可能顺走的张数牌型，助力对家用最少轮次走完（记牌分析）
    //   对家剩 1 张：出单张最小牌放对家走；剩 2 张：出对子；剩 3 张：出三张/三带二
    if (!partnerGone && partnerCount >= 1 && partnerCount <= 3) {
      const wantType = partnerCount === 1 ? 1 : partnerCount === 2 ? 2 : 3;
      let bestMatch = null;
      for (const a of legal) {
        if (a.type !== wantType) continue;
        if (a.type === 14) continue;
        if (isAvoid(a)) continue;
        if (!bestMatch || actionPower(a, game.curRank) < actionPower(bestMatch, game.curRank)) bestMatch = a;
      }
      if (bestMatch) return bestMatch;
      // 没有对应张数牌型 → 退化为单张（放对家顺走）
      if (partnerCount >= 1) {
        let bestSingle = null;
        for (const a of legal) {
          if (a.type !== 1) continue;
          if (a.type === 14) continue;
          if (isAvoid(a)) continue;
          if (!bestSingle || actionPower(a, game.curRank) < actionPower(bestSingle, game.curRank)) bestSingle = a;
        }
        if (bestSingle) return bestSingle;
      }
    }
    // ---- 领出：优先出复合牌型（顺子/连对/钢板/三带二/同花顺），出能拿回牌权的牌型 ----
    // 口诀："配牌要灵活"（组牌型）、"几个轮次能出完就是好的组牌策略"、"炸弹不急时机未到"
    // 优先级：复合牌型(同花顺/钢板/连对/顺子/三带二) > 对子 > 单张 > 炸弹(保留到关键时刻)
    const typePri = { 12: 0, 11: 1, 10: 2, 9: 3, 2: 4, 1: 5, 13: 6, 4: 7, 5: 7, 6: 7, 7: 7, 8: 7 }; // 同花顺/炸弹留作抢牌权，不主动领出
    let best = null;
    for (const a of legal) {
      if (a.type === 14) continue; // 王炸绝对保留
      if (a.type === 13 || (a.type >= 4 && a.type <= 8)) continue; // 同花顺/炸弹不主动领出（留作抢牌权）
      if (isAvoid(a)) continue; // 不喂快走完的对手
      const pri = typePri[a.type] ?? 8;
      if (!best) { best = a; continue; }
      const bestPri = typePri[best.type] ?? 8;
      if (pri < bestPri) { best = a; continue; }
      if (pri === bestPri && actionPower(a, game.curRank) < actionPower(best, game.curRank)) best = a;
    }
    if (!best) {
      // 全部被避 → 只剩同花顺/炸弹：仅当自己快走完（≤4 张）才用（最后剩炸弹抛完结束）；
      // 否则不出大牌（避免空放），退回最小非炸弹
      const almostDone = myCount <= 4;
      for (const a of legal) {
        if (a.type === 14) continue;
        if (!almostDone && (a.type === 13 || (a.type >= 4 && a.type <= 8))) continue;
        if (!best || actionPower(a, game.curRank) < actionPower(best, game.curRank)) best = a;
      }
    }
    return best || legal[0];
  }

  const beats = legal.filter((a) => a.type !== -1);
  if (!beats.length) return null;
  const curMax = game.lastMaxPlayer; // 当前墩最大牌的主人

  // ★ 自己快走完（剩 ≤3 张）→ 用炸弹/王炸拿牌权冲刺，一次走完（口诀"炸弹冲刺拿牌权后剩牌一次走完"）
  if (myCount <= 3) {
    // 找能否用炸弹压过当前牌（curMax 是对手时）
    if (curMax !== partnerId && curMax !== null && curMax !== undefined) {
      const bombs = beats.filter((a) => a.type >= 4 && a.type !== 14 ? true : a.type === 14);
      if (bombs.length) {
        // 用最小炸弹压，拿回牌权后可能直接走完
        const bestBomb = bombs.reduce((m, a) => (!m || actionPower(a, game.curRank) < actionPower(m, game.curRank)) ? a : m, null);
        if (bestBomb) return bestBomb;
      }
    }
  }

  // ★ 对家当前最大 → 90%+ 过，不压对家（对家出 A、上家过、你也要过；不拿王压对家）
  if (curMax === partnerId) {
    if (myCount <= 2) {
      // 自己快走完，压对家直接结束（罕见）
      const best = minBeat(beats, game.curRank);
      if (best && best.type === 14) return null; // 王炸不拆来压对家
      return best;
    }
    return null;
  }

  const best = minBeat(beats, game.curRank);
  const isBomb = best.type >= 4;
  const partnerFast = partnerCount <= 5; // 对家快走完（含离场 count=0）

  // ★ 顺小牌：对家本墩出过牌、被对手压了（curMax 是对手）→ 用小牌顺回压过上家
  if (partnerPlayed && curMax !== partnerId) {
    if (isBomb && myCount > 10 && game.rng() < 0.5 && !enemyFast) return null;
    return best;
  }

  // ★ 拿牌权第一原则：
  //   · 对家已离场（1v2）→ 必须压，压不过就用炸弹炸，绝不保留炸弹放对手走
  //   · 对手快走完 → 坚决压住
  //   · 对手出的牌型压不过（只能炸弹）→ 直接炸，打乱对手连续出牌
  if (partnerGone || enemyFast || partnerFast) {
    if (isBomb) return best; // 压不过只有炸弹 → 炸（拿牌权优先，不保留）
    const alt = beats.filter((a) => !isAvoid(a) && a.type !== 14);
    if (alt.length) return minBeat(alt, game.curRank);
    return best;
  }

  // ---- 普通跟牌（对手牌还多、对家在场）：最小压法，但避免用会让下家顺手走完的张数 ----
  if (isAvoid(best) && best.type !== 14) {
    const alt = beats.filter((a) => !isAvoid(a) && a.type !== 14);
    if (alt.length) return minBeat(alt, game.curRank);
  }

  // 手牌还多时保留炸弹（不轻易拆炸）——仅限对家在场且对手牌多时
  if (isBomb && myCount > 10 && game.rng() < 0.5) {
    return null;
  }
  return best;
}
