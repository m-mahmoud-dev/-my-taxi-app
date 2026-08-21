import { useAuth } from "@clerk/clerk-expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? "").replace(
  /\/+$/,
  "",
);

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchAPI<T>(
  url: string,
  options?: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...init } = options ?? {};

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${url}`, { ...init, headers });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

// Query keys
export const queryKeys = {
  rides: {
    all: ["rides"] as const,
    list: (userId: string) => [...queryKeys.rides.all, "list", userId] as const,
    detail: (rideId: number) =>
      [...queryKeys.rides.all, "detail", rideId] as const,
  },
  drivers: {
    all: ["drivers"] as const,
    nearby: (params: {
      latitude: number;
      longitude: number;
      radius_km?: number;
    }) => [...queryKeys.drivers.all, "nearby", params] as const,
    profile: () => [...queryKeys.drivers.all, "profile"] as const,
  },
  auth: {
    user: () => ["auth", "user"] as const,
  },
};

// Ride queries
export function useRides() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.rides.all,
    queryFn: async () => {
      const token = await getToken();
      const data = await fetchAPI<{ data: any[] }>("/v1/ride", {
        token: token ?? undefined,
      });
      return data.data;
    },
    enabled: !!getToken,
  });
}

export function useRide(rideId: number) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.rides.detail(rideId),
    queryFn: async () => {
      const token = await getToken();
      const data = await fetchAPI<{ data: any }>(`/v1/ride/${rideId}`, {
        token: token ?? undefined,
      });
      return data.data;
    },
    enabled: !!getToken && !!rideId,
  });
}

// Ride mutations
export function useCreateRide() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      origin_address: string;
      destination_address: string;
      origin_latitude: number;
      origin_longitude: number;
      destination_latitude: number;
      destination_longitude: number;
      payment_method?: "cash";
      vehicle_type?: "standard";
    }) => {
      const token = await getToken();
      return fetchAPI<{ data: any }>("/v1/ride/create", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides.all });
    },
  });
}

export function useCancelRide() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (rideId: number) => {
      const token = await getToken();
      return fetchAPI<{ data: any }>(`/v1/ride/${rideId}/cancel`, {
        method: "POST",
        token: token ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides.all });
    },
  });
}

// Driver queries
export function useNearbyDrivers(params: {
  latitude: number;
  longitude: number;
  radius_km?: number;
}) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.drivers.nearby(params),
    queryFn: async () => {
      const token = await getToken();
      const searchParams = new URLSearchParams({
        latitude: params.latitude.toString(),
        longitude: params.longitude.toString(),
        ...(params.radius_km && { radius_km: params.radius_km.toString() }),
      });
      const data = await fetchAPI<{ data: any[] }>(
        `/v1/driver?${searchParams}`,
        {
          token: token ?? undefined,
        },
      );
      return data.data;
    },
    enabled: !!getToken && !!params.latitude && !!params.longitude,
    refetchInterval: 30_000, // Refetch every 30s for live driver locations
  });
}

export function useDriverProfile() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.drivers.profile(),
    queryFn: async () => {
      const token = await getToken();
      const data = await fetchAPI<{ data: any }>("/v1/driver/profile", {
        token: token ?? undefined,
      });
      return data.data;
    },
    enabled: !!getToken,
  });
}

// Driver mutations
export function useUpdateDriverLocation() {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      latitude: number;
      longitude: number;
      heading?: number;
      speed?: number;
      accuracy?: number;
    }) => {
      const token = await getToken();
      return fetchAPI<{ data: any }>("/v1/driver/location", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify(params),
      });
    },
  });
}

export function useUpdateDriverStatus() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      is_online: boolean;
      is_available?: boolean;
    }) => {
      const token = await getToken();
      return fetchAPI<{ data: any }>("/v1/driver/status", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.profile() });
    },
  });
}

export function useUpdateRideStatus() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (params: { rideId: number; status: string }) => {
      const token = await getToken();
      return fetchAPI<{ data: any }>(`/v1/ride/${params.rideId}/status`, {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({ status: params.status }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rides.detail(variables.rideId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.rides.all });
    },
  });
}

export function useUpdateDriverProfile() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (params: Record<string, any>) => {
      const token = await getToken();
      return fetchAPI<{ data: any }>("/v1/driver/profile", {
        method: "PUT",
        token: token ?? undefined,
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.profile() });
    },
  });
}

// Types
export type { ApiError };
