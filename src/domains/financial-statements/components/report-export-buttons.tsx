"use client";

import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportTrialBalanceCsv,
  exportProfitLossCsv,
  exportBalanceSheetCsv,
  exportCashFlowCsv,
} from "../lib/csv-export";

interface ReportExportButtonsProps {
  reportType: "trial_balance" | "pnl" | "balance_sheet" | "cash_flow";
  reportData: any; // The statement data — typed per report type at call site
  businessName: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  onExportPdf: () => void;
  isExportingPdf?: boolean;
}

export function ReportExportButtons({
  reportType,
  reportData,
  businessName,
  onExportPdf,
  isExportingPdf = false,
}: ReportExportButtonsProps) {
  function handleCsvExport() {
    if (!reportData) return;

    switch (reportType) {
      case "trial_balance":
        exportTrialBalanceCsv(reportData, businessName);
        break;
      case "pnl":
        exportProfitLossCsv(reportData, businessName);
        break;
      case "balance_sheet":
        exportBalanceSheetCsv(reportData, businessName);
        break;
      case "cash_flow":
        exportCashFlowCsv(reportData, businessName);
        break;
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        onClick={onExportPdf}
        disabled={isExportingPdf || !reportData}
      >
        {isExportingPdf ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Export PDF
      </Button>
      <Button
        className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        onClick={handleCsvExport}
        disabled={!reportData}
      >
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );
}
