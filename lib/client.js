// client.js — 掼蛋-中联储卫（GUANDAN-中联储卫）浏览器半（V2.2）
// 手写 loader 包裹的 React 牌桌（免构建链）。东南西北牌桌布局（与独立版一致）：
//   北=对家、西/东=另两家、南=你；各家出的牌显示在各自面前（后出覆盖先出）
// 入口：sidebar.footer.action 侧边栏入口 / shell.overlay 浮层 / web-ui.plugin.item 插件卡
// 数据经同源 /guandan/api/* 路由，与 guandan_* 工具共享同一张牌局表。
window.__ModuleLoader__.load({
	id: "@zhonglianchuwei/dsh-guandan",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var react = require("react");
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useCallback = react.useCallback;
		var useRef = react.useRef;
		var h = react.createElement;

		// ---- 样式 ----
		var STYLE_ID = "@zhonglianchuwei/dsh-guandan/board.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "@zhonglianchuwei/dsh-guandan";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = [
				".gd-trigger{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--dsw-alias-label-secondary,#ccc);font:inherit;cursor:pointer;padding:6px 10px;border-radius:8px;text-align:left}",
				".gd-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.1));color:#fff}",
				".gd-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}",
				".gd-overlay-panel{background:linear-gradient(160deg,#14532d,#0f3d22 55%,#0a2a18);color:#f0f0f0;border:1px solid rgba(255,255,255,.18);border-radius:16px;width:min(820px,96vw);max-height:92vh;overflow:auto;padding:16px 18px;position:relative;box-shadow:0 16px 50px rgba(0,0,0,.6)}",
				".gd-close{position:absolute;top:10px;right:14px;cursor:pointer;background:rgba(255,255,255,.12);border:none;color:#fff;font:inherit;font-size:18px;padding:4px 10px;border-radius:8px}",
				".gd-close:hover{background:rgba(255,255,255,.25)}",
				".gd-board{font-size:14px;line-height:1.5}",
				".gd-bar{display:flex;align-items:center;gap:8px;padding:4px 0 8px;flex-wrap:wrap}",
				".gd-title{font-weight:800;font-size:17px}",
				".gd-level{display:inline-block;background:rgba(255,212,121,.15);border:1px solid #ffd479;color:#ffd479;font-weight:800;font-size:13px;padding:2px 10px;border-radius:8px}",
				".gd-btn{font:inherit;cursor:pointer;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.14);color:#fff;border-radius:10px;padding:7px 14px}",
				".gd-btn:hover{background:rgba(255,255,255,.26)}",
				".gd-btn:disabled{opacity:.45;cursor:default}",
				".gd-table{margin-top:2px}",
				".gd-seat{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;align-items:center}",
				".gd-seat-north{margin-bottom:8px}.gd-seat-south{margin-top:8px}",
				".gd-mid{display:flex;gap:8px;align-items:stretch}",
				".gd-seat-west,.gd-seat-east{flex:1}",
				".gd-seat-info{font-weight:700;font-size:14px;color:#e2f0e8;display:flex;align-items:center}",
				".gd-avatar{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.16);font-size:18px;margin-right:6px;flex:none}",
				".gd-avatar-active{background:rgba(255,212,121,.28);box-shadow:0 0 0 2px #ffd479,0 0 14px rgba(255,212,121,.7);animation:gdPulse 1s ease-in-out infinite}",
				".gd-turn-badge{display:inline-block;margin-left:6px;color:#ffd479;font-weight:800;font-size:12px;background:rgba(255,212,121,.15);border:1px solid #ffd479;border-radius:8px;padding:1px 7px;animation:gdPulse 1s ease-in-out infinite}",
				"@keyframes gdPulse{0%,100%{opacity:1}50%{opacity:.5}}",
				".gd-seat-info.gd-partner{color:#ffd479}",
				".gd-seat-info.gd-me{color:#9fd8ff}",
				".gd-plays{display:flex;gap:4px;align-items:center;min-height:48px;flex-wrap:wrap;justify-content:center}",
				".gd-pass-mark{color:#9fb8a8;font-size:15px;font-weight:600}",
				".gd-mini{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:32px;height:44px;border-radius:5px;background:#fff;border:1px solid #ddd;box-shadow:0 2px 4px rgba(0,0,0,.45);line-height:1;padding:2px}",
				".gd-mini-rank{font-weight:800;font-size:14px}",
				".gd-mini-suit{font-size:12px;margin-top:1px}",
				".gd-wild{outline:2px solid #ffd479}",
				".gd-play-type{display:inline-block;background:rgba(255,212,121,.15);border:1px solid #ffd479;color:#ffd479;font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px}",
				".gd-red{color:#d2232a}.gd-black{color:#1a1a1a}.gd-joker-big{color:#d2232a}.gd-joker-small{color:#444}",
				".gd-center{flex:2;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center}",
				".gd-center-round{font-weight:700;font-size:14px}",
				".gd-center-turn{font-size:15px;font-weight:700;color:#ffe9a8}",
				".gd-timer{font-size:26px;font-weight:800;color:#ffd479;background:rgba(0,0,0,.4);border-radius:50%;width:54px;height:54px;display:flex;align-items:center;justify-content:center;border:2px solid #ffd479}",
				".gd-timer-free{font-size:14px;line-height:1.3;color:#9fd8ff;border-color:#9fd8ff;width:66px;height:54px;white-space:pre-line}",
				".gd-center-max{font-size:12px;color:#cfe0d6}",
				".gd-banner{text-align:center;font-size:16px;font-weight:800;color:#ffe9a8;background:rgba(255,212,121,.12);border:1px solid rgba(255,212,121,.4);border-radius:10px;padding:8px;margin:8px 0}",
				".gd-hand{margin:10px 0 8px;display:flex;flex-wrap:wrap;gap:5px;align-items:flex-end;justify-content:center}",
				".gd-group{display:flex;gap:3px;align-items:center;margin-right:2px}",
				".gd-rank-label{opacity:.65;font-size:11px;align-self:flex-start;margin-top:4px;color:#e8f2ec}",
				".gd-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;height:var(--gd-card-h,64px);min-width:calc(var(--gd-card-h,64px) * 0.72);border-radius:8px;background:#fff;border:1px solid #e0e0e0;box-shadow:0 2px 5px rgba(0,0,0,.5);cursor:pointer;user-select:none;padding:3px 2px;line-height:1.05;transition:transform .08s}",
				".gd-card:hover{transform:translateY(-3px)}",
				".gd-card.sel{outline:3px solid #4da3ff;transform:translateY(-9px);box-shadow:0 6px 14px rgba(0,0,0,.6)}",
				".gd-card-rank{font-weight:800;font-size:calc(var(--gd-card-h,64px) * 0.28)}",
				".gd-card-suit{font-size:calc(var(--gd-card-h,64px) * 0.24);margin-top:1px}",
				".gd-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0 6px;position:sticky;bottom:0;background:rgba(5,22,12,.94);padding:10px 2px;z-index:2;border-radius:12px}",
				".gd-big{font-size:18px;font-weight:800;padding:14px 4px;border-radius:12px;min-height:56px;border:none}",
				".gd-act-play{background:#2f7bff;color:#fff}",
				".gd-act-play:hover{background:#3f88ff}",
				".gd-act-pass{background:#e8a33d;color:#3a2400}",
				".gd-act-pass:hover{background:#f0ad48}",
				".gd-act-clear{background:#6b7280;color:#fff}",
				".gd-act-clear:hover{background:#7a8290}",
				".gd-act-end{background:#d23a3a;color:#fff}",
				".gd-act-end:hover{background:#e04747}",
				".gd-hint{text-align:center;color:#a9c4b4;font-size:12px;margin:2px 0 6px}",
				".gd-notes{color:#cfe0d6;font-size:13px;margin-top:6px;max-height:90px;overflow:auto}",
				".gd-error{color:#ff9a9a;margin-top:6px;font-size:13px}",
				".gd-empty{color:#a9c4b4;padding:12px 0}"
			].join("");
			document.head.appendChild(tag);
		}

		// ---- 牌面工具 ----
		var SUIT_SYMBOL = { H: "♥", S: "♠", C: "♣", D: "♦" };
		var RANK_ORDER = "23456789TJQKA";
		function cardParts(c) {
			if (c === "SB") return { rank: "小", suit: "王" };
			if (c === "HR") return { rank: "大", suit: "王" };
			return { rank: c.slice(1) === "T" ? "10" : c.slice(1), suit: SUIT_SYMBOL[c[0]] };
		}
		function cardLabel(c) {
			var p = cardParts(c);
			return p.suit === "王" ? p.rank + "王" : p.suit + p.rank;
		}
		function rankValue(c) {
			if (c === "SB") return 14;
			if (c === "HR") return 15;
			return RANK_ORDER.indexOf(c.slice(1)) + 1;
		}
		function colorClass(c) {
			if (c === "HR") return "gd-joker-big";
			if (c === "SB") return "gd-joker-small";
			return (c[0] === "H" || c[0] === "D") ? "gd-red" : "gd-black";
		}
		function commaList(s) { return typeof s === "string" ? s.split(",") : []; }

		
		function seatInfoEl(avatar, active, text, cls) {
			return h("div", { className: "gd-seat-info" + (cls ? " " + cls : "") },
				h("span", { className: "gd-avatar" + (active ? " gd-avatar-active" : "") }, avatar),
				h("span", { className: "gd-seat-name" + (cls && cls.indexOf("gd-side") >= 0 ? " gd-seat-name-block" : "") }, text),
				active ? h("span", { className: "gd-turn-badge" }, "出牌中") : null);
		}
