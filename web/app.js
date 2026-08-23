// app.js — 掼蛋-中联储卫 独立版（V3.0.1：单人 + 联机房间双模式）
// 联机：建房/加入 → 大厅(座位身份) → 房间牌桌(服务器权威回合/真人60秒/机器人20秒)
// 支持 4 真人通过公网 URL 联机：房主建房得房间码 → 朋友输码选座加入 → 满4人开局
'use strict';

// API 前缀：独立服务器默认 /api；作为插件 iframe 托管时用 ?api=/guandan/api 覆盖
const API_BASE = (() => { try { const p = new URLSearchParams(location.search).get('api'); return p || '/api'; } catch (e) { return '/api'; } })();

// ================= 持久化 =================
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
const URL_SESSION = (() => { try { return new URLSearchParams(location.search).get('session') || null; } catch (e) { return null; } })();
const pkey = URL_SESSION || (LS('gd_pkey') || (crypto.randomUUID ? crypto.randomUUID() : 'p-' + Date.now() + Math.random().toString(36).slice(2, 8)));
if (!URL_SESSION) LS('gd_pkey', pkey);
// ================= 常量/工具 =================
const TURN_SECONDS = 60; // 真人回合：60 秒
const BOT_DELAY = 5000; // 机器人回合：5 秒节奏（到点必须出/自动过）
const AVATARS = ['🦁', '🐯', '🦊', '🐼'];
const SEAT_DIR = { 0: '⬇ 南', 1: '➡ 东', 2: '⬆ 北', 3: '⬅ 西' };
const SUIT = { H: '♥', S: '♠', C: '♣', D: '♦' };
const RANK_ORDER = '23456789TJQKA';

function cardParts(c) {
  if (c === 'SB') return { rank: '小', suit: '王' };
  if (c === 'HR') return { rank: '大', suit: '王' };
  return { rank: c.slice(1) === 'T' ? '10' : c.slice(1), suit: SUIT[c[0]] };
}
function cardLabel(c) { const p = cardParts(c); return p.suit === '王' ? p.rank + '王' : p.suit + p.rank; }
function rankValue(c) { if (c === 'SB') return 14; if (c === 'HR') return 15; return RANK_ORDER.indexOf(c.slice(1)) + 1; }
function colorClass(c) { if (c === 'HR') return 'gd-joker-big'; if (c === 'SB') return 'gd-joker-small'; return (c[0] === 'H' || c[0] === 'D') ? 'gd-red' : 'gd-black'; }
function commaList(s) { return typeof s === 'string' ? s.split(',') : []; }
function prettyNote(n) { return String(n).replace(/HR/g, '大王').replace(/SB/g, '小王').replace(/([HSDC])([2-9TJQKA])/g, (_, s, r) => SUIT[s] + (r === 'T' ? '10' : r)); }
function isLead(g) { return !!(g && g.lastMax === null); } // 领出/牌权：本墩无人出牌，必须出牌、不限时
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ================= 音效 =================
let actx = null;
function ac() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
  return actx;
}
function tone(freq, dur, type, vol, delay) {
  const ctx = ac(); if (!ctx) return;
  try {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(vol || 0.13, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
function sound(type) {
  try {
    const freq = { click: 880, play: 523, pass: 330, win: 659, end: 440 }[type] || 600;
    if (type === 'pass') {
      // "过"：下滑音
      const ctx = ac(); if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      const t0 = ctx.currentTime;
      o.frequency.setValueAtTime(520, t0);
      o.frequency.exponentialRampToValueAtTime(200, t0 + 0.22);
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      o.start(t0); o.stop(t0 + 0.3);
      return;
    }
    tone(freq, 0.18, 'sine', 0.13);
  } catch (e) {}
}
// —— 牌型提示音 ——
const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99]; // C5 D5 E5 F5 G5
/** 真人发音（浏览器 TTS 中文语音）：喊"炸弹"/"同花顺"，可用则发音，不可用静默（轰炸声兜底）
 *  delaySec 可选：延迟发音（秒），用于"先轰炸声效、后发音"的节奏 */
function speakChinese(text, delaySec) {
  try {
    if (!window.speechSynthesis) return;
    const say = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.85;
      u.pitch = 1.1;
      u.volume = 1;
      // 尽量选中文语音
      const voices = window.speechSynthesis.getVoices();
      const zh = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
      if (zh) u.voice = zh;
      window.speechSynthesis.speak(u);
    };
    if (delaySec) setTimeout(say, delaySec * 1000);
    else say();
  } catch (e) {}
}
// 预热 TTS（部分浏览器需先触发一次）
try { if (window.speechSynthesis) { window.speechSynthesis.getVoices(); } } catch (e) {}
function playTypeSound(typeNameStr) {
  if (!typeNameStr) return;
  const t = String(typeNameStr);
  if (t.includes('天王炸')) {
    // 天王炸：4 王，最强——三次大轰炸（比炸弹更响更长，先轰后发音）
    bombSoundAt(0, 1.3); bombSoundAt(0.45, 1.3); bombSoundAt(0.9, 1.3);
    speakChinese('天王炸', 1.2);
    return;
  }
  if (t.includes('炸弹')) {
    // 炸弹：先轰一声（大声），轰完再真人发音"炸弹"
    bombSoundAt(0, 1.0);
    speakChinese('炸弹', 0.55);
    return;
  }
  if (t === '顺子') { SCALE.forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, i * 0.09)); return; }
  if (t === '连对') { [659.25, 523.25, 659.25, 523.25, 659.25, 523.25].forEach((f, i) => tone(f, 0.12, 'square', 0.08, i * 0.08)); return; } // 姊妹对：双音交替
  if (t === '钢板') { [196, 196, 196, 261.63, 261.63, 261.63].forEach((f, i) => tone(f, 0.16, 'sawtooth', 0.1, i * 0.07)); return; } // 低音重锤
  if (t === '同花顺') {
    // 同花顺：先连续 3 声轰炸（更响更密），轰完再发音"同花顺"
    bombSoundAt(0, 1.0); bombSoundAt(0.3, 1.0); bombSoundAt(0.6, 1.0);
    speakChinese('同花顺', 0.9);
    return;
  }
}
// —— 炸弹：噪声 + 低频爆震 "砰"（单声轰炸，音量可调） ——
function bombSound() { bombSoundAt(0, 1.0); }
/** 在指定延迟（秒）后发出一声轰炸；vol 为音量（默认 1.0 满音量） */
function bombSoundAt(delaySec, vol) {
  const ctx = ac(); if (!ctx) return;
  const v = vol || 1.0;
  try {
    const t0 = ctx.currentTime + (delaySec || 0);
    // 噪声段
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95 * v, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(t0);
    // 低频爆震（更响）
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.45);
    og.gain.setValueAtTime(0.95 * v, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    o.connect(og); og.connect(ctx.destination);
    o.start(t0); o.stop(t0 + 0.55);
  } catch (e) {}
}
// —— 背景音乐（真实 MP3 播放，用户把音频文件放入 web/bgm 目录） ——
let bgmState = { on: false, track: 0, audio: null, files: [] };
async function loadBgmFiles() {
  try {
    const r = await fetch(API_BASE + '/bgm');
    const d = await r.json();
    if (d && d.ok && Array.isArray(d.value.files)) bgmState.files = d.value.files;
  } catch (e) {}
}
function startBgm() {
  const s = bgmState;
  stopBgmAudio();
  if (!s.files.length) { s.on = false; return; }
  const f = s.files[s.track % s.files.length];
  try {
    const a = new Audio(f.url);
    a.loop = true;
    a.volume = 0.45; // 音量小
    // 播放失败（浏览器自动播放策略拦截等）→ 不静默：置为关闭，UI 显示"音乐：关"提示点击启用
    a.play().catch(() => { s.on = false; });
    s.audio = a;
    s.on = true;
  } catch (e) { s.on = false; }
}
function stopBgmAudio() {
  const s = bgmState;
  if (s.audio) { try { s.audio.pause(); } catch (e) {} s.audio = null; }
}
function stopBgm() { stopBgmAudio(); bgmState.on = false; }
function toggleBgm() {
  const s = bgmState;
  if (!s.files.length) loadBgmFiles().then(() => { if (s.files.length) { startBgm(); LS('gd_bgm', String(s.on ? s.track : -1)); } });
  if (s.on) {
    // 点击 = 关闭音乐（用户需求：能关掉不想听的音乐；关闭不影响打牌音效）
    stopBgm();
  } else {
    startBgm();
  }
  LS('gd_bgm', String(s.on ? s.track : -1));
}
/** 切下一首（音乐开着时点 ⏭ 按钮）；关闭状态点击 = 打开并从下一首开始 */
function nextBgm() {
  const s = bgmState;
  if (!s.files.length) { loadBgmFiles().then(() => { if (s.files.length) { nextBgm(); } }); return; }
  if (s.track < s.files.length - 1) s.track += 1; else s.track = 0;
  if (s.on) {
    // 复用同一 audio 元素改 src，保留用户手势授权（避免新建 Audio 被自动播放策略拦截）
    const f = s.files[s.track % s.files.length];
    try {
      if (s.audio) { s.audio.src = f.url; s.audio.play().catch(() => { s.on = false; }); }
      else startBgm();
    } catch (e) { s.on = false; }
  } else {
    startBgm();
  }
  LS('gd_bgm', String(s.on ? s.track : -1));
}
function bgmLabel() {
  const s = bgmState;
  if (!s.files.length) return '🎵 音乐：无';
  if (!s.on) return '🎵 音乐：关';
  const n = s.files[s.track % s.files.length].name.replace(/\.[^.]+$/, '');
  return '🎵 ' + n.slice(0, 6) + (n.length > 6 ? '…' : '');
}
loadBgmFiles();
// 初始化 BGM（记住上次选择）
try { const b = Number(LS('gd_bgm')); if (b >= 0) { bgmState.track = b; bgmState.on = false; } } catch (e) {}

