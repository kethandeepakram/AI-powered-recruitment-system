# PowerShell script to download required libraries
# To run: Right-click this file and select "Run with PowerShell"

# Create libs directory if it doesn't exist
$libsDir = Join-Path $PSScriptRoot "libs"
if (-not (Test-Path $libsDir)) {
    New-Item -ItemType Directory -Path $libsDir | Out-Null
    Write-Host "Created libs directory: $libsDir"
}

# List of libraries to download
$libraries = @(
    @{
        Name = "WaveSurfer.js"
        Url = "https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js"
        OutputFile = Join-Path $libsDir "wavesurfer.min.js"
    },
    @{
        Name = "WaveSurfer Microphone Plugin"
        Url = "https://unpkg.com/wavesurfer.js@7/dist/plugins/wavesurfer.microphone.min.js"
        OutputFile = Join-Path $libsDir "wavesurfer.microphone.min.js"
    },
    @{
        Name = "RecordRTC"
        Url = "https://unpkg.com/recordrtc@5.6.2/RecordRTC.js"
        OutputFile = Join-Path $libsDir "RecordRTC.min.js"
    }
)

# Download each library
foreach ($lib in $libraries) {
    Write-Host "Downloading $($lib.Name)..."
    try {
        Invoke-WebRequest -Uri $lib.Url -OutFile $lib.OutputFile
        Write-Host "Successfully downloaded to: $($lib.OutputFile)" -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to download $($lib.Name): $_" -ForegroundColor Red
    }
}

Write-Host "`nAll libraries downloaded to: $libsDir" -ForegroundColor Cyan
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")