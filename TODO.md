# TraceDiary 动态 TODO 清单

> 说明：本清单由 AGENTS 拆分而来，作为唯一任务状态源。

> 说明：以下为基于 `SPEC.md` 的完整拆解清单。执行过程中必须持续更新状态与完成记录。

## 0. 快速看板

- 更新时间：`2026-02-08`
- 总任务：`38`
- 状态统计：`DONE=3` / `DOING=0` / `TODO=35` / `BLOCKED=0`
- 建议下一步：`TD-BASE-004`

## 1. 任务清单（按模块）

### 6.1 基础工程与项目骨架

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-BASE-001` | `DONE` | 初始化 React + TypeScript + Vite 工程骨架 | 可本地启动并渲染首页 | `package.json` `src/main.tsx` `src/App.tsx` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`timeout 10s npm run dev -- --host 127.0.0.1 --port 4174 --strictPort` 启动成功（Vite ready） | `2026-02-08 / 74e583b` |
| `TD-BASE-002` | `DONE` | 接入 Tailwind CSS 并配置基础样式 | 工具类生效且构建通过 | `tailwind.config.*` `src/index.css` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`npm run build` 通过 | `2026-02-08 / 064c39d` |
| `TD-BASE-003` | `DONE` | 建立目录结构（components/pages/hooks/services/types/utils） | 目录与 SPEC 对齐 | `src/` | `npm run test:unit` 通过（1/1）；`npm run test:integration` 通过（1/1）；`npm run test:e2e` 通过（冒烟）；`npm run lint` 通过 | `2026-02-08 / 94001ac` |
| `TD-BASE-004` | `TODO` | 配置 React Router 基础路由（welcome/calendar/editor/yearly-summary） | 页面可路由跳转 | `src/App.tsx` `src/pages/*` | — | — |
| `TD-BASE-005` | `TODO` | 接入 TanStack Query 并提供全局 QueryClient | 页面可使用 query/mutation | `src/main.tsx` | — | — |

### 6.2 认证、安全与密钥管理

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-SEC-001` | `TODO` | 实现首次欢迎页输入（Repo/Token/主密码） | 表单校验通过后进入初始化流程 | `src/pages/welcome.tsx` | — | — |
| `TD-SEC-002` | `TODO` | 实现 Gitee 仓库访问校验 | 无效 Token/Repo 可提示错误 | `src/services/gitee.ts` | — | — |
| `TD-SEC-003` | `TODO` | 实现 PBKDF2 动态迭代参数校准（200ms~500ms） | 生成并持久化 `kdfParams` | `src/services/crypto.ts` `src/types/config.ts` | — | — |
| `TD-SEC-004` | `TODO` | 实现 AES-256-GCM 加解密工具（IV+ciphertext Base64） | 加密后可无损解密 | `src/services/crypto.ts` | — | — |
| `TD-SEC-005` | `TODO` | 实现 `encryptedToken` 存储与恢复 | 本地无 Token 明文 | `src/services/crypto.ts` `src/hooks/use-auth.ts` | — | — |
| `TD-SEC-006` | `TODO` | 实现 7 天免输主密码机制（不存主密码明文） | 过期后强制重输密码 | `src/hooks/use-auth.ts` | — | — |
| `TD-SEC-007` | `TODO` | 实现 Token 解密失败/失效回退输入流程 | 失败时可补输并覆盖本地密文 | `src/pages/welcome.tsx` `src/hooks/use-auth.ts` | — | — |

### 6.3 数据层与本地缓存

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-DATA-001` | `TODO` | 实现 IndexedDB 数据库与对象仓库（diaries/metadata/config） | 可读写并按索引查询 | `src/services/indexeddb.ts` | — | — |
| `TD-DATA-002` | `TODO` | 实现 `DiaryEntry` 与 `MetadataEntry` 类型（含 yearly `year + date`） | 类型与 SPEC 一致 | `src/types/diary.ts` `src/types/metadata.ts` | — | — |
| `TD-DATA-003` | `TODO` | 实现 metadata 本地解密缓存与远端 `metadata.json.enc` 同步 | 首次加载可拉取并解密 | `src/services/sync.ts` | — | — |

### 6.4 核心功能：日历、编辑、年度总结、往年今日

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-FUNC-001` | `TODO` | 实现月历视图与月份切换 | 可切换任意月份并点击日期 | `src/components/calendar/*` `src/pages/calendar.tsx` | — | — |
| `TD-FUNC-002` | `TODO` | 集成 Milkdown 编辑器并支持基础 Markdown | 可编辑标题/列表/任务列表 | `src/components/editor/*` | — | — |
| `TD-FUNC-003` | `TODO` | 实现日记创建/读取/编辑流程 | 按日期保存并可回显 | `src/pages/editor.tsx` `src/hooks/use-diary.ts` | — | — |
| `TD-FUNC-004` | `TODO` | 实现编辑实时写入 IndexedDB | 刷新后本地内容不丢失 | `src/hooks/use-diary.ts` | — | — |
| `TD-FUNC-005` | `TODO` | 实现 30 秒防抖上传与手动保存立即上传 | 符合触发时机定义 | `src/hooks/use-sync.ts` `src/services/sync.ts` | — | — |
| `TD-FUNC-006` | `TODO` | 实现年度总结创建/编辑（`YYYY-summary.md.enc`） | 可按年份管理总结 | `src/pages/yearly-summary.tsx` | — | — |
| `TD-FUNC-007` | `TODO` | 实现“往年今日”查询与预览 | 显示同月同日历史记录 | `src/components/history/*` | — | — |
| `TD-FUNC-008` | `TODO` | 实现“往年今日”虚拟滚动（react-window） | 历史数据较多时滚动流畅 | `src/components/history/*` | — | — |

### 6.5 同步与冲突解决

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-SYNC-001` | `TODO` | 封装 Gitee 文件读取与写入（优先 Authorization） | 支持 contents API 拉取与更新 | `src/services/gitee.ts` | — | — |
| `TD-SYNC-002` | `TODO` | 实现上传前 SHA 预检与 `expectedSha` CAS 更新 | 更新请求携带正确 `sha` | `src/services/sync.ts` | — | — |
| `TD-SYNC-003` | `TODO` | 实现 `sha mismatch` 冲突识别 | 冲突可被稳定检测 | `src/services/sync.ts` | — | — |
| `TD-SYNC-004` | `TODO` | 实现冲突弹窗（本地/远端/合并） | 三种分支均可完成 | `src/components/common/*` `src/pages/editor.tsx` | — | — |
| `TD-SYNC-005` | `TODO` | 实现离线检测与网络恢复自动重试 | 断网有提示，恢复后自动同步 | `src/hooks/use-sync.ts` | — | — |

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
| `TD-TEST-004` | `TODO` | 关键用户流程 E2E（创建、编辑、同步、冲突） | 核心链路自动化通过 | `e2e/*` | — | — |
| `TD-TEST-005` | `TODO` | 性能验收（加载、切换日期、往年今日、输入延迟） | 满足 SPEC 指标 | `test-report/*` | — | — |
| `TD-TEST-006` | `TODO` | 兼容性验收（Chrome/Edge/Safari/Firefox/安卓/iOS） | 验收清单全部勾选 | `docs/compatibility-report.md` | — | — |
