import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SponsoredBadgeProps = {
  label: string;
  className?: string;
};

export function SponsoredBadge({ label, className }: SponsoredBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-brand',
        className,
      )}
    >
      {label}
    </Badge>
  );
}

