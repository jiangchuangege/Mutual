# 让同步服务器在开机/登录后自动起来（之前重启电脑后它没起，手机就连不上了）
$port = 8787
$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listening) { exit 0 }
Start-Process -FilePath "node" `
  -ArgumentList "server/sync-server.mjs" `
  -WorkingDirectory "C:\ts" `
  -RedirectStandardOutput "C:\ts\server\out.log" `
  -RedirectStandardError "C:\ts\server\err.log" `
  -WindowStyle Hidden
