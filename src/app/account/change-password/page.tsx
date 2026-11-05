"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PasswordField } from "@/components/password-field";
import { requestJson } from "@/lib/current-user";
import { useTranslation } from "@/lib/i18n";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    if (newPassword !== confirmPassword) { setError(t("New password and confirmation do not match", "Naya password aur confirmation match nahi karte")); setBusy(false); return; }
    try {
      await requestJson("/api/auth/change-password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword, confirmPassword }) });
      setMessage(t("Password changed. Your other devices have been signed out.", "Password badal gaya. Aapke doosre devices se logout ho gaya hai."));
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Request failed", "Request fail ho gayi"));
    } finally { setBusy(false); }
  }

  return <AppShell activeHref="/account/change-password">
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">{t("Change password", "Password badlein")}</h1>
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-md border border-green-600 p-3 text-sm text-green-700">{message}</p>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block space-y-1"><span className="text-sm">{t("Current password", "Abhi ka password")}</span>
            <PasswordField name="oldPassword" autoComplete="current-password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
          </label>
          <label className="block space-y-1"><span className="text-sm">{t("New password (at least 12 characters)", "Naya password (kam se kam 12 characters)")}</span>
            <PasswordField name="newPassword" autoComplete="new-password" minLength={12} maxLength={256} required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </label>
          <label className="block space-y-1"><span className="text-sm">{t("Confirm new password", "Naya password confirm karein")}</span>
            <PasswordField name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={256} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </label>
          <button className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50">{busy ? t("Please wait…", "Please wait…") : t("Change password", "Password badlein")}</button>
        </fieldset>
      </form>
    </div>
  </AppShell>;
}
