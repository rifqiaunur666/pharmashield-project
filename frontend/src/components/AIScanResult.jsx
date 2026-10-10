/**
 * src/components/AIScanResult.jsx
 * PharmaShield — AI Vision Scanner Result Card.
 *
 * Displays structured drug info with 3-color safety indicator:
 *   🟢 Hijau  → Obat Bebas (Aman)
 *   🟡 Kuning → Obat Bebas Terbatas (Hati-hati)
 *   🔴 Merah  → Obat Keras (Berbahaya tanpa Resep)
 */
'use client';

import { useEffect, useRef } from 'react';

// ─── Color Config Map ─────────────────────────────────────────────────────────
const COLOR_CONFIG = {
  Hijau: {
    emoji: '🟢',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    badge: 'bg-emerald-500 text-white',
    headerBg: 'bg-emerald-500',
    text: 'text-emerald-900',
    accent: 'text-emerald-700',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    pulseDot: 'bg-emerald-400',
    label: 'Aman',
  },
  Kuning: {
    emoji: '🟡',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    badge: 'bg-amber-500 text-white',
    headerBg: 'bg-amber-500',
    text: 'text-amber-900',
    accent: 'text-amber-700',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    pulseDot: 'bg-amber-400',
    label: 'Hati-hati',
  },
  Merah: {
    emoji: '🔴',
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    badge: 'bg-rose-600 text-white',
    headerBg: 'bg-rose-600',
    text: 'text-rose-950',
    accent: 'text-rose-700',
    ring: 'ring-rose-200',
    dot: 'bg-rose-600',
    pulseDot: 'bg-rose-500',
    label: 'Berbahaya',
  },
};

const DEFAULT_CONFIG = COLOR_CONFIG.Kuning;

function SuggestedQuestionChip({ question, onClick }) {
  return (
    <button
      onClick={() => onClick(question)}
      className="text-left px-3 py-2 text-xs rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-300 transition-all font-medium leading-relaxed"
    >
      💬 {question}
    </button>
  );
}

