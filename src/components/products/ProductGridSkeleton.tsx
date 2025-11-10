export default function ProductGridSkeleton({ count = 12 }: { count?: number }) {
  const items = Array.from({ length: count });
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((_, idx) => (
        <div key={idx} className="animate-pulse space-y-2">
          <div className="aspect-[4/5] w-full rounded-lg bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
