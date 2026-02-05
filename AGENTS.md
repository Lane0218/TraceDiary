# TraceDiary - AI 编码智能体开发指南

> **目标读者**: 在本仓库中工作的 AI 编码智能体  
> **最后更新**: 2026-02-05  
> **项目状态**: 初始开发阶段（已完成加密/密码验证/日记读写闭环，待补齐日历与往年今日）  
> **重要**: 请使用中文与用户交流

---

## 🎯 项目概述

**TraceDiary** 是一款本地优先的桌面日记应用，基于 Tauri + React + TypeScript + Rust 构建。核心特色是"往年今日"功能 - 查看从 2022 年至今同一月日的所有日记条目。

**核心特点**:
- 🔒 隐私优先（本地 AES-256 加密）
- ⏳ 历史回顾（往年今日功能）
- 🗓️ 年度总结（按年创建/编辑/查看，复用编辑器与加密存储）
- ✍️ Markdown 所见即所得（Milkdown 编辑器，3 种视图模式）
- ☁️ 加密 GitHub 同步
- 📦 轻量级（<20MB 安装包，Tauri 架构）

---

## 🛠️ 核心命令

### 开发环境配置（Windows）

```powershell
# 前置依赖（首次运行）
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
cargo install tauri-cli

# 项目初始化
npm install                    # 安装前端依赖
npm run tauri dev             # 启动开发服务器（热重载）
```

### 测试与质量检查

**关键**: 每次提交前必须运行以下命令：

```bash
# 后端测试（必须通过）
cargo test --manifest-path src-tauri/Cargo.toml

# 前端测试（必须通过）
npm test

# 代码质量检查（必须 0 错误）
npm run lint
npm run type-check
cargo clippy --manifest-path src-tauri/Cargo.toml

# 自动格式化（提交前运行）
cargo fmt --manifest-path src-tauri/Cargo.toml
npm run format
```

### 构建命令

```bash
# 开发构建
npm run tauri dev

# 生产构建（发布版本）
npm run tauri build

# Windows 安装程序（.msi）
npm run tauri build --bundles msi
```

### 运行单个测试

```bash
# Rust: 运行特定测试模块
cargo test --test encryption_tests

# Rust: 运行单个测试函数
cargo test test_encrypt_decrypt_roundtrip

# 前端: 运行特定测试文件
npm test Calendar.test.tsx

# 前端: 监视模式运行测试
npm test -- --watch
```

---

## 📁 项目结构

```
TraceDiary/
├── AGENTS.md                     # AI 开发指南
├── SPEC.md                       # 规格说明书
├── src/                          # 前端（React + TypeScript）
│   ├── services/                 # Tauri 命令封装（类型化）
│   ├── types/                    # TypeScript 类型定义
│   └── utils/                    # 日期/markdown 工具函数
├── src-tauri/                    # 后端（Rust）
│   └── src/
│       ├── commands/             # Tauri IPC 处理程序
│       ├── database/             # SQLite 数据仓库层
│       └── crypto/               # AES-256-GCM + Argon2 + keyring
└── package.json                  # 前端依赖
```

---

## 🎨 代码风格指南

### TypeScript（前端）

**导入顺序**:
```typescript
// 1. 外部依赖（字母顺序）
import React, { useState, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';

// 2. Tauri API
import { invoke } from '@tauri-apps/api/core';

// （可选）若配置了路径别名 @/，可使用 '@/types/...' 这类导入
// 3. 内部类型
import type { DiaryEntry } from '@/types/diary';

// 4. 内部组件/hooks
import { Calendar } from '@/components/Calendar';
import { useDiary } from '@/hooks/useDiary';
```

**组件风格**:
```typescript
/**
 * 日历组件，用于日期选择
 *
 * 功能：
 * - 高亮显示今天和选中日期
 * - 为有日记的日期显示蓝色圆点
 * - 月份导航（上月/下月按钮）
 */
export const Calendar: React.FC<CalendarProps> = ({
  selectedDate,
  onDateSelect,
  diariesMap,
}) => {
  // 状态声明
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // 事件处理函数（使用 handle* 前缀）
  const handleDateClick = (date: Date) => {
    onDateSelect(date);
  };

  // JSX 返回
  return (
    <div className="calendar-container">
      {/* 实现代码 */}
    </div>
  );
};
```

