# TraceDiary 动态 TODO 清单

> 说明：本清单由 AGENTS 拆分而来，作为唯一任务状态源。

> 说明：以下为基于 `SPEC.md` 的完整拆解清单。执行过程中必须持续更新状态与完成记录。

### 6.1 基础工程与项目骨架

- [ ] `ID: TD-BASE-001` 任务：初始化 React + TypeScript + Vite 工程骨架；状态：`DOING`；验收标准：可本地启动并渲染首页；关联文件：`package.json` `src/main.tsx` `src/App.tsx`；测试记录：；完成记录：
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
