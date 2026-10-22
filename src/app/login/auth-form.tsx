"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
export function AuthForm({ setup = false }: { setup?: boolean }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  useEffect(() => { let active = true; fetch("/api/setup", { cache: "no-store" }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || "Cannot check setup"); if (active) setSetupRequired(value.setupRequired); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const password = String(form.get("password") ?? "");
      if (setup && password !== form.get("confirmPassword")) throw new Error("Passwords do not match");
      const response = await fetch(setup ? "/api/setup" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(setup ? { name: form.get("name") } : {}), phoneE164: form.get("phoneE164"), password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed");
      // Full navigation discards all previous demo/client state on login.
      window.location.assign("/guide");
    } catch (error) { setError(error instanceof Error ? error.message : "Request failed"); setBusy(false); }
  }
  const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-base";
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
    <p className="mb-2 text-sm font-medium text-primary">Restaurant ERP</p><h1 className="text-2xl font-semibold">{setup ? "Create the first owner" : "Sign in"}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{setup ? "Fresh local installation: choose your own password. Setup closes after the first account is created." : "Use the phone number and password assigned to your account."}</p>
    {error && <p role="alert" className="mt-4 rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {setup && setupRequired === false ? <p className="mt-6">Setup is already complete. <Link className="underline" href="/login">Sign in</Link></p> : <form onSubmit={submit} className="mt-6 space-y-4">
      {setup && <label className="block space-y-1"><span className="text-sm">Owner name</span><input className={inputClass} name="name" autoComplete="name" maxLength={200} required /></label>}
      <label className="block space-y-1"><span className="text-sm">Phone (international E.164 format)</span><input className={inputClass} name="phoneE164" type="tel" autoComplete="username" placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" maxLength={16} required /></label>
      <label className="block space-y-1"><span className="text-sm">Password{setup ? " (at least 12 characters)" : ""}</span><input className={inputClass} name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 12 : undefined} maxLength={256} required /></label>
      {setup && <label className="block space-y-1"><span className="text-sm">Confirm password</span><input className={inputClass} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></label>}
      <button className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={busy || (setup && setupRequired !== true)}>{busy ? "Please wait…" : setup ? "Create owner & sign in" : "Sign in"}</button>
    </form>}
    {!setup && setupRequired && <p className="mt-5 text-sm">Fresh installation? <Link className="underline" href="/setup">Create the first owner</Link></p>}
  </section></main>;
}
