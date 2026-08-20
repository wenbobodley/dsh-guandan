// game.js — 掼蛋-中联储卫 对局流程（发牌/贡牌/出牌/升级/回合循环）
import { RANKS, RANK_TO_IDX, CARD_N, cardsToVector, shuffle, fullDeck, numToCard } from './cards.js';
import { legalActions, compareCards, canBeat, RANK2 } from './engine.js';

const SEATS = 4;

export class GuandanGame {
  constructor(seed) {
    this.rng = seed === undefined ? Math.random : mulberry32(seed);
    // players: { id, name, isHuman, level, playingSelf, cards: Uint8Array }
    this.players = [];
    for (let i = 0; i < SEATS; i++) {
      this.players.push({ id: i, name: `玩家${i + 1}`, isHuman: false, level: 0, playingSelf: false, cards: new Uint8Array(CARD_N) });
    }
    this.curRank = '2';
    this.playerWaiting = 0;
    this.winOrder = [];
    this.onTable = [0, 1, 2, 3];
    this.wind = false;
    this.windNum = 0;
    this.trickPass = 0;
    this.recvWind = false;
    this.lastAction = null;
    this.lastMax = null;
    this.lastMaxPlayer = null;
    this.lastPlayId = null;
    this.roundEnd = false;
    this.episodeEnd = false;
    this.antiTribute = false;
    this.tributeLog = [];
    this.history = [];
    this.trickNo = 0; // 当前墩号（每墩结束 +1），供 UI 展示各家面前出牌
    this.roundNo = 0;
    this.level = 0; // 级牌索引（0=2 … 12=A）
  }

  setPlayer(i, opts) {
    const p = this.players[i];
    if (opts.name) p.name = opts.name;
    if (opts.isHuman !== undefined) p.isHuman = opts.isHuman;
  }

  /** 开一局（洗牌发牌 + 贡牌 + 定先手） */
  startRound() {
    this.roundNo += 1;
    const deck = shuffle(fullDeck(), this.rng);
    for (let i = 0; i < SEATS; i++) {
      this.players[i].cards = cardsToVector(deck.slice(i * 27, (i + 1) * 27));
      this.players[i].level = this.level;
      this.players[i].playingSelf = i === (this.winOrder[0] ?? 0) || i === (((this.winOrder[0] ?? 0) + 2) % 4);
    }
    this.curRank = RANK2[this.level];
    this.onTable = [0, 1, 2, 3];
    this.wind = false;
    this.windNum = 0;
    this.trickPass = 0;
    this.recvWind = false;
    this.lastAction = null;
    this.lastMax = null;
    this.lastMaxPlayer = null;
    this.lastPlayId = null;
    this.lastFinisher = null;
    this.roundEnd = false;
    this.antiTribute = false;
    this.tributeLog = [];
    this.history = [];
    if (this.roundNo === 1) {
      this.playerWaiting = 0;
    } else {
      this.doRound2Tribute();
    }
  }

  /** 上一局结算后的进贡/还贡/抗贡（单下/双下） */
  doRound2Tribute() {
    const order = this.winOrder;
    if (order.length !== 4) return;
    const last = order[3];
    const third = order[2];
    const first = order[0];
    const second = order[1];
    const isDouble = Math.abs(third - last) === 2;
    if (isDouble) {
      if (this.players[last].cards[53] + this.players[third].cards[53] >= 2) {
        this.antiTribute = true;
        this.tributeLog.push('双下抗贡：末游与三游合计两张大王，免进贡');
        this.playerWaiting = first;
        return;
      }
    } else {
      if (this.players[last].cards[53] >= 2) {
        this.antiTribute = true;
        this.tributeLog.push('抗贡：末游持有两张大王，免进贡');
        this.playerWaiting = first;
        return;
      }
    }
    const tLast = this.tributeLegal(this.players[last].cards);
    const tThird = this.tributeLegal(this.players[third].cards);
    const biggerLast = compareCards(tLast, tThird, this.curRank) >= 0;
    if (isDouble) {
      if (biggerLast) {
        this.giveCard(last, first, tLast);
        this.giveCard(third, second, tThird);
        this.tributeLog.push(`双下进贡：${this.players[last].name} 贡 ${cardStr(tLast)} 给 ${this.players[first].name}；${this.players[third].name} 贡 ${cardStr(tThird)} 给 ${this.players[second].name}`);
        this.playerWaiting = last;
      } else {
        this.giveCard(third, first, tThird);
        this.giveCard(last, second, tLast);
        this.tributeLog.push(`双下进贡：${this.players[third].name} 贡 ${cardStr(tThird)} 给 ${this.players[first].name}；${this.players[last].name} 贡 ${cardStr(tLast)} 给 ${this.players[second].name}`);
        this.playerWaiting = third;
      }
      const bFirst = this.backLegal(this.players[first].cards);
      const bSecond = this.backLegal(this.players[second].cards);
      if (bFirst !== null) this.giveCard(first, last, bFirst);
      if (bSecond !== null) this.giveCard(second, third, bSecond);
      this.tributeLog.push(`还贡：${this.players[first].name} 还 ${bFirst === null ? '无' : cardStr(bFirst)}，${this.players[second].name} 还 ${bSecond === null ? '无' : cardStr(bSecond)}`);
    } else {
      this.giveCard(last, first, tLast);
      this.tributeLog.push(`进贡：${this.players[last].name} 贡 ${cardStr(tLast)} 给 ${this.players[first].name}`);
      const bFirst = this.backLegal(this.players[first].cards);
      if (bFirst !== null) this.giveCard(first, last, bFirst);
      this.tributeLog.push(`还贡：${this.players[first].name} 还 ${bFirst === null ? '无' : cardStr(bFirst)}`);
      this.playerWaiting = last;
    }
  }