**类型安全规则**:
- ✅ 所有函数必须有显式返回类型
- ✅ 使用 `unknown` 而非 `any`（然后用类型守卫收窄）
- ✅ Props 优先使用 `interface`，联合/工具类型使用 `type`
- 🚫 绝不使用 `@ts-ignore`（除非有解释注释）
- 🚫 绝不使用 `as any` 抑制错误

**错误处理**:
```typescript
// 异步操作必须使用 try-catch
try {
  const diary = await createDiary({ date, content });
  setStatus('saved');
} catch (error) {
  // 面向用户的错误：中文、友好
  showNotification('保存失败，请重试');
  // 控制台错误：英文、详细
  console.error('Failed to create diary:', error);
}
```

### Rust（后端）

**模块组织**:
```rust
// src-tauri/src/commands/diary.rs
use crate::database::DiaryRepository;     // 内部模块
use crate::models::diary::{DiaryEntry};   // 内部类型
use crate::error::AppError;               // 错误类型

use tauri::State;                         // 外部 crates
use serde::{Serialize, Deserialize};      // （字母顺序）
```

**文档注释**:
```rust
/// 创建新的日记条目（加密内容）
///
/// # 参数
/// * `input` - 包含日期（YYYY-MM-DD）和明文内容
/// * `diary_repo` - 日记数据仓库（注入状态）
/// * `encryption` - AES-256 加密服务
///
/// # 返回
/// * `Ok(DiaryEntry)` - 成功创建的条目
/// * `Err(AppError)` - 数据库/加密失败
#[tauri::command]
pub async fn create_diary(
    input: CreateDiaryInput,
    diary_repo: State<'_, DiaryRepository>,
    encryption: State<'_, EncryptionService>,
) -> Result<DiaryEntry, AppError> {
    // 实现代码
}
```

**错误处理**:
```rust
// ✅ 正确：使用 ? 运算符
let conn = self.pool.get()?;
let entry = diary_repo.find_by_date(&date).await?;

// ✅ 正确：提供回退值
let content = encryption.decrypt(&data).unwrap_or_default();

// 🚫 错误：生产代码中绝不使用 unwrap()
let conn = self.pool.get().unwrap(); // ❌ 会 PANIC
```

**命名约定**:
- 文件: `snake_case.rs`（如 `diary_repo.rs`、`sync_engine.rs`）
- 结构体/枚举: `PascalCase`（如 `DiaryEntry`、`SyncStatus`）
- 函数/变量: `snake_case`（如 `find_by_date`、`current_year`）
- 常量: `UPPER_SNAKE_CASE`（如 `DEBOUNCE_DELAY_MS`、`AES_KEY_SIZE`）

---

## 🧪 测试策略

### 测试金字塔分布
- 70% 单元测试（Rust + TS 模块）
- 20% 集成测试（数据库 + 加密）
- 10% E2E 测试（仅核心用户流程）

### Rust 后端测试

**位置**: 与实现代码同位（内联 `#[cfg(test)]` 模块）

**关键测试覆盖**:
1. ✅ 加密/解密往返（crypto 模块）
2. ✅ 往年今日查询（正确的年份过滤、排序）
3. ✅ Argon2 密码验证（正确/错误密码）
4. ✅ 同步冲突检测（本地 vs. 远程时间戳）
5. ✅ 年度总结（get/save/list 命令 + `summaries/` 文件存储 + `date=YYYY-00-00` 伪日期）