function miniPlayEl(c, wild) {
			var p = cardParts(c);
			return h("span", { className: "gd-mini " + colorClass(c) + (c === wild ? " gd-wild" : ""), key: c },
				h("span", { className: "gd-mini-rank" }, p.rank),
				h("span", { className: "gd-mini-suit" }, p.suit));
		}

		function selectedCount(sel) { var n = 0; for (var k in sel) n += sel[k]; return n; }
		function selectedCards(sel) { var out = []; for (var k in sel) for (var i = 0; i < sel[k]; i++) out.push(k); return out; }
		function prettyNote(n) {
			return String(n)
				.replace(/HR/g, "大王").replace(/SB/g, "小王")
				.replace(/([HSDC])([2-9TJQKA])/g, (m, s, r) => SUIT_SYMBOL[s] + (r === "T" ? "10" : r));
		}

		// ---- 音效（WebAudio 合成）----
		var actx = null;
		function sound(type) {
			try {
				actx = actx || new (window.AudioContext || window.webkitAudioContext)();
				var freq = { click: 880, play: 523, pass: 330, win: 659, end: 440 }[type] || 600;
				var o = actx.createOscillator();
				var g = actx.createGain();
				o.type = "sine";
				o.frequency.value = freq;
				o.connect(g); g.connect(actx.destination);
				g.gain.setValueAtTime(0.13, actx.currentTime);
				g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.18);
				o.start(); o.stop(actx.currentTime + 0.2);
			} catch (e) { /* 无声环境忽略 */ }
		}

		// ---- 浮层开关 ----
		var uiOpen = { value: false, subs: [] };
		function gdSetOpen(v) {
			uiOpen.value = !!v;
			for (var i = 0; i < uiOpen.subs.length; i++) uiOpen.subs[i](uiOpen.value);
		}
		function useGdOpen() {
			var [o, setO] = useState(uiOpen.value);
			useEffect(function () {
				var f = function (v) { setO(v); };
				uiOpen.subs.push(f);
				return function () { uiOpen.subs = uiOpen.subs.filter(function (x) { return x !== f; }); };
			}, []);
			return o;
		}

		var sessionAccessor = function () { return undefined; };

		// ---- API ----
		function apiUrl(session, path) {
			return "/guandan/api/" + path + "?session=" + encodeURIComponent(session);
		}
		async function callApi(session, path, opts) {
			var init = { method: (opts && opts.method) || "GET", headers: { "content-type": "application/json" } };
			if (opts && opts.body) init.body = JSON.stringify(opts.body);
			var res = await fetch(apiUrl(session, path), init);
			var data = await res.json().catch(function () { return null; });
			if (!data || data.ok !== true) {
				throw new Error((data && data.error && data.error.message) || "请求失败");
			}
			return data.value;
		}

		// ---- 牌桌（东南西北）----
		var TURN_SECONDS = 15;
		var CARD_SIZES = [52, 64, 80, 100];
		var CARD_SIZE_LABELS = ["小", "中", "大", "特大"];
		function loadCardH() {
			try { var n = Number(localStorage.getItem("gd-card-h")); return CARD_SIZES.indexOf(n) >= 0 ? n : 64; } catch (e) { return 64; }
		}
		function saveCardH(v) { try { localStorage.setItem("gd-card-h", String(v)); } catch (e) {} }

		function GuandanBoard(props) {
			var sessionId = props && props.sessionId;
			var [game, setGame] = useState(null);
			var [notes, setNotes] = useState([]);
			var [busy, setBusy] = useState(false);
			var [error, setError] = useState(null);
			var [selected, setSelected] = useState({});
			var [cardH, setCardH] = useState(loadCardH);
			var [countdown, setCountdown] = useState(TURN_SECONDS);
			var timerRef = useRef(null);

			var refresh = useCallback(async function () {
				if (!sessionId) return;
				try {
					var v = await callApi(sessionId, "state");
					setGame(v);
					setError(null);
				} catch (e) { setError(String((e && e.message) || e)); }
			}, [sessionId]);

			useEffect(function () { refresh(); }, [refresh]);

			// 每手 15 秒倒计时：轮到你时启动（第一手开局不限时），超时自动过牌
			useEffect(function () {
				if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
				var g = game;
				if (!g) return;
				if (g.roundEnd || g.episodeEnd) return;
				var humanTurn = g.playerWaiting === g.humanSeat;
				var firstLead = (g.history || []).length === 0 && (g.trick || []).length === 0;
				if (humanTurn && !firstLead) {
					setCountdown(TURN_SECONDS);
					timerRef.current = setInterval(function () {
						setCountdown(function (c) {
							if (c <= 1) {
								clearInterval(timerRef.current);
								timerRef.current = null;
								sound("pass");
								run(() => callApi(sessionId, "play", { method: "POST", body: { pass: true } }));
								return 0;
							}
							return c - 1;
						});
					}, 1000);
				}
				return function () { if (timerRef.current) clearInterval(timerRef.current); };
			}, [game, sessionId]);

			// 机器人节奏：每 5 秒推进一个机器人，直到轮到你
			useEffect(function () {
				if (!game || game.roundEnd || game.episodeEnd) return;
				if (!game.waitingIsHuman) {
					var t = setTimeout(async function () {
						try {
							var v = await callApi(sessionId, "step", { method: "POST", body: {} });
							if (v && v.state) { setGame(v.state); setNotes((v.notes || []).map(prettyNote)); }
						} catch (e) { setError(String((e && e.message) || e)); }
					}, 5000);
					return function () { clearTimeout(t); };
				}
			}, [game, sessionId]);

			function run(action) {
				return async function () {
					if (!sessionId || busy) return;
					setBusy(true); setError(null);
					try {
						var v = await action();
						if (v && v.state) { setGame(v.state); setNotes((v.notes || []).map(prettyNote)); }
						setSelected({});
					} catch (e) { setError(String((e && e.message) || e)); }
					setBusy(false);
				};
			}

			var onNew = run(function () { return callApi(sessionId, "new", { method: "POST", body: {} }); });
			var onRefresh = run(function () { return callApi(sessionId, "state"); });
			var onPlay = run(function () {
				if (selected.length === 0) return null;
				sound("play");
				return callApi(sessionId, "play", { method: "POST", body: { cards: selectedCards(selected).join(" ") } });
			});
			var onPass = run(function () { sound("pass"); return callApi(sessionId, "play", { method: "POST", body: { pass: true } }); });
			var onEnd = async function () {
				if (!sessionId || busy) return;
				if (typeof window !== "undefined" && !window.confirm("确定结束本局牌桌吗？")) return;
				sound("end");
				setBusy(true);
				try { await callApi(sessionId, "end", { method: "POST", body: {} }); gdSetOpen(false); }
				catch (e) { setError(String((e && e.message) || e)); }
				setBusy(false);
			};

			function toggle(card) {
				// 按张数计数：两副牌同码牌（如两张 A♠）可分别选入
				var me = game && game.hands ? game.hands.find(function (x) { return x.isHuman; }) : null;
				var total = (me && me.cards) ? me.cards.filter(function (c) { return c === card; }).length : 0;
				if (total === 0) return;
				setSelected(function (prev) {
					var next = {};
					for (var k in prev) next[k] = prev[k];
					var cur = next[card] || 0;
					if (cur >= total) delete next[card];
					else next[card] = cur + 1;
					return next;
				});
			}

			var cardSizeIdx = CARD_SIZES.indexOf(cardH);
			var cardSizeLabel = CARD_SIZE_LABELS[cardSizeIdx >= 0 ? cardSizeIdx : 1];
			function cycleCardH() {
				var next = CARD_SIZES[(CARD_SIZES.indexOf(cardH) + 1) % CARD_SIZES.length];
				setCardH(next); saveCardH(next);
			}

			// 组装座位数据
			var hands = (game && game.hands) || [];
			var byId = function (id) { return hands.find(function (x) { return x.id === id; }); };
			var trickOf = function (id) {
				var arr = (game && game.trick) || [];
				for (var i = arr.length - 1; i >= 0; i--) if (arr[i].player === id) return arr[i];
				return null;
			};
			var humanTurn = !!(game && !game.roundEnd && !game.episodeEnd && game.playerWaiting === game.humanSeat);

			// 顶部工具条
			var bar = h("div", { className: "gd-bar" },
				h("span", { className: "gd-title" }, "🃏 掼蛋-中联储卫" + (game ? " · 第" + game.round + "局" : "")),
				h("span", { className: "gd-level" }, game ? "级牌 " + game.level + " · 逢人配=红桃" + game.level : ""),
				h("button", { className: "gd-btn", onClick: onNew, disabled: busy }, "开局"),
				h("button", { className: "gd-btn", onClick: onRefresh, disabled: busy }, "刷新"),
				h("button", { className: "gd-btn", onClick: cycleCardH, title: "牌面大小" }, "牌面 " + cardSizeLabel));

			if (!game) {
				return h("div", { className: "gd-board", style: { "--gd-card-h": cardH + "px" } },
					bar, h("div", { className: "gd-empty" }, "正在加载牌局…"));
			}

			var north = byId(2), east = byId(1), west = byId(3), south = byId(game.humanSeat);
			var nT = trickOf(2), eT = trickOf(1), wT = trickOf(3), sT = trickOf(game.humanSeat);
			var partner = game.humanSeat === 2 ? 0 : game.humanSeat + 2;

			var center = h("div", { className: "gd-center" },
				h("div", { className: "gd-center-round" }, "第" + game.round + "局 · 级牌 " + game.level + " · 第" + ((game.trickNo || 0) + 1) + "墩（逢人配=红桃" + game.level + "）"),
				h("div", { className: "gd-center-turn" }, humanTurn ? "轮到：你" : "轮到：" + (game.waitingName || "")),
				humanTurn && (game.history || []).length === 0 && (game.trick || []).length === 0
					? h("div", { className: "gd-timer gd-timer-free", key: "tm" }, "第一手\n不限时")
					: (humanTurn ? h("div", { className: "gd-timer", key: "tm" }, "⏱ " + countdown) : null),
				game.lastMax ? h("div", { className: "gd-center-max" }, "最大：" + game.lastMax.name + " " + commaList(game.lastMax.cards).map(cardLabel).join(" ")) : null);

			var table = h("div", { className: "gd-table" },
				h("div", { className: "gd-seat gd-seat-north" },
					seatInfoEl("🦊", game.playerWaiting === 2, "⬆ 北 · " + (north ? north.name : "") + (2 === partner ? "（对家）" : "") + " · " + (north ? north.count : 0) + " 张", 2 === partner ? "gd-partner" : ""),
					nT ? (nT.pass ? h("div", { className: "gd-pass-mark" }, "过") : h("div", { className: "gd-plays" }, commaList(nT.cards).slice(0, 6).map(function (c) { return miniPlayEl(c, "H" + game.level); }), nT.type ? h("span", { className: "gd-play-type" }, nT.type) : null)) : null),
				h("div", { className: "gd-mid" },
					h("div", { className: "gd-seat gd-seat-west" },
						seatInfoEl("🐼", game.playerWaiting === 3, "⬅ 西 · " + (west ? west.name : "") + " · " + (west ? west.count : 0) + " 张", "gd-side"),
						wT ? (wT.pass ? h("div", { className: "gd-pass-mark" }, "过") : h("div", { className: "gd-plays" }, commaList(wT.cards).slice(0, 6).map(function (c) { return miniPlayEl(c, "H" + game.level); }), wT.type ? h("span", { className: "gd-play-type" }, wT.type) : null)) : null),
					center,
					h("div", { className: "gd-seat gd-seat-east" },
						seatInfoEl("🐯", game.playerWaiting === 1, "➡ 东 · " + (east ? east.name : "") + " · " + (east ? east.count : 0) + " 张", "gd-side"),
						eT ? (eT.pass ? h("div", { className: "gd-pass-mark" }, "过") : h("div", { className: "gd-plays" }, commaList(eT.cards).slice(0, 6).map(function (c) { return miniPlayEl(c, "H" + game.level); }), eT.type ? h("span", { className: "gd-play-type" }, eT.type) : null)) : null)),
				h("div", { className: "gd-seat gd-seat-south" },
					seatInfoEl("🦁", game.playerWaiting === game.humanSeat, "⬇ 南 · 你 · " + (south ? south.count : 0) + " 张", "gd-me"),
					sT ? (sT.pass ? h("div", { className: "gd-pass-mark" }, "过") : h("div", { className: "gd-plays" }, commaList(sT.cards).slice(0, 6).map(function (c) { return miniPlayEl(c, "H" + game.level); }), sT.type ? h("span", { className: "gd-play-type" }, sT.type) : null)) : null));

			// 手牌分组
			var me = byId(game.humanSeat);
			var mine = (me && me.cards) ? me.cards.slice().sort(function (a, b) { return rankValue(b) - rankValue(a); }) : [];
			var groups = [];
			var seen = {};
			mine.forEach(function (c) {
				var r = (c === "SB" || c === "HR") ? c : c.slice(1);
				if (!seen[r]) { seen[r] = []; groups.push({ rank: r, cards: seen[r] }); }
				seen[r].push(c);
			});
			var handEl = h("div", { className: "gd-hand" },
				groups.map(function (grp) {
					return h("span", { className: "gd-group", key: grp.rank },
						h("span", { className: "gd-rank-label" }, grp.rank === "SB" ? "小王" : grp.rank === "HR" ? "大王" : grp.rank === "T" ? "10" : grp.rank),
						grp.cards.map(function (c) {
							var p = cardParts(c);
							return h("span", {
								className: "gd-card " + colorClass(c) + ((selected[c] || 0) > 0 ? " sel" : "") + (c === "H" + game.level ? " gd-wild" : ""),
								key: c, onClick: function () { toggle(c); }, title: cardLabel(c)
							}, h("span", { className: "gd-card-rank" }, p.rank), h("span", { className: "gd-card-suit" }, p.suit));
						}));
				}));

			// 彩色大按钮
			var actions = h("div", { className: "gd-actions" },
				h("button", { className: "gd-big gd-act-play", onClick: onPlay, disabled: busy || !humanTurn || selected.length === 0 }, "出牌 (" + selectedCount(selected) + ")"),
				h("button", { className: "gd-big gd-act-pass", onClick: onPass, disabled: busy || !humanTurn }, "过牌"),
				h("button", { className: "gd-big gd-act-clear", onClick: function () { setSelected({}); }, disabled: selectedCount(selected) === 0 }, "清空"),
				h("button", { className: "gd-big gd-act-end", onClick: onEnd, disabled: busy }, "结束"));

			return h("div", { className: "gd-board", style: { "--gd-card-h": cardH + "px" } },
				bar,
				table,
				(game.roundEnd || game.episodeEnd) ? h("div", { className: "gd-banner" }, game.episodeEnd ? "🏆 通关！整局结束（过 A 达成）" : "🔚 本局结束，头游：" + game.winOrder.join("、")) : null,
				handEl,
				actions,
				h("div", { className: "gd-hint" }, humanTurn ? "点牌选中 → 出牌；每手限时 15 秒（第一手不限时）" : "牌友行牌中…"),
				notes && notes.length ? h("div", { className: "gd-notes" }, notes.map(function (n, i) { return h("div", { key: i }, n); })) : null,
				error ? h("div", { className: "gd-error" }, "⚠ " + error) : null);
		}

		// ---- 侧边栏入口 ----
		function GuandanTrigger(props) {
			return h("button", {
				className: "gd-trigger",
				onClick: function () { sound("click"); gdSetOpen(true); },
				title: "打开掼蛋牌桌",
				style: props && props.wide ? { width: "100%" } : undefined
			}, "🃏 掼蛋");
		}

		// ---- 浮层 ----
		function GuandanOverlay() {
			var open = useGdOpen();
			if (!open) return null;
			var sessionId = sessionAccessor();
			return h("div", {
				className: "gd-overlay",
				onClick: function (e) { if (e.target === e.currentTarget) gdSetOpen(false); }
			}, h("div", { className: "gd-overlay-panel" },
				h("button", { className: "gd-close", onClick: function () { gdSetOpen(false); }, title: "关闭" }, "✕"),
				h(GuandanBoard, { sessionId: sessionId })));
		}

		// ---- 插件设置卡 ----
		function GuandanSettingsCard() {
			return h("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 4px", fontSize: 13 } },
				h("span", {}, "🃏 掼蛋-中联储卫"),
				h("span", { className: "gd-hint", style: { margin: 0 } }, "4 人掼蛋 · 逢人配/进贡/升级完整规则"),
				h("button", { className: "gd-btn", onClick: function () { gdSetOpen(true); } }, "打开牌桌"));
		}

		// ---- 本地化 ----
		var NS = "guandan";
		var zh = { "board.title": "掼蛋-中联储卫", "board.new": "开局", "board.refresh": "刷新" };
		var en = { "board.title": "Guandan · Zhonglian", "board.new": "New game", "board.refresh": "Refresh" };

		// ---- 插件入口（浏览器半）----
		var inject = ["slots", "locale", "sessions"];

		function apply(ctx) {
			ctx.effect(function () { ctx.locale.register(NS, { zh: zh, en: en }); }, "guandan: dictionaries");
			sessionAccessor = function () {
				try {
					var sessions = ctx.get("sessions");
					var list = sessions && sessions.list;
					if (list && typeof list.getSnapshot === "function") {
						var snap = list.getSnapshot();
						return snap && snap.current !== undefined ? snap.current : undefined;
					}
					if (list && list.current !== undefined) return list.current;
				} catch (e) { /* 忽略 */ }
				return undefined;
			};
			ctx.inject(["slots"], function (scope) {
				scope.slots.inject("sidebar.footer.action", function () {
					return scope.slots.register({ name: "sidebar.footer.action", id: "guandan-trigger", order: 10, label: "掼蛋" }, GuandanTrigger);
				});
				scope.slots.inject("shell.overlay", function () {
					return scope.slots.register({ name: "shell.overlay", id: "guandan-panel", order: 10 }, GuandanOverlay);
				});
				try {
					scope.slots.inject("web-ui.plugin.item", function () {
						return scope.slots.register({ name: "web-ui.plugin.item", id: "guandan", order: 105, locale: NS, inject: function () { return {}; } }, GuandanSettingsCard);
					});
				} catch (e) { /* 槽位不存在则跳过 */ }
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.GuandanBoard = GuandanBoard;
		exports.GuandanTrigger = GuandanTrigger;
		exports.GuandanOverlay = GuandanOverlay;
		return module.exports;
	}
});
