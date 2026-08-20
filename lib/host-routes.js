// host-routes.js — /guandan/* HTTP 路由层（浏览器 UI 直连接口）
// 与 guandan_* 工具共享同一张会话级牌局表：UI 点牌 == Agent 调工具，同一局牌。
// 接口（JSON envelope，同 aionui-panel 风格）：
//   GET  /guandan/api/state?session=<sid>          当前局面（UI 快照）
//   POST /guandan/api/new?session=<sid>&seat=0     开新一局（机器人自动推进到人）
//   POST /guandan/api/play?session=<sid>           { cards?, pass? } 出牌/过牌，自动接续机器人
//   POST /guandan/api/hint?session=<sid>           当前合法出牌
import { numToCard } from './cards.js';
import { typeName } from './engine.js';
import { autoAdvance, playHuman, humanSeat } from './playflow.js';

const OK = (value) => ({ ok: true, value });
const FAIL = (message, code = 'internal') => ({ ok: false, error: { code, message } });

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
    hands: s.hands.map((h) => ({
      id: h.id,
      name: h.name,
      count: h.count,
      isHuman: h.isHuman,
      ...(h.id === human && h.cards ? { cards: idxStrToNames(h.cards) } : {}),
    })),
    lastMax: s.lastMax ? { player: s.lastMax.player, name: s.hands[s.lastMax.player]?.name ?? '', cards: idxStrToNames(s.lastMax.cards).join(','), type: typeName(s.lastMax.type) } : null,
    history: s.history.map((h) =>
      h.pass ? { player: h.player, name: s.hands[h.player]?.name ?? '', pass: true } : { player: h.player, name: s.hands[h.player]?.name ?? '', cards: idxStrToNames(h.cards).join(','), type: typeName(h.type) }
    ),
    legal: s.legal.slice(0, 20).map((a) => ({ cards: a.cards, type: typeName(a.type) })),
    legalCount: s.legalCount,
    tributeLog: s.tributeLog,
  };
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
      if (req.method === 'GET' && path === '/guandan/api/state') {
        send(200, OK(uiSnapshot(ensureGame(sid))));
        return;
      }
      if (req.method === 'POST' && path === '/guandan/api/new') {
        const seat = Number(url.searchParams.get('seat') ?? 0) || 0;
        const g = freshGame(sid, ((seat % 4) + 4) % 4);
        const notes = autoAdvance(g);
        send(200, OK({ state: uiSnapshot(g), notes }));
        return;
      }
      if (req.method === 'POST' && path === '/guandan/api/play') {
        const g = ensureGame(sid);
        const body = JSON.parse((await readBody(req)) || '{}');
        const seat = humanSeat(g);
        const r = playHuman(g, seat, { cards: body.cards, pass: !!body.pass });
        if (!r.ok) {
          send(400, FAIL(r.error, 'illegal-play'));
          return;
        }
        const notes = [...r.notes, ...autoAdvance(g)];
        send(200, OK({ state: uiSnapshot(g), notes }));
        return;
      }
      if (req.method === 'POST' && path === '/guandan/api/hint') {
        const g = ensureGame(sid);
        const seat = humanSeat(g);
        const s = g.snapshot(seat);
        send(200, OK({
          need: s.lastMax ? `${s.lastMax.cards}（${typeName(s.lastMax.type)}）` : '自由出牌',
          legal: s.legal.map((a) => ({ cards: a.cards, type: typeName(a.type) })),
        }));
        return;
      }
      send(404, FAIL('not found', 'not-found'));
    } catch (e) {
      send(500, FAIL(String(e?.message ?? e), 'internal'));
    }
  };
  return webServer.register({ kind: 'prefix', path: '/guandan', handler });
}