**示例**:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_historical_diaries_excludes_current_year() {
        let repo = DiaryRepository::new_in_memory().await.unwrap();

        // 插入 2022-2025 年的 01-31 条目
        for year in 2022..=2025 {
            repo.create(format!("{}-01-31", year), "content").await.unwrap();
        }

        // 从 2026 年查询（应排除 2026 年本身）
        let results = repo.find_by_month_day("01-31", 2022, 2025).await.unwrap();

        assert_eq!(results.len(), 4);
        assert_eq!(results[0].year, 2025); // 降序排列
    }
}
```

### 前端测试

**框架**: Jest + React Testing Library

**重点领域**:
- 组件渲染（Calendar、HistoryCard）
- 用户交互（日期点击、视图切换）
- Hook 状态管理（useDiary、useHistory）

**示例**:
```typescript
describe('Calendar', () => {
  it('应为有日记的日期显示蓝色圆点', () => {
    const diariesMap = new Map([['2026-01-15', true]]);

    render(
      <Calendar
        selectedDate={new Date('2026-01-31')}
        onDateSelect={jest.fn()}
        diariesMap={diariesMap}
      />
    );

    const day15 = screen.getByText('15').closest('.day-cell');
    expect(day15?.querySelector('.diary-dot')).toBeInTheDocument();
  });
});
```

### 提交前测试要求

| 操作 | 要求 |
|------|------|
| 任何代码更改 | `cargo test && npm test` 必须通过 |
| 新功能 | 添加单元测试（核心模块 ≥80% 覆盖率） |
| Bug 修复 | 添加回归测试验证修复 |
| 重构 | 所有现有测试必须通过 |

---

## 🔐 安全规则

### 加密要求

**算法**（未经批准不得更改）:
- 数据加密: AES-256-GCM（认证加密）
- 密码哈希: Argon2id（OWASP 推荐参数）
- 密钥派生: Argon2 KDF（从密码派生 256 位密钥）

**存储**:
- ✅ 加密日记文件: `diaries/YYYY-MM-DD.md`（AES-256）
- ✅ 加密年度总结: `summaries/YYYY-summary.md`（AES-256）
- ✅ 密码哈希: SQLite `settings` 表（Argon2）
- ✅ 主密钥: Windows 凭据管理器（通过 `keyring` crate）
- 🚫 绝不在 SQLite 或文件中存储明文密码/密钥

### 密码策略

```rust
// 最低要求（在 password.rs 中强制执行）
const MIN_PASSWORD_LENGTH: usize = 8;

fn validate_password(password: &str) -> Result<(), PasswordError> {
    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(PasswordError::TooShort);
    }

    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_number = password.chars().any(|c| c.is_numeric());

    if !has_letter || !has_number {
        return Err(PasswordError::WeakComplexity);
    }

    Ok(())
}
```

### 禁止模式

```rust
// 🚫 绝不记录敏感数据
println!("User password: {}", password); // ❌
log::info!("Encryption key: {:?}", key); // ❌

// ✅ 安全日志记录（脱敏敏感字段）
log::info!("Password verification: {}", result.is_ok()); // ✅
log::debug!("Processing diary: {}", entry.date); // ✅（日期不敏感）
```

---

## 🔄 Git 工作流

### 提交信息格式（Conventional Commits）

```
<类型>(<范围>): <主题>

<正文>

<脚注>
```

**类型**:
- `feat`: 新功能（如 `feat(editor): 添加源码视图模式`）
- `fix`: Bug 修复（如 `fix(history): 修正闰年处理`）
- `refactor`: 代码重构（无行为变更）
- `test`: 添加/更新测试
- `docs`: 仅文档更改
- `chore`: 构建/工具配置

**示例**:
```
feat(editor): 集成 Milkdown WYSIWYG 编辑器

- 支持 3 种视图模式（阅读/编辑/源码）
- 应用海洋蓝主题
- 配置 CommonMark + GFM 插件

Closes #12
```

```
fix(history): 从往年今日查询中排除当前年份

查询错误地包含了当前年份的条目。
现在正确过滤 year < current_year。

Fixes #24
```

### 分支策略

- `main` - 生产就绪代码（受保护）
- `develop` - 集成分支（小团队可选）
- `feature/<名称>` - 新功能
- `fix/<问题>` - Bug 修复
- `refactor/<区域>` - 代码改进

### 提交前检查清单

运行 `git commit` 前，确保：
- [ ] `cargo test` 通过（所有 Rust 测试）
- [ ] `npm test` 通过（所有前端测试）
- [ ] `npm run lint` 通过（0 个 ESLint 错误）
- [ ] `cargo clippy` 通过（0 个警告）
- [ ] 无 `console.log` 语句（使用正确的日志记录）
- [ ] 无注释掉的代码块
- [ ] 提交信息遵循 Conventional Commits 格式

### AI 提交与推送（必须执行）

当完成一个相对独立的任务（例如实现一个功能点、修复一个 bug、完成一次重构或文档对齐）时，AI 应主动完成：
- `git status` 确认变更范围
- 运行必要的测试/检查（至少覆盖受影响的部分）
- `git commit`（遵循 Conventional Commits）
- `git push` 推送到远程分支（如环境/权限导致无法推送，需在回复中说明原因与下一步命令）

---

## ⚖️ 边界约束（三级系统）

### ✅ 第 1 级：始终执行（无需许可）

**代码质量**:
- 提交前运行 `cargo fmt`、`npm run format`
- 为 TypeScript 函数添加 JSDoc 注释
- 为 Rust 公共函数添加 `///` 文档注释
- 修复 ESLint/Clippy 警告

