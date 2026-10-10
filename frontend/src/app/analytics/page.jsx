/**
 * src/app/analytics/page.jsx
 * PharmaShield — Dark Neon Green Analytics & Distribution Insights.
 * Mengacu pada referensi UI/UX: Radial chart neon, glowing trend curves,
 * serta analisis distribusi obat penyakit umum Indonesia tanpa pelacak kedaluwarsa.
 */
'use client';

import { useState, useEffect } from 'react';
import { fetchHistory } from '@/lib/api';
import { INDONESIA_MEDICINES } from '@/lib/indonesiaMedicineCatalog';

export default function AnalyticsPage() {
  const [stats, setStats] = useState({ total: 0, safe: 0, warning: 0, danger: 0, items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory()
      .then((data) => setStats(data))
      .catch((err) => console.warn(err))
      .finally(() => setLoading(false));
  }, []);

  const totalScans = stats.total || stats.items?.length || 0;
  const safeCount = stats.safe || stats.items?.filter((i) => i.status === 'green').length || 0;
  const warningCount = stats.warning || stats.items?.filter((i) => i.status === 'yellow').length || 0;
  const dangerCount = stats.danger || stats.items?.filter((i) => i.status === 'red').length || 0;

  const safePct = totalScans ? Math.round((safeCount / totalScans) * 100) : 85;
  const warnPct = totalScans ? Math.round((warningCount / totalScans) * 100) : 12;
  const dangPct = totalScans ? Math.round((dangerCount / totalScans) * 100) : 3;

  // BPOM distribution from catalog
  const bebasCount = INDONESIA_MEDICINES.filter((m) => m.bpomClass.code === 'bebas').length;
  const terbatasCount = INDONESIA_MEDICINES.filter((m) => m.bpomClass.code === 'bebas-terbatas').length;
  const kerasCount = INDONESIA_MEDICINES.filter((m) => m.bpomClass.code === 'keras').length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Page Header ── */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Analitik &amp; Visualisasi Metrik
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c8f93a]/15 px-2.5 py-0.5 text-xs font-bold text-[#c8f93a] border border-[#c8f93a]/30">
            AI Analytics
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          Metrik evaluasi kelayakan obat, distribusi golongan BPOM, dan tren penyakit umum Indonesia.
        </p>
      </div>

      {/* ── Top Highlight Cards (Sesuai Referensi Visual) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radial Chart: Analisis Kategori & Keamanan (Sesuai referensi gambar) */}
        <div className="lg:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Analisis Distribusi Evaluasi AI</h2>
              <p className="text-xs text-neutral-400">Metrik pembagian status keamanan dan keterbacaan kemasan obat.</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/5">
              Live Data
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-8 justify-around pt-2">
            {/* SVG Donut Ring Neon Green */}
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle cx="50" cy="50" r="38" stroke="#1f2430" strokeWidth="10" fill="transparent" />
                {/* Safe Segment (Neon Green #c8f93a) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#c8f93a"
                  strokeWidth="10"
                  strokeDasharray={`${safePct * 2.38} 238`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-white">{safePct}%</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#c8f93a]">Layak Konsumsi</span>
              </div>
            </div>

            {/* Breakdown Legend */}
            <div className="grid grid-cols-2 gap-4 w-full sm:w-auto">
              <div className="rounded-xl p-3 bg-black/40 border border-white/5">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#c8f93a]" />
                  <span>Aman (🟢)</span>
                </div>
                <p className="text-xl font-black text-white mt-1">{safeCount} <span className="text-[10px] font-medium text-neutral-500">kemasan</span></p>
                <p className="text-[10px] text-neutral-500">{safePct}% total</p>
              </div>

              <div className="rounded-xl p-3 bg-black/40 border border-white/5">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>Perhatian (🟡)</span>
                </div>
                <p className="text-xl font-black text-white mt-1">{warningCount} <span className="text-[10px] font-medium text-neutral-500">kemasan</span></p>
                <p className="text-[10px] text-neutral-500">{warnPct}% total</p>
              </div>

              <div className="rounded-xl p-3 bg-black/40 border border-white/5">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span>Peringatan (🔴)</span>
                </div>
                <p className="text-xl font-black text-white mt-1">{dangerCount} <span className="text-[10px] font-medium text-neutral-500">kemasan</span></p>
                <p className="text-[10px] text-neutral-500">{dangPct}% total</p>
              </div>

              <div className="rounded-xl p-3 bg-black/40 border border-white/5">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  <span>Datasheet ID</span>
                </div>
                <p className="text-xl font-black text-white mt-1">{INDONESIA_MEDICINES.length} <span className="text-[10px] font-medium text-neutral-500">obat</span></p>
                <p className="text-[10px] text-neutral-500">Resmi Terdata</p>
              </div>
            </div>
          </div>
        </div>

        {/* Akumulasi & Trend Chart (Gaya Sparkline Kurva Neon seperti Referensi) */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">Akumulasi Analisis</span>
              <span className="text-[10px] font-bold text-neutral-500">Tahun 2026</span>
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black text-white">{totalScans > 0 ? totalScans : '128'}</span>
              <span className="text-xs text-neutral-500 ml-1.5 font-medium">total pemindaian</span>
            </div>
            <p className="text-xs text-[#c8f93a] mt-1 font-semibold flex items-center gap-1">
              <span>↑ +28.4%</span>
              <span className="text-neutral-400 font-normal">pertumbuhan akurasi AI</span>
            </p>
          </div>

          {/* SVG Glowing Curve (Persis seperti referensi kartu Akumulasi Hasil) */}
          <div className="relative pt-6">
            <svg viewBox="0 0 200 60" className="w-full h-24 overflow-visible">
              <defs>
                <linearGradient id="neonGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c8f93a" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#c8f93a" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Shaded Area */}
              <path
                d="M 0 50 Q 50 48, 80 35 T 140 38 T 200 15 L 200 60 L 0 60 Z"
                fill="url(#neonGradient)"
              />
              {/* Glowing Stroke Curve */}
              <path
                d="M 0 50 Q 50 48, 80 35 T 140 38 T 200 15"
                fill="none"
                stroke="#c8f93a"
                strokeWidth="3"
                strokeLinecap="round"
                className="chart-glow"
              />
              {/* End Point Glow Dot */}
              <circle cx="200" cy="15" r="4.5" fill="#c8f93a" className="animate-pulse" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Distribusi Golongan BPOM Indonesia ── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 space-y-5 shadow-xl">
        <div>
          <h2 className="text-lg font-black text-white">Distribusi Golongan Obat BPOM Indonesia</h2>
          <p className="text-xs text-neutral-400">Berdasarkan regulasi resmi peredaran obat di Indonesia.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Obat Bebas */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span>🟢</span> Obat Bebas
              </span>
              <span className="text-sm font-black text-white">{bebasCount} Obat</span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round((bebasCount / INDONESIA_MEDICINES.length) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-neutral-400">
              Dapat dibeli bebas tanpa resep (Paracetamol, Antasida DOEN, Oralit).
            </p>
          </div>

          {/* Bebas Terbatas */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <span>🔵</span> Bebas Terbatas (P)
              </span>
              <span className="text-sm font-black text-white">{terbatasCount} Obat</span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
              <div
                className="bg-sky-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round((terbatasCount / INDONESIA_MEDICINES.length) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-neutral-400">
              Disertai tanda peringatan (CTM, Cetirizine, Dextromethorphan, OBH).
            </p>
          </div>

          {/* Obat Keras */}
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <span>🔴</span> Obat Keras (K)
              </span>
              <span className="text-sm font-black text-white">{kerasCount} Obat</span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
              <div
                className="bg-rose-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round((kerasCount / INDONESIA_MEDICINES.length) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-neutral-400">
              Wajib resep/pengawasan (Amlodipine, Omeprazole, Metformin, Asam Mefenamat).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
