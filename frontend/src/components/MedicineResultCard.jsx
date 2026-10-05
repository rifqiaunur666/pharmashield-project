/**
 * src/components/MedicineResultCard.jsx
 * PharmaShield — Result card displaying all medicine evaluation data.
 * Includes TTS via Web Speech API (Indonesian id-ID).
 *
 * Props:
 *   result: NormalisedResult (from src/lib/api.js normalizeResult)
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import StatusBadge, { STATUS } from './StatusBadge';
import { buildSpeechText, speak, cancelSpeech } from '@/lib/voiceService';

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t)
    ? s
    : new Date(t).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5">
      <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400">{title}</h4>
      <div className="text-sm leading-relaxed text-neutral-700">{children}</div>
    </div>
  );
}

function ItemList({ items }) {
  if (!items?.length)
    return <p className="text-neutral-400 italic text-sm">Tidak ada informasi.</p>;
  return (
    <ul className="space-y-1 pl-4 list-disc marker:text-neutral-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedicineResultCard({ result }) {
  const [speaking, setSpeaking] = useState(false);

  // Cancel speech whenever a new result arrives
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
      rate: 0.9,
      onEnd: () => setSpeaking(false),
    });
    setSpeaking(true);
  }, [speaking, result]);

  // ── Not identified ────────────────────────────────────────────────────────
  if (!result.identified) {
    return (
      <div className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white p-6 space-y-2 text-center">
        <span className="text-3xl" aria-hidden="true">🔍</span>
        <h3 className="text-base font-extrabold">Obat Tidak Dikenali</h3>
        <p className="text-sm text-neutral-500 max-w-xs mx-auto">
          Kemasan tidak dapat diidentifikasi. Pastikan label terlihat jelas,
          lalu coba pindai ulang atau konsultasikan dengan apoteker.
        </p>
      </div>
    );
  }

  const statusConfig = STATUS[result.status] ?? STATUS.yellow;
  const formattedExpiry = formatDate(result.expiryDate);

  return (
    <article className="animate-fade-in space-y-5 rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">

      {/* ── Header: name + status badge ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-2xl font-extrabold tracking-tight text-black truncate">
            {result.name}
          </h3>
          {result.purpose && (
            <p className="mt-1 text-sm text-neutral-500 leading-snug">{result.purpose}</p>
          )}
        </div>
        <StatusBadge status={result.status} />
      </header>

      {/* ── Status note banner ── */}
      <p className="text-sm font-medium text-neutral-700 bg-neutral-50 border border-slate-200 rounded-xl px-4 py-3">
        {statusConfig.note}
      </p>

      {/* ── Expiry date ── */}
      {formattedExpiry ? (
        <div
          className={[
            'rounded-xl px-4 py-3.5 text-sm font-semibold flex items-center gap-2.5',
            result.expired
              ? 'bg-black text-white'
              : 'border border-slate-200 text-neutral-800',
          ].join(' ')}
          role="alert"
          aria-live="polite"
        >
          <span aria-hidden="true">{result.expired ? '⛔' : '📅'}</span>
          {result.expired
            ? `Kedaluwarsa pada ${formattedExpiry}. Jangan digunakan!`
            : `Berlaku hingga ${formattedExpiry}`}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3.5 text-sm text-neutral-500 flex items-center gap-2.5">
          <span aria-hidden="true">⚠️</span>
          Tanggal kedaluwarsa tidak terbaca — periksa langsung pada kemasan.
        </div>
      )}

      {/* ── Detail sections grid ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Kandungan Aktif">
          <ItemList items={result.ingredients} />
        </Section>

        <Section title="Aturan Penggunaan">
          {result.usage
            ? result.usage
            : <span className="text-neutral-400 italic">Tidak ada informasi.</span>}
        </Section>

        <Section title="Efek Samping">
          <ItemList items={result.sideEffects} />
        </Section>

        <Section title="Peringatan">
          <ItemList items={result.warnings} />
        </Section>
      </div>

      {/* ── TTS Button ── */}
      <button
        onClick={toggleSpeech}
        aria-pressed={speaking}
        className={[
          'w-full rounded-xl px-5 py-3.5 text-sm font-bold transition-all duration-150',
          'flex items-center justify-center gap-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2',
          speaking
            ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
            : 'bg-black text-white hover:bg-neutral-800 active:scale-[0.98]',
        ].join(' ')}
      >
        <span aria-hidden="true">{speaking ? '⏹' : '🔊'}</span>
        {speaking ? 'Hentikan Suara' : 'Bacakan Hasil'}
      </button>
    </article>
  );
}