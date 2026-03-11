"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import type { ValidationResult } from "../types";

interface ValidationResultsProps {
  result: ValidationResult;
  onProceed: () => void;
  onBack: () => void;
}

export function ValidationResults({
  result,
  onProceed,
  onBack,
}: ValidationResultsProps) {
  const errorsByRow = useMemo(() => {
    const map = new Map<number, typeof result.errors>();
    for (const err of result.errors) {
      const existing = map.get(err.row) ?? [];
      existing.push(err);
      map.set(err.row, existing);
    }
    return map;
  }, [result.errors]);

  const hasErrors = result.errors.length > 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div
        className={`flex items-start gap-3 p-4 rounded-lg border ${
          hasErrors
            ? "bg-yellow-500/10 border-yellow-500/30"
            : "bg-green-500/10 border-green-500/30"
        }`}
      >
        {hasErrors ? (
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">
            {hasErrors
              ? `${result.validRows} of ${result.totalRows} rows are valid`
              : `All ${result.totalRows} rows are valid`}
          </p>
          {hasErrors && (
            <p className="text-xs text-muted-foreground mt-1">
              {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}{" "}
              found across {errorsByRow.size} row{errorsByRow.size !== 1 ? "s" : ""}.
              You can import valid rows only or go back to fix mappings.
            </p>
          )}
        </div>
      </div>

      {/* Error table */}
      {hasErrors && (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground w-16">
                  Row
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                  Column
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                  Error
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {result.errors.slice(0, 50).map((err, i) => (
                <tr
                  key={i}
                  className="border-t border-border hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5 text-sm text-foreground font-mono">
                    {err.row}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-foreground">
                    {err.column}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">
                    {err.message}
                  </td>
                  <td
                    className="px-4 py-2.5 text-sm text-foreground font-mono max-w-[200px] truncate"
                    title={err.value}
                  >
                    {err.value || (
                      <span className="text-muted-foreground italic">empty</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.errors.length > 50 && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/50">
              Showing first 50 of {result.errors.length} errors
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Mapping
        </button>

        <button
          onClick={onProceed}
          className="px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {hasErrors
            ? `Import ${result.validRows} Valid Rows`
            : `Import All ${result.totalRows} Rows`}
        </button>
      </div>
    </div>
  );
}
