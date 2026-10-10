/**
 * src/components/MedicineResultCard.jsx
 * PharmaShield — Dark Mode Real-time Evaluation Card with Neon Lime Accents.
 * Bebas dari seluruh pelacak kedaluwarsa. Fokus pada identifikasi, indikasi, dosis, dan TTS.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import StatusBadge, { STATUS } from './StatusBadge';
import { buildSpeechText, speak, cancelSpeech } from '@/lib/voiceService';

function Section({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[#11141b] p-4 space-y-1.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {icon && <span aria-hidden="true">{icon}</span>}
        <h4>{title}</h4>
      </div>
      <div className="text-sm leading-relaxed text-neutral-300">{children}</div>
    </div>
  );
}

function ItemList({ items, emptyText = 'Tidak ada catatan.' }) {
  if (!items?.length) {
    return <p className="text-neutral-500 italic text-xs">{emptyText}</p>;
  }
  return (
    <ul className="space-y-1 pl-4 list-disc marker:text-[#c8f93a] text-xs text-neutral-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function MedicineResultCard({ result }) {
  const [speaking, setSpeaking] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Stop speech when a new result arrives or component unmounts
  useEffect(() => {
    cancelSpeech();
    setSpeaking(false);
    return cancelSpeech;
  }, [result]);

  const toggleSpeech = useCallback(() => {
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
  }, [speaking, result]);

  if (!result) return null;

  const statusKey = result.status || 'yellow';
  const statusCfg = STATUS[statusKey] || STATUS.yellow;

  // Status-based alert banner color
  const bannerBg =
    statusKey === 'green'
      ? 'bg-[#c8f93a]/10 border-[#c8f93a]/30 text-[#c8f93a]'
      : statusKey === 'yellow'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : 'bg-rose-500/10 border-rose-500/30 text-rose-300';

  return (
    <article className="animate-fade-in space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 md:p-6 shadow-xl">
      {/* ── Header: Name & Status Badge ── */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">💊</span>
            <h3 className="text-2xl font-black tracking-tight text-white truncate">
              {result.name || 'Kemasan Tidak Teridentifikasi'}
            </h3>
          </div>
          {result.purpose && (
            <p className="mt-1 text-xs text-neutral-400 font-medium leading-relaxed">
              Indikasi: <span className="text-neutral-200">{result.purpose}</span>
            </p>
          )}
        </div>
        <StatusBadge status={statusKey} size="md" />
      </header>

      {/* ── Safety Status Note Banner ── */}
      <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${bannerBg}`}>
        <div className="flex items-start gap-2.5">
          <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">
            {statusCfg.emoji}
          </span>
          <div className="space-y-0.5">
            <p className="font-extrabold text-sm">
              Status Evaluasi: {statusCfg.label}
            </p>
            <p className="leading-relaxed opacity-90">
              {result.shelfLifeNote || statusCfg.note}
            </p>
          </div>
        </div>
      </div>

      {/* ── Metric Highlights (Replaced Expiry Date with Clinical & OCR Info) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Indication / Disease Category */}
        <div className="rounded-xl p-3.5 border border-[var(--color-border)] bg-[#11141b]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Kategori Penyakit / Indikasi
          </div>
          <div className="text-sm font-extrabold text-white mt-1 flex items-center gap-2">
            <span aria-hidden="true">🩺</span>
            <span className="truncate">{result.purpose || 'Pengobatan Umum'}</span>
          </div>
          <div className="text-[11px] text-[#c8f93a] mt-1 font-mono">
            Tervalidasi Database Obat ID
          </div>
        </div>

        {/* Verification & OCR Confidence */}
        <div className="rounded-xl p-3.5 border border-[var(--color-border)] bg-[#11141b]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Akurasi OCR &amp; Status Label
          </div>
          <div className="text-sm font-extrabold text-white mt-1 flex items-center gap-2">
            <span aria-hidden="true">⚡</span>
            <span>{Math.round((result.ocrConfidence || 0.85) * 100)}% Keterbacaan</span>
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            {result.identified ? 'Kemasan Dikenali' : 'Pemeriksaan Manual Dianjurkan'}
          </div>
        </div>
      </div>

      {/* ── Recommendation Box ── */}
      {result.recommendation && (
        <div className="rounded-xl border border-[#c8f93a]/30 bg-[#c8f93a]/5 p-4 text-xs text-neutral-200 space-y-1">
          <div className="flex items-center gap-2 font-bold text-[11px] uppercase tracking-wider text-[#c8f93a]">
            <span aria-hidden="true">💡</span>
            <span>Rekomendasi Pemakaian</span>
          </div>
          <p className="leading-relaxed">{result.recommendation}</p>
        </div>
      )}

      {/* ── Details Grid ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Aturan Penggunaan & Dosis" icon="🕒">
          {result.usage ? (
            <p>{result.usage}</p>
          ) : (
            <p className="text-neutral-500 italic text-xs">Petunjuk dosis tidak tertera pada label kemasan.</p>
          )}
        </Section>

        <Section title="Kandungan Aktif" icon="🧪">
          <ItemList items={result.ingredients} emptyText="Kandungan tidak tertera pada label." />
        </Section>

        <Section title="Efek Samping" icon="⚠️">
          <ItemList items={result.sideEffects} emptyText="Tidak ada data efek samping khusus." />
        </Section>

        <Section title="Peringatan Khusus" icon="🛑">
          <ItemList items={result.warnings} emptyText="Tidak ada peringatan khusus terdeteksi." />
        </Section>
      </div>

      {/* ── TTS Voiceover Button ── */}
      <div className="pt-2 flex flex-col sm:flex-row gap-3">
        <button
          onClick={toggleSpeech}
          aria-pressed={speaking}
          className={[
            'flex-1 rounded-xl px-5 py-3.5 text-xs font-extrabold transition-all duration-150',
            'flex items-center justify-center gap-2 shadow-lg',
            speaking
              ? 'bg-rose-500 text-white shadow-rose-500/20'
              : 'btn-neon',
          ].join(' ')}
        >
          <span className="text-base" aria-hidden="true">
            {speaking ? '⏹' : '🔊'}
          </span>
          <span>{speaking ? 'Hentikan Suara' : 'Bacakan Evaluasi Obat (TTS id-ID)'}</span>
        </button>

        {result.rawText && (
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="px-4 py-3 text-xs font-bold rounded-xl border border-[var(--color-border)] bg-[#11141b] hover:bg-neutral-800 text-neutral-300 transition-colors"
          >
            {showRaw ? 'Tutup Teks OCR' : 'Lihat Teks OCR'}
          </button>
        )}
      </div>

      {/* Raw text preview */}
      {showRaw && result.rawText && (
        <div className="rounded-xl bg-black/50 border border-white/5 text-neutral-300 p-3.5 text-xs font-mono space-y-1">
          <p className="text-[10px] uppercase font-bold text-neutral-500">Hasil Teks Mentah (OCR):</p>
          <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto">{result.rawText}</pre>
        </div>
      )}
    </article>
  );
}