/**
 * src/components/Sidebar.jsx
 * PharmaShield — Adaptive Admin Sidebar (Ocean Blue in Light Mode, Lime Green in Dark Mode).
 * Includes AKSESIBILITAS menu section below PENGATURAN.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from './AdminShell';
import { useAccessibility } from '@/lib/AccessibilityContext';

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconScanner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <path d="M14 14h3v3m0 4h4v-4m-4 0v-3h3"/>
    </svg>
  );
}
function IconDatasheet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
      <path d="m8.5 8.5 7 7"/>
    </svg>
  );
}
function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M12 8v4l3 3"/><path d="M3.05 11a9 9 0 1 0 .5-4.5L1 4"/>
      <path d="M1 1v6h6"/>
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M3 3v18h18"/>
      <path d="m7 16 4-4 4 4 4-4"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  );
}
function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l7 3.5v6c0 5-3.5 9-7 10.5-3.5-1.5-7-5.5-7-10.5v-6L12 2z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
function IconInteraction() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      <circle cx="18" cy="18" r="3"/>
      <circle cx="6" cy="6" r="3"/>
    </svg>
  );
}
function IconAccessibility() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/>
      <path d="M5 8h14M9 22V12l3-3 3 3v10"/>
      <path d="M7 22l2-5M17 22l-2-5"/>
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/',             label: 'Dashboard / Scanner', badge: null,         Icon: IconScanner     },
  { href: '/reminders',    label: 'Pengingat WhatsApp',  badge: 'Meta API',   Icon: IconBell        },
  { href: '/interactions', label: 'Cek Interaksi Obat',  badge: 'Fitur Baru', Icon: IconInteraction },
  { href: '/medicines',    label: 'Datasheet Obat ID',    badge: 'Indonesia',  Icon: IconDatasheet   },
  { href: '/history',      label: 'Riwayat Pindai',       badge: null,         Icon: IconHistory     },
  { href: '/analytics',    label: 'Analitik & Grafik',    badge: null,         Icon: IconAnalytics   },
  { href: '/settings',     label: 'Pengaturan',           badge: null,         Icon: IconSettings    },
];

// ─── Nav link ──────────────────────────────────────────────────────────────────
function NavLink({ href, label, badge, Icon, collapsed, onClick }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={[
        'relative flex items-center justify-between px-3.5 py-3 rounded-2xl mx-3 my-1',
        'text-xs font-bold transition-all duration-180 group',
        isActive
          ? 'bg-[#0284c7] text-white shadow-md shadow-sky-500/25 font-extrabold dark:bg-[#c8f93a] dark:text-[#0c1004] dark:shadow-[#c8f93a]/20'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/[0.06]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon />
        {!collapsed && (
          <span className="truncate">{label}</span>
        )}
      </div>

      {!collapsed && (
        <div>
          {isActive ? (
            <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 dark:bg-black/80 dark:text-[#c8f93a] dark:border-transparent">
              Aktif
            </span>
          ) : badge ? (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-slate-600 dark:text-neutral-300">
              {badge}
            </span>
          ) : null}
        </div>
      )}
    </Link>
  );
}

// ─── Accessibility Button (special — triggers modal, not route) ───────────────
function A11yNavButton({ collapsed }) {
  const { toggleA11yModal } = useSidebar();
  const { activeCount } = useAccessibility();

  return (
    <button
      type="button"
      onClick={toggleA11yModal}
      title={collapsed ? 'Aksesibilitas' : undefined}
      aria-label="Buka pengaturan aksesibilitas"
      className="relative w-full flex items-center justify-between px-3.5 py-3 rounded-2xl mx-3 my-1 text-xs font-bold transition-all duration-150 text-[#0284c7] hover:bg-sky-50 hover:text-[#0369a1] dark:text-[#38BDF8] dark:hover:bg-[#38BDF8]/10 dark:hover:text-[#7DD3FC] group"
      style={{ width: 'calc(100% - 24px)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <IconAccessibility />
        {!collapsed && <span className="truncate">Aksesibilitas</span>}
      </div>

      {!collapsed && activeCount > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0284c7] text-white dark:bg-[#38BDF8] dark:text-[#05080E] text-[10px] font-black shrink-0">
          {activeCount}
        </span>
      )}

      {/* Collapsed mode: show count badge as corner dot */}
      {collapsed && activeCount > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#0284c7] text-white dark:bg-[#38BDF8] dark:text-[#05080E] text-[9px] font-black flex items-center justify-center">
          {activeCount}
        </span>
      )}
    </button>
  );
}

