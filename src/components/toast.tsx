"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error";
interface ToastState {
  message: string;
  id: number;
  type: ToastType;
}

/** Minimal dependency-free toast — a fixed bottom-right stack, auto-dismiss
 * after 3s (5s for errors, so there's time to actually read it). Good
 * enough for "Saved" / "Added" confirmations and error surfacing across the
 * app without pulling in a toast library. `notify(message)` keeps the old
 * single-arg success-only call sites working unchanged. */
export function useToast() {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);

  const notify = React.useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { message, id, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === "error" ? 5000 : 3000);
  }, []);
  const notifyError = React.useCallback((message: string) => notify(message, "error"), [notify]);

  const ToastHost = React.useCallback(
    () => (
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-lg",
              t.type === "error" ? "border-destructive/40" : "border-success/40"
            )}
          >
            {t.type === "error" ? <AlertCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-success" />}
            {t.message}
          </div>
        ))}
      </div>
    ),
    [toasts]
  );

  return { notify, notifyError, ToastHost };
}