**命名合规**:
- React 组件: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Rust 模块: `snake_case.rs`
- 类型/接口: `PascalCase`（TS）、`PascalCase`（Rust）

**测试**:
- 为新函数添加单元测试（≥80% 覆盖率目标）
- 修复 Bug 时添加回归测试
- 重构时更新测试

**错误处理**:
- 用 try-catch（TS）或 `?`（Rust）包装异步调用
- 面向用户的错误：中文（如"保存失败"）
- 控制台/日志错误：英文（用于调试）

### ⚠️ 第 2 级：先询问（高影响更改）

**依赖更改**:
```
⚠️ 需要确认：
操作：添加 `serde_yaml` crate（影响二进制大小 200KB）
原因：支持 YAML 配置格式以提高可读性
替代方案：继续使用 JSON 配置（当前方法）

是否继续？[Y/N]
```

**询问前**:
- 添加新的 npm 包 / Rust crate
- 更改数据库架构（ALTER TABLE）
- 修改 Tauri 命令签名（破坏前后端契约）
- 调整加密/哈希算法
- 更改同步防抖时间（默认 30s）
- 修改项目目录结构

**架构更改**:
- 将模块移动到不同目录
- 引入新的设计模式
- 更改状态管理方法
- 添加缓存层

### 🚫 第 3 级：绝不执行（硬性阻止）

**安全违规**:
- ❌ 将明文密码、API 密钥、令牌提交到 Git
- ❌ 记录用户密码/加密密钥（即使在调试构建中）
- ❌ 使用弱加密（MD5、SHA1、DES）
- ❌ 禁用 Tauri 安全功能（CSP、allowlist）

**数据完整性**:
- ❌ 直接编辑用户的加密日记文件
- ❌ 未经明确确认删除用户数据
- ❌ 修改 `node_modules/` 或 `target/` 目录

**代码质量**:
- ❌ 使用 `eval()` 或动态代码执行
- ❌ 用 `@ts-ignore` 抑制 TypeScript 错误（无解释）
- ❌ 在 Rust 生产代码中使用 `unwrap()`（测试除外）
- ❌ 删除失败的测试而非修复它们

**Git 违规**:
- ❌ 强制推送到 `main` 分支（`git push --force`）
- ❌ 提交构建产物（`dist/`、`target/`、`node_modules/`）
- ❌ 重写公共 Git 历史（rebase 已推送的提交）

---

## 📝 Windows 开发注意事项

### VS Build Tools（MSVC）与 Tauri 编译

在 Windows 上构建 Tauri（Rust `x86_64-pc-windows-msvc`）需要 MSVC 工具链（`cl.exe`/`link.exe`）。

**推荐方式（优先使用）**：用「x64 Native Tools Command Prompt for VS Build Tools」打开终端后再运行项目命令。

**原因**：如果直接在普通 PowerShell 中运行，可能会命中 Git 自带的 `link.exe`（如 `C:\Program Files\Git\usr\bin\link.exe`），导致 Rust 编译报错（常见为 `link: extra operand '*.rcgu.o'`）。

**自检命令**（在上述 Native Tools 终端里执行）：

```powershell
where cl.exe
where link.exe
```

期望：输出路径在 `...\Microsoft Visual Studio\...\VC\Tools\MSVC\...\bin\Hostx64\x64\`，且 `link.exe` 不应只指向 Git 目录。

如果必须在普通 PowerShell 运行，可用 `cmd /c` 临时加载环境（不建议长期依赖）：

```powershell
cmd /c "call \"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat\" -no_logo -arch=x64 -host_arch=x64 && npm run tauri dev"
```

### 命令格式调整

```bash
# ✅ 使用正斜杠或转义反斜杠
npm run build -- --config ./config.json
cargo test --manifest-path=src-tauri/Cargo.toml

