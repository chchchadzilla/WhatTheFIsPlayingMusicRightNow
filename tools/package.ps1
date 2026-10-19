# Zips the extension for the Chrome Web Store (Windows / PowerShell).
#   .\tools\package.ps1
# Output: dist\WhatTheFIsPlayingMusicRightNow-<version>.zip
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$dist = Join-Path $root "dist"
$stage = Join-Path $dist "stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item (Join-Path $root "manifest.json") $stage
Copy-Item (Join-Path $root "LICENSE") $stage
Copy-Item (Join-Path $root "src") (Join-Path $stage "src") -Recurse
Copy-Item (Join-Path $root "icons") (Join-Path $stage "icons") -Recurse

$zip = Join-Path $dist "WhatTheFIsPlayingMusicRightNow-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Write-Host "Built $zip"
