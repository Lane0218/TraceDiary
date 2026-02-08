# TraceDiary 协作代理规范（AGENTS）

## 1. 适用范围

- 本文档适用于本仓库内的全部开发任务、文档任务与缺陷修复任务。
- 本文档与 `SPEC.md` 同步使用；若两者冲突，以 `SPEC.md` 的产品与技术约束为准。

## 2. 对话与沟通语言

- AI 与用户对话必须使用中文。
- 任务说明、进度更新、风险提示、验收结论必须使用中文。
- 代码中的标识符保持英文；代码注释优先中文（第三方约定要求英文时除外）。

## 3. 工作流（强制）

1. 接收任务后先明确范围：目标、影响文件、验收标准。
2. 实施修改前，先在本文档的 TODO 清单中将对应任务标记为 `DOING`。
3. 完成代码修改后，必须执行完整测试（单元测试 + 集成测试 + E2E）。
4. 若任一测试失败，不得提交；必须先修复或标记 `BLOCKED` 并写明原因。
5. 全部测试通过后，立即提交 Git commit。
6. commit 完成后，立即 push 到远端分支。
7. 将 TODO 状态更新为 `DONE`，并记录完成日期、commit hash 与测试记录。
8. 向用户汇报：改动摘要、完整测试结果、commit hash、push 结果。

## 4. Commit 与 Push 规范（强制）

### 4.1 触发时机

- 每完成一个“代码修改任务”必须主动 `commit + push`，不得攒多个已完成任务再统一提交。
- 一个“代码修改任务”定义为：单一明确目标且可独立验收的一次改动。

### 4.2 commit message 规范

