'use client'

import { useState, useEffect } from 'react'
import { X, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

export interface ExpenseCategory {
  id: string
  category_name: string
  description?: string
  is_active: boolean
  parent_category_id?: string
  ai_keywords: string[]
  vendor_patterns: string[]
  tax_treatment: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt: boolean
  receipt_threshold?: number
  policy_limit?: number
  requires_manager_approval: boolean
  sort_order: number
  is_default: boolean
  glCode?: string
  budgetLimit?: number
  budgetCurrency?: string
}

export interface CategoryFormData {
  category_name: string
  description: string
  parent_category_id: string
  ai_keywords: string
  vendor_patterns: string
  tax_treatment: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt: boolean
  receipt_threshold: number
  policy_limit: number
  requires_manager_approval: boolean
  sort_order: number
  is_active: boolean
  glCode: string
  budgetLimit: number
  budgetCurrency: string
}

interface CategoryFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CategoryFormData) => Promise<void>
  editingCategory?: ExpenseCategory | null
  isLoading?: boolean
  error?: string | null
}

export default function CategoryFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingCategory,
  isLoading = false,
  error
}: CategoryFormModalProps) {
  const [formData, setFormData] = useState<CategoryFormData>({
    category_name: '',
    description: '',
    parent_category_id: '',
    ai_keywords: '',
    vendor_patterns: '',
    tax_treatment: 'deductible',
    requires_receipt: false,
    receipt_threshold: 0,
    policy_limit: 0,
    requires_manager_approval: true,
    sort_order: 99,
    is_active: true,
    glCode: '',
    budgetLimit: 0,
    budgetCurrency: ''
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens/closes or editing category changes
  useEffect(() => {
    if (isOpen) {
      if (editingCategory) {
        setFormData({
          category_name: editingCategory.category_name,
          description: editingCategory.description || '',
          parent_category_id: editingCategory.parent_category_id || '',
          ai_keywords: editingCategory.ai_keywords.join(', '),
          vendor_patterns: editingCategory.vendor_patterns.join(', '),
          tax_treatment: editingCategory.tax_treatment,
          requires_receipt: editingCategory.requires_receipt,
          receipt_threshold: editingCategory.receipt_threshold || 0,
          policy_limit: editingCategory.policy_limit || 0,
          requires_manager_approval: true,
          sort_order: editingCategory.sort_order,
          is_active: editingCategory.is_active ?? true,
          glCode: editingCategory.glCode || '',
          budgetLimit: editingCategory.budgetLimit || 0,
          budgetCurrency: editingCategory.budgetCurrency || ''
        })
      } else {
        // Reset to default values for new category
        setFormData({
          category_name: '',
          description: '',
          parent_category_id: '',
          ai_keywords: '',
          vendor_patterns: '',
          tax_treatment: 'deductible',
          requires_receipt: false,
          receipt_threshold: 0,
          policy_limit: 0,
          requires_manager_approval: true,
          sort_order: 99,
          is_active: true,
          glCode: '',
          budgetLimit: 0,
          budgetCurrency: ''
        })
      }
      setValidationErrors({})
    }
  }, [isOpen, editingCategory])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.category_name.trim()) {
      errors.category_name = 'Category name is required'
    }

    if (formData.requires_receipt && formData.receipt_threshold < 0) {
      errors.receipt_threshold = 'Receipt threshold must be 0 or greater'
    }

    if (formData.policy_limit < 0) {
      errors.policy_limit = 'Policy limit must be 0 or greater'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      await onSubmit(formData)
      // Modal will be closed by parent component on success
    } catch (error) {
      // Error handling is done by parent component
    }
  }

  const handleClose = () => {
    if (isLoading) return // Prevent closing during submission
    onClose()
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
        onClick={handleBackdropClick}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-[611px] max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Configure expense category settings and auto-categorization rules
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Error Alert */}
              {error && (
                <Alert className="bg-red-900/20 border-red-700">
                  <AlertDescription className="text-red-400">{error}</AlertDescription>
                </Alert>
              )}

              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Basic Information</h4>

                <div>
                  <Label htmlFor="category_name">Category Name *</Label>
                  <Input
                    id="category_name"
                    value={formData.category_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, category_name: e.target.value }))}
                    placeholder="e.g., Travel & Accommodation"
                    className="mt-1"
                    disabled={isLoading}
                  />
                  {validationErrors.category_name && (
                    <p className="text-destructive text-xs mt-1">{validationErrors.category_name}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of this category"
                    className="mt-1"
                    rows={2}
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <Label htmlFor="glCode">GL Account Code</Label>
                  <Input
                    id="glCode"
                    value={formData.glCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, glCode: e.target.value.replace(/[^a-zA-Z0-9-]/g, '') }))}
                    placeholder="e.g., 9120, 6010"
                    className="mt-1 max-w-[200px]"
                    maxLength={20}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Chart of Account code for accounting software export</p>
                </div>
              </div>

              {/* Auto-Categorization Rules */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Auto-Categorization Rules</h4>

                <div>
                  <Label htmlFor="ai_keywords">Keywords (comma-separated)</Label>
                  <textarea
                    id="ai_keywords"
                    value={formData.ai_keywords}
                    onChange={(e) => setFormData(prev => ({ ...prev, ai_keywords: e.target.value }))}
                    placeholder="travel, hotel, flight, accommodation"
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[38px]"
                    rows={2}
                    disabled={isLoading}
                  />
                  <p className="text-muted-foreground text-xs mt-1">
                    Keywords found in receipt descriptions will auto-categorize to this category
                  </p>
                </div>

                <div>
                  <Label htmlFor="vendor_patterns">Vendor Patterns (comma-separated)</Label>
                  <textarea
                    id="vendor_patterns"
                    value={formData.vendor_patterns}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor_patterns: e.target.value }))}
                    placeholder="*airline*, *hotel*, booking.com"
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[38px]"
                    rows={2}
                    disabled={isLoading}
                  />
                  <p className="text-muted-foreground text-xs mt-1">
                    Use * as wildcards. Vendor names matching these patterns will auto-categorize
                  </p>
                </div>
              </div>

              {/* Policy Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Policy Settings</h4>

                <div>
                  <Label htmlFor="tax_treatment">Tax Treatment</Label>
                  <Select
                    value={formData.tax_treatment}
                    onValueChange={(value: 'deductible' | 'non_deductible' | 'partial') =>
                      setFormData(prev => ({ ...prev, tax_treatment: value }))
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deductible">Fully Deductible</SelectItem>
                      <SelectItem value="partial">Partially Deductible</SelectItem>
                      <SelectItem value="non_deductible">Non-Deductible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requires_receipt"
                    checked={formData.requires_receipt}
                    onCheckedChange={(checked) =>
                      setFormData(prev => ({ ...prev, requires_receipt: !!checked }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="requires_receipt" className="text-foreground">
                    Requires receipt attachment
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requires_manager_approval"
                    checked={formData.requires_manager_approval}
                    onCheckedChange={(checked) =>
                      setFormData(prev => ({ ...prev, requires_manager_approval: !!checked }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="requires_manager_approval" className="text-foreground">
                    Requires manager approval
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>Category Status</Label>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                        formData.is_active ? 'bg-green-600' : 'bg-muted'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                          formData.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                      {formData.is_active ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formData.is_active
                      ? 'Category is available for expense submissions'
                      : 'Category is hidden from expense forms'
                    }
                  </p>
                </div>

                {formData.requires_receipt && (
                  <div>
                    <Label htmlFor="receipt_threshold">Receipt Required Above Amount</Label>
                    <Input
                      id="receipt_threshold"
                      type="number"
                      step="0.01"
                      value={formData.receipt_threshold}
                      onChange={(e) => setFormData(prev => ({ ...prev, receipt_threshold: Number(e.target.value) }))}
                      placeholder="0.00"
                      className="mt-1"
                      disabled={isLoading}
                    />
                    {validationErrors.receipt_threshold && (
                      <p className="text-destructive text-xs mt-1">{validationErrors.receipt_threshold}</p>
                    )}
                  </div>
                )}

                <div>
                  <Label htmlFor="policy_limit">Policy Limit (SGD)</Label>
                  <Input
                    id="policy_limit"
                    type="number"
                    step="0.01"
                    value={formData.policy_limit}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_limit: Number(e.target.value) }))}
                    placeholder="0.00 (0 = no limit)"
                    className="mt-1"
                    disabled={isLoading}
                  />
                  {validationErrors.policy_limit && (
                    <p className="text-destructive text-xs mt-1">{validationErrors.policy_limit}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="budgetLimit">Monthly Budget Limit</Label>
                  <Input
                    id="budgetLimit"
                    type="number"
                    step="0.01"
                    value={formData.budgetLimit || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, budgetLimit: Number(e.target.value) }))}
                    placeholder="0.00 (0 = no budget tracking)"
                    className="mt-1"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional monthly spending limit for this category. Set to 0 or leave empty to disable budget tracking. Managers will be alerted when spending reaches 80% of this limit.
                  </p>
                  {validationErrors.budgetLimit && (
                    <p className="text-destructive text-xs mt-1">{validationErrors.budgetLimit}</p>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 flex-shrink-0">
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="default"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={isLoading}
                variant="primary"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {editingCategory ? 'Update' : 'Create'} Category
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}