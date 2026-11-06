"use client";
import * as React from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** useConfirm() — a promise-based "Are you sure?" gate for destructive
 * actions (reject, void, cancel, reverse). Call `const ok = await confirm({
 * title, description })` before firing the real request; render <ConfirmHost
 * /> once near the top of the page. No action anywhere in this app is
 * truly undoable once submitted — this is the one shared guard against an
 * accidental click, not a replacement for server-side safety. */
export function useConfirm() {
  const [state, setState] = React.useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  const ConfirmHost = React.useCallback(
    () => (
      <Dialog open={!!state} onOpenChange={(open) => { if (!open) close(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state?.opts.title}</DialogTitle>
            {state?.opts.description && <DialogDescription>{state.opts.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>{state?.opts.cancelLabel ?? "Cancel"}</Button>
            <Button type="button" variant={state?.opts.destructive ? "destructive" : "default"} onClick={() => close(true)}>
              {state?.opts.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    [state]
  );

  return { confirm, ConfirmHost };
}
