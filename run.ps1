<#
.SYNOPSIS
    MedTrack Runner Script for Windows PowerShell
.DESCRIPTION
    Checks Python 3.11+, creates/activates .venv, installs dependencies,
    runs database migrations, runs tests, seeds demo data if requested,
    and starts the Uvicorn server on http://localhost:8000.
.PARAMETER SkipTests
    Skips the pytest suite.
.PARAMETER Demo
    Runs seed_demo.py before starting the server.
.PARAMETER Reload
    Runs Uvicorn in development auto-reload mode.
.PARAMETER Port
    Port to run the application on (default 8000).
#>
param (
    [switch]$SkipTests,
    [switch]$Demo,
    [switch]$Reload,
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " MedTrack — Pharmacy Stock & Expiry Manager" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Locate Python
$PythonCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCmd = "py -3"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $PythonCmd = "python3"
} else {
    Write-Error "Python 3 is required but was not found in PATH."
    exit 1
}

Write-Host "Using Python: $PythonCmd" -ForegroundColor Green

# 2. Virtual Environment
$VenvDir = Join-Path $PSScriptRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    # Check Unix-style path just in case
    $VenvPythonUnix = Join-Path $VenvDir "bin/python"
    if (Test-Path $VenvPythonUnix) {
        $VenvPython = $VenvPythonUnix
    } else {
        Write-Host "Creating virtual environment at $VenvDir..." -ForegroundColor Yellow
        Invoke-Expression "$PythonCmd -m venv `"$VenvDir`""
        if (-not (Test-Path $VenvPython)) {
            $VenvPython = Join-Path $VenvDir "bin/python"
        }
    }
}

# 3. Install requirements
Write-Host "Ensuring dependencies are installed..." -ForegroundColor Yellow
& $VenvPython -m pip install --quiet --upgrade pip
& $VenvPython -m pip install --quiet -r (Join-Path $PSScriptRoot "requirements.txt") -r (Join-Path $PSScriptRoot "requirements-dev.txt")

# 4. Migrations
Write-Host "Running Alembic migrations..." -ForegroundColor Yellow
& $VenvPython -m alembic upgrade head

# 5. Tests
if (-not $SkipTests) {
    Write-Host "Running test suite..." -ForegroundColor Yellow
    & $VenvPython -m pytest tests/
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed! Fix failures before launching or run with -SkipTests."
        exit $LASTEXITCODE
    }
    Write-Host "All tests passed!" -ForegroundColor Green
} else {
    Write-Host "Skipping test suite (-SkipTests specified)." -ForegroundColor DarkGray
}

# 6. Demo seeding
if ($Demo) {
    Write-Host "Seeding demo dataset..." -ForegroundColor Yellow
    & $VenvPython -m app.seed_demo
}

# 7. Start server
Write-Host ""
Write-Host "MedTrack is starting on http://localhost:$Port" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

$UvicornArgs = @("app.main:app", "--host", "127.0.0.1", "--port", "$Port")
if ($Reload) {
    $UvicornArgs += "--reload"
}

& $VenvPython -m uvicorn @UvicornArgs
