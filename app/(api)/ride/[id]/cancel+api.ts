import { neon } from "@neondatabase/serverless";

import { ApiError, requireAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";
import { transitionRide } from "@/lib/ride-state";

export const POST = apiHandler({
  rateLimit: { limit: 10, windowMs: 60_000 },
  handler: async (request, context) => {
    const { userId } = await requireAuth(request);

    const rideId = Number((context as { rideId?: string }).rideId);
    if (!Number.isInteger(rideId) || rideId <= 0) {
      throw new ApiError(400, "Invalid ride id");
    }

    const sql = neon(`${process.env.DATABASE_URL}`);
    const rides =
      await sql`SELECT status, user_id, payment_status FROM rides WHERE ride_id = ${rideId}`;
    if (rides.length === 0) {
      throw new ApiError(404, "Ride not found");
    }
    const ride = rides[0] as {
      status: string;
      user_id: string;
      payment_status: string;
    };
    if (ride.user_id !== userId) {
      throw new ApiError(403, "You can only cancel your own rides");
    }

    const updated = await transitionRide(
      rideId,
      ride.status,
      "CUSTOMER_CANCELLED",
      { onlyPendingPayment: true, userId, role: "customer" },
    );

    if (!updated) {
      throw new ApiError(409, "Ride cannot be cancelled in its current state");
    }

    return Response.json({ data: updated });
  },
});
