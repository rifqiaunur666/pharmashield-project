/**
 * src/app/layout.jsx
 * PharmaShield — Root Layout with AuthProvider.
 */
import { Manrope } from 'next/font/google';
import AdminShell from '@/components/AdminShell';
import { AuthProvider } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import './globals.css';

const manrope = Manrope({
  subsets:  ['latin'],
  display:  'swap',
  variable: '--font-manrope',
  weight:   ['400', '500', '600', '700', '800'],
});

export const metadata = {
  title:       'MedikaGuard ID — AI Drug Recognition & Safety Scanner',
  description: 'Sistem pemantauan dan analisis keamanan obat berbasis pemindaian kemasan AI satu kali, skrining alergi & interaksi klinis, serta datasheet obat Indonesia.',
  keywords:    ['obat', 'farmasi', 'OCR', 'AI safety scan', 'interaksi obat', 'alergi obat', 'BPOM'],
};

export const viewport = {
  themeColor: '#f8fafc',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${manrope.variable} light`} suppressHydrationWarning>
      <body className={`${manrope.className} antialiased`}>
        <ThemeProvider>
          <AuthProvider>
            <AdminShell>{children}</AdminShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}