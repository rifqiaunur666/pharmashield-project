/**
 * src/app/settings/page.jsx
 * PharmaShield — Dark Neon Green Settings & System Configuration.
 */
'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/api';

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(API_BASE);
  const [statusMsg, setStatusMsg] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  const testConnection = async () => {
    setIsTesting(true);
    setStatusMsg(null);
    try {
      const res = await fetch(API_BASE.replace(/\/api$/, '') + '/', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStatusMsg({ type: 'success', text: `Terhubung ke ${data.service} (v${data.version}) di ${API_BASE}` });
      } else {
        setStatusMsg({ type: 'error', text: `Server merespons dengan HTTP ${res.status}` });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Gagal terhubung ke backend: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
          ⚙️ Pengaturan Sistem
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Konfigurasi endpoint FastAPI, status OCR Tesseract, dan integrasi WhatsApp Fonnte.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">Koneksi Backend FastAPI</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Endpoint API utama yang digunakan frontend (dikonfigurasi melalui <code className="font-mono text-[#0284c7] dark:text-[#c8f93a] bg-slate-100 dark:bg-black/40 px-1 py-0.5 rounded border border-slate-200 dark:border-white/5">NEXT_PUBLIC_API_URL</code>).
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              readOnly
              value={apiUrl}
              className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-[var(--color-border)] bg-slate-50 dark:bg-[#11141b] text-slate-800 dark:text-neutral-300 font-mono"
            />
            <button
              onClick={testConnection}
              disabled={isTesting}
              className="px-5 py-2.5 text-xs font-black rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#c8f93a] dark:text-[#0c1004] dark:hover:bg-[#b5f524] transition-all shadow-sm"
            >
              {isTesting ? 'Menguji…' : 'Uji Koneksi Backend'}
            </button>
          </div>
          {statusMsg && (
            <p className={`mt-2 text-xs font-semibold ${statusMsg.type === 'success' ? 'text-emerald-700 dark:text-[#c8f93a]' : 'text-rose-600 dark:text-rose-400'}`}>
              {statusMsg.text}
            </p>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-white/5 pt-5 space-y-2">
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">Konfigurasi Tesseract OCR</h2>
          <p className="text-xs text-slate-600 dark:text-neutral-400">
            Jalur binary Windows Tesseract OCR: <code className="font-mono text-slate-800 dark:text-neutral-300 bg-slate-100 dark:bg-black/40 px-1 py-0.5 rounded border border-slate-200 dark:border-white/5">C:\Program Files\Tesseract-OCR\tesseract.exe</code>.
          </p>
          <p className="text-xs text-slate-600 dark:text-neutral-400">
            Sistem OCR mengekstrak teks nama obat, dosis, dan petunjuk penggunaan pada kemasan obat secara otomatis.
          </p>
        </div>

        <div className="border-t border-slate-200 dark:border-white/5 pt-5 space-y-2">
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">Integrasi WhatsApp Fonnte API</h2>
          <p className="text-xs text-slate-600 dark:text-neutral-400">
            Endpoint WhatsApp Fonnte: <code className="font-mono text-slate-800 dark:text-neutral-300 bg-slate-100 dark:bg-black/40 px-1 py-0.5 rounded border border-slate-200 dark:border-white/5">https://api.fonnte.com/send</code>.
          </p>
          <p className="text-xs text-slate-600 dark:text-neutral-400">
            Notifikasi rekapitulasi nama obat dan evaluasi keamanan dikirimkan secara otomatis di latar belakang melalui background task server.
          </p>
        </div>
      </div>
    </div>
  );
}
