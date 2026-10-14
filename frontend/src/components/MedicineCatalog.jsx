/**
 * src/components/MedicineCatalog.jsx
 * PharmaShield — Modul Datasheet & Katalog Referensi 1.000+ Obat Beredar di Indonesia (BPOM).
 * Desain Dark Card presisi sesuai acuan (Demam & Nyeri, Obat Bebas, Merk Lime Green, Inset Box Sediaan/Zat Aktif).
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  INDONESIA_MEDICINES,
  MEDICINE_CATEGORIES,
  BPOM_CLASSES,
} from '@/lib/indonesiaMedicineCatalog';

const ITEMS_PER_PAGE = 24;

export default function MedicineCatalog({ initialSearch = '', onSelectMedicine }) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBpom, setSelectedBpom] = useState('all');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [activeDetail, setActiveDetail] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (activeDetail) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeDetail]);

  // Filter logic across 1,000+ medicines
  const filteredMedicines = useMemo(() => {
    return INDONESIA_MEDICINES.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // BPOM filter
      if (selectedBpom !== 'all' && item.bpomClass?.code !== selectedBpom) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nama = (item.nama_obat || item.name || '').toLowerCase();
        const brands = Array.isArray(item.brandNames)
          ? item.brandNames.join(' ').toLowerCase()
          : (item.merk || '').toLowerCase();
        const substance = (item.zat_aktif || item.activeSubstance || '').toLowerCase();
        const ind = (item.indikasi_kegunaan || item.indications || '').toLowerCase();
        const cat = (item.kategori_penyakit || item.categoryLabel || '').toLowerCase();
        const bpom = (item.status_bpom || '').toLowerCase();

        return (
          nama.includes(q) ||
          brands.includes(q) ||
          substance.includes(q) ||
          ind.includes(q) ||
          cat.includes(q) ||
          bpom.includes(q)
        );
      }
      return true;
    });
  }, [searchQuery, selectedCategory, selectedBpom]);

  // Reset pagination on filter/query change
  const handleQueryChange = (val) => {
    setSearchQuery(val);
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const handleBpomChange = (bpomCode) => {
    setSelectedBpom(bpomCode);
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const visibleMedicines = useMemo(() => {
    return filteredMedicines.slice(0, visibleCount);
  }, [filteredMedicines, visibleCount]);

  const handleCopySummary = (med) => {
    const text = `[DATASHEET OBAT - PHARMASHIELD]
Nama Obat: ${med.nama_obat || med.name}
Kategori: ${med.kategori_penyakit || med.categoryLabel}
Status BPOM: ${med.status_bpom || med.bpomClass?.label}
Merk Dagang: ${med.merk || (med.brandNames?.join(', ') || '-')}
Bentuk Sediaan: ${med.sediaan || med.dosageForm}
Zat Aktif: ${med.zat_aktif || med.activeSubstance}
Indikasi: ${med.indikasi_kegunaan || med.indications}
Dosis/Aturan: ${med.detail_lengkap?.dosis || med.usageInstructions}
No. Registrasi BPOM: ${med.detail_lengkap?.nomor_bpom || med.bpomRegistrationExample || '-'}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(med.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Search & Filter Controls ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm dark:border-slate-800 dark:bg-[#101726]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between"
        >
          {/* Search bar with Submit and Clear buttons */}
          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2" strokeLinecap="round" />
                <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Cari obat umum Indonesia (misal: Paracetamol, Panadol, Sanmol, Bodrex, Amoxicillin)..."
              className="w-full pl-10 pr-24 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7] dark:border-slate-800 dark:bg-[#0b1320] dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-[#a3e635] dark:focus:ring-[#a3e635] transition-all shadow-xs"
            />
            <div className="absolute right-2 flex items-center gap-1.5">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleQueryChange('')}
                  aria-label="Bersihkan pencarian"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors text-xs"
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs dark:bg-[#a3e635] dark:text-slate-950 dark:hover:bg-[#bef264] transition-all"
              >
                Cari
              </button>
            </div>
          </div>

          {/* Quick stats indicator */}
          <div className="flex items-center gap-2 text-xs font-semibold shrink-0 self-center">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sky-50 border border-sky-200 text-[#0284c7] font-bold dark:bg-[#182234] dark:border-slate-700/60 dark:text-[#a3e635]">
              <span className="w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#a3e635] animate-pulse" />
              {filteredMedicines.length} dari {INDONESIA_MEDICINES.length} Obat Terindeks
            </span>
          </div>
        </form>

        {/* ── Category Filter Pills ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          {MEDICINE_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 border ${
                  isActive
                    ? 'bg-sky-50 text-[#0284c7] font-black border-[#0284c7] shadow-sm dark:bg-[#182234] dark:text-[#a3e635] dark:border-[#a3e635]'
                    : 'bg-white text-slate-800 hover:text-slate-950 hover:bg-slate-50 border-slate-300 dark:bg-[#0b1320] dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#162032] dark:border-slate-800 font-bold'
                }`}
              >
                <span>{cat.icon}</span>
                <span className={isActive ? 'text-[#0284c7] dark:text-[#a3e635] font-black' : 'text-slate-800 dark:text-slate-200 font-bold'}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── BPOM Class Filter ── */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300">
          <span className="font-extrabold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">
            Golongan BPOM:
          </span>
          <button
            onClick={() => handleBpomChange('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              selectedBpom === 'all'
                ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-sm dark:bg-[#182234] dark:text-white dark:border-slate-700'
                : 'bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-50 border-slate-300 dark:bg-[#0b1320] dark:text-slate-400 dark:hover:text-white dark:border-slate-800'
            }`}
          >
            Semua
          </button>
          {Object.values(BPOM_CLASSES).map((bpom) => (
            <button
              key={bpom.code}
              onClick={() => handleBpomChange(bpom.code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                selectedBpom === bpom.code
                  ? `${bpom.badgeColor} ring-2 ring-current font-extrabold`
                  : 'border-slate-300 bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1320] dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>{bpom.symbol}</span>
              <span className={selectedBpom === bpom.code ? 'font-extrabold' : 'text-slate-700 dark:text-slate-300'}>
                {bpom.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Medicine Grid Cards (Pixel-Accurate to Reference Screenshot) ── */}
      {filteredMedicines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-[#101726] p-12 text-center space-y-3 shadow-lg">
          <span className="text-4xl block" aria-hidden="true">🔎</span>
          <h3 className="text-base font-extrabold text-white">
            Obat Tidak Ditemukan
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Tidak ada obat yang cocok dengan kata kunci <span className="font-bold text-[#a3e635]">"{searchQuery}"</span> atau filter kategori yang dipilih.
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                handleQueryChange('');
                handleCategoryChange('all');
                handleBpomChange('all');
              }}
              className="px-5 py-2.5 text-xs font-bold rounded-xl bg-[#a3e635] text-slate-950 hover:bg-[#bef264] transition-all shadow-sm"
            >
              🔄 Reset Filter &amp; Tampilkan Semua 1.000+ Obat
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleMedicines.map((med) => {
              const brandText = med.merk || (Array.isArray(med.brandNames) ? med.brandNames.join(', ') : med.brandNames || '-');
              const sediaanText = med.sediaan || med.dosageForm || '-';
              const zatAktifText = med.zat_aktif || med.activeSubstance || '-';
              const indikasiText = med.indikasi_kegunaan || med.indications || '-';
              const kategoriText = med.kategori_penyakit || med.categoryLabel || 'Obat Umum';
              const statusBpomText = med.status_bpom || med.bpomClass?.label || 'Obat Bebas';

              return (
                <article
                  key={med.id}
                  className="rounded-2xl border border-slate-200 bg-white hover:border-[#0284c7]/50 hover:shadow-xl hover:shadow-sky-500/10 dark:border-slate-800/90 dark:bg-[#101726] dark:hover:border-emerald-500/60 dark:hover:shadow-emerald-950/20 transition-all duration-200 p-5 flex flex-col justify-between group shadow-xs"
                >
                  <div className="space-y-3">
                    {/* Top Row: Category Badge (left) & Status BPOM Badge (right) */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#182234] dark:text-slate-300 dark:border-slate-700/60">
                        {kategoriText}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#064e3b]/30 dark:text-emerald-400 dark:border-emerald-500/30">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 inline-block" />
                        {statusBpomText}
                      </span>
                    </div>

                    {/* Drug Name Heading */}
                    <h3 className="text-slate-900 dark:text-white font-bold text-lg leading-tight mt-3 mb-1 group-hover:text-[#0284c7] dark:group-hover:text-[#a3e635] transition-colors line-clamp-1">
                      {med.nama_obat || med.name}
                    </h3>

                    {/* Merk in Ocean Blue / Neon font-mono */}
                    <p className="text-[#0284c7] dark:text-[#a3e635] font-mono text-xs font-semibold mb-3 truncate block">
                      Merk: {brandText}
                    </p>

                    {/* Inset Box: Sediaan & Zat Aktif */}
                    <div className="bg-slate-50 rounded-xl p-3.5 my-3 border border-slate-200 text-xs space-y-1.5 dark:bg-[#0b1320] dark:border-slate-800/80">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">Sediaan:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold truncate">{sediaanText}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">Zat Aktif:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold truncate">{zatAktifText}</span>
                      </div>
                    </div>

                    {/* Indikasi Singkat */}
                    <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
                      {indikasiText}
                    </p>
                  </div>

                  {/* Action Button: Lihat Datasheet Lengkap → */}
                  <div className="pt-2">
                    {onSelectMedicine ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectMedicine(med)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-[#0284c7] hover:bg-[#075985] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm dark:bg-[#a3e635] dark:hover:bg-[#bef264] dark:text-slate-950"
                        >
                          <span>✓</span>
                          <span>Pilih Obat Ini</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveDetail(med)}
                          className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-950 text-xs font-semibold border border-slate-200 dark:bg-[#162032] dark:hover:bg-[#1e2d44] dark:text-slate-200 dark:hover:text-white dark:border-slate-700/60 transition-all"
                          title="Lihat Datasheet Lengkap"
                        >
                          Detail →
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveDetail(med)}
                        className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-[#0284c7] border border-slate-200 hover:border-sky-300 dark:bg-[#162032] dark:hover:bg-[#1e2d44] dark:text-slate-200 dark:hover:text-white dark:border-slate-700/60 flex items-center justify-center gap-2 transition-all font-semibold text-xs"
                      >
                        <span>Lihat Datasheet Lengkap</span>
                        <span className="transition-transform group-hover:translate-x-0.5">→</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination / Load More Footer for 1,000+ dataset */}
          {visibleCount < filteredMedicines.length && (
            <div className="pt-6 pb-2 text-center flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => Math.min(prev + ITEMS_PER_PAGE, filteredMedicines.length))}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-slate-100 text-[#0f172a] border border-[#cbd5e1] shadow-sm dark:bg-[#0d131f] dark:hover:bg-[#162032] dark:text-white dark:border-[#1e2d42] text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <span>Tampilkan Lebih Banyak</span>
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  ({filteredMedicines.length - visibleCount} obat lagi)
                </span>
                <span>↓</span>
              </button>

              <button
                type="button"
                onClick={() => setVisibleCount(filteredMedicines.length)}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-white hover:bg-slate-100 text-[#0f172a] border border-[#cbd5e1] shadow-sm dark:bg-[#0d131f] dark:hover:bg-[#162032] dark:text-white dark:border-[#1e2d42] text-xs font-medium transition-all"
              >
                Tampilkan Semua ({filteredMedicines.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modal Detail Datasheet Obat Komprehensif ── */}
      {mounted && activeDetail && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
          onClick={() => setActiveDetail(null)}
        >
          <div
            className="w-full max-w-2xl my-auto max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-2xl space-y-6 relative text-slate-800 dark:border-slate-800 dark:bg-[#101726] dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#064e3b]/30 dark:text-emerald-400 dark:border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 inline-block" />
                    {activeDetail.status_bpom || activeDetail.bpomClass?.label}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#182234] dark:text-slate-300 dark:border-slate-700/60">
                    {activeDetail.kategori_penyakit || activeDetail.categoryLabel}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {activeDetail.nama_obat || activeDetail.name}
                </h2>
                <p className="text-xs text-[#0284c7] dark:text-[#a3e635] font-mono font-semibold mt-1">
                  Merk Dagang: {activeDetail.merk || (activeDetail.brandNames?.join(', ') || '-')}
                </p>
              </div>

              <button
                onClick={() => setActiveDetail(null)}
                aria-label="Tutup jendela detail"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Sediaan, Zat Aktif & Nomor Registrasi BPOM Inset */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs dark:bg-[#0b1320] dark:border-slate-800">
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Bentuk Sediaan</span>
                <span className="text-slate-900 dark:text-white font-bold mt-0.5 block">{activeDetail.sediaan || activeDetail.dosageForm}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Zat Aktif</span>
                <span className="text-slate-900 dark:text-white font-bold mt-0.5 block">{activeDetail.zat_aktif || activeDetail.activeSubstance}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">No. Izin BPOM</span>
                <span className="text-[#0284c7] dark:text-[#a3e635] font-mono font-bold mt-0.5 block">
                  {activeDetail.detail_lengkap?.nomor_bpom || activeDetail.bpomRegistrationExample || 'Terdaftar Resmi BPOM'}
                </span>
              </div>
            </div>

            {/* Indikasi Medis */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0284c7] dark:text-[#a3e635] flex items-center gap-1.5">
                <span>📋</span> Indikasi Medis &amp; Kegunaan
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#0b1320] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80">
                {activeDetail.indikasi_kegunaan || activeDetail.indications}
              </p>
            </div>

            {/* Dosis & Aturan Pakai */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0284c7] dark:text-[#a3e635] flex items-center gap-1.5">
                <span>🕒</span> Dosis &amp; Aturan Pakai
              </h4>
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#0b1320] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                <p>
                  <strong className="text-slate-900 dark:text-white">Dosis:</strong>{' '}
                  {activeDetail.detail_lengkap?.dosis || activeDetail.usageInstructions || 'Gunakan sesuai anjuran pada kemasan atau resep dokter.'}
                </p>
                {activeDetail.detail_lengkap?.aturan_pakai && activeDetail.detail_lengkap.aturan_pakai !== activeDetail.detail_lengkap.dosis && (
                  <p>
                    <strong className="text-slate-900 dark:text-white">Petunjuk Konsumsi:</strong> {activeDetail.detail_lengkap.aturan_pakai}
                  </p>
                )}
              </div>
            </div>

            {/* Efek Samping & Kontraindikasi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Efek Samping */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <span>⚠️</span> Efek Samping Umum
                </h4>
                <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 bg-slate-50 dark:bg-[#0b1320] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 list-disc pl-5">
                  {(activeDetail.detail_lengkap?.efek_samping || activeDetail.sideEffects || ['Jarang menimbulkan efek samping jika sesuai dosis']).map((ef, i) => (
                    <li key={i}>{ef}</li>
                  ))}
                </ul>
              </div>

              {/* Peringatan / Kontraindikasi */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <span>🛑</span> Perhatian &amp; Kontraindikasi
                </h4>
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#0b1320] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1.5">
                  {activeDetail.detail_lengkap?.kontraindikasi ? (
                    <div>
                      <strong className="text-slate-900 dark:text-slate-200 block mb-1">Kontraindikasi:</strong>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                        {activeDetail.detail_lengkap.kontraindikasi.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>{activeDetail.warnings?.join(' ') || 'Hati-hati pada pasien dengan riwayat alergi obat dan gangguan fungsi organ.'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Penyimpanan */}
            <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#0b1320] p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center gap-2">
              <span className="text-base">📦</span>
              <div>
                <strong className="text-slate-800 dark:text-slate-300">Penyimpanan: </strong>
                {activeDetail.detail_lengkap?.cara_penyimpanan || activeDetail.storageInfo || 'Simpan di tempat kering dan sejuk di bawah suhu 30°C, hindarkan dari paparan sinar matahari langsung.'}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopySummary(activeDetail)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 dark:bg-[#162032] dark:hover:bg-[#1e2d44] dark:text-slate-200 dark:border-slate-700/60 transition-colors flex items-center gap-1.5"
                >
                  {copiedId === activeDetail.id ? (
                    <>
                      <span className="text-emerald-600 dark:text-[#a3e635]">✓</span>
                      <span className="text-emerald-600 dark:text-[#a3e635]">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <span>📋</span>
                      <span>Salin Ringkasan</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {onSelectMedicine && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectMedicine(activeDetail);
                      setActiveDetail(null);
                    }}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-[#0284c7] hover:bg-[#075985] text-white shadow-md shadow-sky-500/25 dark:bg-[#a3e635] dark:text-slate-950 dark:hover:bg-[#bef264] dark:shadow-[#a3e635]/20 transition-all"
                  >
                    ✓ Pilih Obat Ini
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveDetail(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white dark:hover:border-slate-500 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
