"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Papa from "papaparse";

interface PriceHistoryCSVRow {
  "Vendor Name": string;
  "Item Code": string;
  "Item Description": string;
  "Invoice Date": string;
  "Unit Price": string;
  Quantity: string;
  "Total Amount": string;
  Currency: string;
}

interface CsvExportButtonProps {
  data: Array<{
    vendor?: { name: string };
    itemCode?: string;
    itemDescription: string;
    invoiceDate?: string;
    observedAt: string;
    unitPrice: number;
    quantity: number;
    currency: string;
  }>;
  vendorName?: string;
}

export function CsvExportButton({ data, vendorName }: CsvExportButtonProps) {
  const handleExport = () => {
    const rows: PriceHistoryCSVRow[] = data.map((record) => ({
      "Vendor Name": record.vendor?.name ?? vendorName ?? "Unknown",
      "Item Code": record.itemCode ?? "",
      "Item Description": record.itemDescription,
      "Invoice Date": record.invoiceDate ?? record.observedAt,
      "Unit Price": record.unitPrice.toFixed(2),
      Quantity: record.quantity.toString(),
      "Total Amount": (record.unitPrice * record.quantity).toFixed(2),
      Currency: record.currency,
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const filename = vendorName
      ? `price_history_${vendorName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`
      : `price_history_${new Date().toISOString().split("T")[0]}.csv`;

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
      onClick={handleExport}
      disabled={data.length === 0}
    >
      <Download className="w-4 h-4 mr-1.5" />
      Export CSV
    </Button>
  );
}
