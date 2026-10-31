"use client";
import * as React from "react";
import { getCurrentUser, requestJson, useCurrentUser } from "@/lib/current-user";
const listeners = new Set<() => void>();
const storageKey = (id: string) => `restaurant-owner-branch:${id}`;
function subscribe(fn: () => void) {
  listeners.add(fn); window.addEventListener("storage", fn);
  return () => { listeners.delete(fn); window.removeEventListener("storage", fn); };
}
function getSnapshot() {
  const user = getCurrentUser();
  try { return window.localStorage.getItem(storageKey(user.id)) || "all"; } catch { return "all"; }
}
export function setSelectedBranchId(id: string) {
  const user = getCurrentUser();
  if (!user.authenticated || user.role !== "SUPER_ADMIN") return;
  try { window.localStorage.setItem(storageKey(user.id), id); } catch { /* selection still emits */ }
  listeners.forEach(fn => fn());
}
/** Every caller is synchronously locked to the session branch, never stale owner storage. */
export function useSelectedBranchId(): string {
  const user = useCurrentUser();
  const selected = React.useSyncExternalStore(subscribe, getSnapshot, () => "all");
  if (!user.ready || !user.authenticated) return "__no_branch__";
  return user.role === "SUPER_ADMIN" ? selected : user.branchId || "__no_branch__";
}
export interface BranchRecord {
  id: string; code: string; name: string; address: string; lat: string; lng: string; geofenceRadiusM: number; vatRatePercent: string | null;
}
export function notifyBranchesChanged() { window.dispatchEvent(new Event("restaurant-branches-changed")); }
export function useBranches() {
  const user = useCurrentUser();
  const [state, setState] = React.useState<{ identity: string; branches: BranchRecord[]; error: string; loading: boolean }>({ identity: "", branches: [], error: "", loading: true });
  React.useEffect(() => {
    if (!user.authenticated) return;
    let active = true;
    const load = async () => {
      setState({ identity: user.id, branches: [], error: "", loading: true });
      try { const data = await requestJson<{ branches: BranchRecord[] }>("/api/branches"); if (active) setState({ identity: user.id, branches: data.branches, error: "", loading: false }); }
      catch (error) { if (active) setState({ identity: user.id, branches: [], error: error instanceof Error ? error.message : "Could not load branches", loading: false }); }
    };
    void load(); window.addEventListener("restaurant-branches-changed", load);
    return () => { active = false; window.removeEventListener("restaurant-branches-changed", load); };
  }, [user.id, user.authenticated, user.branchId, user.role]);
  return user.authenticated && state.identity === user.id ? state : { branches: [], error: "", loading: true };
}

