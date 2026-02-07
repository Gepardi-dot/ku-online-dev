import { cn } from '@/lib/utils';

type VerifiedBadgeSize = 'xs' | 'sm' | 'md' | 'lg';
type VerifiedBadgeVariant = 'icon' | 'pill';

type VerifiedBadgeProps = {
  label?: string;
  variant?: VerifiedBadgeVariant;
  size?: VerifiedBadgeSize;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
};

const sizeClassMap: Record<VerifiedBadgeSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

function VerifiedBadgeIcon({
  size,
  className,
}: {
  size: VerifiedBadgeSize;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn(
        'shrink-0 drop-shadow-[0_1px_1px_rgba(29,155,240,0.35)]',
        sizeClassMap[size],
        className,
      )}
    >
      <circle cx="12" cy="12" r="12" fill="#1D9BF0" />
      <path
        d="M7.6 12.4l3 3 6.8-7.1"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function VerifiedBadge({
  label = 'Verified',
  variant = 'icon',
  size = 'sm',
  className,
  iconClassName,
  labelClassName,
}: VerifiedBadgeProps) {
  if (variant === 'pill') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-[#E8F5FD] px-2.5 py-1 text-xs font-semibold text-[#1D9BF0]',
          className,
        )}
      >
        <VerifiedBadgeIcon size={size} className={iconClassName} />
        <span dir="auto" className={cn('bidi-auto', labelClassName)}>
          {label}
        </span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      <VerifiedBadgeIcon size={size} className={iconClassName} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
