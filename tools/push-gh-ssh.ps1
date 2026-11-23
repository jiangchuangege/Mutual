# Add local SSH key to GitHub via API, then push over ssh.github.com:443 (ASCII only)
$ErrorActionPreference = 'Stop'
Set-Location C:\ts

$raw = ("protocol=https`nhost=github.com`n`n" | git credential fill) 2>$null
$token = ($raw | Select-String -Pattern '^password=(.+)$').Matches.Groups[1].Value
$headers = @{ Authorization = "token $token"; 'User-Agent' = 'dsh'; Accept = 'application/vnd.github+json' }

# 1) pick a public key
$pubPath = @("$env:USERPROFILE\.ssh\id_ed25519.pub", "$env:USERPROFILE\.ssh\id_rsa.pub") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $pubPath) { Write-Output 'NO_PUBKEY'; exit 1 }
$pub = (Get-Content $pubPath -Raw).Trim()
$fingerprint = ($pub -split ' ')[1].Substring(0, 20)
Write-Output ("public key: " + $pubPath + " (" + $fingerprint + "...)")

# 2) already added?
$existing = Invoke-RestMethod -Uri 'https://api.github.com/user/keys' -Headers $headers
$already = $existing | Where-Object { $_.key -eq $pub }
if ($already) {
  Write-Output ("key already on GitHub: " + $already.title)
} else {
  $payload = @{ title = 'dsh-windows-' + (Get-Date -Format 'yyyyMMdd'); key = $pub } | ConvertTo-Json
  $k = Invoke-RestMethod -Uri 'https://api.github.com/user/keys' -Method Post -Headers $headers -Body $payload -ContentType 'application/json'
  Write-Output ("key added: id=" + $k.id + " title=" + $k.title)
}

# 3) push over ssh 443
git remote set-url origin 'ssh://git@ssh.github.com:443/jiangchuangege/Mutual.git'
$env:GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15'
git push -u origin main 2>&1 | Select-Object -Last 6
Write-Output '== result =='
git log --oneline -1
git remote -v | Select-Object -First 1
