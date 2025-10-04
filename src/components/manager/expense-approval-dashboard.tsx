/**
 * Manager Dashboard - Expense Approval Interface
 * Shows pending expense claims requiring manager approval
 */

'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Eye, DollarSign, Calendar, Tag, User, FileText, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface ExpenseClaim {
  id: string
  employee_name: string
  employee_id: string
  description: string
  business_purpose: string
  original_amount: number
  original_currency: string
  converted_amount: number
  home_currency: string
  transaction_date: string
  vendor_name: string
  expense_category: string
  category_name: string
  status: 'pending_approval' | 'approved' | 'rejected'
  submission_date: string
  document_url?: string
  receipt_confidence?: number
  notes?: string
  requires_receipt: boolean
  policy_limit?: number
  is_over_limit: boolean
}

interface ApprovalAction {
  claim_id: string
  action: 'approve' | 'reject'
  notes?: string
}

export default function ExpenseApprovalDashboard() {
  const [claims, setClaims] = useState<ExpenseClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [processingClaims, setProcessingClaims] = useState<Set<string>>(new Set())
  const [selectedClaim, setSelectedClaim] = useState<ExpenseClaim | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    pending: 0,
    approved_today: 0,
    total_pending_amount: 0
  })

  useEffect(() => {
    fetchPendingClaims()
  }, [])

  const fetchPendingClaims = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/expense-claims/approvals')
      const result = await response.json()

      if (result.success) {
        setClaims(result.data.claims)
        setStats(result.data.stats)
      } else {
        setError(result.error || 'Failed to fetch pending claims')
      }
    } catch (error) {
      console.error('Failed to fetch claims:', error)
      setError('Network error while fetching claims')
    } finally {
      setLoading(false)
    }
  }

  const handleApproval = async (claimId: string, action: 'approve' | 'reject', notes?: string) => {
    try {
      setProcessingClaims(prev => new Set([...prev, claimId]))
      
      const response = await fetch('/api/expense-claims/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId, action, notes })
      })

      const result = await response.json()

      if (result.success) {
        // Refresh claims list
        await fetchPendingClaims()
        setSelectedClaim(null)
        setApprovalNotes('')
      } else {
        setError(result.error || `Failed to ${action} claim`)
      }
    } catch (error) {
      console.error(`Failed to ${action} claim:`, error)
      setError(`Network error while ${action === 'approve' ? 'approving' : 'rejecting'} claim`)
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_approval': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'approved': return 'bg-green-100 text-green-800 border-green-200'
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRiskLevel = (claim: ExpenseClaim) => {
    if (claim.is_over_limit) return 'high'
    if (claim.original_amount > 500) return 'medium'
    if (!claim.receipt_confidence || claim.receipt_confidence < 80) return 'medium'
    return 'low'
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-500'
      case 'medium': return 'text-yellow-500'
      default: return 'text-green-500'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
            <p className="text-gray-400">Loading expense approvals...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Expense Approvals</h1>
          <p className="text-gray-400">Review and approve employee expense claims</p>
        </div>

        {error && (
          <Alert className="bg-red-900/20 border-red-700">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Pending Approval</p>
                  <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Approved Today</p>
                  <p className="text-2xl font-bold text-green-400">{stats.approved_today}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Pending Amount</p>
                  <p className="text-2xl font-bold text-blue-400">
                    ${stats.total_pending_amount.toFixed(2)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Claims List */}
        {claims.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-12 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
              <h3 className="text-xl font-semibold text-white mb-2">All Caught Up!</h3>
              <p className="text-gray-400">No expense claims pending your approval.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Pending Approvals</CardTitle>
              <CardDescription>Claims requiring immediate attention</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-0">
                {claims.map((claim, index) => {
                  const riskLevel = getRiskLevel(claim)
                  const isProcessing = processingClaims.has(claim.id)

                  return (
                    <div
                      key={claim.id}
                      className={`p-4 flex items-center gap-4 hover:bg-gray-700/30 transition-colors ${
                        index !== claims.length - 1 ? 'border-b border-gray-700' : ''
                      }`}
                    >
                      {/* Left Section - Employee & Description */}
                      <div className="flex-1 min-w-0 max-w-md">
                        <div className="flex items-center gap-3 mb-1 overflow-hidden">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getRiskColor(riskLevel)}`} />
                          <p className="text-white font-medium text-sm truncate">
                            {claim.employee_name}
                          </p>
                          <Badge variant="outline" className={`${getStatusColor(claim.status)} text-xs flex-shrink-0`}>
                            {claim.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-gray-300 text-sm mb-1 truncate">{claim.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Tag className="w-3 h-3" />
                            <span className="truncate max-w-24">{claim.category_name}</span>
                          </span>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Calendar className="w-3 h-3" />
                            {new Date(claim.submission_date).toLocaleDateString()}
                          </span>
                          {(claim.is_over_limit || (claim.receipt_confidence && claim.receipt_confidence < 80)) && (
                            <span className="flex items-center gap-1 text-red-400 flex-shrink-0">
                              <AlertCircle className="w-3 h-3" />
                              Risk
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Center Section - Amount */}
                      <div className="text-right px-4 flex-shrink-0 w-28">
                        <p className="text-white font-semibold text-sm">
                          {claim.original_amount} {claim.original_currency}
                        </p>
                        {claim.original_currency !== claim.home_currency && (
                          <p className="text-gray-400 text-xs">
                            ${claim.converted_amount.toFixed(2)}
                          </p>
                        )}
                      </div>

                      {/* Right Section - Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          onClick={() => setSelectedClaim(claim)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 h-7"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Review
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleApproval(claim.id, 'approve')}
                          disabled={isProcessing}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-7"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          )}
                          Approve
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleApproval(claim.id, 'reject')}
                          disabled={isProcessing}
                          className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 h-7"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review Modal */}
        {selectedClaim && (
          <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-800 border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <CardHeader>
                <CardTitle className="text-white">Review Expense Claim</CardTitle>
                <CardDescription className="text-gray-400">
                  Detailed review for {selectedClaim.employee_name}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                {/* Claim Details */}
                <div className="space-y-4">
                  <h4 className="text-white font-semibold">Claim Information</h4>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Employee:</span>
                      <p className="text-white">{selectedClaim.employee_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Amount:</span>
                      <p className="text-white">
                        {selectedClaim.original_amount} {selectedClaim.original_currency}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Category:</span>
                      <p className="text-white">{selectedClaim.category_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Date:</span>
                      <p className="text-white">
                        {new Date(selectedClaim.transaction_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-400">Business Purpose:</span>
                    <p className="text-white mt-1">{selectedClaim.business_purpose}</p>
                  </div>
                  
                  {selectedClaim.document_url && (
                    <div>
                      <span className="text-gray-400">Receipt:</span>
                      <div className="mt-2">
                        <img 
                          src={selectedClaim.document_url} 
                          alt="Receipt"
                          className="max-w-full h-auto rounded border border-gray-600"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Approval Notes */}
                <div className="space-y-2">
                  <Label htmlFor="approval_notes" className="text-white">
                    Approval Notes (Optional)
                  </Label>
                  <Textarea
                    id="approval_notes"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Add notes about this approval decision..."
                    className="bg-gray-700 border-gray-600 text-white"
                    rows={3}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-700">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedClaim(null)
                      setApprovalNotes('')
                    }}
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  >
                    Cancel
                  </Button>
                  
                  <Button
                    onClick={() => handleApproval(selectedClaim.id, 'reject', approvalNotes)}
                    disabled={processingClaims.has(selectedClaim.id)}
                    variant="outline"
                    className="border-red-600 text-red-400 hover:bg-red-600/20"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  
                  <Button
                    onClick={() => handleApproval(selectedClaim.id, 'approve', approvalNotes)}
                    disabled={processingClaims.has(selectedClaim.id)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processingClaims.has(selectedClaim.id) ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}