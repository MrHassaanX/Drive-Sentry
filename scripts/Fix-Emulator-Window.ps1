[CmdletBinding()]
param(
    [string]$Avd = 'Medium_Phone_API_37.0',
    [ValidateRange(0, 120)]
    [int]$WaitSeconds = 10,
    [switch]$SideBySide,
    [switch]$InspectOnly,
    [switch]$PrepareStartup
)

$ErrorActionPreference = 'Stop'
if (!$IsWindows -and $PSVersionTable.PSEdition -ne 'Desktop') { throw 'This command requires Windows.' }

if (!('DriveSentry.WindowLayout' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace DriveSentry {
    public static class WindowLayout {
        [StructLayout(LayoutKind.Sequential)]
        public struct Rect {
            public int Left, Top, Right, Bottom;
            public int Width { get { return Right - Left; } }
            public int Height { get { return Bottom - Top; } }
            public override string ToString() { return String.Format("{0}x{1} at ({2},{3})", Width, Height, Left, Top); }
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct MonitorInfo {
            public int Size;
            public Rect Bounds, Work;
            public uint Flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Name;
        }
        private delegate bool WindowCallback(IntPtr hwnd, IntPtr data);
        [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr data);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr hwnd, int command);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int processId);
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
        [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out Rect rect, int size);
        [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr hwnd, int flags);
        [DllImport("shcore.dll")] private static extern int GetScaleFactorForMonitor(IntPtr monitor, out int scale);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, int flags);

        public static IntPtr UsePhysicalPixels() { return SetThreadDpiAwarenessContext(new IntPtr(-4)); }
        public static void RestoreDpi(IntPtr previous) { SetThreadDpiAwarenessContext(previous); }
        public static IntPtr[] Windows() {
            var handles = new List<IntPtr>();
            EnumWindows((hwnd, data) => { if (IsWindowVisible(hwnd)) handles.Add(hwnd); return true; }, IntPtr.Zero);
            return handles.ToArray();
        }
        public static string Title(IntPtr hwnd) {
            var title = new StringBuilder(512);
            GetWindowText(hwnd, title, title.Capacity);
            return title.ToString();
        }
        public static int ProcessId(IntPtr hwnd) {
            int id;
            GetWindowThreadProcessId(hwnd, out id);
            return id;
        }
        public static Rect Frame(IntPtr hwnd) {
            Rect rect;
            if (!IsIconic(hwnd) && DwmGetWindowAttribute(hwnd, 9, out rect, Marshal.SizeOf(typeof(Rect))) == 0
                && rect.Width > 0 && rect.Height > 0) return rect;
            return WindowRect(hwnd);
        }
        public static Rect Envelope(IntPtr hwnd, bool includeToolbar) {
            var main = Frame(hwnd);
            if (!includeToolbar || IsIconic(hwnd)) return main;
            foreach (var candidate in Windows()) {
                if (ProcessId(candidate) != ProcessId(hwnd) || Title(candidate) != "Emulator") continue;
                var toolbar = Frame(candidate);
                main.Left = Math.Min(main.Left, toolbar.Left);
                main.Top = Math.Min(main.Top, toolbar.Top);
                main.Right = Math.Max(main.Right, toolbar.Right);
                main.Bottom = Math.Max(main.Bottom, toolbar.Bottom);
            }
            return main;
        }
        private static Rect WindowRect(IntPtr hwnd) {
            Rect rect;
            if (!GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("Window bounds unavailable.");
            return rect;
        }
        public static MonitorInfo Monitor(IntPtr hwnd) {
            var info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
            if (!GetMonitorInfo(MonitorFromWindow(hwnd, 2), ref info)) throw new InvalidOperationException("Monitor work area unavailable.");
            return info;
        }
        public static MonitorInfo PrimaryMonitor(out int scale) {
            var monitor = MonitorFromWindow(IntPtr.Zero, 1);
            var info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
            if (!GetMonitorInfo(monitor, ref info) || GetScaleFactorForMonitor(monitor, out scale) != 0 || scale <= 0)
                throw new InvalidOperationException("Primary monitor work area or scale unavailable.");
            return info;
        }
        public static void Restore(IntPtr hwnd) {
            if (!IsIconic(hwnd) && !IsZoomed(hwnd)) return;
            ShowWindowAsync(hwnd, 9);
            for (int i = 0; i < 20 && (IsIconic(hwnd) || IsZoomed(hwnd)); i++) Thread.Sleep(50);
            if (IsIconic(hwnd) || IsZoomed(hwnd)) throw new InvalidOperationException("Could not restore the normal window.");
        }
        public static void MoveFrame(IntPtr hwnd, int x, int y, int width, int height) {
            Rect outer = WindowRect(hwnd), frame = Frame(hwnd);
            if (!SetWindowPos(hwnd, IntPtr.Zero, x + outer.Left - frame.Left, y + outer.Top - frame.Top,
                width + outer.Width - frame.Width, height + outer.Height - frame.Height, 0x0014)) {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
        }
    }
}
'@
}

function Get-VisibleWindows {
    foreach ($handle in [DriveSentry.WindowLayout]::Windows()) {
        $title = [DriveSentry.WindowLayout]::Title($handle)
        if (!$title) { continue }
        $process = Get-Process -Id ([DriveSentry.WindowLayout]::ProcessId($handle)) -ErrorAction SilentlyContinue
        if (!$process) { continue }
        [pscustomobject]@{ Handle = $handle; Title = $title; Process = $process.ProcessName }
    }
}

function Test-SoleConnectedAvd {
    $sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android/Sdk')) |
        Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools/adb.exe')) } |
        Select-Object -First 1
    if (!$sdk) { return $false }
    $adb = Join-Path $sdk 'platform-tools/adb.exe'
    $connected = @(& $adb devices | Where-Object { $_ -match '^\S+\s+device\s*$' })
    if ($connected.Count -ne 1 -or $connected[0] -notmatch '^(emulator-\d+)\s+device\s*$') {
        return $false
    }
    $name = & $adb -s $Matches[1] emu avd name 2>$null | Select-Object -First 1
    return $LASTEXITCODE -eq 0 -and $name -and $name.Trim() -eq $Avd
}

$previousDpi = [DriveSentry.WindowLayout]::UsePhysicalPixels()
if ($previousDpi -eq [IntPtr]::Zero) { throw 'Could not enable DPI-aware window positioning.' }
try {
    $avdTitle = [regex]::Escape($Avd)
    if ($PrepareStartup) {
        if ($Avd -cne 'Medium_Phone_API_37.0') { throw 'Startup geometry is configured only for the demo phone.' }
        $avdRoot = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME }
            elseif ($env:ANDROID_USER_HOME) { Join-Path $env:ANDROID_USER_HOME 'avd' }
            else { Join-Path $env:USERPROFILE '.android/avd' }
        $descriptor = Join-Path $avdRoot "$Avd.ini"
        $entry = Select-String -LiteralPath $descriptor -Pattern '^path=(.+)$' | Select-Object -First 1
        if (!$entry) { throw "Could not resolve the directory for '$Avd'." }
        $directory = $entry.Matches[0].Groups[1].Value.Trim()
        $config = Join-Path $directory 'config.ini'
        $geometry = Join-Path $directory 'emulator-user.ini'
        if (!(Select-String -LiteralPath $config -Pattern "^AvdId=$avdTitle$" -Quiet) -or
            (Get-Item -LiteralPath $directory).LinkType -or (Get-Item -LiteralPath $geometry).LinkType) {
            throw "Could not verify the geometry file for '$Avd'."
        }

        $scalePercent = 0
        $primary = [DriveSentry.WindowLayout]::PrimaryMonitor([ref]$scalePercent)
        $ratio = $scalePercent / 100
        $logicalWidth = $primary.Work.Width / $ratio
        $logicalHeight = $primary.Work.Height / $ratio
        # This phone has a 1080 x 2400 skin. Reserve space for the title, toolbar and margins.
        $fit = [Math]::Floor(100 * [Math]::Min(0.40, [Math]::Min(
            ($logicalHeight - 92) / 2400, ($logicalWidth - 140) / 1080))) / 100
        if ($fit -le 0) { throw 'The primary monitor has insufficient space for the demo phone.' }
        $x = [int]($primary.Work.Left / $ratio + 24)
        $y = [int]($primary.Work.Top / $ratio + 22)
        $values = @{
            'window.x' = $x
            'window.y' = $y
            'window.scale' = $fit.ToString('F6', [Globalization.CultureInfo]::InvariantCulture)
        }
        $current = Get-Content -LiteralPath $geometry -Raw
        $updated = $current
        foreach ($key in $values.Keys) {
            $pattern = '(?m)^' + [regex]::Escape($key) + '[ \t]*=[^\r\n]*'
            if ($updated -notmatch $pattern) { throw "Expected '$key' in '$geometry'." }
            $updated = $updated -replace $pattern, "$key = $($values[$key])"
        }
        if ($updated -cne $current) { [IO.File]::WriteAllText($geometry, $updated) }
        Write-Host "Prepared startup geometry for $Avd at $scalePercent% Windows scaling."
        return
    }

    $deadline = [datetime]::UtcNow.AddSeconds($WaitSeconds)
    do {
        $windows = @(Get-VisibleWindows)
        $matchesAvd = @($windows | Where-Object {
            ($_.Process -match '^(emulator|qemu-system-.+)$' -and $_.Title -match "^Android Emulator - ${avdTitle}(?::\d+)?$") -or
            ($_.Process -eq 'studio64' -and $_.Title -match "\bRunning Devices\b.*(?:^|[^\w])${avdTitle}(?:[^\w]|$)")
        })
        if (!$matchesAvd) {
            $detached = @($windows | Where-Object { $_.Process -eq 'studio64' -and $_.Title -eq 'Running Devices' })
            if ($detached.Count -eq 1 -and (Test-SoleConnectedAvd)) { $matchesAvd = $detached }
        }
        if ($matchesAvd -or [datetime]::UtcNow -ge $deadline) { break }
        Start-Sleep -Milliseconds 500
    } while ($true)

    if ($matchesAvd.Count -ne 1) {
        throw "Expected one floating window for '$Avd', found $($matchesAvd.Count). If it is docked in Android Studio, use a detached Running Devices window or the standalone emulator."
    }
    $window = $matchesAvd[0]
    $hwnd = $window.Handle
    $standalone = $window.Process -ne 'studio64'
    $before = [DriveSentry.WindowLayout]::Envelope($hwnd, $standalone)
    $monitor = [DriveSentry.WindowLayout]::Monitor($hwnd)
    $dpi = [DriveSentry.WindowLayout]::GetDpiForWindow($hwnd)
    $work = $monitor.Work
    $after = $before
    $scale = [Math]::Round(100 * $dpi / 96)
    $editorPlaced = $false

    if (!$InspectOnly) {
        [DriveSentry.WindowLayout]::Restore($hwnd)
        $normal = [DriveSentry.WindowLayout]::Frame($hwnd)
        $margin = [int][Math]::Max(8, [Math]::Round($dpi / 8))
        $toolbarSpace = if ($standalone) { [int][Math]::Ceiling(72 * $dpi / 96) } else { 0 }
        $availableWidth = $work.Width - 2 * $margin - $toolbarSpace
        $height = $work.Height - 2 * $margin
        $minWidth = [int][Math]::Round(390 * $dpi / 96)
        # Allow enough space for a tall handset and its desktop controls.
        $width = [int][Math]::Min($availableWidth, [Math]::Max($minWidth, $height * 0.62))
        $right = $work.Right - $margin - $toolbarSpace
        $x = [int][Math]::Max($work.Left + $margin, [Math]::Min($normal.Left, $right - $width))
        $y = $work.Top + $margin

        $projectName = Split-Path (Split-Path $PSScriptRoot -Parent) -Leaf
        $editorWidth = $availableWidth - $width - $margin
        if ($SideBySide -and $editorWidth -ge (440 * $dpi / 96)) {
            $editorDeadline = [datetime]::UtcNow.AddSeconds(4)
            do {
                $editors = @(Get-VisibleWindows | Where-Object { $_.Process -eq 'Code' -and $_.Title -match [regex]::Escape($projectName) })
                if ($editors -or [datetime]::UtcNow -ge $editorDeadline) { break }
                Start-Sleep -Milliseconds 250
            } while ($true)
            if ($editors.Count -eq 1) {
                $editor = $editors[0].Handle
                # Leave an editor already located on a different monitor in place.
                if ([DriveSentry.WindowLayout]::Monitor($editor).Name -eq $monitor.Name) {
                    [DriveSentry.WindowLayout]::Restore($editor)
                    [DriveSentry.WindowLayout]::MoveFrame($editor, ($work.Left + $margin), $y, $editorWidth, $height)
                    $x = $right - $width
                    $editorPlaced = $true
                }
            }
        }

        [DriveSentry.WindowLayout]::MoveFrame($hwnd, $x, $y, $width, $height)
        Start-Sleep -Milliseconds 900
        $after = [DriveSentry.WindowLayout]::Envelope($hwnd, $standalone)
        if ($after.Left -lt $work.Left -or $after.Top -lt $work.Top -or
            $after.Right -gt $work.Right -or $after.Bottom -gt $work.Bottom) {
            throw "The emulator did not fit the work area after resizing. Window: $after. Work area: $work."
        }
    }

    [pscustomobject]@{
        Window = $window.Title; Process = $window.Process; Monitor = $monitor.Name
        Resolution = "$($monitor.Bounds.Width)x$($monitor.Bounds.Height)"; DPI = $dpi; Scale = "$scale%"
        WorkArea = $work.ToString(); Before = $before.ToString(); After = $after.ToString()
        WindowHandle = $hwnd.ToInt64(); EditorSideBySide = $editorPlaced
    }
} finally {
    [DriveSentry.WindowLayout]::RestoreDpi($previousDpi)
}
