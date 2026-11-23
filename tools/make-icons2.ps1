$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = 'C:\Users\Jiao\Desktop\d30337a2c5774608a08323fa089c377c.png'
$root = 'C:\ts'
$img = [System.Drawing.Image]::FromFile($src)

function Save-Png([string]$path, [int]$w, [int]$h, [double]$scale, [System.Drawing.Color]$back) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear($back)
  $side = [int]([math]::Round($w * $scale))
  $off = [int](($w - $side) / 2)
  $g.DrawImage($img, $off, $off, $side, $side)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("  wrote " + (Split-Path $path -Leaf) + "  " + $w + "x" + $h)
}

$clear = [System.Drawing.Color]::Transparent

Write-Output '== splash-icon（assets + android drawable 各密度） =='
Save-Png "$root\assets\splash-icon.png" 1024 1024 0.70 $clear
# expo-splash-screen 用的就是这些 splashscreen_logo.png
Save-Png "$root\android\app\src\main\res\drawable-mdpi\splashscreen_logo.png" 320 320 0.80 $clear
Save-Png "$root\android\app\src\main\res\drawable-hdpi\splashscreen_logo.png" 480 480 0.80 $clear
Save-Png "$root\android\app\src\main\res\drawable-xhdpi\splashscreen_logo.png" 640 640 0.80 $clear
Save-Png "$root\android\app\src\main\res\drawable-xxhdpi\splashscreen_logo.png" 960 960 0.80 $clear
Save-Png "$root\android\app\src\main\res\drawable-xxxhdpi\splashscreen_logo.png" 1280 1280 0.80 $clear

Write-Output '== 主题图标（monochrome）：用同一张图做单色遮罩 =='
# 单色图标只保留轮廓：把图案画成纯白，alpha 用原图"非白"程度近似
$size = 432
$fg = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gg = [System.Drawing.Graphics]::FromImage($fg)
$gg.Clear($clear)
$side = [int]($size * 0.66)
$off = [int](($size - $side) / 2)
$gg.DrawImage($img, $off, $off, $side, $side)
$gg.Dispose()
$out = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $size; $y++) {
  for ($x = 0; $x -lt $size; $x++) {
    $p = $fg.GetPixel($x, $y)
    $lum = [int](($p.R * 0.299) + ($p.G * 0.587) + ($p.B * 0.114))
    $a = [int](255 - $lum)            # 越深越"实"
    if ($a -lt 28) { $a = 0 }
    $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
  }
}
$out.Save("$root\assets\android-icon-monochrome.png", [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
$fg.Dispose()
Write-Output '  wrote android-icon-monochrome.png 432x432'

# mipmap 各密度的 monochrome（108dp）
$dens = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
$base = [System.Drawing.Bitmap]::new(432, 432, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bg2 = [System.Drawing.Graphics]::FromImage($base)
$bg2.Clear($clear)
$bg2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$bg2.DrawImage($out, 0, 0, 432, 432)
$bg2.Dispose()
$monoFull = $base
foreach ($d in $dens.Keys) {
  $s = $dens[$d]
  $bmp = [System.Drawing.Bitmap]::new($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($bmp)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.Clear($clear)
  $g2.DrawImage($monoFull, 0, 0, $s, $s)
  $g2.Dispose()
  $bmp.Save("$root\android\app\src\main\res\mipmap-$d\ic_launcher_monochrome.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("  mipmap-$d ic_launcher_monochrome.png " + $s + "x" + $s)
}
$monoFull.Dispose()
$img.Dispose()
Write-Output '== 完成 =='