export default function AIScanResult({ result, onAskQuestion }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (result && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  if (!result) return null;

  // FAILED detection
  if (result.detection_status === 'FAILED') {
    return (
      <div
        className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-3 shadow-xs"
        ref={cardRef}
      >
        <span className="text-4xl block" aria-hidden="true">🔍</span>
        <h3 className="font-extrabold text-neutral-800 text-base">Deteksi Tidak Berhasil</h3>
        <p className="text-sm text-neutral-600 max-w-sm mx-auto leading-relaxed">
          {result.error_message || 'Nama obat tidak terdeteksi. Harap ambil foto ulang dengan memperlihatkan nama kemasan secara fokus dan terang.'}
        </p>
        {result.requires_api_key && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 text-left space-y-1">
            <p className="font-bold">⚙️ Konfigurasi GEMINI_API_KEY diperlukan:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Buka <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-semibold">Google AI Studio</a> dan buat API key gratis.</li>
              <li>Salin key tersebut ke <code className="bg-amber-100 px-1 rounded font-mono">backend/.env</code>:</li>
              <li><code className="bg-amber-100 px-1 rounded font-mono text-amber-900">GEMINI_API_KEY=AIza...</code></li>
              <li>Restart server backend: <code className="bg-amber-100 px-1 rounded font-mono">python -m uvicorn app.main:app --reload</code></li>
            </ol>
          </div>
        )}
      </div>
    );
  }

  const d = result.data;
  if (!d) return null;

  const cfg = COLOR_CONFIG[d.status_color] || DEFAULT_CONFIG;

  return (
    <article
      ref={cardRef}
      className={`animate-fade-in rounded-2xl border ${cfg.border} bg-white shadow-sm overflow-hidden`}
      aria-label={`Hasil deteksi: ${d.drug_name}`}
    >
      {/* ── Color-coded Header Bar ── */}
      <div className={`${cfg.headerBg} px-5 py-4 text-white`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl" aria-hidden="true">{cfg.emoji}</span>
              <span className="text-xs font-extrabold uppercase tracking-wider opacity-90">
                {d.drug_category}
              </span>
            </div>
            <h3 className="text-xl font-extrabold tracking-tight leading-tight">
              {d.drug_name}
            </h3>
            <p className="text-sm opacity-85 mt-0.5 font-medium">
              Zat Aktif: {d.active_ingredient}
            </p>
          </div>
          {/* Status pill */}
          <div className="shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-extrabold backdrop-blur-sm">
              {cfg.emoji} {cfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body Content ── */}
      <div className="p-5 space-y-4">

        {/* Status Label Banner */}
        <div className={`rounded-xl ${cfg.bg} border ${cfg.border} px-4 py-3 flex items-start gap-3`}>
          <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">{cfg.emoji}</span>
          <div>
            <p className={`text-xs font-extrabold uppercase tracking-wider ${cfg.accent}`}>
              Status Keamanan
            </p>
            <p className={`text-sm font-bold mt-0.5 ${cfg.text}`}>
              {d.status_label}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            📋 Deskripsi Obat
          </h4>
          <p className="text-sm text-neutral-700 leading-relaxed">{d.description}</p>
        </div>

        {/* BPOM & Medicine Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="font-semibold text-neutral-500">Nomor Registrasi BPOM:</span>
            <p className="font-bold text-neutral-800 mt-0.5">{result.nomor_registrasi_bpom || d.bpom_registration || 'Terdaftar Resmi BPOM'}</p>
          </div>
          <div>
            <span className="font-semibold text-neutral-500">Status Registrasi:</span>
            <p className="font-bold text-emerald-700 mt-0.5">{result.status_registrasi || d.bpom_status || 'Terverifikasi'}</p>
          </div>
          <div>
            <span className="font-semibold text-neutral-500">Kekuatan Dosis:</span>
            <p className="font-bold text-neutral-800 mt-0.5">{result.kekuatan_dosis || d.dosage_strength || '-'}</p>
          </div>
          <div>
            <span className="font-semibold text-neutral-500">Bentuk Sediaan:</span>
            <p className="font-bold text-neutral-800 mt-0.5">{result.bentuk_sediaan || d.dosage_form || '-'}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="font-semibold text-neutral-500">Aturan Penggunaan:</span>
            <p className="text-neutral-800 mt-0.5 leading-relaxed">{result.aturan_penggunaan || d.usage || '-'}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="font-semibold text-neutral-500">Informasi Penyimpanan:</span>
            <p className="text-neutral-700 mt-0.5">{result.informasi_penyimpanan || d.storage_info || 'Simpan di bawah suhu 30°C.'}</p>
          </div>
        </div>

        {/* Quick Warning */}
        {(d.quick_warning || result.peringatan_keselamatan) && (
          <div className={`rounded-xl border ${
            d.status_color === 'Merah'
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : d.status_color === 'Kuning'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          } px-4 py-3`}>
            <p className="text-xs font-extrabold uppercase tracking-wider mb-1 opacity-70">
              ⚠️ Peringatan Keselamatan
            </p>
            <p className="text-sm font-medium leading-relaxed">{result.peringatan_keselamatan || d.quick_warning}</p>
          </div>
        )}

        {/* Merah-specific hard warning */}
        {d.status_color === 'Merah' && (
          <div className="rounded-xl border-2 border-rose-500 bg-rose-600 text-white px-4 py-3 flex items-start gap-3">
            <span className="text-2xl shrink-0" aria-hidden="true">🚨</span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider opacity-90">
                PERINGATAN KERAS
              </p>
              <p className="text-sm font-semibold mt-1 leading-relaxed">
                Obat ini termasuk <strong>Obat Keras / Perlu Resep Dokter</strong>. Jangan membeli atau mengonsumsinya tanpa instruksi profesional kesehatan.
              </p>
            </div>
          </div>
        )}

        {/* Suggested Questions → triggers chatbot */}
        {d.suggested_questions?.length > 0 && onAskQuestion && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              💬 Tanyakan ke Chatbot AI
            </h4>
            <div className="flex flex-col gap-2">
              {d.suggested_questions.map((q, i) => (
                <SuggestedQuestionChip key={i} question={q} onClick={onAskQuestion} />
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[11px] text-neutral-400 leading-relaxed border-t border-slate-100 pt-3">
          ℹ️ Informasi ini bersifat edukasi berbasis data BPOM Indonesia. Selalu konsultasikan dengan dokter atau apoteker untuk penanganan medis yang tepat.
        </p>
      </div>
    </article>
  );
}
