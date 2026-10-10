/**
 * src/app/layout.jsx
 * PharmaShield — Admin Dashboard Root Layout (Dark Neon Aesthetic).
 */
import { Manrope } from 'next/font/google';
import AdminShell from '@/components/AdminShell';
import './globals.css';

const manrope = Manrope({
  subsets:  ['latin'],
  display:  'swap',
  variable: '--font-manrope',
  weight:   ['400', '500', '600', '700', '800'],
});

export const metadata = {
  title:       'PharmaShield ID — Dashboard Scanner & Datasheet Obat',
  description: 'Sistem pemantauan dan analisis keamanan obat berbasis AI & OCR serta datasheet referensi obat penyakit umum di Indonesia.',
  keywords:    ['obat', 'farmasi', 'OCR', 'dashboard', 'keamanan obat', 'datasheet obat indonesia', 'dark mode'],
};

export const viewport = {
  themeColor: '#0c0e12',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${manrope.variable} dark`}>
      <body className={`${manrope.className} bg-[#0c0e12] text-neutral-100 antialiased`}>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}