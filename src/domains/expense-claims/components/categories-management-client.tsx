'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Tag, DollarSign, AlertCircle, CheckCircle, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import CategoryFormModal, { CategoryFormData } from '@/domains/expense-claims/components/category-form-modal'
import COGSCategoryManagement from '@/domains/invoices/components/cogs-category-management'
import { fetchUserRoleWithCache } from '@/lib/cache-utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ExpenseCategory {
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
}


interface CategoriesManagementProps {
  userId: string
}

interface UserRole {
  employee: boolean
  manager: boolean
  finance_admin: boolean
}

export default function CategoriesManagementClient({ userId }: CategoriesManagementProps) {
  const [activeTab, setActiveTab] = useState('expense')
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const roleData = await fetchUserRoleWithCache()

        if (roleData && roleData.permissions) {
          setUserRole(roleData.permissions)
        } else {
          setUserRole({ employee: true, manager: false, finance_admin: false })
        }
      } catch (error) {
        console.error('Failed to fetch user role:', error)
        setUserRole({ employee: true, manager: false, finance_admin: false })
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchUserRole()
    }
  }, [userId])

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!userRole) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Failed to load user permissions.</p>
        </CardContent>
      </Card>
    )
  }

  const canManage = userRole.manager || userRole.finance_admin

  if (!canManage) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Category management is available for managers and finance users only.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-muted border border-border">
          <TabsTrigger value="expense" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Expense Categories
          </TabsTrigger>
          <TabsTrigger value="cogs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            COGS Categories
          </TabsTrigger>
        </TabsList>

        {/* PERFORMANCE: Conditionally render tabs for true lazy loading */}
        {activeTab === 'expense' && (
          <TabsContent value="expense" className="space-y-4">
            <ExpenseCategoryManagement userRole={userRole} />
          </TabsContent>
        )}

        {activeTab === 'cogs' && (
          <TabsContent value="cogs" className="space-y-4">
            <COGSCategoryManagement userRole={userRole} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function ExpenseCategoryManagement({ userRole }: { userRole: UserRole }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    isLoading: boolean
    category: ExpenseCategory | null
  }>({
    isOpen: false,
    isLoading: false,
    category: null
  })

  const canManage = userRole.manager || userRole.finance_admin

  const {
    data: categories = [],
    isLoading: loading,
    error: queryError
  } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const response = await fetch('/api/v1/expense-claims/categories')
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch categories')
      }

      return result.data.categories as ExpenseCategory[]
    },
    staleTime: 1000 * 60 * 30,
    enabled: canManage,
  })

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Failed to fetch categories')
    }
  }, [queryError])

  const saveCategoryMutation = useMutation({
    mutationFn: async (formData: CategoryFormData) => {
      const submitData = {
        ...formData,
        id: editingCategory?.id,
        ai_keywords: formData.ai_keywords.split(',').map(k => k.trim()).filter(k => k),
        vendor_patterns: formData.vendor_patterns.split(',').map(p => p.trim()).filter(p => p),
        receipt_threshold: formData.requires_receipt ? formData.receipt_threshold : null,
      }

      const method = editingCategory ? 'PUT' : 'POST'
      const response = await fetch('/api/v1/expense-claims/categories', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to save category')
      }

      return result
    },
    onSuccess: () => {
      setSuccess(editingCategory ? 'Category updated successfully' : 'Category created successfully')
      setShowForm(false)
      setEditingCategory(null)
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    },
    onError: (error: Error) => {
      console.error('Failed to save category:', error)
      setError(error.message || 'Network error while saving category')
    }
  })

  const handleFormSubmit = async (formData: CategoryFormData) => {
    setError(null)
    try {
      await saveCategoryMutation.mutateAsync(formData)
    } catch (err) {
      throw err
    }
  }

  const handleEdit = (category: ExpenseCategory) => {
    setEditingCategory(category)
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const handleDelete = (category: ExpenseCategory) => {
    setDeleteConfirmation({
      isOpen: true,
      isLoading: false,
      category: category
    })
  }

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const response = await fetch('/api/v1/expense-claims/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: categoryId })
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete category')
      }

      return result
    },
    onSuccess: () => {
      setSuccess('Category deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      setDeleteConfirmation({
        isOpen: false,
        isLoading: false,
        category: null
      })
    },
    onError: (error: Error) => {
      console.error('Failed to delete category:', error)
      setError(error.message || 'Network error while deleting category')
      setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))
    }
  })

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.category) return

    setDeleteConfirmation(prev => ({ ...prev, isLoading: true }))
    setError(null)

    try {
      await deleteCategoryMutation.mutateAsync(deleteConfirmation.category.id)
    } catch {
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

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Expense Categories
              </CardTitle>
              <CardDescription>
                Manage expense categories for your organization
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
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-input border-input text-foreground"
            />
          </div>

          {/* Status Messages */}
          {error && (
            <div className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <span className="text-destructive text-sm">{error}</span>
            </div>
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
              <p className="text-muted-foreground">Loading categories...</p>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8">
              <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No categories match your search' : 'No categories found'}
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
                        <div className="flex gap-1">
                          {!category.is_active && (
                            <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground border border-border">Inactive</Badge>
                          )}
                          {category.is_default && (
                            <Badge variant="outline" className="text-xs border-2">Default</Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <DollarSign className="w-3 h-3" />
                          <span className="capitalize">{category.tax_treatment?.replace('_', ' ') || 'Standard'}</span>
                        </div>

                        <div className={`text-xs ${category.requires_receipt ? 'text-action-view' : 'text-muted-foreground'}`}>
                          Receipt {category.requires_receipt ? 'required' : 'not required'} {category.receipt_threshold && category.requires_receipt && `(>$${category.receipt_threshold})`}
                        </div>

                        <div className={`text-xs ${category.requires_manager_approval ? 'text-action-view' : 'text-muted-foreground'}`}>
                          Manager approval {category.requires_manager_approval ? 'required' : 'not required'}
                        </div>

                        <div className="text-xs text-destructive">
                          Policy limit: ${category.policy_limit || 0}
                        </div>

                        {category.ai_keywords.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Keywords: {category.ai_keywords.slice(0, 3).join(', ')}
                            {category.ai_keywords.length > 3 && '...'}
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
        title="Delete Category"
        message={`Are you sure you want to delete the category "${deleteConfirmation.category?.category_name}"? This action cannot be undone and may affect existing expense claims.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={deleteConfirmation.isLoading}
      />

      {/* Category Form Modal */}
      <CategoryFormModal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false)
          setEditingCategory(null)
          setError(null)
          setSuccess(null)
        }}
        onSubmit={handleFormSubmit}
        editingCategory={editingCategory}
        isLoading={saveCategoryMutation.isPending}
        error={error}
      />
    </div>
  )
}