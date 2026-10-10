/**
 * src/components/AdminShell.jsx
 * PharmaShield — Full admin layout shell (Dark Mode & Neon Lime Style).
 * Collapsible Sidebar + Sticky TopHeader + Dark Content Area.
 */
'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import Sidebar   from './Sidebar';
import TopHeader from './TopHeader';

const SidebarCtx = createContext(null);
export function useSidebar() { return useContext(SidebarCtx); }

export default function AdminShell({ children }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleCollapse  = useCallback(() => setCollapsed((v) => !v), []);
  const toggleMobile    = useCallback(() => setMobileOpen((v) => !v), []);
  const closeMobile     = useCallback(() => setMobileOpen(false), []);

  const ctx = { collapsed, mobileOpen, toggleCollapse, toggleMobile, closeMobile };

  return (
    <SidebarCtx.Provider value={ctx}>
      <div className="admin-layout min-h-screen bg-[#0c0e12] text-neutral-100">

        {/* ── Sidebar ── */}
        <Sidebar />

        {/* ── Mobile backdrop ── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 lg:hidden"
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}

        {/* ── Main content column ── */}
        <div
          className={[
            'main-content flex flex-col min-h-screen bg-[#0c0e12]',
            collapsed ? 'sidebar-collapsed' : '',
          ].join(' ')}
        >
          {/* Sticky top header */}
          <TopHeader />

          {/* Page body */}
          <main
            id="main-content"
            className="flex-1 px-4 sm:px-6 py-6 overflow-x-hidden"
          >
            {children}
          </main>

          {/* Footer */}
          <footer className="text-center text-xs text-neutral-500 py-5 px-6 border-t border-[var(--color-border)] bg-[#0c0e12]">
            © 2026 <span className="font-extrabold text-[#c8f93a]">PharmaShield ID</span> — Sistem Keamanan Konsumsi Obat &amp; Datasheet Penyakit Umum Indonesia
          </footer>
        </div>
      </div>
    </SidebarCtx.Provider>
  );
}
