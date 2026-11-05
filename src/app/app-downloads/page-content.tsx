"use client";
import * as React from "react";
import Link from "next/link";
import { useUiCopy } from "@/lib/ui-copy";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { hasCurrentModule, useCurrentUser } from "@/lib/current-user";

type AppDef = { href: string; module: string[]; name: [string, string]; desc: [string, string] };
const APPS: AppDef[] = [
  { href: "/waiter", module: ["POS_WAITER", "POS_CASHIER"], name: ["Waiter", "Waiter"], desc: ["Take table orders and send them to the kitchen. No payment.", "Table orders lo aur kitchen ko bhejo. Payment nahi."] },
  { href: "/kitchen", module: ["POS_KITCHEN", "POS_CASHIER"], name: ["Kitchen / Bar", "Kitchen / Bar"], desc: ["Live preparation queue for the kitchen and bar.", "Kitchen aur bar ke liye live preparation queue."] },
  { href: "/pos", module: ["POS_CASHIER"], name: ["POS / Cashier", "POS / Cashier"], desc: ["Billing, payments, void and order history.", "Billing, payment, void aur order history."] },
];

export default function AppDownloadsPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  return <AppShell activeHref="/app-downloads">
    <PageHeader title={uiText("App Downloads", "App Downloads")} description={uiText("Each app below installs on a phone or tablet like a normal app — no app store needed. Open it on the device, then install.", "Neeche har app phone/tablet par ek normal app jaisa install hoti hai — app store ki zaroorat nahi. Device par kholo, phir install karo.")} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {APPS.filter(app => hasCurrentModule(actor, ...app.module)).map(app => <Card key={app.href}>
        <CardHeader><CardTitle>{uiText(...app.name)}</CardTitle><CardDescription>{uiText(...app.desc)}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Button asChild><Link href={app.href}>{uiText("Open app", "App kholo")}</Link></Button>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{uiText("Android / Chrome / Edge:", "Android / Chrome / Edge:")}</p>
            <p>{uiText("Open the app above, then tap \"Install this app\" at the top — or tap the browser menu → \"Install app\" / \"Add to Home screen\".", "Upar app kholo, phir \"Install this app\" dabao — ya browser menu → \"Install app\" / \"Add to Home screen\" dabao.")}</p>
            <p className="font-medium text-foreground">{uiText("iPhone / iPad (Safari):", "iPhone / iPad (Safari):")}</p>
            <p>{uiText("Open the app above, tap the Share icon, then \"Add to Home Screen\".", "Upar app kholo, Share icon dabao, phir \"Add to Home Screen\" dabao.")}</p>
          </div>
        </CardContent>
      </Card>)}
      {!APPS.some(app => hasCurrentModule(actor, ...app.module)) && <p role="alert">{uiText("No installable app is available for your current access.", "Aapki current access ke liye koi installable app available nahi hai.")}</p>}
    </div>
  </AppShell>;
}
