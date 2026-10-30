import { BrandingProvider } from "@/components/branding-provider";
import { readBranding } from "@/lib/server/branding";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/server/auth";
import { HttpError, safeUser } from "@/lib/server/permissions";
import { SessionBootstrap } from "@/components/session-bootstrap";
import "./globals.css";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const branding = await readBranding();
  return { title: branding.name, icons: { icon: [{ url: branding.logoUrl ?? "/api/branding/logo?v=default", type: branding.logoUrl ? "image/png" : "image/svg+xml" }] } };
}

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
    // Initial authentication is defense-in-depth only: layouts are cached on
    // client navigation. Every protected page owns its live authorization,
    // current identity bootstrap and route-specific notices via protectedPage.
    // Never put path-dependent content or demo/denial notices in this layout.
    content = <SessionBootstrap user={safeUser(user)}>{content}</SessionBootstrap>;
  }
  return <html lang="en"><body className="min-h-screen antialiased"><BrandingProvider initial={await readBranding()}>{content}</BrandingProvider></body></html>;
}

