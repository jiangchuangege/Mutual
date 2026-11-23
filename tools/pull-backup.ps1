# ============================================================
# 双人空间 · 每天把服务器上最新的备份拉到 Windows
#
# 做四件事：
#   1. 让服务器先跑一次 ~/backup.sh（生成今天这份）
#   2. 找出服务器上最新的 twospace-*.tgz
#   3. 如果本地没有这份，就 scp 拉下来
#   4. 校验包 + 清理太旧的本地备份
#
# 前提：已经配好免密登录（见 ssh 密钥安装那条命令）
# 手动跑：powershell -NoProfile -ExecutionPolicy Bypass -File C:\ts\tools\pull-backup.ps1
# ============================================================

# ---------- 按你的情况改 ----------
$Server     = $(if ($env:TWOSPACE_SERVER) { $env:TWOSPACE_SERVER } else { Read-Host "服务器地址/域名" })
$User       = 'admin'
$LocalDir   = 'C:\Users\Jiao\Documents\twospace-backup'
$KeepLocal  = 14
$LogFile    = Join-Path $LocalDir 'pull.log'
# -----------------------------------

$ErrorActionPreference = 'Stop'

# 让 ssh/scp 输出的中文按 UTF-8 解码，否则日志和屏幕上是乱码
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$target = "${User}@${Server}"
$sshOpts = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new')

if (-not (Test-Path $LocalDir)) { New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null }

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Fail($msg) {
  Log "❌ $msg"
  exit 1
}

try {
  # 1) 让服务器先生成今天这份备份（脚本不存在就跳过，不报错）
  Log "触发服务器备份 ~/backup.sh …"
  $run = & ssh @sshOpts $target 'if [ -x ~/backup.sh ]; then ~/backup.sh; else echo "NO_BACKUP_SCRIPT"; fi' 2>&1
  $run | ForEach-Object { if ($_ -notmatch '^\s*$') { Log "  [服务器] $_" } }
  if ($run -match 'NO_BACKUP_SCRIPT') { Log "  ⚠️ 服务器上没有 ~/backup.sh，只拉已有的最新包" }

  # 2) 找最新的包
  $newest = (& ssh @sshOpts $target 'ls -1t ~/backup/twospace-*.tgz 2>/dev/null | head -1') 2>&1
  $newest = ($newest | Out-String).Trim()
  if (-not $newest -or $newest -notmatch 'twospace-.*\.tgz$') {
    Fail "服务器上没找到任何备份包（~/backup/twospace-*.tgz）"
  }
  $remoteSize = ((& ssh @sshOpts $target "stat -c %s '$newest'") 2>&1 | Out-String).Trim()
  $remoteMB = [math]::Round([double]$remoteSize / 1MB, 2)
  Log "服务器最新包：$newest（$remoteMB MB）"

  # 3) 本地已有且大小一致就跳过
  $fileName = Split-Path $newest -Leaf
  $local = Join-Path $LocalDir $fileName
  if ((Test-Path $local) -and ((Get-Item $local).Length -eq [long]$remoteSize)) {
    Log "本地已有同一份（$fileName），跳过下载"
  } else {
    Log "下载中…"
    & scp @sshOpts "${target}:$newest" $local 2>&1 |
      Where-Object { $_ -notmatch '^\s*$' } | ForEach-Object { Log "  [scp] $_" }
    if (-not (Test-Path $local)) { Fail "下载失败，本地没拿到文件" }
    if ((Get-Item $local).Length -ne [long]$remoteSize) { Fail "下载后大小和服务器不一致（可能是网络中断）" }
  }

  # 4) 校验：能打开 + 含 space.json
  $list = & tar -tzf $local 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "备份包打不开（$fileName）" }
  if (-not ($list | Where-Object { $_ -match '^server/data/space\.json$' -or $_ -match '^data/space\.json$' })) {
    Fail "备份包里没有 space.json，别用这份"
  }
  $photos = ($list | Where-Object { $_ -match 'photos/' } | Measure-Object).Count

  # 5) 清理本地旧备份
  $old = Get-ChildItem $LocalDir -Filter 'twospace-*.tgz' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $KeepLocal
  if ($old) {
    $old | Remove-Item -Force
    Log "清理本地旧备份 $($old.Count) 份"
  }

  $total = (Get-ChildItem $LocalDir -Filter 'twospace-*.tgz').Count
  Log "✅ 完成：$fileName（$([math]::Round((Get-Item $local).Length/1MB,2)) MB，照片 $photos 张）· 本地共 $total 份"
  exit 0
} catch {
  Log "❌ 出错：$($_.Exception.Message)"
  exit 1
}
