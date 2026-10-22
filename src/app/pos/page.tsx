"use client";

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
    notify(`Order ${orderNumber} created — ${formatInr(Number(form.totalInr) || 0)}`);
    setForm({ branch: "", channel: "DINE_IN", tableNo: "", totalInr: "", tenderType: "CASH" });
    setOpen(false);
  }

  return (
    <AppShell activeHref="/pos">
      <PageHeader title="POS / Cashier" description="Live orders across channels — dine-in, takeaway, Swiggy, Zomato.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" >
            <Plus /> New Order
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Order</DialogTitle>
              <DialogDescription>Billing line-item builder Phase 3 mein — abhi order header level entry.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Branch">
                <input className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="Connaught Place" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Channel">
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value as PosOrderRow["channel"] })}
                  >
                    <option value="DINE_IN">Dine-in</option>
                    <option value="TAKEAWAY">Takeaway</option>
                    <option value="SWIGGY">Swiggy</option>
                    <option value="ZOMATO">Zomato</option>
                  </select>
                </Field>
                <Field label="Table no.">
                  <input className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.tableNo} onChange={(e) => setForm({ ...form, tableNo: e.target.value })} placeholder="T-12" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (₹)">
                  <input type="number" className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.totalInr} onChange={(e) => setForm({ ...form, totalInr: e.target.value })} placeholder="1840" />
                </Field>
                <Field label="Tender">
                  <select className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" value={form.tenderType} onChange={(e) => setForm({ ...form, tenderType: e.target.value })}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addOrder} disabled={!form.branch.trim() || !form.totalInr.trim()}>
                Create Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Tender</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
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
