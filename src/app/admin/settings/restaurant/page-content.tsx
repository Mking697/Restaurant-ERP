"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BrandingFields, useBrandingError, type LogoUpload } from "@/components/branding-fields";
import { useBranding } from "@/components/branding-provider";
import { useTranslation } from "@/lib/i18n";
import { requestJson } from "@/lib/current-user";
import type { Branding } from "@/lib/branding";
export default function PageContent({initial}: {initial: Branding}) {
 const {t} = useTranslation(); const translateError = useBrandingError();
 const {setBranding} = useBranding(); const router = useRouter();
 const [name,setName] = useState(initial.name); const [logo,setLogo] = useState<LogoUpload | null>();
 const [saved,setSaved] = useState(initial); const [busy,setBusy] = useState(false); const [reading,setReading] = useState(false);
 const [error,setError] = useState(""); const [success,setSuccess] = useState(false);
 async function submit(event: FormEvent) {
  event.preventDefault(); if (busy || reading) return; setBusy(true); setError(""); setSuccess(false);
  try { const value = await requestJson<Branding>("/api/admin/settings/restaurant", {method:"POST",body:JSON.stringify({restaurantName:name,...(logo === undefined ? {} : {logo})})}); setSaved(value); setName(value.name); setLogo(undefined); setBranding(value); setSuccess(true); router.refresh(); }
  catch(error) { setError(error instanceof Error ? error.message : ""); }
  finally { setBusy(false); }
 }
 return <AppShell activeHref="/admin/settings/restaurant"><h1 className="text-2xl font-semibold">{t("Restaurant Settings", "Restaurant ki Settings")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Owner only. This name and logo appear for all branches, on sign-in and in the browser tab.", "Sirf Owner. Yeh naam aur logo saari branches, login aur browser tab par dikhenge.")}</p>
 <form onSubmit={submit} className="mt-6 max-w-lg space-y-4 rounded-xl border bg-card p-5"><BrandingFields name={name} onName={setName} logoUrl={saved.logoUrl} logo={logo} onLogo={setLogo} onBusy={setReading} disabled={busy}/>
 {error && <p role="alert" className="text-sm text-destructive">{translateError(error)}</p>}{success && <p role="status" className="text-sm">{t("Restaurant branding saved.", "Restaurant ka naam aur logo save ho gaye.")}</p>}
 <button disabled={busy || reading} className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? t("Saving…", "Save ho raha hai…") : t("Save restaurant", "Restaurant save karein")}</button></form></AppShell>;
}
