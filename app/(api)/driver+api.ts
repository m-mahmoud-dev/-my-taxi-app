import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { ApiError, requireAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";
import { findNearbyDrivers } from "@/lib/distance";

const driverListSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().min(0.5).max(50).default(5),
  vehicle_type: z.enum(["standard"]).default("standard").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const GET = apiHandler({
  rateLimit: { limit: 30, windowMs: 60_000 },
  handler: async (request) => {
    await requireAuth(request);

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams);

    const parsed = driverListSchema.safeParse(params);
    if (!parsed.success) {
      throw new ApiError(400, "Invalid query parameters");
    }

    const { latitude, longitude, radius_km, vehicle_type, limit } = parsed.data;

    let drivers;
    if (latitude !== undefined && longitude !== undefined) {
      drivers = await findNearbyDrivers(
        latitude,
        longitude,
        radius_km,
        vehicle_type,
        limit,
      );
    } else {
      const sql = neon(`${process.env.DATABASE_URL}`);
      const rows = await sql`
        SELECT
          id,
          first_name,
          last_name,
          profile_image_url,
          car_image_url,
          car_seats,
          rating,
          current_latitude,
          current_longitude,
          is_online,
          is_available
        FROM drivers
        WHERE is_online = TRUE AND is_available = TRUE AND documents_verified = TRUE
        ORDER BY rating DESC NULLS LAST
        LIMIT ${limit}
      `;
      drivers = rows as {
        id: number;
        first_name: string;
        last_name: string;
        profile_image_url: string | null;
        car_image_url: string | null;
        car_seats: number;
        rating: number | null;
        current_latitude: number | null;
        current_longitude: number | null;
        is_online: boolean;
        is_available: boolean;
      }[];
    }

    return Response.json({ data: drivers });
  },
});
