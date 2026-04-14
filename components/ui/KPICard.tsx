/**
 * Shared KPI card — replaces inline KPI card patterns in 4+ pages.
 */
export function KPICard({
  label,
  value,
  unit,
  subtitle,
  className = '',
}: {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`bg-muted/30 border border-border rounded-xl p-4 space-y-1 ${className}`}>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
