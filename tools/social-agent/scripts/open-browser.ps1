param(
  [int]$Port = 9333,
  [string]$ProfileDir = "C:\Users\hi\AppData\Local\paqu-playwright-profile",
  [string]$ChromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ChromeExe)) {
  throw "Chrome not found: $ChromeExe"
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$versionUrl = "http://127.0.0.1:$Port/json/version"
try {
  $existing = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 2
  if ($existing.webSocketDebuggerUrl) {
    Write-Host "Project Chrome is already available at $versionUrl"
    Write-Host "Browser: $($existing.Browser)"
    exit 0
  }
} catch {
  # No existing CDP endpoint; start a dedicated Chrome below.
}

Start-Process -FilePath $ChromeExe -ArgumentList @(
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$Port",
  "--user-data-dir=$ProfileDir",
  "https://www.tiktok.com/en/",
  "https://x.com/",
  "https://www.youtube.com/",
  "https://www.reddit.com/"
)

Start-Sleep -Seconds 2

$started = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 5
if (-not $started.webSocketDebuggerUrl) {
  throw "Chrome started, but CDP endpoint is not ready: $versionUrl"
}

Write-Host "Project Chrome is ready at $versionUrl"
Write-Host "Browser: $($started.Browser)"
