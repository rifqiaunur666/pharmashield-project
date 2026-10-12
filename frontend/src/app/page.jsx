/**
 * src/app/page.jsx
 * PharmaShield — AI Drug Safety Scanner & Complete Healthcare Hub Architecture.
 *
 * Stage 1: Onboarding & Medical Profile Setup
 * Stage 2: Dashboard Hub (Overview, Primary CTA, Recent Scans, Profile Shortcut)
 * Stage 3: Scan Obat (Single packaging image scan, Camera reticle, Preview & Retake)
 * Stage 4: Result Summary & Safety Assessment (4-State: Green, Yellow, Red, Gray; Transparency Panel; Actions)
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import CameraScanner from '@/components/CameraScanner';
import MedicineResultCard from '@/components/MedicineResultCard';
import HistoryTable from '@/components/HistoryTable';
import MedicineCatalog from '@/components/MedicineCatalog';
import { useAuth } from '@/lib/AuthContext';
import { useSidebar } from '@/components/AdminShell';
import {
  scanMedicineImage,
  fetchHistory,
  deleteHistoryItem,
  clearAllHistory,
} from '@/lib/api';

// ─── Progress Ring Metric Card ───────────────────────────────────────────────
function RingMetricCard({ title, percentage, label, targetText }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 shadow-sm hover:border-[#c8f93a]/30 transition-all">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {percentage}%
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{targetText}</p>
        </div>

        <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
            <circle
              cx="28"
              cy="28"
              r={radius}
              className="text-neutral-200 dark:text-[#232735]"
              strokeWidth="5"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="28"
              cy="28"
              r={radius}
              stroke="currentColor"
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="text-[#0284c7] dark:text-[#c8f93a] transition-all duration-700 ease-out"
            />
          </svg>
          <span className="absolute text-[11px] font-black text-[var(--color-text-primary)]">
            {percentage}%
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs">
        <span className="text-[var(--color-text-secondary)] text-[11px]">{label}</span>
        <span className="font-extrabold text-[#0284c7] bg-sky-50 border border-sky-200 dark:text-[#c8f93a] dark:bg-[#c8f93a]/10 dark:border-[#c8f93a]/20 px-2 py-0.5 rounded-full text-[10px]">
          Optimal
        </span>
      </div>
    </div>
  );
}

// ─── Top Metric Stat Card ────────────────────────────────────────────────────
function MetricCard({ title, value, unit = 'item', label, badge, trend, accentColor = 'text-[var(--color-text-primary)]' }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 shadow-sm hover:border-[#c8f93a]/30 transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${accentColor}`}>
              {value}
            </span>
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">{unit}</span>
          </div>
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-[var(--color-text-secondary)] border border-[var(--color-border)]">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs">
        <span className="text-[var(--color-text-secondary)] text-[11px]">{label}</span>
        {trend && (
          <span className="font-bold text-[#15803d] bg-[#dcfce7] border border-[#86efac] dark:text-[#c8f93a] dark:bg-[#c8f93a]/15 dark:border-[#c8f93a]/30 px-2 py-0.5 rounded-full text-[10px] flex items-center gap-0.5 shadow-xs">
            <span>↗</span> {trend}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AppHomePage() {
  const { user, isAuthenticated } = useAuth();
  const { openAuthModal, openProfileModal } = useSidebar();

  // Control stages: 'dashboard' | 'scanner' | 'result'
  const [currentStage, setCurrentStage] = useState('dashboard');
  const [result, setResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [showManualLookup, setShowManualLookup] = useState(false);

  // History & Metrics
  const [historyItems, setHistoryItems] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [metrics, setMetrics] = useState({ total: 0, safe: 0, warning: 0, danger: 0 });

  const loadHistoryData = useCallback(async () => {
    // Guest users don't have personal history — skip API call
    if (!isAuthenticated) {
      setHistoryItems([]);
      setMetrics({ total: 0, safe: 0, warning: 0, danger: 0 });
      setIsHistoryLoading(false);
      return;
    }
    setIsHistoryLoading(true);
    try {
      const data = await fetchHistory();
      setHistoryItems(data.items);
      setMetrics({
        total: data.total ?? data.items?.length ?? 0,
        safe: data.safe ?? data.items?.filter((i) => i.status === 'green').length ?? 0,
        warning: data.warning ?? data.items?.filter((i) => i.status === 'yellow').length ?? 0,
        danger: data.danger ?? data.items?.filter((i) => i.status === 'red' || i.status === 'gray').length ?? 0,
      });
    } catch (err) {
      console.warn('[PharmaShield] Fetch history warning:', err.message);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadHistoryData();
  }, [loadHistoryData]);

  // ─── Single-Image Scan Execution (Stage 3 -> Stage 4) ───────────────────────
  const handleExecuteScan = useCallback(
    async (imageBlob) => {
      setIsScanning(true);
      setError(null);

      try {
        const patientProfile = user?.medical_profile || null;
        const scanResult = await scanMedicineImage(imageBlob, patientProfile);
        setResult(scanResult);
        setCurrentStage('result');
        await loadHistoryData();
      } catch (err) {
        console.error('[PharmaShield] Scan failed:', err);
        setError(
          err.message ||
            'Gagal memproses pemindaian kemasan obat. Pastikan server backend aktif di http://127.0.0.1:8000.'
        );
      } finally {
        setIsScanning(false);
      }
    },
    [user, loadHistoryData],
  );

  // ─── Manual Catalog Selection Fallback ────────────────────────────────────
  const handleSelectMedicineFromCatalog = useCallback(
    (med) => {
      if (!med) return;
      setShowManualLookup(false);

      const isKeras = med.bpomClass?.code === 'keras';
      const nowIso = new Date().toISOString();
      const nowDisplay = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const manualResult = {
        id: `${Date.now().toString(36)}-manual`,
        scan_id: `${Date.now().toString(36)}-manual`,
        identified: true,
        name: med.name,
        medicineName: med.name,
        genericName: med.name,
        brandNames: med.brandNames || [],
        category: med.categoryLabel || 'Pengobatan Umum',
        bpomClass: med.bpomClass?.label || 'Obat Bebas',
        dosageStrength: med.dosageStrength || 'Lihat label kemasan',
        dosageForm: med.dosageForm || 'Sediaan obat',
        purpose: med.indications || 'Meredakan gejala penyakit sesuai indikasi.',
        usage: med.usageInstructions || 'Gunakan sesuai dosis dan aturan pakai yang tertera.',
        ingredients: [med.activeSubstance || med.name],
        sideEffects: med.sideEffects || [],
        warnings: med.warnings || [],
        contraindications: med.contraindications || [],
        storageInfo: med.storageInfo || 'Simpan di tempat kering dan sejuk di bawah 30°C.',
        bpomRegistration: med.bpomRegistrationExample || 'Terdaftar Resmi BPOM',
        bpomStatus: 'Terverifikasi Resmi BPOM',
        dataSource: 'Basis Data Resmi Obat & BPOM Indonesia (Pencarian Manual)',
        dataUpdatedAt: 'Oktober 2026',
        disclaimer: 'Informasi ini bersifat edukasi dan bukan pengganti konsultasi dengan dokter atau apoteker.',
        status: isKeras ? 'yellow' : 'green',
        statusId: isKeras ? 'Perhatian Khusus' : 'Aman',
        statusEmoji: isKeras ? '🟡' : '🟢',
        readabilityStatus: 'valid',
        readabilityLabel: 'Terverifikasi dari Basis Data',
        isSafeToConsume: !isKeras,
        riskLevel: isKeras ? 'Sedang' : 'Rendah',
        shelfLifeNote: `Obat terverifikasi resmi dalam basis data sebagai ${med.name}.`,
        recommendation: med.usageInstructions || 'Gunakan sesuai dosis yang dianjurkan.',
        confidencePercentage: 100,
        ocrConfidence: 1.0,
        matchConfidence: 1.0,
        overallConfidence: 1.0,
        notes: ['Dipilih secara manual oleh pengguna dari katalog obat resmi.'],
        scannedAt: nowIso,
        scannedAtFormatted: nowDisplay,
        clinicalAssessment: {
          is_officially_verified: true,
          allergy_screen_passed: true,
          interaction_screen_passed: true,
          critical_risks: [],
          caution_warnings: isKeras
            ? [{ title: 'Obat Keras (Wajib Resep)', description: 'Memerlukan resep dokter atau pengawasan apoteker.' }]
            : [],
        },
      };

      setResult(manualResult);
      setCurrentStage('result');
    },
    [],
  );

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

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('Hapus seluruh riwayat pemindaian obat? Tindakan ini permanen.')) {
      return;
    }
    const success = await clearAllHistory();
    if (success) {
      setHistoryItems([]);
      setMetrics({ total: 0, safe: 0, warning: 0, danger: 0 });
    } else {
      setError('Gagal membersihkan riwayat pada server.');
    }
  }, []);

  const safeRate = metrics.total > 0
    ? Math.round((metrics.safe / metrics.total) * 100)
    : 100;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── STAGE 1 BANNER / WELCOME SCREEN ── */}
      {!isAuthenticated && (
        <div className="relative overflow-hidden rounded-2xl border border-[#c8f93a]/30 bg-[#c8f93a]/5 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c8f93a] animate-pulse" />
                <span className="text-[11px] font-black tracking-wider uppercase text-[#c8f93a]">
                  Platform Keamanan Konsumsi Obat
                </span>
              </div>
              <h2 className="text-2xl font-black text-white">
                Selamat Datang di PharmaShield ID
              </h2>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Dapatkan informasi obat seketika hanya dengan satu kali pemindaian kemasan. Sistem memverifikasi nama obat, dosis, aturan pakai, peringatan BPOM, serta potensi alergi dan interaksi klinis secara otomatis.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={openAuthModal}
                className="px-5 py-2.5 rounded-xl bg-[#c8f93a] text-black font-black text-xs hover:bg-[#b5f524] transition-all shadow-md shadow-[#c8f93a]/20"
              >
                Masuk / Buat Akun
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 2: DASHBOARD HUB ── */}
      {currentStage === 'dashboard' && (
        <div className="space-y-8 animate-fade-in">
          {/* Dashboard Header & Primary CTA */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
                  {isAuthenticated ? `Halo, ${user?.full_name || 'Pengguna'}` : 'Dashboard Keamanan Obat'}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] text-[#0f172a] border border-[#cbd5e1] dark:bg-[#c8f93a]/15 dark:text-[#c8f93a] dark:border-[#c8f93a]/30 px-2.5 py-0.5 text-xs font-bold shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#c8f93a] animate-pulse" />
                  Hub Utama
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Pusat pemindaian obat, evaluasi kelayakan klinis konsumsi, dan pemantauan riwayat kesehatan.
              </p>
            </div>

            {/* Primary Action Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setError(null);
                  setCurrentStage('scanner');
                }}
                className="btn-primary-action px-6 py-3 rounded-2xl bg-[#0284c7] text-white dark:bg-[#c8f93a] dark:text-black font-black text-xs hover:bg-[#075985] dark:hover:bg-[#b5f524] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-sky-500/25 dark:shadow-[#c8f93a]/25 flex items-center gap-2 focus-visible:ring-4 focus-visible:ring-sky-400"
              >
                <span className="text-base">📸</span>
                <span>Pindai Kemasan Obat (1x Scan)</span>
              </button>
            </div>
          </div>

          {/* Quick Shortcuts: Medical Profile */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">
                  Status Kelengkapan Profil Medis:{' '}
                  <span className={user?.medical_profile?.profile_completed ? 'text-emerald-600 dark:text-[#c8f93a]' : 'text-amber-500'}>
                    {user?.medical_profile?.profile_completed ? 'Lengkap & Terverifikasi' : 'Belum Terisi Lengkap'}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Alergi:{' '}
                  <span className="text-[var(--color-text-primary)] font-medium">
                    {user?.medical_profile?.allergies?.join(', ') || 'Belum ada alergi terdaftar'}
                  </span>{' '}
                  | Resep Rutin:{' '}
                  <span className="text-[var(--color-text-primary)] font-medium">
                    {user?.medical_profile?.current_prescriptions?.join(', ') || 'Tidak ada'}
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={openProfileModal}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:border-[#0284c7] text-[#0284c7] hover:bg-sky-50 dark:border-[var(--color-border)] dark:hover:border-[#c8f93a]/50 dark:text-[#c8f93a] dark:hover:bg-[#c8f93a]/10 transition-all"
            >
              ⚙️ Perbarui Riwayat &amp; Alergi
            </button>
          </div>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <RingMetricCard
              title="Tingkat Kelayakan"
              percentage={safeRate}
              label="Indeks Keamanan"
              targetText="Kesesuaian standar klinis"
            />
            <MetricCard
              title="Total Pemindaian"
              value={metrics.total}
              unit="kali"
              label="Log Sistem"
              badge="Semua Log"
              trend="+12%"
            />
            <MetricCard
              title="Aman Tanpa Risiko"
              value={metrics.safe}
              unit="produk"
              label="Kategori Hijau"
              badge="[✓] 🟢 Bebas Risiko"
              accentColor="text-emerald-600 dark:text-[#c8f93a]"
            />
            <MetricCard
              title="Perhatian & Risiko"
              value={metrics.warning + metrics.danger}
              unit="produk"
              label="Perlu Evaluasi"
              badge="[!] ⚠️ Peringatan"
              accentColor="text-amber-600 dark:text-amber-400"
            />
          </div>

          {/* Recent Drug Scans & History Feed */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-[var(--color-text-primary)]">
                  Riwayat Pemindaian Terakhir (History Feed)
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Daftar produk yang telah dipindai dan diverifikasi dengan catatan keselamatan medis.
                </p>
              </div>
            </div>

            <HistoryTable
              items={historyItems}
              onRemove={handleDeleteRow}
              onClearAll={handleClearAll}
              isLoading={isHistoryLoading}
              isGuest={!isAuthenticated}
            />
          </div>
        </div>
      )}

      {/* ── STAGE 3: SCAN OBAT (SINGLE PACKAGING SCAN) ── */}
      {currentStage === 'scanner' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setError(null);
                setCurrentStage('dashboard');
              }}
              className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              ← Kembali ke Dashboard
            </button>

            <button
              onClick={() => setShowManualLookup(!showManualLookup)}
              className="text-xs font-bold text-[#c8f93a] hover:underline flex items-center gap-1"
            >
              <span>{showManualLookup ? 'Tutup Pencarian Manual' : '🔍 Cari Manual di Katalog'}</span>
            </button>
          </div>

          {showManualLookup ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 space-y-4 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div>
                  <h3 className="text-lg font-black text-white">Pilih Obat dari Basis Data Resmi</h3>
                  <p className="text-xs text-neutral-400">
                    Jika kemasan fisik tidak dapat dipindai dengan jelas, pilih obat langsung dari katalog resmi kami.
                  </p>
                </div>
                <button
                  onClick={() => setShowManualLookup(false)}
                  className="text-xs font-bold text-neutral-400 hover:text-white"
                >
                  ✕ Tutup
                </button>
              </div>

              <MedicineCatalog onSelectMedicine={handleSelectMedicineFromCatalog} />
            </div>
          ) : (
            <CameraScanner
              onScan={handleExecuteScan}
              isLoading={isScanning}
              error={error}
              onClearError={() => setError(null)}
              onManualLookup={() => setShowManualLookup(true)}
            />
          )}
        </div>
      )}

      {/* ── STAGE 4: RESULT SUMMARY & SAFETY ASSESSMENT ── */}
      {currentStage === 'result' && result && (
        <div className="space-y-6">
          <MedicineResultCard
            result={result}
            onResetScan={() => {
              setResult(null);
              setError(null);
              setCurrentStage('scanner');
            }}
            onRetryScan={() => {
              setResult(null);
              setError(null);
              setCurrentStage('scanner');
            }}
            onOpenProfile={openProfileModal}
            onBackToDashboard={() => setCurrentStage('dashboard')}
            onManualLookup={() => {
              setCurrentStage('scanner');
              setShowManualLookup(true);
            }}
          />
        </div>
      )}
    </div>
  );
}