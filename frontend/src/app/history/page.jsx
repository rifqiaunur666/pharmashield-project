/**
 * src/app/history/page.jsx
 * PharmaShield — Log & Riwayat Pemindaian Obat (Dark Mode & Neon Lime Style).
 * Bersih tanpa pelacak kedaluwarsa.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import HistoryTable from '@/components/HistoryTable';
import { fetchHistory, deleteHistoryItem, clearAllHistory } from '@/lib/api';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchHistory();
      setItems(data.items);
    } catch (err) {
      console.error('[History] Failed loading:', err);
      setError(err.message || 'Gagal mengambil data riwayat pemindaian.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRemove = useCallback(async (id) => {
    if (!id) return;
    const ok = await deleteHistoryItem(id);
    if (ok) {
      setItems((prev) => prev.filter((i) => (i.id || i.scan_id) !== id));
    } else {
      alert('Gagal menghapus entri riwayat.');
    }
  }, []);

  const handleClear = useCallback(async () => {
    if (!window.confirm('Hapus semua riwayat pemindaian? Tindakan ini permanen.')) return;
    const ok = await clearAllHistory();
    if (ok) {
      setItems([]);
    } else {
      alert('Gagal membersihkan riwayat.');
    }
  }, []);

  // Filtered items by search query & status
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const name = (item.name || item.medicine_name || '').toLowerCase();
      const purpose = (item.purpose || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || name.includes(q) || purpose.includes(q);

      const status = item.status || 'yellow';
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [items, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
            📋 Log &amp; Riwayat Pemindaian
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Daftar lengkap hasil OCR label obat, indikasi klinis, dan status evaluasi keamanan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-[var(--color-border)] bg-white dark:bg-[#161922] text-slate-700 dark:text-neutral-300 hover:text-[#0284c7] dark:hover:text-white hover:border-[#0284c7]/40 dark:hover:border-[#c8f93a]/30 transition-all shadow-sm"
          >
            <span className={isLoading ? 'animate-spin' : ''}>↻</span>
            <span>Segarkan</span>
          </button>

          {items.length > 0 && (
            <button
              onClick={handleClear}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 transition-all"
            >
              Hapus Semua
            </button>
          )}
        </div>
      </div>

      {/* ── Filter & Search Bar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama obat, indikasi..."
            className="w-full px-4 py-2.5 text-xs rounded-xl border border-[var(--color-border)] bg-white dark:bg-[#161922] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] focus:ring-1 focus:ring-[#0284c7] dark:focus:ring-[#c8f93a] transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'green', label: '🟢 Aman' },
            { id: 'yellow', label: '🟡 Perhatian' },
            { id: 'red', label: '🔴 Peringatan' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                statusFilter === id
                  ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-md shadow-[#0284c7]/20 dark:bg-[#c8f93a] dark:text-[#0c1004] dark:border-[#c8f93a] dark:shadow-[#c8f93a]/20 font-extrabold'
                  : 'bg-white dark:bg-[#161922] text-slate-600 dark:text-neutral-400 border-[var(--color-border)] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <HistoryTable
        items={filteredItems}
        onRemove={handleRemove}
        isLoading={isLoading}
      />
    </div>
  );
}