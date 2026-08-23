// parse.js — 掼蛋-中联储卫 出牌输入解析（可独立测试）
// 支持两类输入：
//   1) 完整牌面：如 "H2 H2 S2" / "♠3 ♥4" / "小王 大王"
//   2) 纯点数：如 "334455" / "33 44 55" / "JJQQKK" / "10JQKA"（按点数数量匹配）
import { strToCards, cardsToVector } from './cards.js';

/** 纯点数写法 → { rankChar: count }；无法解析返回 null */
export function rankProfileOf(s) {
  const map = { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, T: 0, J: 0, Q: 0, K: 0, A: 0 };
  const tokens = s.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let any = false;
  for (const tok of tokens) {
    for (let idx = 0; idx < tok.length; idx++) {
      const ch = tok[idx];
      if (ch === '1') {
        // "10" 或 "10JQKA" 中的 1 后跟 0 → 计为 T
        if (tok[idx + 1] === '0') continue;
        return null; // 裸 1 无法解析
      }
      if (ch === '0') { map['T'] += 1; any = true; continue; }
      if (map[ch] !== undefined) { map[ch] += 1; any = true; }
      else return null;
    }
  }
  return any ? map : null;
}

/** 动作牌的 rank 数量是否与 profile 一致（不区分花色；不允许王） */
export function rankProfileEq(vec, profile) {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const counts = new Array(13).fill(0);
  for (let i = 0; i < 52; i++) if (vec[i]) counts[i % 13] += vec[i];
  if (vec[52] || vec[53]) return false;
  for (let i = 0; i < 13; i++) if (counts[i] !== (profile[ranks[i]] ?? 0)) return false;
  return true;
}

/** 尝试把用户输入解析为牌向量；纯点数时返回 null（由调用方做 profile 匹配） */
export function tryParseCards(s) {
  try {
    return cardsToVector(strToCards(s));
  } catch {
    return null;
  }
}
