/**
 * src/components/MedicineCatalog.jsx
 * PharmaShield — Modul Datasheet & Katalog Referensi Obat Penyakit Umum Indonesia.
 * Desain Dark Mode Estetik dengan Aksen Neon Green (#c8f93a).
 */
'use client';

import { useState, useMemo } from 'react';
import {
  INDONESIA_MEDICINES,
  MEDICINE_CATEGORIES,
  BPOM_CLASSES,
} from '@/lib/indonesiaMedicineCatalog';

export default function MedicineCatalog({ initialSearch = '', onSelectMedicine }) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBpom, setSelectedBpom] = useState('all');
  const [activeDetail, setActiveDetail] = useState(null);

  // Filter logic
  const filteredMedicines = useMemo(() => {
    return INDONESIA_MEDICINES.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // BPOM filter
      if (selectedBpom !== 'all' && item.bpomClass.code !== selectedBpom) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchBrand = item.brandNames.some((b) => b.toLowerCase().includes(q));
        const matchSubstance = item.activeSubstance.toLowerCase().includes(q);
        const matchIndication = item.indications.toLowerCase().includes(q);
        const matchCategory = item.categoryLabel.toLowerCase().includes(q);
        if (!matchName && !matchBrand && !matchSubstance && !matchIndication && !matchCategory) {
          return false;
        }
      }
      return true;
    });
  }, [searchQuery, selectedCategory, selectedBpom]);

  return (
    <div className="space-y-6">
      {/* ── Search & Filter Controls ── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2" strokeLinecap="round" />
                <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari obat umum Indonesia (misal: Paracetamol, Maag, Flu, Amlodipine, dll.)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[var(--color-border)] bg-[#11141b] text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-[#c8f93a] focus:ring-1 focus:ring-[#c8f93a] transition-all"
            />
          </div>

          {/* Quick stats indicator */}
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 self-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/5 text-[#c8f93a]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8f93a] animate-pulse" />
              {filteredMedicines.length} dari {INDONESIA_MEDICINES.length} Obat Tersedia
            </span>
          </div>
        </div>

        {/* ── Category Filter Pills ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          {MEDICINE_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-medium whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-[#c8f93a] text-[#0c1004] font-bold shadow-sm shadow-[#c8f93a]/20'
                    : 'bg-[#11141b] text-neutral-400 hover:text-white hover:bg-neutral-800 border border-[var(--color-border)]'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── BPOM Class Filter ── */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5 text-xs text-neutral-400">
          <span className="font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">Golongan BPOM:</span>
          <button
            onClick={() => setSelectedBpom('all')}
            className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
              selectedBpom === 'all'
                ? 'bg-white/10 text-white font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Semua
          </button>
          {Object.values(BPOM_CLASSES).map((bpom) => (
            <button
              key={bpom.code}
              onClick={() => setSelectedBpom(bpom.code)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                selectedBpom === bpom.code
                  ? `${bpom.badgeColor} font-bold ring-1 ring-current`
                  : 'border-[var(--color-border)] text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span>{bpom.symbol}</span>
              <span>{bpom.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Medicine Grid Cards ── */}
      {filteredMedicines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card-bg)] p-12 text-center space-y-3">
          <span className="text-4xl" aria-hidden="true">🔍</span>
          <h3 className="text-base font-bold text-neutral-200">Tidak ada obat yang cocok</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian atau reset filter kategori untuk melihat kembali database obat masyarakat Indonesia.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedBpom('all');
            }}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMedicines.map((med) => (
            <article
              key={med.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] hover:border-[#c8f93a]/40 hover:bg-[#181c26] transition-all p-5 flex flex-col justify-between group shadow-sm"
            >
              <div className="space-y-3">
                {/* Header: Category & BPOM badge */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-neutral-400 bg-black/40 px-2.5 py-0.5 rounded-md border border-white/5">
                    {med.categoryLabel}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${med.bpomClass.badgeColor}`}>
                    {med.bpomClass.symbol} {med.bpomClass.label}
                  </span>
                </div>

                {/* Medicine Title */}
                <div>
                  <h3 className="text-base font-extrabold text-white group-hover:text-[#c8f93a] transition-colors line-clamp-1">
                    {med.name}
                  </h3>
                  <p className="text-xs text-[#c8f93a]/80 font-mono mt-0.5 line-clamp-1">
                    Merk: {med.brandNames.join(', ')}
                  </p>
                </div>

                {/* Sediaan & Zat Aktif */}
                <div className="text-xs text-neutral-400 space-y-1 bg-black/20 p-2.5 rounded-xl border border-white/5">
                  <div className="flex items-start gap-1.5">
                    <span className="text-neutral-500 font-medium">Sediaan:</span>
                    <span className="text-neutral-300 font-semibold line-clamp-1">{med.dosageForm}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-neutral-500 font-medium">Zat Aktif:</span>
                    <span className="text-neutral-300 line-clamp-1">{med.activeSubstance}</span>
                  </div>
                </div>

                {/* Indikasi ringkas */}
                <p className="text-xs text-neutral-300 leading-relaxed line-clamp-2">
                  {med.indications}
                </p>
              </div>

              {/* Action buttons */}
              <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetail(med)}
                  className="w-full py-2 px-3 text-xs font-bold rounded-xl bg-white/5 text-neutral-200 hover:text-black hover:bg-[#c8f93a] transition-all flex items-center justify-center gap-1.5 group-hover:border group-hover:border-[#c8f93a]/40"
                >
                  <span>Lihat Datasheet Lengkap</span>
                  <span>→</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Modal / Drawer Detail Datasheet Obat ── */}
      {activeDetail && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setActiveDetail(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[#161922] p-6 md:p-8 shadow-2xl space-y-6 relative text-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${activeDetail.bpomClass.badgeColor}`}>
                    {activeDetail.bpomClass.symbol} {activeDetail.bpomClass.label}
                  </span>
                  <span className="text-xs text-neutral-400 bg-black/40 px-2.5 py-0.5 rounded-md border border-white/5">
                    {activeDetail.categoryLabel}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  {activeDetail.name}
                </h2>
                <p className="text-xs text-[#c8f93a] font-mono mt-1">
                  Merk Populer di Apotek: {activeDetail.brandNames.join(', ')}
                </p>
              </div>

              <button
                onClick={() => setActiveDetail(null)}
                aria-label="Tutup jendela detail"
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Sediaan & Zat Aktif Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-black/30 border border-white/5 text-xs">
              <div>
                <span className="text-neutral-500 font-semibold block uppercase tracking-wider text-[10px]">Bentuk Sediaan</span>
                <span className="text-white font-bold mt-0.5 block">{activeDetail.dosageForm}</span>
              </div>
              <div>
                <span className="text-neutral-500 font-semibold block uppercase tracking-wider text-[10px]">Kandungan Zat Aktif</span>
                <span className="text-white font-bold mt-0.5 block">{activeDetail.activeSubstance}</span>
              </div>
            </div>

            {/* Indikasi */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#c8f93a] flex items-center gap-1.5">
                <span>📋</span> Indikasi Medis &amp; Kegunaan
              </h4>
              <p className="text-sm text-neutral-200 leading-relaxed bg-[#11141b] p-3.5 rounded-xl border border-[var(--color-border)]">
                {activeDetail.indications}
              </p>
            </div>

            {/* Dosis & Aturan Minum */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#c8f93a] flex items-center gap-1.5">
                <span>🕒</span> Dosis &amp; Aturan Pakai
              </h4>
              <div className="text-sm text-neutral-200 leading-relaxed bg-[#11141b] p-3.5 rounded-xl border border-[var(--color-border)] space-y-2">
                <p><strong className="text-white">Dosis:</strong> {activeDetail.dosage}</p>
                <p className="text-xs text-neutral-400 pt-1 border-t border-white/5">
                  <strong className="text-neutral-300">Petunjuk Khusus:</strong> {activeDetail.usageAdvice}
                </p>
              </div>
            </div>

            {/* Efek Samping & Peringatan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Efek Samping */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>⚠️</span> Efek Samping Umum
                </h4>
                <ul className="text-xs text-neutral-300 space-y-1.5 bg-[#11141b] p-3.5 rounded-xl border border-[var(--color-border)] list-disc pl-5">
                  {activeDetail.sideEffects.map((ef, i) => (
                    <li key={i}>{ef}</li>
                  ))}
                </ul>
              </div>

              {/* Peringatan / Kontraindikasi */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <span>🛑</span> Perhatian &amp; Kontraindikasi
                </h4>
                <p className="text-xs text-neutral-300 leading-relaxed bg-[#11141b] p-3.5 rounded-xl border border-[var(--color-border)]">
                  {activeDetail.precautions}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                Data disusun berdasarkan standar informasi farmasi &amp; BPOM RI.
              </span>
              <button
                type="button"
                onClick={() => setActiveDetail(null)}
                className="px-5 py-2 text-xs font-extrabold rounded-xl bg-[#c8f93a] text-[#0c1004] hover:bg-[#b5f524] transition-colors"
              >
                Tutup Datasheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
