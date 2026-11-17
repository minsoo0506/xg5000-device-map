$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $installer) { throw 'Windows installer not found' }
$install = Start-Process -FilePath $installer.FullName -ArgumentList '/S' -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
$directory = Join-Path $env:LOCALAPPDATA 'XG5000 Device Map'
$executable = Get-ChildItem $directory -Filter 'xg5000-device-map.exe' -Recurse | Select-Object -First 1
if (-not $executable) { throw "Installed executable not found under $directory" }
$app = Start-Process -FilePath $executable.FullName -PassThru
try {
    $windowOpened = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        $app.Refresh()
        if ($app.HasExited) { throw "Application exited unexpectedly: $($app.ExitCode)" }
        if ($app.MainWindowHandle -ne 0) { $windowOpened = $true; break }
    }
    if (-not $windowOpened) { throw 'Application did not open a window within 10 seconds' }
    Write-Output "Installed app opened window: $($app.MainWindowTitle)"
} finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
}
