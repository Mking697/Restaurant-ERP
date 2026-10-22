"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastState {
  message: string;
  id: number;
}

/** Minimal dependency-free toast — a fixed bottom-right stack, auto-dismiss
 * after 3s. Good enough for "Saved" / "Added" confirmations across the app
 * without pulling in a toast library for one use case. */
export function useToast() {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);

  const notify = React.useCallback((message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { message, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const ToastHost = React.useCallback(
    () => (
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-success/40 bg-card px-4 py-2.5 text-sm shadow-lg"
            )}
          >
            <CheckCircle2 className="size-4 text-success" />
            {t.message}
          </div>
        ))}
      </div>
    ),
    [toasts]
  );

  return { notify, ToastHost };
}
