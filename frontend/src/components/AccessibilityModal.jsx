/**
 * src/components/AccessibilityModal.jsx
 * PharmaShield — Floating Accessibility Modal (Pixel-Perfect & Adaptive Light/Dark Theme).
 *
 * Implements:
 *   - Header: "AKSESIBILITAS" (Ocean Blue in light, Sky Blue in dark) + close button
 *   - Grid 2-col: 6 main toggle buttons with top-right active dot
 *   - Section: Mode Buta Warna & Visibilitas (Protanopia/Deuteranopia, Tritanopia, Low-Vision)
 *   - Section: Kejenuhan (Saturasi Rendah, Tinggi, Desaturasi)
 *   - Footer: Atur Ulang Semua (Reset All)
 */
'use client';

import { useEffect, useRef } from 'react';
import { useAccessibility } from '@/lib/AccessibilityContext';

// ─── Icon helpers ─────────────────────────────────────────────────────────────
const IcoTextSize = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor">
    <text x="0" y="18" fontSize="20" fontWeight="900" fontFamily="serif">T</text>
    <text x="14" y="18" fontSize="11" fontWeight="700" fontFamily="serif">T</text>
  </svg>
);
const IcoDyslexia = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor">
    <text x="0" y="17" fontSize="12" fontWeight="800" fontFamily="sans-serif">Df</text>
  </svg>
);
const IcoPause = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" rx="1" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" rx="1" />
  </svg>
);
const IcoCursor = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" stroke="none">
    <path d="M5 3l14 9-7 1.5L9.5 20 5 3Z" />
  </svg>
);
const IcoReset = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
const IcoDropLow = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 C8 7 5 11 5 15a7 7 0 0 0 14 0c0-4-3-8-7-13z" />
    <path d="M12 17v2" stroke="currentColor" strokeOpacity="0.4" />
  </svg>
);
const IcoDropHigh = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2 C8 7 5 11 5 15a7 7 0 0 0 14 0c0-4-3-8-7-13z" />
  </svg>
);
const IcoDropGray = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 C8 7 5 11 5 15a7 7 0 0 0 14 0c0-4-3-8-7-13z" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const IcoClose = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="m18 6-12 12M6 6l12 12" />
  </svg>
);

// ─── Toggle Button Card ───────────────────────────────────────────────────────
function ToggleCard({ label, Icon, active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`relative flex flex-col items-center justify-center gap-2 p-3 sm:p-3.5 rounded-xl border transition-all duration-150 text-center select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] ${
        active
          ? 'bg-sky-50 border-[#0284c7] text-[#0284c7] font-black dark:bg-[#0a1929] dark:border-[#38BDF8] dark:text-[#38BDF8]'
          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-white dark:bg-[#0D1729] dark:border-[#1E2D42] dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white'
      } ${className}`}
    >
      {/* Active dot indicator */}
      {active && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#38BDF8] shadow-[0_0_6px_#0284c7] dark:shadow-[0_0_6px_#38BDF8]" />
      )}
      <span className={active ? 'text-[#0284c7] dark:text-[#38BDF8]' : 'text-slate-500 dark:text-slate-400'}>
        <Icon />
      </span>
      <span className="text-[11px] font-bold leading-tight">{label}</span>
    </button>
  );
}

