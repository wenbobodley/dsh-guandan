// client.js — 掼蛋-中联储卫（GUANDAN-中联储卫）浏览器半（V2）
// 手写 loader 包裹的 React 牌桌（免构建链，直接以官方 __ModuleLoader__ 契约输出）。
// 挂在官方 conversation.input.dock 槽位（输入框上方的条带），展开后是完整牌桌：
//   开局 / 点牌出牌 / 过牌 / 刷新；数据经同源 /guandan/api/* 路由（host 半提供）。
// 与 guandan_* 工具共享同一张牌局表：UI 点牌 == Agent 调工具，同一局牌。
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
				".gd-board{font-size:13px;line-height:1.5}",
				".gd-bar{display:flex;align-items:center;gap:8px;padding:4px 8px;flex-wrap:wrap}",
				".gd-btn{font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l3,#444);background:var(--dsw-alias-interactive-bg-hover,transparent);color:var(--dsw-alias-label-primary,inherit);border-radius:6px;padding:2px 10px}",
				".gd-btn:disabled{opacity:.5;cursor:default}",
				".gd-title-btn{font-weight:600}",
				".gd-summary{color:var(--dsw-alias-label-tertiary,#888)}",
				".gd-panel{border:1px solid var(--dsw-alias-border-l3,#333);border-radius:10px;padding:8px 10px;margin:4px 8px;background:var(--dsw-alias-surface-mid,transparent)}",
				".gd-status{font-weight:600;margin-bottom:4px}",
				".gd-opp{display:flex;gap:12px;margin:4px 0;color:var(--dsw-alias-label-secondary,#aaa)}",
				".gd-max{margin:4px 0;color:var(--dsw-alias-label-secondary,#aaa)}",
				".gd-hist{max-height:90px;overflow:auto;margin:4px 0;color:var(--dsw-alias-label-tertiary,#888);font-size:12px}",
				".gd-hand{margin:6px 0 2px;display:flex;flex-wrap:wrap;gap:4px}",
				".gd-group{display:flex;gap:2px;margin-right:6px;align-items:center}",
				".gd-rank{opacity:.55;font-size:11px;margin-right:2px}",
				".gd-card{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:38px;border:1px solid var(--dsw-alias-border-l3,#555);border-radius:5px;background:var(--dsw-alias-surface-mid,#fff);cursor:pointer;user-select:none;padding:0 4px;box-shadow:0 1px 2px rgba(0,0,0,.2)}",
				".gd-card.sel{outline:2px solid #3b82f6;transform:translateY(-4px)}",
				".gd-red{color:#e5534b}.gd-black{color:var(--dsw-alias-label-primary,#111)}",
				".gd-actions{display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap}",
				".gd-notes{color:var(--dsw-alias-label-tertiary,#888);font-size:12px;margin-top:4px;max-height:70px;overflow:auto}",
				".gd-error{color:#e5534b;margin-top:4px;font-size:12px}",
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
		function commaStr(s) {
			return typeof s === "string" ? s.split(",") : [];
		}

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

		// ---- 主组件：dock 条带 + 可展开牌桌 ----
		function GuandanBoard(props) {
			var sessionId = props && props.sessionId;
			var [game, setGame] = useState(null);
			var [notes, setNotes] = useState([]);
			var [busy, setBusy] = useState(false);
			var [error, setError] = useState(null);
			var [selected, setSelected] = useState([]);
			var [expanded, setExpanded] = useState(false);

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

			function toggle(card) {
				setSelected(function (prev) {
					var at = prev.indexOf(card);
					return at >= 0 ? prev.filter(function (x) { return x !== card; }) : prev.concat([card]);
				});
			}

			// 我的牌：按点数降序分组
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
				else statusText = "轮到：" + (game.waitingIsHuman ? "你" : game.waitingName) + " · 级牌 " + game.level + "（逢人配 ♥" + game.level + "）";
			}

			return h(
				"div",
				{ className: "gd-board" },
				h(
					"div",
					{ className: "gd-bar" },
					h(
						"button",
						{ className: "gd-btn gd-title-btn", onClick: function () { setExpanded(!expanded); }, title: "展开/收起牌桌" },
						"🃏 掼蛋-中联储卫" + (game ? " · 第" + game.round + "局" : "") + (expanded ? " ▲" : " ▼")
					),
					!expanded && game ? h("span", { className: "gd-summary", key: "sum" }, "级牌 " + game.level + " · 轮到：" + (game.waitingIsHuman ? "你" : game.waitingName) + " · 你 " + myCount + " 张") : null,
					h("button", { className: "gd-btn", onClick: onNew, disabled: busy }, "开局"),
					h("button", { className: "gd-btn", onClick: onRefresh, disabled: busy }, "刷新")
				),
				expanded && game
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
												return h(
													"span",
													{
														className: "gd-card" + (selected.indexOf(c) >= 0 ? " sel" : "") + " " + (isRed(c) ? "gd-red" : "gd-black"),
														key: c,
														onClick: function () { toggle(c); },
														title: c
													},
													cardLabel(c)
												);
											})
										);
									})
								),
								game.hands && game.hands.length ? h("div", { className: "gd-empty", key: "cnt" }, "你 " + myCount + " 张 · 合法出牌 " + game.legalCount + " 种" + (game.legalCount ? "（可点牌后出）" : "")) : null,
								h(
									"div",
									{ className: "gd-actions", key: "act" },
									h("button", { className: "gd-btn", onClick: onPlay, disabled: busy || !humanTurn || selected.length === 0 }, "出牌 (" + selected.length + ")"),
									h("button", { className: "gd-btn", onClick: onPass, disabled: busy || !humanTurn }, "过牌"),
									h("button", { className: "gd-btn", onClick: function () { setSelected([]); }, disabled: selected.length === 0 }, "清空"),
									h("span", { className: "gd-summary" }, humanTurn ? "轮到你" : "机器人行牌中")
								),
								notes && notes.length ? h("div", { className: "gd-notes", key: "nt" }, notes.map(function (n, i) { return h("div", { key: i }, n); })) : null,
								error ? h("div", { className: "gd-error", key: "er" }, "⚠ " + error) : null
							]
						)
					: null
			);
		}

		// ---- 本地化字典 ----
		var NS = "guandan";
		var zh = { "board.title": "掼蛋-中联储卫", "board.new": "开局", "board.refresh": "刷新" };
		var en = { "board.title": "Guandan · Zhonglian", "board.new": "New game", "board.refresh": "Refresh" };

		// ---- 插件入口（浏览器半）----
		var inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(function () {
				ctx.locale.register(NS, { zh: zh, en: en });
			}, "guandan: dictionaries");
			ctx.inject(["slots"], function (scope) {
				scope.slots.inject("conversation.input.dock", function () {
					return scope.slots.register(
						{
							name: "conversation.input.dock",
							id: "guandan-board",
							order: 88,
							locale: NS,
							inject: function () {
								return {};
							}
						},
						GuandanBoard
					);
				});
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.GuandanBoard = GuandanBoard;
		return module.exports;
	}
});
