# 把 C:\ts 提交到 GitHub（新仓库 Mutual）
# 只用 ASCII，避免 PowerShell 编码问题
$ErrorActionPreference = 'Stop'
Set-Location C:\ts

Write-Output '== 1) 取已保存的 GitHub 凭据（不打印 token） =='
$raw = ("protocol=https`nhost=github.com`n`n" | git credential fill) 2>$null
$token = ($raw | Select-String -Pattern '^password=(.+)$').Matches.Groups[1].Value
$user = ($raw | Select-String -Pattern '^username=(.+)$').Matches.Groups[1].Value
if (-not $token) { Write-Output 'NO_TOKEN'; exit 1 }
if (-not $user) { $user = 'jiangchuangege' }
Write-Output ("account = " + $user + " / token length = " + $token.Length)

Write-Output '== 2) 补充 .gitignore（不要把隐私数据和构建产物提交上去） =='
$ignore = @'

# ---- Mutual 追加：隐私与构建产物一律不入库 ----
server/data/
!server/data/.gitkeep
*.keystore
*.jks
*.apk
*.aab
dist-core/
android/app/build/
android/build/
android/.gradle/
shots/
tmp/
tools/*.tar
*.log
'@
$ig = Join-Path $PWD '.gitignore'
$current = if (Test-Path $ig) { Get-Content $ig -Raw } else { '' }
if ($current -notmatch 'Mutual 追加') {
  Add-Content -Path $ig -Value $ignore -NoNewline
  Write-Output '.gitignore updated'
} else {
  Write-Output '.gitignore already updated'
}

Write-Output '== 3) 创建 GitHub 仓库 Mutual（private） =='
$headers = @{ Authorization = "token $token"; 'User-Agent' = 'dsh'; Accept = 'application/vnd.github+json' }
$body = @{ name = 'Mutual'; private = $true; description = 'Mutual - 情侣双人空间 App（React Native + Expo，含影院同步、一起听、游戏库与云编译）'; has_issues = $true } | ConvertTo-Json
try {
  $repo = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $headers -Body $body -ContentType 'application/json'
  Write-Output ("created: " + $repo.full_name + " (" + $repo.html_url + ")")
} catch {
  Write-Output ("create failed (maybe exists): " + $_.Exception.Message)
}

Write-Output '== 4) 配置远端与提交 =='
git config user.name  'Jiao'
git config user.email 'jiangchuangege@users.noreply.github.com'
git branch -M main 2>$null
$remotes = git remote
if ($remotes -notcontains 'origin') {
  git remote add origin ("https://github.com/" + $user + "/Mutual.git")
} else {
  git remote set-url origin ("https://github.com/" + $user + "/Mutual.git")
}
git add -A
git status --short | Measure-Object | ForEach-Object { Write-Output ("staged files: " + $_.Count) }
git commit -m "Mutual v2.0.9: 情侣双人空间 App（影院同步/一起听/游戏库/云编译）" 2>&1 | Select-Object -Last 3
$env:GIT_ASKPASS = ''
git -c credential.helper= push -u origin main 2>&1 | Select-Object -Last 5
Write-Output '== 5) 结果 =='
git log --oneline -1
git remote -v | Select-Object -First 1
