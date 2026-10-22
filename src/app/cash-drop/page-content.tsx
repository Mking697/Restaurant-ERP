"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatInr } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

const DENOMS = [500, 200, 100, 50, 20, 10] as const;

export default function CashDropPage() {
  const uiText = useUiCopy();
  const [counts, setCounts] = React.useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
  });
  const [coins, setCoins] = React.useState(0);
  const [submitted, setSubmitted] = React.useState<{ counted: number } | null>(null);

  const countedCashInr = DENOMS.reduce((sum, d) => sum + d * (counts[d] || 0), 0) + coins;

  return (
    <AppShell activeHref="/cash-drop">
      <PageHeader
        title={uiText("Blind Cash Drop")}
        description={uiText("Expected cash CHHUPA hai — denominations count karo aur submit karo, system khud match karega.")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{uiText("Denomination count — shift closing")}</CardTitle>
            <CardDescription>{uiText("Note ki ginti bharo. Expected amount submit ke baad hi dikhega.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {DENOMS.map((d) => (
              <div key={d} className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">₹{d} {uiText(" notes")}</label>
                <input
                  type="number"
                  min={0}
                  value={counts[d]}
                  onChange={(e) =>
                    setCounts((c) => ({ ...c, [d]: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="w-28 rounded-md border border-input bg-card px-3 py-1.5 text-right text-sm"
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <label className="text-sm font-medium">{uiText("Coins (₹)")}</label>
              <input
                type="number"
                min={0}
                value={coins}
                onChange={(e) => setCoins(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 rounded-md border border-input bg-card px-3 py-1.5 text-right text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm font-medium">{uiText("Counted total")}</span>
              <span className="text-lg font-semibold">{formatInr(countedCashInr)}</span>
            </div>
            <Button className="w-full" onClick={() => setSubmitted({ counted: countedCashInr })}>
              {uiText(" Submit Cash Drop ")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{uiText("Result")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!submitted ? (
              <p className="text-sm text-muted-foreground">
                {uiText(" Submit karne ke baad yahan shortage/excess dikhega. Expected cash backend se tabhi aata hai — frontend mein kabhi pre-load nahi hota (API-layer rule, Phase 3 mein wire hoga). ")}</p>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
                <CheckCircle2 className="size-5 text-success" />
                <div>
                  <div className="text-sm font-medium">{uiText("Submitted — ")}{formatInr(submitted.counted)}</div>
                  <div className="text-xs text-muted-foreground">
                    {uiText(" Shortage/excess calculation Phase 3 backend se aayega (expectedCashInr abhi DB mein hai, API se hidden rakha gaya hai jab tak submit na ho). ")}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
