/**
 * src/components/CameraScanner.jsx
 * PharmaShield — Single-Packaging Image Drug Scanner.
 * 
 * Flow:
 * 1. Status "Siap Scan": Kamera langsung aktif atau pilih 1 berkas foto dari perangkat.
 * 2. Pratinjau Foto: Pengguna melihat pratinjau gambar 1 foto sebelum dikirim ke AI & OCR.
 *    Dapat mengambil ulang jika foto buram/kurang pencahayaan.
 * 3. Status "Memproses Gambar": Mencegah klik berulang, menampilkan loading animasi.
 * 4. Status "Scan Gagal": Menampilkan pesan ramah pengguna jika terjadi galat, dengan opsi coba lagi atau pencarian manual.
 */
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

function ScanReticle() {
  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <div className="w-8 h-8 border-t-2 border-l-2 border-[#10b981] rounded-tl-lg shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
        <div className="w-8 h-8 border-t-2 border-r-2 border-[#10b981] rounded-tr-lg shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
      </div>
      <div className="flex justify-center items-center">
        <div className="w-64 h-0.5 bg-[#10b981] shadow-[0_0_12px_rgba(16,185,129,0.85)] animate-pulse" />
      </div>
      <div className="flex justify-between items-end">
        <div className="w-8 h-8 border-b-2 border-l-2 border-[#10b981] rounded-bl-lg shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
        <div className="w-8 h-8 border-b-2 border-r-2 border-[#10b981] rounded-br-lg shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
      </div>
    </div>
  );
}

