/**
 * src/components/AdminShell.jsx
 * PharmaShield — Full Admin Layout Shell with Global Modals & Accessibility.
 */
'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';
import AuthModal from './AuthModal';
import MedicalProfileModal from './MedicalProfileModal';
import AccessibilityModal from './AccessibilityModal';
import { useAuth } from '@/lib/AuthContext';
import { AccessibilityProvider, useAccessibility } from '@/lib/AccessibilityContext';

// ─── Sidebar context (usable from Sidebar, page.jsx etc.) ────────────────────
const SidebarCtx = createContext(null);
export function useSidebar() { return useContext(SidebarCtx); }

// ─── Inner shell — needs AccessibilityProvider above it ──────────────────────
function AdminShellInner({ children }) {
  const [collapsed,       setCollapsed]       = useState(false);
  const [mobileOpen,      setMobileOpen]      = useState(false);
  const [authModalOpen,   setAuthModalOpen]   = useState(false);
  const [profileModalOpen,setProfileModalOpen]= useState(false);
  const { user, saveMedicalProfile } = useAuth();
  const { toggleModal: toggleA11y } = useAccessibility();

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), []);
  const toggleMobile   = useCallback(() => setMobileOpen((v) => !v), []);
  const closeMobile    = useCallback(() => setMobileOpen(false), []);

  const ctx = {
    collapsed,
    mobileOpen,
    toggleCollapse,
    toggleMobile,
    closeMobile,
    openAuthModal:    () => setAuthModalOpen(true),
    openProfileModal: () => setProfileModalOpen(true),
    toggleA11yModal:  toggleA11y,
  };

  return (
    <SidebarCtx.Provider value={ctx}>
      <div className="admin-layout min-h-screen bg-[var(--color-body-bg)] text-[var(--color-text-primary)]">
        <Sidebar />

        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 lg:hidden"
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}

        <div
          className={[
            'main-content flex flex-col min-h-screen bg-[var(--color-body-bg)]',
            collapsed ? 'sidebar-collapsed' : '',
          ].join(' ')}
        >
          <TopHeader
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenProfile={() => setProfileModalOpen(true)}
          />

          <main id="main-content" className="flex-1 px-4 sm:px-6 py-6 overflow-x-hidden">
            {children}
          </main>

          <footer className="text-center text-xs text-[var(--color-text-secondary)] py-5 px-6 border-t border-[var(--color-border)] bg-[var(--color-sidebar-bg)]">
            © 2026 <span className="font-extrabold text-[#0f172a] dark:text-[#10b981]">MedikaGuard ID</span> — Sistem Keamanan Konsumsi Obat &amp; Datasheet Penyakit Umum Indonesia
          </footer>
        </div>

        {/* Global Auth Modal */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={(action) => {
            if (action === 'register') setProfileModalOpen(true);
          }}
        />

        {/* Global Medical Profile Modal */}
        <MedicalProfileModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          initialProfile={user?.medical_profile}
          onSave={saveMedicalProfile}
        />

        {/* Global Accessibility Modal */}
        <AccessibilityModal />
      </div>
    </SidebarCtx.Provider>
  );
}

// ─── Default export wraps inner with AccessibilityProvider ───────────────────
export default function AdminShell({ children }) {
  return (
    <AccessibilityProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AccessibilityProvider>
  );
}
