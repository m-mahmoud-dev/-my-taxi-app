import { neon } from "@neondatabase/serverless";

import { ApiError } from "@/lib/api-error";

/** All statuses the DB CHECK constraint allows. */
export const RIDE_STATUSES = [
  "REQUESTED",
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_AT_PICKUP",
  "TRIP_STARTED",
  "TRIP_COMPLETED",
  "CUSTOMER_CANCELLED",
  "DRIVER_CANCELLED",
  "NO_DRIVER_FOUND",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "DISPUTED",
  "RESOLVED",
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

/** Legal transitions. Terminal states have no outgoing edges. */
export const RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  REQUESTED: ["SEARCHING_DRIVER", "CUSTOMER_CANCELLED"],
  SEARCHING_DRIVER: [
    "DRIVER_ASSIGNED",
    "NO_DRIVER_FOUND",
    "CUSTOMER_CANCELLED",
  ],
  DRIVER_ASSIGNED: [
    "DRIVER_ARRIVING",
    "DRIVER_CANCELLED",
    "CUSTOMER_CANCELLED",
  ],
  DRIVER_ARRIVING: [
    "DRIVER_AT_PICKUP",
    "DRIVER_CANCELLED",
    "CUSTOMER_CANCELLED",
  ],
  DRIVER_AT_PICKUP: ["TRIP_STARTED", "DRIVER_CANCELLED", "CUSTOMER_CANCELLED"],
  TRIP_STARTED: ["TRIP_COMPLETED"],
  TRIP_COMPLETED: ["PAYMENT_PENDING"],
  PAYMENT_PENDING: ["DISPUTED"],
  PAYMENT_FAILED: ["PAYMENT_PENDING", "DISPUTED"],
  DISPUTED: ["RESOLVED"],
  CUSTOMER_CANCELLED: [],
  DRIVER_CANCELLED: [],
  NO_DRIVER_FOUND: [],
  RESOLVED: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = RIDE_TRANSITIONS[from as RideStatus];
  return Array.isArray(allowed) && (allowed as readonly string[]).includes(to);
}

/** Throws a 409 if the transition is illegal. */
export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new ApiError(409, `Illegal ride transition: ${from} -> ${to}`);
  }
}

export type TransitionRole = "customer" | "driver" | "system" | "admin";

/**
 * Atomically moves a ride to a new status.
 * The UPDATE is guarded by the current status, so concurrent clients
 * cannot double-advance a ride. Returns the updated row or null if the
 * ride was not found / already moved.
 * Also inserts a history record with the actor role.
 */
export async function transitionRide(
  rideId: number,
  fromStatus: string,
  toStatus: string,
  opts: {
    userId?: string;
    onlyPendingPayment?: boolean;
    role?: TransitionRole;
  } = {},
): Promise<Record<string, unknown> | null> {
  assertTransition(fromStatus, toStatus);

  const sql = neon(`${process.env.DATABASE_URL}`);
  const paymentGuard = opts.onlyPendingPayment
    ? sql`AND payment_status = 'pending'`
    : sql``;

  const rows = await sql`
    UPDATE rides
    SET status = ${toStatus}
    WHERE ride_id = ${rideId}
      AND status = ${fromStatus}
      ${paymentGuard}
    RETURNING
      ride_id,
      status,
      payment_status,
      payment_method,
      fare_price,
      user_id,
      updated_at
  `;

  if (rows.length > 0) {
    const ride = rows[0] as Record<string, unknown>;
    const changedBy = opts.userId ?? ride.user_id;
    const role = opts.role ?? "system";

    await sql`
      INSERT INTO ride_status_history (ride_id, status, changed_by, changed_by_role)
      VALUES (${rideId}, ${toStatus}, ${changedBy}, ${role})
      ON CONFLICT DO NOTHING
    `;

    return ride;
  }

  return null;
}
