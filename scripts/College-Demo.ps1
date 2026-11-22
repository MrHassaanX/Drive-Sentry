param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8091,
    [string]$Avd = 'Medium_Phone_API_37.0',
    [switch]$NoEditor,
    [switch]$Standalone,
    [switch]$PhysicalDevice,
    [switch]$UseWindowsLocation,
    [string]$PhoneSerial,
    [ValidateRange(-90, 90)]
    [double]$EmulatorGpsLatitude,
    [ValidateRange(-180, 180)]
    [double]$EmulatorGpsLongitude
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$setGps = $PSBoundParameters.ContainsKey('EmulatorGpsLatitude')
if ($setGps -ne $PSBoundParameters.ContainsKey('EmulatorGpsLongitude')) {
    throw 'Supply both EmulatorGpsLatitude and EmulatorGpsLongitude to set a simulated fix.'
}
if (($setGps -or $UseWindowsLocation) -and $PhysicalDevice) { throw 'Simulated GPS is available only on an emulator.' }
if ($setGps -and $UseWindowsLocation) { throw 'Choose Windows location or explicit simulator coordinates.' }
if ($Standalone -and $PhysicalDevice) { throw 'Use the Expo Go physical-device workflow for USB GPS verification.' }
if ($PhoneSerial -and !$PhysicalDevice) { throw 'PhoneSerial requires PhysicalDevice.' }
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

if ($PhysicalDevice) {
    $phones = @(foreach ($line in (& $adb devices -l)) {
        if ($line -match '^((?!emulator-)\S+)\s+device\s+.*\busb:\S+') { $Matches[1] }
    })
    if (!$phones.Count) {
        # Some Windows platform-tools builds omit the USB field from devices -l.
        $usb = & $adb -d get-serialno 2>$null | Select-Object -First 1
        if ($LASTEXITCODE -eq 0 -and $usb -match '^(?!emulator-|unknown$)\S+$') { $phones = @($usb) }
    }
    if ($PhoneSerial) { $phones = @($phones | Where-Object { $_ -ceq $PhoneSerial }) }
    if ($phones.Count -ne 1) { throw 'Connect one authorized USB Android phone or select it with PhoneSerial.' }
    $device = $phones[0]
    if ((& $adb -s $device shell getprop ro.kernel.qemu) -match '^1\s*$' -or
        (& $adb -s $device shell getprop ro.boot.qemu) -match '^1\s*$') {
        throw 'The selected Android target reports that it is an emulator.'
    }
} else {
    $device = Find-DemoDevice
}
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
if (!$Standalone -and !((& $adb -s $device shell pm path host.exp.exponent) -match '^package:')) {
    throw 'Install a compatible Expo Go build on the selected Android device.'
}
if ($UseWindowsLocation) {
    $hostFix = & powershell.exe -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'Get-WindowsDemoLocation.ps1')
    if ($LASTEXITCODE -ne 0 -or !$hostFix) { throw 'Windows location could not be synced. The emulator location was left unchanged.' }
    $hostFix = $hostFix | ConvertFrom-Json
    $EmulatorGpsLatitude = [double]$hostFix.latitude
    $EmulatorGpsLongitude = [double]$hostFix.longitude
}
if ($setGps -or $UseWindowsLocation) {
    $format = [Globalization.CultureInfo]::InvariantCulture
    $receipt = & $adb -s $device emu geo fix $EmulatorGpsLongitude.ToString($format) $EmulatorGpsLatitude.ToString($format)
    if ($LASTEXITCODE -ne 0 -or $receipt -notmatch '^OK\s*$') { throw "Could not set simulated GPS on '$Avd'." }
    Start-Sleep -Milliseconds 1200
    if ($UseWindowsLocation) {
        Write-Host "Synced the Windows location estimate to $Avd as a simulated fix (Windows accuracy ±$([Math]::Round($hostFix.accuracy)) m)."
    } else { Write-Host "Set an explicit simulated GPS fix on $Avd." }
}

