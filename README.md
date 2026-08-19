# 🃏 掼蛋-中联储卫（GUANDAN-中联储卫）

DeepSeek Harness（DSH）掼蛋扑克牌插件 · 4 人两副牌 · 完整规则

> 在对话里直接和 Agent 打掼蛋：Agent 帮你出牌、校验合法性、自动推进机器人回合。

## 功能

- **完整规则**：逢人配（红桃级牌万能、**不可单独出**）、连对（恰 3 对）、钢板（恰 2 三张）、
  三带二（不含王对）、顺子（级牌可参与）、同花顺、炸弹 4-8 张、天王炸（四王）、
  进贡/还贡/抗贡、接风、双下、升级 2→A（过 A 需头游且升级≥2）
- **4 人局**：你坐 1 家，其余 3 家由机器人自动行牌
- **4 个工具**：`guandan_new` 开局 / `guandan_state` 看牌局 / `guandan_play` 出牌或过 / `guandan_hint` 查合法出牌
- **多局制**：一局结束自动进贡并开下一局，直到过 A 通关

## 安装

```bash
dsh plugin --profile web add @zhonglianchuwei/dsh-guandan
```

重启 dsh web 后，在任意会话中让 Agent 开局：

```
我们打一局掼蛋（掼蛋-中联储卫）
```

Agent 会调用 `guandan_new` 开局，此后你说"出 334455"、"过"等，Agent 调用工具完成行牌。

## 工具用法

| 工具 | 作用 |
|---|---|
| `guandan_new(seat?)` | 开新一局；seat 指定你坐的位置（默认 0，队友为 2 号位） |
| `guandan_state()` | 当前局面：手牌/级牌/轮到谁/场上最大/合法动作数 |
| `guandan_play(cards\|pass)` | 出牌（如 `"H2 H2 S2"`）或过牌（`pass: true`） |
| `guandan_hint()` | 列出全部合法出牌（含牌型） |

## 规则速览

- 比牌：大王 > 小王 > 级牌 > A > K > … > 3 > 2（2 最小，级牌最高）
- 逢人配：每局红桃级牌为万能牌，可当任意牌（不可替代大小王，**不能单独出**）
- 连对：恰好 3 个连续对子（AA2233 … QQKKAA）
- 钢板：恰好 2 个连续三张（AAA222 … KKKAAA）
- 天王炸：4 个王（2 小王 + 2 大王）；双王只是一对
- 顺子：5 张连续（A2345 … TJQKA），级牌可自然参与
- 炸弹压制一切非炸弹；同花顺压顺子、输给 6 张及以上炸弹

## 版本

当前 **V1（1.0.0）**。变更见 [CHANGELOG.md](CHANGELOG.md)。后续 **V2** 将在此基础上迭代更新（规则扩展 / AI 增强 / UI 面板等），版本号相应升级。

## 开发

```bash
node lib/test.js   # 引擎自测（牌型/合法动作/整局模拟）
```

## License

Apache-2.0。规则引擎改编自 [AltmanD/Guandan](https://github.com/AltmanD/Guandan)
（Lu Yudong / Yu Yan），见 NOTICE。品牌「掼蛋-中联储卫 / GUANDAN-中联储卫」归品牌方所有。
