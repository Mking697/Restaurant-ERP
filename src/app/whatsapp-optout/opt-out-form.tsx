"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";

// GAP-037: public, unauthenticated — clicking the opt-out link in a WhatsApp
// message lands here with ?phone=<digits> pre-filled; one explicit button
// press is the actual opt-out action (never automatic on page load).
export function OptOutForm() {
  const params = useSearchParams();
  const [phone, setPhone] = React.useState(params.get("phone") ?? "");
  const [status, setStatus] = React.useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = React.useState("");

  async function submit() {
    setStatus("busy"); setError("");
    try {
      const res = await fetch("/api/whatsapp/opt-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not confirm opt-out. Try again.");
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm opt-out. Try again.");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Stop WhatsApp messages / WhatsApp messages band karein</h1>
      {status === "done" ? (
        <p role="status" className="rounded-md border border-success/40 bg-success/10 p-4 text-sm">
          Done — this number will not receive any further messages from us. / Ho gaya — is number par aage koi message nahi aayega.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Confirm your WhatsApp number to stop future messages (offers and community invites). Your past orders/receipts are not affected. / Future messages (offers, community invite) band karne ke liye apna WhatsApp number confirm karein. Aapke pehle ke orders/receipts par koi asar nahi.</p>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="712345678" className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button onClick={submit} disabled={status === "busy" || !phone.trim()} className="w-full rounded-md border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {status === "busy" ? "Confirming…" : "Stop messages / Messages band karein"}
          </button>
        </div>
      )}
    </main>
  );
}
