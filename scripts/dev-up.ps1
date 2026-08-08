<#
.SYNOPSIS
    Bring the whole local debugging environment up in one step (Windows).

.DESCRIPTION
    The Windows counterpart of scripts/dev-up.sh. Android Studio runs it
    automatically as a "before launch" step of the "App (local debug)"
    configuration, so pressing Debug is genuinely all that is needed.

    In order:
      1. build and start the pi-server container, detached
      2. block until GET /health answers, so the app never launches against a
         server that is still starting - that failure looks like a broken app
      3. start an emulator if no device is attached, and wait for it to boot

    Every step is idempotent. Running it twice is a no-op that re-checks health.

.PARAMETER SkipEmulator
    Leave devices alone. Use this when debugging on a physical tablet over USB.
    Also settable as the environment variable KG_SKIP_EMULATOR=1.

.EXAMPLE
    cd android; .\gradlew devUp

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -SkipEmulator
#>
[CmdletBinding()]
param(
    [string] $HealthUrl = $(if ($env:KG_HEALTH_URL) { $env:KG_HEALTH_URL } else { 'http://localhost:8000/health' }),
    [int]    $ServerTimeout = $(if ($env:KG_SERVER_TIMEOUT) { [int] $env:KG_SERVER_TIMEOUT } else { 300 }),
    [int]    $EmulatorTimeout = $(if ($env:KG_EMULATOR_TIMEOUT) { [int] $env:KG_EMULATOR_TIMEOUT } else { 300 }),
    [string] $Avd = $env:KG_AVD,
    [switch] $SkipEmulator = ($env:KG_SKIP_EMULATOR -eq '1')
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([string] $Message) Write-Host "[dev-up] $Message" -ForegroundColor Cyan }
function Write-Note { param([string] $Message) Write-Host "[dev-up] $Message" -ForegroundColor Yellow }

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ----------------------------------------------------------------- server ---

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'docker not found on PATH. Install Docker Desktop, or run the server by hand: cd pi-server; uvicorn main:app --reload'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'The Docker daemon is not responding. Start Docker Desktop and try again.'
}

Write-Step 'Building and starting pi-server...'
docker compose up -d --build pi-server
if ($LASTEXITCODE -ne 0) { throw 'docker compose failed to start pi-server.' }

Write-Step "Waiting for $HealthUrl ..."
$deadline = (Get-Date).AddSeconds($ServerTimeout)
while ($true) {
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) { break }
    } catch {
        # Not up yet. Keep waiting until the deadline.
    }
    if ((Get-Date) -gt $deadline) {
        Write-Note 'Last 40 lines of the container log:'
        docker compose logs --tail 40 pi-server
        throw "Server did not become healthy within $ServerTimeout seconds."
    }
    Start-Sleep -Seconds 2
}
Write-Step 'Server is healthy.'

# --------------------------------------------------------------- emulator ---

if ($SkipEmulator) {
    Write-Step "SkipEmulator set - leaving devices alone. Server: $HealthUrl"
    exit 0
}

# The SDK location, in the same order Android Studio resolves it. The
# local.properties form is Java .properties escaped ("C\:\\Users\\..."), so
# unescape it before use.
$sdkRoot = $null
if ($env:ANDROID_HOME) {
    $sdkRoot = $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT) {
    $sdkRoot = $env:ANDROID_SDK_ROOT
} elseif (Test-Path 'android\local.properties') {
    $match = Select-String -Path 'android\local.properties' -Pattern '^sdk\.dir=' | Select-Object -First 1
    if ($match) {
        $sdkRoot = $match.Line -replace '^sdk\.dir=', '' -replace '\\\\', '\' -replace '\\:', ':'
    }
}

function Resolve-Tool {
    param([string] $Name, [string] $RelativePath)
    $onPath = Get-Command $Name -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    if ($sdkRoot) {
        $candidate = Join-Path $sdkRoot $RelativePath
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

$adbBin = Resolve-Tool -Name 'adb' -RelativePath 'platform-tools\adb.exe'
if (-not $adbBin) {
    Write-Note 'adb not found - skipping the device step. Set ANDROID_HOME, or start a device from Android Studio.'
    Write-Step "Server is up regardless: $HealthUrl"
    exit 0
}

$attached = (& $adbBin devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
if ($attached) {
    Write-Step 'A device is already attached - nothing to start.'
    Write-Step "Debug environment is up. Server: $HealthUrl"
    exit 0
}

$emulatorBin = Resolve-Tool -Name 'emulator' -RelativePath 'emulator\emulator.exe'
if (-not $emulatorBin) {
    Write-Note 'No emulator binary found - start a device from Android Studio instead.'
    Write-Step "Server is up regardless: $HealthUrl"
    exit 0
}

if (-not $Avd) {
    $Avd = (& $emulatorBin -list-avds | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1)
}

if (-not $Avd) {
    Write-Note 'No AVD defined. Create one in Device Manager - a 7 to 8 inch tablet is the interesting shape for this app.'
    Write-Step "Server is up regardless: $HealthUrl"
    exit 0
}

Write-Step "Starting emulator: $Avd"
Start-Process -FilePath $emulatorBin `
    -ArgumentList @('-avd', $Avd, '-netdelay', 'none', '-netspeed', 'full') `
    -WindowStyle Minimized

Write-Step 'Waiting for it to finish booting...'
& $adbBin wait-for-device
$deadline = (Get-Date).AddSeconds($EmulatorTimeout)
while ($true) {
    $booted = (& $adbBin shell getprop sys.boot_completed 2>$null) -replace '\s', ''
    if ($booted -eq '1') { break }
    if ((Get-Date) -gt $deadline) {
        throw "Emulator did not finish booting within $EmulatorTimeout seconds."
    }
    Start-Sleep -Seconds 2
}

Write-Step 'Emulator ready.'
Write-Step "Debug environment is up. Server $HealthUrl, reachable from the app as http://10.0.2.2:8000/"
