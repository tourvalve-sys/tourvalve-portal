param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipProxy
)

function Start-ServiceWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $escapedDirectory = $WorkingDirectory.Replace("'", "''")
    $escapedCommand = $Command.Replace("'", "''")

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$escapedDirectory'; `$host.UI.RawUI.WindowTitle = '$Title'; $escapedCommand"
    )
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $SkipBackend) {
    Start-ServiceWindow -Title "TourValve Backend" -WorkingDirectory (Join-Path $root "backend\TourValve.Api") -Command "dotnet run"
}

if (-not $SkipFrontend) {
    Start-ServiceWindow -Title "TourValve Frontend" -WorkingDirectory (Join-Path $root "frontend") -Command "npm run dev"
}

if (-not $SkipProxy) {
    Start-ServiceWindow -Title "TourValve Proxy" -WorkingDirectory (Join-Path $root "travelport-proxy") -Command "npm run dev"
}
