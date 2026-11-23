const fs = require('node:fs');
const p = 'C:/ts/tmp/backup-current.sh';
let t = fs.readFileSync(p, 'utf8');

// 1) tar 里加上 cloudbuild.keystore（签名密钥）+ systemd unit
const oldTar = /tar czf "\$FILE"[\s\S]*?-C "\$ROOT" server dist-core 2> "\$TRACE"/;
if (!oldTar.test(t)) throw new Error('tar 块没找到');
t = t.replace(
  oldTar,
  `# 顺手把 systemd 服务定义复制进项目目录（这样它也会进包）
mkdir -p "$ROOT/systemd"
if [ -f /etc/systemd/system/twospace.service ]; then
  cp -f /etc/systemd/system/twospace.service "$ROOT/systemd/" 2>/dev/null || true
fi

# 打包：server（含 data/games 等全部数据）+ dist-core + 云编译签名密钥
tar czf "$FILE" \\
  --warning=no-file-changed \\
  --exclude='*.log' \\
  --exclude='tunnel.*' \\
  --exclude='android-sdk' \\
  -C "$ROOT" server dist-core \\
  -C "$HOME" cloudbuild.keystore 2> "$TRACE"`
);

// 2) 关键条目校验：加上密钥、云编译模块
t = t.replace(
  "for need in 'server/data/space.json' 'server/sync-server.mjs' 'server/wsCore.mjs' 'dist-core/hub.js'; do",
  "for need in 'server/data/space.json' 'server/sync-server.mjs' 'server/wsCore.mjs' 'server/buildApk.mjs' 'dist-core/hub.js' 'cloudbuild.keystore'; do"
);

// 3) 统计行加上游戏数量与体积
t = t.replace(
  "BGS=$(grep -c '^server/data/backgrounds/' \"$LIST\" || true)",
  `BGS=$(grep -c '^server/data/backgrounds/' "$LIST" || true)
GAMES=$(grep -c '^server/data/games/' "$LIST" || true)
GAMESIZE=$(grep '^server/data/games/' "$LIST" 2>/dev/null | awk '{s+=1} END {print s+0}' >/dev/null 2>&1; echo 0)`
);

t = t.replace(
  'echo "   内容：space.json ✓  代码 ✓  dist-core ✓  头像 ${AVATARS} 张  背景 ${BGS} 张  照片 ${PHOTOS} 张"',
  'echo "   内容：space.json ✓  代码 ✓  dist-core ✓  云编译模块 ✓  签名密钥 ✓"\necho "         头像 ${AVATARS} 张  背景 ${BGS} 张  照片 ${PHOTOS} 张  云编译游戏 ${GAMES} 个"'
);

fs.writeFileSync(p, t, 'utf8');
console.log('已修改：', {
  keystore进包: t.includes('-C "$HOME" cloudbuild.keystore'),
  systemd: t.includes('systemd/twospace.service'),
  校验含密钥: t.includes("'cloudbuild.keystore'"),
  统计含游戏: t.includes('云编译游戏'),
});
