/**
 * Shared progress bar — replaces 5+ inline progress div patterns.
 */
export function ProgressBar({
  percent,
  color = 'bg-foreground',
  height = 'h-1.5',
  className = '',
  showLabel = false,
}: {
  percent: number;
  color?: string;
  height?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 ${height} bg-muted/50 rounded-full overflow-hidden`}>
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] text-muted-foreground font-medium w-8 text-right shrink-0">
          {clamped.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
