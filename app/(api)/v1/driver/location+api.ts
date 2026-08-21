import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { ApiError, requireDriverAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  accuracy: z.number().min(0).optional(),
});

export const POST = apiHandler({
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async (request) => {
    const { userId, driverId } = await requireDriverAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }

    const parsed = locationSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new ApiError(400, `Invalid request: ${detail}`);
    }

    const {
      latitude,
      longitude,
      heading: _heading,
      speed: _speed,
      accuracy: _accuracy,
    } = parsed.data;

    const sql = neon(`${process.env.DATABASE_URL}`);

    // Update driver location
    const result = await sql`
      UPDATE drivers
      SET current_latitude = ${latitude},
          current_longitude = ${longitude},
          location = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          last_heartbeat = now(),
          is_online = TRUE,
          is_available = TRUE
      WHERE id = ${driverId}
      RETURNING id, current_latitude, current_longitude, last_heartbeat
    `;

    if (result.length === 0) {
      throw new ApiError(404, "Driver not found");
    }

    // Update session heartbeat
    await sql`
      UPDATE driver_sessions
      SET last_heartbeat = now(), is_online = TRUE
      WHERE driver_id = ${driverId} AND user_id = ${userId}
    `;

    return Response.json({
      data: {
        driverId,
        latitude,
        longitude,
        timestamp: result[0].last_heartbeat,
      },
    });
  },
});
