# Plan or start the Windows mobile hotspot.
# The address is always 192.168.137.1.
# -WhatIf prints the plan and does not start the hotspot.
# A real start needs a connection Windows can share. With no uplink, it stops.
# This script does not create a loopback adapter.
#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$Ssid = 'KidsGalaxy',
    [string]$Password = '',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

function Get-KidsGalaxyHotspotPassword {
    param([string]$Requested)

    $dest = Join-Path $env:USERPROFILE 'KidsGalaxy'
    $file = Join-Path $dest 'hotspot-password.txt'
    if ($Requested) {
        return @{ Password = $Requested; File = $file; Fresh = $false }
    }
    if (Test-Path -LiteralPath $file) {
        $saved = (Get-Content -LiteralPath $file -Raw).Trim()
        if ($saved) {
            return @{ Password = $saved; File = $file; Fresh = $false }
        }
    }
    $bytes = New-Object byte[] 18
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    $made = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '')
    if ($made.Length -lt 16) {
        throw 'Could not make a hotspot password.'
    }
    return @{ Password = $made.Substring(0, 16); File = $file; Fresh = $true }
}

function Save-KidsGalaxyHotspotPassword {
    param(
        [string]$File,
        [string]$Value
    )
    $dest = Split-Path -Parent $File
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Set-Content -LiteralPath $File -Value $Value -Encoding ascii
    $acl = Get-Acl -LiteralPath $File
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $env:USERNAME, 'FullControl', 'Allow')
    $acl.ResetAccessRule($rule)
    Set-Acl -LiteralPath $File -AclObject $acl
}

function Wait-KidsGalaxyWinRt {
    param($AsyncResult)

    $methods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1
    }
    $paramType = $AsyncResult.GetType()
    $method = $methods | Where-Object {
        $_.GetParameters()[0].ParameterType.Name -eq $paramType.Name -or
        $paramType.Name -like ($_.GetParameters()[0].ParameterType.Name + '*')
    } | Select-Object -First 1
    if (-not $method) {
        throw 'Windows could not wait for the hotspot call.'
    }
    if ($method.IsGenericMethodDefinition) {
        $typeArg = $paramType.GenericTypeArguments[0]
        $method = $method.MakeGenericMethod($typeArg)
    }
    $task = $method.Invoke($null, @($AsyncResult))
    $task.Wait() | Out-Null
    if ($task.IsFaulted) {
        throw $task.Exception.InnerException
    }
    if ($task.GetType().GetProperty('Result')) {
        return $task.Result
    }
    return $null
}

Write-Output 'The Windows hotspot address is 192.168.137.1. That address cannot be changed.'
Write-Output 'Tablets built for 192.168.0.52 will not use this hotspot.'
Write-Output 'Use the travel router when the address must stay 192.168.0.52.'
Write-Output 'Windows often will not start a hotspot unless it has a connection to share.'
Write-Output 'This script does not create a loopback adapter to fake that connection.'
Write-Output 'The hotspot turns off after the last tablet disconnects.'
Write-Output 'Sharing Wi-Fi while the PC is also joined to Wi-Fi is unreliable.'
Write-Output 'Mirrored Ubuntu may not see the hotspot adapter. Confirm that on this PC.'
Write-Output 'The hotspot adapter is often a Public network. The galaxy rules apply to Private.'
Write-Output 'If the firewall script says Public, set Private only for this room adapter.'

$profile = $null
$winrtReady = $false
try {
    $null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
    $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
    $winrtReady = $true
    $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
}
catch {
    Write-Output 'Windows could not open the hotspot controls on this PC.'
    Write-Output $_.Exception.Message
    if ($WhatIf) {
        Write-Output 'WhatIf: the hotspot was not started.'
        exit 0
    }
    exit 1
}

if ($WhatIf) {
    if ($profile) {
        Write-Output 'WhatIf: Windows has a connection it could share. The hotspot was not started.'
    }
    else {
        Write-Output 'WhatIf: Windows has no connection to share. A real start would stop.'
    }
    Write-Output 'A real run stores a password under your user folder and prints it once.'
    exit 0
}

if (-not $winrtReady -or -not $profile) {
    Write-Output 'Windows has no connection to share.'
    Write-Output 'The mobile hotspot will not start with no internet uplink.'
    Write-Output 'Use the travel router. It needs no internet.'
    exit 1
}

$made = Get-KidsGalaxyHotspotPassword -Requested $Password
Save-KidsGalaxyHotspotPassword -File $made.File -Value $made.Password
if ($made.Fresh) {
    Write-Output "New hotspot password: $($made.Password)"
}
else {
    Write-Output "Saved hotspot password: $($made.Password)"
}
Write-Output 'Write that password on the paper card.'

$manager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
if (-not $manager) {
    Write-Output 'Windows could not prepare the hotspot from that connection.'
    Write-Output 'Use the travel router. It needs no internet.'
    exit 1
}

$config = $manager.GetCurrentAccessPointConfiguration()
$config.Ssid = $Ssid
$config.Passphrase = $made.Password
Wait-KidsGalaxyWinRt -AsyncResult ($manager.ConfigureAccessPointAsync($config)) | Out-Null
$result = Wait-KidsGalaxyWinRt -AsyncResult ($manager.StartTetheringAsync())
Write-Output "Hotspot start result: $result"
Write-Output 'Tablets join this Wi-Fi and would use https://192.168.137.1:8443/.'
Write-Output 'That needs a tablet build for 192.168.137.1. The travel router does not.'
