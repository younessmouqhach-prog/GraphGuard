# GraphGuard — one-command launcher (Windows / PowerShell)
# Usage:  ./start.ps1
# Opens the backend (FastAPI) and the frontend (Vite) in two windows.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "🛡️  Starting GraphGuard..." -ForegroundColor Cyan

# --- Backend ---
$backend = Join-Path $root "backend"
if (-not (Test-Path (Join-Path $backend ".venv"))) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv (Join-Path $backend ".venv")
    & (Join-Path $backend ".venv\Scripts\python.exe") -m pip install --upgrade pip
    & (Join-Path $backend ".venv\Scripts\pip.exe") install -r (Join-Path $backend "requirements.txt")
    Write-Host "If torch is missing, run:" -ForegroundColor Yellow
    Write-Host "  backend\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu"
}

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
)

# --- Frontend ---
$frontend = Join-Path $root "frontend"
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $frontend; npm install; Pop-Location
}

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command", "cd '$frontend'; npm run dev"
)

Write-Host "✅ Backend  -> http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "✅ Frontend -> http://localhost:5180" -ForegroundColor Green
