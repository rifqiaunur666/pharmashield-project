/**
 * src/components/CameraScanner.jsx
 * PharmaShield — Live webcam viewport with capture-to-Blob functionality.
 *
 * Props:
 *   onCapture(blob: Blob) — called with JPEG blob on capture
 *   isLoading: boolean    — disables button while backend processes
 */
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// ─── Scan-frame corners SVG overlay ──────────────────────────────────────────
function ScanFrame() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Top-left */}
      <polyline points="5,18 5,5 18,5"  fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      {/* Top-right */}
      <polyline points="82,5 95,5 95,18" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      {/* Bottom-left */}
      <polyline points="5,82 5,95 18,95" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      {/* Bottom-right */}
      <polyline points="82,95 95,95 95,82" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Camera error state ───────────────────────────────────────────────────────
function CameraError({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-full text-white">
      <span className="text-4xl" aria-hidden="true">📷</span>
      <div>
        <p className="font-bold text-sm">Kamera tidak dapat diakses</p>
        <p className="mt-1 text-xs text-white/60">{error}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-xs font-semibold bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
      >
        Coba Lagi
      </button>
    </div>
  );
}

export default function CameraScanner({ onCapture, isLoading }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraError, setCameraError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // ── Start camera ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraReady(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Aktifkan izin di pengaturan browser.'
          : err.name === 'NotFoundError'
          ? 'Tidak ada kamera yang terdeteksi pada perangkat ini.'
          : `Gagal mengakses kamera: ${err.message}`;
      setCameraError(msg);
    }
  }, []);

  // ── Stop camera ─────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  // ── Capture frame → JPEG Blob ────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isCameraReady) return;

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => { if (blob) onCapture(blob); },
      'image/jpeg',
      0.92,
    );
  }, [isCameraReady, onCapture]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* ── Viewport ── */}
      <div className="relative w-full max-w-xl aspect-video bg-black rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        {cameraError ? (
          <CameraError error={cameraError} onRetry={startCamera} />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onCanPlay={() => setIsCameraReady(true)}
              className="w-full h-full object-cover"
              aria-label="Umpan kamera langsung"
            />
            {/* Scan-frame overlay */}
            <ScanFrame />
            {/* "Camera active" dot */}
            {isCameraReady && (
              <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-semibold text-white bg-black/50 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                Kamera Aktif
              </span>
            )}
          </>
        )}
        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </div>

      {/* ── Capture button ── */}
      <button
        onClick={handleCapture}
        disabled={isLoading || !!cameraError || !isCameraReady}
        aria-busy={isLoading}
        className={[
          'w-full max-w-xl py-4 px-6 rounded-2xl font-bold text-sm tracking-wide',
          'transition-all duration-200 flex justify-center items-center gap-2.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2',
          isLoading || cameraError || !isCameraReady
            ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
            : 'bg-black text-white hover:bg-neutral-800 active:scale-[0.98] shadow-sm',
        ].join(' ')}
      >
        {isLoading ? (
          <>
            <span
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>Memproses OCR &amp; Analisis AI…</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">📸</span>
            <span>Pindai Kemasan Obat</span>
          </>
        )}
      </button>

      <p className="text-xs text-neutral-500 text-center max-w-xs">
        Arahkan kamera ke label kemasan obat, lalu tekan tombol di atas untuk memindai.
      </p>
    </div>
  );
}