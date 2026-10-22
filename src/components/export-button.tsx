"use client";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";

export function ExportButton({ filename, rows }: { filename: string; rows: Record<string, unknown>[] }) {
  return (
    <Button variant="outline" size="sm" onClick={() => downloadCsv(filename, rows)} disabled={!rows.length}>
      <Download /> Export CSV
    </Button>
  );
}
