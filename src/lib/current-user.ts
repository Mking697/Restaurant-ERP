"use client";
import * as React from "react";
import { type ModuleKey } from "@/lib/moduleAccess";
export interface CurrentUser {
  id: string; name: string; phone: string; phoneE164: string; role: string;
  branch: string; branchId: string | null; moduleAccess: ModuleKey[];
  status: "Active" | "Inactive"; ready: boolean; authenticated: boolean; error: string | null;
}
const anonymous: CurrentUser = {
  id: "", name: "", phone: "", phoneE164: "", role: "ANONYMOUS", branch: "", branchId: null,
  moduleAccess: [], status: "Inactive", ready: false, authenticated: false, error: null,
};
let snapshot = anonymous;
let pending: Promise<void> | null = null;
let identityVersion = 0;
const listeners = new Set<() => void>();
function publish(value: CurrentUser) { snapshot = value; listeners.forEach(fn => fn()); }
export function getCurrentUser() { return snapshot; }
export function clearCurrentUser() { identityVersion++; publish({ ...anonymous, ready: true }); }
export async function refreshCurrentUser(): Promise<void> {
  if (pending) return pending;
  const version = identityVersion;
  pending = (async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json();
      if (version !== identityVersion) return;
      if (response.status === 401) { clearCurrentUser(); return; }
      if (!response.ok || !data.user?.id) throw new Error(data.error || "Could not verify session");
      const user = data.user;
      publish({ ...user, phone: user.phoneE164, branch: user.branchId ?? "All branches", ready: true, authenticated: true, error: null });
    } catch (error) {
      if (version !== identityVersion) return;
      publish({ ...anonymous, ready: true, error: error instanceof Error ? error.message : "Could not verify session" });
    }
  })().finally(() => { pending = null; });
  return pending;
}
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** Cookie-backed identity; anonymous until verified. No provider required. */
export function useCurrentUser(): CurrentUser {
  const user = React.useSyncExternalStore(subscribe, getCurrentUser, () => anonymous);
  React.useEffect(() => {
    void refreshCurrentUser();
    const refresh = () => { void refreshCurrentUser(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);
  return user;
}
export function hasCurrentModule(user: CurrentUser, ...keys: string[]) {
  return user.ready && user.authenticated && (user.role === "SUPER_ADMIN" || keys.some(key => user.moduleAccess.includes(key as ModuleKey)));
}
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) clearCurrentUser();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