// ================= 状态 =================
const state = {
  screen: 'mode', // mode | solo | join | lobby | room
  game: null, notes: [], busy: false, error: null, selected: {}, cardH: 68, countdown: 0,
  room: null, viewerSeat: -1, quitted: false, driving: false, pollTimer: null,
  groups: [], // 组牌：[{cards:[牌名...], type:牌型名}]，仅影响查看排序，不影响出牌
};
// 牌高固定 68px（27 张 4 行一眼全见，不缩放、不重叠），不再从 localStorage 覆盖
const CARD_SIZES = [52, 64, 80, 100];
const SIZE_LABELS = ['小', '中', '大', '特大'];
const boardEl = document.getElementById('board');

function selectedCount() { let n = 0; for (const k in state.selected) n += state.selected[k]; return n; }
function selectedCards() { const out = []; for (const k in state.selected) for (let i = 0; i < state.selected[k]; i++) out.push(k); return out; }

// ================= 组牌 / 解组（仅调整手牌查看位置，不影响出牌） =================
// 原理：选中牌 → 用与出牌完全相同的引擎判定（/api/group 复用 legalActions）
//       → 能组成的合法牌型排在一起；组错/出牌由玩家自行点选，系统只做位置调换
/** 组牌：把选中的牌（若能组成合法牌型）自动排在一起，方便查看 */
async function tryGroupSelected() {
  const g = state.game;
  if (!g) return;
  const picked = selectedCards();
  if (picked.length < 2) return;
  try {
    const v = await callApi('group', { method: 'POST', body: { cards: picked, level: String(g.level || '2') } });
    if (!v || !v.groups || !v.groups.length) return;
    // 取第一个（服务端已按张数从多到少、复合牌型优先排序）
    const grp = v.groups[0];
    if (!grp || !grp.cards || grp.cards.length < 2) return;
    state.groups = state.groups.concat([{ cards: grp.cards.slice(), type: grp.type || '' }]);
    state.selected = {}; // 组完清空选中（不影响出牌：出牌仍按点选）
    render();
  } catch (e) { /* 组牌失败不打断 */ }
}
/** 解组：清空全部组，恢复自然散牌排序 */
function ungroupAll() {
  if (!state.groups.length) return;
  state.groups = [];
  state.selected = {};
  render();
}
/** 手牌视图：组内牌 + 散牌。
 *  组内只显示手牌中仍存在的牌——打出的牌从组中消失（整组打完则整组消失）；
 *  新开一局后旧组牌不在新手牌中 → 自动清空（人工重新组牌）；
 *  每组独占一行，散牌另起行（不混进组行）。 */
