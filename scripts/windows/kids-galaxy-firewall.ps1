# Allow the galaxy ports on a private Windows network.
# Run from an admin PowerShell window. Safe to run again.
# Remove the rules with: -Remove
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

function Remove-KidsGalaxyRule {
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

function Remove-KidsGalaxyHyperVRule {
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
        Remove-KidsGalaxyRule -Name $rule.Name
        Remove-KidsGalaxyHyperVRule -Name ($rule.Name + '-HV')
    }
    if (Get-Command Set-NetFirewallHyperVVMSetting -ErrorAction SilentlyContinue) {
        Set-NetFirewallHyperVVMSetting -Name $WslCreatorId -DefaultInboundAction Block
        Write-Output 'The Hyper-V firewall for Ubuntu is blocking new inbound traffic again.'
    }
    Write-Output 'The galaxy firewall rules are removed.'
    exit 0
}

foreach ($rule in $Rules) {
    $existing = Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Set-NetFirewallRule -Name $rule.Name -Enabled True -Profile Private -Action Allow -Direction Inbound | Out-Null
        Write-Output "$($rule.Name) is already in place."
    }
    else {
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
}

if (Get-Command Set-NetFirewallHyperVVMSetting -ErrorAction SilentlyContinue) {
    Set-NetFirewallHyperVVMSetting -Name $WslCreatorId -DefaultInboundAction Allow
    Write-Output 'Mirrored mode can reach Ubuntu. The Hyper-V firewall allows inbound traffic.'
    if (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue) {
        foreach ($rule in $Rules) {
            $hvName = $rule.Name + '-HV'
            $hvExisting = Get-NetFirewallHyperVRule -Name $hvName -ErrorAction SilentlyContinue
            if ($hvExisting) {
                Write-Output "$hvName is already in place."
            }
            else {
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
        }
    }
}
else {
    Write-Output 'This Windows has no Hyper-V firewall command. That is normal on Windows 10.'
}

Write-Output 'The galaxy firewall rules are in place for the Private profile.'
