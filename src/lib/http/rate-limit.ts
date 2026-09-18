import { RateLimitedError } from "@/lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastPrune = Date.now();

function prune(now: number): void {
  if (now - lastPrune < 60_000 && buckets.size < 10_000) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window in-memory rate limiter. Single-node MVP semantics: counters
 * are per-process, which is the correct trade for a modular monolith and is
 * documented in the architecture notes.
 */
export function enforceRateLimit(bucketKey: string, limit: number, windowMs: number): void {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new RateLimitedError(Math.ceil((bucket.resetAt - now) / 1000));
  }
}
