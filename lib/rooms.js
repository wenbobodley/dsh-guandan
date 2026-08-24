// rooms.js — 掼蛋-中联储卫 多人房间模型（V3.0.1 HTTP 轮询版）
// 房间 = 1 个 GuandanGame + 4 个座位（真人占位，空位机器人补）+ 服务端权威回合驱动：
//   · 真人回合：60 秒计时（开局第一手不限时），超时服务端自动过牌
//   · 机器人回合：5 秒节奏自动推进（复用 playflow.advanceOne）
import { GuandanGame } from './game.js';
import { advanceOne } from './playflow.js';
import { numToCard } from './cards.js';
import { typeName } from './engine.js';
import { tryParseCards, rankProfileOf, rankProfileEq } from './parse.js';

const AVATARS = ['🦁', '🐯', '🦊', '🐼'];
const BOT_NAMES = ['牌友-小中', '牌友-小联', '牌友-小储'];
const HUMAN_TURN_MS = 60000; // 真人回合：60 秒
const BOT_DELAY_MS = 5000;   // 机器人回合：5 秒节奏（到点必须出/自动过）
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

/** 房间表：code → room */
const rooms = new Map();
/** 玩家 key → 房间码（快速定位 + 重连） */
const playerRooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function clearTimers(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
  if (room.humanTimer) { clearTimeout(room.humanTimer); room.humanTimer = null; }
  room.turnDeadline = null;
}

/** 建房：房主自动占 0 号位（南） */
export function createRoom(key, name, avatar) {
  const code = genCode();
  const room = {
    code,
    game: null,
    players: new Map(), // seat → { key, name, avatar, isHuman:true, connected:true }
    botTimer: null,
    humanTimer: null,
    turnDeadline: null,
    lastActivity: Date.now(),
    started: false,
  };
  rooms.set(code, room);
  const seat = 0;
  room.players.set(seat, { key, name: name || '房主', avatar: avatar || AVATARS[seat], connected: true });
  playerRooms.set(key, code);
  return { ok: true, code, seat };
}

/** 加入房间：指定空位或自动占第一个空位；同 key 重连原位 */
export function joinRoom(code, key, name, avatar, wantSeat) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: '房间不存在' };
  // 重连：同 key 直接回原座位
  for (const [s, p] of room.players) {
    if (p.key === key) { p.connected = true; room.lastActivity = Date.now(); return { ok: true, code, seat: s, reconnected: true }; }
  }
  let seat = -1;
  if (wantSeat !== undefined && wantSeat >= 0 && wantSeat <= 3) {
    if (room.players.has(wantSeat)) return { ok: false, error: `该座位（${['南','东','北','西'][wantSeat]}）已有人，请换一个座位` };
    seat = wantSeat;
  } else {
    // 自动分配：优先坐对家位(2，与房主组队)，再按 东1→西3→南0
    const order = [2, 1, 3, 0];
    for (const s of order) if (!room.players.has(s)) { seat = s; break; }
  }
  if (seat < 0) return { ok: false, error: '房间已满' };
  room.players.set(seat, { key, name: name || `玩家${seat + 1}`, avatar: avatar || AVATARS[seat], connected: true });
  playerRooms.set(key, code);
  room.lastActivity = Date.now();
  // 牌局进行中真人加入：同步游戏内该座位的名字与真人身份
  if (room.game && room.game.players[seat]) {
    room.game.players[seat].name = name || `玩家${seat + 1}`;
    room.game.players[seat].isHuman = true;
  }
  return { ok: true, code, seat };
}

/** 离开房间（真人离开 → 该座位空出，若牌局中由机器人接管） */
export function leaveRoom(key) {
  const code = playerRooms.get(key);
  if (!code) return { ok: false };
  const room = rooms.get(code);
  playerRooms.delete(key);
  if (!room) return { ok: true };
  for (const [s, p] of room.players) {
    if (p.key === key) room.players.delete(s);
  }
  room.lastActivity = Date.now();
  // 牌局中真人离开 → 该座位转机器人
  if (room.game) {
    for (let s = 0; s < 4; s++) {
      if (!room.players.has(s)) room.game.players[s].isHuman = false;
    }
    if (room.game.players[room.game.playerWaiting] && !room.game.players[room.game.playerWaiting].isHuman) {
      clearTimers(room);
      drive(room);
    }
  }
  return { ok: true };
}

