[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BuildRoot,
    [string]$TestingKeystorePath
)

$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$BuildRoot = [IO.Path]::GetFullPath($BuildRoot)
if ((Test-Path -LiteralPath $BuildRoot) -and (Get-ChildItem -LiteralPath $BuildRoot -Force | Select-Object -First 1)) {
    throw 'Use an empty, short build directory. Existing source and native build directories are preserved.'
}
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android/Sdk')) |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools/adb.exe')) } | Select-Object -First 1
$java = @($env:JAVA_HOME, (Join-Path $env:ProgramFiles 'Android/Android Studio/jbr')) |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin/java.exe')) } | Select-Object -First 1
if (!$sdk -or !$java) { throw 'A local Android SDK and JDK are required.' }
$revision = (& git -C $project rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Could not identify the source commit.' }
if ($TestingKeystorePath -and !(Test-Path -LiteralPath $TestingKeystorePath -PathType Leaf)) {
    throw 'The existing testing signing key was not found.'
}

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:JAVA_HOME = $java
$env:DRIVESENTRY_BUILD_PROFILE = 'academic-testing'
$env:DRIVESENTRY_BUILD_REVISION = $revision
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_PUBLIC_GEOAPIFY_API_KEY = $null
$env:EXPO_PUBLIC_ENABLE_OVERPASS_FALLBACK = $null
$env:EXPO_PUBLIC_ACADEMIC_GEOCODER_URL = $null
$archive = Join-Path $env:TEMP ('drivesentry-' + [guid]::NewGuid().ToString('N') + '.tar')
New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
try {
    & git -C $project archive --format=tar --output=$archive $revision
    if ($LASTEXITCODE) { throw 'Could not archive the committed source.' }
    & tar.exe -xf $archive -C $BuildRoot
    if ($LASTEXITCODE) { throw 'Could not unpack the committed source.' }
} finally {
    if (Test-Path -LiteralPath $archive -PathType Leaf) { Remove-Item -LiteralPath $archive }
}

Push-Location $BuildRoot
try {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE) { throw 'Frozen dependency installation failed.' }
    & pnpm exec expo prebuild --platform android --no-install
    if ($LASTEXITCODE) { throw 'Expo Android prebuild failed.' }
    if ($TestingKeystorePath) {
        Copy-Item -LiteralPath $TestingKeystorePath -Destination (Join-Path $BuildRoot 'android/app/debug.keystore') -Force
    }
    Push-Location (Join-Path $BuildRoot 'android')
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64'
        if ($LASTEXITCODE) { throw 'Android Gradle assembly failed.' }
    } finally { Pop-Location }
} finally { Pop-Location }

$apk = Join-Path $BuildRoot 'android/app/build/outputs/apk/release/app-release.apk'
if (!(Test-Path -LiteralPath $apk -PathType Leaf)) { throw 'Gradle did not create the signed testing APK.' }
$output = Join-Path $project '.expo/college-demo'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$destination = Join-Path $output 'DriveSentry-College-Demo-v3.apk'
Copy-Item -LiteralPath $apk -Destination $destination -Force
Write-Host "APK for $revision saved to $destination"
