import { neon } from "@neondatabase/serverless";
import { Webhook } from "svix";

import { apiHandler } from "@/lib/api-handler";

const sql = neon(`${process.env.DATABASE_URL}`);
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

async function recordWebhookEvent(
  clerkEventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await sql`
      INSERT INTO webhook_events (clerk_event_id, event_type, payload)
      VALUES (${clerkEventId}, ${eventType}, ${JSON.stringify(payload)})
      ON CONFLICT (clerk_event_id) DO NOTHING
    `;
    return true;
  } catch (error) {
    console.error("[webhook] Failed to record event:", error);
    return false;
  }
}

async function markWebhookProcessed(
  clerkEventId: string,
  error?: string,
): Promise<void> {
  await sql`
    UPDATE webhook_events
    SET processed = TRUE,
        processed_at = now(),
        error_message = ${error ?? null}
    WHERE clerk_event_id = ${clerkEventId}
  `;
}

async function handleUserCreated(payload: any): Promise<void> {
  const {
    id,
    email_addresses,
    first_name,
    last_name,
    public_metadata,
    unsafe_metadata,
  } = payload.data;

  const primaryEmail = email_addresses.find(
    (e: any) => e.id === payload.data.primary_email_address_id,
  )?.email_address;
  const fullName =
    [first_name, last_name].filter(Boolean).join(" ").trim() || id;
  const phone = public_metadata?.phone || unsafe_metadata?.phone;

  await sql`
    INSERT INTO users (clerk_id, name, email, phone)
    VALUES (${id}, ${fullName}, ${primaryEmail}, ${phone})
    ON CONFLICT (clerk_id) DO UPDATE
      SET name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = COALESCE(EXCLUDED.phone, users.phone),
          updated_at = now()
  `;
}

async function handleUserUpdated(payload: any): Promise<void> {
  const {
    id,
    email_addresses,
    first_name,
    last_name,
    public_metadata,
    unsafe_metadata,
  } = payload.data;

  const primaryEmail = email_addresses.find(
    (e: any) => e.id === payload.data.primary_email_address_id,
  )?.email_address;
  const fullName =
    [first_name, last_name].filter(Boolean).join(" ").trim() || id;
  const phone = public_metadata?.phone || unsafe_metadata?.phone;

  await sql`
    UPDATE users
    SET name = ${fullName},
        email = ${primaryEmail},
        phone = COALESCE(${phone}, phone),
        updated_at = now()
    WHERE clerk_id = ${id}
  `;
}

async function handleUserDeleted(payload: any): Promise<void> {
  const { id } = payload.data;
  await sql`DELETE FROM users WHERE clerk_id = ${id}`;
}

async function handleSessionCreated(payload: any): Promise<void> {
  // Session created - could track active sessions if needed
  console.log("[webhook] Session created for user:", payload.data.user_id);
}

async function handleSessionEnded(payload: any): Promise<void> {
  // Session ended - could track inactive sessions
  console.log("[webhook] Session ended for user:", payload.data.user_id);
}

const handlers: Record<string, (payload: any) => Promise<void>> = {
  "user.created": handleUserCreated,
  "user.updated": handleUserUpdated,
  "user.deleted": handleUserDeleted,
  "session.created": handleSessionCreated,
  "session.ended": handleSessionEnded,
};

export const POST = apiHandler({
  rateLimit: { limit: 100, windowMs: 60_000 },
  handler: async (request) => {
    if (!webhookSecret) {
      console.error("[webhook] CLERK_WEBHOOK_SECRET not configured");
      return Response.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }

    const headers = Object.fromEntries(request.headers.entries());
    const payload = await request.json();
    const clerkEventId = headers["svix-id"];
    const _eventType = headers["svix-timestamp"] ? "verified" : "unknown";

    // Verify webhook signature
    const wh = new Webhook(webhookSecret);
    let verifiedPayload: any;
    try {
      verifiedPayload = wh.verify(JSON.stringify(payload), {
        "svix-id": headers["svix-id"] || "",
        "svix-timestamp": headers["svix-timestamp"] || "",
        "svix-signature": headers["svix-signature"] || "",
      });
    } catch (err) {
      console.error("[webhook] Signature verification failed:", err);
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }

    const eventTypeActual = verifiedPayload.type;
    const recorded = await recordWebhookEvent(
      clerkEventId || "",
      eventTypeActual,
      verifiedPayload,
    );

    if (!recorded) {
      // Already processed
      return Response.json({ received: true, duplicate: true });
    }

    const handler = handlers[eventTypeActual];
    if (handler) {
      try {
        await handler(verifiedPayload);
        await markWebhookProcessed(clerkEventId || "");
      } catch (error) {
        console.error(`[webhook] Handler error for ${eventTypeActual}:`, error);
        await markWebhookProcessed(clerkEventId || "", String(error));
        return Response.json({ error: "Handler failed" }, { status: 500 });
      }
    } else {
      await markWebhookProcessed(clerkEventId || "");
      console.log("[webhook] Unhandled event type:", eventTypeActual);
    }

    return Response.json({ received: true });
  },
});
