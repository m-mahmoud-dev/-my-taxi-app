import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { ApiError, requireDriverAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";
import { transitionRide } from "@/lib/ride-state";

const statusSchema = z.object({
  status: z.enum([
    "DRIVER_ARRIVING",
    "DRIVER_AT_PICKUP",
    "TRIP_STARTED",
    "TRIP_COMPLETED",
    "DRIVER_CANCELLED",
  ]),
});

export const POST = apiHandler({
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async (request, context) => {
    const { userId, driverId } = await requireDriverAuth(request);

    const rideId = Number((context as { rideId?: string }).rideId);
    if (!Number.isInteger(rideId) || rideId <= 0) {
      throw new ApiError(400, "Invalid ride id");
    }

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

    const { status } = parsed.data;

    const sql = neon(`${process.env.DATABASE_URL}`);

    // Verify driver owns this ride
    const rides = await sql`
      SELECT ride_id, status FROM rides 
      WHERE ride_id = ${rideId} AND driver_id = ${driverId}
    `;

    if (rides.length === 0) {
      throw new ApiError(404, "Ride not found or not assigned to you");
    }

    const currentStatus = rides[0].status;

    // Validate transition
    const allowedTransitions: Record<string, string[]> = {
      DRIVER_ASSIGNED: ["DRIVER_ARRIVING", "DRIVER_CANCELLED"],
      DRIVER_ARRIVING: ["DRIVER_AT_PICKUP", "DRIVER_CANCELLED"],
      DRIVER_AT_PICKUP: ["TRIP_STARTED", "DRIVER_CANCELLED"],
      TRIP_STARTED: ["TRIP_COMPLETED"],
    };

    if (!allowedTransitions[currentStatus]?.includes(status)) {
      throw new ApiError(
        409,
        `Invalid transition: ${currentStatus} -> ${status}`,
      );
    }

    const updated = await transitionRide(rideId, currentStatus, status, {
      userId,
      role: "driver",
    });

    if (!updated) {
      throw new ApiError(409, "Ride status already changed");
    }

    // If trip completed, move to PAYMENT_PENDING
    if (status === "TRIP_COMPLETED") {
      await transitionRide(rideId, "TRIP_COMPLETED", "PAYMENT_PENDING", {
        userId,
        role: "system",
      });
    }

    return Response.json({ data: updated });
  },
});
