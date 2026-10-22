"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Save } from "lucide-react";

export default function WhatsAppSettingsPage() {
  const uiText = useUiCopy();
  const [token, setToken] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("https://chatxflow.online");
  const [hasToken, setHasToken] = React.useState(false);
  const [tokenMasked, setTokenMasked] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "loading" | "saved" | "error">("idle");

  React.useEffect(() => {
    fetch("/api/admin/settings/whatsapp")
      .then((r) => r.json())
      .then((data) => {
        setHasToken(data.hasToken);
        setTokenMasked(data.tokenMasked);
        setPhoneNumber(data.phoneNumber);
        setBaseUrl(data.baseUrl);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setStatus("loading");
    const res = await fetch("/api/admin/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, phoneNumber, baseUrl }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <AppShell activeHref="/admin/settings/whatsapp">
      <PageHeader
        title={uiText("WhatsApp Settings (ChatXFlow)")}
        description={uiText("ChatXFlow par apna WhatsApp QR scan se connect karein, phir yahan Developer API Token paste karein.")}
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{uiText("ChatXFlow configuration")}</CardTitle>
          <CardDescription>
            {uiText(" Base URL sirf https://chatxflow.online ho sakta hai — custom hosts allowed nahi hain (security pin, matches Pro ERP's same restriction). ")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {uiText(" API Token ")}{hasToken && <Badge variant="success" className="ml-2">{uiText("Configured: ")}{tokenMasked}</Badge>}
            </label>
            <input
              type="password"
              placeholder={hasToken ? uiText("Leave blank to keep existing token") : uiText("Paste ChatXFlow Developer API Token")}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{uiText("WhatsApp Phone Number")}</label>
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={uiText("919876543210")}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{uiText("Base URL")}</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={status === "loading"}>
              <Save /> {uiText(" Save Settings ")}</Button>
            {status === "saved" && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="size-4" /> {uiText(" Saved ")}</span>
            )}
            {status === "error" && <span className="text-sm text-destructive">{uiText("Save failed — DB not connected yet?")}</span>}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
