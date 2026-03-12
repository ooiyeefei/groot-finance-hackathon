"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ArrowLeft, ArrowRight, Save } from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { FileUploadStep } from "./file-upload-step";
import { ColumnMappingStep } from "./column-mapping-step";
import { DataPreviewStep } from "./data-preview-step";
import { ValidationResults } from "./validation-results";
import { TemplateManager } from "./template-manager";
import { useCsvParser } from "../hooks/use-csv-parser";
import { useImportSession } from "../hooks/use-import-session";
import {
  useColumnMapping,
  suggestionsToMappings,
} from "../hooks/use-column-mapping";
import { useImportTemplates } from "../hooks/use-import-templates";
import { generateFingerprint } from "../lib/fingerprint";
import { validateMappedData, applyMappings } from "../lib/validator";
import { parseAllRows } from "../lib/parser-engine";
import { useActiveBusiness } from "@/contexts/business-context";
import type {
  CsvImportModalProps,
  CsvImportResult,
  ParsedFileInfo,
  SchemaType,
} from "../types";

const STEPS = ["Upload", "Map Columns", "Preview", "Validate"] as const;

export function CsvImportModal({
  open,
  onOpenChange,
  schemaType: initialSchemaType = "auto",
  onComplete,
  onCancel,
  businessId: businessIdProp,
}: CsvImportModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const { businessId: activeBusinessId } = useActiveBusiness();
  const businessId = businessIdProp || activeBusinessId || undefined;

  const parser = useCsvParser();
  const session = useImportSession();
  const aiMapping = useColumnMapping();
  const templates = useImportTemplates(businessId);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      parser.reset();
      session.reset();
      setSaveTemplateName("");
      setShowSavePrompt(false);
      setShowTemplateManager(false);
    }
  }, [open]);

  // Step 1: File parsed → check for template match → go to mapping
  const handleFileParsed = useCallback(
    async (file: File, info: ParsedFileInfo) => {
      setIsProcessingFile(true);
      try {
        session.setFileInfo(file, info);

        // Check for existing template
        const fingerprint = await generateFingerprint(info.headers);
        const matchedTemplate = await templates.findByFingerprint(fingerprint);

        if (matchedTemplate) {
          // Auto-apply template — ensure confidence defaults to 1 for template mappings
          const templateMappings = matchedTemplate.columnMappings.map((m) => ({
            ...m,
            confidence: m.confidence ?? 1,
          }));
          session.setMappings(
            templateMappings,
            matchedTemplate.schemaType as SchemaType,
            matchedTemplate._id,
            matchedTemplate.name
          );
          templates.touchLastUsed(matchedTemplate._id);
          setCurrentStep(1);
          return;
        }

        // No template match → get AI suggestions
        const suggestion = await aiMapping.fetchSuggestions(
          info.headers,
          info.sampleRows,
          initialSchemaType
        );

        if (suggestion) {
          const mappings = suggestionsToMappings(suggestion);
          session.setMappings(mappings, suggestion.detectedSchemaType);
        }
        setCurrentStep(1);
      } finally {
        setIsProcessingFile(false);
      }
    },
    [session, aiMapping, templates, initialSchemaType]
  );

  // Step 2 → 3: Confirm mapping → show preview
  const handleConfirmMapping = useCallback(() => {
    session.setStatus("previewing");
    setCurrentStep(2);
  }, [session]);

  // Step 3 → 4: Confirm preview → validate full file
  const handleConfirmPreview = useCallback(async () => {
    if (!session.session.file || !session.session.fileInfo) return;

    setIsValidating(true);
    try {
      const allRows = await parseAllRows(session.session.file, {
        selectedSheet: session.session.selectedSheet,
      });

      const result = validateMappedData(
        allRows,
        session.session.columnMappings,
        session.session.detectedSchemaType!
      );

      session.setValidationResult(result);

      if (result.errors.length === 0) {
        // No errors → go straight to completion
        handleImportComplete(allRows);
      } else {
        setCurrentStep(3);
      }
    } finally {
      setIsValidating(false);
    }
  }, [session]);

  // Import with valid rows only
  const handleImportComplete = useCallback(
    async (allRows?: Record<string, string>[]) => {
      if (!session.session.file || !session.session.fileInfo) return;

      const rows =
        allRows ??
        (await parseAllRows(session.session.file, {
          selectedSheet: session.session.selectedSheet,
        }));

      const mappedRows = applyMappings(
        rows,
        session.session.columnMappings,
        session.session.validationResult ?? undefined
      );

      const result: CsvImportResult = {
        rows: mappedRows,
        schemaType: session.session.detectedSchemaType!,
        totalRows: session.session.fileInfo.totalRowCount,
        validRows: mappedRows.length,
        skippedRows:
          session.session.fileInfo.totalRowCount - mappedRows.length,
        templateId: session.session.matchedTemplateId,
        sourceFileName: session.session.fileInfo.fileName,
      };

      // Show save template prompt if no existing template
      if (!session.session.matchedTemplateId) {
        setShowSavePrompt(true);
        // Store result for after save
        (window as unknown as Record<string, unknown>).__csvImportResult = result;
        return;
      }

      onComplete(result);
    },
    [session, onComplete]
  );

  // Save template and complete
  const handleSaveTemplate = useCallback(async () => {
    if (!session.session.fileInfo || !saveTemplateName.trim()) return;

    setIsSaving(true);
    try {
      const fingerprint = await generateFingerprint(
        session.session.fileInfo.headers
      );
      await templates.createTemplate({
        name: saveTemplateName.trim(),
        schemaType: session.session.detectedSchemaType!,
        columnMappings: session.session.columnMappings,
        headerFingerprint: fingerprint,
        sourceHeaders: session.session.fileInfo.headers,
      });
    } catch {
      // Template save is best-effort — don't block import
      console.error("[CSV Parser] Failed to save template");
    } finally {
      setIsSaving(false);
    }

    const result = (window as unknown as Record<string, unknown>)
      .__csvImportResult as CsvImportResult;
    delete (window as unknown as Record<string, unknown>).__csvImportResult;
    if (result) onComplete(result);
  }, [session, saveTemplateName, templates, onComplete]);

  // Skip saving and complete
  const handleSkipSave = useCallback(() => {
    const result = (window as unknown as Record<string, unknown>)
      .__csvImportResult as CsvImportResult;
    delete (window as unknown as Record<string, unknown>).__csvImportResult;
    if (result) onComplete(result);
  }, [onComplete]);

  const handleSchemaTypeChange = useCallback(
    (type: SchemaType) => {
      if (!session.session.fileInfo) return;
      // Re-fetch AI suggestions with new schema type
      aiMapping.fetchSuggestions(
        session.session.fileInfo.headers,
        session.session.fileInfo.sampleRows,
        type
      ).then((suggestion) => {
        if (suggestion) {
          const mappings = suggestionsToMappings(suggestion);
          session.setMappings(mappings, type);
        }
      });
    },
    [session, aiMapping]
  );

  // Handle sheet selection for xlsx
  const handleSheetSelect = useCallback(
    async (sheet: string) => {
      if (!session.session.file) return;
      session.setSelectedSheet(sheet);
      const info = await parser.parseUploadedFile(session.session.file, {
        selectedSheet: sheet,
      });
      if (info) {
        session.setFileInfo(session.session.file, info);
      }
    },
    [session, parser]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Import from CSV
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {STEPS[currentStep]}
              {session.session.fileInfo &&
                ` — ${session.session.fileInfo.fileName}`}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-4">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  i === currentStep
                    ? "bg-primary text-primary-foreground"
                    : i < currentStep
                      ? "bg-green-600 dark:bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 ${
                    i < currentStep ? "bg-green-600 dark:bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Sheet selection for multi-sheet xlsx */}
        {currentStep === 0 &&
          session.session.fileInfo?.sheetNames &&
          session.session.fileInfo.sheetNames.length > 1 && (
            <div className="mb-4 p-3 bg-muted rounded-md">
              <label className="text-sm font-medium text-foreground block mb-2">
                Select sheet:
              </label>
              <select
                className="w-full bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
                value={session.session.selectedSheet ?? ""}
                onChange={(e) => handleSheetSelect(e.target.value)}
              >
                {session.session.fileInfo.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

        {/* Template Manager sub-view */}
        {showTemplateManager && (
          <div className="py-4">
            <TemplateManager
              businessId={businessId}
              onClose={() => setShowTemplateManager(false)}
            />
          </div>
        )}

        {/* Content */}
        {!showTemplateManager && (
        <div className="py-4">
          {currentStep === 0 && (
            <FileUploadStep
              onFileParsed={handleFileParsed}
              parseFile={parser.parseUploadedFile}
              isLoading={parser.isLoading || isProcessingFile}
              error={parser.error}
              onManageTemplates={() => setShowTemplateManager(true)}
            />
          )}

          {currentStep === 1 && session.session.detectedSchemaType && (
            <ColumnMappingStep
              mappings={session.session.columnMappings}
              schemaType={session.session.detectedSchemaType}
              onUpdateMapping={session.updateMapping}
              onSchemaTypeChange={handleSchemaTypeChange}
              templateName={session.session.matchedTemplateName}
              isAiLoading={aiMapping.isLoading}
            />
          )}

          {currentStep === 2 && session.session.fileInfo && (
            <DataPreviewStep
              sampleRows={session.session.fileInfo.sampleRows}
              mappings={session.session.columnMappings}
              schemaType={session.session.detectedSchemaType!}
            />
          )}

          {currentStep === 3 && session.session.validationResult && (
            <ValidationResults
              result={session.session.validationResult}
              onProceed={() => handleImportComplete()}
              onBack={() => setCurrentStep(1)}
            />
          )}
        </div>
        )}

        {/* Save template prompt */}
        {showSavePrompt && (
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm text-foreground font-medium">
              Save this mapping as a template?
            </p>
            <p className="text-xs text-muted-foreground">
              Next time you upload a file with the same columns, the mapping
              will be applied automatically.
            </p>
            <input
              type="text"
              placeholder="Template name (e.g., Shopee Monthly Statement)"
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveTemplate}
                disabled={!saveTemplateName.trim() || isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save & Import"}
              </button>
              <button
                onClick={handleSkipSave}
                className="px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              >
                Skip & Import
              </button>
            </div>
          </div>
        )}

        {/* Footer navigation */}
        {!showSavePrompt && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              onClick={() => {
                if (currentStep === 0) onCancel();
                else setCurrentStep((s) => s - 1);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {currentStep === 0 ? "Cancel" : "Back"}
            </button>

            {currentStep === 1 && (
              <button
                onClick={handleConfirmMapping}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Preview
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                onClick={handleConfirmPreview}
                disabled={isValidating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                {isValidating ? "Validating..." : "Confirm & Import"}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
