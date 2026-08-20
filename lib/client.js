// client.js — 掼蛋-中联储卫（GUANDAN-中联储卫）浏览器半（V2.1）
// 手写 loader 包裹的 React 牌桌（免构建链，直接以官方 __ModuleLoader__ 契约输出）。
// 入口位置（V2.1 调整，不再占用输入框 dock）：
//   1. sidebar.footer.action —— 侧边栏底部入口「掼蛋」（与「插件市场」同排），点击打开浮层
//   2. shell.overlay —— 浮层牌桌（全屏遮罩 + 居中面板）
//   3. web-ui.plugin.item —— 「Web UI 插件」组里的设置卡（可选，家族插件存在时生效）
// 数据经同源 /guandan/api/* 路由（host 半提供），与 guandan_* 工具共享同一张牌局表。
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
		var h = react.createElement;

		// ---- 样式（CSS 变量带兜底，深浅色主题都可用）----
		var STYLE_ID = "@zhonglianchuwei/dsh-guandan/board.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "@zhonglianchuwei/dsh-guandan";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = [
				".gd-trigger{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--dsw-alias-label-secondary,inherit);font:inherit;cursor:pointer;padding:6px 10px;border-radius:8px;text-align:left}",
				".gd-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,transparent);color:var(--dsw-alias-label-primary,inherit)}",
				".gd-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px}",
				".gd-overlay-panel{background:var(--dsw-alias-surface-main,#1b1d22);color:#f2f2f2;border:1px solid var(--dsw-alias-border-l3,#333);border-radius:14px;width:min(780px,96vw);max-height:90vh;overflow:auto;padding:16px 18px;position:relative;box-shadow:0 12px 40px rgba(0,0,0,.5)}",
				".gd-close{position:absolute;top:10px;right:12px;cursor:pointer;background:none;border:none;color:#cfd6dd;font:inherit;font-size:16px;padding:4px 8px;border-radius:6px}",
				".gd-close:hover{color:#ffffff}",
				".gd-board{font-size:14px;line-height:1.5}",
				".gd-bar{display:flex;align-items:center;gap:8px;padding:4px 0;flex-wrap:wrap}",
				".gd-btn{font:inherit;cursor:pointer;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.14);color:#ffffff;border-radius:8px;padding:6px 14px}",
				".gd-btn:hover{background:rgba(255,255,255,.24)}",
				".gd-btn:disabled{opacity:.5;cursor:default}",
				".gd-title-btn{font-weight:600}",
				".gd-summary{color:#e8e8e8}",
				".gd-status{font-weight:600;margin-bottom:4px;color:#ffffff}",
				".gd-opp{display:flex;gap:12px;margin:4px 0;color:#dfe7e2}",
				".gd-max{margin:4px 0;color:#dfe7e2}",
				".gd-hist{max-height:90px;overflow:auto;margin:4px 0;color:#c9d2cd;font-size:12px}",
				".gd-hand{margin:6px 0 2px;display:flex;flex-wrap:wrap;gap:4px}",
				".gd-group{display:flex;gap:2px;margin-right:6px;align-items:center}",
				".gd-rank{opacity:.6;font-size:11px;margin-right:2px;color:#e8e8e8}",
				".gd-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;height:var(--gd-card-h,64px);min-width:calc(var(--gd-card-h,64px) * 0.7);border-radius:7px;background:#fff;border:1px solid #d8d8d8;box-shadow:0 2px 4px rgba(0,0,0,.35);cursor:pointer;user-select:none;padding:3px 2px;line-height:1.05;transition:transform .08s}",
				".gd-card:hover{transform:translateY(-2px)}",
				".gd-card.sel{outline:3px solid #3b82f6;transform:translateY(-6px)}",
				".gd-card-rank{font-weight:800;font-size:calc(var(--gd-card-h,64px) * 0.28)}",
				".gd-card-suit{font-size:calc(var(--gd-card-h,64px) * 0.24);margin-top:1px}",
				".gd-red{color:#d2232a}",
				".gd-black{color:#1a1a1a}",
				".gd-joker-big{color:#d2232a}",
				".gd-joker-small{color:#444}",
				".gd-actions{display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap;position:sticky;bottom:0;background:rgba(20,25,32,.96);padding:8px 0;z-index:2}",
				".gd-notes{color:#c9d2cd;font-size:12px;margin-top:4px;max-height:70px;overflow:auto}",
				".gd-error{color:#e5534b;margin-top:4px;font-size:12px}",
				".gd-end{color:#e5534b;border-color:#e5534b}",
				".gd-empty{color:var(--dsw-alias-label-tertiary,#888);padding:4px 0}"
			].join("");
			document.head.appendChild(tag);
		}

		// ---- 牌面工具 ----
		var SUIT_SYMBOL = { H: "♥", S: "♠", C: "♣", D: "♦" };
		var RANK_ORDER = "23456789TJQKA";
		function cardLabel(c) {
			if (c === "SB") return "小王";
			if (c === "HR") return "大王";
			var rank = c.slice(1);
			return SUIT_SYMBOL[c[0]] + (rank === "T" ? "10" : rank);
		}
		function rankValue(c) {
			if (c === "SB") return 14;
			if (c === "HR") return 15;
			return RANK_ORDER.indexOf(c.slice(1)) + 1;
		}
		function isRed(c) {
			if (c === "HR") return true;
			return c[0] === "H" || c[0] === "D";
		}
		/** 扑克牌式展示：{rank, suit}，大小王特殊处理 */
		function cardParts(c) {
			if (c === "SB") return { rank: "小", suit: "王" };
			if (c === "HR") return { rank: "大", suit: "王" };
			return { rank: c.slice(1) === "T" ? "10" : c.slice(1), suit: SUIT_SYMBOL[c[0]] };
		}
		function cardColorClass(c) {
			if (c === "HR") return "gd-joker-big";
			if (c === "SB") return "gd-joker-small";
			return isRed(c) ? "gd-red" : "gd-black";
		}
		function commaStr(s) {
			return typeof s === "string" ? s.split(",") : [];
		}

		// ---- 浮层开关（sidebar 入口与 overlay 跨槽位共享）----
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
				return function () {
					uiOpen.subs = uiOpen.subs.filter(function (x) { return x !== f; });
				};
			}, []);
			return o;
		}

		// ---- 当前会话访问器（apply 时从 sessions 服务捕获）----
		var sessionAccessor = function () { return undefined; };

		// ---- API（同源 /guandan/api/*）----
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

		// ---- 牌桌（浮层内全量渲染）----
		// 牌面尺寸档位：高度 px（持久化到 localStorage）；桌面默认更大
		var CARD_SIZES = [52, 64, 80, 100];
		var CARD_SIZE_LABELS = ["小", "中", "大", "特大"];
		function loadCardH() {
			try { var n = Number(localStorage.getItem("gd-card-h")); return CARD_SIZES.indexOf(n) >= 0 ? n : 64; } catch (e) { return 64; }
		}
		function saveCardH(v) {
			try { localStorage.setItem("gd-card-h", String(v)); } catch (e) { /* 无 localStorage 时忽略 */ }
		}
		function GuandanBoard(props) {
			var sessionId = props && props.sessionId;
			var [game, setGame] = useState(null);
			var [notes, setNotes] = useState([]);
			var [busy, setBusy] = useState(false);
			var [error, setError] = useState(null);
			var [selected, setSelected] = useState([]);
			var [cardH, setCardH] = useState(loadCardH);
			var cardSizeLabel = CARD_SIZE_LABELS[CARD_SIZES.indexOf(cardH)] || "中";
			function cycleCardH() {
				var idx = CARD_SIZES.indexOf(cardH);
				var next = CARD_SIZES[(idx + 1) % CARD_SIZES.length];
				setCardH(next);
				saveCardH(next);
			}

			var refresh = useCallback(async function () {
				if (!sessionId) return;
				try {
					var v = await callApi(sessionId, "state");
					setGame(v);
					setError(null);
				} catch (e) {
					setError(String((e && e.message) || e));
				}
			}, [sessionId]);

			useEffect(function () {
				refresh();
			}, [refresh]);

			function run(action) {
				return async function () {
					if (!sessionId || busy) return;
					setBusy(true);
					setError(null);
					try {
						var v = await action();
						if (v && v.state) {
							setGame(v.state);
							setNotes(v.notes || []);
						} else if (v) {
							setGame(v);
							setNotes([]);
						}
						setSelected([]);
					} catch (e) {
						setError(String((e && e.message) || e));
					}
					setBusy(false);
				};
			}

			var onNew = run(function () {
				return callApi(sessionId, "new", { method: "POST", body: {} });
			});
			var onPlay = run(function () {
				return callApi(sessionId, "play", { method: "POST", body: { cards: selected.join(" ") } });
			});
			var onPass = run(function () {
				return callApi(sessionId, "play", { method: "POST", body: { pass: true } });
			});
			var onRefresh = run(function () {
				return callApi(sessionId, "state");
			});
			var onEnd = async function () {
				if (!sessionId || busy) return;
				if (typeof window !== "undefined" && !window.confirm("确定结束本局牌桌吗？")) return;
				setBusy(true);
				try {
					await callApi(sessionId, "end", { method: "POST", body: {} });
					gdSetOpen(false); // 关闭浮层，下次打开自动开新局
				} catch (e) {
					setError(String((e && e.message) || e));
				}
				setBusy(false);
			};

			function toggle(card) {
				setSelected(function (prev) {
					var at = prev.indexOf(card);
					return at >= 0 ? prev.filter(function (x) { return x !== card; }) : prev.concat([card]);
				});
			}

			var groups = [];
			var myCount = 0;
			if (game && game.hands) {
				var me = game.hands.find(function (x) { return x.isHuman; });
				myCount = me ? me.count : 0;
				var mine = me && me.cards ? me.cards.slice() : [];
				mine.sort(function (a, b) { return rankValue(b) - rankValue(a); });
				var seen = {};
				for (var i = 0; i < mine.length; i++) {
					var c = mine[i];
					var r = c === "SB" || c === "HR" ? c : c.slice(1);
					if (!seen[r]) {
						seen[r] = [];
						groups.push({ rank: r, cards: seen[r] });
					}
					seen[r].push(c);
				}
			}

			var humanTurn = !!(game && !game.roundEnd && !game.episodeEnd && game.playerWaiting === game.humanSeat);
			var opponents = game && game.hands ? game.hands.filter(function (x) { return !x.isHuman; }) : [];

			var statusText = "";
			if (game) {
				if (game.episodeEnd) statusText = "🏆 通关！整局结束（过 A 达成）";
				else if (game.roundEnd) statusText = "🔚 本局结束，头游：" + game.winOrder.join("、");
				else statusText = "轮到：" + (game.waitingIsHuman ? "你" : game.waitingName) + " · 级牌 " + game.level + "（逢人配=红桃" + game.level + "）";
			}

			return h(
				"div",
				{ className: "gd-board", style: { "--gd-card-h": cardH + "px" } },
				h(
					"div",
					{ className: "gd-bar" },
					h("span", { className: "gd-title-btn" }, "🃏 掼蛋-中联储卫" + (game ? " · 第" + game.round + "局" : "")),
					h("button", { className: "gd-btn", onClick: onNew, disabled: busy }, "开局"),
					h("button", { className: "gd-btn", onClick: onRefresh, disabled: busy }, "刷新"),
					h("button", { className: "gd-btn", onClick: cycleCardH, title: "牌面大小" }, "牌面 " + cardSizeLabel)
				),
				game
					? h(
							"div",
							{ className: "gd-panel" },
							[
								h("div", { className: "gd-status", key: "st" }, statusText),
								opponents.length
									? h(
											"div",
											{ className: "gd-opp", key: "op" },
											opponents.map(function (o) {
												return h("span", { className: "gd-opp-item", key: o.id }, o.name + "：" + o.count + " 张");
											})
										)
									: null,
								game.lastMax
									? h("div", { className: "gd-max", key: "mx" }, "当前最大：" + game.lastMax.name + " 出 " + commaStr(game.lastMax.cards).map(cardLabel).join(" ") + "（" + game.lastMax.type + "）")
									: null,
								game.history && game.history.length
									? h(
											"div",
											{ className: "gd-hist", key: "hi" },
											game.history.map(function (x, i) {
												return h("div", { key: i }, (x.pass ? "· " + x.name + " 过" : "· " + x.name + " 出 " + commaStr(x.cards).map(cardLabel).join(" ") + "（" + x.type + "）"));
											})
										)
									: null,
								h(
									"div",
									{ className: "gd-hand", key: "hand" },
									groups.map(function (g) {
										return h(
											"span",
											{ className: "gd-group", key: g.rank },
											h("span", { className: "gd-rank" }, g.rank === "SB" ? "小王" : g.rank === "HR" ? "大王" : g.rank === "T" ? "10" : g.rank),
											g.cards.map(function (c) {
												var parts = cardParts(c);
												return h(
													"span",
													{
														className: "gd-card" + (selected.indexOf(c) >= 0 ? " sel" : "") + " " + cardColorClass(c),
														key: c,
														onClick: function () { toggle(c); },
														title: cardLabel(c)
													},
													h("span", { className: "gd-card-rank" }, parts.rank),
													h("span", { className: "gd-card-suit" }, parts.suit)
												);
											})
										);
									})
								),
								h(
									"div",
									{ className: "gd-actions", key: "act" },
									h("button", { className: "gd-btn", onClick: onPlay, disabled: busy || !humanTurn || selected.length === 0 }, "出牌 (" + selected.length + ")"),
									h("button", { className: "gd-btn", onClick: onPass, disabled: busy || !humanTurn }, "过牌"),
									h("button", { className: "gd-btn", onClick: function () { setSelected([]); }, disabled: selected.length === 0 }, "清空"),
									h("button", { className: "gd-btn gd-end", onClick: onEnd, disabled: busy }, "结束"),
									h("span", { className: "gd-summary" }, "你 " + myCount + " 张 · 合法出牌 " + (game.legalCount || 0) + " 种" + (humanTurn ? " · 轮到你" : ""))
								),
								notes && notes.length ? h("div", { className: "gd-notes", key: "nt" }, notes.map(function (n, i) { return h("div", { key: i }, n); })) : null,
								error ? h("div", { className: "gd-error", key: "er" }, "⚠ " + error) : null
							]
						)
					: h("div", { className: "gd-empty", key: "empty" }, "正在加载牌局…")
			);
		}

		// ---- 侧边栏底部入口（与「插件市场」同排）----
		function GuandanTrigger(props) {
			return h(
				"button",
				{
					className: "gd-trigger",
					onClick: function () { gdSetOpen(true); },
					title: "打开掼蛋牌桌",
					style: props && props.wide ? { width: "100%" } : undefined
				},
				"🃏 掼蛋"
			);
		}

		// ---- 浮层牌桌 ----
		function GuandanOverlay() {
			var open = useGdOpen();
			if (!open) return null;
			var sessionId = sessionAccessor();
			return h(
				"div",
				{
					className: "gd-overlay",
					onClick: function (e) { if (e.target === e.currentTarget) gdSetOpen(false); }
				},
				h(
					"div",
					{ className: "gd-overlay-panel" },
					h("button", { className: "gd-close", onClick: function () { gdSetOpen(false); }, title: "关闭" }, "✕"),
					h(GuandanBoard, { sessionId: sessionId })
				)
			);
		}

		// ---- 插件设置卡（Web UI 插件组，可选）----
		function GuandanSettingsCard() {
			return h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 4px", fontSize: 13 } },
				h("span", {}, "🃏 掼蛋-中联储卫"),
				h("span", { className: "gd-summary" }, "4 人掼蛋 · 逢人配/进贡/升级完整规则"),
				h("button", { className: "gd-btn", onClick: function () { gdSetOpen(true); } }, "打开牌桌")
			);
		}

		// ---- 本地化 ----
		var NS = "guandan";
		var zh = { "board.title": "掼蛋-中联储卫", "board.new": "开局", "board.refresh": "刷新" };
		var en = { "board.title": "Guandan · Zhonglian", "board.new": "New game", "board.refresh": "Refresh" };

		// ---- 插件入口（浏览器半）----
		var inject = ["slots", "locale", "sessions"];

		function apply(ctx) {
			ctx.effect(function () {
				ctx.locale.register(NS, { zh: zh, en: en });
			}, "guandan: dictionaries");

			// 捕获当前会话 id 访问器（侧边栏/浮层是全局面，需从 sessions 服务取活动会话）
			sessionAccessor = function () {
				try {
					var sessions = ctx.get("sessions");
					var list = sessions && sessions.list;
					if (list && typeof list.getSnapshot === "function") {
						var snap = list.getSnapshot();
						return snap && snap.current !== undefined ? snap.current : undefined;
					}
					if (list && list.current !== undefined) return list.current;
				} catch (e) { /* 会话服务不可用时不取 id */ }
				return undefined;
			};

			ctx.inject(["slots"], function (scope) {
				// 1) 侧边栏底部入口（与「插件市场」同排）
				scope.slots.inject("sidebar.footer.action", function () {
					return scope.slots.register(
						{
							name: "sidebar.footer.action",
							id: "guandan-trigger",
							order: 10,
							label: "掼蛋"
						},
						GuandanTrigger
					);
				});
				// 2) 浮层牌桌
				scope.slots.inject("shell.overlay", function () {
					return scope.slots.register(
						{
							name: "shell.overlay",
							id: "guandan-panel",
							order: 10
						},
						GuandanOverlay
					);
				});
				// 3) 「Web UI 插件」组设置卡（家族插件存在时生效；注册失败不阻断）
				try {
					scope.slots.inject("web-ui.plugin.item", function () {
						return scope.slots.register(
							{
								name: "web-ui.plugin.item",
								id: "guandan",
								order: 105,
								locale: NS,
								inject: function () { return {}; }
							},
							GuandanSettingsCard
						);
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
