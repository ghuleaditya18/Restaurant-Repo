$ErrorActionPreference = "Stop"

$backendRoot = $PSScriptRoot
$envFile = Join-Path $backendRoot ".env.villas.local"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing isolated Villas environment file: $envFile"
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

if ($env:DATABASE_URL -notmatch '^sqlite:///') {
    throw "Villas development server requires its isolated SQLite database."
}

$databasePath = $env:DATABASE_URL.Substring(10)
$expectedDatabasePath = Join-Path $backendRoot ".local\niwaraai_villas_dev.sqlite3"
if ([IO.Path]::GetFullPath($databasePath) -ne [IO.Path]::GetFullPath($expectedDatabasePath) -or
    -not (Test-Path -LiteralPath $expectedDatabasePath -PathType Leaf)) {
    throw "Villas development server is not pointed at the expected existing Villas database."
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Backend virtual environment Python was not found."
}

Set-Location -LiteralPath $backendRoot
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
