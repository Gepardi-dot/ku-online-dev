export default function ProductGridSkeleton({ count = 12 }: { count?: number }) {
  const items = Array.from({ length: count });
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((_, idx) => (
        <div key={idx} className="animate-pulse rounded-lg border bg-card overflow-hidden">
          <div className="w-full h-[clamp(160px,45vw,230px)] md:h-auto md:aspect-4/3 bg-muted" />
          <div className="h-[146px] px-3 py-3 space-y-3">
            <div className="h-4 w-5/6 rounded bg-muted" />
            <div className="h-6 w-1/2 rounded bg-muted" />
            <div className="flex items-center justify-between gap-2">
              <div className="h-6 w-1/2 rounded-full bg-muted" />
              <div className="h-6 w-1/4 rounded-full bg-muted" />
            </div>
            <div className="h-6 w-3/4 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
