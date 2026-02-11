const BUCKET_ORDER = [
  "inbox",
  "next",
  "waiting",
  "calendar",
  "someday",
  "project",
  "reference",
] as const;

const ALWAYS_SHOW_ACTIVE = new Set(["inbox"]);

export interface ImportSummaryBreakdownProps {
  bucketCounts: Record<string, number>;
  completedCounts?: Record<string, number>;
  onBucketClick?: (bucket: string) => void;
}

type BucketEntry = { bucket: string; count: number };

export function ImportSummaryBreakdown({
  bucketCounts,
  completedCounts = {},
  onBucketClick,
}: ImportSummaryBreakdownProps) {
  const allBuckets = new Set([
    ...BUCKET_ORDER,
    ...Object.keys(bucketCounts),
    ...Object.keys(completedCounts),
  ]);

  const activeEntries: BucketEntry[] = [];
  const completedEntries: BucketEntry[] = [];

  for (const bucket of BUCKET_ORDER) {
    if (!allBuckets.has(bucket)) continue;
    const total = bucketCounts[bucket] ?? 0;
    const completed = completedCounts[bucket] ?? 0;
    const active = total - completed;

    if (active > 0 || ALWAYS_SHOW_ACTIVE.has(bucket)) {
      activeEntries.push({ bucket, count: active });
    }
    if (completed > 0) {
      completedEntries.push({ bucket, count: completed });
    }
  }

  // Handle any buckets not in BUCKET_ORDER
  for (const bucket of allBuckets) {
    if ((BUCKET_ORDER as readonly string[]).includes(bucket)) continue;
    const total = bucketCounts[bucket] ?? 0;
    const completed = completedCounts[bucket] ?? 0;
    const active = total - completed;
    if (active > 0) activeEntries.push({ bucket, count: active });
    if (completed > 0) completedEntries.push({ bucket, count: completed });
  }

  const activeTotal = activeEntries.reduce((s, e) => s + e.count, 0);
  const completedTotal = completedEntries.reduce((s, e) => s + e.count, 0);

  const Row = onBucketClick ? "button" : "div";

  return (
    <div className="space-y-3">
      {/* Active section */}
      {(activeEntries.length > 0 || completedEntries.length === 0) && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-muted">
            Active items ({activeTotal.toLocaleString()})
          </p>
          <div className="space-y-0.5">
            {activeEntries.map(({ bucket, count }) => (
              <Row
                key={bucket}
                type={onBucketClick ? "button" : undefined}
                {...(onBucketClick
                  ? { onClick: () => onBucketClick(bucket) }
                  : {})}
                className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-sm ${
                  onBucketClick ? "transition-colors hover:bg-paper-100" : ""
                }`}
              >
                <span className="capitalize text-text-muted">{bucket}</span>
                <span className="font-mono text-text-primary">
                  {count.toLocaleString()}
                </span>
              </Row>
            ))}
          </div>
        </div>
      )}

      {/* Completed section */}
      {completedTotal > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-subtle">
            Completed / archived ({completedTotal.toLocaleString()})
          </p>
          <div className="space-y-0.5">
            {completedEntries.map(({ bucket, count }) => (
              <Row
                key={bucket}
                type={onBucketClick ? "button" : undefined}
                {...(onBucketClick
                  ? { onClick: () => onBucketClick(bucket) }
                  : {})}
                className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-sm ${
                  onBucketClick ? "transition-colors hover:bg-paper-100" : ""
                }`}
              >
                <span className="capitalize text-text-subtle">{bucket}</span>
                <span className="font-mono text-text-subtle">
                  {count.toLocaleString()}
                </span>
              </Row>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
