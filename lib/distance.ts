import { neon } from "@neondatabase/serverless";

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance between two points in kilometers.
 * Used server-side to compute authoritative distance from coordinates.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Compute distance using Google Distance Matrix API (more accurate, accounts for roads).
 * Falls back to Haversine if API fails or key not configured.
 */
export async function computeDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<number> {
  const apiKey =
    process.env.GOOGLE_DISTANCE_MATRIX_API_KEY ??
    process.env.EXPO_PUBLIC_DIRECTIONS_API_KEY;

  if (!apiKey) {
    console.warn("[distance] No Google API key, using Haversine fallback");
    return haversineKm(originLat, originLng, destLat, destLng);
  }

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
    );
    url.searchParams.set("origins", `${originLat},${originLng}`);
    url.searchParams.set("destinations", `${destLat},${destLng}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("units", "metric");

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "OK" || data.rows[0]?.elements[0]?.status !== "OK") {
      console.warn(
        "[distance] Distance Matrix API error:",
        data.status,
        data.error_message,
      );
      return haversineKm(originLat, originLng, destLat, destLng);
    }

    const distanceMeters = data.rows[0].elements[0].distance.value;
    return distanceMeters / 1000;
  } catch (error) {
    console.error("[distance] Distance Matrix API failed:", error);
    return haversineKm(originLat, originLng, destLat, destLng);
  }
}

/**
 * Find nearby available drivers within radius (km).
 * Uses simple bounding box + Haversine for now; upgrade to PostGIS later.
 */
export async function findNearbyDrivers(
  latitude: number,
  longitude: number,
  radiusKm: number = 5,
  vehicleType: string = "standard",
  limit: number = 10,
): Promise<
  {
    id: number;
    first_name: string;
    last_name: string;
    profile_image_url: string | null;
    car_image_url: string | null;
    car_seats: number;
    rating: number | null;
    current_latitude: number;
    current_longitude: number;
    distance_km: number;
  }[]
> {
  const sql = neon(`${process.env.DATABASE_URL}`);

  // Rough bounding box (1 deg lat ≈ 111km, 1 deg lng ≈ 111km * cos(lat))
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(toRad(latitude)));

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
      current_longitude
    FROM drivers
    WHERE is_online = TRUE
      AND is_available = TRUE
      AND documents_verified = TRUE
      AND vehicle_type = ${vehicleType}
      AND current_latitude IS NOT NULL
      AND current_longitude IS NOT NULL
      AND current_latitude BETWEEN ${latitude - latDelta} AND ${latitude + latDelta}
      AND current_longitude BETWEEN ${longitude - lngDelta} AND ${longitude + lngDelta}
    LIMIT ${limit * 3}
  `;

  const drivers = rows as {
    id: number;
    first_name: string;
    last_name: string;
    profile_image_url: string | null;
    car_image_url: string | null;
    car_seats: number;
    rating: number | null;
    current_latitude: number;
    current_longitude: number;
  }[];

  // Filter by actual Haversine distance and sort
  const withDistance = drivers
    .map((d) => ({
      ...d,
      distance_km: haversineKm(
        latitude,
        longitude,
        d.current_latitude,
        d.current_longitude,
      ),
    }))
    .filter((d) => d.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);

  return withDistance;
}