function handView(cards) {
  // 手牌计数（牌名→剩余实例数）
  const remain = {};
  for (const c of cards) remain[c] = (remain[c] || 0) + 1;
  if (!state.groups.length) {
    return { groups: [], loose: cards.slice().sort((a, b) => rankValue(b) - rankValue(a)) };
  }
  // 组内保留的牌（牌名→实例数），散牌收集时排除这些
  const keptInGroups = {};
  const grouped = [];
  const survivingGroups = []; // 保留仍有牌的组，同步回 state.groups
  for (const grp of state.groups) {
    const kept = [];
    const wanted = grp.cards.slice().sort((a, b) => rankValue(a) - rankValue(b));
    for (const c of wanted) {
      if ((remain[c] || 0) > 0) {
        remain[c] -= 1;
        kept.push(c);
        keptInGroups[c] = (keptInGroups[c] || 0) + 1;
      }
    }
    if (kept.length) {
      grouped.push({ type: grp.type || '', cards: kept });
      survivingGroups.push({ type: grp.type || '', cards: kept });
    }
    // kept 为空 = 该组牌已全部打出/不在手牌（含新开局）→ 从 state.groups 移除
  }
  // 同步：移除已无效的组（新开局旧组清空，出牌打完的组清空）
  if (survivingGroups.length !== state.groups.length) {
    state.groups = survivingGroups;
  }
  const loose = [];
  for (const c of cards) {
    if ((keptInGroups[c] || 0) > 0) { keptInGroups[c] -= 1; }
    else loose.push(c);
  }
  loose.sort((a, b) => rankValue(b) - rankValue(a));
  return { groups: grouped, loose };
}

// ================= API =================
async function callApi(path, opts) {
  const init = { method: (opts && opts.method) || 'GET', headers: { 'content-type': 'application/json' } };
  if (opts && opts.body) init.body = JSON.stringify(opts.body);
  const res = await fetch(API_BASE + '/' + path, init);
  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) throw new Error((data && data.error && data.error.message) || '请求失败');
  return data.value;
}

// ================= DOM =================
function el(tag, cls, text, onClick) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (onClick) e.addEventListener('click', (ev) => { ev.preventDefault(); sound('click'); onClick(ev); });
  return e;
}
function miniCard(c, wild) {
  const p = cardParts(c);
  const card = el('span', 'gd-mini ' + colorClass(c) + (c === wild ? ' gd-wild' : ''));
  card.appendChild(el('span', 'gd-mini-rank', p.rank));
  card.appendChild(el('span', 'gd-mini-suit', p.suit));
  return card;
}

// —— 音效触发：对比 history 新增条目（炸弹/牌型/过牌音） ——
let lastHistoryKey = null;
function checkHistoryPlays(history, mySeat) {
  if (!history || !history.length) { lastHistoryKey = null; return; }
  const last = history[history.length - 1];
  const key = history.length + ':' + last.player + ':' + (last.type || (last.pass ? 'pass' : ''));
  if (lastHistoryKey === null) { lastHistoryKey = key; return; } // 首次加载不播历史
  if (key === lastHistoryKey) return;
  lastHistoryKey = key;
  if (last.pass) { if (last.player === mySeat) sound('pass'); return; }
  playTypeSound(last.type);
}

// ================= 单人模式（保留） =================
let soloTimer = null;
function clearSoloTimer() { if (soloTimer) { clearInterval(soloTimer); soloTimer = null; } }

async function soloRefresh() {
  if (state.quitted) return;
  try { state.game = await callApi('state?session=' + encodeURIComponent(pkey)); state.error = null; }
  catch (e) { state.error = String((e && e.message) || e); }
  soloAfterUpdate();
}
async function soloRun(fn) {
  if (state.busy) return;
  state.busy = true; state.error = null;
  try {
    const v = await fn();
    if (v && v.state) { state.game = v.state; state.notes = (v.notes || []).map(prettyNote); }
    state.selected = {};
  } catch (e) {
    state.error = String((e && e.message) || e);
    // 失败后强制重拉最新状态（避免界面与服务端不一致导致僵死）
    try { state.game = await callApi('state?session=' + encodeURIComponent(pkey)); state.selected = {}; }
    catch (e2) {}
  }
  state.busy = false;
  soloAfterUpdate();
}
function soloAfterUpdate() {
  clearSoloTimer();
  if (state.quitted) { render(); return; }
  const g = state.game;
  if (!g) { render(); return; }
  // 新开局（局号变化）→ 清空上一轮的组牌
  if (state.lastRound !== undefined && g.round !== state.lastRound) {
    state.groups = [];
    state.selected = {};
  }
  state.lastRound = g.round;
  checkHistoryPlays(g.history, g.humanSeat); // 牌型/炸弹/过牌音
  if (g.roundEnd && !g.episodeEnd) sound('win');
  if (g.episodeEnd) sound('end');
  const humanTurn = !!(g && !g.roundEnd && !g.episodeEnd && g.playerWaiting === g.humanSeat);
  if (humanTurn && !isLead(g)) {
    state.countdown = TURN_SECONDS;
    soloTimer = setInterval(() => {
      state.countdown -= 1;
      if (state.countdown <= 0) { clearSoloTimer(); soloAutoPass(); return; }
      renderTimer();
    }, 1000);
  }
  render();
  if (!g.roundEnd && !g.episodeEnd && !g.waitingIsHuman) soloDriveBots();
}
function renderTimer() { const e2 = document.getElementById('gd-timer'); if (e2) e2.textContent = '⏱ ' + state.countdown; }
async function soloAutoPass() { sound('pass'); speakChinese('自动过'); await soloRun(() => callApi('play?session=' + encodeURIComponent(pkey), { method: 'POST', body: { pass: true, auto: true } })); }
async function soloDriveBots() {
  if (state.driving) return;
  state.driving = true;
  try {
    while (state.game && !state.game.roundEnd && !state.game.episodeEnd && !state.game.waitingIsHuman) {
      await sleep(BOT_DELAY);
      const v = await callApi('step?session=' + encodeURIComponent(pkey), { method: 'POST', body: {} });
      state.game = v.state;
      state.notes = (v.notes || []).map(prettyNote);
      render();
    }
  } catch (e) { state.error = String((e && e.message) || e); render(); }
  state.driving = false;
  soloAfterUpdate();
}
function soloToggle(card) {
  const g = state.game;
  const me = g && g.hands ? g.hands.find((x) => x.isHuman) : null;
  const total = (me && me.cards) ? me.cards.filter((c) => c === card).length : 0;
  if (total === 0) return;
  const cur = state.selected[card] || 0;
  if (cur >= total) delete state.selected[card]; else state.selected[card] = cur + 1;
  render();
}

