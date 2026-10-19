<#
.SYNOPSIS
  One command to put this project on GitHub: finds (or installs) the GitHub CLI,
  logs you in once, creates the repo, pushes, and adds topics.

.USAGE
  Open Terminal in the project folder and run:

    powershell -ExecutionPolicy Bypass -File .\tools\publish-to-github.ps1

  Add -Private if you don't want it public yet.
  Add -CheckOnly to just report where things stand (gh found? logged in? remote set?).
#>
param(
  [string]$RepoName = "WhatTheFIsPlayingMusicRightNow",
  [switch]$Private,
  [switch]$CheckOnly
)

# git / gh / winget print progress on stderr. Windows PowerShell 5.1 turns redirected stderr
# into errors, and "Stop" would kill the script on the first one. So: no redirects, "Continue",
# and we check exit codes ourselves.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Gh {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $dirs = @()
  if ($env:ProgramFiles) { $dirs += (Join-Path $env:ProgramFiles "GitHub CLI") }
  if ($env:LOCALAPPDATA) { $dirs += (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI") }
  if (${env:ProgramFiles(x86)}) { $dirs += (Join-Path ${env:ProgramFiles(x86)} "GitHub CLI") }
  foreach ($d in $dirs) {
    $exe = Join-Path $d "gh.exe"
    if (Test-Path $exe) {
      $env:Path = "$d;$env:Path"   # so plain `gh` works for the rest of this run
      return $exe
    }
  }
  return $null
}

# Runs a program silently and returns its exit code + stdout, without PowerShell
# turning its stderr into red errors.
function Invoke-Quiet([string]$Exe, [string[]]$Arguments) {
  $out = [System.IO.Path]::GetTempFileName()
  $err = [System.IO.Path]::GetTempFileName()
  $p = Start-Process -FilePath $Exe -ArgumentList $Arguments -NoNewWindow -Wait -PassThru `
       -RedirectStandardOutput $out -RedirectStandardError $err
  $stdout = ""
  if (Test-Path $out) { $stdout = [System.IO.File]::ReadAllText($out) }
  Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
  return @{ Code = $p.ExitCode; Out = $stdout.Trim() }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

# ---- 1. GitHub CLI -------------------------------------------------------
$gh = Find-Gh
if (-not $gh) {
  Write-Host "GitHub CLI (gh) is not installed. Installing it with winget..."
  winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
  $gh = Find-Gh
  if (-not $gh) {
    Write-Host ""
    Write-Host "gh was installed but this window can't see it yet."
    Write-Host "Close this window, open a NEW Terminal in this folder, and run the script again."
    exit 1
  }
}
Write-Host "GitHub CLI: $gh"

# ---- 2. Login (one time) -------------------------------------------------
$status = Invoke-Quiet $gh @("auth", "status")
$loggedIn = ($status.Code -eq 0)
$remote = (Invoke-Quiet "git" @("remote", "get-url", "origin")).Out

if ($CheckOnly) {
  if ($loggedIn) { Write-Host "GitHub login: yes" } else { Write-Host "GitHub login: NO  (the script will prompt you)" }
  if ($remote) { Write-Host "Remote origin: $remote" } else { Write-Host "Remote origin: not set yet (the script will create the repo)" }
  exit 0
}

if (-not $loggedIn) {
  Write-Host ""
  Write-Host "You need to log in to GitHub once. Follow the prompts below; a browser window will open."
  Write-Host "(Pick: GitHub.com, HTTPS, 'Login with a web browser'. Copy the code it shows, press Enter, paste the code.)"
  Write-Host ""
  & $gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub login did not complete. Run the script again when you're ready."
    exit 1
  }
}

$who = Invoke-Quiet $gh @("api", "user", "--jq", ".login")
if ($who.Code -ne 0 -or -not $who.Out) {
  Write-Host "Could not read your GitHub login. Try running:  gh auth status"
  exit 1
}
$login = $who.Out
Write-Host "Logged in as $login"

# ---- 3. If the docs were written for a different account, fix the links ----
$baked = "chchchadzilla"
if ($login -ne $baked) {
  $grep = Invoke-Quiet "git" @("grep", "-l", $baked)
  $files = @()
  if ($grep.Out) { $files = $grep.Out -split "`r?`n" | Where-Object { $_ } }
  foreach ($f in $files) {
    $path = Join-Path $root $f
    $content = [System.IO.File]::ReadAllText($path)
    Write-Utf8NoBom $path ($content -replace $baked, $login)
  }
  if ($files.Count -gt 0) {
    git add -A
    git commit -q -m "Point links at github.com/$login"
    Write-Host "Updated $($files.Count) file(s) to point at github.com/$login"
  }
}

# ---- 4. Create + push (or just push if origin already exists) -----------
$visibility = "--public"
if ($Private) { $visibility = "--private" }

if ($remote) {
  Write-Host "Remote 'origin' already exists ($remote). Pushing main..."
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { Write-Host "Push failed. See the message above."; exit 1 }
} else {
  Write-Host "Creating github.com/$login/$RepoName and pushing..."
  & $gh repo create $RepoName $visibility --source . --remote origin --push `
    --description "Find the tab playing music in any window, flash it, and pause everything with one button. Calls and mic untouched."
  if ($LASTEXITCODE -ne 0) { Write-Host "gh repo create failed. See the message above."; exit 1 }
}

# ---- 5. Topics (best effort) --------------------------------------------
$null = Invoke-Quiet $gh @("repo", "edit", "$login/$RepoName",
  "--add-topic", "chrome-extension", "--add-topic", "manifest-v3", "--add-topic", "productivity",
  "--add-topic", "browser-tabs", "--add-topic", "audio", "--add-topic", "open-source")

Write-Host ""
Write-Host "Done:  https://github.com/$login/$RepoName"
Write-Host ""
Write-Host "One manual step (GitHub has no API for it):"
Write-Host "  Repo page -> Settings -> General -> Social preview -> Edit -> Upload an image"
Write-Host "  Pick:  $root\assets\social-preview.png"
