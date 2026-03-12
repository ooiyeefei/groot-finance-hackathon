"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import type { ParsedFileInfo } from "../types";

interface FileUploadStepProps {
  onFileParsed: (file: File, info: ParsedFileInfo) => void;
  parseFile: (file: File) => Promise<ParsedFileInfo | null>;
  isLoading: boolean;
  error: string | null;
  onManageTemplates?: () => void;
}

const ACCEPTED_TYPES = ".csv,.xlsx,.xls,.tsv,.txt";
const ACCEPTED_MIME = [
  "text/csv",
  "text/plain",
  "text/tab-separated-values",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export function FileUploadStep({
  onFileParsed,
  parseFile,
  isLoading,
  error,
  onManageTemplates,
}: FileUploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const info = await parseFile(file);
      if (info) {
        onFileParsed(file, info);
      }
    },
    [parseFile, onFileParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleInputChange}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            <p className="text-muted-foreground text-sm font-medium">Processing file...</p>
            <p className="text-muted-foreground text-xs">Analyzing columns and mapping fields</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-muted p-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-foreground font-medium">
                Drop your file here or click to browse
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Supports CSV, XLSX, XLS (max 25 MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Manage Templates Link */}
      {onManageTemplates && (
        <div className="text-center">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={onManageTemplates}
          >
            Manage saved templates
          </button>
        </div>
      )}
    </div>
  );
}
