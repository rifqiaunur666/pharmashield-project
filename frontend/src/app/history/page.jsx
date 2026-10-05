/**
 * src/app/history/page.jsx
 * PharmaShield — Scan History page.
 * Reads from localStorage (lib/history.js), with manual refresh + clear all.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import HistoryTable from '@/components/HistoryTable';
import { getHistory, removeHistory, clearHistory } from '@/lib/history';

// ─── Page header ──────────────────────────────────────────────────────────────
function PageHeader({ count, onClear, onRefresh, isLoading }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-black">
          📋 Riwayat Pemindaian
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {count > 0
            ? `${count} obat terakhir disimpan di perangkat ini (maks. 50).`
            : 'Belum ada riwayat. Pindai obat di halaman Scanner.'}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Muat ulang riwayat"
          className={[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all',
            'border border-slate-200 bg-white text-neutral-700',
            'hover:bg-neutral-50 hover:border-slate-300 active:scale-95',
            isLoading && 'opacity-50 cursor-not-allowed',
          ].join(' ')}
        >
          <span
            className={`text-base leading-none ${isLoading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          >
            ↻
          </span>
          Segarkan
        </button>

        {/* Clear all */}
        {count > 0 && (
          <button
            onClick={onClear}
            className={[
              'px-3.5 py-2 rounded-xl text-sm font-semibold transition-all',
              'border border-rose-200 bg-rose-50 text-rose-700',
              'hover:bg-rose-100 active:scale-95',
            ].join(' ')}
          >
            Hapus Semua
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [items,     setItems]     = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setIsLoading(true);
    // Simulate async feel (localStorage is sync, but UX is cleaner)
    setTimeout(() => {
      setItems(getHistory());
      setIsLoading(false);
    }, 250);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRemove = useCallback((id) => {
    setItems(removeHistory(id));
  }, []);

  const handleClear = useCallback(() => {
    if (!window.confirm('Hapus semua riwayat pemindaian? Tindakan ini tidak dapat dibatalkan.')) return;
    setItems(clearHistory());
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        count={items.length}
        onClear={handleClear}
        onRefresh={loadHistory}
        isLoading={isLoading}
      />

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="animate-pulse rounded-2xl border border-slate-200 overflow-hidden">
          <div className="h-10 bg-neutral-50 border-b border-slate-200" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-slate-100">
              <div className="h-4 w-28 bg-neutral-100 rounded" />
              <div className="h-4 flex-1 bg-neutral-100 rounded" />
              <div className="h-4 w-20 bg-neutral-100 rounded" />
              <div className="h-4 w-16 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <HistoryTable items={items} onRemove={handleRemove} />
      )}

      {/* Disclaimer */}
      {!isLoading && (
        <p className="text-xs text-center text-neutral-400">
          Riwayat disimpan secara lokal di browser ini. Membersihkan cache atau
          menggunakan browser berbeda akan menghapus riwayat.
        </p>
      )}
    </div>
  );
}