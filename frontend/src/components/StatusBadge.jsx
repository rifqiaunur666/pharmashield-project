/**
 * src/components/StatusBadge.jsx
 * PharmaShield — Reusable monochrome-tinted status badge & config map.
 */

/** @type {Record<string, {label: string, note: string, className: string, dotClass: string}>} */
export const STATUS = {
  green: {
    label:     'Aman',
    note:      'Obat ini aman dikonsumsi sesuai petunjuk.',
    className: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    dotClass:  'bg-emerald-500',
  },
  yellow: {
    label:     'Peringatan',
    note:      'Baca petunjuk dengan seksama sebelum menggunakan.',
    className: 'bg-amber-50 text-amber-800 border border-amber-200',
    dotClass:  'bg-amber-400',
  },
  red: {
    label:     'Berbahaya',
    note:      'Obat ini kedaluwarsa atau berbahaya. Jangan digunakan.',
    className: 'bg-rose-50 text-rose-800 border border-rose-200',
    dotClass:  'bg-rose-500',
  },
};

/**
 * @param {{ status: 'green'|'yellow'|'red'|null, size?: 'sm'|'md' }} props
 */
export default function StatusBadge({ status, size = 'md' }) {
  if (!status || !STATUS[status]) return null;

  const s = STATUS[status];
  const textSize = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${textSize} ${s.className}`}
      aria-label={`Status: ${s.label}`}
    >
      <span className={`w-2 h-2 rounded-full ${s.dotClass} shrink-0`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
