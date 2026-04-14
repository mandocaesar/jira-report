/**
 * Shared spinner component — replaces 20+ inline spinner patterns.
 * Variants: sm (inline buttons), md (section loading), lg (page loading)
 */

type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-16 h-16 border-4',
};

export function Spinner({
  size = 'md',
  color = 'purple',
  className = '',
}: {
  size?: SpinnerSize;
  color?: 'purple' | 'blue' | 'emerald' | 'foreground';
  className?: string;
}) {
  const colorClass = color === 'foreground'
    ? 'border-foreground/30 border-t-foreground'
    : `border-${color}-500/20 border-t-${color}-500`;
  return (
    <div
      className={`${sizeClasses[size]} ${colorClass} rounded-full animate-spin ${className}`}
    />
  );
}

/** SVG spinner for buttons (matches existing pattern) */
export function ButtonSpinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-5 w-5 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
