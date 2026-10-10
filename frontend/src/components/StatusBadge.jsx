/**
 * src/components/StatusBadge.jsx
 * PharmaShield — 3-Level Safety Status Badge (Dark Mode & Neon Lime Style).
 * Bersih tanpa teks ketergantungan kadaluarsa.
 */

export const STATUS = {
  green: {
    label: 'Aman Dikonsumsi',
    shortLabel: 'Aman',
    emoji: '🟢',
    note: 'Obat terverifikasi aman digunakan sesuai petunjuk pemakaian dan indikasi.',
    className: 'bg-[#c8f93a]/15 text-[#c8f93a] border-[#c8f93a]/30',
    dotClass: 'bg-[#c8f93a]',
  },
  yellow: {
    label: 'Perhatian Khusus',
    shortLabel: 'Perhatian',
    emoji: '🟡',
    note: 'Gunakan dengan hati-hati atau konsultasikan dengan apoteker/dokter.',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dotClass: 'bg-amber-400',
  },
  red: {
    label: 'Peringatan Ketat',
    shortLabel: 'Peringatan',
    emoji: '🔴',
    note: 'Kemasan/label tidak terbaca atau memiliki kontraindikasi risiko tinggi.',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-500',
  },
};

export default function StatusBadge({ status, size = 'md', showEmoji = true }) {
  if (!status || !STATUS[status]) {
    status = 'yellow';
  }

  const s = STATUS[status];
  const textSize = size === 'sm' ? 'text-[11px] px-2.5 py-0.5' : 'text-xs px-3.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-extrabold border shadow-xs ${textSize} ${s.className}`}
      aria-label={`Status: ${s.label}`}
    >
      {showEmoji ? (
        <span className="text-xs" aria-hidden="true">{s.emoji}</span>
      ) : (
        <span className={`w-2 h-2 rounded-full ${s.dotClass} shrink-0`} aria-hidden="true" />
      )}
      <span>{size === 'sm' ? s.shortLabel : s.label}</span>
    </span>
  );
}