// ================= 联机模式 =================
function stopPoll() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }
function startPoll() {
  stopPoll();
  state.pollTimer = setInterval(async () => {
    try {
      const r = await callApi('room/' + state.room.code + '/state?player=' + encodeURIComponent(pkey));
      applyRoomState(r);
    } catch (e) { /* 轮询失败忽略 */ }
  }, 1000);
}
function applyRoomState(r) {
  state.room = r;
  state.viewerSeat = r.viewerSeat;
  if (r.game) {
    // 新开局（局号变化）→ 清空上一轮的组牌
    if (state.lastRound !== undefined && r.game.round !== state.lastRound) {
      state.groups = [];
      state.selected = {};
    }
    state.lastRound = r.game.round;
    state.game = r.game; checkHistoryPlays(r.game.history, r.viewerSeat);
  } else state.game = null;
  state.error = null;
  if (state.screen !== 'room' && r.started && r.game) state.screen = 'room';
  render();
}
async function roomPlay(cards, pass) {
  if (!state.room) return;
  try {
    await callApi('room/' + state.room.code + '/play', { method: 'POST', body: { player: pkey, cards: cards, pass: !!pass } });
    state.selected = {}; // 出牌/过牌成功后清空选中（避免残留累计）
    const r = await callApi('room/' + state.room.code + '/state?player=' + encodeURIComponent(pkey));
    applyRoomState(r);
  } catch (e) { state.error = String((e && e.message) || e); state.selected = {}; render(); }
}
function roomToggle(card) {
  const me = state.game && state.game.hands ? state.game.hands.find((h) => h.id === state.viewerSeat) : null;
  const total = (me && me.cards) ? me.cards.filter((c) => c === card).length : 0;
  if (total === 0) return;
  const cur = state.selected[card] || 0;
  if (cur >= total) delete state.selected[card]; else state.selected[card] = cur + 1;
  render();
}

// ================= 渲染 =================
function seatInfoEl(avatar, name, extra, active, twoLine) {
  const d = el('div', 'gd-seat-info' + (extra ? ' ' + extra : ''));
  d.appendChild(el('span', 'gd-avatar' + (active ? ' gd-avatar-active' : ''), avatar));
  if (twoLine) {
    // 东西座位：方位一行 + 名字/张数一行（无分隔点）
    const blk = el('div', 'gd-seat-name-block');
    blk.appendChild(el('span', 'gd-seat-name', name));
    d.appendChild(blk);
  } else {
    d.appendChild(el('span', 'gd-seat-name', name));
  }
  if (active) d.appendChild(el('span', 'gd-turn-badge', '出牌中'));
  return d;
}

function render() {
  boardEl.innerHTML = '';
  const isBet = state.screen === 'solo' || state.screen === 'room';
  boardEl.classList.toggle('gd-bet', isBet);
  boardEl.style.setProperty('--gd-card-h', state.cardH + 'px');
  const bar = el('div', 'gd-bar');
  bar.appendChild(el('span', 'gd-title', '🃏 掼蛋-中联储卫'));
  bar.appendChild(el('button', 'gd-btn', bgmLabel(), () => { toggleBgm(); render(); }));
  if (bgmState.on) bar.appendChild(el('button', 'gd-btn', '⏭', () => { nextBgm(); render(); }));
  bar.appendChild(el('button', 'gd-btn', '模式', () => { stopPoll(); clearSoloTimer(); state.screen = 'mode'; state.room = null; state.game = null; state.quitted = false; render(); }));
  boardEl.appendChild(bar);

  if (state.screen === 'mode') return renderMode();
  if (state.screen === 'join') return renderJoin();
  if (state.screen === 'lobby') return renderLobby();
  if (state.screen === 'solo') return renderSoloBoard(bar);
  if (state.screen === 'room') return renderRoomBoard(bar);
}

// 动态牌高已移除：牌固定 68px，27 张 4 行一眼全见（无缩放、无重叠）

// —— 模式选择 ——
function renderMode() {
  const box = el('div', 'gd-lobby');
  box.appendChild(el('div', 'gd-lobby-title', '选择模式'));
  box.appendChild(el('button', 'gd-btn gd-big gd-primary', '🎮 单人模式（打机器人）', () => { state.screen = 'solo'; soloRefresh(); }));
  box.appendChild(el('button', 'gd-btn gd-big', '👥 联机对战（对家真人）', () => { state.screen = 'join'; render(); }));
  boardEl.appendChild(box);
}

