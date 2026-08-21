import { createClerkClient, verifyToken } from "@clerk/backend";
import { neon } from "@neondatabase/serverless";

import { ApiError } from "@/lib/api-error";

export { ApiError } from "@/lib/api-error";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const sql = neon(`${process.env.DATABASE_URL}`);

export type AuthContext = {
  userId: string;
  isDriver: boolean;
  driverId?: number;
  driverProfile?: {
    id: number;
    status: string;
    vehicle_type: string;
    documents_verified: boolean;
  };
};

export async function requireAuth(request: Request): Promise<AuthContext> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload.sub) {
      throw new ApiError(401, "Invalid session token");
    }

    const context = await syncUser(payload.sub);

    return context;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid or expired session token");
  }
}

export async function requireDriverAuth(
  request: Request,
): Promise<AuthContext & { driverId: number }> {
  const context = await requireAuth(request);

  if (!context.isDriver || !context.driverId) {
    throw new ApiError(403, "Driver access required");
  }

  if (context.driverProfile?.status !== "approved") {
    throw new ApiError(403, "Driver not approved");
  }

  return context as AuthContext & { driverId: number };
}

async function syncUser(clerkId: string): Promise<AuthContext> {
  const existing =
    await sql`SELECT clerk_id FROM users WHERE clerk_id = ${clerkId}`;
  if (existing.length > 0) {
    // Check if user has driver profile
    const driverProfile = await sql`
      SELECT dp.id, dp.driver_id, dp.status, dp.vehicle_type, dp.documents_verified
      FROM driver_profiles dp
      WHERE dp.user_id = ${clerkId}
    `;

    if (driverProfile.length > 0) {
      const dp = driverProfile[0];
      return {
        userId: clerkId,
        isDriver: true,
        driverId: dp.driver_id,
        driverProfile: {
          id: dp.id,
          status: dp.status,
          vehicle_type: dp.vehicle_type,
          documents_verified: dp.documents_verified,
        },
      };
    }

    return { userId: clerkId, isDriver: false };
  }

  let name = clerkId;
  let email = `${clerkId}@user.local`;
  let phone: string | null = null;

  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);

    const fullName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fullName) name = fullName;

    const primaryEmail = clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;
    if (primaryEmail) email = primaryEmail;

    const metadata = clerkUser.publicMetadata as
      | Record<string, unknown>
      | undefined;
    if (metadata?.phone && typeof metadata.phone === "string") {
      phone = metadata.phone;
    }
  } catch (error) {
    console.error(`[api-auth] Failed to fetch Clerk user ${clerkId}:`, error);
  }

  try {
    await sql`
      INSERT INTO users (name, email, clerk_id, phone)
      VALUES (${name}, ${email}, ${clerkId}, ${phone})
      ON CONFLICT (clerk_id) DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = COALESCE(EXCLUDED.phone, users.phone),
            updated_at = now()
    `;
  } catch (error) {
    console.error(`[api-auth] Failed to sync user ${clerkId}:`, error);
  }

  return { userId: clerkId, isDriver: false };
}
