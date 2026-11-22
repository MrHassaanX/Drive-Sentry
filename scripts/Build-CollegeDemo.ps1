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
if (!(Test-Path -LiteralPath (Join-Path $sdk 'cmake/3.30.5/bin/ninja.exe') -PathType Leaf)) {
    throw 'Android SDK CMake 3.30.5 is required for the Windows native build.'
}
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
    # Native CMake outputs exceed Windows path limits under pnpm's nested
    # virtual store. Keep this setting inside the isolated build tree.
    Add-Content -LiteralPath (Join-Path $BuildRoot 'pnpm-workspace.yaml') -Value "`nnodeLinker: hoisted"
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE) { throw 'Frozen dependency installation failed.' }
    # App codegen embeds absolute native package paths under CMake output paths.
    # Keep only the three longest packages at short paths on the same drive.
    $drive = [IO.Path]::GetPathRoot($BuildRoot)
    $dependencies = 0..9 | ForEach-Object { Join-Path $drive "d$_" } |
        Where-Object { !(Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (!$dependencies) { throw 'No free short dependency directory on the build drive.' }
    New-Item -ItemType Directory -Path $dependencies | Out-Null
    $sourceRoot = [IO.Path]::GetFullPath((Join-Path $BuildRoot 'node_modules')).TrimEnd('\') + '\'
    $targetRoot = [IO.Path]::GetFullPath($dependencies).TrimEnd('\') + '\'
    foreach ($name in @('react-native-gesture-handler', 'react-native-safe-area-context', 'react-native-reanimated')) {
        $source = [IO.Path]::GetFullPath((Join-Path $sourceRoot $name))
        $target = [IO.Path]::GetFullPath((Join-Path $targetRoot $name))
        if (!$source.StartsWith($sourceRoot, [StringComparison]::OrdinalIgnoreCase) -or
            !$target.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase) -or
            !(Test-Path -LiteralPath $source -PathType Container) -or
            (Get-Item -LiteralPath $source).LinkType -or (Test-Path -LiteralPath $target)) {
            throw "Cannot safely relocate the build-only $name package."
        }
        Move-Item -LiteralPath $source -Destination $target
        New-Item -ItemType Junction -Path $source -Target $target | Out-Null
    }
    New-Item -ItemType Junction -Path (Join-Path $dependencies 'node_modules') `
        -Target (Join-Path $BuildRoot 'node_modules') | Out-Null
    & pnpm exec expo prebuild --platform android --no-install
    if ($LASTEXITCODE) { throw 'Expo Android prebuild failed.' }
    if ($TestingKeystorePath) {
        Copy-Item -LiteralPath $TestingKeystorePath -Destination (Join-Path $BuildRoot 'android/app/debug.keystore') -Force
    }
    Push-Location (Join-Path $BuildRoot 'android')
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' `
            '-Pandroid.cmakeVersion=3.30.5' '-Pexpo.android.cmakeObjectPathMax=2048' --max-workers=2
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
