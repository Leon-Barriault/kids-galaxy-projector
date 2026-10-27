# Remember to start the galaxy when Windows signs in.
# Run from an admin PowerShell window. Safe to run again.
# Remove the task with: -Remove
#Requires -Version 5.1
#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$Distro = '',
    [string]$User = '',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Kids Galaxy room'
. (Join-Path $PSScriptRoot 'kids-galaxy-common.ps1')

if ($Remove) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output 'The start task was removed.'
    exit 0
}

$Distro = Get-KidsGalaxyDefaultDistro -Requested $Distro
$User = Get-KidsGalaxyDefaultUser -Requested $User -DistroName $Distro

$dest = Join-Path $env:USERPROFILE 'KidsGalaxy'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($name in @(
        'kids-galaxy-common.ps1',
        'kids-galaxy-logon.ps1',
        'kids-galaxy-portproxy.ps1',
        'kids-galaxy-lan-ip.ps1'
    )) {
    Copy-Item -Force -Path (Join-Path $PSScriptRoot $name) -Destination (Join-Path $dest $name)
}

$logon = Join-Path $dest 'kids-galaxy-logon.ps1'
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$logon`" -Distro $Distro -User $User"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Output 'The start task is in place.'
Write-Output "It runs as $($env:USERNAME) the next time this Windows account signs in."
