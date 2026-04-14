/**
 * Shared error alert component — replaces 8+ inline error card patterns.
 */

export function ErrorAlert({
  message,
  title,
  variant = 'inline',
  className = '',
}: {
  message: string;
  title?: string;
  variant?: 'inline' | 'card';
  className?: string;
}) {
  if (variant === 'card') {
    return (
      <div className={`p-6 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-sm ${className}`}>
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            {title && <h3 className="font-semibold text-red-400">{title}</h3>}
            <p className="text-sm text-red-300/80">{message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 bg-red-500/10 border border-red-500/30 rounded-lg ${className}`}>
      <p className="text-sm text-red-400">{message}</p>
    </div>
  );
}
