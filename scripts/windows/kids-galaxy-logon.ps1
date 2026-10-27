# Start the galaxy after a Windows sign-in.
# The sign-in task runs this. It is safe to run again.
#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$Distro = 'Ubuntu-22.04',
    [string]$User = 'omega'
)

$ErrorActionPreference = 'Stop'

Write-Output 'Starting Ubuntu and the galaxy program.'
& wsl.exe -d $Distro -u $User -- bash -lc 'cd "$HOME/kids-galaxy-projector" && bash scripts/wsl_bringup.sh'
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$wslConfig = Join-Path $env:USERPROFILE '.wslconfig'
$mirrored = $false
if (Test-Path -LiteralPath $wslConfig) {
    $text = Get-Content -LiteralPath $wslConfig -Raw
    if ($text -match '(?im)^\s*networkingMode\s*=\s*mirrored\s*$') {
        $mirrored = $true
    }
}

if ($mirrored) {
    Write-Output 'Mirrored mode is on. The tablet door does not need a port forward.'
}
else {
    $proxy = Join-Path $PSScriptRoot 'kids-galaxy-portproxy.ps1'
    & $proxy -Distro $Distro -User $User
}

& powercfg.exe /change standby-timeout-ac 0 | Out-Null
& powercfg.exe /change monitor-timeout-ac 0 | Out-Null
Write-Output 'The galaxy computer was asked to start. The PC stays awake while plugged in.'
