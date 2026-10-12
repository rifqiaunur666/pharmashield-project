/**
 * src/components/ConfidenceScorePanel.jsx
 * PharmaShield — AI Confidence Score & Reasoning Panel.
 *
 * Renders the "CONFIDENCE SCORE" block with:
 *  - Animated percentage display (Akurasi: 98%)
 *  - Tier status badge (Terverifikasi Akurat / Konfirmasi Sebagian / Tidak Terdeteksi)
 *  - Expandable AI Analysis Summary with factor breakdown bars
 *  - Retake advice banner (auto-shown when pct < 70)
 *  - "Detail Analisis AI" collapsible detail pane
 *
 * Usage:
 *   <ConfidenceScorePanel result={result} />
 */
'use client';

import { useState, useMemo } from 'react';
import { analyzeConfidence, CONFIDENCE_TIER } from '@/lib/aiConfidenceAnalysis';

// ─── Mini sub-components ──────────────────────────────────────────────────────

/** Animated score bar for a single quality factor */
function FactorBar({ factor }) {
  const pct    = Math.max(0, Math.min(100, factor.score));
  const barCol = factor.status === 'ok'
    ? 'bg-emerald-600 dark:bg-[#a3e635]'
    : factor.status === 'warn'
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-rose-600 dark:bg-rose-500';
  const labelCol = factor.status === 'ok'
    ? 'text-emerald-700 dark:text-[#a3e635]'
    : factor.status === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-rose-700 dark:text-rose-400';

  return (
    <div className="space-y-1.5">
      {/* Factor header row */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
          <span>{factor.icon}</span>
          <span>{factor.label}</span>
        </span>
        <span className={`font-bold tabular-nums ${labelCol}`}>{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barCol}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Detail text */}
      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">{factor.detail}</p>
    </div>
  );
}

/** Single bullet line in the AI reasoning summary */
function ReasoningBullet({ text }) {
  const isOk   = text.startsWith('✅');
  const isWarn = text.startsWith('⚠️');
  const isFail = text.startsWith('🔴') || text.startsWith('🚨');

  const cls = isOk
    ? 'text-emerald-800 dark:text-emerald-400'
    : isWarn
      ? 'text-amber-800 dark:text-amber-300'
      : isFail
        ? 'text-rose-800 dark:text-rose-400'
        : 'text-slate-700 dark:text-slate-300';

  return (
    <li className={`flex items-start gap-2 text-xs leading-relaxed ${cls}`}>
      <span className="shrink-0 mt-0.5">{text.slice(0, 2)}</span>
      <span>{text.slice(2).trim()}</span>
    </li>
  );
}