  /** 进贡选择：最大的非万能牌（王优先） */
  tributeLegal(handVec) {
    const list = [];
    for (let i = 0; i < CARD_N; i++) for (let k = 0; k < handVec[i]; k++) list.push(i);
    if (list.includes(53)) return 53;
    if (list.includes(52)) return 52;
    const rankCard = RANK_TO_IDX[this.curRank];
    const best = list.reduce((a, b) => {
      const va = a === 53 || a === 52 ? a : a % 13 === rankCard ? -1 : a % 13;
      const vb = b === 53 || b === 52 ? b : b % 13 === rankCard ? -1 : b % 13;
      return va > vb ? a : b;
    });
    return best;
  }

  /** 还贡选择：点数 ≤10（rank 0..8）且非级牌、非王；无则 null（还最小） */
  backLegal(handVec) {
    const rankCard = RANK_TO_IDX[this.curRank];
    const cands = [];
    for (let i = 0; i < 52; i++) {
      if (handVec[i] && i % 13 <= 8 && i % 13 !== rankCard) cands.push(i);
    }
    if (!cands.length) return null;
    return cands.reduce((a, b) => (a % 13 <= b % 13 ? a : b));
  }

  giveCard(from, to, card) {
    this.players[from].cards[card] -= 1;
    this.players[to].cards[card] += 1;
  }

  /** 当前玩家的合法动作 */
  legalActionsFor(playerId) {
    const p = this.players[playerId];
    const lastType = this.lastMax ? this.lastMax.type : -1;
    const lastValue = this.lastMax ? this.lastMax.value : -1;
    return legalActions(p.cards, this.curRank, lastType, lastValue);
  }

  /** 执行动作（playerId 出牌或过）。返回 { ok, error?, event? } */
  play(playerId, action) {
    if (this.roundEnd || this.episodeEnd) return { ok: false, error: '对局已结束' };
    if (playerId !== this.playerWaiting) return { ok: false, error: `还没轮到 ${this.players[playerId].name}（当前 ${this.players[this.playerWaiting].name}）` };
    const p = this.players[playerId];
    const isPass = action === null || action.type === -1;
    if (!isPass) {
      const v = action.cards;
      for (let i = 0; i < CARD_N; i++) if (v[i] > p.cards[i]) return { ok: false, error: '手牌中没有这些牌' };
      const legal = this.legalActionsFor(playerId);
      const key = vecKey(v) + '|' + action.value + '|' + action.type;
      const found = legal.find((a) => vecKey(a.cards) + '|' + a.value + '|' + a.type === key);
      if (!found) return { ok: false, error: '不是合法出牌（或无法压过上一手）' };
    }
    this.lastPlayId = playerId;
    if (isPass) {
      this.trickPass += 1;
      this.history.push({ player: playerId, pass: true, trick: this.trickNo });
    } else {
      this.trickPass = 0;
      for (let i = 0; i < CARD_N; i++) p.cards[i] -= action.cards[i];
      this.lastAction = { ...action, player: playerId };
      this.lastMax = { ...action, player: playerId };
      this.lastMaxPlayer = playerId;
      this.history.push({ player: playerId, cards: action.cards, type: action.type, value: action.value, trick: this.trickNo });
    }
    if (this.wind && !isPass) {
      this.wind = false;
      this.windNum = 0;
    }
    if (!isPass && isEmpty(p.cards)) {
      this.onTable = this.onTable.filter((x) => x !== playerId);
      this.winOrder.push(playerId);
      this.lastFinisher = playerId;
      this.wind = true;
      this.windNum = this.onTable.length;
      this.checkEnd();
    }
    if (!this.roundEnd) {
      this.advanceTurn();
    }
    return { ok: true, event: isPass ? 'pass' : 'play' };
  }

