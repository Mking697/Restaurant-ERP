import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step { label: string }

/** Horizontal "Step N of M" progress indicator for multi-stage pipelines
 * (Indent -> PO -> Bill -> Receive -> Quality -> Invoice -> Payment, the
 * Central Purchase pipeline, etc.) — so a new staff member can see how many
 * steps remain instead of guessing the sequence from table columns. */
export function StepIndicator({ steps, currentIndex }: { steps: Step[]; currentIndex: number }) {
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Progress">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                done && "border-success/40 bg-success/10 text-success",
                active && "border-primary bg-primary/10 text-primary font-medium",
                !done && !active && "border-input text-muted-foreground"
              )}
            >
              {done ? <Check className="size-3" /> : <span className="flex size-4 items-center justify-center rounded-full border text-[10px]">{i + 1}</span>}
              {step.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
