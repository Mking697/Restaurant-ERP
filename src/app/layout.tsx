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
      content = <AppShell activeHref={path}><h1 className="text-xl font-semibold">Is module ka DB integration pending hai</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Branch/user management aur Inventory ab real database par hain. Yeh module abhi purane demo-data stage mein hai; branch isolation complete hone tak yahan doosri branches ka demo data nahi dikhaya jaayega.</p><a className="mt-4 inline-block underline" href="/guide">Guide Book kholein</a></AppShell>;
    }
  }
  return <html lang="en"><body className="min-h-screen antialiased">{content}</body></html>;
}

