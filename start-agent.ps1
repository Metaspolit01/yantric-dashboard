# ============================================================
#  Yantric Agent Worker — Start Script
#  Run this in a SEPARATE terminal alongside `npm run dev`
#
#  Usage:  .\start-agent.ps1
#  Stop:   Ctrl+C
# ============================================================

Write-Host ""
Write-Host "  Yantric Voice Agent Worker" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  One worker handles ALL your users simultaneously." -ForegroundColor Gray
Write-Host "  Auto-shuts down after 30 min of inactivity." -ForegroundColor Gray
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $agentDir

# Check uv is available
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] 'uv' not found in PATH." -ForegroundColor Red
    Write-Host "Install it from: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
    exit 1
}

# Check .env exists
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env file not found in $agentDir" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Starting agent worker..." -ForegroundColor Green
Write-Host ""

# Run the agent - uv handles the virtualenv automatically
uv run python agent.py dev