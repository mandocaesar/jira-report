/**
 * Shared empty state component — replaces 5+ "no data" messages.
 */

export function EmptyState({
  message = 'No data available',
  className = '',
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={`text-center py-16 text-muted-foreground ${className}`}>
      <p>{message}</p>
    </div>
  );
}
