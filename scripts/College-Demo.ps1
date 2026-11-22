param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8091,
    [string]$Avd = 'Medium_Phone_API_37.0',
    [switch]$NoEditor
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$project = Split-Path $PSScriptRoot -Parent
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android/Sdk')) |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools/adb.exe')) } |
    Select-Object -First 1
if (!$sdk) { throw 'Android SDK platform-tools are required.' }
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

function Find-DemoDevice {
    foreach ($line in (& $adb devices)) {
        if ($line -match '^(emulator-\d+)\s+device\s*$') {
            $serial = $Matches[1]
            $runningAvd = (& $adb -s $serial emu avd name 2>$null | Select-Object -First 1)
            if ($runningAvd -and $runningAvd.Trim() -eq $Avd) { return $serial }
        }
    }
}

$device = Find-DemoDevice
if (!$device) {
    $emulator = Join-Path $sdk 'emulator/emulator.exe'
    if (!(Test-Path $emulator) -or $Avd -notin (& $emulator -list-avds)) {
        throw "Android virtual device '$Avd' is required."
    }
    Start-Process -FilePath $emulator -ArgumentList '-avd', $Avd -WindowStyle Normal
    $deadline = [datetime]::UtcNow.AddMinutes(3)
    do {
        Start-Sleep -Seconds 2
        $device = Find-DemoDevice
        if ($device -and (& $adb -s $device shell getprop sys.boot_completed).Trim() -eq '1') { break }
    } while ([datetime]::UtcNow -lt $deadline)
    if (!$device -or (& $adb -s $device shell getprop sys.boot_completed).Trim() -ne '1') {
        throw "Android virtual device '$Avd' did not finish booting."
    }
}
if ((& $adb -s $device shell pm path host.exp.exponent) -notmatch '^package:') {
    throw "Expo Go must be installed on '$Avd'."
}

$statusUrl = "http://127.0.0.1:$Port/status"
function Get-MetroStatus {
    try { Invoke-WebRequest -UseBasicParsing -Uri $statusUrl -TimeoutSec 2 } catch { $null }
}

$metro = Get-MetroStatus
if (!$metro) {
    $pnpm = (Get-Command pnpm.cmd).Source
    if (!(Test-Path (Join-Path $project 'node_modules/expo'))) {
        throw 'Run the frozen pnpm install before launching the demo.'
    }
    $logs = Join-Path $project '.expo/college-demo'
    New-Item -Path $logs -ItemType Directory -Force | Out-Null
    $env:EXPO_NO_TELEMETRY = '1'
    Start-Process -FilePath $pnpm -ArgumentList 'exec','expo','start','--localhost','--go','--port',"$Port" `
        -WorkingDirectory $project -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'metro.out.log') -RedirectStandardError (Join-Path $logs 'metro.err.log')
    $deadline = [datetime]::UtcNow.AddSeconds(55)
    do {
        Start-Sleep -Seconds 2
        $metro = Get-MetroStatus
    } until ($metro -or [datetime]::UtcNow -ge $deadline)
}
$statusBody = if ($metro.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($metro.Content) } else { $metro.Content }
if (!$metro -or $statusBody -ne 'packager-status:running') {
    throw "Metro did not become ready on port $Port."
}
$metroRoot = [uri]::UnescapeDataString([string]$metro.Headers['X-React-Native-Project-Root'])
if (!$metroRoot -or [IO.Path]::GetFullPath($metroRoot).TrimEnd('\') -ne $project.TrimEnd('\')) {
    throw "Port $Port does not identify this DriveSentry project. Choose another demo port."
}

if (!$NoEditor) {
    $code = Get-Command code.cmd -ErrorAction SilentlyContinue
    if ($code) {
        & $code.Source $project (Join-Path $project 'src/features/stations/StationFinder.tsx')
    }
}

& $adb -s $device reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) { throw 'Could not connect the emulator to Metro.' }
$launch = & $adb -s $device shell am start -W -a android.intent.action.VIEW `
    -d "exp://127.0.0.1:$Port/--/fuel" -p host.exp.exponent
if ($LASTEXITCODE -ne 0 -or !($launch -match '^Status: ok\s*$')) {
    throw 'Could not launch Expo Go.'
}
Write-Host "Opened DriveSentry's Fuel tab on $Avd."

try {
    $layout = & (Join-Path $PSScriptRoot 'Fix-Emulator-Window.ps1') -Avd $Avd -WaitSeconds 12 -SideBySide:(!$NoEditor)
    Write-Host "Emulator window: $($layout.After), $($layout.Monitor) work area $($layout.WorkArea), $($layout.Scale) scaling."
} catch {
    Write-Warning "DriveSentry is running. Window positioning could not be verified. $($_.Exception.Message)"
}
