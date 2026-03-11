"use client";

import { useState } from "react";
import { Trash2, Pencil, X, Check } from "lucide-react";
import { useImportTemplates } from "../hooks/use-import-templates";
import type { Id } from "../../../../convex/_generated/dataModel";

interface TemplateManagerProps {
  businessId?: string;
  onClose: () => void;
}

export function TemplateManager({ businessId, onClose }: TemplateManagerProps) {
  const { templates, isLoading, removeTemplate, updateTemplate } =
    useImportTemplates(businessId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await updateTemplate(id as Id<"csv_import_templates">, {
      name: editName.trim(),
    });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await removeTemplate(id as Id<"csv_import_templates">);
    setConfirmDeleteId(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">Loading templates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Saved Templates ({templates.length})
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm">
            No saved templates yet. Templates are created when you complete an
            import and choose to save the mapping.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t._id}
              className="flex items-center justify-between p-3 border border-border rounded-lg bg-card"
            >
              <div className="flex-1 min-w-0">
                {editingId === t._id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-input border border-border rounded-md px-2 py-1 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(t._id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => handleSaveEdit(t._id)}
                      className="text-green-600 dark:text-green-400 hover:opacity-80"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground truncate">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.schemaType === "sales_statement"
                        ? "Sales Statement"
                        : "Bank Statement"}{" "}
                      · {t.columnMappings.length} columns
                      {t.lastUsedAt && (
                        <>
                          {" "}
                          · Last used{" "}
                          {new Date(t.lastUsedAt).toLocaleDateString()}
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>

              {editingId !== t._id && (
                <div className="flex items-center gap-1 ml-2">
                  {confirmDeleteId === t._id ? (
                    <>
                      <span className="text-xs text-destructive mr-1">
                        Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(t._id)}
                        className="text-destructive hover:opacity-80 px-1"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-muted-foreground hover:text-foreground px-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartEdit(t._id, t.name)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(t._id)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
