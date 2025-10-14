'use client'

import { useState, useEffect } from 'react'
import { X, CheckCircle, Loader2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

export interface COGSCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords: string[]
  vendor_patterns: string[]
  sort_order: number
}

export interface COGSCategoryFormData {
  category_name: string
  category_code: string
  description: string
  cost_type: 'direct' | 'indirect'
  ai_keywords: string
  vendor_patterns: string
  sort_order: number
  is_active: boolean
}

interface COGSCategoryFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: COGSCategoryFormData) => Promise<void>
  editingCategory?: COGSCategory | null
  isLoading?: boolean
  error?: string | null
}

export default function COGSCategoryFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingCategory,
  isLoading = false,
  error
}: COGSCategoryFormModalProps) {
  const [formData, setFormData] = useState<COGSCategoryFormData>({
    category_name: '',
    category_code: '',
    description: '',
    cost_type: 'direct',
    ai_keywords: '',
    vendor_patterns: '',
    sort_order: 99,
    is_active: true
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens/closes or editing category changes
  useEffect(() => {
    if (isOpen) {
      if (editingCategory) {
        setFormData({
          category_name: editingCategory.category_name,
          category_code: editingCategory.category_code,
          description: editingCategory.description || '',
          cost_type: editingCategory.cost_type,
          ai_keywords: editingCategory.ai_keywords.join(', '),
          vendor_patterns: editingCategory.vendor_patterns.join(', '),
          sort_order: editingCategory.sort_order,
          is_active: editingCategory.is_active ?? true
        })
      } else {
        // Reset to default values for new category
        setFormData({
          category_name: '',
          category_code: '',
          description: '',
          cost_type: 'direct',
          ai_keywords: '',
          vendor_patterns: '',
          sort_order: 99,
          is_active: true
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

    if (!formData.category_code.trim()) {
      errors.category_code = 'Category code is required'
    }

    if (formData.sort_order < 0) {
      errors.sort_order = 'Sort order must be 0 or greater'
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
        <div className="relative transform overflow-hidden rounded-xl bg-gray-800 shadow-2xl text-left transition-all w-full max-w-2xl max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5" />
                {editingCategory ? 'Edit COGS Category' : 'Add New COGS Category'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Configure Cost of Goods Sold category for invoices and supplier transactions
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                <h4 className="text-sm font-medium text-white">Basic Information</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category_name" className="text-white">Category Name *</Label>
                    <Input
                      id="category_name"
                      value={formData.category_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, category_name: e.target.value }))}
                      placeholder="e.g., Materials & Supplies"
                      className="bg-gray-700 border-gray-600 text-white mt-1"
                      disabled={isLoading}
                    />
                    {validationErrors.category_name && (
                      <p className="text-red-400 text-xs mt-1">{validationErrors.category_name}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="category_code" className="text-white">Category Code *</Label>
                    <Input
                      id="category_code"
                      value={formData.category_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, category_code: e.target.value }))}
                      placeholder="e.g., 615-000"
                      className="bg-gray-700 border-gray-600 text-white font-mono mt-1"
                      disabled={isLoading}
                    />
                    {validationErrors.category_code && (
                      <p className="text-red-400 text-xs mt-1">{validationErrors.category_code}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" className="text-white">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of this COGS category"
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                    rows={2}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Cost Classification */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-white">Cost Classification</h4>

                <div>
                  <Label htmlFor="cost_type" className="text-white">Cost Type *</Label>
                  <Select
                    value={formData.cost_type}
                    onValueChange={(value: 'direct' | 'indirect') =>
                      setFormData(prev => ({ ...prev, cost_type: value }))
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      <SelectItem value="direct" className="text-white">Direct Cost</SelectItem>
                      <SelectItem value="indirect" className="text-white">Indirect Cost</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-gray-400 text-xs mt-1">
                    Direct costs are directly attributable to specific products/services
                  </p>
                </div>
              </div>

              {/* Auto-Categorization Rules */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-white">Auto-Categorization Rules</h4>

                <div>
                  <Label htmlFor="ai_keywords" className="text-white">Keywords (comma-separated)</Label>
                  <Input
                    id="ai_keywords"
                    value={formData.ai_keywords}
                    onChange={(e) => setFormData(prev => ({ ...prev, ai_keywords: e.target.value }))}
                    placeholder="materials, supplies, inventory, components"
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                    disabled={isLoading}
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    Keywords found in invoice descriptions will auto-categorize to this category
                  </p>
                </div>

                <div>
                  <Label htmlFor="vendor_patterns" className="text-white">Vendor Patterns (comma-separated)</Label>
                  <Input
                    id="vendor_patterns"
                    value={formData.vendor_patterns}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor_patterns: e.target.value }))}
                    placeholder="supplier, materials, wholesale, trading"
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                    disabled={isLoading}
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    Vendor names containing these patterns will auto-categorize to this category
                  </p>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-white">Category Settings</h4>

                <div>
                  <Label htmlFor="sort_order" className="text-white">Sort Order</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, sort_order: Number(e.target.value) }))}
                    placeholder="99"
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                    disabled={isLoading}
                    min="0"
                  />
                  {validationErrors.sort_order && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.sort_order}</p>
                  )}
                  <p className="text-gray-400 text-xs mt-1">
                    Lower numbers appear first in category lists
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Category Status</Label>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        formData.is_active ? 'bg-green-600' : 'bg-gray-600'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-sm font-medium ${formData.is_active ? 'text-green-400' : 'text-gray-400'}`}>
                      {formData.is_active ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {formData.is_active
                      ? 'Category is available for invoice categorization'
                      : 'Category is hidden from categorization options'
                    }
                  </p>
                </div>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700 px-6 py-4 flex-shrink-0">
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="bg-gray-600 text-white hover:bg-gray-500 border-gray-600"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
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