'use client';

/**
 * Exports Page Content
 *
 * Main component for the CSV Template Builder feature.
 * Provides tabbed interface for:
 * - Export: Run exports with pre-built or custom templates
 * - Templates: Manage custom templates
 * - Schedules: Configure automated exports
 * - History: View and re-download past exports
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { FileSpreadsheet, FileText, Clock, History, Download, Plus, BarChart3, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

// Lazy load MonthlyReportGenerator for performance
const MonthlyReportGenerator = lazy(() => import('@/domains/expense-claims/components/monthly-report-generator'));
import { useActiveBusiness } from '@/contexts/business-context';
import { useLocale } from 'next-intl';
import { ModuleSelector } from './module-selector';
import { TemplateList } from './template-list';
import { ExportFilters } from './export-filters';
import { ExportPreview } from './export-preview';
import { TemplateBuilder } from './template-builder';
import { DeleteTemplateDialog } from './delete-template-dialog';
import { ScheduleList } from './schedule-list';
import { ScheduleManager } from './schedule-manager';
import {
  useExportTemplates,
  useExportTemplate,
  useCloneTemplate,
  useDeleteTemplate,
} from '../hooks/use-export-templates';
import {
  useExportPreview,
  useExecuteExport,
  useExportHistoryStatus,
} from '../hooks/use-export-execution';
import { useExportHistory } from '../hooks/use-export-history';
import {
  useExportSchedules,
  useCreateSchedule,
  useToggleSchedule,
  useDeleteSchedule,
} from '../hooks/use-export-schedules';
import type { ExportModule, ExportFilters as ExportFiltersType } from '../types';
import type { Id } from '../../../../convex/_generated/dataModel';
import { getPrebuiltTemplateById } from '../lib/prebuilt-templates';

export default function ExportsPageContent() {
  const [activeTab, setActiveTab] = useState('export');
  const { addToast } = useToast();
  const locale = useLocale();

  // Get current business
  const { businessId: rawBusinessId, isLoading: businessLoading } = useActiveBusiness();
  // Convert null to undefined for hook compatibility
  const businessId = rawBusinessId ?? undefined;

  // Export tab state
  const [selectedModule, setSelectedModule] = useState<ExportModule | undefined>();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | Id<'export_templates'> | undefined>();
  const [isPrebuilt, setIsPrebuilt] = useState(true);
  const [filters, setFilters] = useState<ExportFiltersType>({});

  // Template builder state
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<Id<'export_templates'> | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: Id<'export_templates'>;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Schedule manager state
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);

  // Hooks for export functionality
  const { templates, isLoading: templatesLoading } = useExportTemplates(businessId, selectedModule);
  const { template } = useExportTemplate(selectedTemplateId, isPrebuilt);
  const { cloneTemplate } = useCloneTemplate();
  const { deleteTemplate } = useDeleteTemplate();
  // Preview with limited records for display
  const {
    records: previewRecords,
    totalCount,
    previewCount,
    isLoading: previewLoading,
  } = useExportPreview(
    businessId,
    selectedModule,
    !isPrebuilt ? (selectedTemplateId as Id<'export_templates'>) : undefined,
    isPrebuilt ? (selectedTemplateId as string) : undefined,
    filters,
    10 // Preview limit
  );

  // Full records for export (up to 10000)
  const {
    records: exportRecords,
    isLoading: exportRecordsLoading,
  } = useExportPreview(
    businessId,
    selectedModule,
    !isPrebuilt ? (selectedTemplateId as Id<'export_templates'>) : undefined,
    isPrebuilt ? (selectedTemplateId as string) : undefined,
    filters,
    10000 // Export limit
  );
  const {
    executeExport,
    getDownloadUrl,
    reset: resetExport,
    status: exportStatus,
    historyId,
    downloadUrl,
    isExecuting,
    isCompleted,
    isFailed,
    error: exportError,
  } = useExecuteExport();

  // Poll for export completion
  const { canDownload } = useExportHistoryStatus(historyId);

  // History tab data
  const { items: historyItems, isLoading: historyLoading } = useExportHistory(businessId);

  // Schedule hooks
  const { schedules, isLoading: schedulesLoading } = useExportSchedules(businessId);
  const { createSchedule } = useCreateSchedule();
  const { toggleSchedule } = useToggleSchedule();
  const { deleteSchedule } = useDeleteSchedule();

  // Reset template selection when module changes
  useEffect(() => {
    setSelectedTemplateId(undefined);
    setIsPrebuilt(true);
  }, [selectedModule]);

  // Handle template selection
  const handleTemplateSelect = useCallback(
    (id: string | Id<'export_templates'>, prebuilt: boolean) => {
      setSelectedTemplateId(id);
      setIsPrebuilt(prebuilt);
    },
    []
  );

  // Handle template clone
  const handleCloneTemplate = useCallback(
    async (prebuiltId: string) => {
      if (!businessId) return;
      const prebuilt = getPrebuiltTemplateById(prebuiltId);
      if (!prebuilt) return;

      try {
        const newTemplateId = await cloneTemplate({
          businessId,
          prebuiltId,
          name: `${prebuilt.name} (Copy)`,
        });
        addToast({
          type: 'success',
          title: 'Template cloned',
          description: 'You can now customize this template.',
        });
        setSelectedTemplateId(newTemplateId);
        setIsPrebuilt(false);
      } catch {
        addToast({
          type: 'error',
          title: 'Failed to clone template',
          description: 'Please try again.',
        });
      }
    },
    [businessId, cloneTemplate, addToast]
  );

  // Handle template delete - shows confirmation dialog
  const handleDeleteTemplate = useCallback(
    (templateId: Id<'export_templates'>) => {
      // Find the template name for display
      const templateToDelete = templates.find(
        (t) => !t.isPrebuilt && t.id === templateId
      );
      setDeleteConfirm({
        id: templateId,
        name: templateToDelete?.name || 'Unknown Template',
      });
    },
    [templates]
  );

  // Confirm delete
  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    try {
      await deleteTemplate(deleteConfirm.id);
      addToast({
        type: 'success',
        title: 'Template deleted',
        description: 'The template has been removed.',
      });
      if (selectedTemplateId === deleteConfirm.id) {
        setSelectedTemplateId(undefined);
      }
      setDeleteConfirm(null);
    } catch {
      addToast({
        type: 'error',
        title: 'Failed to delete template',
        description: 'Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteConfirm, deleteTemplate, selectedTemplateId, addToast]);

  // Handle export execution
  const handleExport = useCallback(async () => {
    if (!businessId || !selectedModule || !selectedTemplateId || !template) return;

    try {
      const newHistoryId = await executeExport({
        businessId,
        module: selectedModule,
        templateId: !isPrebuilt ? (selectedTemplateId as Id<'export_templates'>) : undefined,
        prebuiltId: isPrebuilt ? (selectedTemplateId as string) : undefined,
        templateName: template.name,
        filters,
      });

      // Generate CSV and trigger download using full export records
      const result = await getDownloadUrl(newHistoryId, {
        records: exportRecords as Record<string, unknown>[],
        fieldMappings: template.fieldMappings,
        templateName: template.name,
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast({
        type: 'success',
        title: 'Export completed',
        description: `Successfully exported ${exportRecords.length} records.`,
      });
    } catch {
      addToast({
        type: 'error',
        title: 'Export failed',
        description: exportError || 'Please try again.',
      });
    }
  }, [
    businessId,
    selectedModule,
    selectedTemplateId,
    template,
    isPrebuilt,
    filters,
    executeExport,
    getDownloadUrl,
    exportRecords,
    exportError,
    addToast,
  ]);

  // Handle re-download from history
  // Note: Re-download is disabled since we generate CSV client-side
  // Would require server-side storage for persistent downloads
  const handleRedownload = useCallback(
    async (_exportHistoryId: Id<'export_history'>) => {
      addToast({
        type: 'info',
        title: 'Re-download unavailable',
        description: 'Please run a new export to download the data.',
      });
    },
    [addToast]
  );

  // Handle schedule creation
  const handleCreateSchedule = useCallback(
    async (scheduleData: Omit<Parameters<typeof createSchedule>[0], 'businessId'>) => {
      if (!businessId) return;
      setIsCreatingSchedule(true);
      try {
        await createSchedule({
          ...scheduleData,
          businessId,
        });
        addToast({
          type: 'success',
          title: 'Schedule created',
          description: 'Your automated export has been scheduled.',
        });
        setShowScheduleManager(false);
      } catch {
        addToast({
          type: 'error',
          title: 'Failed to create schedule',
          description: 'Please try again.',
        });
      } finally {
        setIsCreatingSchedule(false);
      }
    },
    [businessId, createSchedule, addToast]
  );

  // Handle schedule toggle
  const handleToggleSchedule = useCallback(
    async (scheduleId: Id<'export_schedules'>, isEnabled: boolean) => {
      try {
        await toggleSchedule(scheduleId, isEnabled);
        addToast({
          type: 'success',
          title: isEnabled ? 'Schedule enabled' : 'Schedule disabled',
          description: isEnabled
            ? 'The export will run on schedule.'
            : 'The export has been paused.',
        });
      } catch {
        addToast({
          type: 'error',
          title: 'Failed to update schedule',
          description: 'Please try again.',
        });
      }
    },
    [toggleSchedule, addToast]
  );

  // Handle schedule delete
  const handleDeleteSchedule = useCallback(
    async (scheduleId: Id<'export_schedules'>) => {
      try {
        await deleteSchedule(scheduleId);
        addToast({
          type: 'success',
          title: 'Schedule deleted',
          description: 'The automated export has been removed.',
        });
      } catch {
        addToast({
          type: 'error',
          title: 'Failed to delete schedule',
          description: 'Please try again.',
        });
      }
    },
    [deleteSchedule, addToast]
  );

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[600px]">
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Schedules</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        {/* Reports Tab */}
        <TabsContent value="reports" className="mt-6">
          <div className="space-y-6">
            {/* Monthly Report Generator */}
            <Suspense
              fallback={
                <Card className="bg-card border-border">
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="mt-4 text-sm text-muted-foreground">Loading report generator...</p>
                    </div>
                  </CardContent>
                </Card>
              }
            >
              <MonthlyReportGenerator />
            </Suspense>

            {/* Duplicate Expense Report Link */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                    <Copy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-foreground">Duplicate Expense Report</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Review and manage potential duplicate expense claims
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => window.open(`/${locale}/expense-claims/duplicate-report`, '_blank')}
                    className="flex items-center gap-2"
                  >
                    <span>Open Report</span>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          </div>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="mt-6">
          <div className="space-y-6">
            {/* Step 1: Module Selection */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    1
                  </div>
                  <div>
                    <CardTitle className="text-foreground">Select Module</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Choose which data you want to export
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ModuleSelector
                  value={selectedModule}
                  onChange={setSelectedModule}
                  disabled={businessLoading}
                />
              </CardContent>
            </Card>

            {/* Step 2: Template Selection */}
            {selectedModule && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      2
                    </div>
                    <div>
                      <CardTitle className="text-foreground">Choose Template</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Select a pre-built or custom export template
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <TemplateList
                    templates={templates}
                    selectedId={selectedTemplateId}
                    onSelect={handleTemplateSelect}
                    onClone={handleCloneTemplate}
                    onDelete={handleDeleteTemplate}
                    isLoading={templatesLoading}
                    emptyMessage={`No templates available for ${selectedModule} module`}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 3: Filters & Preview */}
            {selectedModule && selectedTemplateId && template && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      3
                    </div>
                    <div>
                      <CardTitle className="text-foreground">Filter & Export</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Apply filters and preview your export
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ExportFilters
                    module={selectedModule}
                    filters={filters}
                    onChange={setFilters}
                    disabled={isExecuting}
                  />
                  <div className="border-t border-border pt-6">
                    <ExportPreview
                      records={previewRecords}
                      fieldMappings={template.fieldMappings}
                      totalCount={totalCount}
                      previewCount={previewCount}
                      isLoading={previewLoading}
                      onExport={handleExport}
                      isExporting={isExecuting || exportRecordsLoading}
                      templateName={template.name}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Export Templates</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Manage your custom export templates
                  </CardDescription>
                </div>
                <Button onClick={() => setShowTemplateBuilder(true)} disabled={!businessId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <TemplateList
                templates={templates.filter((t) => !t.isPrebuilt)}
                selectedId={undefined}
                onSelect={() => {}}
                onDelete={handleDeleteTemplate}
                isLoading={templatesLoading}
                emptyMessage="No custom templates yet. Click 'Create Template' to get started."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Scheduled Exports</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Configure automated export schedules
                  </CardDescription>
                </div>
                <Button onClick={() => setShowScheduleManager(true)} disabled={!businessId}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScheduleList
                schedules={schedules}
                onToggle={handleToggleSchedule}
                onDelete={handleDeleteSchedule}
                isLoading={schedulesLoading}
                emptyMessage="No schedules configured. Click 'New Schedule' to set up automated exports."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Export History</CardTitle>
              <CardDescription className="text-muted-foreground">
                View and re-download past exports
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg border border-border bg-muted/30"
                    />
                  ))}
                </div>
              ) : historyItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Export History</p>
                  <p className="text-sm mt-2">
                    Your export history will appear here after you run your first export
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyItems.map((item) => (
                    <div
                      key={item._id}
                      className="flex items-center justify-between rounded-lg border border-border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground">{item.templateName}</h4>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="capitalize">{item.module}</span>
                            <span>•</span>
                            <span>{item.recordCount} records</span>
                            <span>•</span>
                            <span>
                              {new Date(item._creationTime).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            item.status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : item.status === 'failed'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.status === 'completed' && item.storageId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRedownload(item._id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Builder Modal */}
      {showTemplateBuilder && businessId && (
        <TemplateBuilder
          businessId={businessId}
          templateId={editingTemplateId}
          onClose={() => {
            setShowTemplateBuilder(false);
            setEditingTemplateId(undefined);
          }}
          onSuccess={() => {
            setShowTemplateBuilder(false);
            setEditingTemplateId(undefined);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <DeleteTemplateDialog
          templateName={deleteConfirm.name}
          isOpen={true}
          isDeleting={isDeleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Schedule Manager Modal */}
      <ScheduleManager
        open={showScheduleManager}
        onOpenChange={setShowScheduleManager}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.isPrebuilt ? 'prebuilt' : 'custom',
        }))}
        onSubmit={handleCreateSchedule}
        isSubmitting={isCreatingSchedule}
      />
    </div>
  );
}
