/**
 * src/app/page.jsx
 * PharmaShield — Main Scanner Dashboard page.
 * Unites CameraScanner + MedicineResultCard with full error handling.
 */
'use client';

import { useState, useCallback } from 'react';
import CameraScanner      from '@/components/CameraScanner';
import MedicineResultCard from '@/components/MedicineResultCard';
import { scanMedicineImage } from '@/lib/api';
import { addHistory }        from '@/lib/history';

// ─── Error alert ──────────────────────────────────────────────────────────────
function ErrorAlert({ message, onDismiss }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 animate-fade-in"
    >
      <span className="text-lg leading-none shrink-0" aria-hidden="true">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">Terjadi kesalahan</p>
        <p className="mt-0.5 text-rose-700">{message}</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Tutup pesan error"
        className="shrink-0 text-rose-400 hover:text-rose-700 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────
function PageHeader() {
  return (
    <div className="space-y-1">
      <h1 className="text-3xl font-extrabold tracking-tight text-black">
        📸 Scanner Obat
      </h1>
      <p className="text-sm text-neutral-500">
        Pindai kemasan obat untuk mendeteksi tanggal kedaluwarsa dan evaluasi keamanan secara otomatis.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ScannerPage() {
  const [result,    setResult]    = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState(null);

  const handleCapture = useCallback(async (imageBlob) => {
    setIsLoading(true);
    setError(null);

    try {
      const scanResult = await scanMedicineImage(imageBlob);
      setResult(scanResult);
      // Persist to local history
      addHistory(scanResult);
    } catch (err) {
      console.error('[PharmaShield] Scan failed:', err);

      const isNetworkError =
        err instanceof TypeError && err.message.toLowerCase().includes('fetch');

      setError(
        isNetworkError
          ? 'Tidak dapat terhubung ke server. Pastikan backend berjalan dan coba lagi.'
          : err.message || 'Analisis gagal. Silakan coba lagi.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* ── Two-column layout on desktop ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">

        {/* ── Left: Camera panel ── */}
        <section aria-labelledby="scanner-heading">
          <h2 id="scanner-heading" className="sr-only">Kamera Pemindai</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-black" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Kamera Langsung
              </span>
            </div>
            <CameraScanner onCapture={handleCapture} isLoading={isLoading} />
          </div>
        </section>

        {/* ── Right: Result panel ── */}
        <section aria-labelledby="result-heading">
          <h2 id="result-heading" className="sr-only">Hasil Pemindaian</h2>

          {/* Error */}
          {error && (
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          )}

          {/* Loading skeleton */}
          {isLoading && !result && (
            <div className="animate-pulse space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-6 w-2/3 bg-neutral-100 rounded-lg" />
              <div className="h-4 w-full bg-neutral-100 rounded-lg" />
              <div className="h-4 w-5/6 bg-neutral-100 rounded-lg" />
              <div className="h-20 w-full bg-neutral-100 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-24 bg-neutral-100 rounded-xl" />
                <div className="h-24 bg-neutral-100 rounded-xl" />
              </div>
            </div>
          )}

          {/* Result card */}
          {result && !isLoading && (
            <MedicineResultCard result={result} />
          )}

          {/* Empty placeholder */}
          {!result && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center gap-4 h-full min-h-[260px] rounded-2xl border border-dashed border-slate-300 bg-neutral-50/50 text-center p-6">
              <span className="text-4xl opacity-30" aria-hidden="true">🧴</span>
              <div>
                <p className="text-sm font-semibold text-neutral-400">Belum ada hasil</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Arahkan kamera ke kemasan obat, lalu tekan &quot;Pindai Kemasan Obat&quot;.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}