# ============================================================
#  PharmaShield - One-Click Startup Script
#  Jalankan: .\start-all.ps1
# ============================================================

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     PharmaShield - Starting All      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ----------------------------------------------------------
# STEP 1: Bebaskan port 8000
# ----------------------------------------------------------
Write-Host "[1/4] Memeriksa port 8000..." -ForegroundColor Yellow

$portInfo = netstat -ano | Select-String ":8000\s"
if ($portInfo) {
    $pids = $portInfo | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -Unique
    foreach ($p in $pids) {
        Write-Host "     Membunuh PID $p yang memakai port 8000..." -ForegroundColor Red
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "     Port 8000 sekarang bebas." -ForegroundColor Green
} else {
    Write-Host "     Port 8000 sudah bebas." -ForegroundColor Green
}

# ----------------------------------------------------------
# STEP 2: Jalankan Backend (background)
# ----------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Menjalankan Backend FastAPI..." -ForegroundColor Yellow

$backendJob = Start-Job -ScriptBlock {
    Set-Location "D:\pharmashield-project\backend"
    $py = "D:\pharmashield-project\.venv\Scripts\python.exe"
    if (-not (Test-Path $py)) {
        $py = "D:\pharmashield-project\backend\venv\Scripts\python.exe"
    }
    & $py -m uvicorn app.main:app --host 127.0.0.1 --port 8000 2>&1
}

# Tunggu backend siap (max 10 detik)
$ready = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -UseBasicParsing
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if ($ready) {
    Write-Host "     Backend berjalan di http://127.0.0.1:8000" -ForegroundColor Green
} else {
    Write-Host "     Backend timeout - cek log!" -ForegroundColor Red
}

# ----------------------------------------------------------
# STEP 3: Jalankan Cloudflare Tunnel (background)
# ----------------------------------------------------------
Write-Host ""
Write-Host "[3/4] Menjalankan Cloudflare Tunnel..." -ForegroundColor Yellow

$tunnelJob = Start-Job -ScriptBlock {
    & "D:\pharmashield-project\cloudflared.exe" tunnel --url http://127.0.0.1:8000 2>&1
}

# Tunggu URL tunnel muncul (max 30 detik)
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $output = Receive-Job $tunnelJob -Keep
    $match = $output | Select-String "https://[a-z0-9\-]+\.trycloudflare\.com"
    if ($match) {
        $tunnelUrl = $match.Matches[0].Value
        break
    }
}

if ($tunnelUrl) {
    Write-Host "     Tunnel aktif: $tunnelUrl" -ForegroundColor Green
} else {
    Write-Host "     Tunnel timeout - URL belum ditemukan, coba tunggu 30 detik." -ForegroundColor Red
    $tunnelUrl = "https://holder-favorites-kde-intake.trycloudflare.com"
    Write-Host "     Menggunakan URL terakhir: $tunnelUrl" -ForegroundColor Yellow
}

# ----------------------------------------------------------
# STEP 4: Update Fonnte Webhook
# ----------------------------------------------------------
Write-Host ""
Write-Host "[4/4] Memperbarui Fonnte Webhook..." -ForegroundColor Yellow

$webhookUrl = "$tunnelUrl/api/webhook/fonnte"

try {
    $body = "webhook=$([System.Uri]::EscapeDataString($webhookUrl))"
    $resp = Invoke-WebRequest `
        -Uri "https://api.fonnte.com/webhook" `
        -Method POST `
        -Headers @{ Authorization = "W4yJB3NxYtR2h7jE7Z7G" } `
        -Body $body `
        -ContentType "application/x-www-form-urlencoded" `
        -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    if ($json.status) {
        Write-Host "     Fonnte webhook berhasil diset ke:" -ForegroundColor Green
        Write-Host "     $webhookUrl" -ForegroundColor White
    } else {
        Write-Host "     Fonnte webhook gagal: $($resp.Content)" -ForegroundColor Red
    }
} catch {
    Write-Host "     Error update webhook: $_" -ForegroundColor Red
}

# ----------------------------------------------------------
# SUMMARY
# ----------------------------------------------------------
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              ✅ PharmaShield Ready!              ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Backend  : http://127.0.0.1:8000               ║" -ForegroundColor White
Write-Host "║  Tunnel   : $tunnelUrl" -ForegroundColor White
Write-Host "║  Webhook  : /api/webhook/fonnte                  ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tekan Ctrl+C untuk menghentikan semua service." -ForegroundColor Gray
Write-Host ""

# Jaga agar script tetap jalan (tampilkan log backend)
try {
    while ($true) {
        $out = Receive-Job $backendJob
        if ($out) { Write-Host $out -ForegroundColor DarkGray }
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "Menghentikan semua service..." -ForegroundColor Yellow
    Stop-Job $backendJob, $tunnelJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $tunnelJob -Force -ErrorAction SilentlyContinue
}
