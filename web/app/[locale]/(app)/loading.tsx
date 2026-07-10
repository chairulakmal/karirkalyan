// Skeleton shown while server components in the app group fetch from the API.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-10" aria-hidden="true">
      <header className="border-b border-dune pb-6">
        <div className="h-3 w-24 bg-dune/60" />
        <div className="mt-3 h-8 w-56 bg-dune/60" />
        <div className="mt-3 h-3 w-40 bg-dune/60" />
      </header>
      <div className="h-24 border border-dune bg-linen" />
      <div className="space-y-3">
        <div className="h-16 border border-dune bg-linen" />
        <div className="h-16 border border-dune bg-linen" />
        <div className="h-16 border border-dune bg-linen" />
      </div>
    </div>
  );
}
