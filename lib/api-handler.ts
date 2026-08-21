import { ApiError } from "@/lib/api-auth";
import { checkRateLimit, RateLimitConfig } from "@/lib/rate-limit";

export type ApiHandler = (
  request: Request,
  context: Record<string, unknown>,
) => Promise<Response>;

export type ApiRouteOptions = {
  rateLimit?: RateLimitConfig;
  handler: ApiHandler;
};

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim());
  }
  const scheme = process.env.EXPO_PUBLIC_SCHEME ?? "ryde";
  return [
    `${scheme}://`,
    "http://localhost:8081",
    "http://localhost:19000",
    "http://localhost:19001",
    "http://localhost:19002",
    "http://localhost:19003",
    "http://localhost:19004",
    "http://localhost:19005",
    "http://localhost:19006",
    "exp://127.0.0.1:8081",
    "exp://127.0.0.1:19000",
  ];
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin =
    origin && allowedOrigins.some((o) => origin.startsWith(o))
      ? origin
      : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export function withCors(request: Request, response: Response): Response {
  const headers = getCorsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

function json(data: unknown, status: number): Response {
  return Response.json(data, { status });
}

/**
 * Wraps an API route with CORS headers, optional rate limiting,
 * and uniform error mapping (ApiError -> status, anything else -> 500).
 */
export function apiHandler(options: ApiRouteOptions) {
  return async (request: Request, context: Record<string, unknown> = {}) => {
    try {
      if (request.method === "OPTIONS") {
        return withCors(request, new Response(null, { status: 204 }));
      }

      if (options.rateLimit) {
        const { ok, retryAfterSeconds } = checkRateLimit(
          request,
          options.rateLimit,
        );
        if (!ok) {
          const response = json(
            {
              error: `Rate limit exceeded. Retry in ${retryAfterSeconds}s.`,
            },
            429,
          );
          response.headers.set("Retry-After", String(retryAfterSeconds));
          return withCors(request, response);
        }
      }

      const response = await options.handler(request, context);
      return withCors(request, response);
    } catch (error) {
      if (error instanceof ApiError) {
        return withCors(request, json({ error: error.message }, error.status));
      }
      console.error("[api] Unhandled error:", error);
      return withCors(request, json({ error: "Internal Server Error" }, 500));
    }
  };
}
