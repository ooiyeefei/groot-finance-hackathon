'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Plus, ClipboardList, Clock, CheckCircle, AlertCircle, FileText, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useGetApplications, useCreateApplication, useDeleteApplication } from '../hooks/use-applications'

interface Application {
  id: string
  title: string
  description: string
  status: 'draft' | 'processing' | 'completed' | 'failed' | 'needs_review'
  application_type: string
  progress_percentage: number
  slots_filled: number
  slots_total: number
  created_at: string
  application_types: {
    display_name: string
    description: string
  }
  slot_status?: Array<{
    slot: string
    display_name: string
    is_critical: boolean
    status: string
    document_id: string | null
    uploaded_at: string | null
  }>
}

export default function ApplicationsContainer() {
  const locale = useLocale()
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ applicationId: string; title: string } | null>(null)

  // Use custom hooks
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useGetApplications()

  const createMutation = useCreateApplication()
  const deleteMutation = useDeleteApplication()

  const applications = data?.applications || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-record-layer-2 text-record-supporting dark:bg-gray-800/50 dark:text-gray-300'
      case 'processing':
        return 'bg-warning/20 text-warning-foreground dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'completed':
        return 'bg-success/20 text-success-foreground dark:bg-green-900/30 dark:text-green-300'
      case 'failed':
        return 'bg-danger/20 text-danger-foreground dark:bg-red-900/30 dark:text-red-300'
      case 'needs_review':
        return 'bg-warning/20 text-warning-foreground dark:bg-orange-900/30 dark:text-orange-300'
      default:
        return 'bg-record-layer-2 text-record-supporting dark:bg-gray-800/50 dark:text-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <FileText className="w-4 h-4" />
      case 'processing':
        return <Clock className="w-4 h-4" />
      case 'completed':
        return <CheckCircle className="w-4 h-4" />
      case 'failed':
        return <AlertCircle className="w-4 h-4" />
      case 'needs_review':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const confirmDelete = (applicationId: string, title: string) => {
    setDeleteConfirmation({ applicationId, title })
  }

  const handleDeleteApplication = (applicationId: string) => {
    deleteMutation.mutate(applicationId)
    setDeleteConfirmation(null)
  }

  const handleCreateNewApplication = () => {
    createMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="space-y-section-gap" data-testid="applications-loading">
        <div className="animate-pulse">
          <div className="h-8 bg-record-layer-2 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-record-layer-2 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-center py-12" data-testid="applications-error">
        <AlertCircle className="w-12 h-12 text-danger-foreground dark:text-red-400 mx-auto mb-4" />
        <p className="text-record-title mb-4">{error instanceof Error ? error.message : 'Failed to load applications'}</p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-section-gap" data-testid="applications-list">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <div>{/* Intentionally left blank to push the button to the right */}</div>
        <Button
          onClick={handleCreateNewApplication}
          disabled={createMutation.isPending}
          variant="primary"
        >
          {createMutation.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              New Application
            </>
          )}
        </Button>
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <Card className="bg-record-layer-1 border-record-border">
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Applications Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Get started by creating your first personal loan application.
              Upload required documents and track your progress.
            </p>
            <Button
              onClick={handleCreateNewApplication}
              disabled={createMutation.isPending}
              variant="primary"
            >
              {createMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Application
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {applications.map((application: Application) => (
            <Card key={application.id} className="bg-record-layer-1 border-record-border hover:border-record-border-hover transition-colors">
              <CardContent className="p-6">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <h3 className="text-base font-semibold text-foreground">
                      <Link href={`/${locale}/applications/${application.id}`} className="hover:text-primary transition-colors">
                        {application.title}
                      </Link>
                    </h3>
                    <Badge
                      className={`${getStatusColor(application.status)} flex items-center gap-1 text-xs`}
                    >
                      {getStatusIcon(application.status)}
                      {application.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/${locale}/applications/${application.id}`}>
                      <Button size="sm" variant="primary">
                        View Details
                      </Button>
                    </Link>
                    {application.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => confirmDelete(application.id, application.title)}
                        variant="destructive"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {/* Info Row */}
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                  <span>{application.application_types.display_name}</span>
                  <span>Created {formatDate(application.created_at)}</span>
                </div>

                {/* Progress Section */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="text-foreground">
                      {application.slots_filled} of {application.slots_total} documents
                    </span>
                  </div>
                  <Progress
                    value={application.progress_percentage}
                    className="h-2"
                  />
                  <div className="text-xs text-muted-foreground">
                    {application.progress_percentage}% complete
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-record-layer-1 border border-record-border rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-danger-foreground dark:text-red-400 mr-3" />
              <h3 className="text-lg font-semibold text-record-title">Delete Application</h3>
            </div>
            <p className="text-record-supporting mb-6">
              Are you sure you want to delete "<strong className="text-record-title">{deleteConfirmation.title}</strong>"?
              This action cannot be undone and will also delete all associated documents.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setDeleteConfirmation(null)}
                variant="secondary"
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDeleteApplication(deleteConfirmation.applicationId)}
                variant="destructive"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Application
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}