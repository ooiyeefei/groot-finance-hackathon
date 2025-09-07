/**
 * Bulk Approval Queue Component
 * Implements Mel's manager efficiency features for bulk operations
 */

'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, User, DollarSign, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EXPENSE_CATEGORY_CONFIG } from '@/types/expense-claims'

interface ExpenseClaim {
  id: string
  employee_name: string
  description: string
  expense_category: string
  original_amount: number
  original_currency: string
  submission_date: string
  business_purpose: string
  vendor_name: string
  status: string
}

export default function BulkApprovalQueue() {
  const [claims, setClaims] = useState<ExpenseClaim[]>([])
  const [selectedClaims, setSelectedClaims] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null)
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  // Fetch pending approval claims
  useEffect(() => {
    const fetchPendingClaims = async () => {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/expense-claims?status=under_review')
        // const data = await response.json()
        
        // Mock data for demonstration
        const mockClaims: ExpenseClaim[] = [
          {
            id: '1',
            employee_name: 'John Doe',
            description: 'Business lunch with client',
            expense_category: 'entertainment',
            original_amount: 85.50,
            original_currency: 'SGD',
            submission_date: '2024-01-15T10:30:00Z',
            business_purpose: 'Client meeting to discuss Q1 project requirements',
            vendor_name: 'Marina Bay Restaurant',
            status: 'under_review'
          },
          {
            id: '2',
            employee_name: 'Jane Smith',
            description: 'Petrol for site visit',
            expense_category: 'petrol',
            original_amount: 45.00,
            original_currency: 'SGD',
            submission_date: '2024-01-14T15:45:00Z',
            business_purpose: 'Site visit to customer location for project assessment',
            vendor_name: 'Shell Station',
            status: 'under_review'
          }
        ]
        
        setClaims(mockClaims)
      } catch (error) {
        console.error('Failed to fetch pending claims:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPendingClaims()
  }, [])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClaims(claims.map(claim => claim.id))
    } else {
      setSelectedClaims([])
    }
  }

  const handleSelectClaim = (claimId: string, checked: boolean) => {
    if (checked) {
      setSelectedClaims(prev => [...prev, claimId])
    } else {
      setSelectedClaims(prev => prev.filter(id => id !== claimId))
    }
  }

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    if (selectedClaims.length === 0) return

    setBulkAction(action)
    setProcessing(true)

    try {
      const response = await fetch('/api/expense-claims/bulk-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          claim_ids: selectedClaims,
          action: action,
          comment: comment || undefined
        })
      })

      const result = await response.json()

      if (result.success) {
        // Remove processed claims from the queue
        setClaims(prev => prev.filter(claim => !selectedClaims.includes(claim.id)))
        setSelectedClaims([])
        setComment('')
        setBulkAction(null)
      } else {
        console.error('Bulk action failed:', result.error)
      }
    } catch (error) {
      console.error('Bulk action failed:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleIndividualAction = async (claimId: string, action: 'approve' | 'reject') => {
    setProcessing(true)

    try {
      const response = await fetch(`/api/expense-claims/${claimId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: action,
          comment: action === 'reject' ? 'Individual rejection' : undefined
        })
      })

      const result = await response.json()

      if (result.success) {
        // Remove claim from queue
        setClaims(prev => prev.filter(claim => claim.id !== claimId))
      } else {
        console.error('Individual action failed:', result.error)
      }
    } catch (error) {
      console.error('Individual action failed:', error)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-700 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (claims.length === 0) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="text-center text-gray-400 py-8">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" />
            <p>No pending approvals</p>
            <p className="text-sm">All team expense claims have been reviewed</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Bulk Actions Toolbar */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Pending Approvals</CardTitle>
              <CardDescription>
                {selectedClaims.length > 0 
                  ? `${selectedClaims.length} of ${claims.length} claims selected`
                  : `${claims.length} claims awaiting review`
                }
              </CardDescription>
            </div>
            
            {selectedClaims.length > 0 && (
              <div className="flex gap-2">
                <Button
                  onClick={() => handleBulkAction('approve')}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve Selected ({selectedClaims.length})
                </Button>
                <Button
                  onClick={() => handleBulkAction('reject')}
                  disabled={processing}
                  variant="destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject Selected
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Select All */}
          <div className="flex items-center space-x-2 pb-2 border-b border-gray-700">
            <Checkbox
              id="select-all"
              checked={selectedClaims.length === claims.length}
              onCheckedChange={handleSelectAll}
            />
            <label htmlFor="select-all" className="text-white font-medium cursor-pointer">
              Select All
            </label>
          </div>

          {/* Comment for Bulk Actions */}
          {selectedClaims.length > 0 && (
            <div className="space-y-2">
              <label className="text-white text-sm">Comment (optional)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment for the bulk action..."
                className="bg-gray-700 border-gray-600 text-white"
                rows={2}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claims List */}
      <div className="space-y-4">
        {claims.map((claim) => {
          const categoryConfig = EXPENSE_CATEGORY_CONFIG[claim.expense_category as keyof typeof EXPENSE_CATEGORY_CONFIG]
          const isSelected = selectedClaims.includes(claim.id)

          return (
            <Card key={claim.id} className={`bg-gray-800 border-gray-700 ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleSelectClaim(claim.id, checked as boolean)}
                    />
                    
                    <div className="flex-1 space-y-2">
                      {/* Header */}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-gray-700">
                          {categoryConfig?.icon} {categoryConfig?.label}
                        </Badge>
                        <span className="text-gray-400 text-sm">•</span>
                        <span className="text-gray-300 text-sm">{claim.employee_name}</span>
                      </div>

                      {/* Amount and Vendor */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center text-white font-semibold">
                          <DollarSign className="w-4 h-4 mr-1" />
                          {claim.original_amount.toFixed(2)} {claim.original_currency}
                        </div>
                        <div className="flex items-center text-gray-300 text-sm">
                          <User className="w-4 h-4 mr-1" />
                          {claim.vendor_name}
                        </div>
                        <div className="flex items-center text-gray-400 text-sm">
                          <Calendar className="w-4 h-4 mr-1" />
                          {new Date(claim.submission_date).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <p className="text-white">{claim.description}</p>
                        <p className="text-gray-400 text-sm mt-1">{claim.business_purpose}</p>
                      </div>
                    </div>
                  </div>

                  {/* Individual Actions */}
                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => handleIndividualAction(claim.id, 'approve')}
                      disabled={processing}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleIndividualAction(claim.id, 'reject')}
                      disabled={processing}
                      size="sm"
                      variant="destructive"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}