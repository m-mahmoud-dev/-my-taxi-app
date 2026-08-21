import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? "").replace(
  /\/+$/,
  "",
);

export class ApiFetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
  }
}

type FetchOptions = RequestInit & { token?: string };

export const fetchAPI = async (url: string, options?: FetchOptions) => {
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
      // Non-JSON error body; keep the default message.
    }
    throw new ApiFetchError(response.status, message);
  }

  return response.json();
};

export const useFetch = <T>(url: string, options?: RequestInit) => {
  const { getToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const result = await fetchAPI(url, {
        ...options,
        token: token ?? undefined,
      });
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [url, options, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};
