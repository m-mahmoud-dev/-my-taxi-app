import { neon } from "@neondatabase/serverless";

import { ApiError } from "@/lib/api-error";

export type FareRule = {
  id: number;
  vehicle_type: string;
  base_fare_mru: number;
  per_km_mru: number;
  min_fare_mru: number;
};

/**
 * Mauritania fare model (Nouakchott taxis):
 *   base_fare covers the first km; +per_km for every additional started km.
 *   fare = base + per_km * MAX(0, CEIL(distance_km) - 1), floored at min_fare.
 *
 * 1.0 km  -> 100 MRU        (base, no extra)
 * 1.1 km  -> 200 MRU        (second started km)
 * 2.0 km  -> 200 MRU
 * 3.5 km  -> 400 MRU
 */
export function calculateFare(rule: FareRule, distanceKm: number): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return rule.min_fare_mru;

  const extraKms = Math.max(0, Math.ceil(km) - 1);
  const fare = rule.base_fare_mru + rule.per_km_mru * extraKms;
  return Math.max(rule.min_fare_mru, fare);
}

/** Active fare rule for a vehicle type; falls back to defaults on any failure. */
export async function getActiveFareRule(
  vehicleType = "standard",
  fallback: FareRule = {
    id: 0,
    vehicle_type: "standard",
    base_fare_mru: 100,
    per_km_mru: 100,
    min_fare_mru: 100,
  },
): Promise<FareRule> {
  try {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const rows = await sql`
      SELECT id, vehicle_type, base_fare_mru, per_km_mru, min_fare_mru
      FROM fare_rules
      WHERE active = TRUE
        AND vehicle_type = ${vehicleType}
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) {
      console.error(
        `[fare] No active fare rule for '${vehicleType}', using defaults`,
      );
      return fallback;
    }
    return rows[0] as FareRule;
  } catch (error) {
    console.error(
      `[fare] Failed to load fare rule for '${vehicleType}':`,
      error,
    );
    return fallback;
  }
}

/** Server-side quote: authoritative fare for a distance, per DB rules. */
export async function quoteFareMRU(
  distanceKm: number,
  vehicleType = "standard",
): Promise<number> {
  if (!Number.isFinite(distanceKm))
    throw new ApiError(400, "distance_km is required");
  const rule = await getActiveFareRule(vehicleType);
  return calculateFare(rule, distanceKm);
}