$code = Get-Command code.cmd -ErrorAction SilentlyContinue
if (!$NoEditor -and !$PhysicalDevice -and $code) {
    & $code.Source $project (Join-Path $project 'src/features/stations/StationFinder.tsx')
}
if ($Standalone) {
    $package = 'com.drivesentry.testing'
    $info = & $adb -s $device shell dumpsys package $package
    if (!($info -match '\bversionName=3\.0\.0\b')) {
        throw 'Install the signed DriveSentry V3 academic APK before launching standalone mode.'
    }
    $launch = & $adb -s $device shell am start -W -n "$package/.MainActivity"
    if ($LASTEXITCODE -ne 0 -or !($launch -match '^Status: ok\s*$')) { throw 'Could not open the V3 APK.' }
    Write-Host "Opened the DriveSentry V3 standalone APK on $Avd."
} else {
$env:DRIVESENTRY_BUILD_PROFILE = 'academic-testing'
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

& $adb -s $device reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) { throw 'Could not connect the Android device to Metro.' }
$route = if ($PhysicalDevice) { 'fuel/nearby?gpsTest=1' } elseif ($UseWindowsLocation) { 'fuel/nearby' } else { 'fuel' }
$launch = & $adb -s $device shell am start -W -a android.intent.action.VIEW `
    -d "exp://127.0.0.1:$Port/--/$route" -p host.exp.exponent
if ($LASTEXITCODE -ne 0 -or !($launch -match '^Status: ok\s*$')) {
    throw 'Could not launch Expo Go.'
}
if ($PhysicalDevice) {
    Write-Host 'Opened Fuel Map on the USB Android phone. Allow precise foreground location on the phone if prompted.'
    $deadline = [datetime]::UtcNow.AddSeconds(90)
    do {
        $tree = (& $adb -s $device exec-out uiautomator dump /dev/tty) -join ''
        $position = [regex]::Match($tree, 'Search origin: (-?\d+\.\d+), (-?\d+\.\d+)')
        $center = [regex]::Match($tree, 'Map center: (-?\d+\.\d+), (-?\d+\.\d+)')
        $accuracy = [regex]::Match($tree, 'Accuracy: (\d+) m · OS mock flag: false')
        $result = [regex]::Match($tree, '(\d+) stations? within (\d+) km')
        if ($tree -match 'text="Device location"' -and $position.Success -and $center.Success -and $accuracy.Success -and $result.Success) {
            $permissions = & $adb -s $device shell dumpsys package host.exp.exponent
            if (!($permissions -match 'android.permission.ACCESS_FINE_LOCATION: granted=true')) {
                throw 'The phone has not granted precise foreground location to Expo Go.'
            }
            $format = [Globalization.CultureInfo]::InvariantCulture
            for ($axis = 1; $axis -le 2; $axis++) {
                if ([Math]::Abs([double]::Parse($position.Groups[$axis].Value, $format) -
                    [double]::Parse($center.Groups[$axis].Value, $format)) -gt 0.001) {
                    throw 'The map did not center on the phone fix.'
                }
            }
            Write-Host "Physical GPS passed. Precise permission, $($accuracy.Groups[1].Value) m reported accuracy, centered map and $($result.Groups[1].Value) stations within $($result.Groups[2].Value) km."
            return
        }
        Start-Sleep -Milliseconds 750
    } while ([datetime]::UtcNow -lt $deadline)
    throw 'Could not verify a physical GPS fix, map center and nearby results. Check the phone location permission and the app status.'
}
if ($UseWindowsLocation) { Write-Host "Opened DriveSentry's Fuel Map on $Avd." }
else { Write-Host "Opened DriveSentry's Fuel tab on $Avd." }
}

try {
    $layout = & (Join-Path $PSScriptRoot 'Fix-Emulator-Window.ps1') -Avd $Avd -WaitSeconds 12 -SideBySide:(!$NoEditor)
    Write-Host "Emulator window: $($layout.After), $($layout.Monitor) work area $($layout.WorkArea), $($layout.Scale) scaling."
} catch {
    Write-Warning "DriveSentry is running. Window positioning could not be verified. $($_.Exception.Message)"
}