# 🚫 避免使用裸反斜杠（可能导致问题）
cargo test --manifest-path=src-tauri\Cargo.toml  # 某些 shell 中可能失败
```

### 代码中的路径处理

**TypeScript**:
```typescript
// 使用 Tauri 路径 API（跨平台）
import { appDataDir, join } from '@tauri-apps/api/path';

const diaryDir = await join(await appDataDir(), 'diaries');
```

**Rust**:
```rust
// 使用 std::path::PathBuf（正确处理 Windows 路径）
use std::path::PathBuf;

let diary_path = PathBuf::from("diaries")
    .join(format!("{}.md", date));
```

### 行尾符

**Git 配置**（已在 `.gitattributes` 中）:
```
* text=auto
*.rs text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.md text eol=lf
```

---

## 🎯 核心功能需求

### 1. Milkdown 编辑器（3 种视图模式）

**阅读视图**（历史日记默认）:
- 只读渲染
- 无工具栏
- 双击 → 切换到编辑模式

**编辑视图**（今日日记默认）:
- 所见即所得（输入 `#` → 渲染为 H1）
- 不活动 30 秒后自动保存（防抖）
- 无传统工具栏（纯键盘输入）

**源码视图**（高级用户）:
- 纯 `<textarea>` 显示原始 Markdown
- 等宽字体
- 通过按钮手动切换

**切换逻辑**:
```typescript
// 默认视图判断
const isToday = isSameDay(selectedDate, new Date());
const defaultView = isToday ? 'editing' : 'reading';
```

### 2. 往年今日

**查询要求**:
- 日期范围: 2022 到（当前年份 - 1）
- 排除当前年份（在主编辑器中查看）
- 排序: 按年份降序（最近的优先）

**UI 要求**:
- 虚拟滚动（react-window）处理 50+ 条目
- 每张卡片显示:
  - 年份徽章（如"2025年"）
  - 年前标签（如"1年前"）
  - 内容前 3 行（预览）
  - 字数统计
- 点击卡片 → 跳转到日历中的该日期

**SQL 查询**:
```sql
SELECT * FROM diaries
WHERE month = ? AND day = ?
  AND year >= 2022
  AND year < ?  -- 排除当前年份
ORDER BY year DESC
```

### 3. 密码验证

**首次启动**:
- 显示密码设置对话框（模态，无法关闭）
- 验证: ≥8 字符，包含字母和数字
- 用 Argon2 哈希，存储在 SQLite `settings` 表
- 派生 AES 密钥，存储在 Windows 凭据管理器

**后续启动**:
- 检查上次验证时间戳
- 如果 > 7 天前 → 显示密码对话框
- 成功后 → 更新时间戳，解锁加密服务

### 4. GitHub 自动同步

**触发器**: 内容更改后 30 秒（防抖）

**流程**:
1. 检测编辑器中的内容更改
2. 启动 30 秒倒计时（新更改时重置）
3. 倒计时到期时:
   - 加密文件
   - 保存到本地 `diaries/`（日记）与 `summaries/`（年度总结）文件夹
   - 如果配置了 GitHub:
     - 提交: `chore: auto-sync YYYY-MM-DD`
     - 推送到私有仓库
4. 在状态栏显示同步状态

**冲突处理**:
- 检测: 远程 modified_at > 本地 modified_at
- 操作: 显示包含 3 个选项的对话框:
  - 保留本地（覆盖远程）
  - 保留远程（丢弃本地）
  - 保存两者（在文件名后附加时间戳）

### 5. 年度总结

**目标**：提供年度总结的创建、编辑、查看；与日常日记共用编辑器组件与 AES-256-GCM 加密存储。

**入口（UI）**：在日历视图的“年份标题区域”提供按钮 `📝 年度总结`，点击跳转到 `/yearly-summary/:year`。

**存储**:
- 文件：`summaries/YYYY-summary.md`（如 `2026-summary.md`），必须加密
- 数据库：在 `diaries` 表中使用伪日期 `date = YYYY-00-00` 标识；字段约束：
  - `entry_type = 'yearly_summary'`
  - `month = 0`
  - `day = 0`

**Tauri 命令（IPC）**（与 SPEC.md 对齐）:
- `get_yearly_summary(year)`
- `save_yearly_summary(year, content)`
- `list_yearly_summaries()`

