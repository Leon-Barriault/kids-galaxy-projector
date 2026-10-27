# Allow the galaxy ports on a private Windows network.
# Run from an admin PowerShell window. Safe to run again.
# A rule you already named KidsGalaxy is kept when it covers the same port.
# Remove only the rules this script created with: -Remove
#Requires -Version 5.1
#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$WslCreatorId = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'

$Rules = @(
    @{
        Name = 'KidsGalaxy-TabletDoor'
        Display = 'Kids Galaxy tablet door'
        Protocol = 'TCP'
        Port = 8443
    },
    @{
        Name = 'KidsGalaxy-WallPage'
        Display = 'Kids Galaxy wall page'
        Protocol = 'TCP'
        Port = 8000
    },
    @{
        Name = 'KidsGalaxy-FindRoom'
        Display = 'Kids Galaxy find room'
        Protocol = 'UDP'
        Port = 5353
    }
)

function Test-KidsGalaxyPortMatch {
    param(
        $PortValue,
        [string]$Protocol,
        [string]$WantedProtocol,
        [int]$Port
    )
    $proto = [string]$Protocol
    $protoOk = ($proto -eq $WantedProtocol) -or ($proto -eq 'Any')
    if (-not $protoOk) {
        return $false
    }
    foreach ($entry in @($PortValue)) {
        $text = [string]$entry
        if ($text -eq 'Any' -or $text -eq "$Port") {
            return $true
        }
        if ($text -match '^(?<start>\d+)-(?<end>\d+)$') {
            $start = [int]$Matches.start
            $end = [int]$Matches.end
            if ($Port -ge $start -and $Port -le $end) {
                return $true
            }
        }
    }
    return $false
}

function Get-KidsGalaxyPortRules {
    param(
        [string]$Protocol,
        [int]$Port
    )
    $found = @()
    $candidates = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -like '*KidsGalaxy*' -or $_.DisplayName -like '*KidsGalaxy*'
        })
    foreach ($rule in $candidates) {
        $filter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue
        if (-not $filter) {
            continue
        }
        if (Test-KidsGalaxyPortMatch -PortValue $filter.LocalPort -Protocol $filter.Protocol -WantedProtocol $Protocol -Port $Port) {
            $found += $rule
        }
    }
    return $found
}

function Remove-KidsGalaxyOwnedRule {
    param([string]$Name)
    $existing = Get-NetFirewallRule -Name $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -Name $Name
        Write-Output "Removed $Name."
    }
    else {
        Write-Output "$Name was already gone."
    }
}

function Remove-KidsGalaxyOwnedHyperVRule {
    param([string]$Name)
    if (-not (Get-Command Remove-NetFirewallHyperVRule -ErrorAction SilentlyContinue)) {
        return
    }
    $existing = Get-NetFirewallHyperVRule -Name $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallHyperVRule -Name $Name
        Write-Output "Removed Hyper-V rule $Name."
    }
}

if ($Remove) {
    foreach ($rule in $Rules) {
        Remove-KidsGalaxyOwnedRule -Name $rule.Name
        Remove-KidsGalaxyOwnedHyperVRule -Name ($rule.Name + '-HV')
    }
    Write-Output 'Rules you created by hand were left in place.'
    Write-Output 'The Hyper-V inbound setting was left as it is.'
    exit 0
}

