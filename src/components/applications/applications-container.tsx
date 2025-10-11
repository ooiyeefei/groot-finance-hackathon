'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Plus, ClipboardList, Clock, CheckCircle, AlertCircle, FileText, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useActiveBusiness } from '@/contexts/business-context'

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
  const router = useRouter()
  const { businessId } = useActiveBusiness()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingApplication, setDeletingApplication] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ applicationId: string; title: string } | null>(null)
  const [creatingApplication, setCreatingApplication] = useState(false)

  useEffect(() => {
    fetchApplications()
  }, [])

  // CRITICAL FIX: Re-fetch applications when active business context changes
  useEffect(() => {
    if (businessId) {
      console.log('[ApplicationsContainer] Business context changed, refreshing applications:', businessId)
      fetchApplications()
    }
  }, [businessId])

  const fetchApplications = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/applications')
      const result = await response.json()

      if (result.success) {
        setApplications(result.data.applications)
      } else {
        setError('Failed to fetch applications')
      }
    } catch (err) {
      console.error('Error fetching applications:', err)
      setError('An error occurred while fetching applications')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-500'
      case 'processing':
        return 'bg-yellow-500'
      case 'completed':
        return 'bg-green-500'
      case 'failed':
        return 'bg-red-500'
      case 'needs_review':
        return 'bg-orange-500'
      default:
        return 'bg-gray-500'
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

  const handleDeleteApplication = async (applicationId: string) => {
    try {
      setDeletingApplication(applicationId)

      const response = await fetch(`/api/applications/${applicationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        // Remove application from state
        setApplications(prev => prev.filter(app => app.id !== applicationId))
        setDeleteConfirmation(null)
      } else {
        console.error('Delete failed:', result.error)
        setError(`Failed to delete application: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting application:', error)
      setError('Failed to delete application. Please try again.')
    } finally {
      setDeletingApplication(null)
    }
  }

  const confirmDelete = (applicationId: string, title: string) => {
    setDeleteConfirmation({ applicationId, title })
  }

  const handleCreateNewApplication = async () => {
    try {
      setCreatingApplication(true)
      setError(null)

      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'New Application', // Temporary title, will be updated with ID
          description: '',
          application_type: 'personal_loan'
        })
      })

      const result = await response.json()

      if (result.success) {
        // Update the title to use the application ID
        const updateResponse = await fetch(`/api/applications/${result.data.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `app-${result.data.id.split('-')[0]}`
          })
        })

        // Navigate directly to the application details page
        router.push(`/${locale}/applications/${result.data.id}`)
      } else {
        setError(result.error || 'Failed to create application')
      }
    } catch (err) {
      console.error('Error creating application:', err)
      setError('An error occurred while creating the application')
    } finally {
      setCreatingApplication(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <Button onClick={fetchApplications} variant="outline" className="text-gray-300 border-gray-600">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <div>{/* Intentionally left blank to push the button to the right */}</div>
        <Button
          onClick={handleCreateNewApplication}
          disabled={creatingApplication}
          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creatingApplication ? (
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
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No Applications Yet</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Get started by creating your first personal loan application.
              Upload required documents and track your progress.
            </p>
            <Button
              onClick={handleCreateNewApplication}
              disabled={creatingApplication}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingApplication ? (
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
          {applications.map((application) => (
            <Card key={application.id} className="bg-gray-800 border-gray-700 hover:border-gray-600 transition-colors">
              <CardContent className="p-4">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <h3 className="text-base font-semibold text-white">
                      <Link href={`/${locale}/applications/${application.id}`} className="hover:text-blue-400 transition-colors">
                        {application.title}
                      </Link>
                    </h3>
                    <Badge
                      className={`${getStatusColor(application.status)} text-white flex items-center gap-1 text-xs`}
                    >
                      {getStatusIcon(application.status)}
                      {application.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/${locale}/applications/${application.id}`}>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                        View Details
                      </Button>
                    </Link>
                    {application.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => confirmDelete(application.id, application.title)}
                        className="bg-red-600 hover:bg-red-700 text-white border-0"
                        disabled={deletingApplication === application.id}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {/* Info Row */}
                <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                  <span>{application.application_types.display_name}</span>
                  <span>Created {formatDate(application.created_at)}</span>
                </div>

                {/* Progress Section */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Progress</span>
                    <span className="text-gray-300">
                      {application.slots_filled} of {application.slots_total} documents
                    </span>
                  </div>
                  <Progress
                    value={application.progress_percentage}
                    className="h-2"
                  />
                  <div className="text-xs text-gray-500">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-white">Delete Application</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete "<strong>{deleteConfirmation.title}</strong>"?
              This action cannot be undone and will also delete all associated documents.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setDeleteConfirmation(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                disabled={deletingApplication === deleteConfirmation.applicationId}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDeleteApplication(deleteConfirmation.applicationId)}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deletingApplication === deleteConfirmation.applicationId}
              >
                {deletingApplication === deleteConfirmation.applicationId ? (
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