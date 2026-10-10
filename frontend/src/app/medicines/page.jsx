/**
 * src/app/medicines/page.jsx
 * PharmaShield — Halaman Datasheet & Katalog Referensi Obat Penyakit Umum di Indonesia.
 */
import MedicineCatalog from '@/components/MedicineCatalog';

export const metadata = {
  title: 'Datasheet Obat Indonesia — PharmaShield',
  description: 'Referensi informasi dan datasheet obat-obatan penyakit umum masyarakat Indonesia.',
};

export default function MedicinesPage() {
  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Datasheet Obat Penyakit Umum Indonesia
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c8f93a]/15 px-2.5 py-0.5 text-xs font-bold text-[#c8f93a] border border-[#c8f93a]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8f93a] animate-pulse" />
              BPOM &amp; Apotek ID
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Daftar referensi obat terstruktur untuk penyakit umum di Indonesia (Demam, Flu, Batuk, Maag/GERD, Hipertensi Ringan, Diare, Alergi).
          </p>
        </div>
      </div>

      {/* ── Medicine Catalog Component ── */}
      <MedicineCatalog />
    </div>
  );
}
