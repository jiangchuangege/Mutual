$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\Jiao\Desktop\d30337a2c5774608a08323fa089c377c.png'
$root = 'C:\ts'
$img = [System.Drawing.Image]::FromFile($src)

function New-Canvas([int]$w, [int]$h, [System.Drawing.Color]$back) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear($back)
  return @{ bmp = $bmp; g = $g }
}

# 画一张：背景色 + 图案按 scale 缩放居中；round = 圆形裁切
function Save-Icon([string]$path, [int]$size, [double]$scale, [System.Drawing.Color]$back, [bool]$round) {
  $c = New-Canvas $size $size $back
  $g = $c.g
  $side = [int]([math]::Round($size * $scale))
  $off = [int](($size - $side) / 2)
  if ($round) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddEllipse(0, 0, $size - 1, $size - 1)
    $g.SetClip($gp)
  }
  $g.DrawImage($img, $off, $off, $side, $side)
  $g.Dispose()
  $dir = Split-Path $path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $c.bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $c.bmp.Dispose()
  Write-Output ("  {0}  {1}x{1} scale={2} round={3}" -f (Split-Path $path -Leaf), $size, $scale, $round)
}

$white = [System.Drawing.Color]::White
$cream = [System.Drawing.Color]::FromArgb(255, 255, 248, 244)
$clear = [System.Drawing.Color]::Transparent

Write-Output '== assets =='
# 传统图标：铺满（图案自带白底，四周留一点点边）
Save-Icon "$root\assets\icon.png" 1024 0.92 $white $false
# 自适应图标前景：图案缩到 66%（安全区），背景透明
Save-Icon "$root\assets\android-icon-foreground.png" 1024 0.66 $clear $false
# 自适应图标背景
Save-Icon "$root\assets\android-icon-background.png" 1024 1.0 $cream $false
# 启动图
Save-Icon "$root\assets\splash-icon.png" 1024 0.70 $clear $false
Save-Icon "$root\assets\favicon.png" 48 0.90 $white $false

Write-Output '== mipmap（同时删掉旧的 webp，避免同名资源冲突） =='
$densities = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($d in $densities.Keys) {
  $base = $densities[$d]
  $dir = "$root\android\app\src\main\res\mipmap-$d"
  foreach ($n in 'ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background', 'ic_launcher_monochrome') {
    $old = Join-Path $dir "$n.webp"
    if (Test-Path $old) { Remove-Item $old -Force }
  }
  # 传统方形图标
  Save-Icon (Join-Path $dir 'ic_launcher.png') $base 0.92 $white $false
  # 圆形图标
  Save-Icon (Join-Path $dir 'ic_launcher_round.png') $base 0.88 $white $true
  # 自适应前景：108dp 画布，图案占 66%
  $fg = [int]([math]::Round($base * 108 / 48))
  Save-Icon (Join-Path $dir 'ic_launcher_foreground.png') $fg 0.66 $clear $false
  # 自适应背景
  Save-Icon (Join-Path $dir 'ic_launcher_background.png') $fg 1.0 $cream $false
}

$img.Dispose()
Write-Output '== 完成 =='
