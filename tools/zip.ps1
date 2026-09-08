# 壓縮一個資料夾成 zip，項目名一律用斜線。
#
# Compress-Archive（Windows PowerShell 5.1 底下的 .NET Framework）寫出來的
# 項目名帶反斜線，那不符合 ZIP 規範。Edge 吞得下去，Chrome 的解壓縮不一定 ——
# 兩家都要求 manifest.json 在根目錄，路徑分隔符錯了就是整包讀不到。
param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Destination)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Resolve-Path $Source).Path.TrimEnd('\')
if (Test-Path $Destination) { Remove-Item $Destination -Force }
$zip = [System.IO.Compression.ZipFile]::Open($Destination, 'Create')
try {
  Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose() }
