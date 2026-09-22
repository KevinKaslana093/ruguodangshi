# 「如果当时」— 互动剧情平台 开发契约（SPEC v1，冻结）

> 本文件是第二独立工程的共享接口与目录归属约定。冻结后不再更改结构；批量内容生产依赖本版本。
> 工程根：`<工程根>\`
> 与「梗一下」（`.../2026-09-20/w/work/gengxia`，端口 8765）完全独立：不共用目录、数据库、端口、进程。
> 本开发不修改 Hermes 全局默认配置。

## 1. 组件与端口

| 组件 | 位置 | 端口/形态 | 说明 |
|---|---|---|---|
| 播放器（正式产品） | `player/`（发布时成为 `publish/`） | 静态，本地预览 8790 | 纯静态：HTML/CSS/JS/JSON，无密钥、无生成接口 |
| 本地静态预览服务 | `server/serve.cjs` | 127.0.0.1:8790 | 仅开发/验收预览用；产品本身可直接静态托管 |
| 内部生产工具 | `tools/`（**不进入发布包**） | CLI（node） | 调用模型生产内容、审核、导出、校验、断点恢复、用量记录 |
| 内容库 | `content/` | 文件 | 版本化 JSON；`content/stories/*.json` 为正式故事 |
| 发布包 | `publish/` | 静态目录 | 播放器 + index.json + 故事文件 + 本地素材，无任何密钥 |
| 离线整包 | `outputs/如果当时-离线包.zip` | 含微型本地服务器 | 解压即可离线玩全部已发布故事 |

预算与上限（见 `content/budget.json`）：请求数上限、token 上限、截止时间、每批上限、连续失败阈值自动暂停、`content/PAUSE` 文件停止开关。
额度口径：服务返回 `usage` 时记录实际 token；**余额无法通过接口查询 → 标注未知**，只依据本地累计记录与用户预算设限。不虚报。

## 2. 故事文件 schema v1（冻结）

正式故事为单个 JSON 文件。schemaVersion 固定为 `1`。

```jsonc
{
  "schemaVersion": 1,
  "storyId": "sc-0001",              // 稳定公开 ID（^sc-[0-9]{4}$），用于路由与文件名
  "contentVersion": 3,               // 内容修订号，同 ID 重发时 +1
  "title": "…",                       // 4–24 个字符
  "genreId": "office",               // 8 个题材之一（schema.js GENRES）
  "tagline": "…",                     // ≤48 字，卡片一句话
  "summary": "…",                     // 60–140 字，简介
  "estimatedMinutes": 4,             // 3–6
  "cover": { "pattern": "grid", "hue": 208 },   // pattern ∈ grid|dots|lines|waves|rings|arc
  "tags": ["加班", "改稿"],          // 2–5 个，每个 ≤6 字
  "characters": [                    // 2–6 个
    { "id": "c1", "name": "凯哥", "desc": "…≤30 字" }
  ],
  "vars": [],                        // 首版空数组；需要状态时见 §4
  "startNodeId": "n1",
  "endings": [                       // ≥3 个；kind 两两不同
    { "id": "e1", "nodeId": "n8", "title": "…≤14 字", "kind": "happy" }
  ],
  "nodes": [
    {
      "id": "n1",                    // ^n[0-9]{1,3}$，唯一
      "label": "上午 · 会议室",       // 可选，≤14 字，场景提示
      "text": "…",                   // 正文：目标 60–140 字；硬限 40–180 字
      "choices": [                   // 非结局节点 2–3 个；结局节点必须无 choices
        { "text": "…",               // 4–24 字；同节点内不重复
          "to": "n2",
          "if": [],                  // 可选条件（§4）
          "effects": [] }            // 可选效果（§4）
      ]
    },
    { "id": "n8", "text": "…", "ending": { "id": "e1", "title": "…", "kind": "happy" } }
  ],
  "meta": {
    "createdAt": "ISO8601",
    "generatedBy": "tools/content/produce.cjs@1",
    "reviewStatus": "passed",        // 仅通过全部审核的故事进入公开库
    "contentSources": "原创虚构，未使用未授权私人素材",
    "pipeline": { "proposalId": "…", "editorPass": true, "pathReviewPass": true, "fixRounds": 0 }
  }
}
```

硬性结构规则（`shared/validate.js` 运行时校验，播放器加载时也执行）：

- DAG：无环（v1）；所有节点从 start 可达；所有结局节点可达。
- 非结局节点有 2–3 个可用选项；结局节点无选项、必须带 `ending`。
- 每条路径长度 5–12 个节点；总节点数 8–40（A 档精品 12–20）。
- 同节点选项文字不重复；同一故事内节点正文不得完全重复。
- **伪分支检测**：两个选项指向不同节点、但其后继子树全文签名相同时判失败。
- 结局实质区别：标题/正文互不相同，kind 两两不同（≥3 结局），正文两两相似度 < 0.6。
- 正文与选项禁止 HTML 尖括号、脚本、真实手机号/邮箱等隐私样式（隐私防护）。
- 所有发布节点必须能从起点在**带状态**语义下到达（§4），非结局节点在**任意可达状态**下不得出现无可用选项的死路。

旧故事兼容规则：`schemaVersion` 不同的文件按各自版本规则校验与加载；v1 冻结后，后续版本必须以 v2 递增并保留 v1 读取路径。批量生产前已冻结，不因批量内容修改本结构。

## 3. 路径与覆盖（程序 vs 模型分开统计）

- 程序遍历：路径数 ≤128 时**穷举**全部路径；超过 128 时改为有界遍历（BFS 覆盖所有 (节点,状态) 组合 + 采样路径），报告必须写明「穷举」或「覆盖 + 采样，覆盖节点 x/y、边 a/b」，不得把抽样宣称成穷举。
- 模型路径审核：独立请求逐条读实际路径文本，输出结构化 issues；与程序遍历分开记录（`content/review/<id>-paths.json` vs `reports/coverage.json`）。

## 4. 状态（有限枚举 + 声明式条件，禁止任意表达式）

- `vars`: `[{ "id": "trust", "type": "int", "min": 0, "max": 3 }]` 或 `{ "type": "enum", "values": ["a","b","c"] }` 或 `{ "type": "bool" }`；最多 4 个变量；状态空间乘积 ≤ 4096。
- 选项 `if`: `[{ "var": "trust", "op": "gte|eq|ne|lte|in", "value": 2 }]`；效果 `effects`: `[{ "var": "trust", "set": 2 }]`。只允许白名单变量与枚举取值，**无表达式求值、无代码执行**。
- 验证器枚举可达 (节点, 标志状态) 组合，检查真实可达性、死路与结局可达；播放器运行时与验证器共用同一份 `runtime.js` 语义。

## 5. 进度与分享

- 进度：`localStorage["rd.progress.<storyId>"]` = `{schemaVersion:1, storyId, contentVersion, nodeId, flags, visited[], choices[{nodeId,choiceIndex,choiceText}], ended}`；恢复时校验节点/变量合法性，非法则安全重开并提示。
- 分享：哈希路由 `#/s/<storyId>`；链接不含原始故事、编辑凭据或任何密钥。静态深链直接打开故事卡并可进入。

## 6. 目录归属（并行分工）

| 归属 | 路径 | 负责人 |
|---|---|---|
| 共享结构（冻结后只由主代理改） | `shared/`、`SPEC.md` | 主代理 |
| 播放器（阅读/选择/进度/结算/分享/手机） | `player/` | 播放器工作包 |
| 本地预览服务、索引构建 | `server/`、`tools/build-index.cjs` | 主代理 |
| 内容生产工具（生成/审核/导出/恢复/用量） | `tools/content/`、`content/drafts|proposals|review|usage|plans` | 生产工具工作包 |
| 正式故事 | `content/stories/`（仅程序写入，须通过全部检查） | 流水线 |
| 验证 | `tools/verify/`、`tests/`、`reports/` | 验证工作包 |
| 发布包/离线包 | `publish/`、`outputs/` | 主代理（发布前移除凭据并实测阻断模型访问） |

公共结构变更必须由主代理统一合并；各工作包不得写他人目录。

## 7. 流水线阶段（每个正式故事）

1. 策划：3 个不同核心冲突提案 → 选 1（`content/proposals/`）。
2. 结构 + 对白一次成稿（12–20 节点，≥3 结局，1 次模型请求）。
3. 程序检查：`shared/validate.js`（结构/引用/可达/死路/长度/伪分支/相似度）。
4. 独立编辑审核：新请求、独立上下文，输出结构化 issues（动机、时间线、已知信息、选择后果）。
5. 路径审核：把程序穷举出的实际路径文本交给独立请求逐条读，输出 issues。
6. 定点修复：仅改失败节点与必要相邻节点；**每个故事最多 2 轮完整修复**；仍失败 → `content/quarantine/` 记录原因，不进入公开库。
7. 通过 → 写入 `content/stories/<storyId>.json`，更新索引与用量记录。

重点故事（A 档 8 个）：各自展开 2 个完整候选版本，程序评分对比后保留更好的一版。

## 8. 首版不做

支付、账号、社交关注、实时多人、开放式聊天、公开编辑入口、在线 AI 生成入口、图片/配音/视频生成（封面用 CSS/SVG 程序绘制）、伪造热度与评分。
