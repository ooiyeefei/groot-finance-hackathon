/**
 * Expense Edit Modal - Edit existing expense claims in a popup dialog
 * Matches the upload receipt modal style with blurred background
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  X, 
  Edit3, 
  Save, 
  ArrowLeft,
  Tag,
  DollarSign,
  Calendar,
  Building,
  FileText,
  Loader2,
  AlertCircle,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { useExpenseCategories } from '@/hooks/use-expense-categories'

interface ExpenseEditFormData {
  description: string
  business_purpose: string
  expense_category: string
  original_amount: number
  original_currency: string
  transaction_date: string
  vendor_name: string
  reference_number?: string
  notes?: string
}

interface ExpenseEditModalProps {
  expenseClaimId: string
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}

export default function ExpenseEditModal({ 
  expenseClaimId, 
  isOpen, 
  onClose, 
  onSave,
  onDelete 
}: ExpenseEditModalProps) {
  console.log('ExpenseEditModal render called - isOpen:', isOpen, 'expenseClaimId:', expenseClaimId)
  
  // Fetch dynamic categories
  const { categories, loading: categoriesLoading, error: categoriesError } = useExpenseCategories()
  
  const [formData, setFormData] = useState<ExpenseEditFormData>({
    description: '',
    business_purpose: '',
    expense_category: '',
    original_amount: 0,
    original_currency: 'SGD',
    transaction_date: '',
    vendor_name: '',
    reference_number: '',
    notes: ''
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadExpenseClaim = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      
      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[ExpenseEditModal] Load error:', errorData)
        
        // Handle specific authentication errors with user-friendly messages
        if (response.status === 404 || errorData.error?.includes('not found') || errorData.error?.includes('access denied')) {
          throw new Error('This expense claim cannot be edited. It may belong to a different user or may have been deleted.')
        }
        
        throw new Error(errorData.error || 'Failed to load expense claim')
      }

      const result = await response.json()
      const claim = result.data
      
      if (!claim) {
        throw new Error('Expense claim not found')
      }

      // Populate form with existing data
      setFormData({
        description: claim.transaction?.description || '',
        business_purpose: claim.transaction?.business_purpose || '',
        expense_category: claim.transaction?.expense_category || 'other',
        original_amount: claim.transaction?.original_amount || 0,
        original_currency: claim.transaction?.original_currency || 'SGD',
        transaction_date: claim.transaction?.transaction_date?.split('T')[0] || '',
        vendor_name: claim.transaction?.vendor_name || '',
        reference_number: claim.transaction?.reference_number || '',
        notes: claim.transaction?.notes || ''
      })
    } catch (error) {
      console.error('Error loading expense claim:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load expense claim')
    } finally {
      setLoading(false)
    }
  }, [expenseClaimId])

  // Load expense claim data when modal opens
  useEffect(() => {
    if (isOpen && expenseClaimId) {
      loadExpenseClaim()
    }
  }, [isOpen, expenseClaimId, loadExpenseClaim])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }
    if (!formData.business_purpose.trim()) {
      newErrors.business_purpose = 'Business purpose is required'
    }
    if (!formData.expense_category) {
      newErrors.expense_category = 'Category is required'
    }
    if (formData.original_amount <= 0) {
      newErrors.original_amount = 'Amount must be greater than 0'
    }
    if (!formData.vendor_name.trim()) {
      newErrors.vendor_name = 'Vendor name is required'
    }
    if (!formData.transaction_date) {
      newErrors.transaction_date = 'Date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return
    
    try {
      setSaving(true)
      setSaveError(null)
      
      // Update the expense claim
      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update expense claim')
      }

      console.log('Expense claim updated successfully')
      onSave()
      onClose()
      
    } catch (error) {
      console.error('Save error:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to save expense claim')
    } finally {
      setSaving(false)
    }
  }

  // Handle delete click to show confirmation dialog
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  // Handle confirmed delete
  const handleDeleteConfirmed = useCallback(async () => {
    try {
      setIsDeleting(true)
      setSaveError(null)
      
      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        const errorData = result
        throw new Error(errorData.error || 'Failed to delete expense claim')
      }

      console.log('Expense claim deleted successfully')
      
      // Close confirmation dialog
      setShowDeleteConfirm(false)
      
      // Call parent handlers
      if (onDelete) onDelete()
      onClose()
      
    } catch (error) {
      console.error('Delete error:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to delete expense claim')
    } finally {
      setIsDeleting(false)
    }
  }, [expenseClaimId, onDelete, onClose])

  // Handle closing delete confirmation
  const handleCloseDeleteConfirm = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteConfirm(false)
    }
  }, [isDeleting])

  // Don't render if modal is not open
  if (!isOpen) {
    console.log('ExpenseEditModal returning null because isOpen is false')
    return null
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Expense Claim</h2>
            <p className="text-gray-400 text-sm">
              Modify your expense claim details
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto text-blue-500 mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Loading Expense Claim
              </h3>
              <p className="text-gray-400">
                Please wait while we load your expense details...
              </p>
            </div>
          ) : loadError ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Cannot Load Expense Claim
              </h3>
              <p className="text-gray-400 mb-6">
                {loadError}
              </p>
              <Button 
                onClick={onClose}
                variant="outline"
                className="border-gray-600 text-gray-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Save Error */}
              {saveError && (
                <Alert className="bg-red-900/20 border-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="text-red-400">
                    {saveError}
                  </AlertDescription>
                </Alert>
              )}

              {/* Form */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Expense Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        Vendor Name *
                      </Label>
                      <Input
                        value={formData.vendor_name}
                        onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                        placeholder="Vendor or merchant name"
                      />
                      {errors.vendor_name && <p className="text-red-400 text-sm">{errors.vendor_name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Amount *
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.original_amount}
                          onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
                          className="bg-gray-600 border-gray-500 text-white flex-1"
                          placeholder="0.00"
                        />
                        <Select 
                          value={formData.original_currency} 
                          onValueChange={(value) => setFormData({...formData, original_currency: value})}
                        >
                          <SelectTrigger className="bg-gray-600 border-gray-500 text-white w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-700 border-gray-600">
                            {['SGD', 'USD', 'EUR', 'MYR', 'THB', 'IDR', 'CNY', 'VND', 'PHP'].map(currency => (
                              <SelectItem key={currency} value={currency} className="text-white">{currency}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {errors.original_amount && <p className="text-red-400 text-sm">{errors.original_amount}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Transaction Date *
                      </Label>
                      <Input
                        type="date"
                        value={formData.transaction_date}
                        onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                      />
                      {errors.transaction_date && <p className="text-red-400 text-sm">{errors.transaction_date}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Category *
                      </Label>
                      <Select 
                        value={formData.expense_category} 
                        onValueChange={(value) => setFormData({...formData, expense_category: value})}
                      >
                        <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-700 border-gray-600">
                          {categoriesLoading ? (
                            <SelectItem value="" className="text-gray-400" disabled>
                              Loading categories...
                            </SelectItem>
                          ) : categoriesError ? (
                            <SelectItem value="" className="text-red-400" disabled>
                              Error loading categories
                            </SelectItem>
                          ) : categories.length > 0 ? (
                            categories.map((category) => (
                              <SelectItem key={category.category_code} value={category.category_code} className="text-white">
                                {category.category_name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="" className="text-gray-400" disabled>
                              No categories available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {errors.expense_category && <p className="text-red-400 text-sm">{errors.expense_category}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Description *</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="bg-gray-600 border-gray-500 text-white"
                      placeholder="Brief description of expense"
                    />
                    {errors.description && <p className="text-red-400 text-sm">{errors.description}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Business Purpose *</Label>
                    <Textarea
                      value={formData.business_purpose}
                      onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
                      className="bg-gray-600 border-gray-500 text-white"
                      placeholder="Explain the business reason for this expense"
                      rows={3}
                    />
                    {errors.business_purpose && <p className="text-red-400 text-sm">{errors.business_purpose}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white">Reference Number</Label>
                      <Input
                        value={formData.reference_number || ''}
                        onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                        placeholder="Receipt or reference number"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-white">Additional Notes</Label>
                      <Input
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                        placeholder="Any additional information"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !loadError && (
          <div className="p-6 border-t border-gray-700">
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={onClose}
                disabled={saving}
                className="border-gray-600 text-gray-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              {onDelete && (
                <Button 
                  variant="outline"
                  onClick={handleDeleteClick}
                  disabled={saving}
                  className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button 
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={handleCloseDeleteConfirm}
        onConfirm={handleDeleteConfirmed}
        title="Delete Expense Claim"
        message="Are you sure you want to delete this draft expense claim? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </div>
  )
}