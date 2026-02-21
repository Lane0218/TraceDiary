# TraceDiary 协作代理规范（AGENTS）

## 1. 适用范围

- 本文档适用于本仓库内的全部开发任务、文档任务与缺陷修复任务。
- 本文档与 `SPEC.md` 同步使用；若两者冲突，以 `SPEC.md` 为准。

## 2. 对话与沟通语言

- AI 与用户对话必须使用中文。
- 任务说明、进度更新、风险提示、验收结论必须使用中文。
- 代码标识符保持英文；代码注释优先中文（第三方约定要求英文时除外）。

## 3. 执行流程（强制）

1. 接收任务后先明确范围：目标、影响文件、验收标准。
2. 判定是否属于“同一任务语义”：
   - 同一任务语义（包括已 `DONE` 后被打回）：不得新建任务；沿用原任务文件，必要时 `DONE -> DOING`。
   - 新任务语义：按第 4 节新建任务文件并置为 `DOING`。
3. 实施改动，并持续更新任务文件中的 `related_files`、`test_record`、`updated_at`。
4. 按第 7 节执行测试；任一步失败即停止提交流程。
5. 测试通过后，按第 6 节执行 `commit + push`。
6. 任务收尾时将状态更新为 `DONE` 或 `BLOCKED`，并补齐完成记录。
7. 向用户汇报：改动摘要、测试结果（含是否执行全量 E2E）、commit hash、push 结果。

## 4. 任务文件规范（强制）

### 4.1 存放位置与单文件原则

- 目录：`todo/tasks/`
- 文件名：`<task_uid>.json`
- 一个任务只对应一个文件；同一任务跨多轮对话必须复用同一文件。

### 4.2 ID 规则（避免并行冲突）

- `task_uid`：`td_<utc14>_<rand8hex>`，示例：`td_20260221174530_a1b2c3d4`。
- `display_id`：`TD-<CAT>-<utc8>-<utc6>-<rand4>`，示例：`TD-DOC-20260221-174530-A1B2`。
- `id_prefix`：必须等于 `<CAT>`。
- `<CAT>` 推荐集合：`BASE|SEC|SYNC|UI|DOC|TEST|DEP|DATA|AUTH|CLOUD|FUNC|IMP|OPS|OTHER`。

### 4.3 必填字段与格式

- 必填键：`task_uid`、`display_id`、`id_prefix`、`status`、`title`、`acceptance`、`related_files`、`test_record`、`done_record`、`updated_at`、`version`。
- 推荐键：`module_key`、`module_name`、`module_label`、`order`、`source`。
- `status` 仅允许：`TODO|DOING|DONE|BLOCKED`。
- `done_record` 格式：`YYYY-MM-DD / <short-hash|pending>`（日期按北京时间）。
- `updated_at` 格式：UTC ISO 8601，例如 `2026-02-21T09:45:30.000Z`。
- `version` 从 `1` 开始。

```json
{
  "task_uid": "td_20260221174530_a1b2c3d4",
  "display_id": "TD-DOC-20260221-174530-A1B2",
  "id_prefix": "DOC",
  "module_key": "6.10",
  "module_name": "文档维护",
  "module_label": "6.10 文档维护",
  "order": 20260221174530,
  "status": "DOING",
  "title": "补充 AGENTS 任务创建规范并消除歧义",
  "acceptance": "创建位置、文件名、字段、时间格式、并行写入规则均明确且无冲突",
  "related_files": [
    "AGENTS.md"
  ],
  "test_record": "",
  "done_record": "",
  "source": {
    "file": "AGENTS.md",
    "line": 1
  },
  "version": 1,
  "updated_at": "2026-02-21T09:45:30.000Z"
}
```

### 4.4 状态更新时机

- 开始新任务：新建任务文件并标记为 `DOING`。
- 同任务返工：沿用原文件，必要时 `DONE -> DOING`。
- 同任务连续小步修正：只更新同一文件，不新建任务。
- 遇阻塞：标记 `BLOCKED`，并在 `test_record` 写清阻塞原因。
- 完成任务：标记 `DONE`，写入 `done_record` 与测试摘要。
- 若提交前无法写入最终 hash，`done_record` 可先写 `pending`，下一轮同任务优先补齐。

### 4.5 并行协作写入规则

- 同一任务文件同一时刻只允许一个主 agent 写入（单写者规则）。
- 子 agent 不直接修改 `todo/tasks/*.json`，只向主 agent 回传结果。
- 多主 agent 并行时，每个 agent 只创建/修改自己的任务文件，禁止同时编辑同一文件。

## 5. 动态看板

- `todo/tasks/*.json` 是唯一任务真相源。
- `todo/board.html` 仅用于展示，不作为写入源。
- 默认使用 `npm run todo:board` 启动看板服务；页面按 3 秒轮询自动刷新。
- 若未通过看板服务访问（例如直接 `file://` 打开），不保证可看到实时任务更新。
- 若文档与任务文件不一致，以任务文件为准，并在同次提交修复。

## 6. Commit 与 Push 规范（强制）

### 6.1 触发时机

- 每完成一个可独立验收的代码修改任务，必须执行一次 `commit + push`。

### 6.2 Commit Message

- 使用 Conventional Commits：`<type>: <中文说明>`。
- `type` 限定：`feat|fix|docs|refactor|test|chore`。

### 6.3 提交前检查

- 改动文件与任务范围一致，无无关变更。
- 不包含敏感信息（Token、密码、明文隐私数据）。
- 测试满足第 7 节要求。
- 任务文件状态与测试记录已更新。

## 7. 测试执行策略（默认分层）

### 7.1 默认命令

- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`
- 与改动直接相关的 E2E：`npm run test:e2e:fast`、`npm run test:e2e:changed`、`--grep` 或定向 spec。

### 7.2 风险分级

- 低风险（仅注释或纯文档）：可不执行自动化测试；`test_record` 必须写“仅文档改动，无功能行为变化”。
- 中风险（单模块逻辑或 UI 交互）：执行默认命令 + 定向 E2E。
- 高风险（认证/同步/加解密/跨模块）：执行默认命令 + 定向 `@remote/@slow`。

### 7.3 必跑全量 E2E

- 合并到主分支前。
- 发布前（预发布与正式发布）。
- 触达认证/同步/加解密主链路且影响跨模块。

### 7.4 例外

- 用户明确授权缩小范围时，可裁剪 E2E；但不得低于 `lint + unit + integration + 直接相关 E2E`。
- 汇报与 `test_record` 必须写明：已执行项、未执行项、用户授权依据。