---

## 📊 性能目标

| 指标 | 目标 | 测量 |
|------|------|------|
| 应用启动 | ≤ 3s | 首次绘制到可交互 |
| 日期切换 | ≤ 200ms | 点击日期 → 加载内容 |
| 往年今日查询 | ≤ 1s | 5 年数据（100+ 条目） |
| 编辑器输入延迟 | ≤ 50ms | 按键 → 屏幕更新 |
| 内存使用 | ≤ 100MB | 闲置状态，1 年日记 |
| 安装包大小 | ≤ 20MB | Windows .msi 包 |

**优化策略**:
- 历史面板使用虚拟滚动（react-window）
- 延迟加载 Milkdown 插件
- SQLite 在 `(month, day, year)` 上建索引
- 防抖自动保存（30s）
- 仅在需要时加密/解密（不在内存中）

---

## 🚀 开发阶段

### 当前任务板（滚动 TODO，优先级从上到下）

- [ ] 日历导航 UI（替换 `<input type="date">`）
- [ ] 往年今日（后端查询 + 前端列表；后续再加虚拟滚动）
- [ ] 编辑器升级：Milkdown（阅读/编辑/源码三视图）
- [ ] 年度总结：路由入口 + get/save/list + 加密存储
- [ ] GitHub 自动同步（30s 防抖 + 冲突对话框）

### 阶段 1: 基础（第 1-2 周）
- [x] Tauri 项目脚手架
- [x] React + TypeScript 设置（Vite）
- [x] SQLite 数据库（架构 + 初始化建表）
- [x] AES-256 加密服务
- [x] 密码设置 + 验证（Argon2 + keyring，含 7 天有效期）
- [x] 日记读写闭环（get/save + 加密文件落地）
- [x] 编辑 30 秒后自动保存（前端防抖）
- [ ] 基础 Milkdown 编辑器（仅编辑视图，替换临时 textarea）
- [ ] 日历导航 UI

### 阶段 2: 核心功能（第 3-4 周）
- [ ] 往年今日查询 + UI（虚拟滚动）
- [ ] 3 种编辑器视图模式（阅读/编辑/源码）
- [ ] 主题切换（亮色/暗色）

### 阶段 3: 同步与润色（第 5-6 周）
- [ ] GitHub 自动同步（30s 防抖）
- [ ] 冲突解决对话框
- [ ] 状态栏（同步状态、字数统计）
- [ ] 性能优化（达到目标）

### 阶段 4: 质量保证（第 7 周）
- [ ] E2E 测试（核心用户流程）
- [ ] Windows 安装程序（.msi）
- [ ] 用户文档
- [ ] 最终测试与 Bug 修复

---

## ✅ 验收标准

### 功能性
- [x] 创建/编辑任意日期的日记
- [ ] 查看选定日期的往年今日（2022-至今）
- [ ] 在 3 种编辑器视图间切换
- [x] 编辑 30 秒后自动保存
- [x] 首次启动 + 每 7 天需要密码
- [ ] GitHub 同步工作（推送加密文件）
- [ ] 冲突解决对话框正常工作

### 性能（必须全部达标）
- [ ] 应用启动 ≤3s
- [ ] 日期切换 ≤200ms
- [ ] 往年今日查询（5 年）≤1s
- [ ] 编辑器无输入延迟（≤50ms）
- [ ] 安装包大小 ≤20MB

### 质量
- [ ] 测试覆盖率 ≥80%（核心模块）
- [ ] 零 ESLint 错误
- [ ] 零 Clippy 警告
- [ ] 所有单元测试通过
- [ ] E2E 测试通过（创建日记、查看历史、同步）

---

## 📚 其他资源

**官方文档**:
- [Tauri 文档](https://tauri.app/v1/guides/)
- [Milkdown 文档](https://milkdown.dev/)
- [Rusqlite 指南](https://docs.rs/rusqlite/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

**项目参考**:
- 完整规格说明: `SPEC.md`（80KB，全面）
- API 契约: 参见 SPEC.md 中的 `§9`（Tauri 命令）
- 数据库架构: 参见 SPEC.md 中的 `§10`

---

**AGENTS.md 结束** • 最后更新: 2026-02-05