// ─── Main Sidebar Component ───────────────────────────────────────────────────
export default function Sidebar() {
  const { collapsed, mobileOpen, toggleCollapse, closeMobile } = useSidebar();
  const router = useRouter();
  const [sidebarSearch, setSidebarSearch] = useState('');

  return (
    <aside
      className={[
        'sidebar',
        collapsed  ? 'collapsed'   : '',
        mobileOpen ? 'mobile-open' : '',
      ].join(' ')}
      aria-label="Navigasi sidebar MedikaGuard"
    >
      {/* ── Brand logo ── */}
      <div className={[
        'flex items-center border-b border-[var(--color-border)] shrink-0',
        collapsed ? 'justify-center px-0 py-4 h-16' : 'gap-3 px-5 py-4 h-16',
      ].join(' ')}>
        <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[#0284c7] text-white shadow-lg shadow-sky-500/25 dark:bg-[#c8f93a] dark:text-[#0c1004] dark:shadow-[#c8f93a]/25 font-black shrink-0">
          <ShieldIcon />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-text-primary)] font-black text-base tracking-tight truncate">MedikaGuard</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#f1f5f9] text-[#0f172a] border border-[#cbd5e1] dark:bg-[#c8f93a]/15 dark:text-[#c8f93a] dark:border-[#c8f93a]/30">ID</span>
            </div>
            <p className="text-[var(--color-text-muted)] text-[10px] font-medium tracking-wide">Healthcare Dashboard</p>
          </div>
        )}
      </div>

      {/* ── Search in Sidebar ── */}
      {!collapsed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (sidebarSearch.trim()) {
              router.push(`/medicines?q=${encodeURIComponent(sidebarSearch.trim())}`);
              closeMobile();
            }
          }}
          className="px-3 pt-4"
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 text-xs pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Cari obat... (Enter)"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7] dark:bg-black/40 dark:border-[var(--color-border)] dark:text-[var(--color-text-primary)] dark:placeholder-[var(--color-text-muted)] dark:focus:border-[#c8f93a] dark:focus:ring-[#c8f93a] transition-all"
            />
          </div>
        </form>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3" aria-label="Main navigation">
        {/* MENU UTAMA */}
        {!collapsed && (
          <p className="px-5 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
            Menu Utama
          </p>
        )}
        {NAV_ITEMS.map(({ href, label, badge, Icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            badge={badge}
            Icon={Icon}
            collapsed={collapsed}
            onClick={closeMobile}
          />
        ))}

        {/* AKSESIBILITAS section */}
        <div className="mt-3">
          {!collapsed && (
            <p className="px-5 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-[#0284c7]/70 dark:text-[#38BDF8]/60">
              Aksesibilitas
            </p>
          )}
          {collapsed && <div className="mx-3 my-2 border-t border-[var(--color-border)]" />}
          <A11yNavButton collapsed={collapsed} />
        </div>
      </nav>

      {/* ── Collapse toggle (desktop only) ── */}
      <div className="border-t border-[var(--color-border)] p-3 hidden lg:block shrink-0">
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}
          className={[
            'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl',
            'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5',
            'text-xs font-bold transition-all duration-150',
          ].join(' ')}
        >
          <span className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}>
            <IconChevron />
          </span>
          {!collapsed && <span>Perkecil Navigasi</span>}
        </button>
      </div>

      {/* ── System status badge ── */}
      {!collapsed && (
        <div className="mx-3 mb-4 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 dark:bg-[#161922] dark:border-[var(--color-border)] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#c8f93a] animate-pulse-dot" aria-hidden="true" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-neutral-200">AI Guard &amp; OCR</span>
            </div>
            <span className="text-[9px] font-bold text-[#0284c7] dark:text-[#c8f93a] uppercase">Siap</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-neutral-500 mt-1 leading-tight">
            Database obat umum Indonesia tersinkronisasi.
          </p>
        </div>
      )}
    </aside>
  );
}
