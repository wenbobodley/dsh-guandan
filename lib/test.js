// test.js — 掼蛋-中联储卫 引擎自测
import assert from 'node:assert/strict';
import { strToCards, cardsToVector } from './cards.js';
import { legalActions, canBeat, compareCards, typeName } from './engine.js';
import { GuandanGame } from './game.js';
import { chooseAction } from './ai.js';
import { rankProfileOf, rankProfileEq, tryParseCards } from './parse.js';

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function hand(...cards) { return cardsToVector(strToCards(cards.join(' '))); }
function findAction(actions, type, value) {
  return actions.find((a) => a.type === type && a.value === value);
}
function findVec(actions, vec) {
  return actions.find((a) => eqVec(a.cards, vec));
}
function eqVec(a, b) { for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false; return true; }

console.log('== 单/对/三张/炸弹 ==');
{
  const acts = legalActions(hand('S3', 'H4', 'C5'), '2');
  ok('单张 S3 可出', acts.some((a) => a.type === 1 && a.value === 1 && eqVec(a.cards, hand('S3'))));
  ok('单张 H4 可出', acts.some((a) => a.type === 1 && a.value === 2));
  const acts2 = legalActions(hand('S3', 'H3', 'C3', 'D3', 'S4', 'H4'), '2');
  ok('三张 3 可出', acts2.some((a) => a.type === 3 && a.value === 1));
  ok('炸弹4张 3 可出', acts2.some((a) => a.type === 4 && a.value === 1));
  ok('对子 4 可出', acts2.some((a) => a.type === 2 && a.value === 2));
}

console.log('== 逢人配（万能牌）==');
{
  // 级牌 5：H5 是万能牌。手里一张 4 + 万能牌 → 可组 4 对（value=2 是 '4' 的索引）
  const acts = legalActions(hand('S4', 'H5', 'S7', 'C8'), '5');
  ok('万能牌补 4 的对子', acts.some((a) => a.type === 2 && a.value === 2));
  // 万能牌补 5 连顺：3,4,6,7 + 万能牌(5)。H5 补成黑桃 5 后是黑桃同花顺（type 13，合法且更优）
  const acts2 = legalActions(hand('S3', 'S4', 'S6', 'S7', 'H5'), '5');
  ok('万能牌补顺子 34567（作为同花顺）', acts2.some((a) => (a.type === 10 || a.type === 13) && a.value === 2));
}

console.log('== 逢人配不能单独出 ==');
{
  // 级牌 2：H2 是逢人配。仅剩 H2 时不能作为单牌打出
  const acts = legalActions(hand('H2'), '2');
  ok('仅剩逢人配不可单出', !acts.some((a) => a.type === 1));
  // 两张逢人配（H2 H2）不能作为对子单独打出
  const acts2 = legalActions(hand('H2', 'H2'), '2');
  ok('两张逢人配不可成对单出', !acts2.some((a) => a.type === 2 && a.cards[0] === 2));
  // 但逢人配可与实牌组合（H2 + S4 → 对4）
  const acts3 = legalActions(hand('H2', 'S4'), '2');
  ok('逢人配可补实牌成对子', acts3.some((a) => a.type === 2 && a.value === 2));
}

console.log('== 顺子/连对/钢板/同花顺 ==');
{
  const acts = legalActions(hand('S3', 'H4', 'C5', 'D6', 'S7', 'H8', 'C9', 'ST', 'HJ', 'CQ', 'SK', 'SA'), '2');
  ok('顺子 34567', acts.some((a) => a.type === 10 && a.value === 2));
  ok('顺子 10JQKA', acts.some((a) => a.type === 10 && a.value === 9));
  // 连对：334455
  const acts2 = legalActions(hand('S3', 'H3', 'S4', 'H4', 'S5', 'H5'), '2');
  ok('连对 334455', acts2.some((a) => a.type === 11 && a.value === 2));
  // 4 连对不允许：33445566
  const acts3 = legalActions(hand('S3', 'H3', 'S4', 'H4', 'S5', 'H5', 'S6', 'H6'), '2');
  ok('无 4 连对（33445566）', !acts3.some((a) => a.type === 11 && a.cards.reduce((x, y) => x + y, 0) === 8));
  // 2 连对不允许：3344
  const acts4 = legalActions(hand('S3', 'H3', 'S4', 'H4', 'S7', 'C8', 'D9'), '2');
  ok('无 2 连对（3344）', !acts4.some((a) => a.type === 11 && a.cards.reduce((x, y) => x + y, 0) === 4));
  // 钢板 333444（三张 3=idx1、三张 4=idx2 → value=2）
  const acts5 = legalActions(hand('S3', 'H3', 'C3', 'S4', 'H4', 'C4'), '2');
  ok('钢板 333444', acts5.some((a) => a.type === 12 && a.value === 2));
  ok('无 3 个三张钢板', !acts5.some((a) => a.type === 12 && a.cards.reduce((x, y) => x + y, 0) === 9));
  // 同花顺
  const acts6 = legalActions(hand('S3', 'S4', 'S5', 'S6', 'S7', 'C9', 'D9'), '2');
  ok('同花顺 34567 同花', acts6.some((a) => a.type === 13 && a.value === 2));
}

