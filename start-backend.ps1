# 启动「双人空间」同步服务器（8787）
#
# 用法（在 C:\ts 下）：
#   powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
# 停止：
#   Get-NetTCPConnection -LocalPort 8787 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
#
# 这台机器上的 Cloudflare 隧道（<你的服务器域名>）指向的就是这个 8787，
# 所以只要这个进程活着，两台手机就能通过公网地址同步。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:PORT = '8787'
# 0.0.0.0：Cloudflare 隧道和局域网里的手机都能连
$env:HOST = '0.0.0.0'

# 已经在跑就不重复启动
$busy = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "8787 已经有进程在监听（PID $($busy[0].OwningProcess)），不重复启动。"
  exit 0
}

$logDir = Join-Path $root 'server\data'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$out = Join-Path $logDir 'sync-out.log'
$err = Join-Path $logDir 'sync-err.log'

# 独立进程（不挂在当前终端上）：关掉窗口也不会把服务器带走
Start-Process -FilePath 'node' `
  -ArgumentList 'server/sync-server.mjs' `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err

Start-Sleep -Seconds 2
try {
  $ping = Invoke-RestMethod 'http://127.0.0.1:8787/ping' -TimeoutSec 5
  Write-Host "同步服务器已启动：ok=$($ping.ok) service=$($ping.service) rev=$($ping.rev)"
  Write-Host "日志：$out"
} catch {
  Write-Host "启动后探测失败，请看日志：$err" -ForegroundColor Yellow
  if (Test-Path $err) { Get-Content $err -Tail 20 }
}
