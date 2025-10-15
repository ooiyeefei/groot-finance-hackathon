/**
 * COGS Category Management Interface
 * Allows managers and finance users to create and manage custom Cost of Goods Sold categories
 */

'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Package, Building, AlertCircle, CheckCircle, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import COGSCategoryFormModal, { COGSCategoryFormData } from '@/domains/invoices/components/cogs-category-form-modal'

interface COGSCategory {
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

interface COGSCategoryManagementProps {
  userRole: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
}

export default function COGSCategoryManagement({ userRole }: COGSCategoryManagementProps) {
  const [categories, setCategories] = useState<COGSCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<COGSCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    isLoading: boolean
    category: COGSCategory | null
  }>({
    isOpen: false,
    isLoading: false,
    category: null
  })

  // Check permissions
  const canManage = userRole.manager || userRole.admin

  useEffect(() => {
    if (canManage) {
      fetchCategories()
    }
  }, [canManage])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/account-management/cogs-categories')
      const result = await response.json()

      if (result.success) {
        setCategories(result.data.categories)
      } else {
        setError(result.error || 'Failed to fetch COGS categories')
      }
    } catch (error) {
      console.error('Failed to fetch COGS categories:', error)
      setError('Network error while fetching COGS categories')
    } finally {
      setLoading(false)
    }
  }

  const handleFormSubmit = async (formData: COGSCategoryFormData) => {
    setSaving(true)
    setError(null)

    try {
      const submitData = {
        ...formData,
        id: editingCategory?.id,
        ai_keywords: formData.ai_keywords.split(',').map(k => k.trim()).filter(k => k),
        vendor_patterns: formData.vendor_patterns.split(',').map(p => p.trim()).filter(p => p),
      }

      const method = editingCategory ? 'PUT' : 'POST'
      const response = await fetch('/api/v1/account-management/cogs-categories', {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(editingCategory ? 'COGS category updated successfully' : 'COGS category created successfully')
        setShowForm(false)
        setEditingCategory(null)
        fetchCategories()
      } else {
        setError(result.error || 'Failed to save COGS category')
        throw new Error(result.error || 'Failed to save COGS category')
      }
    } catch (error) {
      console.error('Failed to save COGS category:', error)
      setError('Network error while saving COGS category')
      throw error // Re-throw to let modal handle the error state
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (category: COGSCategory) => {
    setEditingCategory(category)
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const handleDelete = (category: COGSCategory) => {
    setDeleteConfirmation({
      isOpen: true,
      isLoading: false,
      category: category
    })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.category) return

    setDeleteConfirmation(prev => ({ ...prev, isLoading: true }))

    try {
      setError(null)

      const response = await fetch('/api/v1/account-management/cogs-categories', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: deleteConfirmation.category.id })
      })

      const result = await response.json()

      if (result.success) {
        setSuccess('COGS category deleted successfully')
        fetchCategories()
        setDeleteConfirmation({
          isOpen: false,
          isLoading: false,
          category: null
        })
      } else {
        setError(result.error || 'Failed to delete COGS category')
        setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))
      }
    } catch (error) {
      console.error('Failed to delete COGS category:', error)
      setError('Network error while deleting COGS category')
      setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmation({
      isOpen: false,
      isLoading: false,
      category: null
    })
  }

  const filteredCategories = categories.filter(category =>
    category.category_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.category_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!canManage) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400">COGS category management is available for managers and finance users only.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Package className="w-5 h-5" />
                Cost of Goods Sold Categories
              </CardTitle>
              <CardDescription className="text-gray-400">
                Manage COGS categories for invoice and supplier transactions
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingCategory(null)
                setShowForm(true)
                setError(null)
                setSuccess(null)
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search COGS categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-700 border-gray-600 text-white"
            />
          </div>

          {/* Status Messages */}
          {error && (
            <Alert className="bg-red-900/20 border-red-700">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <div className="flex items-center gap-3 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-green-300 text-sm">{success}</span>
            </div>
          )}

          {/* Categories List */}
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
              <p className="text-gray-400">Loading COGS categories...</p>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <p className="text-gray-400">
                {searchQuery ? 'No COGS categories match your search' : 'No COGS categories found'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((category) => (
                <Card key={category.id} className="bg-gray-700 border-gray-600 flex flex-col">
                  <CardContent className="p-4 flex flex-col h-full">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-white font-medium">{category.category_name}</h4>
                          <p className="text-blue-400 text-sm font-mono">{category.category_code}</p>
                          {category.description && (
                            <p className="text-gray-400 text-sm mt-1">{category.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {!category.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className={`text-xs ${category.cost_type === 'direct' ? 'text-green-400' : 'text-yellow-400'}`}>
                          Cost Type: {category.cost_type.charAt(0).toUpperCase() + category.cost_type.slice(1)}
                        </div>

                        {category.ai_keywords.length > 0 && (
                          <div className="text-xs text-gray-400">
                            Keywords: {category.ai_keywords.slice(0, 3).join(', ')}
                            {category.ai_keywords.length > 3 && '...'}
                          </div>
                        )}

                        {category.vendor_patterns.length > 0 && (
                          <div className="text-xs text-purple-400">
                            Vendor Patterns: {category.vendor_patterns.slice(0, 2).join(', ')}
                            {category.vendor_patterns.length > 2 && '...'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-gray-600 mt-4">
                      <Button
                        size="sm"
                        onClick={() => handleEdit(category)}
                        className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-0"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDelete(category)}
                        className="bg-red-600 text-white hover:bg-red-700 border-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete COGS Category"
        message={`Are you sure you want to delete the COGS category "${deleteConfirmation.category?.category_name}"? This action cannot be undone and may affect existing invoices.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={deleteConfirmation.isLoading}
      />

      {/* COGS Category Form Modal */}
      <COGSCategoryFormModal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false)
          setEditingCategory(null)
          setError(null)
          setSuccess(null)
        }}
        onSubmit={handleFormSubmit}
        editingCategory={editingCategory}
        isLoading={saving}
        error={error}
      />
    </div>
  )
}