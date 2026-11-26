$ErrorActionPreference = "Stop"

$backendRoot = $PSScriptRoot
$envFile = Join-Path $backendRoot ".env.activities.local"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing isolated Activities environment file: $envFile"
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

if ($env:DATABASE_URL -notmatch 'newaraai_activities_dev') {
    throw "Activities development server requires the isolated newaraai_activities_dev database."
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Backend virtual environment Python was not found."
}

Set-Location -LiteralPath $backendRoot
& $python -m uvicorn main_activities:app --host 127.0.0.1 --port 8003
