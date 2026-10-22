"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { getPosOrders, type PosOrderRow } from "@/lib/mock-data";
import { formatInr } from "@/lib/utils";
import { Plus } from "lucide-react";

const CHANNEL_VARIANT: Record<string, "default" | "secondary" | "warning" | "destructive"> = {
  DINE_IN: "default",
  TAKEAWAY: "secondary",
  SWIGGY: "warning",
  ZOMATO: "destructive",
};

export default function PosPage() {
  const uiText = useUiCopy();
  const [orders, setOrders] = React.useState<PosOrderRow[]>(getPosOrders());
  const [open, setOpen] = React.useState(false);
  const { notify, ToastHost } = useToast();

  const [form, setForm] = React.useState({
    branch: "",
    channel: "DINE_IN" as PosOrderRow["channel"],
    tableNo: "",
    totalInr: "",
    tenderType: "CASH",
  });

  function addOrder() {
    if (!form.branch.trim() || !form.totalInr.trim()) return;
    const orderNumber = `ORD-${1000 + orders.length}`;
    setOrders((prev) => [
      {
        orderNumber,
        branch: form.branch.trim(),
        channel: form.channel,
        tableNo: form.tableNo.trim() || "-",
        totalInr: Number(form.totalInr) || 0,
        tenderType: form.tenderType,
        status: "COMPLETED",
        cashier: "You",
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
    notify(uiText(`Demo order ${orderNumber} created — ${formatInr(Number(form.totalInr) || 0)}. Not saved.`, `Demo order ${orderNumber} bana — ${formatInr(Number(form.totalInr) || 0)}. Save nahi hua.`));
    setForm({ branch: "", channel: "DINE_IN", tableNo: "", totalInr: "", tenderType: "CASH" });
    setOpen(false);
  }

  return (
    <AppShell activeHref="/pos">
      <PageHeader title={uiText("POS / Cashier")} description={uiText("Live orders across channels — dine-in, takeaway, Swiggy, Zomato.")}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" >
            <Plus /> {uiText(" New Order ")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{uiText("New Order")}</DialogTitle>
              <DialogDescription>{uiText("Billing line-item builder Phase 3 mein — abhi order header level entry.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label={uiText("Branch")}>
                <input className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder={uiText("Connaught Place")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={uiText("Channel")}>
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value as PosOrderRow["channel"] })}
                  >
                    <option value="DINE_IN">{uiText("Dine-in")}</option>
                    <option value="TAKEAWAY">{uiText("Takeaway")}</option>
                    <option value="SWIGGY">{uiText("Swiggy")}</option>
                    <option value="ZOMATO">{uiText("Zomato")}</option>
                  </select>
                </Field>
                <Field label={uiText("Table no.")}>
                  <input className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.tableNo} onChange={(e) => setForm({ ...form, tableNo: e.target.value })} placeholder={uiText("T-12")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={uiText("Amount (₹)")}>
                  <input type="number" className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.totalInr} onChange={(e) => setForm({ ...form, totalInr: e.target.value })} placeholder={uiText("1840")} />
                </Field>
                <Field label={uiText("Tender")}>
                  <select className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.tenderType} onChange={(e) => setForm({ ...form, tenderType: e.target.value })}>
                    <option value="CASH">{uiText("Cash")}</option>
                    <option value="UPI">{uiText("UPI")}</option>
                    <option value="CARD">{uiText("Card")}</option>
                  </select>
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {uiText(" Cancel ")}</Button>
              <Button onClick={addOrder} disabled={!form.branch.trim() || !form.totalInr.trim()}>
                {uiText(" Create Order ")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiText("Order #")}</TableHead>
                <TableHead>{uiText("Branch")}</TableHead>
                <TableHead>{uiText("Channel")}</TableHead>
                <TableHead>{uiText("Table")}</TableHead>
                <TableHead>{uiText("Amount")}</TableHead>
                <TableHead>{uiText("Tender")}</TableHead>
                <TableHead>{uiText("Cashier")}</TableHead>
                <TableHead>{uiText("Time")}</TableHead>
                <TableHead>{uiText("Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.orderNumber}>
                  <TableCell className="font-medium">{o.orderNumber}</TableCell>
                  <TableCell>{o.branch}</TableCell>
                  <TableCell>
                    <Badge variant={CHANNEL_VARIANT[o.channel]}>{o.channel.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>{o.tableNo}</TableCell>
                  <TableCell>{formatInr(o.totalInr)}</TableCell>
                  <TableCell>{o.tenderType}</TableCell>
                  <TableCell>{o.cashier}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.time}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === "VOIDED" ? "destructive" : "success"}>{o.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ToastHost />
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
