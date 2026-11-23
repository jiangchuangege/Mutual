# Push C:\ts to a new GitHub repo "Mutual" (ASCII only for PowerShell 5.1 safety)
$ErrorActionPreference = 'Stop'
Set-Location C:\ts

Write-Output '== 1) read stored GitHub credential (token not printed) =='
$raw = ("protocol=https`nhost=github.com`n`n" | git credential fill) 2>$null
$token = ($raw | Select-String -Pattern '^password=(.+)$').Matches.Groups[1].Value
$user = ($raw | Select-String -Pattern '^username=(.+)$').Matches.Groups[1].Value
if (-not $token) { Write-Output 'NO_TOKEN'; exit 1 }
if (-not $user) { $user = 'jiangchuangege' }
Write-Output ("account = " + $user + " / token len = " + $token.Length)

Write-Output '== 2) extend .gitignore (no private data / build outputs) =='
$lines = @(
  '',
  '# ---- Mutual extra ignores ----',
  'server/data/',
  '*.keystore',
  '*.jks',
  '*.apk',
  '*.aab',
  'dist-core/',
  'android/app/build/',
  'android/build/',
  'android/.gradle/',
  'shots/',
  'tmp/',
  '*.log'
)
$ig = Join-Path $PWD '.gitignore'
$current = if (Test-Path $ig) { Get-Content $ig -Raw } else { '' }
if ($current -notmatch 'Mutual extra ignores') {
  Add-Content -Path $ig -Value ($lines -join "`n")
  Write-Output '.gitignore updated'
} else {
  Write-Output '.gitignore already updated'
}

Write-Output '== 3) create repo Mutual (private) =='
$headers = @{ Authorization = "token $token"; 'User-Agent' = 'dsh'; Accept = 'application/vnd.github+json' }
$payload = '{"name":"Mutual","private":true,"description":"Mutual - couples app (React Native + Expo): cinema sync, listen together, game library, cloud build","has_issues":true}'
try {
  $repo = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $headers -Body $payload -ContentType 'application/json'
  Write-Output ("created: " + $repo.full_name + " -> " + $repo.html_url)
} catch {
  Write-Output ("create failed (maybe exists): " + $_.Exception.Message)
}

Write-Output '== 4) remote + commit + push =='
git config user.name 'Jiao'
git config user.email 'jiangchuangege@users.noreply.github.com'
git branch -M main 2>$null
$remotes = git remote
if ($remotes -notcontains 'origin') {
  git remote add origin ("https://github.com/" + $user + "/Mutual.git")
} else {
  git remote set-url origin ("https://github.com/" + $user + "/Mutual.git")
}
git add -A
$staged = (git status --short | Measure-Object).Count
Write-Output ("staged: " + $staged)
git commit -m "Mutual v2.0.9: couples app (cinema sync / listen together / game library / cloud build)" 2>&1 | Select-Object -Last 2
git push -u origin main 2>&1 | Select-Object -Last 5
Write-Output '== 5) result =='
git log --oneline -1
git remote -v | Select-Object -First 1
