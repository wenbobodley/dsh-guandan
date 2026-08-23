// engine.js — 掼蛋-中联储卫 规则引擎（JS 移植自 AltmanD/Guandan，Apache-2.0）
// 规则要点（经确认）：
//   · 逢人配：红桃级牌为万能牌（不可用于替代大小王）
//   · 连对：恰好 3 连对（AA2233 … QQKKAA），≤6 张
//   · 钢板：恰好 2 个连续三张（AAA222 … KKKAAA），≤6 张
//   · 三带二：三张+一对，不允许用大小王作对
//   · 顺子：5 张，级牌可自然参与（A2345 … TJQKA）
//   · 天王炸：4 个王（2 小王 + 2 大王）；双王只是一对
//   · 比牌：大王>小王>级牌>A>K>…>3>2（2 为最小，除非是级牌）
//   · 贡牌：进贡（单下/双下）、还贡（≤10 点且非级牌非王）、抗贡（双大王）
//   · 升级：2→A，过 A 需头游且 uprank≥2
//
// 动作表示：{ cards: Uint8Array(54), value, type }
// type: 1单 2对 3三 4-8炸弹(张数) 9三带二 10顺子 11连对 12钢板 13同花顺 14天王炸

import { RANKS, RANK_TO_IDX, SB, HR, CARD_N, cardsToVector, rankCounts, shuffle, fullDeck, numToCard } from './cards.js';

export const RANK2 = Object.fromEntries(RANKS.map((r, i) => [i, r]));

const TYPE_NAMES = { 1: '单张', 2: '对子', 3: '三张', 9: '三带二', 10: '顺子', 11: '连对', 12: '钢板', 13: '同花顺', 14: '天王炸' };

export function typeName(t) {
  if (t >= 4 && t <= 8) return `炸弹(${t}张)`;
  return TYPE_NAMES[t] || String(t);
}

// ---- 组合工具（替代 itertools） ----
/** 从 suits(0..3) 中取 n 个的可重复组合（每个元素最多 maxPer 次），返回计数数组 */
function suitCombos(n, maxPer) {
  const res = [];
  const cur = new Array(4).fill(0);
  function rec(pos, left) {
    if (pos === 4) {
      if (left === 0) res.push(cur.slice());
      return;
    }
    for (let k = 0; k <= Math.min(maxPer, left); k++) {
      cur[pos] = k;
      rec(pos + 1, left - k);
    }
    cur[pos] = 0;
  }
  rec(0, n);
  return res;
}

/** 级牌索引（0..12） */
function levelIdx(curRank) {
  return RANK_TO_IDX[curRank];
}

/**
 * 生成某玩家的全部合法动作。
 * @param {Uint8Array} hand 手牌向量
 * @param {string} curRank 当前级牌字符
 * @param {number} lastType 上一手类型（-1 = 自由出牌）
 * @param {number} lastValue 上一手值
 * @returns {Array<{cards: Uint8Array, value: number, type: number}>}
 */
