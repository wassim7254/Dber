import { authenticate } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { listUserRoles } from "@/domains/identity/application/role-service";
import { fail, ok } from "@/lib/http/envelope";
import { UnauthorizedError } from "@/lib/errors";

export async function GET(): Promise<Response> {
  try {
    const identity = await authenticate();
    if (!identity) throw new UnauthorizedError();
    const roles = await listUserRoles(db, identity.userId);
    return ok({ roles, activeRole: identity.role });
  } catch (error) {
    return fail(error);
  }
}
