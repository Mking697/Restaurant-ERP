"use client";
import * as React from "react";
import { SessionIdentityContext, seedCurrentUser, startCurrentUserRefresh, verifiedCurrentUser, type SessionUser } from "@/lib/current-user";

/** The only initial identity accepted here comes from the server's live session gate. */
export function SessionBootstrap({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const initial = React.useMemo(() => verifiedCurrentUser(user), [user]);
  React.useEffect(() => { seedCurrentUser(user); return startCurrentUserRefresh(); }, [user]);
  return <SessionIdentityContext.Provider value={initial}>{children}</SessionIdentityContext.Provider>;
}
