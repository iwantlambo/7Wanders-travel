#!/bin/sh
# tools/build_sdk.sh —— 產生 js/vendor/anthropic-sdk.js（自動研究用的官方 Anthropic SDK 瀏覽器版）。
#
# 只有維護者要更新 SDK 版本時才需要執行；網站本身沒有建置步驟，使用者不需要 Node 或 npm。
# 產物是單一個傳統 <script> 檔（IIFE），載入後提供 window.AnthropicSDK = { Anthropic, version }，
# 由 js/lib/research.js 在使用者按下「開始研究」時才延遲載入；index.html 不直接載入它。
#
# 用法：sh tools/build_sdk.sh [SDK 版本]（預設 0.131.0）
# 需要：node 18 以上、npm、可連 npm registry。

set -eu

VERSION="${1:-0.131.0}"
ESBUILD_VERSION="0.28.2"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/js/vendor/anthropic-sdk.js"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm init -y >/dev/null
npm install --no-audit --no-fund "@anthropic-ai/sdk@$VERSION" "esbuild@$ESBUILD_VERSION" >/dev/null

cat > entry.mjs <<'EOF'
import Anthropic from '@anthropic-ai/sdk';
import { VERSION } from '@anthropic-ai/sdk/version';
globalThis.AnthropicSDK = { Anthropic: Anthropic, version: VERSION };
EOF

# 授權聲明（MIT）放在檔頭
{
  printf '/*! @anthropic-ai/sdk %s —— 官方 Anthropic TypeScript SDK 的瀏覽器打包版，由 tools/build_sdk.sh 產生，請勿手改。\n' "$VERSION"
  printf ' *  只在使用者按下「自動研究」時由 js/lib/research.js 延遲載入。\n *\n'
  sed 's/^/ *  /' node_modules/@anthropic-ai/sdk/LICENSE
  printf ' */\n'
} > banner.txt

npx esbuild entry.mjs --bundle --format=iife --platform=browser --target=es2019 --minify \
  --legal-comments=none --banner:js="$(cat banner.txt)" --outfile="$WORK/anthropic-sdk.js" >/dev/null

mkdir -p "$(dirname "$OUT")"
cp "$WORK/anthropic-sdk.js" "$OUT"
node -e "global.window=global; require('$OUT'); var A=globalThis.AnthropicSDK; if(!A||typeof A.Anthropic!=='function'){process.exit(1)} console.log('已產生 js/vendor/anthropic-sdk.js：SDK '+A.version+'，'+require('fs').statSync('$OUT').size+' bytes')"
