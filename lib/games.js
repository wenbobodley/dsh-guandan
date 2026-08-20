// games.js — 会话级牌局表（工具层与 /guandan/* 路由层共享同一个游戏实例）
import { GuandanGame } from './game.js';

/** 会话 id → GuandanGame（进程内单例表） */
const games = new Map();

const BOT_NAMES = ['机器人甲', '机器人乙', '机器人丙'];

/** 取（或按需创建）某会话的牌局。seat 仅在新创建时生效 */
export function ensureGame(sid, seat = 0) {
  let g = games.get(sid);
  if (!g) {
    g = new GuandanGame();
    for (let i = 0; i < 4; i++) {
      const botIdx = i < seat ? i : i - 1;
      g.setPlayer(i, { name: i === seat ? '你' : BOT_NAMES[botIdx] ?? `机器人${i}`, isHuman: i === seat });
    }
    g.startRound();
    games.set(sid, g);
  }
  return g;
}

/** 强制新建一局（guandan_new 与 UI「开局」用） */
export function freshGame(sid, seat = 0) {
  const g = new GuandanGame();
  for (let i = 0; i < 4; i++) {
    const botIdx = i < seat ? i : i - 1;
    g.setPlayer(i, { name: i === seat ? '你' : BOT_NAMES[botIdx] ?? `机器人${i}`, isHuman: i === seat });
  }
  g.startRound();
  games.set(sid, g);
  return g;
}

export { games };