// —— 加入界面 ——
function renderJoin() {
  const box = el('div', 'gd-lobby');
  box.appendChild(el('div', 'gd-lobby-title', '联机对战'));
  box.appendChild(el('label', 'gd-label', '昵称'));
  const nameInput = el('input', 'gd-input');
  nameInput.value = LS('gd_name') || '';
  box.appendChild(nameInput);
  box.appendChild(el('div', 'gd-label', '头像'));
  const avRow = el('div', 'gd-avrow');
  let picked = LS('gd_avatar') || AVATARS[0];
  AVATARS.forEach((a) => {
    const b = el('button', 'gd-av' + (a === picked ? ' gd-av-sel' : ''), a, () => {
      picked = a;
      avRow.querySelectorAll('.gd-av').forEach((x) => x.classList.remove('gd-av-sel'));
      b.classList.add('gd-av-sel');
    });
    avRow.appendChild(b);
  });
  box.appendChild(avRow);
  box.appendChild(el('div', 'gd-label', '房间码（加入时填写）'));
  const codeInput = el('input', 'gd-input');
  codeInput.placeholder = '例如 8Z56';
  box.appendChild(codeInput);
  box.appendChild(el('div', 'gd-label', '座位（加入时选择，默认自动）'));
  const seatRow = el('div', 'gd-seatrow');
  let pickedSeat = undefined;
  const seatDefs = [
    { s: undefined, label: '自动' },
    { s: 0, label: '⬇ 南' },
    { s: 1, label: '➡ 东' },
    { s: 2, label: '⬆ 北（对家·推荐）' },
    { s: 3, label: '⬅ 西' },
  ];
  seatDefs.forEach((d) => {
    const b = el('button', 'gd-seatbtn' + (d.s === pickedSeat ? ' gd-seatbtn-sel' : ''), d.label, () => {
      pickedSeat = d.s;
      seatRow.querySelectorAll('.gd-seatbtn').forEach((x) => x.classList.remove('gd-seatbtn-sel'));
      b.classList.add('gd-seatbtn-sel');
    });
    seatRow.appendChild(b);
  });
  box.appendChild(seatRow);
  const err = el('div', 'gd-error');
  box.appendChild(err);
  const doJoin = async (seat) => {
    const name = (nameInput.value || '').trim() || '玩家';
    LS('gd_name', name); LS('gd_avatar', picked);
    try {
      let r;
      if (seat === undefined) {
        const code = (codeInput.value || '').trim().toUpperCase();
        if (!code) { err.textContent = '请输入房间码或点「创建房间」'; return; }
        r = await callApi('room/' + code + '/join', { method: 'POST', body: { player: pkey, name: name, avatar: picked, seat: pickedSeat } });
      } else {
        r = await callApi('room', { method: 'POST', body: { player: pkey, name: name, avatar: picked } });
      }
      if (!r.ok) { err.textContent = r.error; return; }
      state.room = { code: r.code, started: false };
      state.viewerSeat = r.seat;
      state.screen = 'lobby';
      const rs = await callApi('room/' + r.code + '/state?player=' + encodeURIComponent(pkey));
      applyRoomState(rs);
      startPoll();
    } catch (e) { err.textContent = String((e && e.message) || e); }
  };
  box.appendChild(el('button', 'gd-btn gd-big gd-primary', '创建房间（我是房主）', () => doJoin(0)));
  box.appendChild(el('button', 'gd-btn gd-big', '加入房间', () => doJoin(undefined)));
  boardEl.appendChild(box);
}

// —— 房间大厅 ——
function renderLobby() {
  const room = state.room || {};
  const box = el('div', 'gd-lobby');
  box.appendChild(el('div', 'gd-lobby-title', '房间大厅'));
  box.appendChild(el('div', 'gd-room-code', '房间码：' + (room.code || '—')));
  box.appendChild(el('div', 'gd-hint', '把房间码告诉对家/朋友，手机打开本页点「联机对战」加入'));
  const seatBox = el('div', 'gd-seats-grid');
  for (let s = 0; s < 4; s++) {
    const seatData = room.seats ? room.seats[s] : null;
    const seat = el('div', 'gd-seat gd-seat-mini');
    const who = seatData ? (seatData.isHuman ? seatData.name : '🤖 ' + seatData.name) : '空位';
    seat.appendChild(el('div', 'gd-seat-mini-title', SEAT_DIR[s] + (s === 2 ? '（对家）' : '')));
    seat.appendChild(el('div', 'gd-seat-mini-who', (seatData ? seatData.avatar : '⬜') + ' ' + who));
    seatBox.appendChild(seat);
  }
  box.appendChild(seatBox);
  box.appendChild(el('div', 'gd-hint', '已有 ' + (room.seats ? room.seats.filter((x) => x.isHuman).length : 1) + ' 位真人，点开局开始（机器人自动补位）'));
  box.appendChild(el('button', 'gd-btn gd-big gd-primary', '▶ 开始游戏', async () => {
    try {
      const r = await callApi('room/' + room.code + '/start', { method: 'POST', body: {} });
      if (!r.ok) { state.error = r.error; render(); return; }
      const rs = await callApi('room/' + room.code + '/state?player=' + encodeURIComponent(pkey));
      applyRoomState(rs);
    } catch (e) { state.error = String((e && e.message) || e); render(); }
  }));
  if (state.error) box.appendChild(el('div', 'gd-error', '⚠ ' + state.error));
  boardEl.appendChild(box);
}

// —— 座位数据（solo / room 通用）——
function seatData(g, viewerSeat) {
  const inRoom = state.screen === 'room';
  const seats = [];
  for (let s = 0; s < 4; s++) {
    const h = g.hands[s];
    let name = h.name, avatar = AVATARS[s], isHuman = h.isHuman;
    if (inRoom && state.room && state.room.seats) {
      const rs = state.room.seats[s];
      if (rs) { name = rs.name; avatar = rs.avatar; isHuman = rs.isHuman; }
    }
    seats.push({ seat: s, name, avatar, isHuman, count: h.count, isMe: s === viewerSeat });
  }
  return seats;
}

// —— 单人牌桌 ——
function renderSoloBoard(bar) {
  const g = state.game;
  bar.appendChild(el('span', 'gd-level', g ? '级牌 ' + g.level + ' · 逢人配=红桃' + g.level : ''));
  bar.appendChild(el('button', 'gd-btn', '开局', () => { state.quitted = false; soloRun(() => callApi('new?session=' + encodeURIComponent(pkey), { method: 'POST', body: {} })); }));
  bar.appendChild(el('button', 'gd-btn', '刷新', soloRefresh));
  boardEl.appendChild(bar);
  if (state.quitted) {
    const exit = el('div', 'gd-exit');
    exit.appendChild(el('div', 'gd-exit-title', '🃏 已退出牌局'));
    exit.appendChild(el('div', 'gd-exit-sub', '点「开局」重新开始，或回「模式」选择联机。'));
    boardEl.appendChild(exit);
    return;
  }
  if (!g) { boardEl.appendChild(el('div', 'gd-empty', '正在加载牌局…')); return; }
  renderBoard(g, 0, g.humanSeat, g.playerWaiting, state.countdown, null);
}

