import { get, set, del } from "idb-keyval";
import type { AuthUser } from "./api-client";

export const AUTH_USER_KEY = "copilot-auth-user";

export async function getCachedAuthUser(): Promise<AuthUser | null> {
  try {
    return (await get<AuthUser>(AUTH_USER_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function setCachedAuthUser(user: AuthUser): Promise<void> {
  try {
    await set(AUTH_USER_KEY, user);
  } catch {
    // Silently ignore — persistence is best-effort
  }
}

export async function clearCachedAuthUser(): Promise<void> {
  try {
    await del(AUTH_USER_KEY);
  } catch {
    // Silently ignore
  }
}
