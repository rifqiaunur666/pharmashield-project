/**
 * src/components/MedicineResultCard.jsx
 * PharmaShield — Stage 4 Result Summary & Safety Assessment.
 *
 * Implements:
 * - 4-State Safety Routing (🟢 GREEN, 🟡 YELLOW, 🔴 RED, ⚪ GRAY)
 * - Complete Verified Drug Information:
 *   - Nama obat & Merek / nama generik
 *   - Kandungan / zat aktif
 *   - Kekuatan dosis tercantum & Bentuk sediaan
 *   - Kegunaan / indikasi terverifikasi
 *   - Aturan penggunaan & Rekomendasi
 *   - Peringatan serta kontraindikasi
 *   - Efek samping umum
 *   - Informasi penyimpanan
 *   - Nomor registrasi BPOM & Status registrasi
 *   - Sumber informasi & Waktu pembaruan data
 *   - Disclaimer medis resmi
 * - User Actions: Scan Obat Lain, Scan Ulang, Kembali ke Dashboard, Lihat Detail di Katalog, Tinjau Profil Medis.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { buildSpeechText, speak, cancelSpeech } from '@/lib/voiceService';
import ConfidenceScorePanel from '@/components/ConfidenceScorePanel';

export default function MedicineResultCard({
  result,
  onResetScan,
  onRetryScan,
  onOpenProfile,
  onBackToDashboard,
  onManualLookup,
}) {
  const [speaking, setSpeaking] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [reported, setReported] = useState(false);

  if (!result) return null;

  const clinical = result.clinicalAssessment || {};
  const statusKey = result.status || 'yellow'; // 'green' | 'yellow' | 'red' | 'gray'

  const toggleSpeech = () => {
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
      return;
    }
    const text = buildSpeechText(result);
    speak(text, {
      rate: 0.92,
      onEnd: () => setSpeaking(false),
    });
    setSpeaking(true);
  };

  // State Themes with explicit Dual Encoding (colors + symbols)
  const stateThemes = {
    green: {
      border: 'border-emerald-300 dark:border-emerald-500/40',
      bg: 'bg-emerald-50 dark:bg-emerald-950/25',
      text: 'text-emerald-900 dark:text-[#10b981]',
      badge: 'bg-emerald-700 text-white dark:bg-[#10b981] dark:text-[#0f172a] font-black',
      symbol: '[✓]',
      title: 'Obat Terverifikasi — Layak Konsumsi Sesuai Aturan',
      sub: 'Kemasan terverifikasi valid dan tidak ditemukan konflik alergi, kontraindikasi, atau interaksi klinis berisiko pada profil Anda.',
    },
    yellow: {
      border: 'border-amber-300 dark:border-amber-500/40',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      text: 'text-amber-950 dark:text-amber-300',
      badge: 'bg-amber-500 text-slate-950 font-black',
      symbol: '[!]',
      title: 'Perhatian Khusus / Evaluasi Lebih Lanjut Diperlukan',
      sub: 'Terdapat catatan perhatian: golongan obat keras/resep dokter, profil medis parsial, atau potensi interaksi ringan yang perlu diperhatikan.',
    },
    red: {
      border: 'border-rose-400 dark:border-red-600/50',
      bg: 'bg-rose-50 dark:bg-red-950/40',
      text: 'text-rose-950 dark:text-rose-200',
      badge: 'bg-red-600 text-white font-black',
      symbol: '[⚠]',
      title: 'JANGAN KONSUMSI HINGGA RISIKO KESELAMATAN TERATASI',
      sub: 'Konflik keselamatan kritis terdeteksi: riwayat alergi obat, kontraindikasi penyakit yang Anda miliki, atau interaksi obat mayor.',
    },
    gray: {
      border: 'border-slate-300 dark:border-neutral-500/40',
      bg: 'bg-slate-100 dark:bg-neutral-800/40',
      text: 'text-slate-900 dark:text-neutral-300',
      badge: 'bg-slate-700 text-white font-bold',
      symbol: '[?]',
      title: 'Identitas Obat Belum Dapat Dipastikan Secara Aman',
      sub: 'Hasil pemindaian kemasan obat buram, kurang pencahayaan, atau tidak cocok dengan database resmi. Jangan mengonsumsi obat ini semata berdasarkan hasil scan.',
    },
  };

  const theme = stateThemes[statusKey] || stateThemes.yellow;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Status Banner (Stage 4 Classification) ── */}
      <div className={`rounded-2xl border p-6 ${theme.border} ${theme.bg} shadow-md space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{result.statusEmoji}</span>
            <div>
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${theme.badge}`}>
                <span>{theme.symbol}</span>
                <span>Status Evaluasi: {result.statusId}</span>
              </span>
              <h2 className={`text-lg sm:text-xl font-black mt-1 ${theme.text}`}>
                {theme.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSpeech}
              className="px-3.5 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>{speaking ? '🔇 Stop Suara' : '🔊 Dengar Penjelasan'}</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-700 dark:text-neutral-300 leading-relaxed max-w-3xl">
          {result.shelfLifeNote || theme.sub}
        </p>

        {statusKey === 'red' && (
          <div className="rounded-xl bg-rose-100 border border-rose-300 text-rose-950 dark:bg-rose-950/60 dark:border-rose-500/30 dark:text-rose-200 p-3.5 text-xs font-bold leading-relaxed">
            🚨 Panduan Darurat: Jika Anda atau pasien telah mengonsumsi obat ini dan mengalami gejala sesak napas, ruam gatal berat, atau pusing mendadak, segera hubungi IGD / 119 atau kunjungi fasilitas kesehatan terdekat.
          </div>
        )}

        {statusKey === 'gray' && (
          <div className="rounded-xl bg-slate-200/90 border border-slate-300 text-slate-800 dark:bg-neutral-900/90 dark:border-neutral-700 dark:text-neutral-300 p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900 dark:text-white">Butuh informasi obat sekarang?</p>
              <p className="text-[11px] text-slate-600 dark:text-neutral-400 mt-0.5">
                Anda dapat memindai ulang dengan pencahayaan lebih jelas atau memasukkan nama obat secara manual dari basis data kami.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onRetryScan || onResetScan}
                className="px-3 py-1.5 rounded-lg bg-slate-300 hover:bg-slate-400 text-slate-900 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white text-xs font-bold transition-all"
              >
                🔄 Scan Ulang
              </button>
              {onManualLookup && (
                <button
                  onClick={onManualLookup}
                  className="px-3 py-1.5 rounded-lg bg-[#0284c7] text-white hover:bg-[#0369a1] dark:bg-[#c8f93a] dark:text-black dark:hover:bg-[#b5f524] text-xs font-black transition-all"
                >
                  🔍 Masukkan Nama Manual
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Medication Identity Card (Tahap D Requirements) ── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4 border-b border-slate-200 dark:border-white/5 pb-3 sm:pb-4">
          <div className="min-w-0 w-full">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400">
              Identitas Produk Farmasi
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-[var(--color-text-primary)] mt-0.5 break-words">
              {result.name || 'Kemasan Tidak Teridentifikasi'}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
              Nama Generik: <span className="text-[var(--color-text-primary)] font-bold">{result.genericName || result.name}</span> <span className="hidden xs:inline">|</span><br className="xs:hidden" /> Golongan BPOM: <span className="text-[#0284c7] dark:text-[#c8f93a] font-bold">{result.bpomClass}</span>
            </p>
            {result.brandNames?.length > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5 break-words">
                Merek / Alias Terdata: <span className="text-slate-700 dark:text-neutral-300">{result.brandNames.join(', ')}</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Confidence Score & AI Reasoning Panel ── */}
        <ConfidenceScorePanel result={result} />

        {/* Clinical Form & Strength Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">Kekuatan Dosis</span>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{result.dosageStrength || 'Sesuai Label Kemasan'}</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">Bentuk Sediaan</span>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{result.dosageForm || 'Sediaan Farmasi'}</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">Nomor Registrasi BPOM</span>
            <p className="text-sm font-bold text-[#0284c7] dark:text-[#c8f93a] font-mono">{result.bpomRegistration || 'Pemeriksaan Fisik Diperlukan'}</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">Status Registrasi</span>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{result.bpomStatus || 'Terdaftar Resmi BPOM'}</p>
          </div>
        </div>

        {/* Clinical Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1.5">
            <span className="font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider text-[10px]">Indikasi Medis &amp; Kegunaan Terverifikasi</span>
            <p className="text-slate-700 dark:text-neutral-200 leading-relaxed">{result.purpose || 'Informasi indikasi umum.'}</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1.5">
            <span className="font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider text-[10px]">Aturan Penggunaan &amp; Rekomendasi</span>
            <p className="text-slate-700 dark:text-neutral-200 leading-relaxed">{result.usage || result.recommendation || 'Gunakan sesuai petunjuk apoteker atau dokter.'}</p>
          </div>
        </div>

        {/* Ingredients & Storage Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-2">
            <span className="font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider text-[10px]">Kandungan &amp; Zat Aktif</span>
            <div className="flex flex-wrap gap-2">
              {result.ingredients?.length > 0 ? (
                result.ingredients.map((ing, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-white/5 font-medium">
                    🧪 {ing}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 dark:text-neutral-400 italic">Lihat komposisi pada brosur kemasan obat.</span>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1.5">
            <span className="font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider text-[10px]">Informasi Penyimpanan</span>
            <p className="text-slate-700 dark:text-neutral-200 leading-relaxed">
              📦 {result.storageInfo || 'Simpan di tempat kering dan sejuk di bawah 30°C, terlindung dari sinar matahari langsung.'}
            </p>
          </div>
        </div>

        {/* Side Effects & Contraindications */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {result.sideEffects?.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e] space-y-1.5">
              <span className="font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider text-[10px]">Efek Samping Umum</span>
              <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-neutral-300">
                {result.sideEffects.map((ef, i) => (
                  <li key={i}>{ef}</li>
                ))}
              </ul>
            </div>
          )}

          {result.contraindications?.length > 0 && (
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/5 space-y-1.5">
              <span className="font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider text-[10px]">Kontraindikasi yang Diketahui</span>
              <ul className="list-disc pl-4 space-y-1 text-rose-900 dark:text-rose-200 font-medium">
                {result.contraindications.map((ci, i) => (
                  <li key={i}>{ci}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Warnings */}
        {result.warnings?.length > 0 && (
          <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 space-y-2 text-xs">
            <span className="font-black text-amber-950 dark:text-amber-200">⚠️ Peringatan Keselamatan Penting:</span>
            <ul className="list-disc pl-4 space-y-1 text-amber-900 dark:text-amber-300 font-medium">
              {result.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Official Medical Disclaimer */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 text-[11px] text-slate-600 dark:text-neutral-400 space-y-1">
          <p className="font-semibold text-slate-800 dark:text-neutral-300">ℹ️ Penafian Medis Resmi (Medical Disclaimer):</p>
          <p className="leading-relaxed">
            {result.disclaimer || 'Informasi yang disajikan bersumber dari basis data obat dan referensi resmi BPOM Indonesia. Informasi ini bersifat edukatif dan bukan pengganti diagnosis, resep, atau konsultasi langsung dengan dokter atau apoteker. Jangan mengubah takaran obat tanpa petunjuk klinis memadai.'}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/5 text-[10px] text-slate-500 dark:text-neutral-500">
            <span>Sumber: {result.dataSource || 'Basis Data Resmi Obat & BPOM Indonesia'}</span>
            <span>Pembaruan: {result.dataUpdatedAt || 'Oktober 2026'}</span>
          </div>
        </div>
      </div>

      {/* ── Result Transparency Panel ── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-3">
          <h4 className="text-sm font-black text-[var(--color-text-primary)] flex items-center gap-2">
            <span>🔍</span>
            <span>Panel Transparansi Bukti &amp; Evaluasi Klinis (AI Evidence Audit)</span>
          </h4>
          <span className="text-[10px] text-slate-500 dark:text-neutral-500 font-mono">
            ID: {result.id?.slice(0, 8)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e]">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">1. Ekstraksi OCR</span>
            <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
              {result.ocrConfidence > 0.4 ? '✅ Terbaca Jelas' : '⚠️ Terbatas'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Skor Teks: {Math.round(result.ocrConfidence * 100)}%</p>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e]">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">2. Referensi BPOM</span>
            <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
              {clinical.is_officially_verified ? '✅ Terverifikasi' : '⚠️ Terdaftar'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Basis data obat resmi ID</p>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e]">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">3. Skrining Alergi</span>
            <p className={`text-sm font-bold mt-1 ${clinical.allergy_screen_passed !== false ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
              {clinical.allergy_screen_passed !== false ? '✅ Tidak Ada Konflik' : '🚨 Terdeteksi Alergi'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Dicek ke profil medis Anda</p>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12151e]">
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-bold">4. Skrining Interaksi</span>
            <p className={`text-sm font-bold mt-1 ${clinical.interaction_screen_passed !== false ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {clinical.interaction_screen_passed !== false ? '✅ Interaksi Aman' : '⚠️ Perlu Perhatian'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Riwayat resep &amp; OTC</p>
          </div>
        </div>

        {/* Detailed Critical or Caution List */}
        {clinical.critical_risks?.length > 0 && (
          <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 space-y-2 text-xs">
            <span className="font-black text-rose-950 dark:text-rose-200">Temuan Risiko Kritis:</span>
            {clinical.critical_risks.map((risk, idx) => (
              <div key={idx} className="border-t border-rose-200 dark:border-rose-500/20 pt-2 text-rose-900 dark:text-rose-300">
                <p className="font-bold">{risk.title}</p>
                <p className="mt-0.5">{risk.description}</p>
                <p className="text-rose-950 dark:text-white font-bold mt-1">Saran: {risk.action}</p>
              </div>
            ))}
          </div>
        )}

        {clinical.caution_warnings?.length > 0 && (
          <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 space-y-2 text-xs">
            <span className="font-black text-amber-950 dark:text-amber-200">Catatan Perhatian Khusus:</span>
            {clinical.caution_warnings.map((warn, idx) => (
              <div key={idx} className="border-t border-amber-200 dark:border-amber-500/20 pt-2 text-amber-950 dark:text-amber-300">
                <p className="font-bold">{warn.title}</p>
                <p className="mt-0.5">{warn.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Raw OCR Toggle */}
        <div className="pt-2">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[11px] text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white underline"
          >
            {showRaw ? 'Sembunyikan Teks Mentah OCR' : 'Lihat Teks Mentah Hasil OCR Kemasan'}
          </button>
          {showRaw && (
            <pre className="mt-2 p-3 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 text-[10px] text-slate-800 dark:text-neutral-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
              {result.rawText || 'Tidak ada teks mentah tercatat.'}
            </pre>
          )}
        </div>
      </div>

      {/* ── Action Buttons (Tahap E Requirements) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onBackToDashboard}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 text-slate-700 dark:text-neutral-300 text-xs font-bold transition-all shadow-sm"
          >
            ← Kembali ke Dashboard
          </button>
          <button
            onClick={onResetScan}
            className="px-5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] font-black text-xs transition-all shadow-md flex items-center gap-1.5"
          >
            <span>📸</span>
            <span>Scan Obat Lain</span>
          </button>
          <button
            onClick={onRetryScan || onResetScan}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 text-slate-700 dark:text-white text-xs font-bold transition-all shadow-sm"
          >
            🔄 Scan Ulang
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/medicines"
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 hover:border-[#0284c7] hover:text-[#0284c7] dark:hover:border-[#10b981]/40 dark:hover:text-[#10b981] text-slate-700 dark:text-neutral-300 text-xs font-bold transition-all shadow-sm"
          >
            📋 Lihat Detail di Katalog
          </Link>
          <button
            onClick={onOpenProfile}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 text-slate-700 dark:text-white text-xs font-bold transition-all shadow-sm"
          >
            👤 Tinjau Profil Medis
          </button>
          <button
            onClick={() => setReported(true)}
            disabled={reported}
            className="px-4 py-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 text-xs font-bold transition-all shadow-sm"
          >
            {reported ? '✓ Laporan Terkirim' : '🚩 Laporkan Diskrepansi'}
          </button>
        </div>
      </div>
    </div>
  );
}