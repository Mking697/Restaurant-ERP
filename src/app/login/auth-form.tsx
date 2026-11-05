"use client";
import { RestaurantBrand } from "@/components/branding-provider";
import { BrandingFields, useBrandingError, type LogoUpload } from "@/components/branding-fields";
import { PasswordField } from "@/components/password-field";
import { useUiCopy } from "@/lib/ui-copy";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PreferencesControls } from "@/components/preferences-controls";
import { useTranslation } from "@/lib/i18n";
export function AuthForm({ setup = false }: { setup?: boolean }) {
  const uiText = useUiCopy();
  const brandingError = useBrandingError();
  const [restaurantName, setRestaurantName] = useState("");
  const [logo, setLogo] = useState<LogoUpload | null>();
  const [readingLogo, setReadingLogo] = useState(false);
  const { t } = useTranslation();
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  useEffect(() => { let active = true; fetch("/api/setup", { cache: "no-store" }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || "Cannot check setup"); if (active) setSetupRequired(value.setupRequired); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || readingLogo) return; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const password = String(form.get("password") ?? "");
      if (setup && password !== form.get("confirmPassword")) throw new Error("Passwords do not match");
      const response = await fetch(setup ? "/api/setup" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(setup ? { name: form.get("name"), restaurantName, logo } : {}), email: form.get("email"), password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed");
      // Full navigation discards all previous demo/client state on login.
      window.location.assign("/guide");
    } catch (error) { setError(error instanceof Error ? error.message : "Request failed"); setBusy(false); }
  }
  const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-base";
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
    <PreferencesControls className="mb-5" />
    <div className="mb-3"><RestaurantBrand /></div><h1 className="text-2xl font-semibold">{setup ? uiText("Create the first owner") : uiText("Sign in")}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{setup ? uiText("Fresh local installation: choose your own password. Setup closes after the first account is created.") : uiText("Use the email and password assigned to your account.")}</p>
    {error && <p role="alert" className="mt-4 rounded-md border border-destructive p-3 text-sm text-destructive">{brandingError(uiText(error))}</p>}
    {setup && setupRequired === false ? <p className="mt-6">{uiText("Setup is already complete. ")}<Link className="underline" href="/login">{uiText("Sign in")}</Link></p> : <form onSubmit={submit} className="mt-6 space-y-4">
      {setup && <BrandingFields name={restaurantName} onName={setRestaurantName} logo={logo} onLogo={setLogo} onBusy={setReadingLogo} disabled={busy} />}
      {setup && <label className="block space-y-1"><span className="text-sm">{uiText("Owner name")}</span><input className={inputClass} name="name" autoComplete="name" maxLength={200} required /></label>}
      <label className="block space-y-1"><span className="text-sm">{t("Email", "Email")}</span><input className={inputClass} name="email" type="email" autoComplete="username" placeholder="owner@example.com" maxLength={254} required /></label>
      <label className="block space-y-1"><span className="text-sm">{uiText("Password")}{setup ? uiText(" (at least 12 characters)") : ""}</span><PasswordField name="password" autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 12 : undefined} maxLength={256} required /></label>
      {setup && <label className="block space-y-1"><span className="text-sm">{uiText("Confirm password")}</span><PasswordField name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={256} required /></label>}
      <button className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={busy || readingLogo || (setup && setupRequired !== true)}>{busy ? uiText("Please wait…") : setup ? uiText("Create owner & sign in") : uiText("Sign in")}</button>
    </form>}
    {!setup && setupRequired && <p className="mt-5 text-sm">{uiText("Fresh installation? ")}<Link className="underline" href="/setup">{uiText("Create the first owner")}</Link></p>}
  </section></main>;
}