console.log('== 三带二 ==');
{
  const acts = legalActions(hand('S3', 'H3', 'C3', 'S4', 'H4', 'S9', 'H9'), '2');
  ok('三带二 33344', acts.some((a) => a.type === 9 && a.value === 1 && eqVec(a.cards, hand('S3', 'H3', 'C3', 'S4', 'H4'))));
  // 王作对不允许：333 + 大小王
  const acts2 = legalActions(hand('S3', 'H3', 'C3', 'SB', 'HR'), '2');
  ok('三带二不允许带王对', !acts2.some((a) => a.type === 9));
}

console.log('== 天王炸/双王 ==');
{
  const acts = legalActions(hand('SB', 'SB', 'HR', 'HR'), '2');
  ok('四王 = 天王炸', acts.some((a) => a.type === 14));
  const acts2 = legalActions(hand('SB', 'SB', 'S3', 'H3'), '2');
  ok('双王只是一对', !acts2.some((a) => a.type === 14));
  ok('双王可作对子', acts2.some((a) => a.type === 2 && a.value === 13));
}

console.log('== 比牌/压制 ==');
{
  const mk = (type, value, cards) => ({ cards, value, type });
  const single3 = mk(1, 1, hand('S3'));
  const singleK = mk(1, 11, hand('SK'));
  const singleLv = mk(1, 3, hand('H5')); // 级牌 5
  const bomb = mk(4, 1, hand('S3', 'H3', 'C3', 'D3'));
  const heaven = mk(14, 14, hand('SB', 'SB', 'HR', 'HR'));
  ok('K 压 3', canBeat(singleK, single3, '2'));
  ok('3 压不过 K', !canBeat(single3, singleK, '2'));
  ok('级牌 5 压 K', canBeat(singleLv, singleK, '5'));
  ok('炸弹压单牌', canBeat(bomb, singleK, '2'));
  ok('天王炸压炸弹', canBeat(heaven, bomb, '2'));
  ok('炸弹压不过天王炸', !canBeat(bomb, heaven, '2'));
  ok('级牌比较：H5(级) > SA', compareCards(strToCards('H5')[0], strToCards('SA')[0], '5') === 1);
  ok('2 最小：S2 < S3', compareCards(strToCards('S2')[0], strToCards('S3')[0], 'K') === -1);
}

console.log('== 整局模拟（4 机器人，直到通关/超轮）==');
{
  const g = new GuandanGame(20260815);
  for (let i = 0; i < 4; i++) g.setPlayer(i, { name: `Bot${i}`, isHuman: false });
  let rounds = 0;
  let guard = 0;
  try {
    while (!g.episodeEnd && guard < 200000) {
      g.startRound();
      rounds++;
      let steps = 0;
      while (!g.roundEnd && steps < 2000) {
        const pid = g.playerWaiting;
        const action = chooseAction(g, pid);
        const res = g.play(pid, action);
        if (!res.ok) throw new Error(`第${rounds}局 步骤${steps}: ${res.error}`);
        steps++;
      }
      ok(`第${rounds}局完成，头游 ${g.winOrder[0]}，级牌 ${g.curRank}${g.episodeEnd ? '（通关）' : ''}`, true);
      guard += steps;
    }
    ok('整局（多轮升级至过A）无异常结束', g.episodeEnd || rounds >= 3);
    console.log(`  共 ${rounds} 局，累计 ${guard} 步，最终级牌 ${g.curRank}，通关=${g.episodeEnd}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ 模拟异常: ${e.message}`);
  }
}

console.log('== 出牌输入解析（纯点数/牌面）==');
{
  const p1 = rankProfileOf('334455');
  ok('334455 → 3/4/5 各两张', p1 && p1['3'] === 2 && p1['4'] === 2 && p1['5'] === 2);
  const p2 = rankProfileOf('33 44 55');
  ok('33 44 55 → 与 334455 等价', JSON.stringify(p2) === JSON.stringify(p1));
  const p3 = rankProfileOf('10JQKA');
  ok('10JQKA → T/J/Q/K/A 各一张', p3 && p3.T === 1 && p3.J === 1 && p3.A === 1 && p3.K === 1);
  const p4 = rankProfileOf('AA2233');
  ok('AA2233 → A/2/3 各两张', p4 && p4.A === 2 && p4['2'] === 2 && p4['3'] === 2);
  ok('裸 1 无法解析', rankProfileOf('1234') === null);
  ok('含王无法用点数解析匹配', !rankProfileEq(cardsToVector(strToCards('SB HR')), rankProfileOf('SB HR') ?? { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, T: 0, J: 0, Q: 0, K: 0, A: 0 }));
  // 具体牌面
  const v = tryParseCards('H2 H2 S2');
  ok('H2 H2 S2 → 向量 {2 三张}', v && v[0] === 2 && v[13] === 1);
  const v2 = tryParseCards('小王 大王');
  ok('小王 大王 → 王向量', v2 && v2[52] === 1 && v2[53] === 1);
  // 纯点数输入与合法动作匹配（连对 334455）
  const g2 = new GuandanGame(7);
  const handV = cardsToVector(strToCards('S3 H3 S4 H4 S5 H5 S7 H7 C9 D9'));
  g2.players[0].cards = handV;
  const actsL = g2.legalActionsFor(0);
  const hit = actsL.find((a) => rankProfileEq(a.cards, rankProfileOf('334455')));
  ok('纯点数 334455 能命中合法连对', !!hit && hit.type === 11);
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
