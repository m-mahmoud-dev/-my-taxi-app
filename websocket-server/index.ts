#!/usr/bin/env node
/**
 * WebSocket Server for Real-time Ride Tracking
 *
 * Run separately: node websocket-server/index.js
 * Or with: npm run ws-server
 */

import { createServer } from "http";

import { verifyToken } from "@clerk/backend";
import { neon } from "@neondatabase/serverless";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.WS_PORT || 8080;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const sql = neon(DATABASE_URL);

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  isDriver: boolean;
  driverId?: number;
  rideId?: number;
  lastPing: number;
}

const clients = new Map<string, ClientInfo>();
const rideSubscriptions = new Map<number, Set<string>>(); // rideId -> Set<connectionId>
const driverSessions = new Map<number, Set<string>>(); // driverId -> Set<connectionId>

function generateConnectionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function authenticateConnection(
  ws: WebSocket,
  token: string,
): Promise<ClientInfo | null> {
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });

    if (!payload.sub) {
      ws.close(4001, "Invalid token");
      return null;
    }

    // Check if driver
    const driverProfile = await sql`
      SELECT dp.id, dp.driver_id, dp.status, dp.documents_verified
      FROM driver_profiles dp
      WHERE dp.user_id = ${payload.sub}
    `;

    const isDriver =
      driverProfile.length > 0 && driverProfile[0].status === "approved";
    const driverId = isDriver ? driverProfile[0].driver_id : undefined;

    const connectionId = generateConnectionId();
    const clientInfo: ClientInfo = {
      ws,
      userId: payload.sub,
      isDriver,
      driverId,
      lastPing: Date.now(),
    };

    clients.set(connectionId, clientInfo);

    // Record driver session
    if (isDriver && driverId) {
      await sql`
        INSERT INTO driver_sessions (driver_id, user_id, connection_id, is_online, last_heartbeat)
        VALUES (${driverId}, ${payload.sub}, ${connectionId}, TRUE, now())
        ON CONFLICT (connection_id) DO UPDATE
          SET is_online = TRUE, last_heartbeat = now()
      `;

      if (!driverSessions.has(driverId)) {
        driverSessions.set(driverId, new Set());
      }
      driverSessions.get(driverId)!.add(connectionId);
    }

    console.log(
      `[WS] Client connected: ${connectionId} (user: ${payload.sub}, driver: ${isDriver})`,
    );
    return clientInfo;
  } catch (error) {
    console.error("[WS] Auth failed:", error);
    ws.close(4001, "Authentication failed");
    return null;
  }
}

async function handleSubscribe(
  clientId: string,
  rideId: number,
): Promise<void> {
  const client = clients.get(clientId);
  if (!client) return;

  // Verify user has access to this ride
  const rides = await sql`
    SELECT ride_id FROM rides 
    WHERE ride_id = ${rideId} 
    AND (user_id = ${client.userId} OR driver_id = ${client.driverId ?? -1})
  `;

  if (rides.length === 0) {
    send(client.ws, { type: "error", message: "Not authorized for this ride" });
    return;
  }

  client.rideId = rideId;

  if (!rideSubscriptions.has(rideId)) {
    rideSubscriptions.set(rideId, new Set());
  }
  rideSubscriptions.get(rideId)!.add(clientId);

  // Record subscription
  await sql`
    INSERT INTO ride_subscriptions (ride_id, user_id, connection_id)
    VALUES (${rideId}, ${client.userId}, ${clientId})
    ON CONFLICT DO NOTHING
  `;

  // Send current ride status
  const ride = await sql`
    SELECT ride_id, status, driver_id, payment_status, updated_at
    FROM rides WHERE ride_id = ${rideId}
  `;

  if (ride.length > 0) {
    send(client.ws, {
      type: "ride_status",
      rideId,
      status: ride[0].status,
      driverId: ride[0].driver_id,
      paymentStatus: ride[0].payment_status,
      timestamp: ride[0].updated_at,
    });
  }

  // If driver, send driver location
  if (client.isDriver && client.driverId) {
    const driver = await sql`
      SELECT current_latitude, current_longitude, last_heartbeat
      FROM drivers WHERE id = ${client.driverId}
    `;
    if (driver.length > 0 && driver[0].current_latitude) {
      broadcastToRide(
        rideId,
        {
          type: "driver_location",
          rideId,
          driverId: client.driverId,
          latitude: driver[0].current_latitude,
          longitude: driver[0].current_longitude,
          timestamp: driver[0].last_heartbeat,
        },
        clientId,
      ); // Don't send back to sender
    }
  }

  send(client.ws, { type: "subscribed", rideId });
  console.log(`[WS] Client ${clientId} subscribed to ride ${rideId}`);
}

async function handleUnsubscribe(
  clientId: string,
  rideId: number,
): Promise<void> {
  const client = clients.get(clientId);
  if (!client) return;

  client.rideId = undefined;
  rideSubscriptions.get(rideId)?.delete(clientId);

  await sql`
    DELETE FROM ride_subscriptions 
    WHERE ride_id = ${rideId} AND connection_id = ${clientId}
  `;

  send(client.ws, { type: "unsubscribed", rideId });
  console.log(`[WS] Client ${clientId} unsubscribed from ride ${rideId}`);
}

