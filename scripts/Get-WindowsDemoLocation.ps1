# Run under Windows PowerShell, where the WinRT task adapters are available.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$locatorType = [Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType=WindowsRuntime]
$positionType = [Windows.Devices.Geolocation.Geoposition, Windows.Devices.Geolocation, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

try {
    $locator = $locatorType::new()
    $locator.DesiredAccuracyInMeters = 100
    $convertOperation = $asTask.MakeGenericMethod($positionType)
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        $operation = $locator.GetGeopositionAsync([TimeSpan]::Zero, [TimeSpan]::FromSeconds(10))
        $task = $convertOperation.Invoke($null, @($operation))
        $coordinate = $task.GetAwaiter().GetResult().Coordinate
        $age = ([DateTimeOffset]::UtcNow - $coordinate.Timestamp).TotalSeconds
        $usable = $age -ge -5 -and $age -le 30 -and
            $coordinate.PositionSource -notin @('Default', 'IPAddress', 'Unknown') -and
            $coordinate.Accuracy -gt 0 -and $coordinate.Accuracy -le 500
        if ($usable) { break }
        if ($attempt -eq 0) { Start-Sleep -Seconds 2 }
    }
} catch {
    throw 'Windows could not provide a fresh location. Check Location services and Allow desktop apps to access your location.'
}
if (!$usable) {
    throw 'Windows reported a stale or coarse location. Use a GPS-capable phone or an explicit simulated demo location.'
}
$point = $coordinate.Point.Position
if ([double]::IsNaN($point.Latitude) -or [double]::IsNaN($point.Longitude) -or
    [Math]::Abs($point.Latitude) -gt 90 -or [Math]::Abs($point.Longitude) -gt 180) {
    throw 'Windows returned invalid coordinates.'
}
[pscustomobject]@{ latitude = $point.Latitude; longitude = $point.Longitude; accuracy = $coordinate.Accuracy } |
    ConvertTo-Json -Compress
