"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Left-anchored slide-over drawer — built on the same Radix Dialog
 * primitive as ui/dialog.tsx (full focus-trap/escape/overlay-click behavior
 * for free), just positioned and animated differently. Used for the mobile
 * nav drawer in app-shell.tsx. */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col border-r bg-card shadow-lg transition-transform duration-200 ease-out",
          "data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetCloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close className={cn("rounded-md text-muted-foreground outline-none hover:text-foreground", className)}>
      <X className="size-5" />
    </DialogPrimitive.Close>
  );
}

export { Sheet, SheetTrigger, SheetContent, SheetClose, SheetCloseButton };
