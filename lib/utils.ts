import { Ride } from "@/types/type";

const FARE_BASE_MRU = Number(process.env.EXPO_PUBLIC_FARE_BASE_MRU ?? 100);
const FARE_PER_KM_MRU = Number(process.env.EXPO_PUBLIC_FARE_PER_KM_MRU ?? 100);

/**
 * Client-side fare preview, mirroring the server fare engine (fare_rules):
 * base 100 MRU covers the first km, +100 MRU per additional started km.
 * The server recomputes the authoritative fare at booking time.
 */
export function estimateFareMRU(
  distanceKm: number,
  _vehicleType = "standard",
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return FARE_BASE_MRU;
  const extraKms = Math.max(0, Math.ceil(distanceKm) - 1);
  return Math.max(FARE_BASE_MRU, FARE_BASE_MRU + FARE_PER_KM_MRU * extraKms);
}

export function formatMRU(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "0 MRU";
  return `${Math.round(value)} MRU`;
}

export const sortRides = (rides: Ride[]): Ride[] => {
  return [...rides].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });
};

export function formatTime(minutes: number): string {
  const formattedMinutes = +minutes?.toFixed(0) || 0;

  if (formattedMinutes < 60) {
    return `${formattedMinutes} min`;
  } else {
    const hours = Math.floor(formattedMinutes / 60);
    const remainingMinutes = formattedMinutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate();
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  return `${day < 10 ? "0" + day : day} ${month} ${year}`;
}
