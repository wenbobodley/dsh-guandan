# 🃏 掼蛋-中联储卫（GUANDAN-中联储卫）· Guandan Card Game for DSH

> **中文** · [English](#english) | DeepSeek Harness (DSH) 掼蛋扑克牌插件 · 4 人两副牌 · 完整规则
> A full-featured Guandan (Chinese climbing card game) plugin for DeepSeek Harness — 4 players, 2 decks, complete rules. V3+ shares the same table UI with the standalone server.

---

## ✨ 功能亮点 / Features

### 中文

- **完整规则**：逢人配（红桃级牌万能、**不可单独出**）、连对（恰 3 对）、钢板（恰 2 三张）、
  三带二（不含王对）、顺子（级牌可参与）、同花顺、炸弹 4-8 张、天王炸（四王）、
  进贡/还贡/抗贡、接风、双下、升级 2→A（过 A 需头游且升级≥2）
- **4 人局**：你坐 1 家（「卫」），其余 3 家牌友（中 / 联 / 储）自动行牌
- **智能机器人（V3）**：拿牌权第一（压不过用炸弹炸）、对家配合（不压对家/帮压回）、
  防对手走完（剩 1-5 张避开同张数）、炸弹冲刺（剩≤3 张拿牌权）、组牌领出（优先复合牌型）
- **图形牌桌（V3，与独立服务器同源）**：底部 6 按钮（出/过/组/解/清/关）、组牌识别、
  真人 60 秒 / 机器人 5 秒限时、出牌中徽标、局结束排名停留 + 手动下一局、底牌公开
- **多人房间**：建房/输码加入/选座/开局/机器人补位/真人超时自动过/局结束手动续局
- **4 个工具**：`guandan_new` 开局 / `guandan_state` 看牌局 / `guandan_play` 出牌或过 / `guandan_hint` 查合法出牌
- **双模式同局**：UI 直连与 Agent 工具共用同一张牌局表

### English

- **Complete rules**: wild-card rank (red-heart level card, **cannot be played alone**), triple-pairs (exactly 3 consecutive pairs), steel plates (2 consecutive triples), three-with-two (no joker pairs), straights (level card participates), straight flush, bombs (4-8 cards), joker bomb (4 jokers), tribute/return/anti-tribute, wind relay, double-loss, level-up 2→A
- **4-player game**: you sit one seat, 3 bot partners play automatically
- **Smart bots (V3)**: priority on taking the lead (bomb when can't beat), partner cooperation, blocks opponents near finish, bomb sprint when ≤3 cards left, combo lead
- **Table UI (V3, same source as standalone server)**: 6 bottom buttons (play/pass/group/ungroup/clear/close), combo recognition, 60s human / 5s bot timers, "playing" badge, round-end ranking pause + manual next round, revealed bottom cards
- **Multiplayer rooms**: create/join/select-seat/start/bot-fill/timeout-auto-pass/manual-next-round
- **4 tools**: `guandan_new` / `guandan_state` / `guandan_play` / `guandan_hint`
- **Shared table**: UI and agent tools operate the same game

---

## 📦 安装 / Installation

### 中文

```bash
dsh plugin --profile web add @zhonglianchuwei/dsh-guandan
```

重启 dsh web 后，在任意会话中让 Agent 开局：

```
我们打一局掼蛋（掼蛋-中联储卫）
```

### English

```bash
dsh plugin --profile web add @zhonglianchuwei/dsh-guandan
```

Restart `dsh web`, then ask the agent to start a game:

```
Let's play a game of Guandan (掼蛋-中联储卫)
```

---

## 🛠 工具用法 / Tools

| 工具 / Tool | 作用 / Purpose |
|---|---|
| `guandan_new(seat?)` | 开新一局；seat 指定你坐的位置（默认 0，队友为 2 号位）/ Start a new game; seat defaults 0 (partner seat 2) |
| `guandan_state()` | 当前局面：手牌/级牌/轮到谁/场上最大/合法动作数 / Current state: hand/level/turn/max/legal count |
| `guandan_play(cards\|pass)` | 出牌（如 `"H2 H2 S2"`）或过牌（`pass: true`）/ Play cards or pass |
| `guandan_hint()` | 列出全部合法出牌（含牌型）/ List all legal plays with types |

---

## 🎮 图形界面 / GUI (V3)

### 中文

安装并重启 web 后，**左侧边栏底部**出现「🃏 掼蛋」入口（与「插件市场」同排）：
- 点击打开**浮层牌桌**（全屏遮罩 + 居中面板）
- 浮层内嵌 iframe 加载插件自托管前端，与独立服务器**完全一致**：东南西北牌桌、6 按钮、
  组牌识别、60 秒限时、出牌中徽标、局结束排名停留、手动下一局、末游底牌公开
- 牌局状态与工具**完全共享**

### English

After install & restart, a **🃏 掼蛋** entry appears at the bottom of the left sidebar:
- Click to open the **overlay table** (fullscreen mask + centered panel)
- The overlay embeds an iframe loading the plugin-hosted frontend — **identical** to the standalone server: 4-direction table, 6 buttons, combo recognition, 60s timers, "playing" badge, round-end ranking pause, manual next round, revealed bottom cards
- Table state is **fully shared** with the agent tools

---

## 📐 规则速览 / Rules Quick Reference

- 比牌 / Card order: 大王 Big Joker > 小王 Little Joker > 级牌 Level card > A > K > … > 3 > 2
- 逢人配 / Wild: 每局红桃级牌为万能牌 / red-heart level card is wild (**can't be played alone**)
- 连对 / Triple pairs: 恰好 3 个连续对子 / exactly 3 consecutive pairs (AA2233 … QQKKAA)
- 钢板 / Steel plates: 恰好 2 个连续三张 / exactly 2 consecutive triples (AAA222 … KKKAAA)
- 天王炸 / Joker bomb: 4 王（2 小 + 2 大）/ 4 jokers; 双王只是一对 / two jokers = a pair only
- 顺子 / Straight: 5 张连续 / 5 consecutive (A2345 … TJQKA)
- 炸弹压制一切非炸弹 / Bomb beats all non-bombs; 同花顺压顺子 / straight flush beats straight

---

## 🎵 背景音乐 / Background Music

### 中文

- 包内自带缺省音乐 `00-guandan.mp3`（播放列表第一位）
- 把 MP3/OGG/M4A/WAV/FLAC/AMR 放入 `web/bgm/` 即可自行添加（点"🎵"开启，⏭ 切歌，再点关闭；关闭不影响打牌音效）

### English

- Ships with default music `00-guandan.mp3` (first in playlist)
- Drop MP3/OGG/M4A/WAV/FLAC/AMR into `web/bgm/` to add your own (🎵 toggle on/off, ⏭ next track; closing music does not affect game sound effects)

---

## 📜 版本 / Version History

- **V3 (3.0.0)**: table UI same-source with standalone server (iframe-hosted `web/`), smart bots, 6-button grouping, 60s timers, room APIs
- **V2.1 (2.1.x)**: UI entry relocation (sidebar bottom + overlay + plugin card)
- **V2 (2.0.x)**: graphical table UI (tools + `/guandan/*` routes + browser panel)
- **V1 (1.0.0)**: initial chat-tool release

变更见 [CHANGELOG.md](CHANGELOG.md) / See [CHANGELOG.md](CHANGELOG.md) for changes.

---

## 🔧 开发 / Development

```bash
node lib/test.js   # 引擎自测（牌型/合法动作/整局模拟）/ engine self-test
```

---

## 🏆 独立服务器 / Standalone Server

想不装插件、手机直接玩？独立公网服务器版（同款 UI + AI）：
Want to play directly on phone without the plugin? The standalone public server (same UI + AI):

```
本地/Local:  http://127.0.0.1:8787
局域网/LAN:  http://<本机IP>:8787
公网/Public: ngrok/端口转发指向 8787
```

仓库同源代码见 `guandan-server/`（本仓库）或独立发布。

---

## License

Apache-2.0. 规则引擎改编自 / Engine adapted from [AltmanD/Guandan](https://github.com/AltmanD/Guandan)
（Lu Yudong / Yu Yan），见 / see NOTICE. 品牌「掼蛋-中联储卫 / GUANDAN-中联储卫」归品牌方所有 / brand owned by the brand owner.
