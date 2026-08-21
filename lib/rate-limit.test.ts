import { checkRateLimit } from "./rate-limit";

function makeRequest(ip: string): Request {
  return new Request("https://example.com/api", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    const request = makeRequest("1.2.3.4");
    const config = { limit: 3, windowMs: 60_000 };

    expect(checkRateLimit(request, config).ok).toBe(true);
    expect(checkRateLimit(request, config).ok).toBe(true);
    expect(checkRateLimit(request, config).ok).toBe(true);
    expect(checkRateLimit(request, config).ok).toBe(false);
  });

  it("reports a retry-after for blocked requests", () => {
    const request = makeRequest("5.6.7.8");
    const config = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(request, config).ok).toBe(true);
    const blocked = checkRateLimit(request, config);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("tracks clients independently", () => {
    const config = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(makeRequest("10.0.0.1"), config).ok).toBe(true);
    expect(checkRateLimit(makeRequest("10.0.0.1"), config).ok).toBe(false);
    expect(checkRateLimit(makeRequest("10.0.0.2"), config).ok).toBe(true);
  });
});
