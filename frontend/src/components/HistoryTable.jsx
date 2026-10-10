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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center text-neutral-400 bg-[#161922] rounded-2xl border border-dashed border-[var(--color-border)]">
      <span className="text-4xl" aria-hidden="true">📋</span>
      <div>
        <p className="font-extrabold text-neutral-200 text-sm">Belum ada riwayat pemindaian</p>
        <p className="mt-1 text-xs text-neutral-500 max-w-sm">
          Pindai kemasan obat untuk mencatat riwayat pemindaian dan evaluasi keamanan otomatis.
        </p>
      </div>
    </div>
  );
}

function HistoryRow({ item, onRemove, onSelect }) {
  const statusKey = item.status || 'yellow';

  return (
    <tr className="group border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      {/* Timestamp */}
      <td className="py-3.5 px-4 text-xs text-neutral-400 whitespace-nowrap font-mono">
        {formatTimestamp(item.scannedAt || item.scanned_at)}
      </td>

      {/* Medicine Name */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col">
          <span className="font-extrabold text-sm text-white group-hover:text-[#c8f93a] transition-colors line-clamp-1">
            {item.name || item.medicine_name || (
              <span className="italic text-neutral-500">Tidak Teridentifikasi</span>
            )}
          </span>
          <span className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">
            {item.purpose || 'Pengobatan / Suplemen'}
          </span>
        </div>
      </td>

      {/* Kategori / Indikasi (Menggantikan kolom kedaluwarsa) */}
      <td className="py-3.5 px-4 text-xs text-neutral-300 whitespace-nowrap">
        <span className="inline-block px-2.5 py-1 rounded-lg bg-black/40 border border-white/5 text-neutral-300">
          {item.purpose ? item.purpose.slice(0, 32) : 'Umum'}
        </span>
      </td>

      {/* Status Keamanan */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <StatusBadge status={statusKey} size="sm" />
      </td>

      {/* Keterangan Evaluasi */}
      <td className="py-3.5 px-4 text-xs text-neutral-400 max-w-xs hidden md:table-cell">
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
              className="text-xs font-bold px-3 py-1.5 rounded-xl text-[#c8f93a] bg-[#c8f93a]/10 hover:bg-[#c8f93a] hover:text-[#0c1004] transition-all"
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

export default function HistoryTable({ items = [], onRemove, onSelect, isLoading = false }) {
  if (!items.length && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-card-bg)] shadow-md">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Tabel riwayat pemindaian obat">
          <thead>
            <tr className="bg-[#11141b] border-b border-[var(--color-border)]">
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                Waktu Pindai
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                Nama Obat
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                Indikasi
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                Status Keamanan
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 hidden md:table-cell">
                Keterangan
              </th>
              <th className="py-3.5 px-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 text-right">
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