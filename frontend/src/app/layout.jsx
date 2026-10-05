/**
 * src/app/layout.jsx
 * PharmaShield — Root layout: Manrope font, Navbar, footer, global styles.
 */
import { Manrope } from 'next/font/google';
import Navbar from '@/components/Navbar';
import './globals.css';

const manrope = Manrope({
  subsets:  ['latin'],
  display:  'swap',
  variable: '--font-manrope',
});

export const metadata = {
  title:       'PharmaShield — Evaluasi Keamanan Obat Berbasis AI',
  description: 'Deteksi tanggal kedaluwarsa dan evaluasi keamanan obat berbasis OCR dan AI. Scan kemasan obat secara instan.',
  keywords:    ['obat', 'kedaluwarsa', 'farmasi', 'OCR', 'keamanan obat'],
};

export const viewport = {
  themeColor: '#000000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={manrope.variable}>
      <body
        className={`
          ${manrope.className}
          bg-neutral-50
          text-black
          min-h-screen
          flex flex-col
          antialiased
          selection:bg-black selection:text-white
        `}
      >
        {/* ── Sticky top navigation ── */}
        <Navbar />

        {/* ── Page content ── */}
        <main
          id="main-content"
          className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12"
        >
          {children}
        </main>

        {/* ── Footer ── */}
        <footer className="bg-black text-white/50 text-xs mt-auto">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">🛡️ PharmaShield</span>
              <span className="hidden sm:inline text-white/30">·</span>
              <span className="hidden sm:inline">Sistem Keamanan Konsumsi Obat</span>
            </div>
            <span>© 2026 — Didukung AI &amp; OCR</span>
          </div>
        </footer>
      </body>
    </html>
  );
}