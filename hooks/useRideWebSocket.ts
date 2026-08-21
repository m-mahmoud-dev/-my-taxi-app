import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef, useState, useCallback } from "react";

type WSMessage =
  | {
      type: "connected";
      connectionId: string;
      isDriver: boolean;
      driverId?: number;
    }
  | { type: "subscribed"; rideId: number }
  | { type: "unsubscribed"; rideId: number }
  | {
      type: "ride_status";
      rideId: number;
      status: string;
      driverId?: number;
      paymentStatus?: string;
      timestamp: string;
    }
  | {
      type: "driver_location";
      rideId: number;
      driverId: number;
      latitude: number;
      longitude: number;
      timestamp: string;
    }
  | { type: "location_ack" }
  | { type: "pong" }
  | { type: "error"; message: string };

type WSOutgoingMessage =
  | { type: "subscribe"; rideId: number }
  | { type: "unsubscribe"; rideId: number }
  | { type: "driver_location"; latitude: number; longitude: number }
  | { type: "ride_status"; rideId: number; status: string }
  | { type: "ping" };

interface UseRideWebSocketOptions {
  rideId?: number;
  onRideStatus?: (data: WSMessage & { type: "ride_status" }) => void;
  onDriverLocation?: (data: WSMessage & { type: "driver_location" }) => void;
  onError?: (message: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useRideWebSocket({
  rideId,
  onRideStatus,
  onDriverLocation,
  onError,
  onConnect,
  onDisconnect,
}: UseRideWebSocketOptions) {
  const { getToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const rideIdRef = useRef(rideId);
  const handlersRef = useRef({ onRideStatus, onDriverLocation, onError });

  // Update refs when handlers change
  useEffect(() => {
    handlersRef.current = { onRideStatus, onDriverLocation, onError };
  }, [onRideStatus, onDriverLocation, onError]);

  useEffect(() => {
    rideIdRef.current = rideId;
  }, [rideId]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = await getToken();
      if (!token) {
        console.warn("[WS] No token available");
        return;
      }

      const wsUrl = (
        process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:8080"
      ).replace(/^http/, "ws");
      const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected");
        setIsConnected(true);
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);

          switch (message.type) {
            case "connected":
              setConnectionId(message.connectionId);
              // Auto-subscribe to ride if provided
              if (rideIdRef.current) {
                ws.send(
                  JSON.stringify({
                    type: "subscribe",
                    rideId: rideIdRef.current,
                  }),
                );
              }
              break;

            case "ride_status":
              handlersRef.current.onRideStatus?.(message);
              break;

            case "driver_location":
              handlersRef.current.onDriverLocation?.(message);
              break;

            case "error":
              handlersRef.current.onError?.(message.message);
              break;
          }
        } catch (error) {
          console.error("[WS] Message parse error:", error);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected");
        setIsConnected(false);
        onDisconnect?.();

        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error("[WS] Error:", error);
      };
    } catch (error) {
      console.error("[WS] Connection failed:", error);
      // Retry after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [getToken, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionId(null);
  }, []);

  const send = useCallback((message: WSOutgoingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback(
    (rideId: number) => {
      rideIdRef.current = rideId;
      send({ type: "subscribe", rideId });
    },
    [send],
  );

  const unsubscribe = useCallback(
    (rideId: number) => {
      send({ type: "unsubscribe", rideId });
    },
    [send],
  );

  const sendDriverLocation = useCallback(
    (latitude: number, longitude: number) => {
      send({ type: "driver_location", latitude, longitude });
    },
    [send],
  );

  const sendRideStatus = useCallback(
    (rideId: number, status: string) => {
      send({ type: "ride_status", rideId, status });
    },
    [send],
  );

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionId,
    subscribe,
    unsubscribe,
    sendDriverLocation,
    sendRideStatus,
    disconnect,
    connect,
  };
}
