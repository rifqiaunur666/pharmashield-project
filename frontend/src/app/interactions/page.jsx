/**
 * src/app/interactions/page.jsx
 * PharmaShield — Drug Interaction Checker (Pengecekan Interaksi Obat).
 * Membandingkan 2 atau lebih obat untuk memastikan keamanan konsumsi bersamaan.
 */
'use client';

import { useState, useMemo } from 'react';
import { checkDrugInteractions } from '@/lib/api';
import { INDONESIA_MEDICINES } from '@/lib/indonesiaMedicineCatalog';

export default function DrugInteractionsPage() {
  const [selectedDrugs, setSelectedDrugs] = useState(['Ibuprofen 400mg', 'Aspirin']);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Autocomplete suggestions based on user input
  const suggestions = useMemo(() => {
    if (!inputVal.trim()) return [];
    const q = inputVal.toLowerCase().trim();
    const matches = [];
    for (const med of INDONESIA_MEDICINES) {
      if (med.name.toLowerCase().includes(q)) {
        matches.push(med.name);
      }
      for (const brand of med.brandNames) {
        if (brand.toLowerCase().includes(q) && !matches.includes(brand)) {
          matches.push(brand);
        }
      }
      if (matches.length >= 8) break;
    }
    return matches;
  }, [inputVal]);

  const handleAddDrug = (name) => {
    const trimmed = (name || inputVal).trim();
    if (!trimmed) return;
    if (selectedDrugs.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setInputVal('');
      setShowSuggestions(false);
      return;
    }
    setSelectedDrugs((prev) => [...prev, trimmed]);
    setInputVal('');
    setShowSuggestions(false);
    setResult(null);
  };

  const handleRemoveDrug = (index) => {
    setSelectedDrugs((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const handleCheck = async () => {
    if (selectedDrugs.length < 2) {
      setError('Pilih minimal 2 obat untuk memeriksa potensi interaksi.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await checkDrugInteractions(selectedDrugs);
      setResult(data);
    } catch (err) {
      console.error('[Interactions] Failed to check:', err);
      setError(err.message || 'Gagal memeriksa interaksi obat. Pastikan server aktif.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (code) => {
    switch (code) {
      case 'dangerous':
        return {
          border: 'border-rose-500/40',
          bg: 'bg-rose-500/10',
          text: 'text-rose-600 dark:text-rose-400',
          badge: 'bg-rose-600 text-white',
        };
      case 'caution':
        return {
          border: 'border-amber-500/40',
          bg: 'bg-amber-500/10',
          text: 'text-amber-600 dark:text-amber-400',
          badge: 'bg-amber-500 text-black',
        };
      case 'safe':
      default:
        return {
          border: 'border-emerald-500/40',
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-700 dark:text-emerald-400',
          badge: 'bg-emerald-600 text-white',
        };
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              Cek Interaksi Obat
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 text-sky-800 border-sky-200 dark:bg-[#c8f93a]/15 dark:text-[#c8f93a] dark:border-[#c8f93a]/30 px-2.5 py-0.5 text-xs font-bold border">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#c8f93a] animate-pulse" />
              Drug Interaction Safety
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Analisis klinis kombinasi 2 obat atau lebih untuk mencegah duplikasi zat aktif dan efek samping berbahaya.
          </p>
        </div>
      </div>

      {/* ── Drug Input & Selector Card ── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 space-y-6 shadow-sm">
        <div>
          <h2 className="text-base font-extrabold text-[var(--color-text-primary)]">
            Pilih Obat yang Ingin Dibandingkan
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Ketik nama obat (merek dagang atau zat aktif) lalu tekan Tambah atau pilih dari rekomendasi.
          </p>
        </div>

        {/* Input with Autocomplete */}
        <div className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddDrug();
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none">
                💊
              </span>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Ketik nama obat (misal: Paracetamol, Sanmol, Ibuprofen, Amlodipine, dll.)..."
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-[var(--color-border)] bg-neutral-50 dark:bg-[#11141b] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] focus:ring-1 focus:ring-[#0284c7] dark:focus:ring-[#c8f93a] transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="px-6 py-3 text-xs font-black rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#c8f93a] dark:text-[#0c1004] dark:hover:bg-[#b5f524] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>+</span>
              <span>Tambah Obat</span>
            </button>
          </form>

          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] shadow-xl overflow-hidden py-1">
              {suggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddDrug(item)}
                  className="w-full text-left px-4 py-2.5 text-xs text-[var(--color-text-primary)] hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center justify-between"
                >
                  <span className="font-semibold">{item}</span>
                  <span className="text-[10px] text-[#0284c7] dark:text-[#c8f93a] font-mono font-bold">Pilih</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Drugs Tags */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] block">
            Daftar Obat Terpilih ({selectedDrugs.length}):
          </span>
          <div className="flex flex-wrap items-center gap-2 min-h-11 p-3 rounded-xl border border-[var(--color-border)] bg-neutral-50/50 dark:bg-black/20">
            {selectedDrugs.length === 0 ? (
              <span className="text-xs text-[var(--color-text-muted)] italic">
                Belum ada obat yang dipilih. Masukkan minimal 2 obat di atas.
              </span>
            ) : (
              selectedDrugs.map((drug, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-sky-50 border border-sky-200 text-sky-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 shadow-xs"
                >
                  <span>💊</span>
                  <span>{drug}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDrug(index)}
                    aria-label={`Hapus ${drug}`}
                    className="ml-1 text-neutral-400 hover:text-rose-500 font-bold transition-colors"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleCheck}
            disabled={selectedDrugs.length < 2 || isLoading}
            className="w-full sm:w-auto px-8 py-3 rounded-xl font-black text-xs bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#c8f93a] dark:text-[#0c1004] dark:hover:bg-[#b5f524] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md"
          >
            {isLoading ? (
              <>
                <span className="animate-spin text-sm">⏳</span>
                <span>Menganalisis Interaksi Klinis...</span>
              </>
            ) : (
              <>
                <span>🔬</span>
                <span>Periksa Interaksi Obat Sekarang</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Results Display ── */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          {(() => {
            const theme = getStatusColor(result.status_code);
            return (
              <div className={`rounded-2xl border p-6 ${theme.border} ${theme.bg} shadow-md space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl">{result.status_emoji}</span>
                    <div>
                      <h3 className={`text-lg font-black tracking-tight ${theme.text}`}>
                        {result.status}
                      </h3>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {result.summary}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${theme.badge}`}>
                    {result.status_code === 'dangerous'
                      ? '[X] Kontraindikasi'
                      : result.status_code === 'caution'
                      ? '[!] Perlu Evaluasi'
                      : '[✓] Kompatibel'}
                  </span>
                </div>

                {/* Interaction Details Breakdown */}
                {result.interactions && result.interactions.length > 0 ? (
                  <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">
                      Rincian Temuan Klinis ({result.interactions.length}):
                    </h4>
                    <div className="space-y-3">
                      {result.interactions.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="font-extrabold text-sm text-[var(--color-text-primary)]">
                              {item.title}
                            </h5>
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                                item.severity === 'Berbahaya'
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  : item.severity === 'Perhatian'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {item.severity}
                            </span>
                          </div>
                          <p className="text-[var(--color-text-secondary)] leading-relaxed">
                            <strong className="text-[var(--color-text-primary)]">Mekanisme:</strong> {item.mechanism}
                          </p>
                          <p className="text-slate-800 dark:text-emerald-300 bg-slate-100 dark:bg-emerald-500/5 p-2 rounded-lg border border-slate-200 dark:border-emerald-500/10 leading-relaxed">
                            <strong>Rekomendasi Farmasis:</strong> {item.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] text-xs text-[var(--color-text-secondary)] flex items-center gap-2">
                    <span>✅</span>
                    <span>
                      Tidak ditemukan interaksi negatif langsung antara kombinasi obat yang Anda pilih.
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Official Medical Disclaimer ── */}
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
            <p className="font-extrabold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
              <span>⚠️</span>
              <span>Peringatan &amp; Disclaimer Medis Resmi</span>
            </p>
            <p>{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
