#!/usr/bin/env bash
set -euo pipefail

HOST="127.0.0.1"
PORT="4173"
BUILD_LOG="/tmp/tracediary-build.log"
PREVIEW_LOG="/tmp/tracediary-preview.log"
PAGE_HTML="/tmp/tracediary-page.html"

npm run build >"${BUILD_LOG}" 2>&1
npm run preview -- --host "${HOST}" --port "${PORT}" --strictPort >"${PREVIEW_LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 20); do
  if curl -fsS "http://${HOST}:${PORT}" >"${PAGE_HTML}"; then
    break
  fi
  sleep 1
done

if ! grep -q '<div id="root"></div>' "${PAGE_HTML}"; then
  echo "E2E 冒烟失败：首页未包含 root 挂载点"
  exit 1
fi