// ─── Saturation Button ────────────────────────────────────────────────────────
function SatButton({ label, Icon, value, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 sm:py-3 px-2 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] ${
        active
          ? 'border-[#0284c7] bg-sky-50 text-[#0284c7] font-bold dark:border-[#38BDF8] dark:bg-[#0a1929] dark:text-[#38BDF8]'
          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-[#1E2D42] dark:bg-[#0D1729] dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'
      }`}
    >
      <Icon />
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function AccessibilityModal() {
  const { prefs, toggle, set, resetAll, modalOpen, closeModal } = useAccessibility();
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, closeModal]);

  // Click-outside to close
  useEffect(() => {
    if (!modalOpen) return;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) closeModal();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onClick), 80);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onClick); };
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;

  const cbMode = prefs.colorblindMode;
  const satMode = prefs.saturationMode;

  const setColorblind = (val) => set('colorblindMode', cbMode === val ? 'none' : val);
  const setSaturation = (val) => set('saturationMode', satMode === val ? 'none' : val);

  return (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-start pointer-events-none"
      aria-modal="true"
      role="dialog"
      aria-label="Modal Aksesibilitas"
    >
      {/* Panel container - anchored next to sidebar on desktop, centered on mobile */}
      <div
        ref={panelRef}
        data-a11y-modal="true"
        className="a11y-modal-panel pointer-events-auto fixed lg:absolute inset-x-3 lg:inset-x-auto lg:left-[268px] top-16 sm:top-20 max-w-[360px] sm:max-w-[380px] mx-auto lg:mx-0 w-full max-h-[calc(100vh-80px)] sm:max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl border border-slate-200 dark:border-[#1E2D42] bg-white dark:bg-[#05080E] shadow-2xl shadow-slate-900/15 dark:shadow-black/80 animate-fade-in"
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-[#1E2D42] sticky top-0 bg-white/95 dark:bg-[#05080E]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#0284c7] dark:text-[#38BDF8] font-black uppercase tracking-[0.18em]">
              Aksesibilitas
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#38BDF8] animate-pulse" />
          </div>
          <button
            onClick={closeModal}
            aria-label="Tutup modal aksesibilitas"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]"
          >
            <IcoClose />
          </button>
        </div>

        <div className="p-4 space-y-5">

          {/* ── Grid 2-col: 4 Main Toggles (Symmetrical 2x2) ── */}
          <div className="grid grid-cols-2 gap-2.5">
            <ToggleCard
              label="Teks Lebih Besar"
              Icon={IcoTextSize}
              active={prefs.isLargeText}
              onToggle={() => toggle('isLargeText')}
            />
            <ToggleCard
              label="Ramah Disleksia"
              Icon={IcoDyslexia}
              active={prefs.isDyslexiaFont}
              onToggle={() => toggle('isDyslexiaFont')}
            />
            <ToggleCard
              label="Jeda Animasi"
              Icon={IcoPause}
              active={prefs.isPauseAnimation}
              onToggle={() => toggle('isPauseAnimation')}
            />
            <ToggleCard
              label="Kursor Besar"
              Icon={IcoCursor}
              active={prefs.isLargeCursor}
              onToggle={() => toggle('isLargeCursor')}
            />
          </div>

          {/* ── Mode Buta Warna & Visibilitas ── */}
          <div className="space-y-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Mode Buta Warna &amp; Visibilitas
            </p>

            {/* Protanopia / Deuteranopia */}
            <button
              type="button"
              onClick={() => setColorblind('protanopia')}
              aria-pressed={cbMode === 'protanopia'}
              className={`relative w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] ${
                cbMode === 'protanopia'
                  ? 'border-[#0284c7] bg-sky-50 dark:border-[#38BDF8] dark:bg-[#0a1929]'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-[#1E2D42] dark:bg-[#0D1729] dark:hover:border-slate-600'
              }`}
            >
              <div className="flex gap-1 mt-0.5 shrink-0">
                <span className="w-5 h-5 rounded-full bg-[#2563eb] flex items-center justify-center text-white text-[8px] font-black">✓</span>
                <span className="w-5 h-5 rounded-full bg-[#f97316] flex items-center justify-center text-white text-[8px] font-black">!</span>
                <span className="w-5 h-5 rounded-full bg-[#7e22ce] flex items-center justify-center text-white text-[8px] font-black">×</span>
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p className={`text-xs font-bold leading-snug ${cbMode === 'protanopia' ? 'text-[#0284c7] dark:text-[#38BDF8]' : 'text-slate-900 dark:text-slate-200'}`}>
                  Protanopia &amp; Deuteranopia
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                  Merah-Hijau → Biru/Oranye/Ungu + simbol
                </p>
              </div>
              {cbMode === 'protanopia' && (
                <span className="absolute top-3.5 right-3 w-2.5 h-2.5 rounded-full bg-[#0284c7] dark:bg-[#38BDF8] shadow-[0_0_6px_#0284c7] dark:shadow-[0_0_6px_#38BDF8]" />
              )}
            </button>

            {/* Tritanopia */}
            <button
              type="button"
              onClick={() => setColorblind('tritanopia')}
              aria-pressed={cbMode === 'tritanopia'}
              className={`relative w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] ${
                cbMode === 'tritanopia'
                  ? 'border-[#0284c7] bg-sky-50 dark:border-[#38BDF8] dark:bg-[#0a1929]'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-[#1E2D42] dark:bg-[#0D1729] dark:hover:border-slate-600'
              }`}
            >
              <div className="flex gap-1 mt-0.5 shrink-0">
                <span className="w-5 h-5 rounded-full bg-[#0f766e] flex items-center justify-center text-white text-[8px] font-black">✓</span>
                <span className="w-5 h-5 rounded-full bg-[#6b21a8] flex items-center justify-center text-white text-[8px] font-black">!</span>
                <span className="w-5 h-5 rounded-full bg-[#9f1239] flex items-center justify-center text-white text-[8px] font-black">×</span>
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p className={`text-xs font-bold leading-snug ${cbMode === 'tritanopia' ? 'text-[#0284c7] dark:text-[#38BDF8]' : 'text-slate-900 dark:text-slate-200'}`}>
                  Tritanopia
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                  Biru-Kuning → Teal/Ungu/Merah + simbol
                </p>
              </div>
              {cbMode === 'tritanopia' && (
                <span className="absolute top-3.5 right-3 w-2.5 h-2.5 rounded-full bg-[#0284c7] dark:bg-[#38BDF8] shadow-[0_0_6px_#0284c7] dark:shadow-[0_0_6px_#38BDF8]" />
              )}
            </button>

            {/* Low Vision / Mata Minus */}
            <button
              type="button"
              onClick={() => setColorblind('low-vision')}
              aria-pressed={cbMode === 'low-vision'}
              className={`relative w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] ${
                cbMode === 'low-vision'
                  ? 'border-[#0284c7] bg-sky-50 dark:border-[#38BDF8] dark:bg-[#0a1929]'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-[#1E2D42] dark:bg-[#0D1729] dark:hover:border-slate-600'
              }`}
            >
              <div className="flex gap-1 mt-0.5 shrink-0">
                <span className="w-5 h-5 rounded border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 text-[8px] font-black">✓</span>
                <span className="w-5 h-5 rounded border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 text-[8px] font-black">!</span>
                <span className="w-5 h-5 rounded border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 text-[8px] font-black">×</span>
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p className={`text-xs font-bold leading-snug ${cbMode === 'low-vision' ? 'text-[#0284c7] dark:text-[#38BDF8]' : 'text-slate-900 dark:text-slate-200'}`}>
                  Kontras Ekstrem / Mata Minus
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                  WCAG AAA — batas tegas 2px, teks pekat, outline 4px
                </p>
              </div>
              {cbMode === 'low-vision' && (
                <span className="absolute top-3.5 right-3 w-2.5 h-2.5 rounded-full bg-[#0284c7] dark:bg-[#38BDF8] shadow-[0_0_6px_#0284c7] dark:shadow-[0_0_6px_#38BDF8]" />
              )}
            </button>
          </div>

          {/* ── Saturasi / Kejenuhan ── */}
          <div className="space-y-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Kejenuhan</p>
            <div className="flex gap-2">
              <SatButton label="Saturasi Rendah" Icon={IcoDropLow} value="low" active={satMode === 'low'} onSelect={setSaturation} />
              <SatButton label="Saturasi Tinggi" Icon={IcoDropHigh} value="high" active={satMode === 'high'} onSelect={setSaturation} />
              <SatButton label="Desaturasi" Icon={IcoDropGray} value="grayscale" active={satMode === 'grayscale'} onSelect={setSaturation} />
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="sticky bottom-0 px-4 py-3 border-t border-slate-200 dark:border-[#1E2D42] bg-white dark:bg-[#05080E]">
          <button
            type="button"
            onClick={resetAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-800 hover:text-slate-950 hover:bg-slate-200 dark:border-[#1E2D42] dark:bg-[#0D1729] dark:text-slate-300 dark:hover:text-white dark:hover:border-slate-500 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]"
          >
            <IcoReset />
            <span>Atur Ulang Semua</span>
          </button>
        </div>
      </div>
    </div>
  );
}
