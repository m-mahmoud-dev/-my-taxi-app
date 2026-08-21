import { neon } from "@neondatabase/serverless";

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return ip;
}

function windowKey(windowMs: number): number {
  return Math.floor(Date.now() / windowMs);
}

/**
 * Distributed rate limiter using Neon (PostgreSQL).
 * Uses a fixed-window algorithm with atomic upsert.
 * Falls back to in-memory if database unavailable (for local dev).
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const key = clientKey(request);
  const window = windowKey(config.windowMs);
  const now = Date.now();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return inMemoryFallback(key, config, now);
  }

  try {
    const sql = neon(databaseUrl);

    const rows = await sql`
      INSERT INTO rate_limit_buckets (bucket_key, window_id, count, reset_at)
      VALUES (${key}, ${window}, 1, ${new Date(now + config.windowMs).toISOString()})
      ON CONFLICT (bucket_key, window_id) DO UPDATE
        SET count = rate_limit_buckets.count + 1,
            reset_at = EXCLUDED.reset_at
      RETURNING count, reset_at
    `;

    const count = Number(rows[0]?.count ?? 1);
    const resetAt = new Date(
      rows[0]?.reset_at ?? now + config.windowMs,
    ).getTime();

    if (count > config.limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }

    return { ok: true, retryAfterSeconds: 0 };
  } catch (error) {
    console.warn(
      "[rate-limit] Database error, falling back to in-memory:",
      error,
    );
    return inMemoryFallback(key, config, now);
  }
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_BUCKETS = 10_000;

function inMemoryFallback(
  key: string,
  config: RateLimitConfig,
  now: number,
): { ok: boolean; retryAfterSeconds: number } {
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
      for (const [k, b] of memoryBuckets) {
        if (b.resetAt <= now) memoryBuckets.delete(k);
      }
    }
    memoryBuckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= config.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

export async function cleanupRateLimitBuckets(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return 0;

  try {
    const sql = neon(databaseUrl);
    const result = await sql`
      DELETE FROM rate_limit_buckets
      WHERE reset_at < now()
    `;
    return result.count ?? 0;
  } catch {
    return 0;
  }
}
