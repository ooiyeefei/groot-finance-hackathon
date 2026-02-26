"use client";

/**
 * Code Mapping Step Component
 *
 * Inline mapping screen for Master Accounting exports.
 * Shows Groot Finance values and lets users enter corresponding
 * Master Accounting codes. Mappings are persisted per business.
 */

import { useState, useEffect, useCallback } from "react";
import { ArrowRight, AlertCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCodeMappings } from "../hooks/use-code-mappings";

interface CodeMappingStepProps {
  businessId: string;
  module: string;
  codeMappingTypes: string[];
  onComplete: () => void;
  onSkip: () => void;
  disabled?: boolean;
}

const MAPPING_TYPE_LABELS: Record<string, string> = {
  account_code: "Account Codes",
  creditor_code: "Creditor/Supplier Codes",
  debtor_code: "Debtor/Customer Codes",
  bank_code: "Bank/Cash A/C Codes",
};

const MAPPING_TYPE_DESCRIPTIONS: Record<string, string> = {
  account_code:
    "Map Groot Finance categories to Master Accounting Account Codes (e.g., 6001, 9017)",
  creditor_code:
    "Map vendor names to Master Accounting Creditor Codes (e.g., 4000-A0001)",
  debtor_code:
    "Map customer names to Master Accounting Debtor Codes (e.g., 3000-C0001)",
  bank_code:
    "Map to Master Accounting Bank/Cash A/C Codes (e.g., 3010-100)",
};

export function CodeMappingStep({
  businessId,
  module,
  codeMappingTypes,
  onComplete,
  onSkip,
  disabled,
}: CodeMappingStepProps) {
  const {
    getTargetCode,
    getDefaultCode,
    saveMappings,
    isLoading,
    isSaving,
  } = useCodeMappings(businessId);

  const distinctValues = useQuery(
    api.functions.exportCodeMappings.getDistinctMappableValues,
    businessId
      ? { businessId, module, mappingTypes: codeMappingTypes }
      : "skip"
  ) as Record<string, string[]> | undefined;

  // Local state for form inputs
  const [formMappings, setFormMappings] = useState<
    Record<string, Record<string, string>>
  >({});
  const [formDefaults, setFormDefaults] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  // Initialize form from saved mappings once loaded
  useEffect(() => {
    if (isLoading || !distinctValues || initialized) return;

    const newMappings: Record<string, Record<string, string>> = {};
    const newDefaults: Record<string, string> = {};

    for (const mappingType of codeMappingTypes) {
      const values = distinctValues[mappingType] ?? [];
      newMappings[mappingType] = {};
      for (const sourceValue of values) {
        newMappings[mappingType][sourceValue] =
          getTargetCode(mappingType, sourceValue);
      }
      newDefaults[mappingType] = getDefaultCode(mappingType);
    }

    setFormMappings(newMappings);
    setFormDefaults(newDefaults);
    setInitialized(true);
  }, [
    isLoading,
    distinctValues,
    initialized,
    codeMappingTypes,
    getTargetCode,
    getDefaultCode,
  ]);

  const handleMappingChange = useCallback(
    (mappingType: string, sourceValue: string, targetCode: string) => {
      setFormMappings((prev) => ({
        ...prev,
        [mappingType]: {
          ...prev[mappingType],
          [sourceValue]: targetCode,
        },
      }));
    },
    []
  );

  const handleDefaultChange = useCallback(
    (mappingType: string, targetCode: string) => {
      setFormDefaults((prev) => ({
        ...prev,
        [mappingType]: targetCode,
      }));
    },
    []
  );

  const handleSaveAndContinue = useCallback(async () => {
    const entries: { mappingType: string; sourceValue: string; targetCode: string }[] =
      [];
    const defaults: { mappingType: string; targetCode: string }[] = [];

    for (const mappingType of codeMappingTypes) {
      const typeMap = formMappings[mappingType] ?? {};
      for (const [sourceValue, targetCode] of Object.entries(typeMap)) {
        if (targetCode.trim()) {
          entries.push({ mappingType, sourceValue, targetCode: targetCode.trim() });
        }
      }
      const defaultCode = formDefaults[mappingType]?.trim();
      if (defaultCode) {
        defaults.push({ mappingType, targetCode: defaultCode });
      }
    }

    await saveMappings(entries, defaults.length > 0 ? defaults : undefined);
    onComplete();
  }, [codeMappingTypes, formMappings, formDefaults, saveMappings, onComplete]);

  const hasAnyDefaults = Object.values(formDefaults).some((v) => v.trim());

  if (isLoading || !distinctValues) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading mappable values...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Map Codes for Master Accounting
        </h3>
        <p className="text-sm text-muted-foreground">
          Enter the corresponding Master Accounting codes for each item below.
          Saved codes will auto-fill on your next export.
        </p>
      </div>

      {codeMappingTypes.map((mappingType) => {
        const values = distinctValues[mappingType] ?? [];
        const typeMap = formMappings[mappingType] ?? {};

        if (values.length === 0 && mappingType !== "bank_code") return null;

        return (
          <div
            key={mappingType}
            className="rounded-lg border border-border bg-card"
          >
            <div className="border-b border-border px-4 py-3">
              <h4 className="font-medium text-foreground">
                {MAPPING_TYPE_LABELS[mappingType] ?? mappingType}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {MAPPING_TYPE_DESCRIPTIONS[mappingType]}
              </p>
            </div>

            {/* Default fallback code */}
            <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
              <Label className="text-sm font-medium text-muted-foreground min-w-[180px]">
                Default (fallback):
              </Label>
              <Input
                className="max-w-[200px] h-8 text-sm"
                placeholder="e.g., 6099"
                value={formDefaults[mappingType] ?? ""}
                onChange={(e) =>
                  handleDefaultChange(mappingType, e.target.value)
                }
                maxLength={20}
                disabled={disabled || isSaving}
              />
              <span className="text-xs text-muted-foreground">
                Used for unmapped items
              </span>
            </div>

            {/* Individual mappings */}
            <div className="divide-y divide-border">
              {values.map((sourceValue) => (
                <div
                  key={sourceValue}
                  className="px-4 py-2.5 flex items-center gap-3"
                >
                  <span className="text-sm text-foreground min-w-[180px] truncate">
                    {sourceValue}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input
                    className="max-w-[200px] h-8 text-sm"
                    placeholder="Master Acct code"
                    value={typeMap[sourceValue] ?? ""}
                    onChange={(e) =>
                      handleMappingChange(
                        mappingType,
                        sourceValue,
                        e.target.value
                      )
                    }
                    maxLength={20}
                    disabled={disabled || isSaving}
                  />
                </div>
              ))}
              {values.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground italic">
                  No values found in selected records for this mapping type. Set
                  a default code above if needed.
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          onClick={onSkip}
          disabled={disabled || isSaving}
          className="text-muted-foreground"
        >
          {hasAnyDefaults ? "Skip mapping" : (
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              Skip (no defaults set)
            </span>
          )}
        </Button>
        <Button
          onClick={handleSaveAndContinue}
          disabled={disabled || isSaving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save & Continue"}
        </Button>
      </div>
    </div>
  );
}
