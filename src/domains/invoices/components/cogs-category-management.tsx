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
  description?: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords: string[]
  vendor_patterns: string[]
  sort_order: number
  glCode?: string
}

interface COGSCategoryManagementProps {
  userRole: {
    employee: boolean
    manager: boolean
    finance_admin: boolean
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
  const canManage = userRole.manager || userRole.finance_admin

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
    category.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!canManage) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">COGS category management is available for managers and finance users only.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Package className="w-5 h-5" />
                Cost of Goods Sold Categories
              </CardTitle>
              <CardDescription>
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
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search COGS categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-input border-input text-foreground"
            />
          </div>

          {/* Status Messages */}
          {error && (
            <Alert className="bg-destructive/10 border-destructive/30">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <AlertDescription className="text-destructive">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <div className="flex items-center gap-3 p-3 bg-action-view/10 border border-action-view/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-action-view flex-shrink-0" />
              <span className="text-action-view text-sm">{success}</span>
            </div>
          )}

          {/* Categories List */}
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading COGS categories...</p>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No COGS categories match your search' : 'No COGS categories found'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((category) => (
                <Card key={category.id} className="bg-muted border-border flex flex-col">
                  <CardContent className="p-4 flex flex-col h-full">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-foreground font-medium">{category.category_name}</h4>
                          {category.description && (
                            <p className="text-muted-foreground text-sm mt-1">{category.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 items-start">
                          {category.glCode && (
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">{category.glCode}</span>
                          )}
                          {!category.is_active && (
                            <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground border border-border">Inactive</Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className={`text-xs ${category.cost_type === 'direct' ? 'text-action-view' : 'text-action-view'}`}>
                          Cost Type: {category.cost_type.charAt(0).toUpperCase() + category.cost_type.slice(1)}
                        </div>

                        {category.ai_keywords.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Keywords: {category.ai_keywords.slice(0, 3).join(', ')}
                            {category.ai_keywords.length > 3 && '...'}
                          </div>
                        )}

                        {category.vendor_patterns.length > 0 && (
                          <div className="text-xs text-primary">
                            Vendor Patterns: {category.vendor_patterns.slice(0, 2).join(', ')}
                            {category.vendor_patterns.length > 2 && '...'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-border mt-4">
                      <Button
                        size="sm"
                        onClick={() => handleEdit(category)}
                        className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 border-0"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDelete(category)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-0"
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