#!/bin/sh
# tools/checkall.sh —— 全專案靜態檢查：語法、煙霧測試、離線與 ES5 風格禁用字。
# 用法：sh tools/checkall.sh（在專案任一目錄下皆可，路徑以本檔位置為基準）
# 全過 exit 0，任一關卡失敗 exit 1。
# 只用 POSIX sh、node、grep、find —— 沒有 npm、沒有任何外部套件。

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1

FAIL=0
step() { printf '\n=== %s ===\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; FAIL=1; }
ok()   { printf 'PASS  %s\n' "$1"; }

# 掃描範圍：專案內所有 .js（含 tools/），排除 docs 與版本控制目錄
JSFILES=$(find . -type f -name '*.js' \
  ! -path './.git/*' ! -path './node_modules/*' ! -path './docs/*' \
  | LC_ALL=C sort)

if [ -z "$JSFILES" ]; then
  echo "FAIL  找不到任何 .js 檔，請確認執行位置"
  exit 1
fi

# ---------------------------------------------------------------- 1. node --check
step "1. node --check（逐檔語法）"
for f in $JSFILES; do
  if node --check "$f" >/dev/null 2>&1; then
    ok "$f"
  else
    bad "$f"
    node --check "$f" 2>&1 | sed 's/^/      /'
  fi
done

# ---------------------------------------------------------------- 2. index.html 的 script 清單
# 兩個方向都要查：存在的檔案必須被列出，列出的檔案也必須存在。
# 後者是上一輪刪檔沒同步 index.html 留下的坑（瀏覽器只會靜默 404，畫面直接壞掉）。
step "2. index.html 是否已列出每個 js/ 下的檔案"
for f in $JSFILES; do
  case "$f" in
    ./js/data/lvr/*) continue ;;     # 各縣市實價登錄行情檔由 main.js 依縣市延遲載入，不列在 index.html（見 2c）
    ./js/*) ;;
    *) continue ;;
  esac
  rel=$(printf '%s' "$f" | sed 's|^\./||')
  if grep -q "$rel" index.html; then
    ok "index.html 已列出 $rel"
  else
    bad "index.html 沒有列出 $rel（新增檔案必須同步加進 script 清單）"
  fi
done

step "2b. index.html 列出的 js/ 檔案是否都存在"
LISTED=$(grep -oE 'src="js/[A-Za-z0-9_./-]+\.js"' index.html | sed 's|^src="||; s|"$||' | LC_ALL=C sort -u)
if [ -z "$LISTED" ]; then
  bad "index.html 沒有列出任何 js/ 檔案"
else
  for rel in $LISTED; do
    if [ -f "$rel" ]; then
      ok "$rel 存在"
    else
      bad "index.html 列出了不存在的檔案 $rel"
    fi
  done
fi

step "2c. 每個縣市都有實價登錄行情檔（js/data/lvr/{代碼}.js），且 main.js 由同一路徑延遲載入"
CODES=$(grep -oE '\["[^"]+", "[A-Z]",' js/data/districts.js | grep -oE '"[A-Z]"' | tr -d '"')
NCODE=0
for c in $CODES; do
  NCODE=$((NCODE + 1))
  if [ -f "js/data/lvr/$c.js" ]; then ok "js/data/lvr/$c.js 存在"; else bad "缺少 js/data/lvr/$c.js"; fi
done
if [ "$NCODE" -ne 22 ]; then bad "districts.js 的縣市代碼應為 22 個，實際 $NCODE 個"; fi
if grep -q "'js/data/lvr/' + code + '.js'" js/main.js; then ok "main.js 依縣市延遲載入行情檔"; else bad "main.js 沒有延遲載入行情檔的程式"; fi

# ---------------------------------------------------------------- 3. 煙霧測試
step "3. node tools/smoke.js"
if node tools/smoke.js; then
  ok "smoke 全數通過"
else
  bad "smoke 有斷言未通過（請修真正的錯，不要放寬斷言）"
fi

# ---------------------------------------------------------------- 4. 離線保證
# SPEC 第 1 節第 5 款：整個專案不得出現任何對外請求。
step "4. 離線保證：不得出現 fetch( / XMLHttpRequest / WebSocket / sendBeacon / import"
scan_forbidden() {
  # $1 = grep 樣式（-E）, $2 = 人看得懂的名稱, $3 = 額外排除的檔案樣式（可空）
  pat="$1"; name="$2"; skip="$3"
  hits=''
  for f in $JSFILES; do
    if [ -n "$skip" ]; then
      case "$f" in $skip) continue ;; esac
    fi
    if grep -nE "$pat" "$f" >/dev/null 2>&1; then
      hits="$hits$f
"
      grep -nE "$pat" "$f" | sed "s|^|      $f:|"
    fi
  done
  # index.html 一併掃
  if grep -nE "$pat" index.html >/dev/null 2>&1; then
    hits="${hits}index.html
"
    grep -nE "$pat" index.html | sed 's|^|      index.html:|'
  fi
  if [ -n "$hits" ]; then
    bad "出現禁用項目：$name"
  else
    ok "沒有 $name"
  fi
}

scan_forbidden 'fetch[[:space:]]*\(' 'fetch(' ''
scan_forbidden 'XMLHttpRequest' 'XMLHttpRequest' ''
scan_forbidden 'WebSocket' 'WebSocket' ''
scan_forbidden 'sendBeacon' 'navigator.sendBeacon' ''
# tools/ 下的測試腳本是 Node 專用、不會被瀏覽器載入，允許 require；
# 禁用的是 ES Module 的 import / export（file:// 下會被 CORS 擋掉）。
scan_forbidden '(^|[^[:alnum:]_$.])import[[:space:]]+' 'ES Module import' './tools/*'
scan_forbidden '(^|[^[:alnum:]_$.])export[[:space:]]' 'ES Module export' './tools/*'
scan_forbidden 'type[[:space:]]*=[[:space:]]*"module"' 'type="module"' ''
# 外部來源：只允許 <a href> 的法規連結，不允許 script/link/@import 指向外部
step "4b. 不得引入外部 CDN（script src／link href 指向 http）"
if grep -nE '(script|link)[^>]*(src|href)[[:space:]]*=[[:space:]]*"[[:space:]]*(https?:)?//' index.html >/dev/null 2>&1; then
  bad "index.html 有指向外部來源的 script 或 link"
  grep -nE '(script|link)[^>]*(src|href)[[:space:]]*=[[:space:]]*"[[:space:]]*(https?:)?//' index.html | sed 's|^|      |'
else
  ok "index.html 沒有外部 script／link"
fi

# ---------------------------------------------------------------- 5. ES5 風格
# SPEC 第 1 節第 6 款：只用 var / function，字串一律用 + 串接。
step "5. ES5 風格：不得出現箭頭函式與樣板字串反引號"
scan_forbidden '=>' '箭頭函式 =>' ''
scan_forbidden '`' '樣板字串反引號' ''
step "5b. ES5 風格：不得出現 let / const / class / 選擇性鏈結 ?."
scan_forbidden '(^|[^[:alnum:]_$.])let[[:space:]]+[[:alpha:]_$]' 'let 宣告' ''
scan_forbidden '(^|[^[:alnum:]_$.])const[[:space:]]+[[:alpha:]_$]' 'const 宣告' ''
scan_forbidden '(^|[^[:alnum:]_$.])class[[:space:]]+[[:alpha:]_$]' 'class 宣告' ''
scan_forbidden '\?\.' '選擇性鏈結 ?.' ''

# ---------------------------------------------------------------- 6. 引擎層純度
# SPEC 第 1 節第 7 款：js/engine/*.js 不得觸碰 document／localStorage／alert。
step "6. 引擎層純函式：js/engine 不得碰 document／localStorage／alert"
# 樣式刻意要求「後面接 . [ 或 (」，也就是真的在取用這些全域物件；
# 註解裡寫「不碰 document、不碰 localStorage」不會被誤判成違規。
ENGPAT='document[[:space:]]*[.[(]|(localStorage|sessionStorage)[[:space:]]*[.[]|(^|[^[:alnum:]_$.])alert[[:space:]]*\('
ENGHIT=0
for f in $JSFILES; do
  case "$f" in ./js/engine/*) ;; *) continue ;; esac
  if grep -nE "$ENGPAT" "$f" >/dev/null 2>&1; then
    ENGHIT=1
    grep -nE "$ENGPAT" "$f" | sed "s|^|      $f:|"
  fi
done
if [ "$ENGHIT" -eq 1 ]; then bad "引擎層碰到了 DOM 或儲存層"; else ok "引擎層乾淨"; fi

# ---------------------------------------------------------------- 7. 不得存在 js/lib/ai.js
step "7. 專案不得包含 js/lib/ai.js（本專案不含任何 API 呼叫）"
if [ -f js/lib/ai.js ]; then bad "js/lib/ai.js 存在，必須刪除"; else ok "js/lib/ai.js 不存在"; fi

# ---------------------------------------------------------------- 8. 已移除的機制不得殘留
# UI-V2 第 1、6 節：多檢視註冊表（registerView）與 A／B／C 客戶版本都已整條移除。
# 殘留一個呼叫就會再長出一個沒人維護的分支。
step "8. js/ 底下不得出現 registerView（多檢視機制已移除）"
RVHIT=0
for f in $JSFILES; do
  case "$f" in ./js/*) ;; *) continue ;; esac
  if grep -n 'registerView' "$f" >/dev/null 2>&1; then
    RVHIT=1
    grep -n 'registerView' "$f" | sed "s|^|      $f:|"
  fi
done
if grep -n 'registerView' index.html >/dev/null 2>&1; then
  RVHIT=1
  grep -n 'registerView' index.html | sed 's|^|      index.html:|'
fi
if [ "$RVHIT" -eq 1 ]; then bad "仍有 registerView"; else ok "沒有 registerView"; fi

step "8b. 全專案不得殘留 A／B／C 客戶版本機制"
scan_forbidden 'registerView' 'registerView' ''
scan_forbidden 'ctx\.ed[^A-Za-z]' '結果樹的版本節點（點號取用）' ''
scan_forbidden 'p\.edition' '專案的版本欄位（點號取用）' ''
scan_forbidden 'TD\.data\.editions' '版本資料表' ''
scan_forbidden '(^|[^A-Za-z])ed[ABC]([^A-Za-z]|$)' '版本檢視代號' ''

step "8c. 介面檔不得出現已刪除的檔案名"
GONE='views-site|views-reg|views-fin|views-settings|present\.js|editions\.js|edition\.js'
if grep -nE "$GONE" index.html >/dev/null 2>&1; then
  bad "index.html 仍提到已刪除的檔案"
  grep -nE "$GONE" index.html | sed 's|^|      |'
else
  ok "index.html 沒有提到已刪除的檔案"
fi

step "8d. 介面上不得出現模組代號或「模組」二字（UI-V2 第 8 節第 3 款）"
# 掃描對象：index.html、assets/app.css、js/main.js、js/ui/ 的原始碼。
# js/ui/common.js 是唯一的白名單：它的中文化表 zh() 刻意用組字串寫出這些樣式，
# 目的是把代號換成中文，不是把代號顯示出來。執行期的防線在 8e。
CODEHIT=0
CODEFILES="index.html assets/app.css js/main.js js/ui/inputs.js js/ui/results.js js/ui/details.js js/ui/report.js"
MODPAT='(^|[^0-9A-Za-z_])M[1-8]([^0-9A-Za-z_]|$)'
WORDPAT='模組'
for f in $CODEFILES; do
  [ -f "$f" ] || continue
  if grep -nE "$MODPAT" "$f" >/dev/null 2>&1; then
    CODEHIT=1
    grep -nE "$MODPAT" "$f" | sed "s|^|      $f:|"
  fi
  if grep -n "$WORDPAT" "$f" >/dev/null 2>&1; then
    CODEHIT=1
    grep -n "$WORDPAT" "$f" | sed "s|^|      $f:|"
  fi
done
if [ "$CODEHIT" -eq 1 ]; then
  bad "介面原始碼裡出現模組代號或「模組」二字"
else
  ok "介面原始碼沒有模組代號，也沒有「模組」二字"
fi

step "8e. 執行期防線：渲染後的介面文字不得出現代號（組字串繞不過這一關）"
# 原始碼 grep 擋不住組字串，所以真正的防線是載入 js/ui/* 產生 HTML 再掃輸出。
# 斷言本體在 tools/smoke.js 第 19（報告可產生且含免責聲明）與第 20（渲染後文字乾淨）。
if grep -q 'check(19' tools/smoke.js && grep -q 'check(20' tools/smoke.js; then
  ok "smoke.js 保有第 19 與第 20 兩項執行期斷言"
else
  bad "smoke.js 少了第 19 或第 20 項執行期斷言（報告層與渲染後文字的防線，不得刪除）"
fi

step "9. 淺色單一主題：不得出現 prefers-color-scheme（UI-V2 第 1 節第 1 款）"
DARKHIT=0
for f in index.html assets/app.css $JSFILES; do
  [ -f "$f" ] || continue
  if grep -n 'prefers-color-scheme' "$f" >/dev/null 2>&1; then
    DARKHIT=1
    grep -n 'prefers-color-scheme' "$f" | sed "s|^|      $f:|"
  fi
done
if [ "$DARKHIT" -eq 1 ]; then
  bad "仍有 prefers-color-scheme（深色模式整段應已移除）"
else
  ok "沒有 prefers-color-scheme"
fi

# ----------------------------------------------------------------
printf '\n'
if [ "$FAIL" -eq 0 ]; then
  echo "=== checkall：全部通過 ==="
  exit 0
fi
echo "=== checkall：有項目未通過（見上方 FAIL）==="
exit 1
