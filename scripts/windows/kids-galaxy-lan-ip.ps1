# Print the Windows address tablets should use.
# Safe to run again. It does not need an admin window.
#Requires -Version 5.1

function Get-KidsGalaxyLanIp {
    $items = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.InterfaceAlias -notmatch 'WSL|vEthernet|Hyper-V|Loopback|Default Switch|Bluetooth'
        })
    $house = $items | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1
    if ($house) {
        return $house.IPAddress
    }
    $ten = $items | Where-Object { $_.IPAddress -like '10.*' } | Select-Object -First 1
    if ($ten) {
        return $ten.IPAddress
    }
    $first = $items | Select-Object -First 1
    if ($first) {
        return $first.IPAddress
    }
    return $null
}

if ($MyInvocation.InvocationName -ne '.') {
    $lanIp = Get-KidsGalaxyLanIp
    if (-not $lanIp) {
        [Console]::Error.WriteLine('No Windows LAN address was found.')
        exit 1
    }
    Write-Output $lanIp
}