foreach ($rule in $Rules) {
    $existing = @(Get-KidsGalaxyPortRules -Protocol $rule.Protocol -Port $rule.Port)
    if ($existing.Count -gt 0) {
        foreach ($item in $existing) {
            try {
                Set-NetFirewallRule -Name $item.Name -Enabled True -Profile Private -Action Allow -Direction Inbound | Out-Null
                Write-Output "Left $($item.Name) in place for port $($rule.Port)."
            }
            catch {
                Write-Output "Left $($item.Name) alone for port $($rule.Port). Windows said: $($_.Exception.Message)"
            }
        }
        continue
    }
    try {
        New-NetFirewallRule `
            -Name $rule.Name `
            -DisplayName $rule.Display `
            -Direction Inbound `
            -Action Allow `
            -Protocol $rule.Protocol `
            -LocalPort $rule.Port `
            -Profile Private | Out-Null
        Write-Output "Added $($rule.Name) on port $($rule.Port)."
    }
    catch {
        $again = Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue
        if ($again) {
            Set-NetFirewallRule -Name $rule.Name -Enabled True -Profile Private -Action Allow -Direction Inbound | Out-Null
            Write-Output "Left $($rule.Name) in place for port $($rule.Port)."
        }
        else {
            Write-Output "Could not add $($rule.Name). Windows said: $($_.Exception.Message)"
        }
    }
}

if (Get-Command Set-NetFirewallHyperVVMSetting -ErrorAction SilentlyContinue) {
    try {
        Set-NetFirewallHyperVVMSetting -Name $WslCreatorId -DefaultInboundAction Allow
        Write-Output 'Mirrored mode can reach Linux. The Hyper-V firewall allows inbound traffic.'
    }
    catch {
        Write-Output "The Hyper-V inbound setting was left as it is. Windows said: $($_.Exception.Message)"
    }
    if (Get-Command Get-NetFirewallHyperVRule -ErrorAction SilentlyContinue) {
        foreach ($rule in $Rules) {
            $hvName = $rule.Name + '-HV'
            $hvFound = $false
            try {
                $hvRules = @(Get-NetFirewallHyperVRule -ErrorAction SilentlyContinue | Where-Object {
                        $_.Name -like '*KidsGalaxy*' -or $_.DisplayName -like '*KidsGalaxy*'
                    })
                foreach ($item in $hvRules) {
                    $ports = $item.LocalPorts
                    if (-not $ports) {
                        $ports = $item.LocalPort
                    }
                    $proto = $item.Protocol
                    if (Test-KidsGalaxyPortMatch -PortValue $ports -Protocol $proto -WantedProtocol $rule.Protocol -Port $rule.Port) {
                        Write-Output "Left $($item.Name) in place for Hyper-V port $($rule.Port)."
                        $hvFound = $true
                    }
                }
            }
            catch {
                Write-Output "Hyper-V rules were left alone. Windows said: $($_.Exception.Message)"
                $hvFound = $true
            }
            if ($hvFound) {
                continue
            }
            if (-not (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue)) {
                continue
            }
            try {
                New-NetFirewallHyperVRule `
                    -Name $hvName `
                    -DisplayName $rule.Display `
                    -Direction Inbound `
                    -VMCreatorId $WslCreatorId `
                    -Protocol $rule.Protocol `
                    -LocalPorts $rule.Port `
                    -Action Allow | Out-Null
                Write-Output "Added $hvName on port $($rule.Port)."
            }
            catch {
                Write-Output "Left Hyper-V port $($rule.Port) alone. Windows said: $($_.Exception.Message)"
            }
        }
    }
}
else {
    Write-Output 'This Windows has no Hyper-V firewall command. That is normal on Windows 10.'
}

$public = @()
$profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
foreach ($item in $profiles) {
    $alias = [string]$item.InterfaceAlias
    if ($alias -match 'Loopback|vEthernet|WSL|Hyper-V|Bluetooth|Default Switch') {
        continue
    }
    $ipv4 = [string]$item.IPv4Connectivity
    $ipv6 = [string]$item.IPv6Connectivity
    if ($ipv4 -eq 'Disconnected' -and $ipv6 -eq 'Disconnected') {
        continue
    }
    if ([string]$item.NetworkCategory -eq 'Public') {
        $public += $item
    }
}

Write-Output 'The galaxy firewall rules are in place for the Private profile.'
if ($public.Count -eq 0) {
    Write-Output 'No connected adapter is set to Public.'
    exit 0
}

Write-Output 'A connected network is Public. The galaxy rules apply to Private networks only.'
foreach ($item in $public) {
    $alias = [string]$item.InterfaceAlias
    $safe = $alias.Replace("'", "''")
    Write-Output "Set-NetConnectionProfile -InterfaceAlias '$safe' -NetworkCategory Private"
}
Write-Output 'Run that line only for the room Wi-Fi or the travel router.'
Write-Output 'Leave a cafe or guest network as Public.'
exit 1
