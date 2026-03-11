"use client";

import { useMemo } from "react";
import type { ColumnMapping, SchemaType } from "../types";
import { getSchemaFields } from "../lib/schema-definitions";

interface DataPreviewStepProps {
  sampleRows: Record<string, string>[];
  mappings: ColumnMapping[];
  schemaType: SchemaType;
}

export function DataPreviewStep({
  sampleRows,
  mappings,
  schemaType,
}: DataPreviewStepProps) {
  const fields = useMemo(() => getSchemaFields(schemaType), [schemaType]);
  const activeMappings = useMemo(
    () => mappings.filter((m) => m.targetField !== "unmapped"),
    [mappings]
  );

  // Map standard field names to labels
  const fieldLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fields) {
      map.set(f.name, f.label);
    }
    return map;
  }, [fields]);

  // Build preview rows (first 5)
  const previewRows = useMemo(() => {
    return sampleRows.slice(0, 5).map((row) => {
      const mapped: Record<string, string> = {};
      for (const m of activeMappings) {
        mapped[m.targetField] = row[m.sourceHeader] ?? "";
      }
      return mapped;
    });
  }, [sampleRows, activeMappings]);

  if (activeMappings.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          No columns are mapped. Go back and map at least the required fields.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Preview (first {Math.min(5, sampleRows.length)} rows)
        </h3>
        <span className="text-xs text-muted-foreground">
          {activeMappings.length} columns mapped
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              {activeMappings.map((m) => (
                <th
                  key={m.targetField}
                  className="px-4 py-3 text-left text-xs font-medium text-foreground whitespace-nowrap"
                >
                  {fieldLabels.get(m.targetField) ?? m.targetField}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr
                key={i}
                className="border-t border-border hover:bg-muted/30"
              >
                {activeMappings.map((m) => (
                  <td
                    key={m.targetField}
                    className="px-4 py-2.5 text-sm text-foreground whitespace-nowrap max-w-[200px] truncate"
                    title={row[m.targetField]}
                  >
                    {row[m.targetField] || (
                      <span className="text-muted-foreground italic">empty</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
