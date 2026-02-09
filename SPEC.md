# TraceDiary 规格说明书

---

## 📋 文档信息

- **项目名称**：TraceDiary
- **版本**：Web 版 v1.0
- **架构类型**：纯前端 Web 应用 + Gitee 私有仓库存储
- **更新日期**：2026-02-09

---

## 📖 目录

1. [项目概述](#1-项目概述)：定义产品定位、目标用户、MVP 范围与核心成功指标，明确本项目的业务边界。
2. [技术栈](#2-技术栈)：说明前端框架、编辑器、数据层、PWA 与部署平台的选型及其职责。
3. [架构设计](#3-架构设计)：描述浏览器端加密架构、读写数据流、远端仓库结构与状态管理策略。
4. [核心功能](#4-核心功能)：细化认证初始化、日记编辑、年度总结、日历导航、往年今日、导入与冲突处理行为。
5. [数据结构](#5-数据结构)：给出类型定义、IndexedDB 设计和同步接口约定，作为实现时的数据契约。
6. [用户流程](#6-用户流程)：用流程图串联首次使用、日常使用、跨设备同步与批量导入，强调关键状态转换节点。
7. [安全与隐私](#7-安全与隐私)：规范加密方案、凭证存储、密码策略与公网访问控制要求。
8. [部署方案](#8-部署方案)：定义构建参数、Vercel 配置、安全响应头和 PWA 发布相关配置。
9. [开发规范](#9-开发规范)：约束代码风格、目录结构、提交规范与测试覆盖要求。
10. [验收标准](#10-验收标准)：以功能、性能、安全、兼容性四类清单作为交付验收基准。
11. [附录 A：Gitee API 参考](#附录-agitee-api-参考)：列出认证与常用接口参数，作为同步实现的外部依赖说明。
12. [附录 B：术语表](#附录-b术语表)：统一文中术语定义，避免实现和评审过程中的理解偏差。

---

## 1. 项目概述

### 1.1 产品定位

**TraceDiary** 是一款**隐私至上的 Web 日记应用**，采用前端加密 + Gitee 私有仓库存储方案，实现跨平台访问和零服务器成本。核心特色是"往年今日"功能，让用户轻松回顾历史同期记录。

### 1.2 核心价值

- 🔒 **隐私保护**：前端 AES-256-GCM 加密，数据不经过任何第三方服务器
- 🌐 **跨平台访问**：浏览器即可使用，支持 Windows、安卓、iOS
- 💰 **零成本**：静态托管免费，Gitee 私有仓库免费
- ⏳ **时光回溯**：查看往年今日的日记，感受时光流转
- ✍️ **优雅编辑**：Markdown 所见即所得编辑，接近 Obsidian 体验
- 📱 **PWA 支持**：可安装到手机主屏幕，像原生 App 一样使用

### 1.3 目标用户

- 重视数据隐私和数据控制权的用户
- 喜欢用 Markdown 记录的技术爱好者
- 需要跨设备访问日记的用户
- 熟悉 Gitee 的用户
- 希望零成本运行个人日记系统的用户

### 1.4 MVP 功能范围

**第一版必须包含：**

- ✅ Markdown 编辑器（所见即所得）
- ✅ 日记创建、编辑、查看
- ✅ 年度总结创建、编辑、查看
- ✅ 日历导航（月份切换、日期选择）
- ✅ 往年今日查询（2022 至今）
- ✅ 前端 AES-256-GCM 加密
- ✅ 密码验证（首次设置，7 天免输主密码）
- ✅ Gitee Token 本地加密持久化（主密码二次加密）
- ✅ Gitee 自动同步（实时保存 + 30 秒防抖）
- ✅ 冲突解决（弹窗让用户选择版本）
- ✅ 移动端适配（响应式设计）
- ✅ PWA 支持（可安装）

**v1.1 近期迭代（已确定）：**

- 数据导入（md/txt 批量导入）
- 全文搜索
- 数据导出（打包下载）
- 统计面板（字数、连续记录天数）

### 1.5 成功标准

| 指标 | 目标值 |
|------|--------|
| 首次加载时间 | ≤ 3 秒 |
| 切换日期响应 | ≤ 200ms |
| 往年今日查询（5 年数据） | ≤ 1 秒 |
| 编辑器输入延迟 | ≤ 50ms |
| 保存成功率 | ≥ 99.5% |
| 移动端可用性评分 | ≥ 90 分 |

---

## 2. 技术栈

### 2.1 前端框架

- **React 18**：UI 框架
- **TypeScript 5**：类型安全
- **Vite**：构建工具（快速开发、热更新）

### 2.2 UI 层

- **Tailwind CSS**：样式框架
- **Milkdown**：Markdown 所见即所得编辑器（基于 ProseMirror）
- **React Router**：路由管理
- **date-fns**：日期处理

### 2.3 数据层

- **IndexedDB**：本地缓存（存储已解密的日记）
- **Gitee API**：远程存储和同步
- **Web Crypto API**：前端加密/解密

### 2.4 PWA 支持

- **Vite PWA Plugin**：生成 Service Worker 和 Manifest
- **Workbox**：缓存策略（仅缓存应用壳，不缓存日记内容）

### 2.5 部署

- **Vercel**：静态托管（免费、自动 HTTPS、CDN 加速）
- **域名**：diary.laneljc.cn

---

## 3. 架构设计

### 3.1 整体架构

```
用户浏览器
    ↓
React 前端应用 (diary.laneljc.cn)
    ↓
├─ Web Crypto API (前端加密/解密)
├─ IndexedDB (本地缓存)
└─ Gitee API (远程存储)
    ↓
Gitee 私有仓库 (用户自建)
```

### 3.2 数据流

#### 写入流程

1. 用户在编辑器中输入内容
2. 实时保存到 IndexedDB（已解密，方便快速访问）
3. 30 秒防抖后触发同步
4. 前端使用 Web Crypto API 加密内容
5. 通过 Gitee API 上传加密文件到私有仓库
6. 更新本地 metadata 缓存（解密态）
7. 上传 `metadata.json.enc` 到 Gitee

#### 读取流程

1. 首次加载：从 Gitee 拉取 `metadata.json.enc` 并解密
2. 用户点击某个日期
3. 检查 IndexedDB 是否有缓存
4. 如果有缓存，直接使用
5. 如果没有，从 Gitee 下载加密文件
6. 前端解密后显示，并缓存到 IndexedDB

### 3.3 文件结构（Gitee 仓库）

```
diary-data/                    # 用户的私有仓库名称
├── diaries/                   # 日常日记目录
│   ├── 2026-01-31.md.enc      # 加密的日记文件
│   ├── 2026-01-30.md.enc
│   ├── 2026-01-29.md.enc
│   └── ...
├── summaries/                 # 年度总结目录
│   ├── 2026-summary.md.enc
│   ├── 2025-summary.md.enc
│   └── ...
└── metadata.json.enc          # 加密的元数据文件
```

**metadata.json.enc 内容**（解密后）：

```json
{
  "version": "1.1",
  "lastSync": "2026-02-07T15:30:00Z",
  "entries": [
    {
      "date": "2026-01-31",
      "type": "daily",
      "filename": "2026-01-31.md.enc",
      "wordCount": 256,
      "createdAt": "2026-01-31T20:00:00Z",
      "modifiedAt": "2026-01-31T21:30:00Z"
    },
    {
      "date": "2026-12-31",
      "year": 2026,
      "type": "yearly_summary",
      "filename": "2026-summary.md.enc",
      "wordCount": 1024,
      "createdAt": "2026-12-31T23:00:00Z",
      "modifiedAt": "2026-12-31T23:45:00Z"
    }
  ]
}
```

### 3.4 状态管理

- **React Context**：全局状态（用户认证、密码、Gitee Token）
- **TanStack Query（React Query）**：数据同步和缓存管理
- **IndexedDB**：持久化缓存

---

## 4. 核心功能

### 4.1 用户认证与初始化

#### 4.1.1 首次使用流程

1. 用户访问 diary.laneljc.cn
2. 检测 LocalStorage 中是否有配置
3. 如果没有，显示"欢迎页面"：
   - 输入 Gitee Personal Access Token
   - 输入 Gitee 仓库地址（如 `https://gitee.com/username/diary-data`）
   - 设置主密码（≥8 字符，字母+数字）
4. 验证 Token 和仓库访问权限
5. 生成加密密钥（使用 PBKDF2 从主密码派生）
6. 保存必要配置到本地（保存仓库信息、KDF 参数、密码过期时间、`encryptedToken`；Token 明文不落地）
7. 初始化空的 `metadata.json.enc` 上传到 Gitee

#### 4.1.2 后续使用流程

1. 用户访问应用
2. 检查 LocalStorage 中的密码过期时间（7 天）
3. 如果未过期，尝试恢复本地解锁态（不包含主密码明文）并解密 `encryptedToken`
4. 如果过期，要求重新输入主密码
5. 验证主密码后更新过期时间，并解密 `encryptedToken`
6. 若 `encryptedToken` 解密失败或 Token 已失效，提示重新输入 Token 并覆盖本地密文

### 4.2 日记编辑功能

#### 4.2.1 创建日记

1. 用户点击日历上的某个日期（如 2026-02-07）
2. 检查该日期是否已有日记
3. 如果没有，显示空白 Milkdown 编辑器
4. 用户输入内容
5. 实时保存到 IndexedDB（明文）
6. 30 秒防抖后加密上传到 Gitee

#### 4.2.2 编辑日记

1. 用户点击已有日记的日期
2. 从 IndexedDB 加载（如果有缓存）
3. 如果没有缓存，从 Gitee 下载并解密
4. 显示在 Milkdown 编辑器中
5. 用户修改内容
6. 实时更新 IndexedDB
7. 30 秒防抖后加密上传到 Gitee

#### 4.2.3 编辑器功能

- 所见即所得（WYSIWYG）
- 支持 Markdown 语法
- 不支持工具栏（简洁设计）
- 不支持数学公式、图表、Emoji（简化版）
- 仅支持纯文本和基础 Markdown（标题、无序列表、编号列表、任务列表）

### 4.3 年度总结功能

#### 4.3.1 创建年度总结

1. 用户在日历视图点击"年度总结"按钮
2. 选择年份（如 2026）
3. 检查该年份是否已有总结
4. 如果没有，显示空白编辑器
5. 用户撰写内容并保存
6. 文件命名为 `YYYY-summary.md.enc`
7. 存储到 Gitee 的 `summaries/` 目录

#### 4.3.2 与日记的区别

| 特性 | 日常日记 | 年度总结 |
|------|---------|---------|
| 文件名 | `YYYY-MM-DD.md.enc` | `YYYY-summary.md.enc` |
| 存储目录 | `diaries/` | `summaries/` |
| metadata 中的 type | `"daily"` | `"yearly_summary"` |
| metadata 中的 date | `"2026-01-31"` | `"2026-12-31"`（总结成文/归档日期） |
| metadata 中的 year | `-` | `2026` |
| 访问入口 | 日历点击日期 | 日历顶部"年度总结"按钮 |

### 4.4 日历导航

#### 4.4.1 日历视图

- 显示当前月份的日历格子
- 有日记的日期显示小圆点标记
- 点击日期进入编辑/查看页面
- 支持左右箭头切换月份
- 顶部显示"年度总结"按钮

#### 4.4.2 月份切换

- 点击 ◀ 切换到上一个月
- 点击 ▶ 切换到下一个月
- 点击月份标题弹出月份选择器（可快速跳转）

### 4.5 往年今日功能

#### 4.5.1 查询逻辑

1. 用户查看某个日期的日记（如 2026-02-07）
2. 右侧边栏自动显示"往年今日"
3. 查询所有历史年份的 02-07 日记（2025-02-07、2024-02-07...）
4. 从 `metadata.json.enc`（解密后）获取列表
5. 显示每篇日记的预览（日期 + 前 3 行内容）

#### 4.5.2 展示方式

- 虚拟滚动列表（使用 react-window）
- 每个卡片显示：
  - 年份（如"2025 年"）
  - 日期（如 "2025-02-07"）
  - 预览内容（前 3 行，固定行数）
  - 字数统计
- 点击卡片跳转到对应日期的完整日记

### 4.6 同步与冲突解决

#### 4.6.1 自动同步机制

- **实时保存**：编辑器内容实时保存到 IndexedDB
- **防抖上传**：停止编辑 30 秒后触发上传
- **保存时立即同步**：用户主动点击保存时立即上传
- **SHA 预检**：上传前获取远端文件 SHA，作为 `expectedSha` 参与更新（CAS）

#### 4.6.2 冲突场景

当用户在多个设备上修改同一篇日记时：

1. 设备 A 修改并上传到 Gitee（版本 1）
2. 设备 B（离线）也修改了同一篇日记
3. 设备 B 联网后尝试上传
4. 提交更新时出现 `sha mismatch`，判定为冲突

#### 4.6.3 冲突解决流程

1. 弹出对话框显示两个版本（含摘要和 `modifiedAt`）：
   - **本地版本**：设备 B 的修改
   - **远程版本**：从 Gitee 下载的最新版本
2. 用户选择：
   - 保留本地版本（覆盖远程）
   - 保留远程版本（放弃本地修改）
   - 合并两个版本（手动编辑）
3. 根据用户选择生成新内容，并再次读取远端 SHA
4. 使用 `expectedSha` 重新提交更新（CAS）
5. 若再次 `sha mismatch`，提示用户刷新远端版本后重新决策

### 4.7 数据导入（v1.1）

#### 4.7.1 导入入口与流程

1. 用户在工作台选择“导入日记”，支持一次选择多个文件
2. 文件类型仅允许 `.md` 与 `.txt`
3. 系统按文件名规则识别条目类型并预检
4. 将文件分为：可导入、命名无效、与本地冲突三类
5. 对冲突项逐条确认（覆盖或跳过）
6. 将可导入条目写入 IndexedDB，并更新本地 metadata 缓存
7. 导入结束后展示汇总结果（成功/跳过/失败）

#### 4.7.2 文件名识别规则

- 日常日记：`YYYY-MM-DD.md` 或 `YYYY-MM-DD.txt`，映射为 `type = "daily"`
- 年度总结：`YYYY-summary.md` 或 `YYYY-summary.txt`，映射为 `type = "yearly_summary"`
- 非法命名：不参与导入，记入失败清单

导入完成后由系统自动生成同步文件名：

- 日常日记：`YYYY-MM-DD.md.enc`
- 年度总结：`YYYY-summary.md.enc`

#### 4.7.3 冲突与时间策略

- 冲突定义：导入条目与本地已存在条目键相同（`daily:YYYY-MM-DD` 或 `summary:YYYY`）
- 处理策略：逐条确认，用户可选“覆盖”或“跳过”
- 时间戳策略：优先使用文件 `lastModified`，不可用时回退为导入时刻

#### 4.7.4 失败与反馈

- 命名不合法、读取失败、空内容均不影响同批次其它可导入文件
- 导入结果需包含：
  - 成功条目数与列表
  - 冲突处理结果（覆盖/跳过）
  - 失败条目列表与失败原因
- 系统负责自动生成并维护 metadata，用户无需手工编写 JSON 文件

---

## 5. 数据结构

### 5.1 TypeScript 类型定义

#### DiaryEntry（日记条目）

```typescript
interface EntryBase {
  id: string;                // daily:YYYY-MM-DD 或 summary:YYYY（仅本地索引键）
  date: string;              // "YYYY-MM-DD"
  filename: string;
  content: string;           // Markdown 内容（解密后）
  wordCount: number;
  createdAt: string;         // ISO 8601 时间戳
  modifiedAt: string;        // ISO 8601 时间戳
}

interface DailyEntry extends EntryBase {
  type: 'daily';
  filename: `${string}.md.enc`; // YYYY-MM-DD.md.enc
}

interface YearlySummaryEntry extends EntryBase {
  type: 'yearly_summary';
  year: number;              // 例如 2026
  filename: `${number}-summary.md.enc`;
}

type DiaryEntry = DailyEntry | YearlySummaryEntry;
```

#### Metadata（元数据）

```typescript
interface Metadata {
  version: string;           // 数据格式版本（如 "1.1"）
  lastSync: string;          // 最后同步时间（ISO 8601）
  entries: MetadataEntry[];  // 所有日记的元信息
}

type MetadataEntry =
  | {
      type: 'daily';
      date: string;          // YYYY-MM-DD
      filename: string;
      wordCount: number;
      createdAt: string;
      modifiedAt: string;
    }
  | {
      type: 'yearly_summary';
      year: number;          // 例如 2026
      date: string;          // YYYY-MM-DD，总结成文/归档日期
      filename: string;
      wordCount: number;
      createdAt: string;
      modifiedAt: string;
    };
```

#### AppConfig（应用配置）

```typescript
interface KdfParams {
  algorithm: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;              // Base64
}

interface AppConfig {
  giteeRepo: string;         // 仓库地址
  giteeOwner: string;        // 仓库所有者
  giteeRepoName: string;     // 仓库名称
  passwordHash: string;      // 密码 hash（PBKDF2）
  passwordExpiry: string;    // 密码过期时间（ISO 8601）
  kdfParams: KdfParams;      // KDF 参数（含盐值和迭代次数）
  encryptedToken?: string;   // 主密码派生密钥二次加密后的 Token
  tokenCipherVersion: 'v1';
}
// giteeToken 明文不进入持久化配置，运行时仅保存在内存
```

### 5.2 IndexedDB 结构

数据库名称：`TraceDiary`
版本：1

**对象存储（Object Stores）**：

1. **diaries**（存储已解密的日记）
   - keyPath: `id`（`daily:YYYY-MM-DD` 或 `summary:YYYY`）
   - 索引：`type`, `date`, `year`, `createdAt`, `modifiedAt`

2. **metadata**（存储元数据）
   - keyPath: `key`（固定为 `"metadata"`）

3. **config**（存储应用配置）
   - keyPath: `key`（固定为 `"config"`）

### 5.3 同步接口约定

```typescript
interface UploadRequest {
  path: string;
  encryptedContent: string;  // Base64(IV + Ciphertext)
  message: string;
  branch: string;            // 默认 main
  expectedSha?: string;      // CAS：更新场景必填
}

interface UploadResult {
  ok: boolean;
  conflict: boolean;         // true 表示 sha mismatch
  remoteSha?: string;        // 更新成功后的最新 SHA
  reason?: 'sha_mismatch' | 'network' | 'auth';
}
```

### 5.4 导入接口约定（v1.1）

```typescript
interface ImportSourceFile {
  name: string;               // 原始文件名（如 2026-02-08.md）
  mimeType: string;           // text/markdown 或 text/plain
  size: number;               // 字节数
  lastModified?: string;      // ISO 8601（由 File.lastModified 转换）
  content: string;            // UTF-8 文本内容
}

type ImportParsedEntry =
  | {
      type: 'daily';
      id: `daily:${string}`;
      date: string;           // YYYY-MM-DD
      filename: `${string}.md.enc`;
      content: string;
      wordCount: number;
      createdAt: string;
      modifiedAt: string;
    }
  | {
      type: 'yearly_summary';
      id: `summary:${number}`;
      year: number;
      date: string;           // YYYY-12-31
      filename: `${number}-summary.md.enc`;
      content: string;
      wordCount: number;
      createdAt: string;
      modifiedAt: string;
    };

interface ImportConflictItem {
  entryId: string;
  localModifiedAt?: string;
  incomingModifiedAt: string;
  strategy?: 'overwrite' | 'skip';
}

interface ImportResult {
  success: string[];          // 成功导入的 entryId
  overwritten: string[];      // 冲突后覆盖的 entryId
  skipped: string[];          // 冲突后跳过的 entryId
  invalid: Array<{ name: string; reason: string }>;
  failed: Array<{ name: string; reason: string }>;
}
```

说明：

- 导入流程复用现有 `DiaryEntry` / `MetadataEntry` 存储结构，不新增持久化 schema
- metadata 由系统自动创建与更新，不对用户暴露编辑入口

---

## 6. 用户流程

### 6.1 首次使用流程图

```
用户访问 diary.laneljc.cn
    ↓
显示欢迎页面
    ↓
用户输入 Gitee Token 和仓库地址
    ↓
验证 Token 和仓库访问权限
    ↓ (成功)
用户设置主密码（≥8 字符，字母+数字）
    ↓
生成加密密钥（PBKDF2）
    ↓
初始化 metadata.json.enc 上传到 Gitee
    ↓
保存本地配置（含 encryptedToken，不含 Token 明文）
    ↓
进入日历主界面
```

### 6.2 日常使用流程图

```
用户访问应用
    ↓
检查密码是否过期（7 天）
    ↓ (未过期)
恢复本地解锁态并解密 encryptedToken
    ↓ (成功)
进入日历主界面
    ↓
用户点击某个日期（如 2026-02-07）
    ↓
检查 IndexedDB 是否有缓存
    ↓ (有缓存)
显示编辑器并加载内容
    ↓
用户编辑内容
    ↓
实时保存到 IndexedDB
    ↓
30 秒防抖后加密上传到 Gitee
    ↓
右侧显示"往年今日"（2025-02-07、2024-02-07...）
```

### 6.3 跨设备同步流程图

```
设备 A 修改日记并上传 Gitee
    ↓
设备 B 打开应用
    ↓
从 Gitee 下载最新 metadata.json.enc
    ↓
比对本地 IndexedDB 缓存
    ↓
发现有更新的日记
    ↓
下载并解密最新内容
    ↓
更新 IndexedDB 缓存
    ↓
显示最新内容
```

### 6.4 批量导入流程图（v1.1）

```
用户选择多个 .md/.txt 文件
    ↓
系统按文件名识别类型（daily/yearly_summary）
    ↓
分类结果：可导入 / 冲突 / 无效命名
    ↓
对冲突条目逐条确认（覆盖或跳过）
    ↓
将可导入与“覆盖”条目写入 IndexedDB
    ↓
系统自动更新 metadata（用户无需 JSON 清单）
    ↓
展示导入汇总（成功/覆盖/跳过/失败）
```

---

## 7. 安全与隐私

### 7.1 加密方案

#### 7.1.1 密钥派生

使用 **PBKDF2** 从用户主密码派生加密密钥：

- 算法：PBKDF2-SHA256
- 迭代次数：动态调优（目标单次派生耗时 200ms ~ 500ms）
- 初始迭代次数：300,000（可根据设备性能上下调整，范围 150,000 ~ 1,000,000）
- 盐值：随机生成（Base64 编码，存储在 `kdfParams.salt`）
- 密钥长度：256 位
- 参数持久化：`kdfParams` 写入本地配置；旧参数登录成功后后台升级

#### 7.1.2 数据加密

使用 **AES-256-GCM** 加密所有敏感数据：

- 日记内容（`.md.enc` 文件）
- 年度总结内容
- metadata.json.enc（仅索引信息：date/year/type/filename/wordCount/时间戳）

**加密流程**：

1. 从主密码派生 256 位密钥
2. 生成随机 96 位 IV（初始化向量）
3. 使用 AES-256-GCM 加密明文
4. 将 IV 和密文拼接（IV + 密文）
5. Base64 编码后存储

**解密流程**：

1. Base64 解码
2. 提取 IV（前 12 字节）
3. 提取密文（剩余部分）
4. 使用 AES-256-GCM 解密
5. 返回明文

### 7.2 密码要求

- 最小长度：8 字符
- 必须包含：字母 + 数字
- 不强制特殊字符（降低记忆负担）

### 7.3 凭证与密钥存储

- **主密码**：不存储（用户每次输入或从记忆中恢复）
- **Gitee Token**：允许持久化，但仅以 `encryptedToken` 形式存储（主密码派生密钥二次加密）
- **密码 Hash**：存储 PBKDF2 派生后的 hash（用于验证）
- **加密密钥**：不存储，每次从密码重新派生
- **KDF 参数**：存储在本地配置（`kdfParams`）

### 7.4 记住密码功能

- 验证成功后设置过期时间（当前时间 + 7 天，仅当前设备）
- 存储在 LocalStorage：`passwordExpiry`
- 每次进入应用时检查是否过期，并尝试恢复本地解锁态
- 本地解锁态仅用于免输主密码，不存储主密码明文
- 过期后要求重新输入密码
- 若 `encryptedToken` 无法解密或 Token 已失效，要求补输 Token

### 7.5 安全最佳实践

- ✅ 所有加密操作在前端完成
- ✅ Gitee Token 仅用于仓库操作，不能访问其他数据
- ✅ 使用 HTTPS（Vercel 自动提供）
- ✅ 公网部署时启用入口访问控制（网关鉴权）
- ✅ 不使用第三方分析工具（保护隐私）
- ✅ 不使用 CDN 加载敏感库（自托管 Milkdown 等）
- ❌ 不使用 LocalStorage 存储明文敏感数据
- ❌ 不在控制台输出敏感信息

### 7.6 公网部署与个人访问控制（本人自用）

即使是个人域名，静态站点部署到公网后，页面默认仍可被外部访问。为了实现“只有我自己能用”，必须采用三层控制：

1. **入口层（必选）**：在域名/CDN 层增加访问门禁（Cloudflare Access / Vercel 访问保护 / Basic Auth 三选一），未授权请求直接拦截（401/403）
2. **应用层（必选）**：通过主密码解锁后才可解密数据并进入编辑能力
3. **数据层（必选）**：Gitee 仓库保持私有，Token 仅授予最小权限 `projects`

推荐 MVP 落地顺序：

1. 先开入口门禁（阻止陌生人看到应用）
2. 保留应用内主密码解锁
3. Token 持久化改为密文保存（`encryptedToken`），不落地明文

---

## 8. 部署方案

### 8.1 构建配置

#### 8.1.1 Vite 配置

- 输出目录：`dist/`
- 基础路径：`/`
- 代码分割：启用
- 压缩：启用（Terser）
- Source Map：生产环境禁用

#### 8.1.2 环境变量

`.env.production`:

```
VITE_APP_NAME=TraceDiary
VITE_APP_VERSION=1.0.0
VITE_GITEE_API_BASE=https://gitee.com/api/v5
```

### 8.2 Vercel 部署

#### 8.2.1 项目配置

`vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://gitee.com https://*.gitee.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    }
  ]
}
```

#### 8.2.2 部署步骤

1. 在 Vercel 创建新项目
2. 连接 Git 仓库（GitHub/GitLab/Gitee）
3. 配置构建命令：`npm run build`
4. 配置输出目录：`dist`
5. 绑定自定义域名：`diary.laneljc.cn`
6. 配置 DNS：CNAME 指向 Vercel
7. 配置入口访问控制（Cloudflare Access / Vercel 访问保护 / Basic Auth）

### 8.3 PWA 配置

#### 8.3.1 Manifest

`public/manifest.json`:

```json
{
  "name": "TraceDiary - 时光追溯日记",
  "short_name": "TraceDiary",
  "description": "隐私至上的 Web 日记应用",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### 8.3.2 Service Worker 策略

- **应用壳**：缓存 HTML、CSS、JS（CacheFirst）
- **日记内容**：不缓存（NetworkOnly，确保数据最新）
- **静态资源**：缓存图标、字体（CacheFirst）

---

## 9. 开发规范

### 9.1 代码风格

- **React 组件**：函数组件 + Hooks
- **TypeScript**：严格模式，禁用 `any`
- **文件命名**：kebab-case（如 `diary-editor.tsx`）
- **组件命名**：PascalCase（如 `DiaryEditor`）
- **CSS 类名**：Tailwind 工具类

### 9.2 项目结构

```
src/
├── components/          # React 组件
│   ├── calendar/        # 日历相关组件
│   ├── editor/          # 编辑器组件
│   ├── history/         # 往年今日组件
│   └── common/          # 通用组件
├── pages/               # 页面组件
│   ├── welcome.tsx      # 欢迎页
│   ├── calendar.tsx     # 日历主页
│   ├── editor.tsx       # 编辑页面
│   └── yearly-summary.tsx
├── hooks/               # 自定义 Hooks
│   ├── use-auth.ts
│   ├── use-diary.ts
│   └── use-sync.ts
├── services/            # 业务逻辑
│   ├── crypto.ts        # 加密/解密
│   ├── gitee.ts         # Gitee API
│   ├── indexeddb.ts     # 本地存储
│   └── sync.ts          # 同步逻辑
├── types/               # TypeScript 类型
│   ├── diary.ts
│   ├── config.ts
│   └── metadata.ts
├── utils/               # 工具函数
│   ├── date.ts
│   └── validation.ts
├── App.tsx              # 根组件
└── main.tsx             # 入口文件
```

### 9.3 Git 工作流

- **提交信息**：遵循 Conventional Commits
- **提交信息语言要求**：类型前缀必须使用英文（`feat`/`fix`/`docs` 等），冒号后的具体说明必须使用中文
  - `feat: 添加年度总结功能`
  - `fix: 修复同步冲突问题`
  - `docs: 更新 README`

### 9.4 测试策略

- **单元测试**：Jest + React Testing Library（核心业务逻辑）
- **E2E 测试**：Playwright（关键用户流程，可选）
- **测试覆盖率**：核心模块 ≥ 80%

---

## 10. 验收标准

### 10.1 功能验收

#### 基础功能

- [ ] 用户可以完成首次配置（Gitee Token + 密码设置）
- [ ] 用户可以创建、编辑、查看日记
- [ ] 用户可以创建、编辑、查看年度总结
- [ ] 日历导航正常（切换月份、选择日期）
- [ ] 往年今日功能正常（显示历史同日日记）
- [ ] 密码验证功能正常（7 天免输主密码，过期后需重输）

#### 同步功能

- [ ] 保存后 30 秒自动上传到 Gitee
- [ ] 多设备数据能正确同步
- [ ] 冲突时基于 `sha mismatch` 弹出对话框让用户选择
- [ ] 网络断开时提示用户，恢复后自动重试

#### 移动端

- [ ] 移动端布局适配正常
- [ ] 编辑器在手机上可以正常输入
- [ ] 日历在手机上可以正常点击

#### PWA

- [ ] 可以安装到手机主屏幕
- [ ] 图标和启动画面显示正常
- [ ] 应用壳正确缓存（离线时能看到界面）

#### 数据导入（v1.1）

- [ ] 支持批量选择 `.md/.txt` 文件导入
- [ ] 文件名规则识别准确（`YYYY-MM-DD` 与 `YYYY-summary`）
- [ ] 同键冲突支持逐条确认（覆盖/跳过）
- [ ] 无效命名文件被跳过并在结果中给出原因
- [ ] metadata 自动更新，无需用户提供或编辑 JSON 清单

### 10.2 性能验收

- [ ] 首次加载时间 ≤ 3 秒（4G 网络）
- [ ] 切换日期响应 ≤ 200ms
- [ ] 往年今日查询 ≤ 1 秒（5 年数据）
- [ ] 编辑器输入延迟 ≤ 50ms
- [ ] 批量导入 100 个文件耗时 ≤ 3 秒（不含远端同步）
- [ ] Lighthouse 评分 ≥ 90（Performance、Accessibility）

### 10.3 安全验收

- [ ] 所有日记内容正确加密
- [ ] 密码验证正确（错误密码无法解密）
- [ ] Gitee 上的文件是加密状态（无法直接阅读）
- [ ] 公网部署已启用入口访问控制（未授权访问返回 401/403）
- [ ] Gitee Token 不以明文持久化到 LocalStorage
- [ ] 本地仅存在 `encryptedToken`，不存在 Token 明文
- [ ] LocalStorage 中没有明文敏感数据
- [ ] HTTPS 正确配置

### 10.4 兼容性验收

- [ ] Chrome 最新版正常运行
- [ ] Edge 最新版正常运行
- [ ] Safari 最新版正常运行
- [ ] Firefox 最新版正常运行
- [ ] 安卓 Chrome 正常运行
- [ ] iOS Safari 正常运行

---

## 附录 A：Gitee API 参考

### A.1 认证方式

- **Personal Access Token**（推荐）
- 权限范围：`projects`（读写仓库）
- 鉴权优先使用 `Authorization` 请求头；`access_token` query 参数仅用于兼容模式

### A.2 常用 API

#### 获取文件内容

```
GET /api/v5/repos/{owner}/{repo}/contents/{path}
参数：
  - Authorization: token {PAT}（推荐）
  - ref: string（分支名，默认 main）
兼容参数（可选）：
  - access_token: string（仅兼容模式）
```

#### 创建/更新文件

```
POST /api/v5/repos/{owner}/{repo}/contents/{path}
参数：
  - Authorization: token {PAT}（推荐）
  - content: string（Base64 编码，必填）
  - message: string（提交信息，必填）
  - branch: string（分支名，默认 main）
  - sha: string（更新时必填，使用上传前读取的 expectedSha 做 CAS）
兼容参数（可选）：
  - access_token: string（仅兼容模式）
```

#### 获取仓库信息

```
GET /api/v5/repos/{owner}/{repo}
参数：
  - Authorization: token {PAT}（推荐）
兼容参数（可选）：
  - access_token: string（仅兼容模式）
```

---

## 附录 B：术语表

| 术语 | 说明 |
|------|------|
| SPA | Single Page Application，单页应用 |
| PWA | Progressive Web App，渐进式 Web 应用 |
| WYSIWYG | What You See Is What You Get，所见即所得 |
| PBKDF2 | Password-Based Key Derivation Function 2，密钥派生函数 |
| AES-256-GCM | 高级加密标准，256 位密钥，GCM 模式 |
| IV | Initialization Vector，初始化向量 |
| IndexedDB | 浏览器端数据库 |
| Service Worker | 后台运行的 JavaScript，用于 PWA |
| Gitee | 码云，中国版 GitHub |
| Personal Access Token | 个人访问令牌，用于 API 认证 |