// ─── Radial progress ring ────────────────────────────────────────────────────
function ConfidenceRing({ pct, tier }) {
  const radius     = 38;
  const circ       = 2 * Math.PI * radius;
  const dashOffset = circ - (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
        {/* Track */}
        <circle
          cx="48" cy="48" r={radius}
          strokeWidth="7"
          className="stroke-slate-200 dark:stroke-slate-800"
          fill="transparent"
        />
        {/* Progress arc */}
        <circle
          cx="48" cy="48" r={radius}
          strokeWidth="7"
          stroke="currentColor"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="transparent"
          className={`transition-all duration-1000 ease-out ${
            tier.id === 'high'
              ? 'text-emerald-600 dark:text-[#a3e635]'
              : tier.id === 'medium'
              ? 'text-amber-500 dark:text-amber-400'
              : 'text-rose-600 dark:text-rose-500'
          }`}
        />
      </svg>

      {/* Centre text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Akurasi</span>
        <span
          className={`text-xl sm:text-2xl font-black tabular-nums my-0.5 ${
            tier.id === 'high'
              ? 'text-emerald-700 dark:text-[#a3e635]'
              : tier.id === 'medium'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-rose-700 dark:text-rose-500'
          }`}
        >
          {pct}%
        </span>
        <span className="text-[8px] text-slate-500 dark:text-slate-400 font-medium">{tier.label}</span>
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function ConfidenceScorePanel({ result }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);

  const analysis = useMemo(() => analyzeConfidence(result), [result]);
  const { tier, pct, factors, reasoning } = analysis;

  const showRetake = pct < 70;

  return (
    <div
      className={`rounded-2xl border ${tier.borderClass} ${tier.bgClass} overflow-hidden shadow-sm bg-white dark:bg-[#101726]`}
    >
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-[#0b1320]/60">
        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 min-w-0">
          <span className="shrink-0">🤖</span>
          <span className="truncate">Confidence Score — AI Analysis</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${tier.dotClass}`}
          />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${tier.colorClass} whitespace-nowrap`}>
            {tier.id === 'high' ? 'Terverifikasi Akurat' : tier.id === 'medium' ? 'Konfirmasi Sebagian' : 'Tidak Terdeteksi'}
          </span>
        </div>
      </div>

      {/* ── Main score block ── */}
      <div className="flex flex-col xs:flex-row items-center sm:items-start gap-4 sm:gap-6 p-4 sm:p-5">
        {/* Radial ring */}
        <div className="shrink-0 flex justify-center">
          <ConfidenceRing pct={pct} tier={tier} />
        </div>

        {/* Right-side info */}
        <div className="flex-1 min-w-0 w-full space-y-2.5 sm:space-y-3 text-center xs:text-left">
          {/* Large label */}
          <div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Confidence Score</p>
            <div className="flex flex-wrap items-baseline justify-center xs:justify-start gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-sm font-extrabold text-slate-500 dark:text-neutral-400">Tingkat Akurasi:</span>
              <span
                className={`text-xl xs:text-2xl sm:text-3xl font-black tabular-nums leading-tight ${
                  tier.id === 'high'
                    ? 'text-emerald-700 dark:text-[#a3e635]'
                    : tier.id === 'medium'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-rose-700 dark:text-rose-500'
                }`}
              >
                {pct}%
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1 leading-snug">
              {pct >= 85
                ? `✅ Terverifikasi Akurat (≥85%) — Aman untuk referensi.`
                : pct >= 60
                  ? `⚠️ Memerlukan Verifikasi Manual (60–84%) — Konfirmasi ke apoteker.`
                  : `🔴 Di Bawah Ambang Keselamatan (<60%) — Foto ulang diperlukan.`}
            </p>
          </div>

          {/* Tier badge */}
          <div className="flex flex-wrap items-center justify-center xs:justify-start gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold border ${tier.borderClass} ${tier.colorClass}`}
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <span>{tier.icon}</span>
              <span>Akurasi {tier.label}</span>
            </span>

            <button
              onClick={() => setSummaryOpen((p) => !p)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700 transition-all"
            >
              <span>🧠</span>
              <span>{summaryOpen ? 'Sembunyikan Alasan AI' : 'Lihat Alasan AI'}</span>
              <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: summaryOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>
          </div>

          {/* Applied algorithms badge row */}
          {result.appliedAlgorithms?.length > 0 && (
            <div className="flex flex-wrap items-center justify-center xs:justify-start gap-1.5">
              {result.appliedAlgorithms.slice(0, 4).map((alg, i) => (
                <span
                  key={i}
                  className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#0b1320] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-500"
                >
                  {alg}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Retake advice banner (auto-show when < 70) ── */}
      {showRetake && reasoning.retakeAdvice && (
        <div className="mx-5 mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">📸</span>
          <div>
            <p className="text-xs font-black text-rose-700 dark:text-rose-300 mb-1">Saran Keselamatan — Foto Ulang Diperlukan</p>
            <p className="text-[11px] text-rose-800/90 dark:text-rose-200/80 leading-relaxed">
              {reasoning.retakeAdvice.replace('📸 Saran Keselamatan: ', '').replace('📸 Saran Sistem: ', '')}
            </p>
          </div>
        </div>
      )}

      {/* ── AI Reasoning Summary (collapsible) ── */}
      {summaryOpen && (
        <div className="mx-5 mb-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0b1320] p-4 space-y-3">
          {/* Section title */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <span className="text-base">🧠</span>
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Ringkasan Analisis AI</h4>
          </div>

          {/* Headline */}
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {reasoning.headline}
          </p>

          {/* Reasoning bullets */}
          <ul className="space-y-2 pl-0">
            {reasoning.bullets.map((b, i) => (
              <ReasoningBullet key={i} text={b} />
            ))}
          </ul>

          {/* Medium-tier retake tip (inside summary) */}
          {pct >= 60 && pct < 70 && reasoning.retakeAdvice && (
            <div className="flex items-start gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800/60">
              <span className="text-amber-500 dark:text-amber-400 shrink-0 text-xs">💡</span>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                {reasoning.retakeAdvice.replace(/^📸 Saran.+?: /, '')}
              </p>
            </div>
          )}

          {/* Expand detail button */}
          <button
            onClick={() => setDetailOpen((p) => !p)}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-xs font-semibold dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-700/60 transition-all mt-1"
          >
            <span className="flex items-center gap-2">
              <span>📊</span>
              <span>Detail Analisis AI — Breakdown Faktor Kualitas</span>
            </span>
            <span
              className="transition-transform duration-200"
              style={{ transform: detailOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▾
            </span>
          </button>
        </div>
      )}

      {/* ── Detailed Factor Breakdown (expandable) ── */}
      {summaryOpen && detailOpen && (
        <div className="mx-5 mb-5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0b1320] p-4 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span>📊</span>
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Breakdown Faktor Kualitas Penilaian
              </h4>
            </div>
            <span className="text-[10px] text-slate-600 dark:text-slate-500 font-mono">
              {factors.filter((f) => f.status === 'ok').length}/{factors.length} faktor optimal
            </span>
          </div>

          {/* Factor bars */}
          <div className="space-y-4">
            {factors.map((factor) => (
              <FactorBar key={factor.id} factor={factor} />
            ))}
          </div>

          {/* Overall assessment summary */}
          <div className={`rounded-xl border ${tier.borderClass} p-3.5 flex items-start gap-3 mt-2`}
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <span className="text-lg shrink-0">{tier.icon}</span>
            <div>
              <p className={`text-xs font-bold mb-1 ${tier.colorClass}`}>
                Penilaian Keseluruhan — Akurasi {tier.label} ({pct}%)
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {tier.id === 'high'
                  ? 'Seluruh faktor kualitas memenuhi ambang minimum. Hasil identifikasi dapat dijadikan referensi dengan keyakinan tinggi.'
                  : tier.id === 'medium'
                    ? 'Beberapa faktor kualitas perlu ditingkatkan. Informasi obat berhasil diidentifikasi sebagian; verifikasi tambahan dari apoteker disarankan sebelum mengonsumsi.'
                    : 'Kualitas citra tidak memadai untuk identifikasi yang aman. Jangan mengonsumsi obat hanya berdasarkan hasil ini. Ambil foto ulang atau cari informasi melalui apoteker.'}
              </p>
            </div>
          </div>

          {/* Methodology note */}
          <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
            Analisis dihasilkan menggunakan: Computer Vision Pipeline (CLAHE, Deskewing, ROI Detection), OCR Engine (RapidOCR + Tesseract), dan Multi-Algorithm Fuzzy Matching (Levenshtein · Jaro-Winkler · Trigram N-gram).
          </p>
        </div>
      )}
    </div>
  );
}
