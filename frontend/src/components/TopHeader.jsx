/**
 * src/components/TopHeader.jsx
 * PharmaShield — Adaptive Top Header with Theme Switcher & Auth state.
 */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from './AdminShell';
import { useAuth } from '@/lib/AuthContext';
import { fetchHistory } from '@/lib/api';
import { INDONESIA_MEDICINES } from '@/lib/indonesiaMedicineCatalog';
import { useTheme } from '@/lib/ThemeContext';

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  );
}

const PAGE_TITLES = {
  '/':             { label: 'Dashboard',              sub: 'Scanner Obat & AI Guard' },
  '/reminders':    { label: 'Pengingat WhatsApp',     sub: 'Pengingat Obat Pasien & Lansia' },
  '/interactions': { label: 'Interaksi Obat',         sub: 'Drug Interaction Safety Checker' },
  '/medicines':    { label: 'Datasheet ID',            sub: 'Katalog Obat Penyakit Umum' },
  '/history':      { label: 'Riwayat',                sub: 'Log Pemindaian Sistem' },
  '/analytics':    { label: 'Analitik & Grafik',      sub: 'Analitik & Visualisasi Metrik' },
  '/settings':     { label: 'Pengaturan',             sub: 'Konfigurasi Endpoint & OCR' },
};

export default function TopHeader({ onOpenAuth, onOpenProfile }) {
  const { toggleMobile } = useSidebar();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const page = PAGE_TITLES[pathname] ?? { label: 'MedikaGuard', sub: 'Dashboard' };

  const [stats, setStats] = useState({ total: 0, safe: 0, warning: 0 });
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  useEffect(() => {
    fetchHistory()
      .then((data) => {
        setStats({
          total: data.total ?? 0,
          safe: data.safe ?? 0,
          warning: data.warning ?? 0,
        });
      })
      .catch(() => {});
  }, [pathname]);

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'MG';

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 h-16 px-4 sm:px-6 bg-white/95 dark:bg-[#11141a]/95 backdrop-blur-md border-b border-slate-200 dark:border-[var(--color-border)] shadow-xs">
      {/* Mobile hamburger */}
      <button
        onClick={toggleMobile}
        aria-label="Buka menu navigasi"
        className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
      >
        <HamburgerIcon />
      </button>

      {/* Breadcrumb */}
      <div className="hidden sm:flex flex-col leading-none mr-2">
        <span className="text-[11px] text-[var(--color-text-muted)] font-semibold tracking-wide uppercase">
          MedikaGuard / <span className="text-[#0284c7] dark:text-[#10b981]">{page.label}</span>
        </span>
        <span className="text-sm font-extrabold text-[var(--color-text-primary)] mt-1">{page.sub}</span>
      </div>

      {/* Quick status chips */}
      <div className="flex items-center gap-2.5 ml-auto">
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-[#161922] border border-slate-200 dark:border-[var(--color-border)] text-slate-800 dark:text-neutral-300">
          <span>📊</span>
          <span>{stats.total}</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">Pindai</span>
        </div>

        <div data-status="green" className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 status-green">
          <span className="font-mono text-[10px] font-black">[✓]</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>{stats.safe}</span>
          <span className="text-[10px] opacity-80">Aman</span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-sky-50 dark:bg-[#10b981]/10 border border-sky-200 dark:border-[#10b981]/30 text-sky-700 dark:text-[#10b981]">
          <span>💊</span>
          <span>{INDONESIA_MEDICINES.length}</span>
          <span className="text-[10px] opacity-80">Datasheet ID</span>
        </div>

        {/* Medical Profile Indicator */}
        {isAuthenticated && (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-sky-200 bg-sky-50 text-[#0284c7] hover:bg-sky-100 dark:border-[#10b981]/30 dark:bg-[#10b981]/10 dark:text-[#10b981] dark:hover:bg-[#10b981]/20 transition-all"
          >
            <span>🩺</span>
            <span className="hidden sm:inline">Profil Medis</span>
          </button>
        )}

        {/* Theme Toggle Button (Hitam / Putih) */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Ganti ke Mode Putih (Light)' : 'Ganti ke Mode Hitam (Dark)'}
          aria-label="Toggle tema putih / hitam"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 hover:border-slate-300 dark:border-[var(--color-border)] dark:bg-[var(--color-card-bg)] dark:text-[var(--color-text-primary)] dark:hover:border-[#10b981]/50 dark:hover:bg-white/10 transition-all shadow-xs"
        >
          <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="hidden sm:inline font-bold">
            {theme === 'dark' ? 'Tema Putih' : 'Tema Hitam'}
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-200 dark:bg-[var(--color-border)] mx-1" />

        {/* Auth Button or User Profile Dropdown */}
        {isAuthenticated ? (
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2.5 pl-1 focus:outline-none"
            >
              <div className="w-9 h-9 rounded-xl bg-[#0284c7] text-white shadow-md shadow-sky-500/25 dark:bg-[#10b981] dark:text-[#0f172a] dark:shadow-[#10b981]/25 flex items-center justify-center font-black text-xs shrink-0">
                {initials}
              </div>
              <div className="hidden md:flex flex-col text-left leading-none">
                <span className="text-xs font-extrabold text-[var(--color-text-primary)] truncate max-w-[120px]">
                  {user?.full_name || 'Pengguna'}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate max-w-[120px]">
                  {user?.email || 'Akun Aktif'}
                </span>
              </div>
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl z-30 animate-fade-in text-xs dark:border-white/10 dark:bg-[#161922]">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{user?.full_name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onOpenProfile) onOpenProfile();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-700 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-2"
                >
                  <span>📋</span> Edit Profil Medis
                </button>
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                    router.push('/login');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 flex items-center gap-2"
                >
                  <span>🚪</span> Keluar (Logout)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-bold text-slate-800 dark:text-neutral-200 transition-all"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="px-3.5 py-1.5 rounded-xl bg-[#0284c7] text-white hover:bg-[#075985] shadow-sky-500/20 dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] text-xs font-black transition-all shadow-xs"
            >
              Daftar Akun
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
