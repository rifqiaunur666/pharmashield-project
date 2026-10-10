/**
 * src/components/TopHeader.jsx
 * PharmaShield — Dark Mode Top Header with Neon Lime Accents.
 * Sesuai referensi: Header gelap, search bar elegan, quick metric chips tanpa pelacak kedaluwarsa.
 */
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSidebar }  from './AdminShell';
import { fetchHistory } from '@/lib/api';
import { getHistory }   from '@/lib/history';
import { INDONESIA_MEDICINES } from '@/lib/indonesiaMedicineCatalog';

// ─── Icons ────────────────────────────────────────────────────────────────────
function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-neutral-500">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

// ─── Breadcrumb label map ─────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/':          { label: 'Dasbor',        sub: 'Scanner Obat & AI Guard' },
  '/medicines': { label: 'Datasheet ID',  sub: 'Katalog Obat Penyakit Umum' },
  '/history':   { label: 'Riwayat',       sub: 'Log Pemindaian Sistem' },
  '/analytics': { label: 'Analitik',      sub: 'Statistik & Metrik Evaluasi' },
  '/settings':  { label: 'Pengaturan',    sub: 'Konfigurasi Endpoint & OCR' },
};

export default function TopHeader() {
  const { toggleMobile } = useSidebar();
  const pathname = usePathname();
  const page     = PAGE_TITLES[pathname] ?? { label: 'PharmaShield', sub: 'Dasbor' };

  const [search, setSearch] = useState('');
  const [stats, setStats]   = useState({ total: 0, safe: 0, warning: 0 });

  // Load quick stats from API history with fallback (tanpa expired)
  useEffect(() => {
    fetchHistory()
      .then((data) => {
        setStats({
          total: data.total ?? 0,
          safe: data.safe ?? 0,
          warning: data.warning ?? 0,
        });
      })
      .catch(() => {
        try {
          const hist = getHistory();
          setStats({
            total: hist.length,
            safe: hist.filter((h) => h.status === 'green').length,
            warning: hist.filter((h) => h.status === 'yellow').length,
          });
        } catch {}
      });
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 h-16 px-4 sm:px-6 bg-[#11141a]/95 backdrop-blur-md border-b border-[var(--color-border)] shadow-md">

      {/* ── Mobile hamburger ── */}
      <button
        onClick={toggleMobile}
        aria-label="Buka menu navigasi"
        className="lg:hidden p-2 rounded-xl text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
      >
        <HamburgerIcon />
      </button>

      {/* ── Breadcrumb ── */}
      <div className="hidden sm:flex flex-col leading-none mr-2">
        <span className="text-[11px] text-neutral-500 font-semibold tracking-wide uppercase">
          PharmaShield / <span className="text-[#c8f93a]">{page.label}</span>
        </span>
        <span className="text-sm font-extrabold text-white mt-1">{page.sub}</span>
      </div>

      {/* ── Search bar ── */}
      <div className="relative flex-1 max-w-xs">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari obat, fungsi, gejala…"
          className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[var(--color-border)] bg-[#161922] text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-[#c8f93a] focus:ring-1 focus:ring-[#c8f93a] transition-all"
        />
      </div>

      {/* ── Quick status chips (Clean, without expiry date) ── */}
      <div className="flex items-center gap-2.5 ml-auto">
        {/* Total Scans */}
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#161922] border border-[var(--color-border)] text-neutral-300">
          <span>📊</span>
          <span>{stats.total}</span>
          <span className="text-[10px] text-neutral-500">Pindai</span>
        </div>

        {/* Aman */}
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{stats.safe}</span>
          <span className="text-[10px] opacity-80">Aman</span>
        </div>

        {/* Datasheet Counter */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#c8f93a]/10 border border-[#c8f93a]/30 text-[#c8f93a]">
          <span>💊</span>
          <span>{INDONESIA_MEDICINES.length}</span>
          <span className="text-[10px] text-[#c8f93a]/80">Datasheet ID</span>
        </div>

        {/* Notification bell */}
        <button
          aria-label="Notifikasi"
          className="relative p-2.5 rounded-xl text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <BellIcon />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#c8f93a] animate-pulse-dot" aria-hidden="true" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--color-border)] mx-1" />

        {/* User profile avatar (Dark Neon Style) */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-9 h-9 rounded-xl bg-[#c8f93a] text-[#0c1004] flex items-center justify-center font-black text-xs shadow-md shadow-[#c8f93a]/25 shrink-0">
            PS
          </div>
          <div className="hidden md:flex flex-col leading-none">
            <span className="text-xs font-extrabold text-white">Admin Medis</span>
            <span className="text-[10px] text-neutral-500 mt-0.5">PharmaShield ID</span>
          </div>
        </div>
      </div>
    </header>
  );
}