// —— 房间牌桌 ——
function renderRoomBoard(bar) {
  const room = state.room || {};
  const g = state.game;
  bar.appendChild(el('span', 'gd-room-code-mini', '房 ' + (room.code || '')));
  bar.appendChild(el('span', 'gd-level', g ? '级牌 ' + g.level : ''));
  boardEl.appendChild(bar);
  if (!g) {
    const box = el('div', 'gd-lobby');
    box.appendChild(el('div', 'gd-lobby-title', '等待房主开局…'));
    box.appendChild(el('button', 'gd-btn gd-big gd-primary', '▶ 开始游戏', async () => {
      try {
        const r = await callApi('room/' + room.code + '/start', { method: 'POST', body: {} });
        if (r.ok) { const rs = await callApi('room/' + room.code + '/state?player=' + encodeURIComponent(pkey)); applyRoomState(rs); }
        else { state.error = r.error; render(); }
      } catch (e) { state.error = String((e && e.message) || e); render(); }
    }));
    if (state.error) box.appendChild(el('div', 'gd-error', '⚠ ' + state.error));
    boardEl.appendChild(box);
    return;
  }
  const myTurn = g.playerWaiting === state.viewerSeat;
  renderBoard(g, state.viewerSeat, state.viewerSeat, g.playerWaiting, myTurn ? (room.countdown != null ? room.countdown : state.countdown) : null, room.seats);
}