export function legalActions(hand, curRank, lastType = -1, lastValue = -1) {
  const rankCard = levelIdx(curRank);
  const rankCardNum = hand[rankCard]; // 逢人配（万能牌）数量
  const cards = hand;
  const cardsNum = rankCounts(cards);
  const actions = [];

  // n_card[k][i] = 由 k+1 张同点牌组成的动作列表（含万能牌补齐）
  const nCard = []; // nCard[0]=单, nCard[1]=对, nCard[2..7]=三..八
  // ---- 单牌 ----
  const single = [];
  for (let i = 0; i < 13; i++) {
    single.push([]);
    for (let j = 0; j < 4; j++) {
      if (cards[i + j * 13]) {
        const v = new Uint8Array(CARD_N);
        v[i + j * 13] = 1;
        single[i].push(v);
      }
    }
  }
  single.push(cards[SB] ? [mkVec(SB)] : []);
  single.push(cards[HR] ? [mkVec(HR)] : []);
  nCard.push(single);

  // ---- 对子 ----
  const pair = [];
  for (let i = 0; i < 13; i++) {
    pair.push([]);
    if (cardsNum[i] >= 2) {
      for (const combo of suitCombos(2, 2)) {
        const ok = combo.every((n, s) => n === 0 || cards[i + s * 13] >= n);
        if (!ok) continue;
        const v = new Uint8Array(CARD_N);
        for (let s = 0; s < 4; s++) if (combo[s]) v[i + s * 13] = combo[s];
        pair[i].push(v);
      }
    } else if (cardsNum[i] === 1 && rankCardNum > 0 && rankCard !== i) {
      for (let j = 0; j < 4; j++) {
        if (cards[i + j * 13]) {
          const v = new Uint8Array(CARD_N);
          v[i + j * 13] = 1;
          v[rankCard] = 1;
          pair[i].push(v);
        }
      }
    }
  }
  pair.push(cards[SB] === 2 ? [jokerPair(SB)] : []);
  pair.push(cards[HR] === 2 ? [jokerPair(HR)] : []);
  nCard.push(pair);

  // ---- 三张及以上（3..8 张） ----
  for (let o = 0; o < 6; o++) { // o+3 = 张数
    const bucket = [];
    const nCombos = suitCombos(o + 3, 2);
    for (let i = 0; i < 13; i++) {
      bucket.push([]);
      if (cardsNum[i] >= o + 3) {
        for (const nc of nCombos) {
          let find = true;
          for (let s = 0; s < 4; s++) {
            if (nc[s] > cards[i + s * 13]) { find = false; break; }
          }
          if (!find) continue;
          const v = new Uint8Array(CARD_N);
          for (let s = 0; s < 4; s++) if (nc[s]) v[i + s * 13] = nc[s];
          bucket[i].push(v);
        }
      } else if (cardsNum[i] === o + 2 && rankCardNum > 0 && rankCard !== i) {
        // 用 1 张万能牌补齐到 o+3 张
        for (const t of nCard[o + 1][i]) {
          const v = t.slice();
          v[rankCard] += 1;
          bucket[i].push(v);
        }
      } else if (cardsNum[i] === o + 1 && rankCardNum >= 2 && rankCard !== i) {
        for (const t of nCard[o][i]) {
          const v = t.slice();
          v[rankCard] += 2;
          bucket[i].push(v);
        }
      }
    }
    nCard.push(bucket);
  }

  // ---- 三带二（type 9） ----
  const tripleDouble = [];
  if ((lastType === 9 && lastValue !== rankCard) || lastType === -1) {
    const tripleList = [];
    for (let t = lastType === 9 ? lastValue + 1 : 0; t < 13; t++) tripleList.push(t);
    if (lastType === 9 && rankCard < lastValue) tripleList.push(rankCard);
    for (const t of tripleList) {
      for (let p = 0; p < 13; p++) { // 对子不用王（用户规则）
        if (t === p) continue;
        if (!nCard[2][t].length || !pair[p].length) continue;
        for (const tr of nCard[2][t]) {
          for (const d of pair[p]) {
            if (tr[rankCard] + d[rankCard] <= rankCardNum) {
              const v = new Uint8Array(CARD_N);
              for (let k = 0; k < CARD_N; k++) v[k] = tr[k] + d[k];
              tripleDouble.push({ cards: v, value: t, type: 9 });
            }
          }
        }
      }
    }
  }

  // ---- 顺子（type 10，5 张；级牌可自然参与；A2345 最小） ----
  const straights = [];
  if ((lastType === 10 && lastValue < 9) || lastType === -1) {
    const start = lastType === 10 ? lastValue + 1 : 0;
    for (let i = start; i < 10; i++) {
      const gap = [];
      for (let j = 0; j < 5; j++) {
        const rIdx = i === 0 && j === 0 ? 12 : i + j - 1; // A2345 特例
        // 仅当该点数完全缺失时才留空缺（由逢人配补齐）。
        // 注意：级牌点数在顺子中按自然位置参与——即使只有一张级牌实体牌
        //（如打 J 时手里唯一的 J♣）也必须直接用，不得当作需逢人配补的空缺，
        // 否则 8-9-10-J-Q 这类含级牌的顺子会整条被跳过（历史 bug）。
        if (cardsNum[rIdx] === 0) {
          gap.push(j);
        }
      }
      if (gap.length > rankCardNum) continue;
      const newCards = cards.slice();
      newCards[rankCard] -= gap.length;
      const st = [];
      for (let j = 0; j < 5; j++) {
        if (gap.includes(j)) { st.push(null); continue; }
        st.push([]);
        const rIdx = i === 0 && j === 0 ? 12 : i + j - 1;
        for (let k = 0; k < 4; k++) {
          if (i === 0 && j === 0) {
            if (newCards[12 + k * 13] > 0) st[st.length - 1].push(12 + k * 13);
          } else if (newCards[rIdx + k * 13] > 0) {
            st[st.length - 1].push(rIdx + k * 13);
          }
        }
        if (st[st.length - 1].length === 0) { st[st.length - 1] = null; }
      }
      // 笛卡尔积（跳过 null 槽，null 由万能牌补齐）
      const slots = st.filter((x) => x !== null);
      if (slots.some((x) => x.length === 0)) continue;
      const product = cartesian(slots);
      for (const s of product) {
        const v = new Uint8Array(CARD_N);
        v[rankCard] += gap.length;
        for (const c of s) v[c] += 1;
        straights.push({ cards: v, value: i, type: 10 });
      }
    }
  }

  // ---- 同花顺（type 13，5 张同花色，可用万能牌） ----
  const flushStraights = [];
  if (lastType !== 6 && lastType !== 7 && lastType !== 8 && lastType !== 14) {
    const init = lastType === 13 ? lastValue + 1 : 0;
    for (let i = init; i < 10; i++) {
      for (let c = 0; c < 4; c++) {
        const stF = [];
        for (let j = 0; j < 5; j++) {
          const rIdx = i === 0 && j === 0 ? 12 : i + j - 1;
          if (cards[rIdx + c * 13] > 0) stF.push(rIdx + c * 13);
        }
        if (stF.length + rankCardNum < 5) continue;
        if (stF.length + rankCardNum === 5 && stF.includes(rankCard)) continue;
        const v = new Uint8Array(CARD_N);
        v[rankCard] += 5 - stF.length;
        for (const s of stF) v[s] += 1;
        flushStraights.push({ cards: v, value: i, type: 13 });
      }
    }
  }

  // ---- 连对（type 11，恰好 3 连对；AA2233 最小） ----
  const straightPairs = [];
  if ((lastType === 11 && lastValue < 11) || lastType === -1) {
    const start = lastType === 11 ? lastValue + 1 : 0;
    for (let v = start; v <= 11; v++) {
      // v=0 → AA2233（rank 12,0,1）；v>=1 → rank [v-1, v, v+1]
      const rankSeq = v === 0 ? [12, 0, 1] : [v - 1, v, v + 1];
      const gap = [];
      for (let j = 0; j < 3; j++) if (!pair[rankSeq[j]].length) gap.push(j);
      if (gap.length > 1) continue;
      if (gap.length === 1) {
        if (rankCardNum !== 2) continue;
        const others = [0, 1, 2].filter((x) => !gap.includes(x));
        const p0 = pair[rankSeq[others[0]]];
        const p1 = pair[rankSeq[others[1]]];
        let done = false;
        for (const a of p0) {
          for (const b of p1) {
            if (a[rankCard] + b[rankCard] === 0) {
              const v2 = new Uint8Array(CARD_N);
              for (let k = 0; k < CARD_N; k++) v2[k] = a[k] + b[k];
              v2[rankCard] += 2;
              straightPairs.push({ cards: v2, value: v, type: 11 });
              done = true;
              break;
            }
          }
          if (done) break;
        }
      } else {
        const p0 = pair[rankSeq[0]];
        const p1 = pair[rankSeq[1]];
        const p2 = pair[rankSeq[2]];
        for (const a of p0) {
          for (const b of p1) {
            for (const c2 of p2) {
              if (a[rankCard] + b[rankCard] + c2[rankCard] <= rankCardNum) {
                const v2 = new Uint8Array(CARD_N);
                for (let k = 0; k < CARD_N; k++) v2[k] = a[k] + b[k] + c2[k];
                straightPairs.push({ cards: v2, value: v, type: 11 });
              }
            }
          }
        }
      }
    }
  }

  // ---- 钢板（type 12，恰好 2 个连续三张；AAA222 最小） ----
  const plates = [];
  if ((lastType === 12 && lastValue < 12) || lastType === -1) {
    const start = lastType === 12 ? lastValue + 1 : 0;
    for (let v = start; v <= 12; v++) {
      const rankSeq = v === 0 ? [12, 0] : [v - 1, v];
      if (!nCard[2][rankSeq[0]].length || !nCard[2][rankSeq[1]].length) continue;
      for (const a of nCard[2][rankSeq[0]]) {
        for (const b of nCard[2][rankSeq[1]]) {
          if (a[rankCard] + b[rankCard] <= rankCardNum) {
            const v2 = new Uint8Array(CARD_N);
            for (let k = 0; k < CARD_N; k++) v2[k] = a[k] + b[k];
            plates.push({ cards: v2, value: v, type: 12 });
          }
        }
      }
    }
  }

  // ---- 天王炸（type 14，4 王） ----
  const bigBomb = [];
  if (cards[SB] === 2 && cards[HR] === 2) {
    const v = new Uint8Array(CARD_N);
    v[SB] = 2;
    v[HR] = 2;
    bigBomb.push({ cards: v, value: 14, type: 14 });
  }

  // ---- 组装同点数动作（单/对/三/炸弹），附 value/type ----
  const sameRank = []; // [type-1][rankIdx] = 动作数组
  for (let type = 1; type <= 8; type++) {
    const layer = [];
    for (let i = 0; i < 13; i++) {
      const list = nCard[type - 1][i].map((v) => ({ cards: v, value: i, type }));
      layer.push(list);
    }
    if (type === 1) {
      layer.push(nCard[0][13].map((v) => ({ cards: v, value: 13, type: 1 })));
      layer.push(nCard[0][14].map((v) => ({ cards: v, value: 14, type: 1 })));
    } else if (type === 2) {
      layer.push(nCard[1][13].map((v) => ({ cards: v, value: 13, type: 2 })));
      layer.push(nCard[1][14].map((v) => ({ cards: v, value: 14, type: 2 })));
    }
    sameRank.push(layer);
  }

  // ---- 跟牌过滤（n_need） ----
  let need;
  const result = [];
  const pass = lastType !== -1 ? [{ cards: new Uint8Array(CARD_N), value: -1, type: -1 }] : [];
  if (lastType === -1) {
    need = sameRank;
  } else if (lastType === 14) {
    return pass;
  } else if (lastType === 1 || lastType === 2) {
    if (lastValue === rankCard) {
      need = [layerSlice(sameRank, lastType - 1, 13), ...sameRank.slice(3)];
    } else if (lastValue < 13) {
      need = [layerSlice(sameRank, lastType - 1, lastValue + 1), ...sameRank.slice(3)];
      if (rankCard < lastValue) need[0] = need[0].concat(sameRank[lastType - 1][rankCard]);
    } else if (lastValue === 13) {
      need = [[...sameRank[lastType - 1][14]], ...sameRank.slice(3)];
    } else {
      need = sameRank.slice(3);
    }
  } else if (lastType === 3) {
    if (lastValue === rankCard) {
      need = sameRank.slice(3);
    } else {
      need = [layerSlice(sameRank, 2, lastValue + 1), ...sameRank.slice(3)];
      if (rankCard < lastValue) need[0] = need[0].concat(sameRank[2][rankCard]);
    }
  } else if (lastType >= 4 && lastType <= 8) {
    if (lastValue === rankCard) {
      need = sameRank.slice(lastType);
    } else {
      need = [layerSlice(sameRank, lastType - 1, lastValue + 1), ...sameRank.slice(lastType)];
      if (rankCard < lastValue) need[0] = need[0].concat(sameRank[lastType - 1][rankCard]);
    }
  } else if (lastType === 13) {
    need = sameRank.slice(5);
  } else {
    need = sameRank.slice(3);
  }
  for (const layer of need) {
    for (const item of layer) {
      if (Array.isArray(item)) result.push(...item);
      else result.push(item);
    }
  }

  // 追加特殊牌型（顺子中排除同花顺）
  const straightNotFlush = [];
  const flushKeys = new Set(flushStraights.map((a) => vecKey(a.cards)));
  for (const a of straights) {
    if (!flushKeys.has(vecKey(a.cards))) straightNotFlush.push(a);
  }
  result.push(...straightNotFlush, ...tripleDouble, ...straightPairs, ...plates, ...bigBomb, ...flushStraights);

  // 逢人配（红桃级牌）不能单独出：整手仅由逢人配构成的动作（单张 ♥2 / 两张 ♥2 成对）不合法
  const isLoneWild = (v) => {
    let total = 0;
    let wilds = 0;
    for (let i = 0; i < CARD_N; i++) {
      if (v[i]) {
        total += v[i];
        if (i === rankCard) wilds += v[i];
      }
    }
    return total > 0 && total === wilds;
  };

  // 去重
  const seen = new Set();
  const out = pass;
  for (const a of result) {
    if (isLoneWild(a.cards)) continue;
    const k = vecKey(a.cards) + '|' + a.value + '|' + a.type;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  }
  return out;
}

