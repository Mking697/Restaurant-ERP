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
export type SessionUser = Pick<CurrentUser, "id" | "name" | "phoneE164" | "role" | "branchId" | "status"> & { moduleAccess: readonly string[] };
export function verifiedCurrentUser(user: SessionUser): CurrentUser {
  // Explicit allowlist: no password hash, token/version, or arbitrary DTO fields.
  return { id: user.id, name: user.name, phoneE164: user.phoneE164, phone: user.phoneE164,
    role: user.role, branchId: user.branchId, branch: user.branchId ?? "All branches",
    moduleAccess: [...user.moduleAccess] as ModuleKey[], status: user.status, ready: true, authenticated: true, error: null };
}
/** Request-scoped SSR snapshot; never write server identity to the module singleton. */
export const SessionIdentityContext = React.createContext<CurrentUser | null>(null);
export function seedCurrentUser(user: SessionUser) { identityVersion++; publish(verifiedCurrentUser(user)); }
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
  const task = (async () => {
    // One retry only; the deadline covers response body decoding too. Promise.race
    // also settles when a transport ignores AbortSignal (e.g. stalled browser IO).
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          (async () => {
            const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
            if (response.status === 401) return { response, data: null };
            return { response, data: await response.json() };
          })(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Session verification timed out. Please retry.")); }, 8000); }),
        ]);
        if (version !== identityVersion) return;
        if (result.response.status === 401) { clearCurrentUser(); return; }
        if (!result.response.ok || !result.data?.user?.id || result.data.user.status !== "Active") throw new Error(result.data?.error || "Could not verify session");
        publish(verifiedCurrentUser(result.data.user));
        return;
      } catch (error) {
        if (version !== identityVersion) return;
        if (attempt === 1) publish({ ...anonymous, ready: true, error: error instanceof Error ? error.message : "Could not verify session" });
      } finally { if (timer !== undefined) clearTimeout(timer); }
    }
  })();
  pending = task;
  void task.finally(() => { if (pending === task) pending = null; });
  return task;
}
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
let refreshConsumers = 0;
let stopRefresh: (() => void) | null = null;
/** Shared lifecycle, regardless of the number of hooks/branch selectors mounted. */
export function startCurrentUserRefresh() {
  refreshConsumers++;
  if (refreshConsumers === 1) {
    if (!snapshot.ready) void refreshCurrentUser();
    const refresh = () => { void refreshCurrentUser(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    stopRefresh = () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--refreshConsumers === 0) { stopRefresh?.(); stopRefresh = null; }
  };
}
/** Cookie-backed identity with a request-scoped server snapshot for hydration. */
export function useCurrentUser(): CurrentUser {
  const initial = React.useContext(SessionIdentityContext);
  const user = React.useSyncExternalStore(subscribe, () => snapshot.ready ? snapshot : initial ?? snapshot, () => initial ?? anonymous);
  React.useEffect(() => {
    // The bootstrap owns refresh for its whole tree; legacy standalone consumers
    // share the same lifecycle rather than creating timers for every hook.
    if (!initial) return startCurrentUserRefresh();
  }, [initial]);
  return user;
}
export function hasCurrentModule(user: CurrentUser, ...keys: string[]) {
  return user.ready && user.authenticated && (user.role === "SUPER_ADMIN" || keys.some(key => user.moduleAccess.includes(key as ModuleKey)));
}
export class RequestJsonError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "unknown", public readonly status?: number) {
    super(message);
    this.name = "RequestJsonError";
  }
}
/** One bounded attempt, including body decoding. Never automatically retry a write. */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const writing = !["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase());
  const uncertain = writing ? " The change may already be saved. Check saved records before retrying." : " Please retry loading records.";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        cancel = () => { reject(new RequestJsonError("Request cancelled." + uncertain, "unknown")); controller.abort(); };
        if (init?.signal?.aborted) { cancel(); return; }
        init?.signal?.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(() => { reject(new RequestJsonError("Request timed out." + uncertain, "unknown")); controller.abort(); }, 15000);
      }),
      (async () => {
        if (controller.signal.aborted) throw new RequestJsonError("Request cancelled." + uncertain, "unknown");
        const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store", credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
        if (response.status === 401) clearCurrentUser();
        const data = await response.json();
        if (!response.ok) {
          const rejected = [400, 401, 403, 404, 405, 409, 413, 422].includes(response.status);
          throw new RequestJsonError((data?.error || `Request failed (${response.status})`) + (!rejected ? uncertain : ""), rejected ? "rejected" : "unknown", response.status);
        }
        return data as T;
      })(),
    ]);
  } catch (error) {
    if (error instanceof RequestJsonError) throw error;
    throw new RequestJsonError("Could not confirm the request." + uncertain, "unknown");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (cancel) init?.signal?.removeEventListener("abort", cancel);
  }
}

