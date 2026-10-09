# Recreate the PNG app icons on Windows using the same geometric mark as mark.svg.
Add-Type -AssemblyName System.Drawing
$taskIconFolder = Join-Path $PSScriptRoot '..\public\icons'
foreach ($taskIcon in @(@{ Size = 192; Name = 'icon-192.png' }, @{ Size = 512; Name = 'icon-512.png' }, @{ Size = 512; Name = 'maskable-512.png' })) {
    $taskBitmap = [System.Drawing.Bitmap]::new($taskIcon.Size, $taskIcon.Size)
    $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
    $taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $taskGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#2457e8'))
    $taskScale = $taskIcon.Size / 512.0
    $taskGraphics.ScaleTransform($taskScale, $taskScale)
    $taskWhiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $taskFadedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(166, 255, 255, 255))
    $taskTop = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(158,280), [System.Drawing.PointF]::new(256,144), [System.Drawing.PointF]::new(354,280), [System.Drawing.PointF]::new(308,314), [System.Drawing.PointF]::new(256,241), [System.Drawing.PointF]::new(204,314))
    $taskBottom = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(158,335), [System.Drawing.PointF]::new(204,301), [System.Drawing.PointF]::new(256,374), [System.Drawing.PointF]::new(308,301), [System.Drawing.PointF]::new(354,335), [System.Drawing.PointF]::new(256,407))
    $taskGraphics.FillPolygon($taskWhiteBrush, $taskTop)
    $taskGraphics.FillPolygon($taskFadedBrush, $taskBottom)
    $taskBitmap.Save((Join-Path $taskIconFolder $taskIcon.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $taskWhiteBrush.Dispose()
    $taskFadedBrush.Dispose()
    $taskGraphics.Dispose()
    $taskBitmap.Dispose()
    Write-Output "Created $($taskIcon.Name) ($($taskIcon.Size)x$($taskIcon.Size))"
}
