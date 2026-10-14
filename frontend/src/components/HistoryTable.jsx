/**
 * src/components/HistoryTable.jsx
 * PharmaShield — Dark Mode History Table populated via GET /api/history.
 * Bersih tanpa pelacak atau kolom kedaluwarsa.
 */
'use client';

import StatusBadge from './StatusBadge';

function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function EmptyState({ isGuest = false }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center text-slate-500 dark:text-neutral-400 bg-slate-50 dark:bg-[#161922] rounded-2xl border border-dashed border-[var(--color-border)]">
      <span className="text-4xl" aria-hidden="true">{isGuest ? '🔒' : '📋'}</span>
      <div>
        <p className="font-extrabold text-slate-800 dark:text-neutral-200 text-sm">
          {isGuest ? 'Login untuk melihat riwayat' : 'Belum ada riwayat pemindaian'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500 max-w-sm">
          {isGuest
            ? 'Riwayat pemindaian bersifat personal. Masuk atau buat akun agar hasil scan tersimpan ke profil Anda.'
            : 'Pindai kemasan obat untuk mencatat riwayat pemindaian dan evaluasi keamanan otomatis.'}
        </p>
      </div>
    </div>
  );
}

function HistoryRow({ item, onRemove, onSelect }) {
  const statusKey = item.status || 'yellow';

  return (
    <tr className="group border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
      {/* Timestamp */}
      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap font-mono">
        {formatTimestamp(item.scannedAt || item.scanned_at)}
      </td>

      {/* Medicine Name */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col">
          <span className="font-extrabold text-sm text-[var(--color-text-primary)] group-hover:text-[#0284c7] dark:group-hover:text-[#10b981] transition-colors line-clamp-1">
            {item.name || item.medicine_name || (
              <span className="italic text-[var(--color-text-muted)]">Tidak Teridentifikasi</span>
            )}
          </span>
          <span className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">
            {item.purpose || 'Pengobatan / Suplemen'}
          </span>
        </div>
      </td>

      {/* Kategori / Indikasi */}
      <td className="py-3.5 px-4 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-black/40 border border-[var(--color-border)] text-[var(--color-text-secondary)] font-medium">
          {item.purpose ? item.purpose.slice(0, 32) : 'Umum'}
        </span>
      </td>

      {/* Status Keamanan */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <StatusBadge status={statusKey} size="sm" />
      </td>

      {/* Keterangan Evaluasi */}
      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-neutral-400 max-w-xs hidden md:table-cell">
        <p className="line-clamp-1">
          {item.shelfLifeNote || item.shelf_life_note || item.recommendation || 'Evaluasi standar'}
        </p>
      </td>

      {/* Actions */}
      <td className="py-3.5 px-4 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          {onSelect && (
            <button
              onClick={() => onSelect(item)}
              aria-label="Lihat detail"
              className="text-xs font-bold px-3 py-1.5 rounded-xl text-sky-700 bg-sky-50 hover:bg-[#0284c7] hover:text-white dark:text-[#10b981] dark:bg-[#10b981]/10 dark:hover:bg-[#10b981] dark:hover:text-[#0f172a] transition-all"
            >
              Lihat
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(item.id || item.scan_id)}
              aria-label={`Hapus entri ${item.name || 'ini'}`}
              className="p-1.5 rounded-xl text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Hapus baris ini"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function HistoryTable({ items = [], onRemove, onSelect, isLoading = false, isGuest = false }) {
  if (!items.length && !isLoading) {
    return <EmptyState isGuest={isGuest} />;
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-card-bg)] shadow-md">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left border-collapse" aria-label="Tabel riwayat pemindaian obat">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#11141b] border-b border-[var(--color-border)]">
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-neutral-400">
                Waktu Pindai
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-neutral-400">
                Nama Obat
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-neutral-400">
                Indikasi
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-neutral-400">
                Status Keamanan
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-neutral-400 hidden md:table-cell">
                Keterangan
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-neutral-400 text-right whitespace-nowrap">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <HistoryRow
                key={item.id || item.scan_id || idx}
                item={item}
                onRemove={onRemove}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}