/** 开始牌局：空位由机器人补位 */
export function startGame(code) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: '房间不存在' };
  if (room.game) return { ok: false, error: '牌局已开始' };
  if (room.players.size === 0) return { ok: false, error: '房间没人' };
  const g = new GuandanGame();
  const botIdx = [0, 0, 0];
  for (let s = 0; s < 4; s++) {
    const p = room.players.get(s);
    if (p) {
      g.setPlayer(s, { name: p.name, isHuman: true });
    } else {
      g.setPlayer(s, { name: BOT_NAMES[botIdx[0]++], isHuman: false });
    }
  }
  g.startRound();
  room.game = g;
  room.started = true;
  room.lastActivity = Date.now();
  drive(room);
  return { ok: true };
}

/** 真人手动开始下一局（局结束后停留展示排名，不自动续局） */
export function nextRound(code) {
  const room = rooms.get(code);
  if (!room || !room.game) return { ok: false, error: '牌局未开始' };
  const g = room.game;
  if (!g.roundEnd && !g.episodeEnd) return { ok: false, error: '本局尚未结束' };
  if (g.episodeEnd) return { ok: false, error: '整局已通关，请重新建房开始新的一整局' };
  g.startRound();
  room.lastActivity = Date.now();
  drive(room);
  return { ok: true, notes: ['开始下一局'] };
}

/** 真人出牌/过牌：校验该玩家是否当前回合的真人座位 */
export function playRoom(code, key, { cards, pass }) {
  const room = rooms.get(code);
  if (!room || !room.game) return { ok: false, error: '牌局未开始' };
  let seat = -1;
  for (const [s, p] of room.players) if (p.key === key) { seat = s; break; }
  if (seat < 0) return { ok: false, error: '未加入本房间' };
  const g = room.game;
  if (g.playerWaiting !== seat) return { ok: false, error: '还没轮到你的座位出牌' };
  if (pass) {
    // 领出（牌权在手，lastMax 为空）时不得过牌
    if (g.lastMax === null) {
      const canPlay = g.legalActionsFor(seat).some((a) => a.type !== -1);
      if (canPlay) return { ok: false, error: '你有牌权（领出），必须出牌，不能过' };
    }
    const res = g.play(seat, null);
    if (!res.ok) return { ok: false, error: res.error };
    clearTimers(room);
    drive(room);
    return { ok: true, notes: ['你过牌'] };
  }
  // 从合法动作匹配（复用单人 playHuman 的匹配逻辑）
  const legal = g.legalActionsFor(seat);
  const vec = tryParseCards(cards);
  let found = null;
  if (vec !== null) {
    found = legal.find((a) => vecKeyEq(a.cards, vec));
  } else {
    const profile = rankProfileOf(cards);
    if (profile) found = legal.find((a) => rankProfileEq(a.cards, profile));
  }
  if (!found) return { ok: false, error: '不是合法出牌' };
  const res = g.play(seat, found);
  if (!res.ok) return { ok: false, error: res.error };
  clearTimers(room);
  drive(room);
  const list = [];
  for (let i = 0; i < 54; i++) for (let k = 0; k < found.cards[i]; k++) list.push(numToCard(i));
  return { ok: true, notes: [`你出：${list.join(' ')}（${typeName(found.type)}）`] };
}

