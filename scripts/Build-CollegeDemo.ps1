[CmdletBinding()]
param(
    [string]$BuildRoot,
    [string]$TestingKeystorePath,
    [switch]$OcrDevelopment,
    [string]$AndroidSdkPath
)

$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$controlledRoot = [IO.Path]::GetFullPath((Join-Path $project '.local/build'))
if (!$BuildRoot) {
    $BuildRoot = Join-Path $controlledRoot ([guid]::NewGuid().ToString('N').Substring(0, 12))
}
$BuildRoot = [IO.Path]::GetFullPath($BuildRoot)
$prefix = $controlledRoot.TrimEnd('\') + '\'
if (!$BuildRoot.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Use a build directory inside $controlledRoot."
}
for ($parent = [IO.DirectoryInfo]::new($BuildRoot); $parent; $parent = $parent.Parent) {
    if ($parent.Exists -and ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The build directory and its parents must not be junctions or symbolic links.'
    }
}
if ((Test-Path -LiteralPath $BuildRoot) -and (Get-ChildItem -LiteralPath $BuildRoot -Force | Select-Object -First 1)) {
    throw 'Use an empty, short build directory. Existing source and native build directories are preserved.'
}
$sdk = @($AndroidSdkPath, $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android/Sdk')) |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools/adb.exe')) } | Select-Object -First 1
$java = @($env:JAVA_HOME, (Join-Path $env:ProgramFiles 'Android/Android Studio/jbr')) |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin/java.exe')) } | Select-Object -First 1
if (!$sdk -or !$java) { throw 'A local Android SDK and JDK are required.' }
if (!(Test-Path -LiteralPath (Join-Path $sdk 'cmake/3.30.5/bin/ninja.exe') -PathType Leaf)) {
    throw 'Android SDK CMake 3.30.5 is required for the Windows native build.'
}
$revision = (& git -C $project rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Could not identify the source commit.' }
if ($OcrDevelopment -and $TestingKeystorePath) { throw 'OCR development uses a separate package and default debug signing.' }
if ($TestingKeystorePath -and !(Test-Path -LiteralPath $TestingKeystorePath -PathType Leaf)) {
    throw 'The existing testing signing key was not found.'
}

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:JAVA_HOME = $java
$env:DRIVESENTRY_BUILD_PROFILE = 'academic-testing'
$env:DRIVESENTRY_BUILD_REVISION = $revision
$env:DRIVESENTRY_OCR_DEV = if ($OcrDevelopment) { '1' } else { $null }
if ($OcrDevelopment) {
    $env:TEMP = Join-Path $project '.local/tmp'
    $env:TMP = $env:TEMP
    $env:EXPO_HOME = Join-Path $project '.local/expo'
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
}
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_PUBLIC_GEOAPIFY_API_KEY = $null
$env:EXPO_PUBLIC_ENABLE_OVERPASS_FALLBACK = $null
$env:EXPO_PUBLIC_ACADEMIC_GEOCODER_URL = $null
New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
$scratch = $BuildRoot
$mappedDrive = 90..82 | ForEach-Object { ([char]$_).ToString() + ':' } |
    Where-Object { !(Test-Path ($_ + '\')) -and $_ -notin (Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Name + ':' }) } |
    Select-Object -First 1
if (!$mappedDrive) { throw 'A free temporary drive letter between R: and Z: is required.' }
& subst.exe $mappedDrive $scratch
if ($LASTEXITCODE) { throw 'Could not map the temporary build drive.' }
$BuildRoot = $mappedDrive + '\b'
$gradleCacheDrive = $null
try {
$expectedMapping = "$mappedDrive\: => $scratch"
if ($expectedMapping -notin (& subst.exe) -or !(Test-Path -LiteralPath ($mappedDrive + '\'))) {
    throw 'The temporary build drive did not resolve to the project scratch directory.'
}
if ($OcrDevelopment) {
    $gradleCacheRoot = Join-Path $project '.local/phase6-gradle'
    New-Item -ItemType Directory -Path $gradleCacheRoot -Force | Out-Null
    if ((Get-Item -LiteralPath $gradleCacheRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Use a regular workspace directory for the OCR Gradle cache.'
    }
    $cacheLetter = 90..82 | ForEach-Object { ([char]$_).ToString() + ':' } |
        Where-Object { $_ -ne $mappedDrive -and !(Test-Path ($_ + '\')) -and $_ -notin (Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Name + ':' }) } |
        Select-Object -First 1
    if (!$cacheLetter) { throw 'A second temporary drive letter is required for the OCR Gradle cache.' }
    & subst.exe $cacheLetter $gradleCacheRoot
    if ($LASTEXITCODE) { throw 'Could not map the OCR Gradle cache.' }
    $gradleCacheDrive = $cacheLetter
    if ("$gradleCacheDrive\: => $gradleCacheRoot" -notin (& subst.exe)) { throw 'Could not verify the OCR Gradle cache mapping.' }
    $env:GRADLE_USER_HOME = $gradleCacheDrive + '\'
}
$archive = $mappedDrive + '\source.tar'
New-Item -ItemType Directory -Path $BuildRoot | Out-Null
Write-Host "Build scratch: $scratch (temporarily mapped as $mappedDrive)"
if ($OcrDevelopment) {
    $exportPrefix = $BuildRoot.Replace('\', '/') + '/'
    & git -C $project checkout-index --all "--prefix=$exportPrefix"
    if ($LASTEXITCODE) { throw 'Could not export the staged source.' }
} else {
    try {
        & git -C $project archive --format=tar --output=$archive $revision
        if ($LASTEXITCODE) { throw 'Could not archive the committed source.' }
        & tar.exe -xf $archive -C $BuildRoot
        if ($LASTEXITCODE) { throw 'Could not unpack the committed source.' }
    } finally {
        if (Test-Path -LiteralPath $archive -PathType Leaf) { Remove-Item -LiteralPath $archive }
    }
}

Push-Location $BuildRoot
try {
    # Native CMake outputs exceed Windows path limits under pnpm's nested
    # virtual store. Keep this setting inside the isolated build tree.
    Add-Content -LiteralPath (Join-Path $BuildRoot 'pnpm-workspace.yaml') -Value "`nnodeLinker: hoisted"
    & pnpm install --frozen-lockfile --store-dir ($mappedDrive + '\store')
    if ($LASTEXITCODE) { throw 'Frozen dependency installation failed.' }
    # SDK 58 codegen resolves junction targets to their physical drive.
    # Keep the OCR debug dependency tree on the mapped drive for relative paths.
    if (!$OcrDevelopment) {
        # Keep native dependency paths short for the existing release build.
        $dependencies = $mappedDrive + '\p'
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
    }
    & pnpm exec expo prebuild --platform android --no-install
    if ($LASTEXITCODE) { throw 'Expo Android prebuild failed.' }
    if ($OcrDevelopment) {
        # Node resolves local packages to their physical paths. React Native codegen
        # requires all generated inputs and source folders to use the same drive.
        $configJson = (& pnpm exec expo-modules-autolinking react-native-config --platform android --json) -join "`n"
        if ($LASTEXITCODE) { throw 'Could not generate the Android autolinking configuration.' }
        $physicalRoot = Join-Path $scratch 'b'
        $configJson = $configJson.Replace($physicalRoot.Replace('\', '\\'), $BuildRoot.Replace('\', '\\')).
            Replace($physicalRoot.Replace('\', '/'), $BuildRoot.Replace('\', '/'))
        $configJson | ConvertFrom-Json | Out-Null
        Set-Content -LiteralPath 'android/drivesentry-rn-autolinking.json' -Value $configJson -Encoding utf8NoBOM
        $settingsPath = 'android/settings.gradle'
        $settings = Get-Content -LiteralPath $settingsPath -Raw
        $autolinkCommand = 'ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)'
        if (!$settings.Contains($autolinkCommand)) { throw 'Check the Android autolinking template for this Expo SDK.' }
        $settings = $settings.Replace($autolinkCommand, "ex.autolinkLibrariesFromConfigFile(new File(rootDir, 'drivesentry-rn-autolinking.json'))")
        Set-Content -LiteralPath $settingsPath -Value $settings -Encoding utf8NoBOM
        # AGP resolves Expo Modules Core's Prefab paths to their physical directory.
        # Keep its Ninja staging directory short even after this resolution.
        $coreGradle = 'node_modules/expo-modules-core/android/build.gradle'
        $coreConfig = Get-Content -LiteralPath $coreGradle -Raw
        $cmakeEntry = '  externalNativeBuild {' + "`n" + '    cmake {' + "`n"
        $coreConfig = $coreConfig.Replace("`r`n", "`n")
        if (!$coreConfig.Contains($cmakeEntry)) { throw 'Check the Expo Modules Core CMake template for this SDK.' }
        $stage = $mappedDrive + '/c'
        $coreConfig = $coreConfig.Replace($cmakeEntry, $cmakeEntry + "      buildStagingDirectory file('$stage')" + "`n")
        Set-Content -LiteralPath $coreGradle -Value $coreConfig -Encoding utf8NoBOM
    }
    if ($TestingKeystorePath) {
        Copy-Item -LiteralPath $TestingKeystorePath -Destination (Join-Path $BuildRoot 'android/app/debug.keystore') -Force
    }
    Push-Location (Join-Path $BuildRoot 'android')
    try {
        $assembly = if ($OcrDevelopment) { ':app:assembleDebug' } else { ':app:assembleRelease' }
        $architectures = if ($OcrDevelopment) { 'x86_64' } else { 'arm64-v8a,x86_64' }
        & ./gradlew.bat $assembly "-PreactNativeArchitectures=$architectures" `
            '-Pandroid.cmakeVersion=3.30.5' '-Pexpo.android.cmakeObjectPathMax=2048' --max-workers=2
        if ($LASTEXITCODE) { throw 'Android Gradle assembly failed.' }
    } finally { Pop-Location }
} finally { Pop-Location }

$apk = Join-Path $BuildRoot $(if ($OcrDevelopment) { 'android/app/build/outputs/apk/debug/app-debug.apk' } else { 'android/app/build/outputs/apk/release/app-release.apk' })
if (!(Test-Path -LiteralPath $apk -PathType Leaf)) { throw 'Gradle did not create the expected APK.' }
$output = Join-Path $project $(if ($OcrDevelopment) { '.expo/phase6' } else { '.expo/college-demo' })
New-Item -ItemType Directory -Path $output -Force | Out-Null
$destination = Join-Path $output $(if ($OcrDevelopment) { 'DriveSentry-OCR-debug.apk' } else { 'DriveSentry-College-Demo-v3.apk' })
Copy-Item -LiteralPath $apk -Destination $destination -Force
Write-Host "APK for $revision saved to $destination"
} finally {
    if ($gradleCacheDrive) {
        & subst.exe $gradleCacheDrive /d
        if ($LASTEXITCODE) { Write-Warning "Could not release the Gradle cache mapping $gradleCacheDrive." }
    }
    & subst.exe $mappedDrive /d
    if ($LASTEXITCODE) { Write-Warning "Could not release the temporary drive mapping $mappedDrive." }
    Write-Host "Build files and diagnostics retained at $scratch"
}
