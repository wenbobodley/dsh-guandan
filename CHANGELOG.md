# Changelog

本插件遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：V1 系列为 `1.x.x`，后续大版本为 `2.x.x`，小版本 `1.1.x` 等。

## [2.1.0] - V2.1：UI 入口重定位（侧边栏 + 浮层）

### 变更

- **牌桌入口从输入框 dock 移出**（用户反馈：条带位置不搭，菜单应放插件区）：
  - `sidebar.footer.action` —— 侧边栏底部入口「🃏 掼蛋」，与「插件市场」同排（官方 dsh-market 同款槽位）
  - `shell.overlay` —— 浮层牌桌：全屏遮罩 + 居中面板，✕ / 点遮罩关闭（官方 dsh-market 同款槽位）
  - `web-ui.plugin.item` —— 「Web UI 插件」组设置卡，可一键打开牌桌（家族插件存在时生效，注册失败自动跳过）
- 不再占用 `conversation.input.dock`（输入框不再出现掼蛋条带）
- 浮层为全局面，当前会话 id 从 `sessions.list.getSnapshot().current` 获取（活动会话）

### 测试

- 冒烟自测 35 → 39 项：客户端槽位断言更新（sidebar.footer.action / shell.overlay /
  web-ui.plugin.item 注册 + 明确「不再占用输入框 dock」）

## [2.0.2] - 修复：工具 parameters 必须是标准 JSON Schema

### 修复

- **根因**：`guandan_state` / `guandan_hint` 的 `parameters` 传了空对象 `{}`。
  DSH 工具注册表的硬性要求：**每个工具的 `parameters` 必须是标准 JSON Schema，
  显式 `type: "object"` + `properties` + `required`**。空对象无法推断 `type`，
  启动时报 `Invalid schema for function 'guandan_hint': schema must be a JSON
  Schema of 'type: "object"', got 'type: null'`。
- **修复**：4 个工具的 `parameters` 全部改为
  `{ type: "object", properties: {...}, required: [] }`；`output.schema` 同步补全
  显式 `type: "object"` 与 `text` 属性。

### 测试

- 冒烟自测 33 → 35 项：新增 2 项工具 schema 标准格式回归（parameters 与 output.schema
  必须 `type:"object"`），此类问题今后启动前即被拦截。

## [2.0.1] - 修复：webServer 注入时机导致 DSH 启动崩溃

### 修复

- **根因**：V2 在 `apply()` 中直接访问 `ctx.webServer`，但 webServer 不在注入声明中。
  cordis 的上下文守卫在 webServer 服务 fiber 未就绪时访问即抛
  `cannot get property 'webServer' without inject`，导致 DSH 启动失败。
- **修复（方案一：`ctx.inject` 延迟注入）**：
  - 静态 `inject` 只保留 `['tools']`（apply 阶段必需）
  - 路由注册移入 `ctx.inject(['webServer'], (inner) => { ... })` —— cordis 保证
    webServer 服务就绪后才执行回调，回调内访问 `inner.webServer` 不会触发注入守卫
  - 回调内保留 try/catch 防御降级 + 全局挂载标记（同包双实例只挂一次路由）
  - 等价替代方案二 `ctx.on('webServer/ready', ...)` 已在注释中说明，采用方案一

### 测试

- 冒烟自测 27 → 33 项：新增 6 项注入守卫回归（cordis 风格守卫 ctx 模拟
  `without inject` 抛错语义：inject 就绪不抛错 / webServer 缺失不抛错 / 重复 apply 只挂一次）
- 真实 cordis 宿主集成验证 `integration-check.mjs`（本地一次性，不打入发布包）：
  最小 Context + `provide('tools'/'webServer')` + `app.plugin(本插件)` —— 注入解析、
  4 工具注册、`/guandan` 路由注册（经 ctx.inject 回调）、`GET /guandan/api/state` 真实响应，
  7/7 通过

## [2.0.0] - V2：图形界面

