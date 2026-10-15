# PharmaShield - Backend Startup Script
# Jalankan dengan: .\start-backend.ps1

Write-Host "=== PharmaShield Backend Starter ===" -ForegroundColor Cyan

# Kill semua proses Python yang memakai port 8000
$port = 8000
$existing = netstat -ano | Select-String ":$port\s" | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Select-Object -Unique

if ($existing) {
    foreach ($pid in $existing) {
        if ($pid -match '^\d+$' -and $pid -ne '0') {
            Write-Host "Membunuh proses PID $pid yang memakai port $port..." -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
    Write-Host "Port $port sekarang bebas." -ForegroundColor Green
} else {
    Write-Host "Port $port sudah bebas." -ForegroundColor Green
}

# Pindah ke folder backend
Set-Location "D:\pharmashield-project\backend"

# Jalankan backend
Write-Host "Menjalankan backend di http://127.0.0.1:8000 ..." -ForegroundColor Cyan
& "D:\pharmashield-project\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
