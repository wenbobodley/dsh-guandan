// host-routes.js — /guandan/* HTTP 路由层（浏览器 UI 直连接口）
// 与 guandan_* 工具共享同一张会话级牌局表：UI 点牌 == Agent 调工具，同一局牌。
// 接口（JSON envelope，同 aionui-panel 风格）：
//   GET  /guandan/api/state?session=<sid>          当前局面（UI 快照）
//   POST /guandan/api/new?session=<sid>&seat=0     开新一局（机器人自动推进到人）
//   POST /guandan/api/play?session=<sid>           { cards?, pass? } 出牌/过牌，自动接续机器人
//   POST /guandan/api/step?session=<sid>           单步推进机器人（UI 节奏）
//   POST /guandan/api/next?session=<sid>           手动开始下一局（局结束停留后）
//   POST /guandan/api/group?session=<sid>          组牌辅助（识别复合牌型）
//   GET  /guandan/api/bgm?session=<sid>            背景音乐列表（web/bgm 目录）
//   POST /guandan/api/hint?session=<sid>           当前合法出牌
//   POST /guandan/api/end?session=<sid>            结束牌局（清除该会话牌局）
//   POST /guandan/api/room[/<code>/<action>]       多人房间接口（建/加/开/出/下一局/状态/离开）
//   GET  /guandan/web/*                            静态前端（index.html / app.js / style.css / bgm/*）
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numToCard, cardToNum } from './cards.js';
import { typeName, legalActions } from './engine.js';
import { autoAdvance, advanceOne, playHuman, humanSeat, nextRoundManual } from './playflow.js';
import { endGame } from './games.js';
import {
  createRoom, joinRoom, roomState, startGame, playRoom, leaveRoom, nextRound, sweepRooms,
} from './rooms.js';

const OK = (value) => ({ ok: true, value });
const FAIL = (message, code = 'internal') => ({ ok: false, error: { code, message } });

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.amr': 'audio/amr',
};
const AUDIO_EXT = ['.mp3', '.ogg', '.m4a', '.wav', '.flac', '.amr'];

/** 读取 JSON 请求体 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1 << 20) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** 洗牌 → 牌面字符串数组 */
function cardsToStrs(vec) {
  const out = [];
  for (let i = 0; i < 54; i++) for (let k = 0; k < vec[i]; k++) out.push(numToCard(i));
  return out;
}

/** 快照里的索引串（"4,5,8,…"）→ 牌名字符串数组（["H5","H6","S9",…]），供浏览器渲染 */
function idxStrToNames(s) {
  if (!s) return [];
  return s.split(',').filter(Boolean).map((x) => numToCard(Number(x)));
}