export default function CameraScanner({
  onScan,
  isLoading = false,
  error = null,
  onClearError,
  onManualLookup,
}) {
  const [mode, setMode] = useState('camera'); // 'camera' | 'upload'
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // prefer back camera
  const [validationError, setValidationError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  // ─── Camera Lifecycle ────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraReady(false);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Akses kamera tidak didukung pada browser ini. Silakan gunakan opsi unggah berkas.');
      setMode('upload');
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
    } catch (err) {
      console.warn('[CameraScanner] getUserMedia failed:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError';

      if (isDenied) {
        setCameraError('Izin kamera ditolak. Silakan aktifkan izin kamera atau beralih ke unggah foto.');
      } else if (isNotFound) {
        setCameraError('Perangkat kamera tidak ditemukan. Silakan beralih ke unggah foto.');
      } else {
        setCameraError('Tidak dapat membuka kamera. Silakan pilih opsi unggah foto.');
      }
      setMode('upload');
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (mode === 'camera' && !selectedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [mode, selectedImage, startCamera, stopCamera]);

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ─── Capture Single Photo from Live Video ──────────────────────────────────
  const handleSnap = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isCameraReady || isLoading) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setValidationError(null);
        if (onClearError) onClearError();
        const url = URL.createObjectURL(blob);
        setSelectedImage(blob);
        setPreviewUrl(url);
      },
      'image/jpeg',
      0.92,
    );
  }, [isCameraReady, isLoading, onClearError]);

  // ─── Handle Single File Upload ──────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setValidationError('Format berkas harus berupa gambar (JPG, PNG, atau WEBP).');
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        setValidationError('Ukuran foto terlalu besar. Maksimal 20 MB.');
        return;
      }

      setValidationError(null);
      if (onClearError) onClearError();
      const url = URL.createObjectURL(file);
      setSelectedImage(file);
      setPreviewUrl(url);

      if (e.target) e.target.value = '';
    },
    [onClearError],
  );

  // ─── Retake / Reset Photo ──────────────────────────────────────────────────
  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedImage(null);
    setPreviewUrl(null);
    setValidationError(null);
    if (onClearError) onClearError();
  };

  // ─── Submit Single Image for Processing ───────────────────────────────────
  const handleProcess = () => {
    if (!selectedImage || isLoading) return;
    onScan(selectedImage);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Determine current system status label
  const currentStatus = isLoading
    ? { label: 'Memproses Gambar', color: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-400 dark:text-black', dot: 'bg-amber-600 dark:bg-black animate-ping' }
    : error
    ? { label: 'Scan Gagal', color: 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40', dot: 'bg-rose-600 dark:bg-rose-400' }
    : selectedImage
    ? { label: 'Pratinjau Foto', color: 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10b981]/20 dark:text-[#10b981] dark:border-[#10b981]/30', dot: 'bg-sky-600 dark:bg-[#10b981]' }
    : { label: 'Siap Scan', color: 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30', dot: 'bg-emerald-600 dark:bg-emerald-400 animate-pulse' };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 space-y-6 shadow-xl animate-fade-in">
      {/* ── Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-[var(--color-text-primary)]">Scan Obat</h2>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${currentStatus.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
              {currentStatus.label}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Arahkan kamera ke kemasan obat atau unggah 1 foto kemasan dari perangkat.
          </p>
        </div>

        {/* Mode Toggle (Only if no image selected yet) */}
        {!selectedImage && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#12151d] rounded-xl border border-slate-200 dark:border-white/5 self-start sm:self-auto">
            <button
              onClick={() => {
                setMode('camera');
                setValidationError(null);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'camera'
                  ? 'bg-[#0284c7] text-white dark:bg-[#10b981] dark:text-[#0f172a] font-extrabold shadow-sm'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📷 Live Kamera
            </button>
            <button
              onClick={() => {
                setMode('upload');
                setValidationError(null);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'upload'
                  ? 'bg-[#0284c7] text-white dark:bg-[#10b981] dark:text-[#0f172a] font-extrabold shadow-sm'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📁 Pilih Foto
            </button>
          </div>
        )}
      </div>

      {/* ── Guidelines Note ── */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151d] text-xs text-slate-700 dark:text-neutral-300 flex items-start gap-2.5">
        <span className="text-base shrink-0">💡</span>
        <p className="leading-relaxed">
          <strong>Panduan Pemindaian:</strong> Pastikan nama obat, dosis, komposisi, atau tulisan pada kemasan terlihat jelas, berpencahayaan cukup, dan tidak silau (glare). Cukup 1 foto kemasan obat untuk memulai analisis.
        </p>
      </div>

      {/* ── Error Alerts ── */}
      {(error || validationError) && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200">
              <span>⚠️</span>
              <span>{error ? 'Pemindaian Terkendala' : 'Peringatan Berkas'}</span>
            </div>
            {onManualLookup && (
              <button
                onClick={onManualLookup}
                className="text-[11px] underline font-bold text-[#0284c7] dark:text-[#10b981] hover:underline"
              >
                Cari Manual di Katalog
              </button>
            )}
          </div>
          <p>{error || validationError}</p>
        </div>
      )}

      {/* ── Viewport Area: Live Camera OR Image Preview OR Upload Picker ── */}
      {selectedImage ? (
        /* Image Preview State */
        <div className="space-y-4 animate-fade-in">
          <div className="relative aspect-video max-h-[440px] w-full rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Pratinjau Kemasan Obat"
                className="w-full h-full object-contain"
              />
            )}
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-bold text-white border border-white/10 flex items-center gap-1.5">
              <span>📸</span>
              <span>1 Foto Kemasan Siap Diproses</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-neutral-400 text-center">
            Periksa pratinjau foto di atas. Jika tulisan buram atau terpotong, silakan klik tombol <strong>Ambil Ulang</strong>.
          </p>
        </div>
      ) : mode === 'camera' ? (
        /* Live Camera Viewport */
        <div className="relative aspect-video max-h-[440px] w-full rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-white bg-black/90 h-full w-full">
              <span className="text-4xl">📷</span>
              <p className="font-bold text-sm text-rose-400">Akses Kamera Terkendala</p>
              <p className="text-xs text-neutral-400 max-w-sm">{cameraError}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={startCamera}
                  className="px-4 py-2 text-xs font-bold bg-[#0284c7] text-white dark:bg-[#10b981] dark:text-[#0f172a] rounded-xl hover:opacity-90"
                >
                  Coba Kamera Lagi
                </button>
                <button
                  onClick={() => setMode('upload')}
                  className="px-4 py-2 text-xs font-bold bg-neutral-800 text-white rounded-xl hover:bg-neutral-700"
                >
                  Pilih Foto dari Perangkat
                </button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onCanPlay={() => setIsCameraReady(true)}
                className="w-full h-full object-cover"
                aria-label="Tampilan kamera pemindai obat"
              />
              <ScanReticle />

              {/* Status & Camera Switch Overlay */}
              <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isCameraReady ? 'bg-[#10b981] animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  {isCameraReady ? 'Kamera Aktif' : 'Menghubungkan Kamera…'}
                </span>

                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="pointer-events-auto p-1.5 rounded-full bg-black/70 text-white/80 hover:text-white transition-colors border border-white/10"
                  title="Ganti Kamera Depan/Belakang"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Reticle Guideline */}
              <div className="absolute bottom-3 inset-x-3 flex justify-center pointer-events-none">
                <span className="text-[11px] font-semibold text-neutral-200 bg-black/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/10">
                  Posisikan nama obat atau label kemasan di dalam kotak bidik neon
                </span>
              </div>
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      ) : (
        /* File Upload Drop Area */
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-white/10 hover:border-[#0284c7]/50 dark:hover:border-[#10b981]/50 rounded-2xl p-10 text-center bg-slate-50 dark:bg-[#11141b] transition-all cursor-pointer flex flex-col items-center justify-center gap-3"
        >
          <span className="text-4xl">📸</span>
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            Pilih 1 Foto Kemasan Obat
          </p>
          <p className="text-xs text-slate-500 dark:text-neutral-400 max-w-sm">
            Klik di sini untuk memilih foto kemasan dari galeri atau berkas perangkat (format JPG, PNG, WEBP).
          </p>
          <button
            type="button"
            className="mt-2 px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 text-xs font-extrabold transition-all"
          >
            Pilih Berkas Foto
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Action Buttons ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-2">
          {onManualLookup && (
            <button
              type="button"
              onClick={onManualLookup}
              className="text-xs font-bold text-slate-600 dark:text-neutral-400 hover:text-[#0284c7] dark:hover:text-[#10b981] transition-colors flex items-center gap-1.5"
            >
              <span>🔍</span>
              <span>Masukkan Nama Obat Manual</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {selectedImage ? (
            <>
              {/* Retake Button */}
              <button
                type="button"
                onClick={handleRetake}
                disabled={isLoading}
                className="flex-1 sm:flex-none px-5 py-3 rounded-xl border border-slate-300 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 text-slate-700 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                🔄 Ambil Ulang
              </button>

              {/* Confirm & Process Button */}
              <button
                type="button"
                onClick={handleProcess}
                disabled={isLoading}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed font-black text-xs transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white dark:border-[#0f172a] border-t-transparent rounded-full animate-spin" />
                    <span>Memproses OCR &amp; Keamanan AI…</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Mulai Scan Kemasan</span>
                  </>
                )}
              </button>
            </>
          ) : mode === 'camera' ? (
            <>
              <button
                type="button"
                onClick={handleSnap}
                disabled={!isCameraReady || isLoading || Boolean(cameraError)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed font-black text-xs transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>📸</span>
                <span>Ambil Foto Kemasan</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] font-black text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span>📁</span>
              <span>Pilih Berkas Foto</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}