'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, AlertCircle, CheckCircle, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'

interface CreateFormData {
  title: string
  description: string
}

export default function ApplicationCreateForm() {
  const router = useRouter()
  const locale = useLocale()
  const [formData, setFormData] = useState<CreateFormData>({
    title: '',
    description: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleInputChange = (field: keyof CreateFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    if (error) setError(null) // Clear error when user starts typing
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      setError('Application title is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || undefined,
          application_type: 'personal_loan'
        })
      })

      const result = await response.json()

      if (result.success) {
        // Redirect to the new application detail page
        router.push(`/${locale}/applications/${result.data.id}`)
      } else {
        setError(result.error || 'Failed to create application')
      }
    } catch (err) {
      console.error('Error creating application:', err)
      setError('An error occurred while creating the application')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${locale}/applications`}>
          <Button variant="outline" size="sm" className="text-gray-300 border-gray-600 hover:border-gray-500">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Create New Application</h1>
          <p className="text-gray-400">Personal Loan Application</p>
        </div>
      </div>

      {/* Application Type Info */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-600 rounded-lg">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">Personal Loan Application</h3>
              <p className="text-gray-300 text-sm mb-3">
                Complete application process for personal loan approval. Upload required documents and track your progress.
              </p>

              <div className="space-y-2 text-sm">
                <div className="text-gray-400 font-medium">Required Documents (5):</div>
                <div className="grid grid-cols-1 gap-1 text-gray-500">
                  <div>• Identity Card (IC) - Both sides, clear photo</div>
                  <div>• Most Recent Payslip - Current month salary slip</div>
                  <div>• Previous Month Payslip - 1 month ago salary slip</div>
                  <div>• 2 Months Prior Payslip - Optional, helps strengthen application</div>
                  <div>• Bank Application Form - Completed and signed form</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Application Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Field */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-gray-300">
                Application Title *
              </Label>
              <Input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Personal Loan for Home Renovation"
                className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                disabled={loading}
                maxLength={100}
              />
              <div className="text-xs text-gray-500">
                Give your application a descriptive title for easy identification
              </div>
            </div>

            {/* Description Field */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-gray-300">
                Description (Optional)
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of the loan purpose, amount needed, etc."
                className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 min-h-[100px]"
                disabled={loading}
                maxLength={500}
              />
              <div className="text-xs text-gray-500">
                Optional: Add details about your loan purpose or any specific notes
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading || !formData.title.trim()}
                className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Application
                  </>
                )}
              </Button>

              <Link href={`/${locale}/applications`}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  className="text-gray-300 border-gray-600 hover:border-gray-500"
                >
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Next Steps Preview */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-600 rounded-lg">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">Next Steps</h3>
              <p className="text-gray-300 text-sm mb-3">
                After creating your application, you'll be able to:
              </p>

              <div className="space-y-1 text-sm text-gray-400">
                <div>1. Upload your documents to the 5 designated slots</div>
                <div>2. Track processing status for each document</div>
                <div>3. View extracted data and validation results</div>
                <div>4. Submit when all critical documents are completed</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}