/** 供浏览器渲染的牌局快照（所有 cards 均为可读牌名，如 "H6"/"SB"） */
export function uiSnapshot(game) {
  const human = humanSeat(game);
  const s = game.snapshot(human);
  return {
    round: s.round,
    level: s.level,
    wild: `♥${s.level}`,
    humanSeat: human,
    playerWaiting: s.playerWaiting,
    waitingName: s.hands[s.playerWaiting]?.name ?? '',
    waitingIsHuman: s.hands[s.playerWaiting]?.isHuman ?? false,
    roundEnd: s.roundEnd,
    episodeEnd: s.episodeEnd,
    winOrder: s.winOrder.map((i) => s.hands[i]?.name ?? `#${i}`),
    winOrderSeats: s.winOrder.slice(), // 出完顺序的座位 id（前端据此打排名标签 1/2/3/4）
    hands: s.hands.map((h) => ({
      id: h.id,
      name: h.name,
      count: h.count,
      isHuman: h.isHuman,
      ...(h.id === human && h.cards ? { cards: idxStrToNames(h.cards) } : {}),
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
    legal: s.legal.slice(0, 20).map((a) => ({ cards: a.cards, type: typeName(a.type) })),
    legalCount: s.legalCount,
    tributeLog: s.tributeLog,
  };
}

// —— /api/group 组牌辅助（复用引擎 legalActions，与出牌判定一致） ——
function strToCardNum(s) { return typeof s === 'string' ? cardToNum(s) : -1; }
function countVec(v) { let n = 0; for (let i = 0; i < 54; i++) n += v[i]; return n; }
function vecToCardNames(v) {
  const out = [];
  for (let i = 0; i < 54; i++) for (let k = 0; k < v[i]; k++) out.push(numToCard(i));
  return out;
}

/** 静态文件服务（web 目录，含 bgm） */
async function serveStatic(res, pathname) {
  let rel = pathname === '/guandan/web' || pathname === '/guandan/web/' ? 'index.html' : pathname.replace(/^\/guandan\/web\//, '');
  try { rel = decodeURIComponent(rel); } catch (e) {} // 中文文件名百分号解码
  const file = join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store, max-age=0' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

/** 注册 /guandan/* 路由；返回路由注销函数 */
export function registerGuandanRoutes(webServer, deps) {
  const { ensureGame, freshGame } = deps;
  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const sid = url.searchParams.get('session') ?? 'default';
    const send = (status, obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
    };
    try {
      // —— 静态前端（/guandan/web/*，前端 iframe 复用服务器版 UI） ——
      if (path === '/guandan/web' || path.startsWith('/guandan/web/')) {
        await serveStatic(res, path);
        return;
      }
      if (path.startsWith('/guandan/api/')) {
        const api = path.slice('/guandan/api/'.length);
        if (req.method === 'GET' && api === 'state') {
          send(200, OK(uiSnapshot(ensureGame(sid))));
          return;
        }
        if (req.method === 'POST' && api === 'new') {
          const seat = Number(url.searchParams.get('seat') ?? 0) || 0;
          const g = freshGame(sid, ((seat % 4) + 4) % 4);
          const step = advanceOne(g);
          send(200, OK({ state: uiSnapshot(g), notes: step.notes }));
          return;
        }
        if (req.method === 'POST' && api === 'play') {
          const g = ensureGame(sid);
          const body = JSON.parse((await readBody(req)) || '{}');
          const r = playHuman(g, humanSeat(g), { cards: body.cards, pass: !!body.pass, auto: !!body.auto });
          if (!r.ok) {
            send(400, FAIL(r.error + (r.hint ? '。' + r.hint : ''), 'illegal-play'));
            return;
          }
          // 只推进一步（机器人节奏由客户端每 5 秒调 /step 控制）
          const step = advanceOne(g);
          send(200, OK({ state: uiSnapshot(g), notes: [...r.notes, ...step.notes] }));
          return;
        }
        if (req.method === 'POST' && api === 'step') {
          const g = ensureGame(sid);
          const step = advanceOne(g);
          send(200, OK({ state: uiSnapshot(g), notes: step.notes }));
          return;
        }
        if (req.method === 'POST' && api === 'next') {
          // 局结束停留后，真人手动开始下一局（通关则重建一整局）
          let g = ensureGame(sid);
          let notes = [];
          if (g.episodeEnd) {
            const seat = humanSeat(g);
            g = freshGame(sid, seat);
            notes = ['🏆 通关！重新开始一整局'];
          } else {
            const r = nextRoundManual(g);
            if (!r.ok) { send(400, FAIL(r.error, 'illegal-next')); return; }
            notes = r.notes;
          }
          const step = advanceOne(g);
          send(200, OK({ state: uiSnapshot(g), notes: [...notes, ...step.notes] }));
          return;
        }
        if (req.method === 'POST' && api === 'group') {
          // 组牌：对选中牌识别可组成的复合牌型（顺子/同花顺/三带二/钢板/连对等），复用引擎与出牌判定一致
          const body = JSON.parse((await readBody(req)) || '{}');
          const list = Array.isArray(body.cards) ? body.cards : [];
          const level = String(body.level || '2');
          const vec = new Array(54).fill(0);
          let okAll = true;
          for (const c of list) {
            const n = strToCardNum(c);
            if (n < 0) { okAll = false; break; }
            vec[n] += 1;
          }
          if (!okAll) { send(400, FAIL('牌面无法识别', 'bad-cards')); return; }
          const actions = legalActions(vec, level);
          // 复合牌型（排除单张/对子/天王炸；炸弹也纳入，方便看牌）
          const composite = actions.filter((a) => {
            const t = a.type;
            return t !== -1 && t !== 14 && t !== 1 && t !== 2;
          });
          // 按张数从多到少、同张数按类型优先级（同花顺>钢板>连对>顺子>三带二>炸弹）
          const typePri = { 13: 0, 12: 1, 11: 2, 10: 3, 9: 4 };
          composite.sort((a, b) => {
            const ca = countVec(a.cards), cb = countVec(b.cards);
            if (ca !== cb) return cb - ca;
            return (typePri[a.type] ?? 9) - (typePri[b.type] ?? 9);
          });
          send(200, OK({ groups: composite.slice(0, 6).map((a) => ({ cards: vecToCardNames(a.cards), type: typeName(a.type), t: a.type })) }));
          return;
        }
        if (req.method === 'GET' && api === 'bgm') {
          // 背景音乐列表：扫描 web/bgm 目录（用户可自行放入 mp3/ogg 等）
          try {
            const dir = join(WEB_DIR, 'bgm');
            const names = (await readdir(dir)).filter((n) => AUDIO_EXT.includes(extname(n).toLowerCase()));
            send(200, OK({ files: names.sort().map((n) => ({ name: n, url: '/guandan/web/bgm/' + encodeURIComponent(n) })) }));
          } catch (e) { send(200, OK({ files: [] })); }
          return;
        }
        if (req.method === 'POST' && api === 'hint') {
          const g = ensureGame(sid);
          const seat = humanSeat(g);
          const s = g.snapshot(seat);
          send(200, OK({
            need: s.lastMax ? `${s.lastMax.cards}（${typeName(s.lastMax.type)}）` : '自由出牌',
            legal: s.legal.map((a) => ({ cards: a.cards, type: typeName(a.type) })),
          }));
          return;
        }
        if (req.method === 'POST' && api === 'end') {
          send(200, OK({ ended: endGame(sid) }));
          return;
        }
        // —— 多人房间（与独立服务器 rooms.js 同构，4 真人经 DSH webServer 联机） ——
        if (api.startsWith('room')) {
          const parts = api.split('/');
          const code = parts[1];
          const action = parts[2];
          if (req.method === 'POST' && !code) {
            const body = JSON.parse((await readBody(req)) || '{}');
            send(200, OK(createRoom(body.player, body.name, body.avatar)));
            return;
          }
          if (!code) { send(400, FAIL('缺房间码', 'bad-request')); return; }
          if (req.method === 'POST' && action === 'join') {
            const body = JSON.parse((await readBody(req)) || '{}');
            send(200, OK(joinRoom(code, body.player, body.name, body.avatar, body.seat)));
            return;
          }
          if (req.method === 'GET' && action === 'state') {
            const r = roomState(code, url.searchParams.get('player') || '');
            send(200, r.ok ? OK(r) : FAIL(r.error));
            return;
          }
          if (req.method === 'POST' && action === 'start') {
            const r = startGame(code);
            send(200, r.ok ? OK(r) : FAIL(r.error));
            return;
          }
          if (req.method === 'POST' && action === 'play') {
            const body = JSON.parse((await readBody(req)) || '{}');
            const r = playRoom(code, body.player, { cards: body.cards, pass: !!body.pass });
            send(200, r.ok ? OK(r) : FAIL(r.error));
            return;
          }
          if (req.method === 'POST' && action === 'next') {
            const r = nextRound(code);
            send(200, r.ok ? OK(r) : FAIL(r.error));
            return;
          }
          if (req.method === 'POST' && action === 'leave') {
            const body = JSON.parse((await readBody(req)) || '{}');
            send(200, OK(leaveRoom(body.player)));
            return;
          }
          send(404, FAIL('room action not found', 'not-found'));
          return;
        }
        send(404, FAIL('not found', 'not-found'));
        return;
      }
      send(404, FAIL('not found', 'not-found'));
    } catch (e) {
      send(500, FAIL(String(e?.message ?? e), 'internal'));
    }
  };
  return webServer.register({ kind: 'prefix', path: '/guandan', handler });
}

// 周期清理过期房间（每小时；无真人/超时闲置自动清）
if (typeof setInterval === 'function' && !globalThis.__GD_SWEEP_REGISTERED__) {
  globalThis.__GD_SWEEP_REGISTERED__ = true;
  setInterval(sweepRooms, 60 * 60 * 1000);
}
