/**
 * src/components/Sidebar.jsx
 * PharmaShield — Dark Mode Admin Sidebar with Neon Lime Green Accents (#c8f93a).
 * Mengacu pada referensi UI/UX: Tombol aktif berbentuk kapsul hijau neon terang dengan teks hitam.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './AdminShell';

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

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/',          label: 'Dasbor / Scanner',  badge: null,       Icon: IconScanner   },
  { href: '/medicines', label: 'Datasheet Obat ID', badge: 'Indonesia', Icon: IconDatasheet },
  { href: '/history',   label: 'Riwayat Pindai',    badge: null,       Icon: IconHistory   },
  { href: '/analytics', label: 'Analitik & Grafik', badge: null,       Icon: IconAnalytics },
  { href: '/settings',  label: 'Pengaturan',        badge: null,       Icon: IconSettings  },
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
          ? 'bg-[#c8f93a] text-[#0c1004] shadow-md shadow-[#c8f93a]/20 font-extrabold'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]',
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
            <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-black/80 text-[#c8f93a]">
              Aktif
            </span>
          ) : badge ? (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
              {badge}
            </span>
          ) : null}
        </div>
      )}
    </Link>
  );
}

// ─── Main Sidebar Component ───────────────────────────────────────────────────
export default function Sidebar() {
  const { collapsed, mobileOpen, toggleCollapse, closeMobile } = useSidebar();

  return (
    <aside
      className={[
        'sidebar',
        collapsed  ? 'collapsed'   : '',
        mobileOpen ? 'mobile-open' : '',
      ].join(' ')}
      aria-label="Navigasi sidebar PharmaShield"
    >
      {/* ── Brand logo ── */}
      <div className={[
        'flex items-center border-b border-[var(--color-border)] shrink-0',
        collapsed ? 'justify-center px-0 py-4 h-16' : 'gap-3 px-5 py-4 h-16',
      ].join(' ')}>
        <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[#c8f93a] text-[#0c1004] font-black shadow-lg shadow-[#c8f93a]/25 shrink-0">
          <ShieldIcon />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-black text-base tracking-tight truncate">PharmaShield</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#c8f93a]/15 text-[#c8f93a] border border-[#c8f93a]/30">ID</span>
            </div>
            <p className="text-neutral-500 text-[10px] font-medium tracking-wide">Dark Neon Dashboard</p>
          </div>
        )}
      </div>

      {/* ── Search in Sidebar (Like Reference) ── */}
      {!collapsed && (
        <div className="px-3 pt-4">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">
              🔍
            </span>
            <input
              type="text"
              readOnly
              placeholder="Cari fitur... (Ctrl+K)"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-black/40 border border-[var(--color-border)] text-neutral-400 placeholder-neutral-600 cursor-default"
            />
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3" aria-label="Main navigation">
        {!collapsed && (
          <p className="px-5 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">
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
      </nav>

      {/* ── Collapse toggle (desktop only) ── */}
      <div className="border-t border-[var(--color-border)] p-3 hidden lg:block shrink-0">
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}
          className={[
            'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl',
            'text-neutral-400 hover:text-white hover:bg-white/5',
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
        <div className="mx-3 mb-4 px-4 py-3 rounded-2xl bg-[#161922] border border-[var(--color-border)] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c8f93a] animate-pulse-dot" aria-hidden="true" />
              <span className="text-[11px] font-bold text-neutral-200">AI Guard &amp; OCR</span>
            </div>
            <span className="text-[9px] font-bold text-[#c8f93a] uppercase">Siap</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1 leading-tight">
            Database obat umum Indonesia tersinkronisasi.
          </p>
        </div>
      )}
    </aside>
  );
}
