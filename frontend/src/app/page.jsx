/**
 * src/app/page.jsx
 * PharmaShield — Dark Neon Green Admin Dashboard & Scanner.
 * Mengacu pada referensi UI/UX: Dark Mode elegan, aksen hijau neon (#c8f93a), progress ring,
 * bebas dari pelacak kedaluwarsa, dan terintegrasi Datasheet Obat Penyakit Umum Indonesia.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import CameraScanner from '@/components/CameraScanner';
import MedicineResultCard from '@/components/MedicineResultCard';
import HistoryTable from '@/components/HistoryTable';
import MedicineCatalog from '@/components/MedicineCatalog';
import {
  scanMedicineImage,
  fetchHistory,
  deleteHistoryItem,
  clearAllHistory,
} from '@/lib/api';
import { INDONESIA_MEDICINES } from '@/lib/indonesiaMedicineCatalog';

// ─── Progress Ring Metric Card (Sesuai Referensi Gambar) ────────────────────
function RingMetricCard({ title, percentage, label, targetText }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 shadow-sm hover:border-[#c8f93a]/30 transition-all">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-white">
              {percentage}%
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            {targetText}
          </p>
        </div>

        {/* Circular SVG Ring (Neon Green) */}
        <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
            <circle
              cx="28"
              cy="28"
              r={radius}
              className="text-[#232735]"
              strokeWidth="5"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="28"
              cy="28"
              r={radius}
              stroke="#c8f93a"
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <span className="absolute text-[11px] font-black text-white">
            {percentage}%
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
        <span className="text-neutral-400 text-[11px]">{label}</span>
        <span className="font-extrabold text-[#c8f93a] bg-[#c8f93a]/10 px-2 py-0.5 rounded-full text-[10px] border border-[#c8f93a]/20">
          Optimal
        </span>
      </div>
    </div>
  );
}

