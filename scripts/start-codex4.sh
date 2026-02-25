#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${1:-codex4}"
WINDOW_NAME="${WINDOW_NAME:-codex}"
CODEX_CMD="${CODEX_CMD:-codex --yolo}"

PANE_TITLES_RAW="${PANE_TITLES:-A,B,C,D}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "缺少依赖命令: $cmd" >&2
    exit 1
  fi
}

require_cmd tmux

# 仅校验启动命令的可执行文件部分，命令参数可通过 CODEX_CMD 注入。
CODEX_BIN="${CODEX_CMD%% *}"
require_cmd "$CODEX_BIN"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  if [[ -n "${TMUX:-}" ]]; then
    tmux switch-client -t "$SESSION_NAME"
  else
    tmux attach-session -t "$SESSION_NAME"
  fi
  exit 0
fi

tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" "$CODEX_CMD"
tmux split-window -h -t "$SESSION_NAME":0.0 "$CODEX_CMD"
tmux split-window -v -t "$SESSION_NAME":0.0 "$CODEX_CMD"
tmux split-window -v -t "$SESSION_NAME":0.1 "$CODEX_CMD"
tmux select-layout -t "$SESSION_NAME":0 tiled

# 使用 pane 标题承载默认命名，后续可手动重命名。
tmux set-window-option -t "$SESSION_NAME":0 allow-rename off >/dev/null
tmux set-window-option -t "$SESSION_NAME":0 pane-border-status top >/dev/null

IFS=',' read -r -a pane_titles <<< "$PANE_TITLES_RAW"
mapfile -t pane_ids < <(tmux list-panes -t "$SESSION_NAME":0 -F "#{pane_index}:#{pane_id}" | sort -t ':' -k1,1n | cut -d ':' -f2)

for i in "${!pane_ids[@]}"; do
  title="${pane_titles[$i]:-pane$((i + 1))}"
  tmux select-pane -t "${pane_ids[$i]}" -T "$title"
done

if [[ -n "${TMUX:-}" ]]; then
  tmux switch-client -t "$SESSION_NAME"
else
  tmux attach-session -t "$SESSION_NAME"
fi
