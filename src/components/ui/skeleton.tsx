import { cn } from "@/lib/utils";

/** Simple shimmer placeholder — replaces ad-hoc "Loading…" text while data
 * is in flight, so a slow connection (common on Tanzania mobile data) reads
 * as "working" rather than "stuck". */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/** A handful of skeleton rows shaped like a data table — drop-in for the
 * common `{loading ? <p>Loading…</p> : <Table>...}` pattern. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