// ─── Top Metric Stat Card ────────────────────────────────────────────────────
function MetricCard({ title, value, unit = 'item', label, badge, trend, icon, accentColor = 'text-white' }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 shadow-sm hover:border-[#c8f93a]/30 transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${accentColor}`}>
              {value}
            </span>
            <span className="text-xs font-semibold text-neutral-500">{unit}</span>
          </div>
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-neutral-300 border border-white/5">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
        <span className="text-neutral-400 text-[11px]">{label}</span>
        {trend && (
          <span className="font-bold text-[#c8f93a] text-[11px] flex items-center gap-0.5">
            <span>↗</span> {trend}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Error Alert Banner ──────────────────────────────────────────────────────
function ErrorAlertBanner({ message, onRetry, onDismiss }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 shadow-sm animate-fade-in"
    >
      <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-bold text-rose-200">Terjadi Kendala Komunikasi Sistem</p>
        <p className="text-rose-300 leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-xs font-bold bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors"
          >
            Coba Lagi
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
          className="p-1 text-rose-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Main Scanner Page ───────────────────────────────────────────────────────
export default function ScannerDashboardPage() {
  const [result, setResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'datasheet'

  // History state populated via GET /api/history
  const [historyItems, setHistoryItems] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    total: 0,
    safe: 0,
    warning: 0,
  });

  // ─── Load History & Stats from Backend ──────────────────────────────────────
  const loadHistoryData = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const data = await fetchHistory();
      setHistoryItems(data.items);
      setMetrics({
        total: data.total ?? data.items?.length ?? 0,
        safe: data.safe ?? data.items?.filter((i) => i.status === 'green').length ?? 0,
        warning: data.warning ?? data.items?.filter((i) => i.status === 'yellow').length ?? 0,
      });
    } catch (err) {
      console.warn('[PharmaShield] Fetch history warning:', err.message);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistoryData();
  }, [loadHistoryData]);

  // ─── Handle Image Scan Capture ──────────────────────────────────────────────
  const handleCapture = useCallback(
    async (imageBlob) => {
      setIsScanning(true);
      setError(null);

      try {
        const scanResult = await scanMedicineImage(imageBlob);
        setResult(scanResult);
        await loadHistoryData();
      } catch (err) {
        console.error('[PharmaShield] Scan failed:', err);
        setError(
          err.message ||
            'Gagal memproses pemindaian kemasan obat. Pastikan backend aktif di http://127.0.0.1:8000.'
        );
      } finally {
        setIsScanning(false);
      }
    },
    [loadHistoryData],
  );

  // ─── Row Deletion ───────────────────────────────────────────────────────────
  const handleDeleteRow = useCallback(
    async (scanId) => {
      if (!scanId) return;
      const success = await deleteHistoryItem(scanId);
      if (success) {
        setHistoryItems((prev) => prev.filter((item) => (item.id || item.scan_id) !== scanId));
        loadHistoryData();
      } else {
        setError('Gagal menghapus entri riwayat dari server.');
      }
    },
    [loadHistoryData],
  );

  // ─── Clear All History ──────────────────────────────────────────────────────
  const handleClearAll = useCallback(async () => {
    if (!window.confirm('Hapus seluruh riwayat pemindaian obat? Tindakan ini permanen.')) {
      return;
    }
    const success = await clearAllHistory();
    if (success) {
      setHistoryItems([]);
      setMetrics({ total: 0, safe: 0, warning: 0 });
    } else {
      setError('Gagal membersihkan riwayat pada server.');
    }
  }, []);

  const safeRate = metrics.total > 0
    ? Math.round((metrics.safe / metrics.total) * 100)
    : 100;

  return (
    <div className="space-y-8">
      {/* ── Page Header (Sesuai Referensi Gambar) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-black tracking-tight text-white">
              Ikhtisar Dasbor Medis
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c8f93a]/15 px-2.5 py-0.5 text-xs font-bold text-[#c8f93a] border border-[#c8f93a]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8f93a] animate-pulse" />
              AI OCR &amp; Guard
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-neutral-400">
            Pantau analisis keamanan konsumsi obat, identifikasi label kemasan, dan akses referensi obat umum di Indonesia.
          </p>
        </div>

        {/* Quick action tabs & refresh */}
        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <div className="flex p-1 rounded-xl bg-[#161922] border border-[var(--color-border)]">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'scanner'
                  ? 'bg-[#c8f93a] text-[#0c1004] shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Scanner AI
            </button>
            <button
              onClick={() => setActiveTab('datasheet')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'datasheet'
                  ? 'bg-[#c8f93a] text-[#0c1004] shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Datasheet ID
            </button>
          </div>

          <button
            onClick={loadHistoryData}
            disabled={isHistoryLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-[var(--color-border)] bg-[#161922] text-neutral-300 hover:text-white hover:border-[#c8f93a]/30 transition-all"
            title="Segarkan data riwayat dan statistik"
          >
            <span className={isHistoryLoading ? 'animate-spin' : ''}>↻</span>
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </div>

      {/* ── Top Metric Stat Cards (Sesuai Referensi Visual) ── */}
      <section aria-label="Statistik Pemindaian" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Scans */}
        <MetricCard
          title="Total Pemindaian"
          value={metrics.total}
          unit="rekaman"
          label="Semua log tervalidasi"
          badge="Log Sistem"
          trend="+12% bulan ini"
          accentColor="text-white"
        />

        {/* Safe Count 🟢 */}
        <MetricCard
          title="Status Aman (🟢)"
          value={metrics.safe}
          unit="obat"
          label="Terverifikasi layak konsumsi"
          badge="Layak Pakai"
          trend="Akurasi Tinggi"
          accentColor="text-[#c8f93a]"
        />

        {/* Safety Rate Progress Ring (Sesuai Widget Sasaran Produktif di Referensi) */}
        <RingMetricCard
          title="Tingkat Keamanan AI"
          percentage={safeRate}
          label="Rasio kemasan terverifikasi aman"
          targetText="Standar Konsumsi Obat"
        />

        {/* Indonesia Medicine Catalog Count */}
        <MetricCard
          title="Datasheet Obat ID"
          value={INDONESIA_MEDICINES.length}
          unit="katalog"
          label="Penyakit umum masyarakat ID"
          badge="Indonesia"
          trend="Terstandarisasi"
          accentColor="text-[#c8f93a]"
        />
      </section>

      {/* ── Error Banner ── */}
      {error && (
        <ErrorAlertBanner
          message={error}
          onRetry={loadHistoryData}
          onDismiss={() => setError(null)}
        />
      )}

      {/* ── Active Tab Display: Scanner or Datasheet ── */}
      {activeTab === 'scanner' ? (
        <div className="space-y-8 animate-fade-in">
          {/* ── Dual Viewport: Camera (Left) + Result Card (Right) ── */}
          <section aria-label="Ruang Pemindaian" className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start">
            {/* ── Left Viewport: Live Camera / Upload ── */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#c8f93a] animate-pulse" aria-hidden="true" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-300">
                    Viewport Kamera Pemindai
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#c8f93a]">
                  OCR Tesseract + AI
                </span>
              </div>

              <CameraScanner onCapture={handleCapture} isLoading={isScanning} />
            </div>

            {/* ── Right Viewport: Real-time Result Card ── */}
            <div className="space-y-4">
              {/* Scanning Skeleton */}
              {isScanning && !result && (
                <div className="animate-pulse space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-neutral-800 rounded-xl" />
                    <div className="space-y-2 flex-1">
                      <div className="h-6 w-1/2 bg-neutral-800 rounded-lg" />
                      <div className="h-4 w-1/3 bg-neutral-800/60 rounded-lg" />
                    </div>
                  </div>
                  <div className="h-16 w-full bg-neutral-800/40 rounded-xl" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-20 bg-neutral-800/40 rounded-xl" />
                    <div className="h-20 bg-neutral-800/40 rounded-xl" />
                  </div>
                  <div className="h-28 bg-neutral-800/40 rounded-xl" />
                </div>
              )}

              {/* Active Result Card */}
              {result && !isScanning && (
                <MedicineResultCard result={result} />
              )}

              {/* Idle Placeholder (Dark Neon Aesthetic) */}
              {!result && !isScanning && (
                <div className="flex flex-col items-center justify-center gap-4 min-h-[380px] rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card-bg)] text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-black/40 border border-[#c8f93a]/30 flex items-center justify-center text-3xl shadow-inner text-[#c8f93a]">
                    💊
                  </div>
                  <div className="max-w-sm space-y-1.5">
                    <h3 className="text-base font-extrabold text-white">
                      Siap Menganalisis Kemasan Obat
                    </h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Arahkan kamera ke kemasan obat atau unggah gambar label. Sistem OCR akan mendeteksi nama obat, mengevaluasi indikasi dan dosis, serta membacakan hasil dengan suara AI (TTS).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 bg-black/30 px-3.5 py-1.5 rounded-full border border-white/5">
                    <span className="text-[#c8f93a]">🟢 Aman</span>
                    <span>•</span>
                    <span className="text-amber-400">🟡 Perhatian</span>
                    <span>•</span>
                    <span className="text-rose-400">🔴 Peringatan</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Section Quick Preview Datasheet Obat Indonesia ── */}
          <section className="space-y-4 pt-4 border-t border-[var(--color-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight text-white">
                    📚 Datasheet Obat Penyakit Umum Indonesia
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c8f93a]/15 text-[#c8f93a] border border-[#c8f93a]/30">
                    Katalog Resmi
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Referensi cepat dosis, indikasi, dan golongan obat untuk demam, flu, batuk, maag, hipertensi ringan, dan diare.
                </p>
              </div>

              <button
                onClick={() => setActiveTab('datasheet')}
                className="text-xs font-extrabold text-[#c8f93a] hover:underline flex items-center gap-1 self-start sm:self-center"
              >
                <span>Buka Katalog Lengkap</span>
                <span>→</span>
              </button>
            </div>

            {/* Quick Medicine Catalog Component */}
            <MedicineCatalog />
          </section>

          {/* ── Bottom Section: Interactive History Table ── */}
          <section aria-labelledby="history-heading" className="space-y-4 pt-4 border-t border-[var(--color-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 id="history-heading" className="text-xl font-black tracking-tight text-white">
                  📋 Riwayat Pemindaian Terkini
                </h2>
                <p className="text-xs text-neutral-400">
                  Daftar hasil scan obat yang tersimpan otomatis di database sistem.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {historyItems.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
                  >
                    Hapus Semua
                  </button>
                )}
                <button
                  onClick={loadHistoryData}
                  disabled={isHistoryLoading}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-[var(--color-border)] bg-[#161922] text-neutral-300 hover:text-white hover:border-[#c8f93a]/30 transition-all"
                >
                  Segarkan Tabel
                </button>
              </div>
            </div>

            {/* History Table Component */}
            <HistoryTable
              items={historyItems}
              onRemove={handleDeleteRow}
              onSelect={(selectedItem) => {
                setResult(selectedItem);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              isLoading={isHistoryLoading}
            />
          </section>
        </div>
      ) : (
        /* ── Full Datasheet Tab ── */
        <div className="space-y-6 animate-fade-in">
          <MedicineCatalog />
        </div>
      )}
    </div>
  );
}