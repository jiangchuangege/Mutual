# 确保云隧道在跑，并把当前公网地址打印出来（同时复制到剪贴板）
# 说明：这是 cloudflared 的「快速隧道」，地址是随机的 *.trycloudflare.com，每次重启会变。
$ErrorActionPreference = 'SilentlyContinue'
$log = 'C:\ts\server\tunnel.err.log'
$cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

function Get-TunnelUrl {
  if (-not (Test-Path $log)) { return $null }
  $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
  if (-not $m) { return $null }
  if ($m.Line -match '(https://[a-z0-9-]+\.trycloudflare\.com)') { return $matches[1] }
  return $null
}

function Test-Url($u) {
  if (-not $u) { return $false }
  try {
    $r = Invoke-WebRequest -Uri "$u/ping" -TimeoutSec 15 -UseBasicParsing
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

# 1) 已经有可用隧道就直接用
$url = Get-TunnelUrl
if ($url -and (Test-Url $url)) {
  "隧道已在运行：$url"
  Set-Clipboard -Value $url
  exit 0
}

# 2) 没有就新起一个
if (-not (Test-Path $cf)) {
  "找不到 cloudflared：$cf"
  "装一个或者改用局域网地址（见下面的提示）"
  exit 1
}
Remove-Item $log -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', 'http://localhost:8787', '--no-autoupdate' -RedirectStandardOutput 'C:\ts\server\tunnel.out.log' -RedirectStandardError $log -WindowStyle Hidden
"正在建立隧道，等十几秒…"
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $url = Get-TunnelUrl
  if ($url -and (Test-Url $url)) {
    "隧道已就绪：$url"
    Set-Clipboard -Value $url
    exit 0
  }
}
"隧道没起来，看看 $log 里的日志"
exit 1
