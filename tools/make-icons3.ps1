$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = 'C:\ts\assets\android-icon-monochrome.png'
$img = [System.Drawing.Image]::FromFile($src)
$dens = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
foreach ($d in $dens.Keys) {
  $s = $dens[$d]
  $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $s, $s)
  $g.Dispose()
  $bmp.Save("C:\ts\android\app\src\main\res\mipmap-$d\ic_launcher_monochrome.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("  mipmap-$d ic_launcher_monochrome.png " + $s + "x" + $s)
}
$img.Dispose()
Write-Output 'done'
