"use client";

import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import type { ColumnMapping, SchemaType } from "../types";
import { getSchemaFields } from "../lib/schema-definitions";

interface ColumnMappingStepProps {
  mappings: ColumnMapping[];
  schemaType: SchemaType;
  onUpdateMapping: (sourceHeader: string, targetField: string) => void;
  onSchemaTypeChange: (type: SchemaType) => void;
  templateName?: string | null;
  isAiLoading?: boolean;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        High
      </span>
    );
  }
  if (confidence >= 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
        <AlertTriangle className="h-3 w-3" />
        Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <HelpCircle className="h-3 w-3" />
      Low
    </span>
  );
}

export function ColumnMappingStep({
  mappings,
  schemaType,
  onUpdateMapping,
  onSchemaTypeChange,
  templateName,
  isAiLoading,
}: ColumnMappingStepProps) {
  const fields = useMemo(() => getSchemaFields(schemaType), [schemaType]);

  const fieldOptions = useMemo(
    () => [
      { value: "unmapped", label: "— Unmapped —" },
      ...fields.map((f) => ({
        value: f.name,
        label: `${f.label}${f.required ? " *" : ""}`,
      })),
    ],
    [fields]
  );

  if (isAiLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">
          AI is analyzing your columns...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Template notification */}
      {templateName && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/20">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm text-foreground">
            Template applied: <strong>{templateName}</strong>
          </p>
        </div>
      )}

      {/* Schema type selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Schema type:</span>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: "sales_statement" as const, label: "Sales Statement" },
            { value: "bank_statement" as const, label: "Bank Statement" },
            { value: "purchase_order" as const, label: "Purchase Order" },
            { value: "goods_received_note" as const, label: "Goods Received" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                schemaType === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onSchemaTypeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mapping table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                Source Column
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                Maps To
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground w-24">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <tr
                key={mapping.sourceHeader}
                className="border-t border-border hover:bg-muted/30"
              >
                <td className="px-4 py-3 text-sm text-foreground font-mono">
                  {mapping.sourceHeader}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={mapping.targetField}
                    onChange={(e) =>
                      onUpdateMapping(mapping.sourceHeader, e.target.value)
                    }
                    className="w-full bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                  >
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {mapping.targetField !== "unmapped" && (
                    <ConfidenceBadge confidence={mapping.confidence} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        * Required fields. Adjust mappings as needed — the AI suggestion is a starting point.
      </p>
    </div>
  );
}