  advanceTurn() {
    const n = this.players.length;
    if (this.wind) {
      if (this.windNum === 0) {
        this.wind = false;
        // 接风：最后一个出完牌者的对家（须在桌上）
        let target = (this.lastFinisher ?? this.lastPlayId) + 2;
        while (!this.onTable.includes(target % n)) target += 1;
        this.playerWaiting = target % n;
        this.recvWind = true;
        this.lastMax = null;
        this.lastMaxPlayer = null;
        this.trickPass = 0;
        this.trickNo += 1; // 新墩
      } else {
        let next = this.playerWaiting;
        do {
          next = (next + 1) % n;
        } while (!this.onTable.includes(next));
        this.playerWaiting = next;
        this.windNum -= 1;
      }
      return;
    }
    if (this.trickPass >= this.onTable.length - 1) {
      // 墩胜者可能为 null（领出者只剩逢人配无法出牌而被迫过牌）→ 回退到最近实际出牌者，再落到在桌玩家
      this.playerWaiting = this.lastMaxPlayer ?? this.lastPlayId ?? 0;
      while (!this.onTable.includes(this.playerWaiting)) this.playerWaiting = (this.playerWaiting + 1) % this.players.length;
      this.lastMax = null;
      this.lastMaxPlayer = null;
      this.trickPass = 0;
      this.trickNo += 1; // 新墩
      return;
    }
    let next = this.playerWaiting;
    do {
      next = (next + 1) % n;
    } while (!this.onTable.includes(next));
    this.playerWaiting = next;
  }

  checkEnd() {
    if (this.onTable.length === 1 || (this.onTable.length === 2 && Math.abs(this.onTable[0] - this.onTable[1]) === 2)) {
      this.roundEnd = true;
      for (const id of this.onTable) this.winOrder.push(id);
      this.upgrade();
    }
  }

  upgrade() {
    const [first, second, third] = this.winOrder;
    let uprank;
    if (Math.abs(first - second) === 2) uprank = 3;
    else if (Math.abs(first - third) === 2) uprank = 2;
    else uprank = 1;
    if (this.curRank === 'A' && this.players[first].playingSelf && uprank >= 2) {
      this.episodeEnd = true;
    }
    if (!this.episodeEnd) {
      this.players[first].playingSelf = true;
      this.players[(first + 2) % 4].playingSelf = true;
      this.players[(first + 1) % 4].playingSelf = false;
      this.players[(first + 3) % 4].playingSelf = false;
      const lvl = Math.min(12, this.players[first].level + uprank);
      this.level = lvl;
      this.curRank = RANK2[lvl];
      for (let i = 0; i < 4; i++) {
        if (i === first || i === (first + 2) % 4) this.players[i].level = lvl;
      }
    }
  }

  /** 状态快照（供工具输出） */
  snapshot(humanId) {
    const legal = this.legalActionsFor(this.playerWaiting);
    const lastMax = this.lastMax
      ? { player: this.lastMaxPlayer, type: this.lastMax.type, value: this.lastMax.value, cards: cardVecStr(this.lastMax.cards) }
      : null;
    const hands = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      count: countCards(p.cards),
      isHuman: p.isHuman,
    }));
    if (humanId >= 0) hands[humanId].cards = cardVecStr(this.players[humanId].cards);
    return {
      round: this.roundNo,
      level: this.curRank,
      playerWaiting: this.playerWaiting,
      lastMax,
      winOrder: this.winOrder.slice(),
      onTable: this.onTable.slice(),
      hands,
      legal: legal.slice(0, 40).map((a) => ({ cards: cardVecStr(a.cards), type: a.type, value: a.value })),
      legalCount: legal.length,
      roundEnd: this.roundEnd,
      episodeEnd: this.episodeEnd,
      tributeLog: this.tributeLog,
      history: this.history.slice(-8).map((h) =>
        h.pass ? { player: h.player, pass: true, trick: h.trick } : { player: h.player, cards: cardVecStr(h.cards), type: h.type, value: h.value, trick: h.trick }
      ),
      trickNo: this.trickNo,
      trick: this.history.filter((h) => h.trick === this.trickNo).map((h) =>
        h.pass ? { player: h.player, pass: true } : { player: h.player, cards: cardVecStr(h.cards), type: h.type, value: h.value }
      ),
    };
  }
}

function isEmpty(v) {
  for (let i = 0; i < CARD_N; i++) if (v[i]) return false;
  return true;
}

function countCards(v) {
  let n = 0;
  for (let i = 0; i < CARD_N; i++) n += v[i];
  return n;
}

function cardVecStr(v) {
  const out = [];
  for (let i = 0; i < CARD_N; i++) for (let k = 0; k < v[i]; k++) out.push(i);
  return out.join(',');
}

function cardStr(idx) {
  return numToCard(idx);
}

function vecKey(v) {
  let s = '';
  for (let i = 0; i < CARD_N; i++) if (v[i]) s += i + ':' + v[i] + ',';
  return s;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
