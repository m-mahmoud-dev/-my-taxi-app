import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { ApiError, requireAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";
import { computeDistanceKm } from "@/lib/distance";
import { quoteFareMRU } from "@/lib/fare";

const createRideSchema = z.object({
  origin_address: z.string().min(1).max(255),
  destination_address: z.string().min(1).max(255),
  origin_latitude: z.number().min(-90).max(90),
  origin_longitude: z.number().min(-180).max(180),
  destination_latitude: z.number().min(-90).max(90),
  destination_longitude: z.number().min(-180).max(180),
  payment_method: z.enum(["cash"]).default("cash"),
  vehicle_type: z.enum(["standard"]).default("standard").optional(),
});

export const POST = apiHandler({
  rateLimit: { limit: 10, windowMs: 60_000 },
  handler: async (request) => {
    const { userId } = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }

    const parsed = createRideSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new ApiError(400, `Invalid request: ${detail}`);
    }

    const {
      origin_address,
      destination_address,
      origin_latitude,
      origin_longitude,
      destination_latitude,
      destination_longitude,
      payment_method,
      vehicle_type,
    } = parsed.data;

    const sql = neon(`${process.env.DATABASE_URL}`);

    const distanceKm = await computeDistanceKm(
      origin_latitude,
      origin_longitude,
      destination_latitude,
      destination_longitude,
    );

    const farePrice = await quoteFareMRU(
      distanceKm,
      vehicle_type ?? "standard",
    );

    const response = await sql`
      INSERT INTO rides (
        origin_address,
        destination_address,
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
        distance_km,
        fare_price,
        payment_status,
        payment_method,
        status,
        user_id
      ) VALUES (
        ${origin_address},
        ${destination_address},
        ${origin_latitude},
        ${origin_longitude},
        ${destination_latitude},
        ${destination_longitude},
        ${distanceKm},
        ${farePrice},
        'pending',
        ${payment_method},
        'REQUESTED',
        ${userId}
      )
      RETURNING
        ride_id,
        origin_address,
        destination_address,
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
        distance_km,
        fare_price,
        payment_status,
        payment_method,
        status,
        driver_id,
        created_at,
        updated_at;
    `;

    return Response.json({ data: response[0] }, { status: 201 });
  },
});