function mkVec(...entries) {
  const v = new Uint8Array(CARD_N);
  for (const e of entries) v[e] += 1;
  return v;
}

function jokerPair(j) {
  const v = new Uint8Array(CARD_N);
  v[j] = 2;
  return v;
}

function vecKey(v) {
  let s = '';
  for (let i = 0; i < CARD_N; i++) if (v[i]) s += i + ':' + v[i] + ',';
  return s;
}

function layerSlice(sameRank, typeIdx, from) {
  const out = [];
  for (let i = from; i < sameRank[typeIdx].length; i++) out.push(...sameRank[typeIdx][i]);
  return out;
}

function cartesian(arrs) {
  if (arrs.length === 0) return [[]];
  const [head, ...rest] = arrs;
  const tails = cartesian(rest);
  const out = [];
  for (const h of head) for (const t of tails) out.push([h, ...t]);
  return out;
}

/** 单张牌大小比较：1 大 / 0 平 / -1 小（级牌 > A > … > 3 > 2，王最大） */
export function compareCards(c1, c2, curRank) {
  const rankCard = levelIdx(curRank);
  const j = (c) => (c >= SB ? c : c % 13 === rankCard ? 50 : c % 13);
  const a = j(c1);
  const b = j(c2);
  return a > b ? 1 : a === b ? 0 : -1;
}

