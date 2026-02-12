import { cn } from '@/lib/utils';

type SponsoredBadgeProps = {
  label: string;
  className?: string;
};

export function SponsoredBadge({ label, className }: SponsoredBadgeProps) {
  return (
    <span
      className={cn(
        'relative inline-flex select-none items-center rounded-[10px] border border-[#F87171] bg-[#B91C1C] px-3 py-1 text-[11px] font-extrabold tracking-[0.03em] text-white',
        'shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_8px_18px_rgba(185,28,28,0.42)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[1px] rounded-[8px] border border-white/20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(120deg,rgba(255,255,255,0.22)_0%,transparent_46%,rgba(255,255,255,0.1)_100%)]"
      />
      <span dir="auto" className="relative z-10 bidi-auto whitespace-nowrap">
        {label}
      </span>
    </span>
  );
}
