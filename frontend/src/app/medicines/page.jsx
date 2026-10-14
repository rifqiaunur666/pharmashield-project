/**
 * src/app/medicines/page.jsx
 * PharmaShield — Halaman Datasheet & Katalog Referensi Obat Penyakit Umum di Indonesia.
 */
import MedicineCatalog from '@/components/MedicineCatalog';

export const metadata = {
  title: 'Datasheet Obat Indonesia — PharmaShield',
  description: 'Referensi informasi dan datasheet obat-obatan penyakit umum masyarakat Indonesia.',
};

export default function MedicinesPage({ searchParams }) {
  const initialSearch = searchParams?.q || '';
  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              Datasheet Obat Penyakit Umum Indonesia
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] text-[#0f172a] border border-[#cbd5e1] dark:bg-[#10b981]/15 dark:text-[#10b981] dark:border-[#10b981]/30 px-2.5 py-0.5 text-xs font-bold shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#10b981] animate-pulse" />
              BPOM &amp; Apotek ID
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Daftar referensi obat terstruktur untuk penyakit umum di Indonesia (Demam, Flu, Batuk, Maag/GERD, Hipertensi Ringan, Diare, Alergi).
          </p>
        </div>
      </div>

      {/* ── Medicine Catalog Component ── */}
      <MedicineCatalog initialSearch={initialSearch} />
    </div>
  );
}
