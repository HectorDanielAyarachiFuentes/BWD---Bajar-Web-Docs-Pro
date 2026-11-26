<#
.SYNOPSIS
  Empaqueta Webs-Docs para Firefox (about:debugging y Mozilla AMO) con rutas POSIX (/).
.EXAMPLE
  npm run zip
  powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1 -Version 0.2.6
#>
param(
  [string]$Version = ""
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. Actualizar versión si se pasó -Version
$manifestPath = Join-Path $root 'manifest.json'
$manifestRaw = Get-Content $manifestPath -Raw -Encoding UTF8
$manifestObj = $manifestRaw | ConvertFrom-Json

if ($Version -and $Version -ne $manifestObj.version) {
  $oldVer = $manifestObj.version
  $manifestRaw = $manifestRaw -replace "`"version`":\s*`"$([regex]::Escape($oldVer))`"", "`"version`": `"$Version`""
  [System.IO.File]::WriteAllText($manifestPath, $manifestRaw, [System.Text.UTF8Encoding]::new($false))

  $pkgPath = Join-Path $root 'package.json'
  if (Test-Path $pkgPath) {
    $pkgRaw = Get-Content $pkgPath -Raw -Encoding UTF8
    $pkgRaw = $pkgRaw -replace "`"version`":\s*`"$([regex]::Escape($oldVer))`"", "`"version`": `"$Version`""
    [System.IO.File]::WriteAllText($pkgPath, $pkgRaw, [System.Text.UTF8Encoding]::new($false))
  }

  $popupHtmlPath = Join-Path $root 'popup/popup.html'
  if (Test-Path $popupHtmlPath) {
    $htmlRaw = Get-Content $popupHtmlPath -Raw -Encoding UTF8
    $htmlRaw = $htmlRaw -replace "v$([regex]::Escape($oldVer))", "v$Version"
    [System.IO.File]::WriteAllText($popupHtmlPath, $htmlRaw, [System.Text.UTF8Encoding]::new($false))
  }
  $ver = $Version
} else {
  $ver = $manifestObj.version
}

# 2. Verificar sintaxis de todos los archivos JS propios (excluyendo libs/)
$jsFiles = Get-ChildItem -Path @('shared', 'popup', 'editor') -Filter '*.js' -File -ErrorAction SilentlyContinue
foreach ($jf in $jsFiles) {
  node --check $jf.FullName
  if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis en $($jf.FullName)" }
}

# 3. Armar archivo ZIP limpio con rutas POSIX (/)
$outRootZip = Join-Path $root "Webs-Docs-v$ver.zip"
$artifactsDir = Join-Path $root 'web-ext-artifacts'
if (-not (Test-Path $artifactsDir)) { New-Item -ItemType Directory -Path $artifactsDir | Out-Null }
$outArtifactZip = Join-Path $artifactsDir "webs-docs-$ver.zip"

if (Test-Path $outRootZip) { Remove-Item $outRootZip -Force }
if (Test-Path $outArtifactZip) { Remove-Item $outArtifactZip -Force }

$includeDirs = @('shared', 'popup', 'editor', 'icons', 'libs', 'Fronted embellecedor')
$files = New-Object System.Collections.Generic.List[string]
$files.Add($manifestPath)

foreach ($dir in $includeDirs) {
  $fullDir = Join-Path $root $dir
  if (Test-Path $fullDir) {
    Get-ChildItem -Path $fullDir -Recurse -File | Where-Object {
      $_.Name -notmatch '^(\.|Thumbs\.db|desktop\.ini)' -and $_.Extension -notin @('.zip', '.xpi')
    } | ForEach-Object { $files.Add($_.FullName) }
  }
}

$fs = [System.IO.File]::Create($outRootZip)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    foreach ($filePath in $files) {
      $rel = $filePath.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $filePath, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $zip.Dispose() }
} finally { $fs.Dispose() }

Copy-Item -Path $outRootZip -Destination $outArtifactZip -Force

# 4. Validar integridad del paquete
$verifyZip = [System.IO.Compression.ZipFile]::OpenRead($outRootZip)
try {
  $entries = $verifyZip.Entries | ForEach-Object { $_.FullName }
  if ($entries | Where-Object { $_ -like '*\*' }) { throw "Rutas con backslash detectadas en ZIP" }
  $sizeKB = [Math]::Round((Get-Item $outRootZip).Length / 1KB, 1)
  Write-Output "OK: Webs-Docs-v$ver.zip ($sizeKB KB, $($entries.Count) archivos, manifest v$ver)"
  Write-Output "OK: web-ext-artifacts/webs-docs-$ver.zip"
} finally { $verifyZip.Dispose() }
