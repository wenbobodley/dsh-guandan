// cards.js — 掼蛋-中联储卫 牌表示层
// 表示法（与 AltmanD/Guandan 一致，54 维向量）：
//   索引 0..51  = suit*13 + rank  (suit: H=0,S=1,C=2,D=3; rank: 0=2,1=3,...,12=A)
//   索引 52 = 小王(SB), 53 = 大王(HR)
//   级牌的红桃（逢人配/万能牌）位于索引 rankIdx（H 花色 rank 为 rankIdx）

export const SUITS = ['H', 'S', 'C', 'D'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const RANK_TO_IDX = Object.fromEntries(RANKS.map((r, i) => [r, i]));
export const IDX_TO_RANK = RANKS;
export const SB = 52; // 小王
export const HR = 53; // 大王
export const CARD_N = 54;

/** 牌索引 → 显示名，如 0→'H2'，52→'SB'，53→'HR' */
export function numToCard(idx) {
  if (idx === SB) return 'SB';
  if (idx === HR) return 'HR';
  const suit = SUITS[Math.floor(idx / 13)];
  const rank = RANKS[idx % 13];
  return suit + rank;
}

/** 'H2'/'SB' 等 → 牌索引 */
export function cardToNum(s) {
  s = s.toUpperCase();
  if (s === 'SB') return SB;
  if (s === 'HR') return HR;
  const suit = s[0];
  const rank = s.slice(1);
  return SUITS.indexOf(suit) * 13 + RANK_TO_IDX[rank];
}

/** 54 维向量（Uint8Array）→ 牌索引数组 */
export function vectorToCards(vec) {
  const out = [];
  for (let i = 0; i < CARD_N; i++) {
    for (let k = 0; k < vec[i]; k++) out.push(i);
  }
  return out;
}

/** 牌索引数组 → 54 维向量 */
export function cardsToVector(list) {
  const v = new Uint8Array(CARD_N);
  for (const c of list) v[c] += 1;
  return v;
}

/** 牌索引数组 → 显示字符串，如 "H2 H2 S2 C3" */
export function cardsToStr(list) {
  return list.map(numToCard).join(' ');
}

/** 显示字符串 → 牌索引数组（容忍任意空白与中文花色简写） */
export function strToCards(s) {
  const tokens = s.trim().toUpperCase().split(/\s+/).filter(Boolean);
  return tokens.map((t) => {
    if (t === 'SB' || t === '小王' || t === '小' || t === 'JOKERS') return SB;
    if (t === 'HR' || t === '大王' || t === '大') return HR;
    let suit = t[0];
    let rank = t.slice(1);
    // 中文花色支持：♠S ♥H ♦D ♣C / 黑红梅方
    if (['♠', 'S', '黑'].includes(suit)) suit = 'S';
    else if (['♥', 'H', '红'].includes(suit)) suit = 'H';
    else if (['♦', 'D', '方'].includes(suit)) suit = 'D';
    else if (['♣', 'C', '梅', '花'].includes(suit)) suit = 'C';
    if (rank === '10' || rank === '十' || rank === 'X') rank = 'T';
    if (rank === '11') rank = 'J';
    if (rank === '12') rank = 'Q';
    if (rank === '13') rank = 'K';
    if (rank === '14') rank = 'A';
    if (rank === '1') rank = 'A';
    const rIdx = RANK_TO_IDX[rank];
    if (rIdx === undefined) throw new Error(`无法识别的牌: ${t}`);
    return SUITS.indexOf(suit) * 13 + rIdx;
  });
}

/** 每种牌的数量（0..12，不含大小王） */
export function rankCounts(vec) {
  const num = new Array(13).fill(0);
  for (let i = 0; i < 13; i++) {
    num[i] = vec[i] + vec[13 + i] + vec[26 + i] + vec[39 + i];
  }
  return num;
}

/** 级牌索引（= 红桃级牌位置 = 逢人配万能牌位置），levelRankIdx ∈ 0..12 */
export function levelRankIdx(levelChar) {
  return RANK_TO_IDX[levelChar];
}

/** 满副两副牌（108 张） */
export function fullDeck() {
  const deck = [];
  for (let c = 0; c < CARD_N; c++) {
    const copies = c === SB || c === HR ? 2 : 8; // 每点数 8 张（2副×4花色），王各 2 张
    for (let k = 0; k < copies; k++) deck.push(c);
  }
  return deck;
}

/** 洗牌（Fisher-Yates） */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
