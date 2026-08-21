import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { ApiError, requireDriverAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";

const statusSchema = z.object({
  is_online: z.boolean(),
  is_available: z.boolean().optional(),
});

export const POST = apiHandler({
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async (request) => {
    const { userId, driverId } = await requireDriverAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new ApiError(400, `Invalid request: ${detail}`);
    }

    const { is_online, is_available } = parsed.data;

    const sql = neon(`${process.env.DATABASE_URL}`);

    const result = await sql`
      UPDATE drivers
      SET is_online = ${is_online},
          is_available = ${is_available ?? is_online},
          last_heartbeat = now()
      WHERE id = ${driverId}
      RETURNING id, is_online, is_available, last_heartbeat
    `;

    if (result.length === 0) {
      throw new ApiError(404, "Driver not found");
    }

    // Update session
    await sql`
      UPDATE driver_sessions
      SET is_online = ${is_online}, last_heartbeat = now()
      WHERE driver_id = ${driverId} AND user_id = ${userId}
    `;

    return Response.json({
      data: {
        driverId,
        is_online: result[0].is_online,
        is_available: result[0].is_available,
        timestamp: result[0].last_heartbeat,
      },
    });
  },
});
