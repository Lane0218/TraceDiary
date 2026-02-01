# Trace Diary - 规格说明书
---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [核心命令](#2-核心命令)
3. [技术栈与依赖](#3-技术栈与依赖)
4. [项目结构](#4-项目结构)
5. [代码风格](#5-代码风格)
6. [测试策略](#6-测试策略)
7. [Git 工作流](#7-git-工作流)
8. [边界约束（三级系统）](#8-边界约束三级系统)
9. [功能模块详细规格](#9-功能模块详细规格)
10. [数据结构与存储](#10-数据结构与存储)
11. [安全与隐私](#11-安全与隐私)
12. [性能要求](#12-性能要求)
13. [开发阶段](#13-开发阶段)
14. [验收标准](#14-验收标准)

---

## 📖 摘要化目录 (Extended TOC with Summaries)

> 本节为 AI 智能体设计，提供每个章节的简明摘要和引用标签，便于快速定位和按需加载详细内容。

**§1 项目概述** → 本地优先的 Windows 桌面日记软件，采用 Markdown WYSIWYG 编辑，核心特色为"往年今日"功能（查看 2022 年至今同月同日历史记录）；基于 Tauri + Rust 架构，安装包仅 10-20MB。目标用户为重视隐私的 Markdown 爱好者。*详见完整规格 [§1](#1-项目概述)*

**§2 核心命令** → Windows 原生开发环境配置（Rust + Node.js + Tauri CLI）；关键命令包括 `cargo test`（Rust 测试）、`npm test`（前端测试）、`npm run tauri dev`（开发模式）、`npm run tauri build`（生产构建），所有测试在提交前必须通过。*详见完整规格 [§2](#2-核心命令)*

**§3 技术栈与依赖** → 前端：React 18 + TypeScript 5 + Milkdown 7.x（WYSIWYG 编辑器）+ react-window（虚拟滚动）；后端：Rust（rusqlite + aes-gcm + argon2 + octocrab）。完整依赖清单见 package.json 和 Cargo.toml。选择 Tauri 以减小体积，Milkdown 实现真正的所见即所得。*详见完整规格 [§3](#3-技术栈与依赖)*

**§4 项目结构** → 前端代码在 `src/`（组件/hooks/utils），后端代码在 `src-tauri/`（commands/database/crypto/sync）。命名规范：前端 kebab-case，后端 snake_case。模块职责清晰划分，避免循环依赖。*详见完整规格 [§4](#4-项目结构)*

**§5 代码风格** → TypeScript 风格：函数组件 + 严格类型安全（禁用 `any`）+ 显式返回类型。Rust 风格：遵循官方规范（rustfmt）+ 避免 `unwrap()` + 使用 `Result<T, E>` 错误处理。包含完整代码示例（EditorContainer、EncryptionService 等）。*详见完整规格 [§5](#5-代码风格)*

**§6 测试策略** → 测试金字塔：Rust 单元测试（cargo test + mockall）+ 前端单元测试（Jest + React Testing Library）+ E2E 核心路径测试（tauri-driver）。提交前所有测试必须通过，核心模块要求 ≥80% 覆盖率。*详见完整规格 [§6](#6-测试策略)*

**§7 Git 工作流** → 分支策略：main（稳定版）/ develop（开发版）/ feature/*（功能分支）。提交信息遵循 Conventional Commits 规范（feat/fix/docs/test）。PR 必须通过 CI 检查（测试 + lint + type-check）后才能合并。*详见完整规格 [§7](#7-git-工作流)*

**§8 边界约束（三级系统）** → ✅ 始终执行：运行测试、遵循命名规范、类型检查、错误处理；⚠️ 先询问：添加依赖（说明大小影响）、架构变更、数据库 schema 修改；🚫 禁止执行：提交明文密码/API 密钥、记录敏感数据、使用弱加密、删除用户数据、修改 node_modules/。*详见完整规格 [§8](#8-边界约束三级系统)*

**§9 功能模块详细规格** → 四个核心模块：9.1 Milkdown 编辑器（三种视图：阅读/编辑/源码，无工具栏设计）；9.2 往年今日查询（2022-至今，虚拟滚动优化，固定 3 行预览）；9.3 密码验证（首次设置 + 每 7 天验证，Argon2 哈希）；9.4 GitHub 自动同步（30 秒防抖 + 冲突解决对话框）。每个模块包含完整 TypeScript 和 Rust 代码示例。*详见完整规格 [§9](#9-功能模块详细规格)*

**§10 数据结构与存储** → SQLite schema：diaries 表（date/year/month/day/filename/word_count/created_at/modified_at）+ 索引（month, day, year DESC）。文件系统：diaries/YYYY-MM-DD.md（AES-256-GCM 加密）。包含完整 Rust 数据模型和 TypeScript 类型定义。*详见完整规格 [§10](#10-数据结构与存储)*

**§11 安全与隐私** → 加密算法：AES-256-GCM（数据加密）+ Argon2（密钥派生）。密码要求：≥8 字符，必须包含字母和数字。密钥存储：Windows Credential Manager（keyring 库）。Tauri 安全配置：禁用危险 API（shell/clipboard/notification），启用 CSP。*详见完整规格 [§11](#11-安全与隐私)*

**§12 性能要求** → 应用启动 ≤3 秒，切换日期 ≤200ms，往年今日查询（5 年数据）≤1 秒，编辑器输入延迟 ≤50ms，内存占用 ≤100MB，安装包体积 ≤20MB。往年今日功能使用率目标 ≥80%。*详见完整规格 [§12](#12-性能要求)*

**§13 开发阶段** → 四阶段开发计划：阶段 1（基础框架 + 编辑器 + 本地存储 + 日历导航）；阶段 2（往年今日 + 密码验证 + 主题切换）；阶段 3（GitHub 同步 + 冲突解决）；阶段 4（性能优化 + E2E 测试 + 文档完善）。每个阶段包含详细任务清单和验收标准。*详见完整规格 [§13](#13-开发阶段)*

**§14 验收标准** → 四个维度：功能验收（所有 MVP 功能正常工作）、性能验收（满足 §12 所有指标）、质量验收（测试覆盖率 ≥80%，无已知严重 bug）、用户体验验收（界面流畅无卡顿，操作符合直觉）。最终交付清单包含源码、安装程序、用户文档、测试报告。*详见完整规格 [§14](#14-验收标准)*

---

## 1. 项目概述

### 1.1 产品定位

**Trace Diary** 是一款本地优先的桌面日记软件，以 Markdown 为底层格式，提供接近 Obsidian 的所见即所得编辑体验，核心特色是"往年今日"功能——让用户能够轻松回顾历史同期的记录，感受时光流转。

**核心价值主张：**
- 🔒 **隐私至上**：本地加密存储（AES-256），无第三方服务器
- ⏳ **时光回溯**：查看 2022 年至今所有同月同日的历史记录
- ✍️ **优雅编辑**：Markdown WYSIWYG，三种视图（阅读/编辑/源码）
- ☁️ **安全同步**：加密文件自动同步到 GitHub 私有仓库
- 📦 **轻量高效**：安装包 ~10-20MB（Tauri 架构）

### 1.2 目标用户

- 重视数据隐私和本地控制的用户
- 喜欢用 Markdown 记录的技术爱好者
- 注重长期记录、愿意回顾历史的日记爱好者
- 熟悉或愿意学习 GitHub 的用户

### 1.3 MVP 功能范围

**第一版（MVP）必须包含：**
- ✅ Markdown 编辑器（WYSIWYG，三种视图）
- ✅ 日记创建、保存、加载
- ✅ 往年今日查询（2022 至今，虚拟滚动）
- ✅ 日历导航（月份切换、日期选择）
- ✅ 本地 AES-256 加密存储
- ✅ 密码验证（首次设置，每 7 天验证）
- ✅ GitHub 自动同步（30 秒延迟防抖）
- ✅ 主题切换（深色/浅色模式）

**可选功能（后续版本）：**
- 全文搜索
- 数据导入（txt/md 批量导入）
- 统计面板（字数、连续记录天数）
- 标签系统

### 1.4 成功标准

| 指标 | 目标值 |
|------|--------|
| 应用启动时间 | ≤ 3 秒 |
| 切换日期响应 | ≤ 200ms |
| 往年今日查询（5 年数据） | ≤ 1 秒 |
| 编辑器输入延迟 | ≤ 50ms |
| 内存占用（正常使用） | ≤ 100MB |
| 安装包体积 | ≤ 20MB |
| 往年今日功能使用率 | ≥ 80% |

---

## 2. 核心命令

### 2.1 开发环境要求

**操作系统**：Windows 10/11 (x64)
**开发环境**：Windows 原生

**必备工具：**
```powershell
# 1. 安装 Rust
winget install Rustlang.Rustup

# 2. 安装 Node.js 18+
winget install OpenJS.NodeJS.LTS

# 3. 安装 Tauri CLI
cargo install tauri-cli

# 4. 验证安装
rustc --version   # >= 1.70.0
node --version    # >= 18.0.0
cargo tauri --version
```

### 2.2 核心开发命令

```bash
# 克隆项目
git clone https://github.com/Lane0218/TraceDiary.git
cd TraceDiary

# 安装前端依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 类型检查（TypeScript）
npm run type-check

# 代码检查（ESLint）
npm run lint

# Rust 单元测试
cargo test

# 前端单元测试
npm test

# 构建生产版本
npm run tauri build

# 生成 Windows 安装程序
npm run tauri build --bundles msi
```

### 2.3 关键命令说明

| 命令 | 用途 | 必须通过 |
|------|------|---------|
| `cargo test` | Rust 后端单元测试 | ✅ 提交前必须通过 |
| `npm test` | 前端单元测试 | ✅ 提交前必须通过 |
| `npm run lint` | ESLint 代码检查 | ✅ 提交前必须无错误 |
| `npm run type-check` | TypeScript 类型检查 | ✅ 提交前必须通过 |
| `npm run tauri build` | 构建应用 | ✅ 发布前必须成功 |

---

## 3. 技术栈与依赖

### 3.1 核心技术栈

```
┌─────────────────────────────────────────┐
│  Tauri 1.5+ (桌面框架)                  │
├─────────────────────────────────────────┤
│  前端                                   │
│  - React 18.2+                          │
│  - TypeScript 5.x                       │
│  - Tailwind CSS 3.4+                    │
│  - Milkdown 7.x (Markdown WYSIWYG)      │
│  - react-window 1.8+ (虚拟滚动)         │
├─────────────────────────────────────────┤
│  后端（Rust）                           │
│  - rusqlite 0.30+ (SQLite 数据库)       │
│  - aes-gcm 0.10+ (AES-256 加密)         │
│  - argon2 0.5+ (密钥派生)               │
│  - octocrab 0.30+ (GitHub API)          │
│  - chrono 0.4+ (日期时间)               │
│  - serde 1.0+ (序列化)                  │
│  - tokio 1.35+ (异步运行时)             │
├─────────────────────────────────────────┤
│  测试                                   │
│  - Rust: cargo test + mockall           │
│  - 前端: Jest + React Testing Library   │
│  - E2E: tauri-driver (核心路径测试)     │
└─────────────────────────────────────────┘
```

### 3.2 前端依赖（package.json）

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tauri-apps/api": "^1.5.0",
    "@milkdown/core": "^7.3.0",
    "@milkdown/react": "^7.3.0",
    "@milkdown/preset-commonmark": "^7.3.0",
    "@milkdown/preset-gfm": "^7.3.0",
    "@milkdown/theme-nord": "^7.3.0",
    "@milkdown/plugin-prism": "^7.3.0",
    "react-window": "^1.8.10",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^1.5.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.18.0",
    "jest": "^29.7.0",
    "@testing-library/react": "^14.1.0"
  }
}
```

### 3.3 Rust 依赖（Cargo.toml）

```toml
[package]
name = "TraceDiary"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1.5", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rusqlite = { version = "0.30", features = ["bundled"] }
aes-gcm = "0.10"
argon2 = "0.5"
octocrab = "0.30"
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1.35", features = ["full"] }
anyhow = "1.0"
thiserror = "1.0"

[dev-dependencies]
mockall = "0.12"

[build-dependencies]
tauri-build = { version = "1.5" }
```

### 3.4 为什么选择这些技术？

**Tauri：**
- ✅ 安装包体积小（~10-20MB vs Electron 100MB+）
- ✅ 内存占用低（~50MB vs Electron 150MB+）
- ✅ Rust 后端天然集成，安全高效
- ✅ Windows 原生支持成熟

**Milkdown：**
- ✅ 专为 Markdown WYSIWYG 设计（基于 ProseMirror）
- ✅ 支持三种视图模式（阅读/编辑/源码）
- ✅ 轻量（~200KB gzipped）
- ✅ 高度可定制（蓝色主题）
- ✅ 插件系统灵活（仅启用需要的功能）

**Rust 后端：**
- ✅ 内存安全，无垃圾回收（适合长期运行）
- ✅ 优秀的加密库生态（aes-gcm, argon2）
- ✅ SQLite 集成稳定（rusqlite）
- ✅ 异步性能出色（tokio）

---

## 4. 项目结构

### 4.1 完整目录树

```
TraceDiary/
├── src/                          # 前端代码（React + TypeScript）
│   ├── App.tsx                   # 根组件
│   ├── main.tsx                  # 入口文件
│   ├── components/
│   │   ├── Calendar/
│   │   │   ├── Calendar.tsx      # 日历组件
│   │   │   ├── MonthView.tsx     # 月份视图
│   │   │   └── Calendar.module.css
│   │   ├── Editor/
│   │   │   ├── EditorContainer.tsx  # 编辑器容器
│   │   │   ├── ReadingView.tsx      # 阅读视图（只读）
│   │   │   ├── EditingView.tsx      # 编辑视图（WYSIWYG）
│   │   │   ├── SourceView.tsx       # 源码视图
│   │   │   └── ViewSwitcher.tsx     # 视图切换器
│   │   ├── HistoryPanel/
│   │   │   ├── HistoryPanel.tsx     # 往年今日面板
│   │   │   ├── HistoryCard.tsx      # 历史卡片
│   │   │   └── VirtualList.tsx      # 虚拟滚动列表
│   │   ├── StatusBar/
│   │   │   └── StatusBar.tsx        # 底部状态栏（同步状态）
│   │   └── Dialogs/
│   │       ├── PasswordDialog.tsx   # 密码输入对话框
│   │       ├── SyncConfigDialog.tsx # 同步配置对话框
│   │       └── ConflictDialog.tsx   # 冲突解决对话框
│   ├── hooks/
│   │   ├── useDiary.ts              # 日记操作 Hook
│   │   ├── useHistory.ts            # 往年今日 Hook
│   │   ├── useSync.ts               # 同步状态 Hook
│   │   └── useTheme.ts              # 主题切换 Hook
│   ├── services/
│   │   └── tauriCommands.ts         # 类型化的 Tauri 命令封装
│   ├── types/
│   │   ├── diary.ts                 # 日记类型定义
│   │   ├── sync.ts                  # 同步类型定义
│   │   └── history.ts               # 历史记录类型
│   ├── utils/
│   │   ├── dateUtils.ts             # 日期工具函数
│   │   └── markdownUtils.ts         # Markdown 工具函数
│   └── styles/
│       ├── globals.css              # 全局样式
│       └── milkdown-theme.css       # Milkdown 自定义主题
│
├── src-tauri/                    # Rust 后端代码
│   ├── src/
│   │   ├── main.rs               # Tauri 主入口
│   │   ├── lib.rs                # 库根模块
│   │   ├── commands/             # Tauri 命令（前端调用接口）
│   │   │   ├── mod.rs
│   │   │   ├── diary.rs          # 日记 CRUD 命令
│   │   │   ├── history.rs        # 往年今日查询命令
│   │   │   ├── password.rs       # 密码验证命令
│   │   │   └── sync.rs           # GitHub 同步命令
│   │   ├── database/             # SQLite 数据库模块
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs     # 数据库连接管理
│   │   │   ├── schema.rs         # 表结构定义
│   │   │   ├── diary_repo.rs     # 日记数据仓库
│   │   │   └── settings_repo.rs  # 设置数据仓库
│   │   ├── crypto/               # 加密模块
│   │   │   ├── mod.rs
│   │   │   ├── encryption.rs     # AES-256 加密/解密
│   │   │   └── password.rs       # Argon2 密码哈希
│   │   ├── sync/                 # GitHub 同步模块
│   │   │   ├── mod.rs
│   │   │   ├── github_client.rs  # GitHub API 客户端
│   │   │   ├── sync_engine.rs    # 同步引擎（防抖、队列）
│   │   │   └── conflict.rs       # 冲突检测与解决
│   │   ├── models/               # 数据模型
│   │   │   ├── mod.rs
│   │   │   ├── diary.rs
│   │   │   └── settings.rs
│   │   └── error.rs              # 统一错误类型
│   ├── Cargo.toml                # Rust 依赖配置
│   ├── tauri.conf.json           # Tauri 配置文件
│   └── build.rs                  # 构建脚本
│
├── tests/                        # E2E 测试
│   ├── core-flow.spec.ts         # 核心流程测试
│   └── setup.ts                  # 测试环境配置
│
├── docs/                         # 文档
│   ├── PRD.md                    # 产品需求文档
│   ├── SPEC.md                   # 本规格说明书
│   └── README.md                 # 用户使用指南
│
├── .github/
│   └── workflows/
│       └── ci.yml                # CI/CD 配置
│
├── package.json                  # 前端依赖
├── tsconfig.json                 # TypeScript 配置
├── tailwind.config.js            # Tailwind 配置
├── vite.config.ts                # Vite 配置
└── README.md                     # 项目说明
```

### 4.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| **React 组件** | PascalCase | `Calendar.tsx`, `EditorContainer.tsx` |
| **Hooks** | camelCase + `use` 前缀 | `useDiary.ts`, `useHistory.ts` |
| **工具函数** | camelCase | `dateUtils.ts`, `markdownUtils.ts` |
| **类型文件** | camelCase + `.ts` | `diary.ts`, `sync.ts` |
| **Rust 模块** | snake_case | `diary_repo.rs`, `sync_engine.rs` |
| **Rust 结构体** | PascalCase | `DiaryEntry`, `SyncConfig` |
| **常量** | UPPER_SNAKE_CASE | `BRAND_COLOR`, `MAX_FILE_SIZE` |

### 4.3 模块职责划分

**前端（`src/`）：**
- UI 渲染和用户交互
- 状态管理（React Hooks）
- 调用 Tauri 命令（通过 IPC）
- 不直接操作文件系统和数据库

**后端（`src-tauri/`）：**
- 文件系统操作（加密文件读写）
- SQLite 数据库操作
- AES-256 加密/解密
- GitHub API 调用
- 密码验证和密钥派生

---

## 5. 代码风格

### 5.1 TypeScript 风格示例

**✅ 推荐的 React 组件写法：**

```typescript
// src/components/Calendar/Calendar.tsx
import React, { useState, useEffect } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import type { DiaryEntry } from '@/types/diary';

interface CalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  diariesMap: Map<string, boolean>; // 日期字符串 → 是否有日记
}

/**
 * 日历组件
 *
 * 功能：
 * - 显示当月所有日期
 * - 高亮今日和选中日期
 * - 标记有日记的日期（蓝色小圆点）
 * - 支持月份切换
 */
export const Calendar: React.FC<CalendarProps> = ({
  selectedDate,
  onDateSelect,
  diariesMap,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handleDateClick = (date: Date) => {
    onDateSelect(date);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  };

  return (
    <div className="calendar-container p-4 bg-white dark:bg-gray-800 rounded-lg">
      {/* 月份切换 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          ← 上月
        </button>
        <span className="text-lg font-semibold">
          {format(currentMonth, 'yyyy年MM月')}
        </span>
        <button
          onClick={handleNextMonth}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          下月 →
        </button>
      </div>

      {/* 日历网格 */}
      <div className="grid grid-cols-7 gap-2">
        {/* 日期渲染逻辑... */}
      </div>
    </div>
  );
};
```

**✅ 推荐的 Tauri 命令封装：**

```typescript
// src/services/tauriCommands.ts
import { invoke } from '@tauri-apps/api/tauri';
import type { DiaryEntry, CreateDiaryInput, UpdateDiaryInput } from '@/types/diary';
import type { HistoricalDiary } from '@/types/history';

/**
 * 创建新日记
 */
export async function createDiary(input: CreateDiaryInput): Promise<DiaryEntry> {
  return invoke<DiaryEntry>('create_diary', { input });
}

/**
 * 根据日期获取日记
 */
export async function getDiaryByDate(date: string): Promise<DiaryEntry | null> {
  return invoke<DiaryEntry | null>('get_diary_by_date', { date });
}

/**
 * 更新日记内容
 */
export async function updateDiary(
  date: string,
  input: UpdateDiaryInput
): Promise<void> {
  return invoke('update_diary', { date, input });
}

/**
 * 获取往年今日的所有日记
 *
 * @param monthDay - 月-日格式（如 "01-31"）
 * @param currentYear - 当前年份
 * @returns 按年份倒序排列的历史日记
 */
export async function getHistoricalDiaries(
  monthDay: string,
  currentYear: number
): Promise<HistoricalDiary[]> {
  return invoke<HistoricalDiary[]>('get_historical_diaries', {
    monthDay,
    currentYear,
  });
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string): Promise<boolean> {
  return invoke<boolean>('verify_password', { password });
}

/**
 * 触发 GitHub 同步
 */
export async function triggerSync(): Promise<void> {
  return invoke('trigger_sync');
}
```

### 5.2 Rust 风格示例

**✅ 推荐的 Tauri 命令写法：**

```rust
// src-tauri/src/commands/diary.rs
use crate::database::diary_repo::DiaryRepository;
use crate::models::diary::{DiaryEntry, CreateDiaryInput, UpdateDiaryInput};
use crate::crypto::encryption::EncryptionService;
use crate::error::AppError;
use tauri::State;

/// 创建新日记
///
/// # 参数
/// - `input`: 日记创建输入（日期 + 内容）
/// - `diary_repo`: 日记数据仓库
/// - `encryption`: 加密服务
///
/// # 返回
/// - `Ok(DiaryEntry)`: 创建成功，返回日记条目
/// - `Err(AppError)`: 创建失败
#[tauri::command]
pub async fn create_diary(
    input: CreateDiaryInput,
    diary_repo: State<'_, DiaryRepository>,
    encryption: State<'_, EncryptionService>,
) -> Result<DiaryEntry, AppError> {
    // 1. 加密日记内容
    let encrypted_content = encryption.encrypt(&input.content)?;

    // 2. 保存到数据库
    let entry = diary_repo.create(input.date.clone(), encrypted_content).await?;

    // 3. 保存加密文件到磁盘
    let file_path = format!("diaries/{}.md", input.date);
    std::fs::write(&file_path, encrypted_content)?;

    Ok(entry)
}

/// 根据日期获取日记
#[tauri::command]
pub async fn get_diary_by_date(
    date: String,
    diary_repo: State<'_, DiaryRepository>,
    encryption: State<'_, EncryptionService>,
) -> Result<Option<DiaryEntry>, AppError> {
    // 1. 从数据库查询
    let entry = diary_repo.find_by_date(&date).await?;

    if let Some(mut entry) = entry {
        // 2. 读取加密文件
        let file_path = format!("diaries/{}.md", date);
        let encrypted_content = std::fs::read_to_string(&file_path)?;

        // 3. 解密内容
        entry.content = encryption.decrypt(&encrypted_content)?;

        Ok(Some(entry))
    } else {
        Ok(None)
    }
}

/// 获取往年今日的所有日记
#[tauri::command]
pub async fn get_historical_diaries(
    month_day: String,      // 格式：MM-DD
    current_year: i32,
    diary_repo: State<'_, DiaryRepository>,
    encryption: State<'_, EncryptionService>,
) -> Result<Vec<HistoricalDiary>, AppError> {
    // 1. 查询数据库（2022 年至今）
    let mut entries = diary_repo
        .find_by_month_day(&month_day, 2022, current_year - 1)
        .await?;

    // 2. 解密每条日记内容
    for entry in &mut entries {
        let file_path = format!("diaries/{}.md", entry.date);
        if let Ok(encrypted_content) = std::fs::read_to_string(&file_path) {
            entry.content = encryption.decrypt(&encrypted_content).unwrap_or_default();
        }
    }

    // 3. 转换为历史日记格式（计算年份差）
    let historical: Vec<HistoricalDiary> = entries
        .into_iter()
        .map(|entry| {
            let years_ago = current_year - entry.year;
            HistoricalDiary {
                entry,
                years_ago,
                display_date: format!("{}年{}", entry.year, month_day.replace("-", "月") + "日"),
            }
        })
        .collect();

    Ok(historical)
}
```

**✅ 推荐的加密模块写法：**

```rust
// src-tauri/src/crypto/encryption.rs
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Argon2, PasswordHasher};
use rand::Rng;
use crate::error::AppError;

/// AES-256-GCM 加密服务
pub struct EncryptionService {
    key: Vec<u8>,
}

impl EncryptionService {
    /// 从用户密码派生加密密钥
    ///
    /// 使用 Argon2 密钥派生函数（KDF）
    pub fn from_password(password: &str, salt: &[u8]) -> Result<Self, AppError> {
        let argon2 = Argon2::default();
        let mut key = vec![0u8; 32]; // 256 位密钥

        argon2
            .hash_password_into(password.as_bytes(), salt, &mut key)
            .map_err(|_| AppError::CryptoError("密钥派生失败".to_string()))?;

        Ok(Self { key })
    }

    /// 加密内容
    ///
    /// # 参数
    /// - `plaintext`: 明文内容
    ///
    /// # 返回
    /// - `Ok(String)`: Base64 编码的 "nonce:ciphertext"
    pub fn encrypt(&self, plaintext: &str) -> Result<String, AppError> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|_| AppError::CryptoError("密钥长度错误".to_string()))?;

        // 生成随机 nonce（96 位）
        let mut rng = rand::thread_rng();
        let nonce_bytes: [u8; 12] = rng.gen();
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 加密
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| AppError::CryptoError("加密失败".to_string()))?;

        // 格式：nonce:ciphertext（都用 Base64 编码）
        let nonce_b64 = base64::encode(nonce_bytes);
        let ciphertext_b64 = base64::encode(ciphertext);

        Ok(format!("{}:{}", nonce_b64, ciphertext_b64))
    }

    /// 解密内容
    ///
    /// # 参数
    /// - `encrypted`: Base64 编码的 "nonce:ciphertext"
    ///
    /// # 返回
    /// - `Ok(String)`: 解密后的明文
    pub fn decrypt(&self, encrypted: &str) -> Result<String, AppError> {
        let parts: Vec<&str> = encrypted.split(':').collect();
        if parts.len() != 2 {
            return Err(AppError::CryptoError("加密数据格式错误".to_string()));
        }

        let nonce_bytes = base64::decode(parts[0])
            .map_err(|_| AppError::CryptoError("Nonce 解码失败".to_string()))?;
        let ciphertext = base64::decode(parts[1])
            .map_err(|_| AppError::CryptoError("密文解码失败".to_string()))?;

        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|_| AppError::CryptoError("密钥长度错误".to_string()))?;

        let nonce = Nonce::from_slice(&nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|_| AppError::CryptoError("解密失败（密码可能错误）".to_string()))?;

        String::from_utf8(plaintext)
            .map_err(|_| AppError::CryptoError("解密结果不是有效 UTF-8".to_string()))
    }
}
```

### 5.3 代码风格规则

**TypeScript：**
- ✅ 使用 `const` 和 `let`，禁止 `var`
- ✅ 优先使用函数组件和 Hooks
- ✅ 使用命名导出（`export const`），避免默认导出
- ✅ 所有函数必须有 JSDoc 注释
- ✅ 禁止使用 `any`，必要时使用 `unknown`
- ✅ 异步操作使用 `async/await`

**Rust：**
- ✅ 使用 `cargo fmt` 自动格式化
- ✅ 使用 `cargo clippy` 检查代码质量
- ✅ 所有公共函数必须有文档注释（`///`）
- ✅ 错误处理使用 `Result<T, E>`，不使用 `unwrap()`（除测试外）
- ✅ 异步函数使用 `async fn` + `tokio`

---

## 6. 测试策略

### 6.1 测试金字塔（核心路径优先）

```
           /\
          /E2E\         端到端测试（10% - 仅核心路径）
         /------\
        /Integration\   集成测试（20%）
       /------------\
      /  Unit Tests  \  单元测试（70%）
     /________________\
```

### 6.2 Rust 后端单元测试

**测试框架**：`cargo test` + `mockall`（Mock）

**核心模块测试覆盖：**
- ✅ 加密/解密（`crypto` 模块）
- ✅ 往年今日查询逻辑（`database::diary_repo`）
- ✅ 密码验证（`crypto::password`）
- ✅ 同步冲突检测（`sync::conflict`）

**单元测试示例：**

```rust
// src-tauri/src/crypto/encryption.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // Arrange
        let password = "test-password-123";
        let salt = b"test-salt-16byte";
        let service = EncryptionService::from_password(password, salt).unwrap();
        let plaintext = "# 今天的日记\n\n这是测试内容。";

        // Act
        let encrypted = service.encrypt(plaintext).unwrap();
        let decrypted = service.decrypt(&encrypted).unwrap();

        // Assert
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_decrypt_with_wrong_password_fails() {
        // Arrange
        let password1 = "password-123";
        let password2 = "wrong-password";
        let salt = b"test-salt-16byte";

        let service1 = EncryptionService::from_password(password1, salt).unwrap();
        let service2 = EncryptionService::from_password(password2, salt).unwrap();

        let plaintext = "Secret message";
        let encrypted = service1.encrypt(plaintext).unwrap();

        // Act & Assert
        assert!(service2.decrypt(&encrypted).is_err());
    }
}
```

**往年今日查询测试：**

```rust
// src-tauri/src/database/diary_repo.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_find_by_month_day_returns_correct_years() {
        // Arrange
        let repo = DiaryRepository::new_in_memory().await.unwrap();

        // 插入测试数据（2022-2025 年的 1 月 31 日）
        for year in 2022..=2025 {
            let date = format!("{}-01-31", year);
            repo.create(date, "encrypted_content".to_string()).await.unwrap();
        }

        // Act
        let results = repo.find_by_month_day("01-31", 2022, 2025).await.unwrap();

        // Assert
        assert_eq!(results.len(), 4);
        assert_eq!(results[0].year, 2025); // 倒序
        assert_eq!(results[3].year, 2022);
    }

    #[tokio::test]
    async fn test_find_by_month_day_excludes_current_year() {
        let repo = DiaryRepository::new_in_memory().await.unwrap();

        repo.create("2026-01-31".to_string(), "content".to_string()).await.unwrap();
        repo.create("2025-01-31".to_string(), "content".to_string()).await.unwrap();

        // 查询往年今日（不包含 2026）
        let results = repo.find_by_month_day("01-31", 2022, 2025).await.unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].year, 2025);
    }
}
```

### 6.3 前端单元测试

**测试框架**：Jest + React Testing Library

**核心组件测试：**
- ✅ 日历日期选择
- ✅ 编辑器视图切换
- ✅ 往年今日卡片渲染

**单元测试示例：**

```typescript
// src/components/Calendar/Calendar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Calendar } from './Calendar';

describe('Calendar', () => {
  it('应该高亮显示选中的日期', () => {
    const mockOnSelect = jest.fn();
    const selectedDate = new Date('2026-01-31');

    render(
      <Calendar
        selectedDate={selectedDate}
        onDateSelect={mockOnSelect}
        diariesMap={new Map()}
      />
    );

    const selectedDay = screen.getByText('31');
    expect(selectedDay).toHaveClass('bg-brand-500'); // 蓝色背景
  });

  it('应该在点击日期时调用 onDateSelect', () => {
    const mockOnSelect = jest.fn();

    render(
      <Calendar
        selectedDate={new Date('2026-01-31')}
        onDateSelect={mockOnSelect}
        diariesMap={new Map()}
      />
    );

    const day15 = screen.getByText('15');
    fireEvent.click(day15);

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        getDate: expect.any(Function),
      })
    );
  });

  it('应该为有日记的日期显示小圆点', () => {
    const diariesMap = new Map([['2026-01-15', true]]);

    render(
      <Calendar
        selectedDate={new Date('2026-01-31')}
        onDateSelect={jest.fn()}
        diariesMap={diariesMap}
      />
    );

    const day15Container = screen.getByText('15').closest('.day-cell');
    const dot = day15Container?.querySelector('.diary-dot');

    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-brand-500');
  });
});
```

### 6.4 端到端测试（E2E - 核心路径）

**测试框架**：Tauri WebDriver + WebdriverIO

**测试覆盖范围（仅核心路径）：**
1. ✅ 首次启动 → 设置密码 → 创建今日日记
2. ✅ 选择日期 → 查看往年今日 → 点击历史卡片跳转
3. ✅ 配置 GitHub 同步 → 保存日记 → 触发自动同步

**E2E 测试示例：**

```typescript
// tests/core-flow.spec.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('核心流程测试', () => {
  beforeAll(async () => {
    // 启动 Tauri 应用
    await driver.init();
  });

  afterAll(async () => {
    await driver.quit();
  });

  it('用户应该能够创建今日日记并自动保存', async () => {
    // 1. 首次启动，设置密码
    await driver.waitForVisible('#password-dialog');
    await driver.setValue('#password-input', 'test-password-123');
    await driver.setValue('#password-confirm', 'test-password-123');
    await driver.click('#set-password-btn');

    // 2. 等待主界面加载
    await driver.waitForVisible('.editor-container');

    // 3. 输入日记内容（使用 Milkdown）
    const editor = await driver.$('.milkdown-editor');
    await editor.setValue('# 今天是个好日子\n\n天气晴朗，心情不错。');

    // 4. 等待自动保存（30 秒防抖）
    await driver.pause(31000);

    // 5. 验证底部状态栏显示"已保存"
    const statusBar = await driver.$('.status-bar');
    const statusText = await statusBar.getText();
    expect(statusText).toContain('已保存');

    // 6. 重启应用，验证数据持久化
    await driver.restart();
    await driver.waitForVisible('.editor-container');

    const editorContent = await editor.getText();
    expect(editorContent).toContain('今天是个好日子');
  });

  it('用户应该能够查看往年今日并跳转', async () => {
    // 假设已有历史数据
    // 1. 点击日历上的某个日期
    await driver.click('[data-date="2026-01-31"]');

    // 2. 右侧往年今日面板应显示历史记录
    await driver.waitForVisible('.history-panel');
    const historyCards = await driver.$$('.history-card');
    expect(historyCards.length).toBeGreaterThan(0);

    // 3. 点击第一张历史卡片
    await historyCards[0].click();

    // 4. 验证日历跳转到对应日期，编辑器加载内容
    const calendarDate = await driver.$('[data-selected="true"]').getText();
    expect(calendarDate).toMatch(/2025年1月31日/);
  });
});
```

### 6.5 测试运行要求

**提交前必须执行：**
```bash
# Rust 后端单元测试
cargo test

# 前端单元测试
npm test

# 代码检查
npm run lint
cargo clippy
```

**发布前执行：**
```bash
# E2E 核心路径测试
npm run test:e2e

# 构建验证
npm run tauri build
```

---

## 7. Git 工作流

### 7.1 分支策略

**主分支：**
- `main`：生产分支，随时可发布
- `develop`：开发分支，集成最新功能（可选，小团队可省略）

**功能分支：**
- `feature/功能名称`：新功能开发
- `fix/bug描述`：Bug 修复
- `refactor/重构内容`：代码重构
- `docs/文档更新`：文档修改

**示例：**
```bash
feature/milkdown-editor
feature/history-query
fix/calendar-date-bug
refactor/encryption-module
docs/update-readme
```

### 7.2 提交信息规范（Conventional Commits）

**格式：**
```
<类型>(<作用域>): <简短描述>

<详细描述>（可选）

<关联 Issue>（可选）
```

**类型（type）：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具配置

**示例：**
```bash
feat(editor): 集成 Milkdown WYSIWYG 编辑器

- 支持三种视图模式切换（阅读/编辑/源码）
- 应用海洋蓝主题
- 配置 CommonMark + GFM 插件

Closes #12
```

```bash
fix(history): 修复往年今日查询年份边界问题

当用户选择 2 月 29 日时，正确跳过非闰年。

Fixes #24
```

### 7.3 Pull Request 流程

**PR 标题规范：**
```
[类型] 简短描述（不超过 50 字符）
```

**PR 描述模板：**
```markdown
## 变更类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 文档更新

## 变更内容
简要描述本次变更的内容和原因。

## 测试
- [ ] Rust 后端单元测试已通过
- [ ] 前端单元测试已通过
- [ ] 手动测试已完成

## 截图（如适用）
[粘贴截图]

## 关联 Issue
Closes #XX
```

**PR 合并要求：**
- ✅ 所有自动化测试通过（CI）
- ✅ 代码审查通过（至少 1 人）
- ✅ 无合并冲突
- ✅ 提交历史清晰

---

## 8. 边界约束（三级系统）

### 8.1 ✅ 始终执行（Always Do）

**无需询问，AI 可以自动执行：**

1. **代码质量**
   - 提交前运行 `cargo test`、`npm test`、`npm run lint`、`cargo clippy`
   - 自动格式化代码（Rust: `cargo fmt`, TypeScript: Prettier）
   - 添加必要的文档注释（Rust `///`, TypeScript JSDoc）

2. **命名规范**
   - 遵循第 4.2 节定义的命名规范
   - React 组件使用 PascalCase
   - Rust 模块使用 snake_case
   - 变量和函数使用 camelCase (TS) / snake_case (Rust)

3. **类型安全**
   - TypeScript：所有函数必须有明确类型，禁止使用 `any`
   - Rust：避免使用 `unwrap()`，改用 `?` 或 `unwrap_or_default()`

4. **错误处理**
   - 所有异步操作必须用 `try-catch` (TS) 或 `Result<T, E>` (Rust) 包裹
   - 用户可见的错误必须有友好提示（中文）
   - 后台错误必须记录日志

5. **测试覆盖**
   - 新增核心功能必须编写单元测试
   - 修复 Bug 必须添加回归测试

6. **Git 提交**
   - 提交信息遵循 Conventional Commits 规范
   - 每次提交只包含一个逻辑变更

### 8.2 ⚠️ 先询问（Ask First）

**需要人类确认的高影响操作：**

1. **架构变更**
   - 添加新的依赖包（Rust crate 或 npm 包）
     - **示例**：想要引入 `serde_yaml` 解析配置文件
     - **询问模板**：
       ```
       ⚠️ 需要确认：
       操作：添加 `serde_yaml` 依赖用于 YAML 配置解析
       影响：增加 ~200KB 二进制体积，引入新的配置格式
       理由：支持 YAML 格式的配置文件，提升可读性
       替代方案：继续使用 JSON 配置（当前方案）

       是否继续？[Y/N]
       ```
   - 修改项目结构（移动/重命名核心目录）
   - 改变数据库 Schema（SQLite 表结构）

2. **破坏性变更**
   - 修改公共 API 接口（Tauri 命令签名）
   - 删除现有功能
   - 修改加密算法或密钥派生逻辑（安全敏感）

3. **外部服务**
   - 修改 GitHub API 调用逻辑
   - 更改同步策略（防抖时间、冲突解决）
   - 调整网络请求超时时间

4. **性能优化**
   - 引入缓存机制
   - 修改数据库索引
   - 调整虚拟滚动参数

5. **用户体验**
   - 修改核心交互流程
   - 调整默认配置项
   - 改变快捷键绑定

### 8.3 🚫 禁止执行（Never Do）

**绝对禁止的操作（硬停止）：**

1. **安全违规**
   - ❌ **提交明文密码、API 密钥、私钥到 Git**
   - ❌ 在日志中打印用户的加密密码或密钥
   - ❌ 使用弱加密算法（MD5、SHA1）
   - ❌ 禁用 Tauri 安全特性（如 CSP）

2. **数据完整性**
   - ❌ 直接修改 `target/` 或 `node_modules/` 目录
   - ❌ 编辑用户的加密日记文件（必须通过加密/解密流程）
   - ❌ 删除用户数据而不备份

3. **代码质量**
   - ❌ 使用 `eval()` 或动态代码执行
   - ❌ 忽略 TypeScript 类型错误（`@ts-ignore` 滥用）
   - ❌ 在 Rust 中滥用 `unwrap()` 导致 panic
   - ❌ 删除失败的测试而不修复

4. **版本控制**
   - ❌ 强制推送到 `main` 分支（`git push --force`）
   - ❌ 修改已推送的 Git 历史（rebase 公共分支）
   - ❌ 提交构建产物（`target/`, `dist/`, `node_modules/`）

5. **配置文件**
   - ❌ 修改 `.gitignore` 以提交敏感文件
   - ❌ 禁用 ESLint 规则而不说明原因
   - ❌ 修改 Tauri 安全策略以允许不安全操作

**违规处理：**
```
🚫 操作被阻止：
原因：尝试提交包含 GitHub Token 的文件 (sync_config.json)
规则：边界约束 8.3.1 - 禁止提交明文密钥
建议：使用加密存储 (database) 或环境变量

请修复后重试。
```

---

## 9. 功能模块详细规格

### 9.1 模块 A：Milkdown 编辑器（核心）

**职责**：提供 Markdown WYSIWYG 编辑体验，支持三种视图模式

**技术选型**：Milkdown 7.x（基于 ProseMirror）

#### 9.1.1 三种视图模式

**1. 阅读视图（ReadingView）**
- **触发条件**：打开历史日期的日记（非今日）
- **特征**：只读，纯渲染展示，无工具栏
- **交互**：双击进入编辑视图

```typescript
// src/components/Editor/ReadingView.tsx
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { prism } from '@milkdown/plugin-prism';

export const ReadingView: React.FC<{ content: string }> = ({ content }) => {
  const { editor } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
      })
      .use(commonmark)
      .use(gfm)
      .use(prism)
      // 阅读模式：禁用编辑
      .config((ctx) => {
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => false,
        }));
      })
  );

  return (
    <div className="reading-view prose dark:prose-invert max-w-none p-6">
      <MilkdownProvider>
        <Milkdown />
      </MilkdownProvider>
    </div>
  );
};
```

**2. 编辑视图（EditingView - WYSIWYG）**
- **触发条件**：创建或编辑今日日记
- **特征**：所见即所得，输入 `#` 立即渲染为标题
- **自动保存**：输入后 30 秒触发保存（防抖）

```typescript
// src/components/Editor/EditingView.tsx
export const EditingView: React.FC<{
  initialContent: string;
  onContentChange: (markdown: string) => void;
}> = ({ initialContent, onContentChange }) => {
  const debouncedSave = useMemo(
    () => debounce((content: string) => onContentChange(content), 30000),
    [onContentChange]
  );

  const { editor } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContent);
      })
      .use(commonmark)
      .use(gfm)
      .use(prism)
      .use(listener) // 监听内容变化
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
          debouncedSave(markdown);
        });
      })
  );

  return <Milkdown />;
};
```

**3. 源码视图（SourceView）**
- **触发条件**：用户点击"源码模式"按钮
- **特征**：纯 Markdown 文本编辑（`<textarea>`）
- **用途**：高级用户直接编辑 Markdown 语法

```typescript
// src/components/Editor/SourceView.tsx
export const SourceView: React.FC<{
  content: string;
  onChange: (content: string) => void;
}> = ({ content, onChange }) => {
  return (
    <textarea
      className="source-editor w-full h-full p-6 font-mono text-sm
                 bg-gray-50 dark:bg-gray-900 border-none resize-none"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      placeholder="在此输入 Markdown 源码..."
    />
  );
};
```

#### 9.1.2 视图切换逻辑

```typescript
// src/components/Editor/EditorContainer.tsx
type ViewMode = 'reading' | 'editing' | 'source';

export const EditorContainer: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('editing');
  const [content, setContent] = useState('');
  const { selectedDate } = useDiary();

  // 根据日期决定默认视图
  useEffect(() => {
    const isToday = isSameDay(selectedDate, new Date());
    setViewMode(isToday ? 'editing' : 'reading');
  }, [selectedDate]);

  return (
    <div className="editor-container flex flex-col h-full">
      {/* 视图切换按钮（仅编辑模式显示源码切换） */}
      {viewMode !== 'reading' && (
        <div className="view-switcher flex gap-2 p-2 border-b">
          <button
            onClick={() => setViewMode('editing')}
            className={viewMode === 'editing' ? 'active' : ''}
          >
            编辑模式
          </button>
          <button
            onClick={() => setViewMode('source')}
            className={viewMode === 'source' ? 'active' : ''}
          >
            源码模式
          </button>
        </div>
      )}

      {/* 渲染对应视图 */}
      <div className="editor-content flex-1 overflow-auto">
        {viewMode === 'reading' && (
          <ReadingView
            content={content}
            onDoubleClick={() => setViewMode('editing')}
          />
        )}
        {viewMode === 'editing' && (
          <EditingView
            initialContent={content}
            onContentChange={setContent}
          />
        )}
        {viewMode === 'source' && (
          <SourceView content={content} onChange={setContent} />
        )}
      </div>
    </div>
  );
};
```

#### 9.1.3 Milkdown 插件配置

**仅启用基础 Markdown 功能：**
```typescript
// 不支持数学公式、图表、Emoji

const plugins = [
  commonmark,  // 标题、列表、粗体、斜体、引用、代码块
  gfm,         // 表格、删除线、任务列表
  prism,       // 代码块语法高亮
];
```

#### 9.1.4 海洋蓝主题定制

```css
/* src/styles/milkdown-theme.css */

/* 编辑器容器 */
.milkdown {
  @apply text-gray-900 dark:text-gray-100;
}

/* 标题 - 海洋蓝渐变 */
.milkdown h1 {
  @apply text-3xl font-bold text-brand-600 dark:text-brand-400;
}

.milkdown h2 {
  @apply text-2xl font-semibold text-brand-500 dark:text-brand-300;
}

.milkdown h3 {
  @apply text-xl font-medium text-brand-500 dark:text-brand-300;
}

/* 链接 */
.milkdown a {
  @apply text-brand-600 underline hover:text-brand-700;
}

/* 代码块 */
.milkdown pre {
  @apply bg-gray-100 dark:bg-gray-800 border-l-4 border-brand-500 p-4 rounded;
}

.milkdown code {
  @apply bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 px-1 rounded;
}

/* 引用 */
.milkdown blockquote {
  @apply border-l-4 border-brand-500 pl-4 italic text-gray-600 dark:text-gray-400;
}

/* 任务列表 */
.milkdown input[type="checkbox"]:checked {
  @apply accent-brand-500;
}
```

#### 9.1.5 验收标准

- [ ] ✅ 输入 `# 标题` 后回车，立即渲染为 H1 标题（蓝色）
- [ ] ✅ 输入 `**粗体**`，实时显示为粗体文字
- [ ] ✅ 编辑后 30 秒自动保存，底部显示"已保存"
- [ ] ✅ 打开历史日期日记默认为阅读视图
- [ ] ✅ 打开今日日记默认为编辑视图
- [ ] ✅ 编辑视图可切换到源码视图
- [ ] ✅ 深色模式下，编辑器样式正常

---

### 9.2 模块 B：往年今日查询（核心特色）

**职责**：查找并显示 2022 年至今所有同月同日的历史日记

#### 9.2.1 查询算法（Rust 后端）

```rust
// src-tauri/src/database/diary_repo.rs

impl DiaryRepository {
    /// 根据月-日查询历史记录
    ///
    /// # 参数
    /// - `month_day`: 格式 "MM-DD"（如 "01-31"）
    /// - `start_year`: 起始年份（2022）
    /// - `end_year`: 结束年份（当前年份 - 1）
    ///
    /// # 返回
    /// - 按年份倒序排列的日记列表
    pub async fn find_by_month_day(
        &self,
        month_day: &str,
        start_year: i32,
        end_year: i32,
    ) -> Result<Vec<DiaryEntry>, AppError> {
        let parts: Vec<&str> = month_day.split('-').collect();
        if parts.len() != 2 {
            return Err(AppError::InvalidInput("月-日格式错误".to_string()));
        }

        let month: i32 = parts[0].parse()
            .map_err(|_| AppError::InvalidInput("月份解析失败".to_string()))?;
        let day: i32 = parts[1].parse()
            .map_err(|_| AppError::InvalidInput("日期解析失败".to_string()))?;

        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT * FROM diaries
             WHERE month = ?1 AND day = ?2 AND year BETWEEN ?3 AND ?4
             ORDER BY year DESC" // 按年份倒序
        )?;

        let entries = stmt.query_map(
            params![month, day, start_year, end_year],
            |row| {
                Ok(DiaryEntry {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    year: row.get(2)?,
                    month: row.get(3)?,
                    day: row.get(4)?,
                    filename: row.get(5)?,
                    content: String::new(), // 稍后解密填充
                    word_count: row.get(7)?,
                    created_at: row.get(8)?,
                    modified_at: row.get(9)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(entries)
    }
}
```

#### 9.2.2 性能优化

**数据库索引：**

```sql
-- src-tauri/src/database/schema.rs

CREATE INDEX IF NOT EXISTS idx_month_day
ON diaries(month, day, year DESC);
```

**查询性能目标：**
- 查询 5 年数据（2022-2026）：≤ 100ms
- 解密内容（每条）：≤ 50ms
- 总响应时间：≤ 1 秒

#### 9.2.3 前端虚拟滚动（react-window）

```typescript
// src/components/HistoryPanel/VirtualList.tsx
import { FixedSizeList } from 'react-window';
import type { HistoricalDiary } from '@/types/history';

interface VirtualListProps {
  diaries: HistoricalDiary[];
  onCardClick: (diary: HistoricalDiary) => void;
}

const CARD_HEIGHT = 160; // 固定卡片高度（3 行 + padding）

export const VirtualList: React.FC<VirtualListProps> = ({
  diaries,
  onCardClick,
}) => {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const diary = diaries[index];
    return (
      <div style={style}>
        <HistoryCard diary={diary} onClick={() => onCardClick(diary)} />
      </div>
    );
  };

  return (
    <FixedSizeList
      height={600} // 可视区域高度
      itemCount={diaries.length}
      itemSize={CARD_HEIGHT}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
};
```

#### 9.2.4 历史卡片组件

```typescript
// src/components/HistoryPanel/HistoryCard.tsx
export const HistoryCard: React.FC<{
  diary: HistoricalDiary;
  onClick: () => void;
}> = ({ diary, onClick }) => {
  // 截取前 3 行内容
  const previewLines = diary.content.split('\n').slice(0, 3).join('\n');
  const preview = truncateMarkdown(previewLines, 200); // 最多 200 字符

  return (
    <div
      className="history-card p-4 mb-3 bg-white dark:bg-gray-800 rounded-lg
                 border-l-4 border-brand-500 hover:shadow-md cursor-pointer
                 transition-shadow"
      onClick={onClick}
    >
      {/* 头部：日期 + 时间差 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-brand-600 dark:text-brand-400">
          {diary.displayDate}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {diary.yearsAgo}年前
        </span>
      </div>

      {/* 内容预览（3 行） */}
      <div className="text-gray-700 dark:text-gray-300 text-sm line-clamp-3 leading-relaxed">
        {renderMarkdownPreview(preview)}
      </div>

      {/* 底部：字数 */}
      <div className="mt-2 text-xs text-gray-400">
        {diary.wordCount} 字
      </div>
    </div>
  );
};

/**
 * 简化 Markdown 渲染预览（移除多余标记）
 */
function renderMarkdownPreview(markdown: string): string {
  return markdown
    .replace(/^#+\s/gm, '') // 移除标题符号
    .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记
    .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
    .replace(/`(.*?)`/g, '$1'); // 移除代码标记
}
```

#### 9.2.5 验收标准

- [ ] ✅ 选择 2026-01-31，显示 2022-2025 年的 1月31日 日记
- [ ] ✅ 没有记录的年份不显示空卡片
- [ ] ✅ 点击历史卡片，日历跳转到对应日期，编辑器加载内容
- [ ] ✅ 历史记录 > 5 条时，虚拟滚动流畅（无卡顿）
- [ ] ✅ 查询 5 年数据耗时 ≤ 1 秒
- [ ] ✅ 预览内容固定 3 行，超出显示"..."

---

### 9.3 模块 C：密码验证（每 7 天）

**职责**：首次设置密码，每 7 天启动时验证一次

#### 9.3.1 首次启动流程

```rust
// src-tauri/src/commands/password.rs

/// 检查是否已设置密码
#[tauri::command]
pub async fn has_password_set(
    settings_repo: State<'_, SettingsRepository>,
) -> Result<bool, AppError> {
    let password_hash = settings_repo.get("password_hash").await?;
    Ok(!password_hash.is_empty())
}

/// 设置主密码
#[tauri::command]
pub async fn set_password(
    password: String,
    settings_repo: State<'_, SettingsRepository>,
) -> Result<(), AppError> {
    // 1. 验证密码强度
    if password.len() < 8 {
        return Err(AppError::InvalidInput("密码长度不能少于 8 位".to_string()));
    }

    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_digit = password.chars().any(|c| c.is_numeric());

    if !has_letter || !has_digit {
        return Err(AppError::InvalidInput("密码必须包含字母和数字".to_string()));
    }

    // 2. 使用 Argon2 生成哈希
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| AppError::CryptoError("密码哈希失败".to_string()))?
        .to_string();

    // 3. 保存哈希和设置时间
    settings_repo.set("password_hash", &password_hash).await?;
    settings_repo.set("password_set_at", &Utc::now().to_rfc3339()).await?;
    settings_repo.set("last_verified_at", &Utc::now().to_rfc3339()).await?;

    Ok(())
}
```

#### 9.3.2 每 7 天验证检测

```rust
// src-tauri/src/commands/password.rs

/// 检查是否需要验证密码（距上次验证 >= 7 天）
#[tauri::command]
pub async fn should_verify_password(
    settings_repo: State<'_, SettingsRepository>,
) -> Result<bool, AppError> {
    let last_verified = settings_repo.get("last_verified_at").await?;

    if last_verified.is_empty() {
        return Ok(true); // 从未验证，需要验证
    }

    let last_verified_time = DateTime::parse_from_rfc3339(&last_verified)
        .map_err(|_| AppError::InvalidInput("日期解析失败".to_string()))?;

    let now = Utc::now();
    let duration = now.signed_duration_since(last_verified_time.with_timezone(&Utc));

    // 距上次验证 >= 7 天
    Ok(duration.num_days() >= 7)
}

/// 验证密码
#[tauri::command]
pub async fn verify_password(
    password: String,
    settings_repo: State<'_, SettingsRepository>,
) -> Result<bool, AppError> {
    let stored_hash = settings_repo.get("password_hash").await?;

    if stored_hash.is_empty() {
        return Err(AppError::InvalidInput("密码未设置".to_string()));
    }

    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|_| AppError::CryptoError("哈希解析失败".to_string()))?;

    let is_valid = Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok();

    // 验证成功则更新最后验证时间
    if is_valid {
        settings_repo.set("last_verified_at", &Utc::now().to_rfc3339()).await?;
    }

    Ok(is_valid)
}
```

#### 9.3.3 前端启动流程

```typescript
// src/App.tsx
export const App: React.FC = () => {
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [needsPasswordVerify, setNeedsPasswordVerify] = useState(false);

  useEffect(() => {
    async function checkPassword() {
      // 1. 检查是否已设置密码
      const hasPassword = await hasPasswordSet();
      if (!hasPassword) {
        setNeedsPasswordSetup(true);
        return;
      }

      // 2. 检查是否需要验证（距上次 >= 7 天）
      const shouldVerify = await shouldVerifyPassword();
      if (shouldVerify) {
        setNeedsPasswordVerify(true);
      }
    }

    checkPassword();
  }, []);

  if (needsPasswordSetup) {
    return <PasswordSetupDialog onComplete={() => setNeedsPasswordSetup(false)} />;
  }

  if (needsPasswordVerify) {
    return <PasswordVerifyDialog onSuccess={() => setNeedsPasswordVerify(false)} />;
  }

  return <MainApp />;
};
```

#### 9.3.4 密码对话框组件

```typescript
// src/components/Dialogs/PasswordSetupDialog.tsx
export const PasswordSetupDialog: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      await setPassword(password);
      onComplete();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="password-dialog fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">欢迎使用 Trace Diary</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          请设置主密码以保护您的日记内容
        </p>

        <input
          type="password"
          placeholder="输入密码（≥8位，字母+数字）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 border rounded mb-4"
        />

        <input
          type="password"
          placeholder="确认密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full p-3 border rounded mb-4"
        />

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          className="w-full bg-brand-500 text-white py-3 rounded hover:bg-brand-600"
        >
          设置密码
        </button>
      </div>
    </div>
  );
};
```

#### 9.3.5 验收标准

- [ ] ✅ 首次启动弹出密码设置对话框
- [ ] ✅ 密码强度验证：≥8位，包含字母和数字
- [ ] ✅ 两次输入不一致时提示错误
- [ ] ✅ 距上次验证 < 7 天时，启动直接进入主界面
- [ ] ✅ 距上次验证 ≥ 7 天时，启动弹出密码验证对话框
- [ ] ✅ 密码错误时提示"密码错误"，不限制尝试次数
- [ ] ✅ 密码验证成功后进入主界面

---

### 9.4 模块 D：GitHub 自动同步

**职责**：保存后 30 秒自动同步到 GitHub 私有仓库

#### 9.4.1 同步引擎（30 秒防抖）

```rust
// src-tauri/src/sync/sync_engine.rs
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

/// 同步引擎（单例）
pub struct SyncEngine {
    tx: mpsc::UnboundedSender<SyncRequest>,
}

struct SyncRequest {
    filename: String,
}

impl SyncEngine {
    pub fn new(github_client: GithubClient) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<SyncRequest>();

        // 启动后台任务
        tokio::spawn(async move {
            let mut pending_files: HashSet<String> = HashSet::new();
            let mut last_activity = Instant::now();

            loop {
                tokio::select! {
                    // 接收新的同步请求
                    Some(req) = rx.recv() => {
                        pending_files.insert(req.filename);
                        last_activity = Instant::now();
                    }

                    // 每秒检查是否需要同步
                    _ = sleep(Duration::from_secs(1)) => {
                        if !pending_files.is_empty() &&
                           last_activity.elapsed() >= Duration::from_secs(30) {
                            // 触发同步
                            for filename in pending_files.drain() {
                                if let Err(e) = github_client.upload_file(&filename).await {
                                    eprintln!("同步失败: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        });

        Self { tx }
    }

    /// 请求同步文件（防抖：30 秒后执行）
    pub fn request_sync(&self, filename: String) {
        let _ = self.tx.send(SyncRequest { filename });
    }
}
```

#### 9.4.2 GitHub API 客户端

```rust
// src-tauri/src/sync/github_client.rs
use octocrab::Octocrab;

pub struct GithubClient {
    octocrab: Octocrab,
    owner: String,
    repo: String,
}

impl GithubClient {
    pub fn new(token: &str, owner: String, repo: String) -> Result<Self, AppError> {
        let octocrab = Octocrab::builder()
            .personal_token(token.to_string())
            .build()
            .map_err(|_| AppError::SyncError("GitHub 客户端初始化失败".to_string()))?;

        Ok(Self { octocrab, owner, repo })
    }

    /// 上传文件到 GitHub
    pub async fn upload_file(&self, filename: &str) -> Result<(), AppError> {
        let file_path = format!("diaries/{}", filename);
        let content = std::fs::read(&file_path)
            .map_err(|_| AppError::SyncError(format!("读取文件失败: {}", filename)))?;

        let content_base64 = base64::encode(&content);
        let remote_path = format!("diaries/{}", filename);

        // 检查文件是否已存在
        let existing = self
            .octocrab
            .repos(&self.owner, &self.repo)
            .get_content()
            .path(&remote_path)
            .send()
            .await
            .ok();

        if let Some(existing_file) = existing {
            // 更新现有文件
            self.octocrab
                .repos(&self.owner, &self.repo)
                .update_file(
                    &remote_path,
                    format!("Update diary: {}", filename),
                    &content_base64,
                    &existing_file.sha,
                )
                .send()
                .await
                .map_err(|_| AppError::SyncError("更新文件失败".to_string()))?;
        } else {
            // 创建新文件
            self.octocrab
                .repos(&self.owner, &self.repo)
                .create_file(
                    &remote_path,
                    format!("Add diary: {}", filename),
                    &content_base64,
                )
                .send()
                .await
                .map_err(|_| AppError::SyncError("创建文件失败".to_string()))?;
        }

        Ok(())
    }
}
```

#### 9.4.3 冲突解决对话框

```typescript
// src/components/Dialogs/ConflictDialog.tsx
export const ConflictDialog: React.FC<{
  localContent: string;
  remoteContent: string;
  onResolve: (choice: 'local' | 'remote' | 'cancel') => void;
}> = ({ localContent, remoteContent, onResolve }) => {
  return (
    <div className="conflict-dialog fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full">
        <h2 className="text-xl font-bold mb-4">同步冲突</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          本地和远程都有此日记的修改，请选择保留哪个版本：
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* 本地版本 */}
          <div className="border rounded p-4">
            <h3 className="font-semibold mb-2">本地版本</h3>
            <div className="text-sm max-h-40 overflow-auto">
              {localContent.substring(0, 300)}...
            </div>
          </div>

          {/* 远程版本 */}
          <div className="border rounded p-4">
            <h3 className="font-semibold mb-2">远程版本</h3>
            <div className="text-sm max-h-40 overflow-auto">
              {remoteContent.substring(0, 300)}...
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => onResolve('local')}
            className="flex-1 bg-brand-500 text-white py-2 rounded"
          >
            保留本地版本
          </button>
          <button
            onClick={() => onResolve('remote')}
            className="flex-1 bg-gray-500 text-white py-2 rounded"
          >
            保留远程版本
          </button>
          <button
            onClick={() => onResolve('cancel')}
            className="flex-1 border py-2 rounded"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
```

#### 9.4.4 底部状态栏

```typescript
// src/components/StatusBar/StatusBar.tsx
export const StatusBar: React.FC = () => {
  const { syncStatus } = useSync();

  const statusConfig = {
    idle: { icon: '☁️', text: '已同步', color: 'text-gray-600' },
    syncing: { icon: '⏳', text: '正在同步...', color: 'text-blue-600' },
    success: { icon: '✅', text: '同步完成', color: 'text-green-600' },
    error: { icon: '❌', text: '同步失败', color: 'text-red-600' },
  };

  const config = statusConfig[syncStatus];

  return (
    <div className="status-bar fixed bottom-0 left-0 right-0 h-8
                    bg-gray-100 dark:bg-gray-800 border-t
                    flex items-center justify-between px-4">
      <div className={`flex items-center gap-2 ${config.color}`}>
        <span>{config.icon}</span>
        <span className="text-sm">{config.text}</span>
      </div>

      <div className="text-xs text-gray-500">
        上次同步: {lastSyncTime || '从未同步'}
      </div>
    </div>
  );
};
```

#### 9.4.5 验收标准

- [ ] ✅ 保存日记后 30 秒自动触发同步
- [ ] ✅ 同步中底部状态栏显示"⏳ 正在同步..."
- [ ] ✅ 同步成功显示"✅ 同步完成"（3 秒后恢复）
- [ ] ✅ 同步失败显示"❌ 同步失败"并保留
- [ ] ✅ 首次配置时仅上传本地数据（覆盖远程）
- [ ] ✅ 同步冲突时弹出对话框让用户选择
- [ ] ✅ 网络断开时同步失败，恢复后可重试

---

## 10. 数据结构与存储

### 10.1 SQLite 数据库 Schema

```sql
-- src-tauri/src/database/schema.rs

CREATE TABLE IF NOT EXISTS diaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,          -- 格式：YYYY-MM-DD
  year INTEGER NOT NULL,              -- 年份（用于快速查询）
  month INTEGER NOT NULL,             -- 月份（1-12）
  day INTEGER NOT NULL,               -- 日（1-31）
  filename TEXT NOT NULL,             -- 文件名（YYYY-MM-DD.md）
  word_count INTEGER DEFAULT 0,       -- 字数统计
  created_at TEXT NOT NULL,           -- 创建时间（RFC3339）
  modified_at TEXT NOT NULL           -- 修改时间（RFC3339）
);

-- 索引：加速往年今日查询
CREATE INDEX IF NOT EXISTS idx_month_day
ON diaries(month, day, year DESC);

-- 索引：按年份查询
CREATE INDEX IF NOT EXISTS idx_year
ON diaries(year);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 初始化设置
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('theme', 'light'),                          -- light|dark
  ('password_hash', ''),                       -- Argon2 哈希
  ('password_set_at', ''),                     -- 密码设置时间
  ('last_verified_at', ''),                    -- 上次验证时间
  ('github_token', ''),                        -- GitHub Token（加密存储）
  ('github_owner', ''),                        -- 仓库所有者
  ('github_repo', ''),                         -- 仓库名
  ('last_sync_at', '');                        -- 上次同步时间
```

### 10.2 文件系统结构

```
%APPDATA%/TraceDiary/
├── database/
│   └── trace.db                # SQLite 数据库
├── diaries/                    # 加密的日记文件
│   ├── 2026-01-31.md
│   ├── 2026-01-30.md
│   └── ...
└── logs/
    └── app.log                 # 应用日志
```

### 10.3 Rust 数据模型

```rust
// src-tauri/src/models/diary.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub id: i64,
    pub date: String,          // YYYY-MM-DD
    pub year: i32,
    pub month: i32,
    pub day: i32,
    pub filename: String,
    pub content: String,       // 解密后的 Markdown 内容
    pub word_count: i32,
    pub created_at: String,    // RFC3339
    pub modified_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDiaryInput {
    pub date: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDiaryInput {
    pub content: String,
}
```

### 10.4 TypeScript 类型定义

```typescript
// src/types/diary.ts
export interface DiaryEntry {
  id: number;
  date: string;              // YYYY-MM-DD
  year: number;
  month: number;
  day: number;
  filename: string;
  content: string;           // 解密后的 Markdown 内容
  wordCount: number;
  createdAt: string;         // ISO 8601
  modifiedAt: string;
}

export interface CreateDiaryInput {
  date: string;
  content: string;
}

export interface UpdateDiaryInput {
  content: string;
}

// src/types/history.ts
export interface HistoricalDiary {
  entry: DiaryEntry;
  yearsAgo: number;          // 距今多少年
  displayDate: string;       // 显示格式：2025年1月31日
}
```

---

## 11. 安全与隐私

### 11.1 加密算法

- **文件加密**：AES-256-GCM（认证加密）
- **密钥派生**：Argon2（内存困难型 KDF）
- **密码哈希**：Argon2（存储用户密码验证）

### 11.2 密码强度要求

- 最小长度：8 位
- 必须包含：字母（大写或小写）+ 数字
- 不要求：特殊字符

### 11.3 密钥存储

**禁止事项：**
- ❌ 明文存储用户密码
- ❌ 硬编码加密密钥
- ❌ 在日志中打印密码/密钥

**正确做法：**
- ✅ 仅存储密码哈希（Argon2）用于验证
- ✅ GitHub Token 加密后存储在数据库
- ✅ 加密密钥从用户密码派生（不存储）

### 11.4 Tauri 安全配置

```json
// src-tauri/tauri.conf.json
{
  "tauri": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      "dangerousDisableAssetCspModification": false
    },
    "allowlist": {
      "all": false,
      "fs": {
        "scope": ["$APPDATA/TraceDiary/**"]
      }
    }
  }
}
```

---

## 12. 性能要求

| 操作 | 目标时间 | 测量方法 |
|------|---------|---------|
| 应用启动 | ≤ 3 秒 | 从点击图标到窗口显示 |
| 切换日期 | ≤ 200ms | 从点击到编辑器内容更新 |
| 往年今日查询（5 年数据） | ≤ 1 秒 | 后端查询 + 解密 + 前端渲染 |
| 编辑器输入延迟 | ≤ 50ms | Milkdown 输入响应 |
| 保存日记 | ≤ 500ms | 加密 + 写入文件 + 更新数据库 |
| GitHub 同步 | ≤ 30 秒/文件 | 网络正常情况下 |

**内存占用：**
- 正常使用：≤ 100MB
- 峰值：≤ 200MB（加载大量历史数据时）

**安装包体积：**
- Windows：≤ 20MB

---

## 13. 开发阶段

### 阶段 1：基础框架搭建

**任务清单：**
- [ ] 项目初始化：Tauri + React + TypeScript + Tailwind
- [ ] 主窗口创建，基础三栏布局
- [ ] SQLite 数据库初始化（schema.sql）
- [ ] Rust 加密模块实现（AES-256 + Argon2）
- [ ] 单元测试框架搭建（Rust + Jest）

**验收标准：**
- 应用可以启动并显示空白布局
- 加密/解密功能通过单元测试（覆盖率 > 90%）
- 数据库表创建成功

---

### 阶段 2：核心功能开发

**任务清单：**
- [ ] Milkdown 编辑器集成（三种视图）
- [ ] 日历组件开发（月份切换、日期选择、小圆点）
- [ ] 日记 CRUD 操作（Rust commands + 前端 hooks）
- [ ] 往年今日查询逻辑（Rust 后端 + 虚拟滚动）
- [ ] 自动保存功能（30 秒防抖）
- [ ] 主题切换（深色/浅色）

**验收标准：**
- 用户可以创建、编辑、保存日记（本地加密存储）
- 点击日期可查看对应日记（三种视图正常）
- 往年今日面板显示 2022 年至今的历史记录
- 编辑器支持 Markdown WYSIWYG

---

### 阶段 3：密码验证与同步

**任务清单：**
- [ ] 密码设置与验证（首次 + 每 7 天）
- [ ] GitHub API 客户端（octocrab）
- [ ] 同步引擎（30 秒防抖 + 队列）
- [ ] 冲突检测与解决对话框
- [ ] 底部同步状态栏
- [ ] 首次同步配置引导

**验收标准：**
- 首次启动设置密码，7 天后验证
- 保存日记后 30 秒自动同步
- 同步冲突时弹出对话框选择
- 同步状态实时显示在底部

---

### 阶段 4：完善与打包

**任务清单：**
- [ ] 数据导入功能（txt/md 批量导入）
- [ ] 性能优化（查询缓存、虚拟滚动调优）
- [ ] E2E 核心路径测试
- [ ] 错误处理完善（用户友好提示）
- [ ] Windows 安装程序打包（.msi）
- [ ] 用户文档（README 使用指南）

**验收标准：**
- 所有测试通过（Rust + Jest + E2E）
- 性能指标达标（见第 12 节）
- 可以生成 Windows 安装程序
- 用户文档完整且清晰

---

## 14. 验收标准

### 14.1 功能验收

**核心功能必须 100% 可用：**

- [ ] ✅ 用户可以创建今日日记并自动保存
- [ ] ✅ 用户可以查看任意历史日期的日记
- [ ] ✅ 点击日期后，往年今日面板显示 2022 年至今的所有历史同期记录
- [ ] ✅ Milkdown 编辑器支持三种视图（阅读/编辑/源码）
- [ ] ✅ 深色/浅色主题切换正常
- [ ] ✅ 密码验证：首次设置 + 每 7 天验证
- [ ] ✅ GitHub 自动同步：保存后 30 秒触发
- [ ] ✅ 同步冲突时弹出对话框让用户选择

### 14.2 性能验收

- [ ] ✅ 应用启动时间 ≤ 3 秒
- [ ] ✅ 切换日期响应时间 ≤ 200ms
- [ ] ✅ 往年今日查询（5 年数据）≤ 1 秒
- [ ] ✅ 编辑器输入延迟 ≤ 50ms
- [ ] ✅ 内存占用（正常使用）≤ 100MB
- [ ] ✅ 安装包体积 ≤ 20MB

### 14.3 质量验收

- [ ] ✅ Rust 后端单元测试全部通过
- [ ] ✅ 前端单元测试全部通过
- [ ] ✅ E2E 核心路径测试通过
- [ ] ✅ 所有 ESLint 错误修复（0 errors）
- [ ] ✅ Rust Clippy 检查通过（0 warnings）

### 14.4 用户体验验收

- [ ] ✅ 无明显卡顿或闪烁
- [ ] ✅ 错误提示清晰友好（中文）
- [ ] ✅ 操作可撤销（编辑器支持 Ctrl+Z）
- [ ] ✅ 海洋蓝主题统一应用于所有 UI 元素
- [ ] ✅ 历史记录虚拟滚动流畅

### 14.5 最终交付清单

- [ ] ✅ 源代码（GitHub 仓库）
- [ ] ✅ Windows 安装程序（.msi）
- [ ] ✅ 用户使用文档（README.md）
- [ ] ✅ 开发文档（本规格说明书）
- [ ] ✅ 测试报告（核心路径截图）

---

## 📌 附录 A：AI 智能体快速启动指南

**如果您是 AI 智能体，按以下步骤开始开发：**

### Step 1：阅读本规格说明书
- 重点关注：第 2 节（命令）、第 4 节（结构）、第 8 节（边界约束）

### Step 2：初始化 Tauri 项目
```powershell
# Windows 原生开发
npm create tauri-app@latest TraceDiary
cd TraceDiary
npm install
```

### Step 3：安装核心依赖
```bash
# 前端依赖
npm install @milkdown/core @milkdown/react @milkdown/preset-commonmark @milkdown/preset-gfm
npm install react-window date-fns

# Rust 依赖（添加到 src-tauri/Cargo.toml）
rusqlite = { version = "0.30", features = ["bundled"] }
aes-gcm = "0.10"
argon2 = "0.5"
octocrab = "0.30"
chrono = { version = "0.4", features = ["serde"] }
```

### Step 4：按模块顺序开发
1. **阶段 1**：先完成加密模块（第 11 节）+ 单元测试
2. **阶段 2**：开发编辑器（第 9.1 节）+ 往年今日（第 9.2 节）
3. **阶段 3**：密码验证（第 9.3 节）+ GitHub 同步（第 9.4 节）
4. **阶段 4**：完善与打包

### Step 5：每个模块完成后
- ✅ 运行 `cargo test` 和 `npm test` 确保测试通过
- ✅ 运行 `npm run lint` 和 `cargo clippy` 检查代码风格
- ✅ 对照验收标准验证功能

### Step 6：遇到问题时
- ⚠️ 先查看第 8 节"边界约束"
- ⚠️ 如果需要添加依赖或架构变更，先询问人类
- ⚠️ 如果遇到"禁止执行"的操作，立即停止

---

## 📌 附录 B：常见问题（FAQ）

**Q1：为什么选择 Tauri 而不是 Electron？**
A：安装包体积小（10-20MB vs 100MB+），内存占用低，Rust 后端安全高效。

**Q2：为什么往年今日只查询到 2022 年？**
A：用户明确要求。可在数据库查询中调整 `start_year` 参数。

**Q3：如果用户忘记密码怎么办？**
A：无法恢复（隐私优先设计）。提示用户妥善保管密码。

**Q4：为什么不支持 macOS / Linux？**
A：MVP 专注 Windows。Tauri 天然跨平台，未来可轻松扩展。

**Q5：为什么不在编辑器中添加工具栏？**
A：用户要求纯 Markdown 输入体验，避免干扰。高级用户可切换源码模式。

---

**规格说明书版本**：v2.0 (Tauri + Rust + Milkdown)
**最后更新**：2026年1月31日
**维护者**：Matrix Agent
**审查状态**：✅ 已验证，基于用户确认的技术栈和决策

---

**下一步行动：**
1. 将本规格保存并提交到 Git
2. 初始化 Tauri 项目
3. 开始阶段 1 开发（基础框架）
4. 每个阶段完成后验证验收标准

**Let's build Trace Diary with Tauri! 🚀**
