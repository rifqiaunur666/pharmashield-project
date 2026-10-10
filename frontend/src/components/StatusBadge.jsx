/**
 * src/components/StatusBadge.jsx
 * PharmaShield — 3-Level Safety Status Badge (Dark Mode & Neon Lime Style).
 * Bersih tanpa teks ketergantungan kadaluarsa.
 */

export const STATUS = {
  green: {
    label: 'Aman Dikonsumsi',
    shortLabel: 'Aman',
    fullLabel: 'Aman / Bebas Risiko',
    symbol: '[✓]',
    emoji: '🟢',
    note: 'Obat terverifikasi aman digunakan sesuai petunjuk pemakaian dan indikasi.',
    className: 'bg-[#dcfce7] text-[#15803d] border-[#86efac] dark:bg-[#c8f93a]/15 dark:text-[#c8f93a] dark:border-[#c8f93a]/30 status-green',
    dotClass: 'bg-[#15803d] dark:bg-[#c8f93a]',
  },
  yellow: {
    label: 'Perhatian Khusus',
    shortLabel: 'Perhatian',
    fullLabel: 'Peringatan / Perlu Evaluasi',
    symbol: '[!]',
    emoji: '🟡',
    note: 'Gunakan dengan hati-hati atau konsultasikan dengan apoteker/dokter.',
    className: 'bg-[#fef3c7] text-[#b45309] border-[#fcd34d] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 status-yellow',
    dotClass: 'bg-[#b45309] dark:bg-amber-400',
  },
  red: {
    label: 'Peringatan Ketat',
    shortLabel: 'Bahaya',
    fullLabel: 'Bahaya / Interaksi Buruk',
    symbol: '[X]',
    emoji: '🔴',
    note: 'Kemasan/label tidak terbaca atau memiliki kontraindikasi risiko tinggi.',
    className: 'bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5] dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 status-red',
    dotClass: 'bg-[#b91c1c] dark:bg-rose-500',
  },
};

export default function StatusBadge({ status, size = 'md', showEmoji = true, showSymbol = true }) {
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
      {showSymbol && (
        <span className="font-mono text-[11px] opacity-90" aria-hidden="true">{s.symbol}</span>
      )}
      {showEmoji ? (
        <span className="text-xs" aria-hidden="true">{s.emoji}</span>
      ) : (
        <span className={`w-2 h-2 rounded-full ${s.dotClass} shrink-0`} aria-hidden="true" />
      )}
      <span>{size === 'sm' ? s.shortLabel : s.label}</span>
    </span>
  );
}
