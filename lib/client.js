// client.js — 掼蛋-中联储卫（GUANDAN-中联储卫）浏览器半（V3.0：iframe 托管服务器版前端）
// 浮层内嵌 iframe 加载插件自托管的服务器版完整 UI（/guandan/web/index.html），
// 前端 100% 与独立服务器同源（6 按钮组牌/60秒/新AI/房间联机全部可用），
// 传 ?api=/guandan/api 让前端走插件路由，传 ?session= 与 guandan_* 工具共享同一张牌局表。
// 入口：sidebar.footer.action 侧边栏入口 / shell.overlay 浮层 / web-ui.plugin.item 插件卡
window.__ModuleLoader__.load({
	id: "@zhonglianchuwei/dsh-guandan",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var react = require("react");
		var useState = react.useState;
		var useEffect = react.useEffect;
		var h = react.createElement;

		// ---- 样式（仅浮层外壳；牌桌本体样式由 iframe 内 web/style.css 提供） ----
		var STYLE_ID = "@zhonglianchuwei/dsh-guandan/shell.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "@zhonglianchuwei/dsh-guandan";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = [
				".gd-trigger{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--dsw-alias-label-secondary,#ccc);font:inherit;cursor:pointer;padding:6px 10px;border-radius:8px;text-align:left}",
				".gd-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.1));color:#fff}",
				".gd-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}",
				".gd-overlay-panel{background:linear-gradient(160deg,#14532d,#0f3d22 55%,#0a2a18);color:#f0f0f0;border:1px solid rgba(255,255,255,.18);border-radius:16px;width:min(880px,96vw);max-height:94vh;overflow:auto;padding:12px 14px;position:relative;box-shadow:0 16px 50px rgba(0,0,0,.6)}",
				".gd-close{position:absolute;top:10px;right:14px;cursor:pointer;background:rgba(255,255,255,.12);border:none;color:#fff;font:inherit;font-size:18px;padding:4px 10px;border-radius:8px;z-index:3}",
				".gd-close:hover{background:rgba(255,255,255,.25)}",
				".gd-btn{font:inherit;cursor:pointer;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.14);color:#fff;border-radius:10px;padding:7px 14px}",
				".gd-btn:hover{background:rgba(255,255,255,.26)}",
				".gd-hint{color:#a9c4b4;font-size:12px;margin:0}"
			].join("");
			document.head.appendChild(tag);
		}

		// ---- 音效（WebAudio 合成） ----
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

		// ---- 牌桌（iframe 加载插件自托管的服务器版前端） ----
		function GuandanBoard(props) {
			var sessionId = props && props.sessionId;
			var src = "/guandan/web/index.html?api=/guandan/api";
			if (sessionId) src += "&session=" + encodeURIComponent(sessionId);
			return h("iframe", {
				key: "gd-board-iframe",
				src: src,
				style: { width: "100%", height: "80vh", border: "none", borderRadius: "12px", background: "#0a2a18", display: "block" },
				title: "掼蛋-中联储卫牌桌"
			});
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
				h("span", { className: "gd-hint", style: { margin: 0 } }, "4 人掼蛋 · 逢人配/进贡/升级完整规则 · 组牌/房间联机"),
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
