/**
 * src/components/Navbar.jsx
 * PharmaShield — High-contrast monochrome sticky navigation bar.
 * Black background, white text, active-page pill in white/black inversion.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/',        label: '📸 Scanner',  emoji: true },
  { href: '/history', label: '📋 Riwayat',  emoji: true },
];

/** Shield SVG icon */
function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-black text-white border-b border-white/10 backdrop-blur-sm">
      <nav
        className="max-w-5xl mx-auto h-16 px-4 md:px-6 flex items-center justify-between"
        aria-label="Navigasi utama PharmaShield"
      >
        {/* ── Logo ── */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          aria-label="PharmaShield – Beranda"
        >
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-white text-black shadow-sm transition-transform group-hover:scale-105">
            <ShieldIcon />
          </span>
          <span className="text-[1.05rem] font-extrabold tracking-tight leading-none">
            PharmaShield
          </span>
        </Link>

        {/* ── Navigation links ── */}
        <div className="flex items-center gap-1" role="list">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                role="listitem"
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150',
                  isActive
                    ? 'bg-white text-black shadow-sm'
                    : 'text-white/65 hover:text-white hover:bg-white/10',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}