# Shared helpers for the Kids Galaxy Windows scripts.
# Dot-source this file. Do not run it on its own.

function Get-KidsGalaxyDefaultDistro {
    param([string]$Requested)

    if ($Requested) {
        return $Requested
    }

    $base = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
    $defaultId = (Get-ItemProperty -Path $base -ErrorAction SilentlyContinue).DefaultDistribution
    if ($defaultId) {
        $key = Join-Path $base $defaultId
        $name = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).DistributionName
        if ($name) {
            return [string]$name
        }
    }

    $raw = & wsl.exe -l -q 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        throw 'No Linux distro was found. In PowerShell run: wsl -l -q'
    }
    $text = (($raw | Out-String) -replace "`0", '')
    foreach ($line in ($text -split "`r?`n")) {
        $clean = $line.Trim()
        $clean = $clean -replace '^\xEF\xBB\xBF', ''
        $clean = $clean -replace '\s*\(Default\)\s*$', ''
        if (-not $clean) {
            continue
        }
        if ($clean -match '^(docker-desktop|docker-desktop-data)$') {
            continue
        }
        return $clean
    }
    throw 'No Linux distro was found. In PowerShell run: wsl -l -q'
}

function Get-KidsGalaxyDefaultUser {
    param(
        [string]$Requested,
        [string]$DistroName
    )

    if ($Requested) {
        return $Requested
    }
    $raw = & wsl.exe -d $DistroName -- whoami
    if ($LASTEXITCODE -ne 0) {
        throw "Could not ask $DistroName for its Linux user."
    }
    $name = ((($raw | Out-String) -replace "`0", '').Trim() -split '\s+')[0]
    if (-not $name) {
        throw "Could not ask $DistroName for its Linux user."
    }
    return $name
}