async function handleDriverLocation(
  clientId: string,
  data: { latitude: number; longitude: number },
): Promise<void> {
  const client = clients.get(clientId);
  if (!client || !client.isDriver || !client.driverId) {
    send(clients.get(clientId)?.ws, { type: "error", message: "Not a driver" });
    return;
  }

  // Update driver location in DB
  await sql`
    UPDATE drivers 
    SET current_latitude = ${data.latitude},
        current_longitude = ${data.longitude},
        location = ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)::geography,
        last_heartbeat = now()
    WHERE id = ${client.driverId}
  `;

  // Update session heartbeat
  await sql`
    UPDATE driver_sessions 
    SET last_heartbeat = now() 
    WHERE connection_id = ${clientId}
  `;

  // Broadcast to all subscribers of rides this driver is assigned to
  const rides = await sql`
    SELECT ride_id FROM rides 
    WHERE driver_id = ${client.driverId} 
    AND status IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_AT_PICKUP', 'TRIP_STARTED')
  `;

  for (const ride of rides) {
    broadcastToRide(
      ride.ride_id,
      {
        type: "driver_location",
        rideId: ride.ride_id,
        driverId: client.driverId,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: new Date().toISOString(),
      },
      clientId,
    );
  }

  send(client.ws, { type: "location_ack" });
}

async function handleRideStatusUpdate(
  clientId: string,
  data: { rideId: number; status: string },
): Promise<void> {
  const client = clients.get(clientId);
  if (!client) return;

  // Only drivers can update status for their assigned rides
  if (!client.isDriver || !client.driverId) {
    send(client.ws, {
      type: "error",
      message: "Only drivers can update ride status",
    });
    return;
  }

  // Verify driver owns this ride
  const rides = await sql`
    SELECT ride_id FROM rides 
    WHERE ride_id = ${data.rideId} AND driver_id = ${client.driverId}
  `;

  if (rides.length === 0) {
    send(client.ws, { type: "error", message: "Not assigned to this ride" });
    return;
  }

  // Import transition function logic (simplified for WS)
  // In production, use the same transitionRide function
  const { transitionRide } = await import("../lib/ride-state.js");

  try {
    const updated = await transitionRide(
      data.rideId,
      // We need current status - fetch it
      (await sql`SELECT status FROM rides WHERE ride_id = ${data.rideId}`)[0]
        ?.status || "",
      data.status,
      { userId: client.userId, role: "driver" },
    );

    if (updated) {
      broadcastToRide(data.rideId, {
        type: "ride_status",
        rideId: data.rideId,
        status: data.status,
        driverId: client.driverId,
        timestamp: new Date().toISOString(),
      });
    } else {
      send(client.ws, { type: "error", message: "Invalid status transition" });
    }
  } catch (error) {
    console.error("[WS] Status update error:", error);
    send(client.ws, { type: "error", message: "Status update failed" });
  }
}

function send(ws: WebSocket, message: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToRide(
  rideId: number,
  message: object,
  excludeClientId?: string,
): void {
  const subscribers = rideSubscriptions.get(rideId);
  if (!subscribers) return;

  const messageStr = JSON.stringify(message);

  for (const clientId of subscribers) {
    if (clientId === excludeClientId) continue;
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  }
}

function cleanupClient(clientId: string): void {
  const client = clients.get(clientId);
  if (!client) return;

  // Clean up ride subscription
  if (client.rideId) {
    rideSubscriptions.get(client.rideId)?.delete(clientId);
  }

  // Clean up driver session
  if (client.isDriver && client.driverId) {
    driverSessions.get(client.driverId)?.delete(clientId);

    // Mark driver offline if no more sessions
    if (driverSessions.get(client.driverId)?.size === 0) {
      sql`UPDATE drivers SET is_online = FALSE WHERE id = ${client.driverId}`.catch(
        console.error,
      );
      sql`UPDATE driver_sessions SET is_online = FALSE WHERE driver_id = ${client.driverId}`.catch(
        console.error,
      );
    }
  }

  clients.delete(clientId);
  console.log(`[WS] Client disconnected: ${clientId}`);
}

// Heartbeat interval
setInterval(() => {
  const now = Date.now();
  for (const [clientId, client] of clients) {
    if (now - client.lastPing > 60000) {
      // 60 seconds timeout
      console.log(`[WS] Client ${clientId} timed out`);
      client.ws.close(4002, "Ping timeout");
      cleanupClient(clientId);
    } else if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.ping();
    }
  }
}, 30000);

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  // Extract token from query string
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4000, "Token required");
    return;
  }

  const clientInfo = await authenticateConnection(ws, token);
  if (!clientInfo) return;

  const clientId = Array.from(clients.entries()).find(
    ([, v]) => v === clientInfo,
  )?.[0];
  if (!clientId) return;

  ws.on("pong", () => {
    clientInfo.lastPing = Date.now();
  });

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "subscribe":
          if (message.rideId) {
            await handleSubscribe(clientId, message.rideId);
          }
          break;

        case "unsubscribe":
          if (message.rideId) {
            await handleUnsubscribe(clientId, message.rideId);
          }
          break;

        case "driver_location":
          if (
            message.latitude !== undefined &&
            message.longitude !== undefined
          ) {
            await handleDriverLocation(clientId, message);
          }
          break;

        case "ride_status":
          if (message.rideId && message.status) {
            await handleRideStatusUpdate(clientId, message);
          }
          break;

        case "ping":
          send(ws, { type: "pong" });
          break;

        default:
          console.log("[WS] Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("[WS] Message error:", error);
      send(ws, { type: "error", message: "Invalid message format" });
    }
  });

  ws.on("close", () => {
    cleanupClient(clientId);
  });

  ws.on("error", (error) => {
    console.error("[WS] Connection error:", error);
    cleanupClient(clientId);
  });

  // Send welcome message
  send(ws, {
    type: "connected",
    connectionId: clientId,
    isDriver: clientInfo.isDriver,
    driverId: clientInfo.driverId,
  });
});

server.listen(PORT, () => {
  console.log(`[WS] WebSocket server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[WS] Shutting down...");
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
});
