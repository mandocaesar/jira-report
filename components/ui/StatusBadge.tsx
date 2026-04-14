import { getStatusColors } from '@/lib/ui-colors';

/**
 * Shared status badge — replaces inline status category spans in 4+ files.
 */
export function StatusBadge({
  category,
  label,
  className = '',
}: {
  category: string;
  label?: string;
  className?: string;
}) {
  const colors = getStatusColors(category);
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border ${colors.bg} ${colors.border} ${colors.text} ${className}`}
    >
      {label || category}
    </span>
  );
}