/** 判断动作能否压过 lastAction */
export function canBeat(action, lastAction, curRank) {
  if (lastAction === null) return true;
  const a = action.type;
  const b = lastAction.type;
  if (a === 14) return true;
  if (b === 14) return false;
  const bombType = (t) => t >= 4 && t <= 8;
  if (bombType(a) && bombType(b)) {
    if (a !== b) return a > b;
    return rankBigger(action.value, lastAction.value, curRank);
  }
  if (bombType(a)) return true;
  if (bombType(b)) return false;
  if (a !== b) return false;
  if (a === 13) return action.value > lastAction.value;
  if (a === 10 || a === 11 || a === 12) return action.value > lastAction.value;
  return rankBigger(action.value, lastAction.value, curRank);
}

function rankBigger(v1, v2, curRank) {
  const r1 = v1 >= 52 ? v1 : v1 % 13 === levelIdx(curRank) ? 50 : v1 % 13;
  const r2 = v2 >= 52 ? v2 : v2 % 13 === levelIdx(curRank) ? 50 : v2 % 13;
  return r1 > r2;
}

/** 手牌显示（排序） */
export function handDisplay(hand) {
  const list = [];
  for (let i = 0; i < CARD_N; i++) for (let k = 0; k < hand[i]; k++) list.push(i);
  list.sort((x, y) => {
    if (x >= SB || y >= SB) return y - x;
    const rx = x % 13, ry = y % 13;
    if (rx !== ry) return ry - rx;
    return Math.floor(x / 13) - Math.floor(y / 13);
  });
  return list.map((c) => numToCard(c));
}