// —— 牌桌主体（solo/room 共用）——
function renderBoard(g, viewerSeat, humanSeat, turnSeat, countdown, roomSeats) {
  const inRoom = state.screen === 'room';
  const seats = [];
  for (let s = 0; s < 4; s++) {
    const h = g.hands[s];
    let name = h.name, avatar = AVATARS[s];
    if (inRoom && roomSeats && roomSeats[s]) { name = roomSeats[s].name; avatar = roomSeats[s].avatar; }
    seats.push({ seat: s, name, avatar, count: h.count, isMe: s === viewerSeat, revealed: !!h.revealed, revealCards: h.revealed ? commaList(h.cards) : [] });
  }
  // 视角旋转：观看者永远在正下方（南），对家在正上方；
  // 右手边=下家(+1)，左手边=上家(+3)。单人模式 viewerSeat=0 时与传统布局一致。
  const v = (viewerSeat >= 0 && viewerSeat <= 3) ? viewerSeat : 0;
  const seatN = (v + 2) % 4, seatE = (v + 1) % 4, seatW = (v + 3) % 4;
  const trickOf = (id) => { const arr = g.trick || []; for (let i = arr.length - 1; i >= 0; i--) if (arr[i].player === id) return arr[i]; return null; };
  const partner = seatN;
  const humanTurn = !!(g && !g.roundEnd && !g.episodeEnd && turnSeat === viewerSeat);
  const firstLead = isLead(g);
  const wild = 'H' + g.level;
  // 局结束排名：winOrderSeats = 出完顺序的座位 id（0 号=第1名）
  const rankOf = {};
  if (g && (g.roundEnd || g.episodeEnd) && Array.isArray(g.winOrderSeats)) {
    g.winOrderSeats.forEach((seatId, i) => { rankOf[seatId] = i + 1; });
  }
  // 已走完的座位集合（winOrderSeats 中的，无论局是否结束）
  const finishedSet = new Set();
  if (g && Array.isArray(g.winOrderSeats)) {
    g.winOrderSeats.forEach((seatId) => finishedSet.add(seatId));
  }
  const RANK_MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];

  function seatCard(s, labelExtra, infoCls) {
    const d = el('div', 'gd-seat ' + labelExtra);
    const t = trickOf(s);
    const active = turnSeat === s;
    const meMark = s === v ? '（我）' : '';
    const partnerMark = s === partner ? '（对家）' : '';
    const hasPlay = !!t;
    const isSide = s === seatE || s === seatW;
    // 信息行：东西竖排两行(方位/名字+张数)；南北开局一行居中、出牌两行
    const info = el('div', 'gd-seat-info' + (infoCls ? ' ' + infoCls : '') + (isSide || hasPlay ? ' gd-seat-info-play' : ' gd-seat-info-idle'));
    info.appendChild(el('span', 'gd-avatar' + (active ? ' gd-avatar-active' : ''), seats[s].avatar));
    const blk = el('div', 'gd-seat-name-block');
    if (isSide || hasPlay) {
      // 东西/出牌时两行：方位 | 名字+张数（靠左，窄空间不截断）
      blk.appendChild(el('span', 'gd-seat-dir', SEAT_DIR[s] + (partnerMark || '')));
      blk.appendChild(el('span', 'gd-seat-name', (seats[s].name === '玩家' ? '' : seats[s].name) + meMark + ' ' + seats[s].count + '张'));
    } else {
      // 开局时一行居中（不折行）：方位 名字 张数
      blk.appendChild(el('span', 'gd-seat-dir', SEAT_DIR[s] + ' ' + (seats[s].name === '玩家' ? '' : seats[s].name) + meMark + ' ' + seats[s].count + '张'));
    }
    info.appendChild(blk);
    if (active) info.appendChild(el('span', 'gd-turn-badge', '出牌中'));
    // 局结束排名徽标（按出完顺序 1/2/3/4，显示在座位卡右上）
    if (rankOf[s]) info.appendChild(el('span', 'gd-rank-badge gd-rank-' + rankOf[s], RANK_MEDAL[rankOf[s] - 1] + ' ' + rankOf[s]));
    d.appendChild(info);
    // 出牌区：只在有出牌时显示（无牌时高度0，手牌全见；出牌才加高展示）
    const roundOver = !!(g && (g.roundEnd || g.episodeEnd));
    if (t && !roundOver) {
      const plays = el('div', 'gd-plays');
      if (t.pass) plays.appendChild(el('span', 'gd-pass-mark', t.auto ? '自动过' : '过'));
      else {
        const cards = commaList(t.cards); // 全部牌（4-6 张全显示，不截断）
        // 行分布：南北（宽座，非 side）单行平铺——上方/下方高度不足，两行会被遮挡；
        // 东西（窄座 side）受控 2 行：≤3 张全放第一行；≥4 张 第一行 n-2、第二行固定 2 张（4→2+2 / 5→3+2 / 6→4+2）
        const rows = [];
        if (!isSide || cards.length <= 3) rows.push(cards);
        else { rows.push(cards.slice(0, cards.length - 2)); rows.push(cards.slice(cards.length - 2)); }
        rows.forEach((rowCards, ri) => {
          const row = el('div', 'gd-plays-row' + (ri === 0 ? ' gd-plays-row-first' : ''));
          rowCards.forEach((c) => row.appendChild(miniCard(c, wild)));
          plays.appendChild(row);
        });
        // 牌型标签：绝对定位右上角，不占牌行空间
        if (t.type) plays.appendChild(el('span', 'gd-play-type', t.type));
      }
      d.appendChild(plays);
    }
    // 局结束：每个玩家出牌区只放自己名次的大图标（四行榜单已移到底部横幅，出牌区不再堆文字）
    if (roundOver) {
      const myRank = rankOf[s];
      if (myRank) {
        const panel = el('div', 'gd-rank-panel');
        const iconsRow = el('div', 'gd-rank-icons');
        iconsRow.appendChild(el('span', 'gd-rank-medal gd-rank-' + myRank, RANK_MEDAL[myRank - 1]));
        panel.appendChild(iconsRow);
        d.appendChild(panel);
      }
      // 局结束：所有未出完玩家（含末游）的底牌公开翻出给大家看：在其出牌区平铺展示
      if (seats[s].revealed && seats[s].revealCards.length) {
        const rev = el('div', 'gd-reveal');
        rev.appendChild(el('span', 'gd-reveal-label', seats[s].name + ' 剩余底牌'));
        const rw = el('div', 'gd-reveal-cards');
        seats[s].revealCards.forEach((c) => rw.appendChild(miniCard(c, wild)));
        rev.appendChild(rw);
        d.appendChild(rev);
      }
    } else if (finishedSet.has(s) && g.winOrderSeats && g.winOrderSeats[0] === s) {
      // 牌局进行中：第一名（头游）已走完 → 出牌区立即显示大"赢"（第二以后不显示）
      const win = el('div', 'gd-win-mark', '赢');
      d.appendChild(win);
    }
    return d;
  }

  const table = el('div', 'gd-table');
  // 顶部状态条：轮到在左，需压过+倒计时在右（利用右侧空白，更醒目）
  const st = el('div', 'gd-statusbar');
  st.appendChild(el('span', 'gd-st-turn', humanTurn ? '轮到：你' : '轮到：' + (g.waitingName || '')));
  const stRight = el('div', 'gd-statusbar-right');
  if (g.lastMax) stRight.appendChild(el('span', 'gd-st-max', '需压过：' + g.lastMax.name + ' ' + commaList(g.lastMax.cards).map(cardLabel).join(' ')));
  else if (humanTurn) stRight.appendChild(el('span', 'gd-st-max', '自由出牌'));
  if (humanTurn) {
    if (firstLead) stRight.appendChild(el('span', 'gd-st-timer', '牌权在手 不限时'));
    else stRight.appendChild(el('span', 'gd-st-timer', '⏱ ' + (countdown != null ? countdown : state.countdown) + 's'));
  }
  st.appendChild(stRight);
  boardEl.appendChild(st);
  table.appendChild(seatCard(seatN, 'gd-seat-north'));
  const mid = el('div', 'gd-mid');
  mid.appendChild(seatCard(seatW, 'gd-seat-west gd-seat-side', 'gd-side'));
  const center = el('div', 'gd-center');
  center.appendChild(el('div', 'gd-center-round', '第' + g.round + '局 · 级牌 ' + g.level + ' · 第' + ((g.trickNo || 0) + 1) + '墩（逢人配=红桃' + g.level + '）'));
  // 中央文字提醒（黄色，替代圆形计时器，与底部提醒同风格）
  const tip = el('div', 'gd-center-tip');
  if (humanTurn) {
    if (firstLead) tip.appendChild(el('div', 'gd-center-tip-main', '▶ 牌权在手：请出牌（不限时，不能过）'));
    else tip.appendChild(el('div', 'gd-center-tip-main', '▶ 点牌选中 → 出牌；每手限时 ' + TURN_SECONDS + ' 秒（剩 ⏱ ' + (countdown != null ? countdown : state.countdown) + 's）'));
  } else if (g.lastMax) {
    tip.appendChild(el('div', 'gd-center-tip-main', '▶ 牌友行牌中…请等待'));
  } else {
    tip.appendChild(el('div', 'gd-center-tip-main', '▶ 牌友行牌中…请等待'));
  }
  center.appendChild(tip);
  mid.appendChild(center);
  mid.appendChild(seatCard(seatE, 'gd-seat-east gd-seat-side', 'gd-side'));
  table.appendChild(mid);
  table.appendChild(seatCard(v, 'gd-seat-south', 'gd-me'));
  boardEl.appendChild(table);

  if (g.roundEnd || g.episodeEnd) {
    // 底部排名横幅：第一行标题 + 四行名次（手机/电脑通用）
    const banner = el('div', 'gd-banner');
    banner.appendChild(el('div', 'gd-banner-title', g.episodeEnd ? '🏆 通关！整局结束（过 A 达成）' : '本局结束排名如下：'));
    (g.winOrderSeats || []).forEach((seatId, i) => {
      const nm = seats[seatId] ? seats[seatId].name : ('#' + seatId);
      banner.appendChild(el('div', 'gd-banner-line', RANK_MEDAL[i] + ' ' + (i + 1) + '名：' + nm));
    });
    boardEl.appendChild(banner);
  }

  // 手牌
  const me = g.hands[viewerSeat];
  // 清理不在手中的选中牌（轮询刷新后手牌已变，残留选中会虚增计数）
  if (me && me.cards) {
    for (const k in state.selected) {
      const remain = me.cards.filter((c) => c === k).length;
      if (remain === 0) delete state.selected[k];
      else if (state.selected[k] > remain) state.selected[k] = remain;
    }
  }
  const mine = (me && me.cards) ? me.cards.slice() : [];
  // 组牌视图：组内牌相邻展示（带组框与牌型名），散牌自然排序在后；仅影响查看，出牌仍按选中
  const view = handView(mine);
  // 全部牌平铺：按点数从大到小排序，每张牌独立、等间距，不分组不叠放（方便挑任意花色组合）
  const handEl = el('div', 'gd-hand');
  const selShown = {}; // 同名牌已高亮实例计数
  const mkCard = (c) => {
    const p = cardParts(c);
    const shown = selShown[c] || 0;
    const isSel = shown < (state.selected[c] || 0); // 同名牌按实例逐个高亮（两张 3♠ 可单独选一张）
    selShown[c] = shown + 1;
    const card = el('span', 'gd-card ' + colorClass(c) + (isSel ? ' sel' : '') + (c === wild ? ' gd-wild' : ''), '', () => (inRoom ? roomToggle : soloToggle)(c));
    card.title = cardLabel(c);
    card.appendChild(el('span', 'gd-card-rank', p.rank));
    card.appendChild(el('span', 'gd-card-suit', p.suit));
    return card;
  };
  view.groups.forEach((grp, gi) => {
    const wrap = el('div', 'gd-hand-group');
    wrap.appendChild(el('span', 'gd-hand-group-label', grp.type || '组' + (gi + 1)));
    grp.cards.forEach((c) => wrap.appendChild(mkCard(c)));
    handEl.appendChild(wrap);
  });
  view.loose.forEach((c) => handEl.appendChild(mkCard(c)));
  boardEl.appendChild(handEl);

  // 操作
  const actions = el('div', 'gd-actions');
  const mkBtn = (label, fn, disabled, extra) => {
    const b = el('button', 'gd-btn gd-big' + (extra ? ' ' + extra : ''), label, fn);
    b.disabled = !!disabled;
    return b;
  };
  // 局结束：停留显示排名，由真人手动开始下一局（不自动）
  const roundOver = !!(g && g.roundEnd && !g.episodeEnd);
  const episodeOver = !!(g && g.episodeEnd);
  if (roundOver || episodeOver) {
    actions.appendChild(mkBtn(episodeOver ? '🔄 重新开始一整局' : '▶ 开始下一局', () => {
      sound('play');
      if (inRoom) {
        callApi('room/' + state.room.code + '/next', { method: 'POST', body: {} }).then(() => {
          state.selected = {};
          return callApi('room/' + state.room.code + '/state?player=' + encodeURIComponent(pkey));
        }).then((r) => applyRoomState(r)).catch((e) => { state.error = String((e && e.message) || e); render(); });
      } else {
        soloRun(() => callApi('next?session=' + encodeURIComponent(pkey), { method: 'POST', body: {} }));
      }
    }, false, 'gd-primary'));
    actions.appendChild(mkBtn('结束', async () => {
      if (!window.confirm(inRoom ? '确定退出本房间吗？' : '确定结束本局牌桌吗？（结束=退出游戏）')) return;
      sound('end');
      if (inRoom) {
        await callApi('room/' + (state.room.code) + '/leave', { method: 'POST', body: { player: pkey } });
        stopPoll(); state.screen = 'mode'; state.room = null; state.game = null; render();
      } else {
        await callApi('end?session=' + encodeURIComponent(pkey), { method: 'POST', body: {} });
        state.quitted = true; state.game = null; clearSoloTimer(); render();
      }
    }, false, 'gd-end'));
  } else {
  // 6 个单字按钮：出 过 组 解 清 关（一行排开，不遮挡手牌，能看全部牌）
  const mkActBtn = (label, tip, fn, disabled, extra) => {
    const b = el('button', 'gd-btn gd-act' + (extra ? ' ' + extra : ''), label, fn);
    b.title = tip;
    b.disabled = !!disabled;
    return b;
  };
  actions.appendChild(mkActBtn('出', '出牌 (' + selectedCount() + ')', () => {
    if (selectedCount() === 0) return;
    sound('play');
    if (inRoom) roomPlay(selectedCards().join(' '), false);
    else soloRun(() => callApi('play?session=' + encodeURIComponent(pkey), { method: 'POST', body: { cards: selectedCards().join(' ') } }));
  }, !humanTurn || selectedCount() === 0, 'gd-primary'));
  actions.appendChild(mkActBtn('过', '过牌', () => {
    sound('pass');
    speakChinese('过'); // 真人发音"过"
    if (inRoom) roomPlay(null, true);
    else soloRun(() => callApi('play?session=' + encodeURIComponent(pkey), { method: 'POST', body: { pass: true } }));
  }, !humanTurn || firstLead));
  actions.appendChild(mkActBtn('组', '组牌：选中牌组成牌型排在一起', () => { sound('click'); tryGroupSelected(); }, selectedCount() < 3));
  actions.appendChild(mkActBtn('解', '解组：恢复自然散牌排序', () => { sound('click'); ungroupAll(); }, !state.groups.length));
  actions.appendChild(mkActBtn('清', '清空选中', () => { state.selected = {}; render(); }, selectedCount() === 0));
  actions.appendChild(mkActBtn('关', '结束本局/退出', async () => {
    if (!window.confirm(inRoom ? '确定退出本房间吗？' : '确定结束本局牌桌吗？（结束=退出游戏）')) return;
    sound('end');
    if (inRoom) {
      await callApi('room/' + (state.room.code) + '/leave', { method: 'POST', body: { player: pkey } });
      stopPoll(); state.screen = 'mode'; state.room = null; state.game = null; render();
    } else {
      await callApi('end?session=' + encodeURIComponent(pkey), { method: 'POST', body: {} });
      state.quitted = true; state.game = null; clearSoloTimer(); render();
    }
  }, false, 'gd-end'));
  }
  boardEl.appendChild(actions);
  // 底部不再显示规则文字（省空间给手牌；出牌提醒已在中央显示）
  if (state.notes && state.notes.length) {
    const notes = el('div', 'gd-notes');
    state.notes.slice(-6).forEach((n) => notes.appendChild(el('div', '', n)));
    boardEl.appendChild(notes);
  }
  if (state.error) boardEl.appendChild(el('div', 'gd-error', '⚠ ' + state.error));
  // 出牌区行内自适应：牌多超宽时轻微重叠（不调整任何尺寸、不出区域）
  setTimeout(adjustPlays, 0);
}

/** 出牌区行宽自适应：一行内牌总宽超过可用宽时，让牌轻微重叠以全部可见（不改尺寸、不出区域） */
function adjustPlays() {
  document.querySelectorAll('.gd-plays-row').forEach((row) => {
    const plays = row.parentElement;
    if (!plays) return;
    const avail = plays.clientWidth;
    const minis = row.querySelectorAll('.gd-mini');
    if (minis.length < 2) return;
    // 重置上次重叠
    minis.forEach((m) => { m.style.marginLeft = ''; });
    const total = row.scrollWidth;
    if (total <= avail) return;
    const overlap = Math.ceil((total - avail) / (minis.length - 1)) + 1;
    for (let i = 1; i < minis.length; i++) minis[i].style.marginLeft = '-' + overlap + 'px';
  });
}

// ================= 启动 =================
render();
