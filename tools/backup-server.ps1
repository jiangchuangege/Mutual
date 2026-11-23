# ============================================================
# 双人空间 · 服务器数据备份（在你自己电脑上执行，每天一次）
#
# 做三件事：
#   1. 在服务器上把 data 目录打包（space.json + 头像/背景/照片）
#   2. 把包拉回本机（这样刷机也不会丢）
#   3. 清掉太旧的备份（本机留 14 份，服务器上留 7 份）
#
# 用法：右键“使用 PowerShell 运行”，或
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\ts\tools\backup-server.ps1
# ============================================================

# ---------- 按你的情况改这几行 ----------
$Server    = $(if ($env:TWOSPACE_SERVER) { $env:TWOSPACE_SERVER } else { Read-Host "服务器地址/域名" })                       # 云服务器公网 IP
$User      = 'admin'                                # 登录用户
$RemoteDir = '/opt/twospace'                        # 服务器上的项目目录
$LocalDir  = 'C:\Users\Jiao\Documents\twospace-backup'  # 备份存到本机哪里
$KeepLocal = 14                                     # 本机保留几份
$KeepRemote = 7                                     # 服务器上保留几份
# ----------------------------------------

$ErrorActionPreference = 'Stop'
$target = "${User}@${Server}"

function Fail($msg) {
  Write-Host ""
  Write-Host "❌ $msg" -ForegroundColor Red
  exit 1
}

# 0) 环境检查
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) { Fail "本机没有 ssh 命令（Windows 设置 → 应用 → 可选功能 → OpenSSH 客户端）" }
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) { Fail "本机没有 scp 命令" }
if (-not (Test-Path $LocalDir)) { New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$name = "twospace-$stamp.tgz"
$remoteFile = "~/backup/$name"

Write-Host "开始备份：$target  →  $LocalDir\$name" -ForegroundColor Cyan

# 1) 服务器上打包（顺便检查数据目录在不在）
$remoteCmd = @"
set -e
mkdir -p ~/backup
if [ ! -f $RemoteDir/server/data/space.json ]; then echo "NO_DATA_FILE"; exit 9; fi
tar czf $remoteFile -C $RemoteDir server/data
ls -l $remoteFile | awk '{print "REMOTE_SIZE="\$5}'
find ~/backup -name 'twospace-*.tgz' -mtime +$KeepRemote -delete
echo "REMOTE_OK"
"@

$out = & ssh -o ConnectTimeout=15 $target $remoteCmd 2>&1
$out | ForEach-Object { Write-Host "  [服务器] $_" -ForegroundColor DarkGray }

if ($out -match 'NO_DATA_FILE') { Fail "服务器上找不到 $RemoteDir/server/data/space.json —— 服务端还没部署好？" }
if ($out -notmatch 'REMOTE_OK') { Fail "服务器打包失败，看上面的输出" }

# 2) 拉回本机
Write-Host "下载中…" -ForegroundColor Cyan
& scp -o ConnectTimeout=15 "${target}:$remoteFile" (Join-Path $LocalDir $name) 2>&1 |
  Where-Object { $_ -notmatch '^\s*$' } | ForEach-Object { Write-Host "  [scp] $_" -ForegroundColor DarkGray }
$local = Join-Path $LocalDir $name
if (-not (Test-Path $local)) { Fail "下载失败，本机没有拿到文件" }

# 3) 校验包能不能解开（防止拿回一个坏包）
$check = & tar -tzf $local 2>&1
if ($LASTEXITCODE -ne 0) { Fail "备份包校验失败（tar -tzf 打不开）" }
$fileCount = ($check | Measure-Object).Count
$hasState = ($check | Where-Object { $_ -match 'server/data/space\.json$' }) -ne $null
if (-not $hasState) { Fail "备份包里没有 space.json，别用这份" }

# 4) 清掉本机旧备份
$old = Get-ChildItem $LocalDir -Filter 'twospace-*.tgz' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $KeepLocal
if ($old) {
  $old | Remove-Item -Force
  Write-Host "清理本机旧备份 $($old.Count) 份" -ForegroundColor DarkGray
}

# 5) 汇总
$sizeMB = [math]::Round((Get-Item $local).Length / 1MB, 2)
$total = (Get-ChildItem $LocalDir -Filter 'twospace-*.tgz').Count
Write-Host ""
Write-Host "✅ 备份完成" -ForegroundColor Green
Write-Host "   文件：$local"
Write-Host "   大小：$sizeMB MB（包内 $fileCount 个文件，含 space.json ✓）"
Write-Host "   本机现有备份：$total 份（保留最近 $KeepLocal 份）"
Write-Host ""
Write-Host "恢复方法：把包里的 server/data 解回服务器的 $RemoteDir/server/data，再 systemctl restart twospace"
Write-Host "  tar xzf $name -C $RemoteDir" -ForegroundColor DarkGray
