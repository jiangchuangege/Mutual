#!/usr/bin/env bash
# 双人空间 · 全量备份（服务端代码 + 数据）
#
# 两个已修的坑：
#  1) 以前用 `tar -tzf 包 | grep -q 条目` 校验：grep 命中即退出会让 tar 收到 SIGPIPE(141)，
#     配合 pipefail 被误判为"缺少文件"。现在先把清单落到临时文件再查。
#  2) 服务端在跑的时候会不断重写 space.json（tmp + rename，原子写），
#     tar 读到正在被替换的文件会以**退出码 1** 警告 "file changed as we read it"。
#     所以只把 >=2 当作真失败；1 是正常的热备警告。
set -euo pipefail

ROOT="/opt/twospace"        # 项目根目录（内含 server/ 和 dist-core/）
DEST="${HOME}/backup"
KEEP=14

mkdir -p "$DEST"

if [ ! -f "$ROOT/server/data/space.json" ]; then
  echo "❌ 找不到 $ROOT/server/data/space.json —— 数据不在预期位置" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
FILE="$DEST/twospace-$TS.tgz"
LIST="$(mktemp)"
TRACE="$(mktemp)"
JSONCHK="$(mktemp)"

cleanup() { rm -f "$LIST" "$TRACE" "$JSONCHK"; }
trap cleanup EXIT

# 打包：server（含 data）+ dist-core，跳过日志和隧道垃圾
set +e
tar czf "$FILE" \
  --warning=no-file-changed \
  --exclude='*.log' \
  --exclude='tunnel.*' \
  -C "$ROOT" server dist-core 2> "$TRACE"
TAR_RC=$?
set -e

# 0 = 完全干净；1 = 有文件在读取时被改写（服务端在跑，正常）；>=2 = 真错误
if [ "$TAR_RC" -ge 2 ]; then
  echo "❌ 打包失败（tar 退出码 $TAR_RC）：" >&2
  sed -n '1,5p' "$TRACE" >&2
  rm -f "$FILE"
  exit 1
fi
if [ "$TAR_RC" -eq 1 ]; then
  echo "ℹ️  tar 退出码 1（服务端正在写 space.json，属正常热备警告，已忽略）"
fi

# 校验 1：整包能完整解出清单（同时验证 gzip 完整性）
if ! tar -tzf "$FILE" > "$LIST" 2>/dev/null; then
  echo "❌ 备份包损坏，已删除：$FILE" >&2
  rm -f "$FILE"
  exit 1
fi

# 校验 2：关键条目必须都在
missing=""
for need in 'server/data/space.json' 'server/sync-server.mjs' 'server/wsCore.mjs' 'dist-core/hub.js'; do
  if ! grep -qxF "$need" "$LIST"; then missing="$missing $need"; fi
done
if [ -n "$missing" ]; then
  echo "❌ 包里缺少：$missing（已删除 $FILE）" >&2
  rm -f "$FILE"
  exit 1
fi

# 校验 3：space.json 能当 JSON 解析（防止刚好抓到写入瞬间）
if command -v python3 >/dev/null 2>&1; then
  if tar xzOf "$FILE" server/data/space.json > "$JSONCHK" 2>/dev/null \
     && ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$JSONCHK" 2>/dev/null; then
    echo "⚠️  包里的 space.json 无法解析（可能抓到写入瞬间），建议再跑一次" >&2
  fi
fi

SIZE=$(du -h "$FILE" | cut -f1)
COUNT=$(wc -l < "$LIST")
PHOTOS=$(grep -c '^server/data/photos/' "$LIST" || true)
AVATARS=$(grep -c '^server/data/avatars/' "$LIST" || true)
BGS=$(grep -c '^server/data/backgrounds/' "$LIST" || true)

# 只保留最近 $KEEP 份
ls -1t "$DEST"/twospace-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "✅ 备份完成"
echo "   文件：$FILE"
echo "   大小：$SIZE（$COUNT 个条目）"
echo "   内容：space.json ✓  代码 ✓  dist-core ✓  头像 ${AVATARS} 张  背景 ${BGS} 张  照片 ${PHOTOS} 张"
echo "   现有备份：$(ls -1 "$DEST"/twospace-*.tgz 2>/dev/null | wc -l) 份（保留最近 $KEEP 份）"
df -h "$DEST" | tail -1 | awk '{print "   磁盘剩余："$4" / 共 "$2}'
