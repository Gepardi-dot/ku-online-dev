import { cn } from '@/lib/utils';

type SponsoredBadgeProps = {
  label: string;
  className?: string;
};

export function SponsoredBadge({ label, className }: SponsoredBadgeProps) {
  return (
    <span
      className={cn(
        'relative inline-flex select-none items-center rounded-full border border-[#C84A4A]/65 bg-[linear-gradient(180deg,#C62828_0%,#A91F23_55%,#8E1519_100%)] px-3.5 py-1 text-[13px] font-bold tracking-[0.02em] text-white',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_16px_rgba(98,20,20,0.30)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[1px] rounded-full border border-white/16"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(120deg,rgba(255,255,255,0.18)_0%,transparent_46%,rgba(255,255,255,0.08)_100%)]"
      />
      <span dir="auto" className="relative z-10 bidi-auto whitespace-nowrap">
        {label}
      </span>
    </span>
  );
}