- 遵循 Conventional Commits：`<type>: <中文说明>`
- `type` 必须英文小写，推荐：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`
- 冒号后的说明必须中文，且直述结果，不写空泛描述。

示例：

- `feat: 新增年度总结编辑与存储流程`
- `fix: 修复多设备同步时的sha冲突判定`
- `docs: 更新AGENTS动态TODO清单`
- `test: 补充加密解密与参数升级单元测试`

### 4.3 提交前检查清单

- 改动文件与任务范围一致，无无关变更。
- 不包含敏感信息（Token、密码、明文隐私数据）。
- 对功能改动已完成单元测试、集成测试、E2E，且全部通过。
- TODO 状态已从 `DOING` 更新为 `DONE`（含 commit hash 与测试记录）。

## 5. TODO 动态更新规则（强制）

### 5.1 状态定义

- `TODO`：未开始
- `DOING`：进行中（同一时间最多 1 项）
- `DONE`：已完成、完整测试通过并已 commit+push
- `BLOCKED`：受阻（需标注阻塞原因）

### 5.2 记录格式

每条任务必须包含以下字段：

- `ID`：唯一编号（如 `TD-SEC-003`）
- `任务`：明确动作与对象
- `状态`：`TODO/DOING/DONE/BLOCKED`
- `验收标准`：可验证结果
- `关联文件`：预期变更文件路径
- `测试记录`：执行命令与结果摘要（至少包含单元/集成/E2E）
- `完成记录`：`YYYY-MM-DD / <commit-hash>`（未完成留空）

### 5.3 更新时机

- 开始任务：立刻标记为 `DOING`
- 完成并提交后：立刻标记为 `DONE`，写入日期与 commit hash
- 遇阻塞：立刻标记为 `BLOCKED` 并写明原因

### 5.4 测试红线

- 每个功能任务在标记 `DONE` 前，必须完成完整测试：单元测试、集成测试、E2E。
- 测试执行顺序建议：单元测试 -> 集成测试 -> E2E；任一步失败即停止提交流程。
- 如当前阶段确实无法自动化 E2E，必须先补充人工端到端验证步骤并写入 `测试记录`，且同步创建自动化 E2E 补齐任务。
- 仅文档改动可不执行 E2E，但需在汇报中明确“仅文档改动，无功能行为变化”。

## 6. 动态 TODO 清单（初始版）

> 说明：以下为基于 `SPEC.md` 的完整拆解清单。执行过程中必须持续更新状态与完成记录。

### 6.1 基础工程与项目骨架

- [ ] `ID: TD-BASE-001` 任务：初始化 React + TypeScript + Vite 工程骨架；状态：`TODO`；验收标准：可本地启动并渲染首页；关联文件：`package.json` `src/main.tsx` `src/App.tsx`；测试记录：；完成记录：
- [ ] `ID: TD-BASE-002` 任务：接入 Tailwind CSS 并配置基础样式；状态：`TODO`；验收标准：工具类生效且构建通过；关联文件：`tailwind.config.*` `src/index.css`；测试记录：；完成记录：
- [ ] `ID: TD-BASE-003` 任务：建立目录结构（components/pages/hooks/services/types/utils）；状态：`TODO`；验收标准：目录与 SPEC 对齐；关联文件：`src/`；测试记录：；完成记录：
- [ ] `ID: TD-BASE-004` 任务：配置 React Router 基础路由（welcome/calendar/editor/yearly-summary）；状态：`TODO`；验收标准：页面可路由跳转；关联文件：`src/App.tsx` `src/pages/*`；测试记录：；完成记录：
- [ ] `ID: TD-BASE-005` 任务：接入 TanStack Query 并提供全局 QueryClient；状态：`TODO`；验收标准：页面可使用 query/mutation；关联文件：`src/main.tsx`；测试记录：；完成记录：

### 6.2 认证、安全与密钥管理

- [ ] `ID: TD-SEC-001` 任务：实现首次欢迎页输入（Repo/Token/主密码）；状态：`TODO`；验收标准：表单校验通过后进入初始化流程；关联文件：`src/pages/welcome.tsx`；测试记录：；完成记录：
- [ ] `ID: TD-SEC-002` 任务：实现 Gitee 仓库访问校验；状态：`TODO`；验收标准：无效 Token/Repo 可提示错误；关联文件：`src/services/gitee.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SEC-003` 任务：实现 PBKDF2 动态迭代参数校准（200ms~500ms）；状态：`TODO`；验收标准：生成并持久化 `kdfParams`；关联文件：`src/services/crypto.ts` `src/types/config.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SEC-004` 任务：实现 AES-256-GCM 加解密工具（IV+ciphertext Base64）；状态：`TODO`；验收标准：加密后可无损解密；关联文件：`src/services/crypto.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SEC-005` 任务：实现 `encryptedToken` 存储与恢复；状态：`TODO`；验收标准：本地无 Token 明文；关联文件：`src/services/crypto.ts` `src/hooks/use-auth.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SEC-006` 任务：实现 7 天免输主密码机制（不存主密码明文）；状态：`TODO`；验收标准：过期后强制重输密码；关联文件：`src/hooks/use-auth.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SEC-007` 任务：实现 Token 解密失败/失效回退输入流程；状态：`TODO`；验收标准：失败时可补输并覆盖本地密文；关联文件：`src/pages/welcome.tsx` `src/hooks/use-auth.ts`；测试记录：；完成记录：

### 6.3 数据层与本地缓存

- [ ] `ID: TD-DATA-001` 任务：实现 IndexedDB 数据库与对象仓库（diaries/metadata/config）；状态：`TODO`；验收标准：可读写并按索引查询；关联文件：`src/services/indexeddb.ts`；测试记录：；完成记录：
- [ ] `ID: TD-DATA-002` 任务：实现 `DiaryEntry` 与 `MetadataEntry` 类型（含 yearly `year + date`）；状态：`TODO`；验收标准：类型与 SPEC 一致；关联文件：`src/types/diary.ts` `src/types/metadata.ts`；测试记录：；完成记录：
- [ ] `ID: TD-DATA-003` 任务：实现 metadata 本地解密缓存与远端 `metadata.json.enc` 同步；状态：`TODO`；验收标准：首次加载可拉取并解密；关联文件：`src/services/sync.ts`；测试记录：；完成记录：

### 6.4 核心功能：日历、编辑、年度总结、往年今日

- [ ] `ID: TD-FUNC-001` 任务：实现月历视图与月份切换；状态：`TODO`；验收标准：可切换任意月份并点击日期；关联文件：`src/components/calendar/*` `src/pages/calendar.tsx`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-002` 任务：集成 Milkdown 编辑器并支持基础 Markdown；状态：`TODO`；验收标准：可编辑标题/列表/任务列表；关联文件：`src/components/editor/*`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-003` 任务：实现日记创建/读取/编辑流程；状态：`TODO`；验收标准：按日期保存并可回显；关联文件：`src/pages/editor.tsx` `src/hooks/use-diary.ts`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-004` 任务：实现编辑实时写入 IndexedDB；状态：`TODO`；验收标准：刷新后本地内容不丢失；关联文件：`src/hooks/use-diary.ts`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-005` 任务：实现 30 秒防抖上传与手动保存立即上传；状态：`TODO`；验收标准：符合触发时机定义；关联文件：`src/hooks/use-sync.ts` `src/services/sync.ts`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-006` 任务：实现年度总结创建/编辑（`YYYY-summary.md.enc`）；状态：`TODO`；验收标准：可按年份管理总结；关联文件：`src/pages/yearly-summary.tsx`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-007` 任务：实现“往年今日”查询与预览；状态：`TODO`；验收标准：显示同月同日历史记录；关联文件：`src/components/history/*`；测试记录：；完成记录：
- [ ] `ID: TD-FUNC-008` 任务：实现“往年今日”虚拟滚动（react-window）；状态：`TODO`；验收标准：历史数据较多时滚动流畅；关联文件：`src/components/history/*`；测试记录：；完成记录：

### 6.5 同步与冲突解决

- [ ] `ID: TD-SYNC-001` 任务：封装 Gitee 文件读取与写入（优先 Authorization）；状态：`TODO`；验收标准：支持 contents API 拉取与更新；关联文件：`src/services/gitee.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SYNC-002` 任务：实现上传前 SHA 预检与 `expectedSha` CAS 更新；状态：`TODO`；验收标准：更新请求携带正确 `sha`；关联文件：`src/services/sync.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SYNC-003` 任务：实现 `sha mismatch` 冲突识别；状态：`TODO`；验收标准：冲突可被稳定检测；关联文件：`src/services/sync.ts`；测试记录：；完成记录：
- [ ] `ID: TD-SYNC-004` 任务：实现冲突弹窗（本地/远端/合并）；状态：`TODO`；验收标准：三种分支均可完成；关联文件：`src/components/common/*` `src/pages/editor.tsx`；测试记录：；完成记录：
- [ ] `ID: TD-SYNC-005` 任务：实现离线检测与网络恢复自动重试；状态：`TODO`；验收标准：断网有提示，恢复后自动同步；关联文件：`src/hooks/use-sync.ts`；测试记录：；完成记录：

### 6.6 PWA、部署与安全头

- [ ] `ID: TD-PWA-001` 任务：配置 Vite PWA、manifest 与图标资源；状态：`TODO`；验收标准：可安装到主屏幕；关联文件：`vite.config.*` `public/manifest.json`；测试记录：；完成记录：
- [ ] `ID: TD-PWA-002` 任务：配置 Service Worker 缓存策略（应用壳缓存、日记 NetworkOnly）；状态：`TODO`；验收标准：离线可见壳，不缓存日记内容；关联文件：`vite.config.*`；测试记录：；完成记录：
- [ ] `ID: TD-DEP-001` 任务：配置 `vercel.json` 安全响应头（CSP/HSTS/Referrer/Permissions）；状态：`TODO`；验收标准：响应头符合 SPEC；关联文件：`vercel.json`；测试记录：；完成记录：
- [ ] `ID: TD-DEP-002` 任务：补充入口访问控制部署说明（Cloudflare Access/Vercel/Basic Auth）；状态：`TODO`；验收标准：部署文档可执行；关联文件：`README.md` `SPEC.md`；测试记录：；完成记录：

### 6.7 测试与验收

- [ ] `ID: TD-TEST-001` 任务：加密与 KDF 参数升级单元测试；状态：`TODO`；验收标准：核心分支覆盖并通过；关联文件：`src/services/__tests__/*`；测试记录：；完成记录：
- [ ] `ID: TD-TEST-002` 任务：同步与冲突（CAS/sha mismatch）单元测试；状态：`TODO`；验收标准：冲突分支断言完整；关联文件：`src/services/__tests__/*`；测试记录：；完成记录：
- [ ] `ID: TD-TEST-003` 任务：认证流程集成测试（首次/7天内/过期/Token失效）；状态：`TODO`；验收标准：4 条流程均通过；关联文件：`src/hooks/__tests__/*`；测试记录：；完成记录：
- [ ] `ID: TD-TEST-004` 任务：关键用户流程 E2E（创建、编辑、同步、冲突）；状态：`TODO`；验收标准：核心链路自动化通过；关联文件：`e2e/*`；测试记录：；完成记录：
- [ ] `ID: TD-TEST-005` 任务：性能验收（加载、切换日期、往年今日、输入延迟）；状态：`TODO`；验收标准：满足 SPEC 指标；关联文件：`test-report/*`；测试记录：；完成记录：
- [ ] `ID: TD-TEST-006` 任务：兼容性验收（Chrome/Edge/Safari/Firefox/安卓/iOS）；状态：`TODO`；验收标准：验收清单全部勾选；关联文件：`docs/compatibility-report.md`；测试记录：；完成记录：
