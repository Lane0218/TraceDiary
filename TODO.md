# TraceDiary 动态 TODO 清单

> 说明：本清单由 AGENTS 拆分而来，作为唯一任务状态源。

> 说明：以下为基于 `SPEC.md` 的完整拆解清单。执行过程中必须持续更新状态与完成记录。

## 0. 快速看板

- 更新时间：`2026-02-08`
- 总任务：`45`
- 状态统计：`DONE=29` / `DOING=1` / `TODO=15` / `BLOCKED=0`
- 当前进行中：`TD-UI-007`

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

### 6.8 UI 体验优化

| ID | 状态 | 任务 | 验收标准 | 关联文件 | 测试记录 | 完成记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `TD-UI-001` | `DONE` | 提供极简专业风的布局与交互原型 HTML | 可在浏览器中演示导航切换、月份切换与状态反馈逻辑 | `docs/ui-layout-prototype.html` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过 | `2026-02-08 / c45592a` |
| `TD-UI-002` | `DONE` | 调整原型为“欢迎弹层 + 单页工作台（日历与日记/年度总结同屏）” | 欢迎流程以弹层演示，主页面仅保留一个工作台并可切换日记/年度总结 | `docs/ui-layout-prototype.html` `src/hooks/use-diary.ts` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（21/21）；`npm run test:e2e` 通过 | `2026-02-08 / 4a4ff1c` |
| `TD-UI-003` | `DONE` | 落地 blog 同源风格并重构为单页工作台（欢迎弹层 + 日历/日记/年度总结同屏） | 默认进入工作台；认证以弹层呈现；视觉风格与 blog 一致；旧路由可兼容跳转 | `src/App.tsx` `src/index.css` `tailwind.config.js` `src/pages/workspace.tsx` `src/components/auth/*` `src/components/calendar/*` `src/components/history/*` `src/components/editor/*` `src/__tests__/integration/*` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-08 / 661051b` |
| `TD-UI-004` | `DONE` | 精修工作台视觉层级、工具条编排、状态反馈与弹层细节 | 主次区域更清晰；工具条分层；状态可感知；弹层模式切换和错误区更稳定；移动端布局更稳 | `src/pages/workspace.tsx` `src/components/auth/auth-modal.tsx` `src/components/calendar/month-calendar.tsx` `src/components/history/on-this-day-list.tsx` `src/index.css` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / b426bbd` |
| `TD-UI-005` | `DONE` | 收敛日期入口：移除双日期输入框并新增“月标题点击年月选择” | 删除指定文案；无“当前日期/查询日期”输入框；可通过月标题弹层选择年月并联动编辑与往年今日 | `src/pages/workspace.tsx` `src/components/calendar/month-calendar.tsx` `src/pages/calendar.tsx` `src/__tests__/integration/app.integration.test.tsx` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 9ae8d0e` |
| `TD-UI-006` | `DONE` | 优化工作台信息简化与左侧结构（移除条目ID/冗余描述，分离往年今日卡片，缩小日历日期格） | 不显示条目ID；“往年今日”无附加解释文案；往年今日独立于日历卡片；日期格尺寸更紧凑 | `src/pages/workspace.tsx` `src/components/calendar/month-calendar.tsx` | `npm run test:unit` 通过（22/22）；`npm run test:integration` 通过（23/23）；`npm run test:e2e` 通过；`npm run lint` 通过 | `2026-02-09 / 6f2fe9a` |
| `TD-UI-007` | `DOING` | 重构“日记主页面 + 年度总结独立页”信息架构（移除同级 Tab，新增 `/yearly/:year` 长时写作页与年终提示） | 工作台仅保留日记编辑；可从按钮和年终提示进入年度总结独立页；年度总结支持按自然年切换与保存；返回日记不丢失上下文 | `src/App.tsx` `src/pages/workspace.tsx` `src/pages/yearly-summary.tsx` `src/pages/calendar.tsx` `src/__tests__/integration/*` | — | — |
