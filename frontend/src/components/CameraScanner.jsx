/**
 * src/components/CameraScanner.jsx
 * PharmaShield — Live Webcam Viewport + File Upload Fallback with Dark Neon Green Aesthetic.
 */
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

function ScanFrame() {
  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <div className="w-8 h-8 border-t-2 border-l-2 border-[#c8f93a] rounded-tl-lg shadow-[0_0_8px_rgba(200,249,58,0.4)]" />
        <div className="w-8 h-8 border-t-2 border-r-2 border-[#c8f93a] rounded-tr-lg shadow-[0_0_8px_rgba(200,249,58,0.4)]" />
      </div>
      <div className="flex justify-center items-center">
        <div className="w-56 h-0.5 bg-[#c8f93a] shadow-[0_0_14px_rgba(200,249,58,0.9)] animate-pulse" />
      </div>
      <div className="flex justify-between items-end">
        <div className="w-8 h-8 border-b-2 border-l-2 border-[#c8f93a] rounded-bl-lg shadow-[0_0_8px_rgba(200,249,58,0.4)]" />
        <div className="w-8 h-8 border-b-2 border-r-2 border-[#c8f93a] rounded-br-lg shadow-[0_0_8px_rgba(200,249,58,0.4)]" />
      </div>
    </div>
  );
}

function CameraErrorPrompt({ error, onRetry, onChooseUpload }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full text-white bg-black/90 rounded-2xl">
      <span className="text-4xl" aria-hidden="true">📷</span>
      <div className="max-w-xs space-y-1">
        <p className="font-bold text-sm text-rose-400">Akses Kamera Terkendala</p>
        <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          onClick={onRetry}
          className="px-4 py-2 text-xs font-bold bg-[#c8f93a] text-[#0c1004] rounded-xl hover:bg-[#b5f524] transition-colors"
        >
          Coba Kamera Lagi
        </button>
        <button
          onClick={onChooseUpload}
          className="px-4 py-2 text-xs font-bold bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 transition-colors"
        >
          Unggah File Foto
        </button>
      </div>
    </div>
  );
}

export default function CameraScanner({ onCapture, isLoading }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraError, setCameraError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // back camera preferred
  const [hasCamera, setHasCamera] = useState(true);

  // ─── Initialize Camera ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraReady(false);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini tidak mendukung akses kamera langsung. Silakan gunakan tombol unggah gambar.');
      setHasCamera(false);
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasCamera(true);
    } catch (err) {
      console.warn('[Camera] getUserMedia failed:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError';

      if (isDenied) {
        setCameraError('Izin akses kamera ditolak. Silakan izinkan di pengaturan browser.');
      } else if (isNotFound) {
        setCameraError('Tidak ada perangkat kamera yang terpasang.');
      } else {
        setCameraError(`Kamera tidak dapat dimulai (${err.message || 'Error'}). Silakan unggah file.`);
      }
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  // ─── Frame Capture ──────────────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isCameraReady || isLoading) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }, [isCameraReady, isLoading, onCapture]);

  // ─── File Upload Handler ────────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file && onCapture) {
        onCapture(file);
      }
      if (e.target) e.target.value = '';
    },
    [onCapture],
  );

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* ── Viewport ── */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-[var(--color-border)] shadow-md flex items-center justify-center">
        {cameraError ? (
          <CameraErrorPrompt
            error={cameraError}
            onRetry={startCamera}
            onChooseUpload={() => fileInputRef.current?.click()}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onCanPlay={() => setIsCameraReady(true)}
              className="w-full h-full object-cover"
              aria-label="Tampilan langsung kamera pemindai obat"
            />

            {/* Target Reticle Overlay with Neon Accent */}
            <ScanFrame />

            {/* Header Status Chips inside Camera */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCameraReady ? 'bg-[#c8f93a] animate-pulse' : 'bg-amber-400'
                  }`}
                  aria-hidden="true"
                />
                {isCameraReady ? 'Kamera Aktif' : 'Menghubungkan…'}
              </span>

              {hasCamera && (
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="pointer-events-auto p-1.5 rounded-full bg-black/70 text-white/80 hover:text-white hover:bg-black transition-colors border border-white/10"
                  title="Ganti Kamera Depan/Belakang"
                  aria-label="Ganti Kamera"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>

            {/* Instruction Banner at bottom of camera */}
            <div className="absolute bottom-3 inset-x-3 flex justify-center pointer-events-none">
              <span className="text-[11px] font-semibold text-neutral-200 bg-black/80 backdrop-blur-md px-3.5 py-1 rounded-full text-center border border-white/10">
                Posisikan nama obat atau label kemasan di dalam kotak bidik neon
              </span>
            </div>
          </>
        )}

        {/* Hidden Canvas & File Input */}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileUpload}
          className="hidden"
          aria-label="Unggah file foto obat"
        />
      </div>

      {/* ── Action Buttons ── */}
      <div className="w-full flex flex-col sm:flex-row gap-3">
        {/* Main Camera Capture Button (Neon Lime) */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={isLoading || Boolean(cameraError) || !isCameraReady}
          aria-busy={isLoading}
          className={[
            'flex-1 py-3.5 px-6 rounded-xl font-extrabold text-xs tracking-wide',
            'transition-all duration-180 flex justify-center items-center gap-2.5 shadow-lg',
            isLoading || cameraError || !isCameraReady
              ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/5'
              : 'btn-neon',
          ].join(' ')}
        >
          {isLoading ? (
            <>
              <span
                className="w-4 h-4 border-2 border-[#0c1004] border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
              <span>Menganalisis OCR &amp; Keamanan AI…</span>
            </>
          ) : (
            <>
              <span className="text-base" aria-hidden="true">📸</span>
              <span>Pindai Kemasan Obat</span>
            </>
          )}
        </button>

        {/* Secondary File Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={[
            'py-3.5 px-5 rounded-xl font-bold text-xs tracking-wide transition-all',
            'border border-[var(--color-border)] bg-[#11141b] text-neutral-300 hover:text-white hover:bg-neutral-800',
            'flex items-center justify-center gap-2 shadow-sm',
            isLoading && 'opacity-50 cursor-not-allowed',
          ].join(' ')}
          title="Unggah foto langsung dari galeri atau berkas komputer"
        >
          <span className="text-base" aria-hidden="true">📁</span>
          <span>Unggah Berkas</span>
        </button>
      </div>

      <p className="text-[11px] text-neutral-500 text-center">
        Mendukung tangkapan kamera langsung atau unggahan berkas foto format JPG, PNG, WEBP.
      </p>
    </div>
  );
}