在 V1 对话工具基础上加入**浏览器牌桌 UI**，实现双端插件（host 半 + browser 半）。

### 新增

- **浏览器牌桌（双端插件）**：
  - 包声明 `dsh.client { platform: 'web', inject: [slots, locale] }` + `exports["./client"]`
  - `lib/client.js`：手写 `__ModuleLoader__` 契约的 React 牌桌（免构建链），挂在官方
    `conversation.input.dock` 槽位（输入框上方条带，可展开/收起）
  - 牌桌显示：三家对手张数、级牌/逢人配、当前最大牌、最近出牌、你的手牌（按点数分组、
    可点击选中）、出牌/过牌/清空/开局/刷新按钮、机器人行牌记录
- **`/guandan/*` host 路由层**（`lib/host-routes.js`，浏览器直连）：
  - `GET /guandan/api/state`（局面快照）/ `POST /guandan/api/new`（开局）/
    `POST /guandan/api/play`（出牌或过，自动接续机器人）/ `POST /guandan/api/hint`（合法动作）
  - JSON envelope 风格与 aionui-panel 一致；无 webServer 环境自动降级为纯工具
- **双模式同局**：`lib/games.js` 会话级牌局表被工具层与路由层共享 —— UI 点牌与 Agent 调工具
  打的是同一局牌
- **模块重构**：出牌/过牌/自动推进逻辑抽到 `lib/playflow.js`，工具与路由共用

### 测试

- 引擎自测 49 项（不变）
- 冒烟自测 10 → 27 项：新增路由层（state/new/play/hint/404/降级/注册）与客户端 bundle
  （`__ModuleLoader__` 注册、apply/inject、dock 槽位注册）

## [1.0.0] - V1 首发

掼蛋-中联储卫（GUANDAN-中联储卫）DeepSeek Harness 插件首版发布。

### 功能

- 4 人两副牌（108 张）标准掼蛋，人机对战：你坐 1 家，其余 3 家机器人自动行牌
- 完整规则引擎（JS 移植自 AltmanD/Guandan，Apache-2.0）：
  - 逢人配：红桃级牌为万能牌，**不能单独出**，可补对子/顺子/同花顺/炸弹等
  - 连对：恰好 3 连对（AA2233 … QQKKAA），4 连对/2 连对不合法
  - 钢板：恰好 2 个连续三张（AAA222 最小 … KKKAAA）
  - 三带二：三张 + 一对，不允许用大小王作对
  - 顺子：5 张（A2345 … TJQKA），级牌可自然参与
  - 同花顺、炸弹 4-8 张、天王炸（四王）
  - 比牌：大王 > 小王 > 级牌 > A > K > … > 3 > 2
  - 贡牌：进贡（单下/双下）、还贡（≤10 点且非级牌非王）、抗贡（双大王）
  - 升级：2 → A，双下升 3 级、头游+三游升 2 级、头游+末游升 1 级，过 A 需头游且升幅 ≥2
- 4 个 DSH 工具：`guandan_new` / `guandan_state` / `guandan_play` / `guandan_hint`
- 多局制：一局结束自动进贡并续开下一局，直到过 A 通关
- 输入宽容：支持完整牌面（`H2 H2 S2` / `♠3 ♥4` / 中文花色）与纯点数写法（`334455` / `10JQKA`）

### 修复（相对 V1 前身 0.1.0 骨架）

- 逢人配不能单独出（实战规则确认：仅剩 ♥2 时不可单出/成对单出，会卡成末游）
- 多局自动续局：此前 README 声明"自动进贡并开下一局"但未实现，现于机器人回合循环内自动推进
- 修复玩家只剩逢人配被迫过牌时 `advanceTurn` 牌权回退为 null 的空指针风险

### 测试

- `node lib/test.js`：规则引擎自测（牌型/逢人配/比牌/整局模拟至过 A/输入解析）
- `node lib/smoke.js`：工具层冒烟（4 工具注册与执行、非法出牌拒绝）
