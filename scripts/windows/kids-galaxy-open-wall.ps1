# Open the wall page in Chrome on Windows.
# Safe to run again. It also leaves a kiosk shortcut on the desktop.
#Requires -Version 5.1

$ErrorActionPreference = 'Stop'
$Url = 'http://127.0.0.1:8000/'

function Get-KidsGalaxyChrome {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    return $null
}

$chrome = Get-KidsGalaxyChrome
if (-not $chrome) {
    Write-Output 'Chrome is not installed on Windows.'
    Write-Output "Open a browser and go to $Url"
    exit 1
}

$profile = Join-Path $env:LOCALAPPDATA 'KidsGalaxyWall'
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Kids Galaxy wall.lnk'
$arguments = "--kiosk --autoplay-policy=no-user-gesture-required --user-data-dir=`"$profile`" $Url"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $chrome
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $env:USERPROFILE
$shortcut.Description = 'Kids Galaxy wall'
$shortcut.Save()

Start-Process -FilePath $chrome -ArgumentList @(
    '--new-window',
    '--start-fullscreen',
    '--autoplay-policy=no-user-gesture-required',
    "--user-data-dir=$profile",
    $Url
)
Write-Output 'Chrome is opening the wall page.'
Write-Output 'A kiosk shortcut named Kids Galaxy wall is on the desktop.'
