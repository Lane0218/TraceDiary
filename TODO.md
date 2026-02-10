# TraceDiary 动态 TODO 清单

> 说明：本清单由 AGENTS 拆分而来，作为唯一任务状态源。

> 说明：以下为基于 `SPEC.md` 的完整拆解清单。执行过程中必须持续更新状态与完成记录。

## 0. 快速看板

- 更新时间：`2026-02-10`
- 总任务：`71`
- 状态统计：`DONE=57` / `DOING=0` / `TODO=14` / `BLOCKED=0`
- 当前进行中：`无`

## 1. 任务清单（按模块）

### 6.1 基础工程与项目骨架

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-BASE-001` | `DONE` | 初始化 React + TypeScript + Vite 工程骨架 | 可本地启动并渲染首页 | `package.json` `src/main.tsx` `src/App.tsx` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`timeout 10s npm run dev -- --host 127.0.0.1 --port 4174 --strictPort` 启动成功（Vite ready） | `2026-02-08 / 74e583b` |
| `TD-BASE-002` | `DONE` | 接入 Tailwind CSS 并配置基础样式 | 工具类生效且构建通过 | `tailwind.config.*` `src/index.css` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`npm run build` 通过 | `2026-02-08 / 064c39d` |
| `TD-BASE-003` | `DONE` | 建立目录结构（components/pages/hooks/services/types/utils） | 目录与 SPEC 对齐 | `src/` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过 | `2026-02-08 / 94001ac` |
| `TD-BASE-004` | `DONE` | 配置 React Router 基础路由（welcome/calendar/editor/yearly-summary） | 页面可路由跳转 | `src/App.tsx` `src/pages/*` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / 252a896` |
| `TD-BASE-005` | `DONE` | 接入 TanStack Query 并提供全局 QueryClient | 页面可使用 query/mutation | `src/main.tsx` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（2/2）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / 4613379` |

### 6.2 认证、安全与密钥管理

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-SEC-001` | `DONE` | 实现首次欢迎页输入（Repo/Token/主密码） | 表单校验通过后进入初始化流程 | `src/pages/welcome.tsx` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |
| `TD-SEC-002` | `DONE` | 实现 Gitee 仓库访问校验 | 无效 Token/Repo 可提示错误 | `src/services/gitee.ts` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |
| `TD-SEC-003` | `DONE` | 实现 PBKDF2 动态迭代参数校准（200ms~500ms） | 生成并持久化 `kdfParams` | `src/services/crypto.ts` `src/types/config.ts` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |
| `TD-SEC-004` | `DONE` | 实现 AES-256-GCM 加解密工具（IV+ciphertext Base64） | 加密后可无损解密 | `src/services/crypto.ts` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |
| `TD-SEC-005` | `DONE` | 实现 `encryptedToken` 存储与恢复 | 本地无 Token 明文 | `src/services/crypto.ts` `src/hooks/use-auth.ts` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |
| `TD-SEC-006` | `DONE` | 实现 7 天免输主密码机制（不存主密码明文） | 过期后强制重输密码 | `src/hooks/use-auth.ts` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |
| `TD-SEC-007` | `DONE` | 实现 Token 解密失败/失效回退输入流程 | 失败时可补输并覆盖本地密文 | `src/pages/welcome.tsx` `src/hooks/use-auth.ts` | `npm run test:unit` 通过（13/13）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / cb09c7f` |

### 6.3 数据层与本地缓存

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-DATA-001` | `DONE` | 实现 IndexedDB 数据库与对象仓库（diaries/metadata/config） | 可读写并按索引查询 | `src/services/indexeddb.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / f4ddb11` |
| `TD-DATA-002` | `DONE` | 实现 `DiaryEntry` 与 `MetadataEntry` 类型（含 yearly `year + date`） | 类型与 SPEC 一致 | `src/types/diary.ts` `src/types/metadata.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / f4ddb11` |
| `TD-DATA-003` | `DONE` | 实现 metadata 本地解密缓存与远端 `metadata.json.enc` 同步 | 首次加载可拉取并解密 | `src/services/sync.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（6/6）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / f4ddb11` |

### 6.4 核心功能：日历、编辑、年度总结、往年今日

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-FUNC-001` | `DONE` | 实现月历视图与月份切换 | 可切换任意月份并点击日期 | `src/components/calendar/*` `src/pages/calendar.tsx` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-002` | `DONE` | 集成 Milkdown 编辑器并支持基础 Markdown | 可编辑标题/列表/任务列表 | `src/components/editor/*` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-003` | `DONE` | 实现日记创建/读取/编辑流程 | 按日期保存并可回显 | `src/pages/editor.tsx` `src/hooks/use-diary.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-004` | `DONE` | 实现编辑实时写入 IndexedDB | 刷新后本地内容不丢失 | `src/hooks/use-diary.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-005` | `DONE` | 实现 30 秒防抖上传与手动保存立即上传 | 符合触发时机定义 | `src/hooks/use-sync.ts` `src/services/sync.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-006` | `DONE` | 实现年度总结创建/编辑（`YYYY-summary.md.enc`） | 可按年份管理总结 | `src/pages/yearly-summary.tsx` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-007` | `DONE` | 实现“往年今日”查询与预览 | 显示同月同日历史记录 | `src/components/history/*` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |
| `TD-FUNC-008` | `DONE` | 实现“往年今日”虚拟滚动（react-window） | 历史数据较多时滚动流畅 | `src/components/history/*` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-08 / a71bf95` |

### 6.5 同步与冲突解决

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-SYNC-001` | `DONE` | 封装 Gitee 文件读取与写入（优先 Authorization） | 支持 contents API 拉取与更新 | `src/services/gitee.ts` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（26/26）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 5a2eb1c` |
| `TD-SYNC-002` | `DONE` | 实现上传前 SHA 预检与 `expectedSha` CAS 更新 | 更新请求携带正确 `sha` | `src/services/sync.ts` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（26/26）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 247234f` |
| `TD-SYNC-003` | `DONE` | 实现 `sha mismatch` 冲突识别 | 冲突可被稳定检测 | `src/services/sync.ts` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（26/26）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 247234f` |
| `TD-SYNC-004` | `DONE` | 实现冲突弹窗（本地/远端/合并） | 三种分支均可完成 | `src/components/common/*` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/services/sync.ts` `src/hooks/use-sync.ts` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（26/26）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 0616277` |
| `TD-SYNC-005` | `DONE` | 实现离线检测与网络恢复自动重试 | 断网有提示，恢复后自动同步 | `src/hooks/use-sync.ts` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（26/26）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / c991e44` |
| `TD-SYNC-006` | `DONE` | 修复日期切换内容错位并提升云端上传可用性反馈（不含加密改造） | 标题日期与编辑器内容一致；未解锁/未配置时给出明确不可上传提示；手动上传失败可读 | `src/hooks/use-diary.ts` `src/components/editor/markdown-editor.tsx` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/hooks/use-sync.ts` `src/__tests__/*` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（28/28）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / cb7823e` |
| `TD-SYNC-007` | `DONE` | 修复 Gitee 默认分支与写入方法导致的同步失败，并补齐可暴露该问题的测试 | 默认分支兼容 `master`；可配置分支；手动与自动上传可成功；测试可覆盖真实失败原因 | `src/types/config.ts` `src/hooks/use-auth.ts` `src/components/auth/auth-modal.tsx` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/services/gitee.ts` `src/services/sync.ts` `src/services/__tests__/*` `src/hooks/__tests__/*` `scripts/e2e-smoke.sh` | `npm run test:unit` 通过（37/37）；`npm run test:integration` 通过（29/29）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / b87ead4` |
| `TD-SYNC-008` | `DONE` | 手动上传失败原因改为按钮旁内联提示，并返回可消费的手动上传结果 | 手动点击失败时在按钮旁显示具体原因；自动上传失败不占用该提示位；日记与年度总结页行为一致 | `src/hooks/use-sync.ts` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/hooks/__tests__/use-sync.test.ts` `src/__tests__/integration/*` | `npm run test:unit` 通过（37/37）；`npm run test:integration` 通过（30/30）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 932ab2c` |
| `TD-SYNC-009` | `DONE` | 修复手动上传在并发场景下静默失败（禁止并发并提供明确反馈） | 上传进行中点击手动按钮会给出“请稍候”提示且不静默；按钮在同步中禁用；失败分支均有可消费错误信息 | `src/hooks/use-sync.ts` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/hooks/__tests__/use-sync.test.ts` `src/__tests__/integration/editor.integration.test.tsx` | `npm run test:unit` 通过（37/37）；`npm run test:integration` 通过（32/32）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-09 / c5cbdf2` |
| `TD-SYNC-010` | `DONE` | 修复上传分支不匹配导致的持续失败并增强失败可观测性 | 配置分支不存在时可自动回退到可用分支并上传成功；手动与自动失败原因可见且不被静默覆盖 | `src/services/sync.ts` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/services/__tests__/sync.test.ts` `src/__tests__/integration/editor.integration.test.tsx` | `npm run test:unit` 通过（38/38）；`npm run test:integration` 通过（32/32）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-09 / 996b21d` |
| `TD-SYNC-011` | `DONE` | 修复上传请求卡死导致长期处于 syncing 的问题（增加超时保护） | 上传请求超时后应自动结束 syncing 并给出明确错误；后续手动上传可继续触发；不再长期显示“正在上传” | `src/hooks/use-sync.ts` `src/hooks/__tests__/use-sync.test.ts` | `npm run test:unit` 通过（38/38）；`npm run test:integration` 通过（33/33）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-09 / 78152db` |
| `TD-SYNC-012` | `DONE` | 修复失败后排队任务持续重入导致同步长时间不退出的问题 | 上传失败/超时后不应立刻重启下一轮上传；busy 提示在退出 syncing 后自动清理；状态可恢复到可重试 | `src/hooks/use-sync.ts` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/hooks/__tests__/use-sync.test.ts` | `npm run test:unit` 通过（38/38）；`npm run test:integration` 通过（33/33）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-09 / 07de517` |
| `TD-SYNC-013` | `DONE` | 修复同步中手动上传按钮无响应（移除 disabled 并保留忙碌反馈） | 同步中按钮可点击；点击后立刻提示“当前正在上传，请稍候重试”；不再出现无响应体感 | `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/__tests__/integration/editor.integration.test.tsx` | `npm run test:unit` 通过（38/38）；`npm run test:integration` 通过（33/33）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-09 / 87ed64f` |
| `TD-SYNC-014` | `DONE` | 增强手动上传点击反馈可见性（点击即显示已触发状态） | 每次点击手动上传都应立即出现可见反馈，且 busy/失败信息不被自动隐藏 | `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/__tests__/integration/editor.integration.test.tsx` | `npm run test:unit` 通过（38/38）；`npm run test:integration` 通过（33/33）；`npm run test:e2e` 通过；`npm run lint` 通过；`npm run build` 通过 | `2026-02-09 / 6c7962f` |
| `TD-SYNC-015` | `DONE` | 修复同步可靠性与加密模型一致性问题（队列保留/冲突解密/CAS方法/主密码派生密钥） | 失败后保留并可重放最新排队 payload；冲突展示远端明文且不双重加密；metadata CAS 更新使用 PUT；日记数据密钥改为主密码派生并贯通上传链路 | `src/hooks/use-sync.ts` `src/hooks/__tests__/use-sync.test.ts` `src/services/sync.ts` `src/services/__tests__/sync.test.ts` `src/hooks/use-auth.ts` `src/hooks/__tests__/use-auth.test.tsx` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` | `npm run test:unit` 通过（42/42）；`npm run test:integration` 通过（35/35）；`npm run test:e2e` 通过（7/7）；`npm run lint` 通过 | `2026-02-09 / 1fcf734` |
| `TD-SYNC-016` | `DONE` | 修复自动解锁后缺少数据加密密钥导致手动上传异常，并增强同步状态可观测性 | 自动解锁后可直接手动上传；并发触发“请稍候重试”不会在非上传中状态残留；状态区可区分是否存在未提交改动 | `src/hooks/use-auth.ts` `src/services/crypto.ts` `src/hooks/use-sync.ts` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/hooks/__tests__/use-auth.test.tsx` | `npm run test:unit` 通过（43/43）；`npm run test:integration` 通过（39/39）；`npm run test:e2e` 通过（17/17）；`npx playwright test e2e/specs/manual-sync-success.spec.ts e2e/specs/manual-sync-busy-clear.spec.ts e2e/specs/daily-edit.spec.ts --project=chromium --repeat-each=3 --retries=0` 通过（9/9）；`npm run build` 通过；`npm run lint` 失败（仓库既有问题：`e2e/helpers/conflict.ts:247 no-unsafe-finally`） | `2026-02-10 / 4578a86` |
| `TD-SYNC-017` | `DONE` | 修复自动同步成功后“最近同步时间”未更新并补齐端到端回归用例 | 自动同步成功后“最近同步”应刷新为最新时间；同页连续两次成功同步时后一次时间严格晚于前一次；新增 E2E 用例稳定通过 | `src/hooks/use-sync.ts` `src/pages/workspace.tsx` `e2e/specs/auto-sync-last-synced.spec.ts` | `npm run test:unit` 通过（43/43）；`npm run test:integration` 通过（40/40）；`npm run test:e2e` 通过（17 passed，1 flaky 重试通过）；`npx playwright test e2e/specs/auto-sync-last-synced.spec.ts --project=chromium --repeat-each=3 --retries=0` 通过（3/3） | `2026-02-10 / ff12550` |
| `TD-SYNC-018` | `DONE` | 新增“手动上传成功后状态应收敛”端到端回归用例（覆盖 pending 提示消失后仍待同步风险） | 点击“手动保存并立即上传”后应先出现“手动上传已触发，正在等待结果...”，随后提示消失；远端上传成功后页面状态应为“云端已同步”且“未提交改动：无” | `e2e/specs/manual-sync-state-consistency.spec.ts` `TODO.md` | `npx playwright test e2e/specs/manual-sync-state-consistency.spec.ts --project=chromium --retries=0` 通过（1/1）；`npx playwright test e2e/specs/manual-sync-state-consistency.spec.ts --project=chromium --repeat-each=3 --retries=0` 通过（3/3）；`npm run test:unit` 通过（43/43）；`npm run test:integration` 通过（40/40）；`npm run test:e2e` 通过（19/19） | `2026-02-10 / 382f07b` |
| `TD-SYNC-019` | `DONE` | 修复手动上传后状态不收敛（自动上传悬挂导致长期 syncing）并补齐去重与超时回归测试 | 手动上传成功后若触发同内容自动上传不应重复请求；自动上传悬挂时应在超时后退出 syncing 并给出可重试错误；状态可恢复并与远端结果一致 | `src/hooks/use-sync.ts` `src/hooks/__tests__/use-sync.test.ts` `src/__tests__/integration/editor.integration.test.tsx` `e2e/specs/manual-sync-hang-guard.spec.ts` `e2e/specs/auto-sync-last-synced.spec.ts` `TODO.md` | `npm run test:unit` 通过（43/43）；`npm run test:integration` 通过（43/43）；`npx playwright test e2e/specs/manual-sync-hang-guard.spec.ts --project=chromium --retries=0` 通过（1/1）；`npx playwright test e2e/specs/auto-sync-last-synced.spec.ts --project=chromium --retries=0` 通过（1/1）；`npm run test:e2e` 通过（20/20） | `2026-02-10 / 4a20958` |
| `TD-SYNC-020` | `DONE` | 落地服务层最小重构（收敛 Base64/UTF-8、统一 metadata 走 Gitee 网关、固化 sync/gitee 职责边界，并统一测试入口） | `sync.ts` 不再维护重复文本 Base64 实现且 metadata 读写不直接发起 contents API；`gitee.ts` 作为唯一 Gitee 网关；测试入口统一为 `src/__tests__/` 且单元/集成/E2E 全部通过 | `src/services/sync.ts` `src/services/gitee.ts` `src/services/__tests__/sync.test.ts` `src/test/setup.ts` `src/__tests__/setup.ts` `vitest.config.ts` `TODO.md` | `npm run test:unit` 通过（48/48）；`npm run test:integration` 通过（43/43）；`npm run test:e2e` 通过（19 passed，1 flaky 重试通过，网络超时后重试成功）；`npm run lint` 失败（仓库既有问题：`e2e/helpers/conflict.ts:247 no-unsafe-finally`）；`npm run build` 通过 | `2026-02-10 / 9733c4e` |
| `TD-SYNC-021` | `DONE` | 清理跨层重复实现（同步状态/手动上传文案、认证表单结构、crypto/sync 基础工具）并收敛公共模块 | `workspace/yearly-summary` 共享同步状态与手动上传文案逻辑；`welcome/auth-modal` 共享认证表单配置；`sync.ts` 不再重复实现可复用的 crypto 基础工具；单元/集成/E2E 全部通过 | `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/components/common/status-hint.tsx` `src/utils/sync-availability.ts` `src/utils/sync-presentation.ts` `src/pages/welcome.tsx` `src/components/auth/auth-modal.tsx` `src/components/auth/auth-form-model.ts` `src/components/auth/auth-form-shared.tsx` `src/services/sync.ts` `src/services/crypto.ts` `src/services/__tests__/sync.test.ts` `TODO.md` | `npm run test:unit` 通过（48/48）；`npm run test:integration` 通过（43/43）；`npm run test:e2e` 通过（20/20）；`npm run lint` 失败（仓库既有问题：`e2e/helpers/conflict.ts:247 no-unsafe-finally`）；`npm run build` 通过 | `2026-02-10 / da84ae1` |

### 6.6 PWA、部署与安全头

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-PWA-001` | `TODO` | 配置 Vite PWA、manifest 与图标资源 | 可安装到主屏幕 | `vite.config.*` `public/manifest.json` | — | — |
| `TD-PWA-002` | `TODO` | 配置 Service Worker 缓存策略（应用壳缓存、日记 NetworkOnly） | 离线可见壳，不缓存日记内容 | `vite.config.*` | — | — |
| `TD-DEP-001` | `TODO` | 配置 `vercel.json` 安全响应头（CSP/HSTS/Referrer/Permissions） | 响应头符合 SPEC | `vercel.json` | — | — |
| `TD-DEP-002` | `TODO` | 补充入口访问控制部署说明（Cloudflare Access/Vercel/Basic Auth） | 部署文档可执行 | `README.md` `SPEC.md` | — | — |

### 6.7 测试与验收

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-TEST-001` | `TODO` | 加密与 KDF 参数升级单元测试 | 核心分支覆盖并通过 | `src/services/__tests__/*` | — | — |
| `TD-TEST-002` | `TODO` | 同步与冲突（CAS/sha mismatch）单元测试 | 冲突分支断言完整 | `src/services/__tests__/*` | — | — |
| `TD-TEST-003` | `TODO` | 认证流程集成测试（首次/7天内/过期/Token失效） | 4 条流程均通过 | `src/hooks/__tests__/*` | — | — |
| `TD-TEST-004` | `DONE` | 关键用户流程 E2E（创建、编辑、同步、冲突） | 核心链路自动化通过 | `e2e/*` | `npm run lint` 通过；`npm run test:unit` 通过（39/39）；`npm run test:integration` 通过（33/33）；`npm run test:e2e` 通过（7/7） | `2026-02-09 / f474348` |
| `TD-TEST-005` | `TODO` | 性能验收（加载、切换日期、往年今日、输入延迟） | 满足 SPEC 指标 | `test-report/*` | — | — |
| `TD-TEST-006` | `TODO` | 兼容性验收（Chrome/Edge/Safari/Firefox/安卓/iOS） | 验收清单全部勾选 | `docs/compatibility-report.md` | — | — |
| `TD-TEST-007` | `DONE` | 补齐 Playwright 端到端关键验收场景（冲突三分支与再冲突、自动重试、年度总结、认证后续、日历导航、安全关键项） | 新增/改造 E2E 用例并通过完整测试（单元/集成/E2E） | `e2e/specs/*` `e2e/fixtures/*` `e2e/helpers/*` | `npm run test:unit` 通过（42/42）；`npm run test:integration` 通过（35/35）；`npm run test:e2e` 通过（17/17）；`npm run lint` 通过 | `2026-02-09 / a58cc80` |
| `TD-TEST-008` | `DONE` | 修复 E2E 假阳性与冲突时序风险（metadata 应用链路断言 + 手动上传使用持久化快照） | metadata 加密断言基于应用真实上传链路；手动上传与冲突流程在快速输入场景下保持一致性并通过完整测试 | `src/services/sync.ts` `src/hooks/use-diary.ts` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/hooks/__tests__/*` `src/__tests__/integration/*` `e2e/specs/*` | `npm run test:unit` 通过（43/43）；`npm run test:integration` 通过（36/36）；`npm run test:e2e` 通过（17/17）；`npx playwright test e2e/specs/conflict-resolution.spec.ts --project=chromium` 通过（4/4） | `2026-02-09 / 165cd5f` |
| `TD-TEST-009` | `DONE` | 修复冲突 E2E 长跑不稳定（认证重试 + 同步状态收敛 + 冲突注入可观测性） | `conflict-resolution` 在高重复执行下不再因认证抖动或同步状态长期卡住导致失败；日志可区分预写失败与目标请求未触发 | `e2e/fixtures/app.ts` `e2e/specs/conflict-resolution.spec.ts` `e2e/helpers/conflict.ts` `src/hooks/use-sync.ts` | `npm run test:unit` 通过（43/43）；`npm run test:integration` 通过（36/36）；`npm run test:e2e` 通过（17/17）；`npx playwright test e2e/specs/conflict-resolution.spec.ts --project=chromium --repeat-each=3 --retries=0` 通过（12/12）；`npx playwright test e2e/specs/conflict-resolution.spec.ts --project=chromium --repeat-each=10 --retries=0` 通过（40/40） | `2026-02-10 / 769aa47` |

### 6.8 UI 体验优化

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-UI-001` | `DONE` | 提供极简专业风的布局与交互原型 HTML | 可在浏览器中演示导航切换、月份切换与状态反馈逻辑 | `docs/ui-layout-prototype.html` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过 | `2026-02-08 / c45592a` |
| `TD-UI-002` | `DONE` | 调整原型为“欢迎弹层 + 单页工作台（日历与日记/年度总结同屏）” | 欢迎流程以弹层演示，主页面仅保留一个工作台并可切换日记/年度总结 | `docs/ui-layout-prototype.html` `src/hooks/use-diary.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过 | `2026-02-08 / 4a4ff1c` |
| `TD-UI-003` | `DONE` | 落地 blog 同源风格并重构为单页工作台（欢迎弹层 + 日历/日记/年度总结同屏） | 默认进入工作台；认证以弹层呈现；视觉风格与 blog 一致；旧路由可兼容跳转 | `src/App.tsx` `src/index.css` `tailwind.config.js` `src/pages/workspace.tsx` `src/components/auth/*` `src/components/calendar/*` `src/components/history/*` `src/components/editor/*` `src/__tests__/integration/*` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-08 / 661051b` |
| `TD-UI-004` | `DONE` | 精修工作台视觉层级、工具条编排、状态反馈与弹层细节 | 主次区域更清晰；工具条分层；状态可感知；弹层模式切换和错误区更稳定；移动端布局更稳 | `src/pages/workspace.tsx` `src/components/auth/auth-modal.tsx` `src/components/calendar/month-calendar.tsx` `src/components/history/on-this-day-list.tsx` `src/index.css` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / b426bbd` |
| `TD-UI-005` | `DONE` | 收敛日期入口：移除双日期输入框并新增“月标题点击年月选择” | 删除指定文案；无“当前日期/查询日期”输入框；可通过月标题弹层选择年月并联动编辑与往年今日 | `src/pages/workspace.tsx` `src/components/calendar/month-calendar.tsx` `src/pages/calendar.tsx` `src/__tests__/integration/app.integration.test.tsx` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 9ae8d0e` |
| `TD-UI-006` | `DONE` | 优化工作台信息简化与左侧结构（移除条目ID/冗余描述，分离往年今日卡片，缩小日历日期格） | 不显示条目ID；“往年今日”无附加解释文案；往年今日独立于日历卡片；日期格尺寸更紧凑 | `src/pages/workspace.tsx` `src/components/calendar/month-calendar.tsx` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 6f2fe9a` |
| `TD-UI-007` | `DONE` | 重构“日记主页面 + 年度总结独立页”信息架构（移除同级 Tab，新增 `/yearly/:year` 长时写作页与年终提示） | 工作台仅保留日记编辑；可从按钮和年终提示进入年度总结独立页；年度总结支持按自然年切换与保存；返回日记不丢失上下文 | `src/App.tsx` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/pages/calendar.tsx` `src/__tests__/integration/*` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 8d66a0b` |

### 6.9 数据导入（v1.1）

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-IMP-001` | `TODO` | 实现 md/txt 文件名解析器（`YYYY-MM-DD` 与 `YYYY-summary`） | 可正确识别 `daily`/`yearly_summary` 并产出结构化结果 | `src/services/import.ts` `src/types/diary.ts` | — | — |
| `TD-IMP-002` | `TODO` | 实现批量导入预检（有效/冲突/无效分类） | 导入前能输出三类列表，错误文件可定位 | `src/services/import.ts` `src/pages/workspace.tsx` | — | — |
| `TD-IMP-003` | `TODO` | 实现冲突逐条确认（覆盖/跳过）写入流程 | 同日期/同年份冲突可逐条决策并正确落库 | `src/components/common/import-conflict-dialog.tsx` `src/hooks/use-diary.ts` | — | — |
| `TD-IMP-004` | `TODO` | 实现导入结果汇总反馈（成功/跳过/失败） | 完成后可查看汇总统计与失败明细 | `src/components/common/import-result-dialog.tsx` `src/pages/workspace.tsx` | — | — |
| `TD-IMP-005` | `TODO` | 补齐导入单元/集成/E2E 测试 | 覆盖命名识别、冲突处理、异常跳过、部分失败容错 | `src/services/__tests__/import.test.ts` `src/__tests__/integration/import.integration.test.tsx` `e2e/import.spec.ts` | — | — |

### 6.10 文档维护

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-DOC-001` | `DONE` | 补充导入功能规格与 TODO 拆解（md/txt 文件名识别 + 系统自动生成 metadata） | `SPEC.md` 明确导入输入格式、识别规则、冲突策略、验收标准；`TODO.md` 新增导入任务组 | `SPEC.md` `TODO.md` | `npm run test:unit` 通过（35/35）；`npm run test:integration` 通过（28/28）；`npm run test:e2e` 通过（冒烟） | `2026-02-09 / 05c0fb7` |
| `TD-DOC-002` | `DONE` | 在 AGENTS 增加“大工作量任务默认并行多 agents 执行”规范 | `AGENTS.md` 明确要求 AI 对重任务主动采用并行多 agents，不依赖用户显式指定 | `AGENTS.md` `TODO.md` | `npm run test:unit` 通过（42/42）；`npm run test:integration` 通过（35/35）；`npm run test:e2e` 通过（14 passed，3 flaky 重试通过） | `2026-02-09 / 6c99c2c` |
