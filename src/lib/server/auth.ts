import "server-only";

import { adminAuth, adminDb } from "~/lib/firebase/admin";
import { ROLES, type Role } from "~/lib/roles";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type AuthedUser = { uid: string; email: string | null; role: Role };

/**
 * Verifies the Firebase ID token in `Authorization: Bearer <token>` and loads
 * the user's role from users/{uid}. Throws HttpError(401/403).
 */
export async function requireUser(
  request: Request,
  roles?: readonly Role[],
): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing Authorization bearer token");

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new HttpError(401, "Invalid or expired ID token — sign in again");
  }

  const role = (await adminDb.doc(`users/${decoded.uid}`).get()).get(
    "role",
  ) as unknown;
  if (!ROLES.includes(role as Role)) {
    throw new HttpError(403, "No role on this account — finish onboarding");
  }
  if (roles && !roles.includes(role as Role)) {
    throw new HttpError(
      403,
      `This action needs role ${roles.join(" or ")}; you are ${String(role)}`,
    );
  }
  return { uid: decoded.uid, email: decoded.email ?? null, role: role as Role };
}

/** JSON error body shared by the API routes. */
export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json(
      { ok: false, error: err.message },
      { status: err.status },
    );
  }
  console.error("[api] unexpected error:", err);
  return Response.json(
    { ok: false, error: err instanceof Error ? err.message : String(err) },
    { status: 500 },
  );
}
