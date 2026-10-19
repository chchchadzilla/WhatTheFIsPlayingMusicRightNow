<#
.SYNOPSIS
  One command to put this project on GitHub: installs the GitHub CLI if needed,
  logs you in (once), creates the repo, pushes, and adds topics.

.USAGE
  Open Terminal in the project folder and run:

    powershell -ExecutionPolicy Bypass -File .\tools\publish-to-github.ps1

  Add -Private if you don't want it public yet.
#>
param(
  [string]$RepoName = "WhatTheFIsPlayingMusicRightNow",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Test-Gh { return [bool](Get-Command gh -ErrorAction SilentlyContinue) }

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

# 1. GitHub CLI
if (-not (Test-Gh)) {
  Write-Host "GitHub CLI (gh) is not installed. Installing it for your user with winget..."
  winget install --id GitHub.cli -e --scope user --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Test-Gh)) {
    throw "gh was installed but this terminal can't see it yet. Close this window, open a new Terminal, and run the script again."
  }
}

# 2. Login (one time)
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "You need to log in to GitHub once. Follow the prompts; a browser window will open."
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw "GitHub login did not complete." }
}
$login = (gh api user --jq .login).Trim()
Write-Host "Logged in as $login"

# 3. If the docs were written for a different account name, fix the links
$baked = "chchchadzilla"
if ($login -ne $baked) {
  $files = @(git grep -l $baked)
  foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText((Join-Path $root $f))
    Write-Utf8NoBom (Join-Path $root $f) ($content -replace $baked, $login)
  }
  if ($files.Count -gt 0) {
    git add -A
    git commit -q -m "Point links at github.com/$login"
  }
}

# 4. Create + push (or just push if origin already exists)
$visibility = "--public"
if ($Private) { $visibility = "--private" }
$existing = $null
try { $existing = (git remote get-url origin 2>$null) } catch { $existing = $null }
if ($existing) {
  Write-Host "Remote 'origin' already exists ($existing). Pushing main..."
  git push -u origin main
} else {
  gh repo create $RepoName $visibility --source . --remote origin --push `
    --description "Find the tab playing music in any window, flash it, and pause everything with one button. Calls and mic untouched."
  if ($LASTEXITCODE -ne 0) { throw "gh repo create failed. See the message above." }
}

# 5. Topics (best effort)
try {
  gh repo edit "$login/$RepoName" --add-topic chrome-extension --add-topic manifest-v3 --add-topic productivity `
    --add-topic browser-tabs --add-topic audio --add-topic open-source 2>$null | Out-Null
} catch { }

Write-Host ""
Write-Host "Done:  https://github.com/$login/$RepoName"
Write-Host ""
Write-Host "One manual step (GitHub has no API for it):"
Write-Host "  Repo page -> Settings -> General -> Social preview -> Edit -> Upload an image"
Write-Host "  Pick:  $root\assets\social-preview.png"
