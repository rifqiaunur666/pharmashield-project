/**
 * src/components/MedicalProfileModal.jsx
 * PharmaShield — Medical Profile & Allergy Setup (Stage 1.7 & Stage 3.4).
 *
 * Captures:
 * - Known medication allergies
 * - Previous adverse drug reactions
 * - Current prescription medications
 * - Over-the-counter medications & supplements
 * - Existing medical conditions
 * - Pregnancy / breastfeeding status
 */
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function MedicalProfileModal({ isOpen, onClose, initialProfile, onSave }) {
  const [mounted, setMounted] = useState(false);
  const [allergies, setAllergies] = useState('');
  const [adverseReactions, setAdverseReactions] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [otcMeds, setOtcMeds] = useState('');
  const [supplements, setSupplements] = useState('');
  const [conditions, setConditions] = useState('');
  const [pregnant, setPregnant] = useState(false);
  const [breastfeeding, setBreastfeeding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (initialProfile) {
      setAllergies((initialProfile.allergies || []).join(', '));
      setAdverseReactions((initialProfile.adverse_reactions || []).join(', '));
      setPrescriptions((initialProfile.current_prescriptions || []).join(', '));
      setOtcMeds((initialProfile.otc_medications || []).join(', '));
      setSupplements((initialProfile.supplements || []).join(', '));
      setConditions((initialProfile.medical_conditions || []).join(', '));
      setPregnant(Boolean(initialProfile.pregnancy_status));
      setBreastfeeding(Boolean(initialProfile.breastfeeding_status));
    }
  }, [initialProfile]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const splitClean = (str) =>
      str
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const profileData = {
      allergies: splitClean(allergies),
      adverse_reactions: splitClean(adverseReactions),
      current_prescriptions: splitClean(prescriptions),
      otc_medications: splitClean(otcMeds),
      supplements: splitClean(supplements),
      medical_conditions: splitClean(conditions),
      pregnancy_status: pregnant,
      breastfeeding_status: breastfeeding,
    };

    try {
      await onSave(profileData);
      onClose();
    } catch (err) {
      alert(`Gagal menyimpan profil: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl my-auto max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-[var(--color-border)] bg-white dark:bg-[#11141b] p-6 shadow-2xl space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-white/5 pb-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-[#0284c7] dark:text-[#c8f93a]">
              Stage 1 &amp; Profil Klinis Pribadi
            </span>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
              Pengaturan Profil Medis &amp; Riwayat Alergi
            </h2>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
              Data ini dianalisis otomatis untuk mencegah syok anafilaktik, interaksi obat berbahaya, dan kontraindikasi.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Allergies */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-neutral-200">
              Riwayat Alergi Obat (Pisahkan dengan tanda koma)
            </label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Contoh: Paracetamol, Penisilin, Amoksisilin, Aspirin"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
            />
          </div>

          {/* Current Prescriptions */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-neutral-200">
              Obat Rutin / Resep Dokter Saat Ini
            </label>
            <input
              type="text"
              value={prescriptions}
              onChange={(e) => setPrescriptions(e.target.value)}
              placeholder="Contoh: Amlodipine 5mg, Metformin 500mg, Atorvastatin"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
            />
          </div>

          {/* Medical Conditions */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-neutral-200">
              Kondisi Medis / Penyakit Bawaan
            </label>
            <input
              type="text"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="Contoh: Maag / Gastritis, GERD, Asma, Hipertensi, Gangguan Ginjal"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* OTC Meds */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-neutral-200">
                Obat Bebas (OTC) yang Sedang Dikonsumsi
              </label>
              <input
                type="text"
                value={otcMeds}
                onChange={(e) => setOtcMeds(e.target.value)}
                placeholder="Contoh: Promag, Antasida, Tolak Angin"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
              />
            </div>

            {/* Supplements */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-neutral-200">
                Suplemen / Vitamin
              </label>
              <input
                type="text"
                value={supplements}
                onChange={(e) => setSupplements(e.target.value)}
                placeholder="Contoh: Vitamin C, Zinc, Minyak Ikan"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
              />
            </div>
          </div>

          {/* Pregnancy & Lactation */}
          <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-2">
            <span className="font-bold text-slate-700 dark:text-neutral-200 block">Status Khusus Fisiologis</span>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={pregnant}
                  onChange={(e) => setPregnant(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20 text-[#0284c7] dark:text-[#c8f93a] focus:ring-0"
                />
                <span>Sedang Hamil / Program Hamil</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={breastfeeding}
                  onChange={(e) => setBreastfeeding(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20 text-[#0284c7] dark:text-[#c8f93a] focus:ring-0"
                />
                <span>Sedang Menyusui</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
            >
              Lewati / Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-[#0284c7] dark:bg-[#c8f93a] text-white dark:text-black font-black hover:bg-[#0369a1] dark:hover:bg-[#b5f524] transition-all"
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Profil Medis'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
