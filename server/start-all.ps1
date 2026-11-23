# 确保同步服务器 + 云隧道都在跑，并打印手机该填的地址
$ErrorActionPreference = 'SilentlyContinue'

# 1) 服务端
$listening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath 'node' `
    -ArgumentList 'server/sync-server.mjs' `
    -WorkingDirectory 'C:\ts' `
    -RedirectStandardOutput 'C:\ts\server\out.log' `
    -RedirectStandardError 'C:\ts\server\err.log' `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

$health = $null
try { $health = Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 8 } catch {}
if ($health) {
  "服务端：✅ 在跑（端口 8787，账号 $($health.accounts) 个，版本 $($health.model)）"
} else {
  "服务端：❌ 没起来，看 C:\ts\server\err.log"
  exit 1
}

# 2) 局域网地址
$lan = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like '192.168.*' -and $_.InterfaceAlias -notmatch 'VirtualBox|VMware' } |
  Select-Object -First 1).IPAddress
if (-not $lan) { $lan = '192.168.1.100' }
"局域网地址（家里同一个 Wi-Fi 用，最稳）：http://${lan}:8787"

# 3) 云隧道
$tunnelOut = & powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\ts\server\ensure-tunnel.ps1'
$tunnelOut | ForEach-Object { "隧道：$_" }
$url = ($tunnelOut | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1)
if ($url) {
  $u = [regex]::Match($url.Line, 'https://[a-z0-9-]+\.trycloudflare\.com').Value
  ""
  "———— 手机上要填的地址 ————"
  "主地址： http://${lan}:8787"
  "备用地址：$u"
  ""
  "（备用地址已复制到剪贴板）"
} else {
  ""
  "隧道没起来：出门在外就用不了，先在家用局域网地址也行。"
}
