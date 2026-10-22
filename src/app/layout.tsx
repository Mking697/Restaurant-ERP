import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/permissions";
import { canOpenPath, isPersistedPath } from "@/lib/server/page-access";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Restaurant HQ — ERP",
  description: "Multi-branch restaurant chain ERP + WhatsApp automation",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-restaurant-path") ?? "/";
  let content = children;
  if (path !== "/login" && path !== "/setup") {
    let user;
    try { user = await requireIdentity(); }
    catch (error) {
      if (error instanceof HttpError && error.status === 401) redirect("/login");
      throw error;
    }
    if (!canOpenPath(user, path)) {
      content = <AppShell><h1 className="text-xl font-semibold">Access nahi hai</h1><p className="mt-3 text-sm text-muted-foreground">Is module ki permission ke liye apne branch admin se baat karein.</p><a className="mt-4 inline-block underline" href="/guide">Apni Guide Book kholein</a></AppShell>;
    } else if (!isPersistedPath(path)) {
      // CLIENT DEMO MODE: render the module's real (working, interactive)
      // UI on top of its seeded mock-data.ts rows instead of a hard block —
      // user explicitly asked to show every module working for a client
      // walkthrough and will clear this demo data before go-live. A visible
      // banner keeps this honest instead of silently passing it off as real
      // branch-isolated data. Flip back to the hard "pending" block (see git
      // history on this file) once each module gets its own DB migration.
      content = (
        <>
          <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
            Demo Data — client demo ke liye seeded hai, abhi real database se connected nahi. Go-live se pehle hata diya jaayega.
          </div>
          {children}
        </>
      );
    }
  }
  return <html lang="en"><body className="min-h-screen antialiased">{content}</body></html>;
}

