#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERCEL_SCOPE="${VERCEL_SCOPE:-lanes-projects-29cb0384}"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-/tmp/.npm-cache}"
ALLOW_STATUS_CODES="${ALLOW_STATUS_CODES:-200,301,302,307,308,401,403}"

SKIP_LINT=false
SKIP_VERIFY=false
VERIFY_URLS=()

load_vercel_token_from_env_local() {
  local env_file="$ROOT_DIR/.env.local"
  local line=''
  local value=''

  if [[ -n "${VERCEL_TOKEN:-}" ]] || [[ ! -f "$env_file" ]]; then
    return 0
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == VERCEL_TOKEN=* ]]; then
      value="${line#VERCEL_TOKEN=}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi

      if [[ -n "$value" ]]; then
        export VERCEL_TOKEN="$value"
      fi
      return 0
    fi
  done < "$env_file"
}

usage() {
  cat <<'EOF'
用法:
  VERCEL_TOKEN=xxx bash scripts/deploy-vercel-prod.sh [选项]

选项:
  --scope <scope>     指定 Vercel scope（默认: lanes-projects-29cb0384）
  --url <https-url>   指定部署后校验地址（可重复传入）
  --skip-lint         跳过 npm run lint
  --skip-verify       跳过 URL 可达性校验
  -h, --help          查看帮助

环境变量:
  VERCEL_TOKEN        必填，Vercel token（若未设置会尝试读取 .env.local）
  NPM_CACHE_DIR       可选，npx/npm 缓存目录（默认: /tmp/.npm-cache）
  ALLOW_STATUS_CODES  可选，允许的 HTTP 状态码，逗号分隔

示例:
  VERCEL_TOKEN=xxx bash scripts/deploy-vercel-prod.sh
  VERCEL_TOKEN=xxx bash scripts/deploy-vercel-prod.sh --url https://diary.laneljc.cn --url https://tracediary.laneljc.cn
  VERCEL_TOKEN=xxx bash scripts/deploy-vercel-prod.sh --skip-lint --skip-verify
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "缺少依赖命令: $cmd" >&2
    exit 1
  fi
}

is_code_allowed() {
  local code="$1"
  IFS=',' read -r -a allowed_codes <<< "$ALLOW_STATUS_CODES"
  for allowed in "${allowed_codes[@]}"; do
    if [[ "$code" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      if [[ $# -lt 2 ]]; then
        echo "--scope 缺少参数" >&2
        exit 1
      fi
      VERCEL_SCOPE="$2"
      shift 2
      ;;
    --url)
      if [[ $# -lt 2 ]]; then
        echo "--url 缺少参数" >&2
        exit 1
      fi
      VERIFY_URLS+=("$2")
      shift 2
      ;;
    --skip-lint)
      SKIP_LINT=true
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage
      exit 1
      ;;
  esac
done

load_vercel_token_from_env_local

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "缺少 VERCEL_TOKEN，请先执行: export VERCEL_TOKEN='你的token'，或在 .env.local 写入 VERCEL_TOKEN=xxx" >&2
  exit 1
fi

if [[ ${#VERIFY_URLS[@]} -eq 0 ]]; then
  VERIFY_URLS=(
    "https://diary.laneljc.cn"
    "https://tracediary.laneljc.cn"
  )
fi

require_cmd npm
require_cmd npx
require_cmd curl
require_cmd grep

mkdir -p "$NPM_CACHE_DIR"
export npm_config_cache="$NPM_CACHE_DIR"

cd "$ROOT_DIR"

echo "[1/4] 校验 Vercel 身份..."
npx vercel whoami --scope "$VERCEL_SCOPE" --token "$VERCEL_TOKEN" >/dev/null
echo "已通过身份校验。"

if [[ "$SKIP_LINT" == "true" ]]; then
  echo "[2/4] 已跳过 lint（--skip-lint）"
else
  echo "[2/4] 执行 lint..."
  npm run lint
fi

echo "[3/4] 执行生产部署..."
deploy_output="$(npx vercel --prod --yes --scope "$VERCEL_SCOPE" --token "$VERCEL_TOKEN" 2>&1)"
echo "$deploy_output"

deployment_url="$(printf '%s\n' "$deploy_output" | grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -n 1 || true)"

if [[ "$SKIP_VERIFY" == "true" ]]; then
  echo "[4/4] 已跳过 URL 校验（--skip-verify）"
else
  echo "[4/4] 校验线上地址可达性..."
  for url in "${VERIFY_URLS[@]}"; do
    http_code="$(curl -sS -o /dev/null -w '%{http_code}' "$url" || true)"
    if is_code_allowed "$http_code"; then
      echo "OK: $url -> HTTP $http_code"
    else
      echo "FAIL: $url -> HTTP $http_code（不在允许状态码: $ALLOW_STATUS_CODES）" >&2
      exit 1
    fi
  done
fi

echo "部署完成。"
if [[ -n "$deployment_url" ]]; then
  echo "生产部署 URL: $deployment_url"
fi