/** 服务端回合驱动：真人 60 秒计时 / 机器人 5 秒节奏 / 局结束停留（不自动续局，由真人手动触发下一局） */
function drive(room) {
  clearTimers(room);
  const g = room.game;
  if (!g || g.roundEnd || g.episodeEnd) return; // 局/整局结束：停留显示排名，等真人手动开新局
  const cur = g.players[g.playerWaiting];
  room.lastActivity = Date.now();
  if (!cur.isHuman) {
    // 机器人：5 秒后走一步（到点必须出，顺带处理回合内多步与局间续局）
    room.botTimer = setTimeout(() => {
      advanceOne(g);
      drive(room);
    }, BOT_DELAY_MS);
  } else {
    // 真人：牌权/领出（lastMax 为空）不限时；否则 60 秒计时，超时自动过牌
    const isLead = g.lastMax === null && g.trickPass === 0;
    if (!isLead) {
      room.turnDeadline = Date.now() + HUMAN_TURN_MS;
      room.humanTimer = setTimeout(() => {
        // 超时自动过牌（服务端权威；仅非领出时才过）
        const seat = g.playerWaiting;
        if (g.lastMax === null) {
          drive(room); // 领出：无牌可出（只剩逢人配）等极端情形，交给引擎
          return;
        }
        g.play(seat, { type: -1, auto: true }); // 超时自动过牌（带 auto 标记）
        drive(room);
      }, HUMAN_TURN_MS);
    } else {
      room.turnDeadline = null;
    }
  }
}

/** 房间快照（按观众视角裁剪：只给本人手牌，他人只给张数） */
export function roomState(code, viewerKey) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: '房间不存在' };
  const seats = [];
  for (let s = 0; s < 4; s++) {
    const p = room.players.get(s);
        seats.push({
      seat: s,
      name: p ? p.name : (room.game ? room.game.players[s].name : '空位'),
      avatar: p ? p.avatar : '🤖', // 机器人统一 🤖，避免与真人头像混淆
      isHuman: !!p,
      connected: p ? p.connected : false,
    });
  }
  let viewerSeat = -1;
  for (const [s, p] of room.players) if (p.key === viewerKey) viewerSeat = s;
  const g = room.game;
  let game = null;
  if (g) {
    const s = g.snapshot(Math.max(viewerSeat, 0));
    const idxStrToNames = (x) => (x ? x.split(',').filter(Boolean).map((n) => numToCard(Number(n))) : []);
    game = {
      round: s.round,
      level: s.level,
      playerWaiting: s.playerWaiting,
      waitingName: s.hands[s.playerWaiting]?.name ?? '',
      waitingIsHuman: !!room.players.get(s.playerWaiting),
      roundEnd: s.roundEnd,
      episodeEnd: s.episodeEnd,
      winOrder: s.winOrder.map((i) => s.hands[i]?.name ?? `#${i}`),
      winOrderSeats: s.winOrder.slice(), // 出完顺序的座位 id（前端据此打排名标签 1/2/3/4）
      hands: s.hands.map((h) => ({
        id: h.id,
        name: h.name,
        count: h.count,
        isHuman: !!room.players.get(h.id),
        ...(h.id === viewerSeat && h.cards ? { cards: idxStrToNames(h.cards) } : {}),
        ...(h.revealed && h.cards ? { revealed: true, cards: idxStrToNames(h.cards) } : {}), // 末游底牌公开
      })),
      lastMax: s.lastMax ? { player: s.lastMax.player, name: s.hands[s.lastMax.player]?.name ?? '', cards: idxStrToNames(s.lastMax.cards).join(','), type: typeName(s.lastMax.type) } : null,
      history: s.history.map((h) =>
        h.pass ? { player: h.player, name: s.hands[h.player]?.name ?? '', pass: true, auto: !!h.auto } : { player: h.player, name: s.hands[h.player]?.name ?? '', cards: idxStrToNames(h.cards).join(','), type: typeName(h.type) }
      ),
      trickNo: s.trickNo,
      trick: s.trick.map((h) =>
        h.pass ? { player: h.player, name: s.hands[h.player]?.name ?? '', pass: true, auto: !!h.auto } : { player: h.player, name: s.hands[h.player]?.name ?? '', cards: idxStrToNames(h.cards).join(','), type: typeName(h.type) }
      ),
    };
  }
  const turnSeat = g ? g.playerWaiting : -1;
  return {
    ok: true,
    code,
    seats,
    viewerSeat,
    started: room.started,
    turnSeat,
    turnName: g ? g.players[turnSeat].name : '',
    countdown: room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000)) : null,
    game,
  };
}

/** 清理过期房间（无真人 / 超时闲置） */
export function sweepRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - room.lastActivity > ROOM_IDLE_MS;
    if (room.players.size === 0 || idle) {
      clearTimers(room);
      rooms.delete(code);
    }
  }
}

export { rooms };

function vecKeyEq(a, b) {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}
