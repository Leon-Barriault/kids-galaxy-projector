# Forward the tablet door from Windows to Ubuntu.
# Use this when mirrored mode is not on. NAT mode only.
# Run from an admin PowerShell window. Safe to run again.
# Remove the forward with: -Remove
#Requires -Version 5.1
#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$Distro = 'Ubuntu-22.04',
    [string]$User = 'omega',
    [int[]]$Ports = @(8443),
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

function Get-KidsGalaxyWslIp {
    param(
        [string]$DistroName,
        [string]$UserName
    )
    $raw = & wsl.exe -d $DistroName -u $UserName -- hostname -I
    if ($LASTEXITCODE -ne 0) {
        throw "Ubuntu did not answer. Open Ubuntu once, then run this again."
    }
    $text = ($raw | Out-String)
    $match = [regex]::Match($text, '\d+\.\d+\.\d+\.\d+')
    if (-not $match.Success) {
        throw 'Ubuntu has no address yet. Open Ubuntu, then run this again.'
    }
    return $match.Value
}

if ($Remove) {
    foreach ($port in $Ports) {
        & netsh.exe interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port | Out-Null
        Write-Output "Removed the forward for port $port."
    }
    Write-Output 'The tablet door forward is removed.'
    exit 0
}

Set-Service -Name iphlpsvc -StartupType Automatic
Start-Service -Name iphlpsvc

$wslIp = Get-KidsGalaxyWslIp -DistroName $Distro -UserName $User
foreach ($port in $Ports) {
    & netsh.exe interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port | Out-Null
    & netsh.exe interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not forward port $port to $wslIp."
    }
    Write-Output "Port $port now forwards to $wslIp."
}

Write-Output 'Tablets must use the Windows address on the paper card, not this Ubuntu address.'
Write-Output 'Run this script again after wsl --shutdown if the Ubuntu address changes.'
Write-Output 'The sign-in task runs this refresh for you.'
