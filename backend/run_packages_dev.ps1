$ErrorActionPreference = "Stop"

$backendRoot = $PSScriptRoot
$envFile = Join-Path $backendRoot ".env.packages.local"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing isolated Packages environment file: $envFile"
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

if ($env:DATABASE_URL -notmatch 'newaraai_packages_dev') {
    throw "Packages development server requires the isolated newaraai_packages_dev database."
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Backend virtual environment Python was not found."
}

Set-Location -LiteralPath $backendRoot
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
