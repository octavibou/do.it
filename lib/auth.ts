import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isAuthConfigured,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth-token";

export async function getSession(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<void> {
  const ok = await getSession();
  if (!ok) {
    throw new Error("Unauthorized");
  }
}

export async function sessionOkIfNeeded(bearerOk: boolean): Promise<boolean> {
  if (bearerOk) {
    return false;
  }
  return getSession();
}
