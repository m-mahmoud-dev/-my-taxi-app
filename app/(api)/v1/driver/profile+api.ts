import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { ApiError, requireDriverAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";

const profileSchema = z.object({
  license_number: z.string().min(1).max(50).optional(),
  license_expiry: z.string().date().optional(),
  vehicle_type: z.enum(["standard"]).optional(),
  vehicle_make: z.string().max(50).optional(),
  vehicle_model: z.string().max(50).optional(),
  vehicle_year: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 1)
    .optional(),
  vehicle_color: z.string().max(30).optional(),
  license_plate: z.string().max(20).optional(),
});

export const GET = apiHandler({
  rateLimit: { limit: 30, windowMs: 60_000 },
  handler: async (request) => {
    const { userId, driverId: _driverId } = await requireDriverAuth(request);

    const sql = neon(`${process.env.DATABASE_URL}`);

    const profile = await sql`
      SELECT 
        dp.*,
        d.current_latitude,
        d.current_longitude,
        d.is_online,
        d.is_available
      FROM driver_profiles dp
      JOIN drivers d ON dp.driver_id = d.id
      WHERE dp.user_id = ${userId}
    `;

    if (profile.length === 0) {
      throw new ApiError(404, "Driver profile not found");
    }

    return Response.json({ data: profile[0] });
  },
});

export const PUT = apiHandler({
  rateLimit: { limit: 10, windowMs: 60_000 },
  handler: async (request) => {
    const { userId, driverId } = await requireDriverAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }

    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new ApiError(400, `Invalid request: ${detail}`);
    }

    const sql = neon(`${process.env.DATABASE_URL}`);

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];

    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        updateFields.push(`${key} = $${updateValues.length + 1}`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      throw new ApiError(400, "No fields to update");
    }

    updateFields.push("updated_at = now()");
    updateValues.push(userId, driverId);

    const result = await sql.unsafe(
      `UPDATE driver_profiles SET ${updateFields.join(", ")} WHERE user_id = $${updateValues.length - 1} AND driver_id = $${updateValues.length} RETURNING *`,
      updateValues,
    );

    if (result.length === 0) {
      throw new ApiError(404, "Driver profile not found");
    }

    // Also update drivers table for vehicle info
    const vehicleFields = ["vehicle_type", "license_plate"];
    const vehicleUpdates = vehicleFields
      .filter((k) => parsed.data[k as keyof typeof parsed.data] !== undefined)
      .map((k) => `${k} = '${parsed.data[k as keyof typeof parsed.data]}'`)
      .join(", ");

    if (vehicleUpdates) {
      await sql.unsafe(
        `UPDATE drivers SET ${vehicleUpdates} WHERE id = ${driverId}`,
      );
    }

    return Response.json({ data: result[0] });
  },
});
