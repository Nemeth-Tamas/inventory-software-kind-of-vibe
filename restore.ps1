# CLI Restore Helper Script for Windows PowerShell
param (
    [Parameter(Mandatory=$true, Position=0)]
    [string]$BackupFile,
    
    [Parameter(Mandatory=$false, Position=1)]
    [string]$ConfirmFlag
)

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "WARNING: YOU ARE ABOUT TO RESTORE A DATABASE BACKUP!" -ForegroundColor Yellow
Write-Host "Target Database: inventory"
Write-Host "Backup File:     $BackupFile"
Write-Host "==========================================================" -ForegroundColor Yellow

if ($ConfirmFlag -ne "--confirm") {
    Write-Error "Error: Explicit confirmation is required. Please re-run with --confirm flag:"
    Write-Host "Usage: .\restore.ps1 -BackupFile $BackupFile -ConfirmFlag --confirm" -ForegroundColor Cyan
    exit 1
}

Write-Host "Stopping application containers (backend, worker) to prevent any writes..." -ForegroundColor Cyan
docker compose stop backend worker

Write-Host "Running live restore inside the backup container..." -ForegroundColor Cyan
$restoreResult = docker compose exec -T backup python backup_manager.py restore-live $BackupFile --confirm

if ($LASTEXITCODE -eq 0) {
    Write-Host "Restore completed successfully." -ForegroundColor Green
} else {
    Write-Error "Error: Restore process failed!"
    Write-Host "Starting containers back up..." -ForegroundColor Yellow
    docker compose start backend worker
    exit 1
}

Write-Host "Starting backend and worker containers back up..." -ForegroundColor Cyan
docker compose start backend worker

Write-Host "Waiting for services to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "Running health check..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:18000/api/health" -Method Get
    if ($response.status -eq "ok") {
        Write-Host "Health Check PASSED! Services are healthy and database is restored." -ForegroundColor Green
    } else {
        Write-Warning "Warning: Health Check returned non-ok status: $response"
    }
} catch {
    Write-Error "Warning: Health Check FAILED! Please inspect container logs: docker compose logs backend"
    exit 1
}
