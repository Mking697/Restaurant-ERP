import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/server/auth";
import { HttpError, safeUser } from "@/lib/server/permissions";
import { canOpenPath, isPersistedPath } from "@/lib/server/page-access";
import { AppShell } from "@/components/app-shell";
import { SessionBootstrap } from "@/components/session-bootstrap";
import { AccessDeniedNotice, DemoDataNotice } from "@/components/session-notices";

/** Call from EVERY protected server page, not a cached layout/template.
 * The route is owned by the page, never a browser-supplied pathname/header.
 * Delay rendering until the live DB session and module permission pass.
 */
export async function protectedPage(path: string, render: () => ReactNode | Promise<ReactNode>) {
  let user;
  try { user = await requireIdentity(); }
  catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    throw error;
  }
  const content = canOpenPath(user, path)
    ? <>{!isPersistedPath(path) && <DemoDataNotice />}{await render()}</>
    : <AppShell><AccessDeniedNotice /></AppShell>;
  // Per-page bootstrap refreshes the request-safe identity on client navigation.
  return <SessionBootstrap user={safeUser(user)}>{content}</SessionBootstrap>;
}
