import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputBaseClass } from "./input";

// A styled native <select> — NOT a Radix listbox. Chosen deliberately over
// pulling in @radix-ui/react-select (already an unused dependency in this
// project): a native select keeps mobile OS pickers (important for this
// Tanzania restaurant chain's largely phone-based staff), needs zero extra
// wiring per call site, and is a drop-in replacement for the
// `<select className={inputClass}>` pattern duplicated across ~27 pages.
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(inputBaseClass, "appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
);
Select.displayName = "Select";
