import { neon } from "@neondatabase/serverless";

import { requireAuth } from "@/lib/api-auth";
import { apiHandler } from "@/lib/api-handler";

export const GET = apiHandler({
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async (request) => {
    const { userId } = await requireAuth(request);

    const sql = neon(`${process.env.DATABASE_URL}`);
    const response = await sql`
        SELECT
            rides.ride_id,
            rides.origin_address,
            rides.destination_address,
            rides.origin_latitude,
            rides.origin_longitude,
            rides.destination_latitude,
            rides.destination_longitude,
            rides.ride_time,
            rides.distance_km,
            rides.fare_price,
            rides.payment_status,
            rides.payment_method,
            rides.status,
            rides.created_at,
            rides.updated_at,
            json_build_object(
                'driver_id', drivers.id,
                'first_name', drivers.first_name,
                'last_name', drivers.last_name,
                'profile_image_url', drivers.profile_image_url,
                'car_image_url', drivers.car_image_url,
                'car_seats', drivers.car_seats,
                'rating', drivers.rating
            ) AS driver
        FROM
            rides
        INNER JOIN
            drivers ON rides.driver_id = drivers.id
        WHERE
            rides.user_id = ${userId}
        ORDER BY
            rides.created_at DESC;
    `;

    return Response.json({ data: response });
  },
});
