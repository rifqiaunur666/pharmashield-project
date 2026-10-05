/**
 * src/components/HistoryTable.jsx
 * PharmaShield — Responsive monochrome scan history table.
 *
 * Props:
 *   items:    object[]       — Array of history entries (from lib/history.js)
 *   onRemove: (id) => void   — Called when user deletes a row
 */
'use client';

import StatusBadge from './StatusBadge';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

function formatExpiry(s) {
  if (!s) return '—';
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center text-neutral-400">
      <span className="text-5xl" aria-hidden="true">📋</span>
      <div>
        <p className="font-semibold text-neutral-600">Belum ada riwayat pemindaian</p>
        <p className="mt-1 text-sm">Pindai kemasan obat di halaman Scanner untuk memulai.</p>
      </div>
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function HistoryRow({ item, onRemove }) {
  return (
    <tr className="group border-b border-slate-100 hover:bg-neutral-50 transition-colors">
      {/* Timestamp */}
      <td className="py-3 px-4 text-xs text-neutral-500 whitespace-nowrap">
        {formatTimestamp(item.scannedAt)}
      </td>

      {/* Medicine name */}
      <td className="py-3 px-4">
        <span className="font-semibold text-sm text-black">
          {item.name ?? <span className="italic text-neutral-400">Tidak dikenali</span>}
        </span>
        {item.purpose && (
          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{item.purpose}</p>
        )}
      </td>

      {/* Expiry date */}
      <td className="py-3 px-4 text-sm whitespace-nowrap">
        {item.expiryDate ? (
          <span className={item.expired ? 'text-rose-600 font-semibold' : 'text-neutral-700'}>
            {formatExpiry(item.expiryDate)}
            {item.expired && (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">
                Exp
              </span>
            )}
          </span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        {item.identified
          ? <StatusBadge status={item.status} size="sm" />
          : <span className="text-xs text-neutral-400 italic">—</span>}
      </td>

      {/* Delete action */}
      <td className="py-3 px-4 text-right">
        <button
          onClick={() => onRemove(item.id)}
          aria-label={`Hapus riwayat ${item.name ?? 'entri ini'}`}
          className="text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HistoryTable({ items = [], onRemove }) {
  if (!items.length) return <EmptyState />;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Tabel riwayat pemindaian obat">
          <thead>
            <tr className="bg-neutral-50 border-b border-slate-200">
              <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                Waktu
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                Nama Obat
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                Kedaluwarsa
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                Status
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-widest text-neutral-400 text-right">
                Hapus
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <HistoryRow key={item.id} item={item} onRemove={onRemove} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}