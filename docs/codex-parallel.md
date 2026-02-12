# WezTerm + tmux 并行 Codex（4 窗格）

## 目标

- 在 WezTerm 中一条命令拉起 4 个 Codex pane（`2x2`）。
- 启动时使用默认名称（`A/B/C/D`）。
- 运行过程中支持手动重命名 pane/window。

## 快速开始

1. 确保已安装 `tmux` 与 `codex`，且可在命令行直接执行。
2. 在仓库根目录运行：

```bash
./scripts/start-codex4.sh
```

默认会创建会话 `codex4`。如果会话已存在，则直接 attach。

## 可选参数与环境变量

```bash
# 指定会话名（位置参数）
./scripts/start-codex4.sh my-codex

# 自定义 pane 默认名称（逗号分隔，顺序对应左上/右上/左下/右下）
PANE_TITLES="需求,实现,测试,Review" ./scripts/start-codex4.sh

# 自定义 Codex 启动命令
CODEX_CMD="codex --help" ./scripts/start-codex4.sh
```

## 手动改名（运行中）

```bash
# 重命名当前 window
# 先按 Ctrl+b 再按 ,

# 重命名指定 pane（先 Ctrl+b q 查看 pane 编号）
tmux select-pane -t <pane_id> -T "新名称"
```

## 保存当前窗口并再次打开

`tmux` 会话默认支持“暂离并恢复”：

```bash
# 在当前会话中按快捷键暂离（detach）
# 先按 Ctrl+b 再按 d

# 重新进入默认会话
tmux attach -t codex4

# 或直接用启动脚本（会话存在时会自动 attach）
./scripts/start-codex4.sh
```

常用管理命令：

```bash
# 查看所有会话
tmux ls

# 结束会话（会终止该会话中的所有进程）
tmux kill-session -t codex4
```

说明：

- 关闭 WezTerm 窗口后，只要机器未重启且会话未被 kill，`tmux` 会话仍可恢复。
- 机器重启后默认不保留进程状态；如需跨重启恢复，可后续引入 `tmux-resurrect`/`tmux-continuum`。

## 建议（可选）

如果希望 pane 标题始终可见，可在 `~/.tmux.conf` 添加：

```tmux
set -g pane-border-status top
set -g allow-rename off
```
