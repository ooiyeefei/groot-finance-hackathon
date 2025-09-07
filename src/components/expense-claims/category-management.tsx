/**
 * Expense Category Management Interface
 * Allows managers and finance users to create and manage custom expense categories
 */

'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Tag, DollarSign, AlertCircle, CheckCircle, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

interface ExpenseCategory {
  id: string
  category_name: string
  category_code: string
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

interface CategoryFormData {
  category_name: string
  category_code: string
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
}

interface CategoryManagementProps {
  userRole: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
}

export default function CategoryManagement({ userRole }: CategoryManagementProps) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState<CategoryFormData>({
    category_name: '',
    category_code: '',
    description: '',
    parent_category_id: '',
    ai_keywords: '',
    vendor_patterns: '',
    tax_treatment: 'deductible',
    requires_receipt: false,
    receipt_threshold: 0,
    policy_limit: 0,
    requires_manager_approval: true,
    sort_order: 99
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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
      const response = await fetch('/api/expense-categories')
      const result = await response.json()

      if (result.success) {
        setCategories(result.data.categories)
      } else {
        setError(result.error || 'Failed to fetch categories')
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
      setError('Network error while fetching categories')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      // Validate required fields
      if (!formData.category_name || !formData.category_code) {
        setError('Category name and code are required')
        return
      }

      const submitData = {
        ...formData,
        id: editingCategory?.id,
        ai_keywords: formData.ai_keywords.split(',').map(k => k.trim()).filter(k => k),
        vendor_patterns: formData.vendor_patterns.split(',').map(p => p.trim()).filter(p => p),
        receipt_threshold: formData.requires_receipt ? formData.receipt_threshold : null,
      }

      const method = editingCategory ? 'PUT' : 'POST'
      const response = await fetch('/api/expense-categories', {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(editingCategory ? 'Category updated successfully' : 'Category created successfully')
        setShowForm(false)
        setEditingCategory(null)
        resetForm()
        fetchCategories()
      } else {
        setError(result.error || 'Failed to save category')
      }
    } catch (error) {
      console.error('Failed to save category:', error)
      setError('Network error while saving category')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (category: ExpenseCategory) => {
    setEditingCategory(category)
    setFormData({
      category_name: category.category_name,
      category_code: category.category_code,
      description: category.description || '',
      parent_category_id: category.parent_category_id || '',
      ai_keywords: category.ai_keywords.join(', '),
      vendor_patterns: category.vendor_patterns.join(', '),
      tax_treatment: category.tax_treatment,
      requires_receipt: category.requires_receipt,
      receipt_threshold: category.receipt_threshold || 0,
      policy_limit: category.policy_limit || 0,
      requires_manager_approval: true,
      sort_order: category.sort_order
    })
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      category_name: '',
      category_code: '',
      description: '',
      parent_category_id: '',
      ai_keywords: '',
      vendor_patterns: '',
      tax_treatment: 'deductible',
      requires_receipt: false,
      receipt_threshold: 0,
      policy_limit: 0,
      requires_manager_approval: true,
      sort_order: 99
    })
    setEditingCategory(null)
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
          <Tag className="w-12 h-12 mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400">Category management is available for managers and finance users only.</p>
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
                <Tag className="w-5 h-5" />
                Expense Categories
              </CardTitle>
              <CardDescription className="text-gray-400">
                Manage expense categories for your organization
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowForm(true)}
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
              placeholder="Search categories..."
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
            <Alert className="bg-green-900/20 border-green-700">
              <CheckCircle className="w-4 h-4" />
              <AlertDescription className="text-green-400">{success}</AlertDescription>
            </Alert>
          )}

          {/* Categories List */}
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
              <p className="text-gray-400">Loading categories...</p>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8">
              <Tag className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <p className="text-gray-400">
                {searchQuery ? 'No categories match your search' : 'No categories found'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((category) => (
                <Card key={category.id} className="bg-gray-700 border-gray-600">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-white font-medium">{category.category_name}</h4>
                          <p className="text-blue-400 text-sm font-mono">{category.category_code}</p>
                          {category.description && (
                            <p className="text-gray-400 text-sm mt-1">{category.description}</p>
                          )}
                        </div>
                        {!category.is_active && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        {category.is_default && (
                          <Badge variant="outline" className="text-xs">Default</Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <DollarSign className="w-3 h-3" />
                          <span className="capitalize">{category.tax_treatment.replace('_', ' ')}</span>
                        </div>
                        
                        {category.requires_receipt && (
                          <div className="text-xs text-yellow-400">
                            Receipt required {category.receipt_threshold && `(>${category.receipt_threshold})`}
                          </div>
                        )}

                        {category.requires_manager_approval && (
                          <div className="text-xs text-orange-400">
                            Manager approval required
                          </div>
                        )}

                        {category.policy_limit && (
                          <div className="text-xs text-red-400">
                            Limit: ${category.policy_limit}
                          </div>
                        )}

                        {category.ai_keywords.length > 0 && (
                          <div className="text-xs text-gray-400">
                            Keywords: {category.ai_keywords.slice(0, 3).join(', ')}
                            {category.ai_keywords.length > 3 && '...'}
                          </div>
                        )}
                      </div>

                      {!category.is_default && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(category)}
                            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-600"
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Form Modal */}
      {showForm && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Configure expense category settings and auto-categorization rules
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category_name" className="text-white">Category Name *</Label>
                  <Input
                    id="category_name"
                    value={formData.category_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, category_name: e.target.value }))}
                    placeholder="e.g., Travel & Accommodation"
                    className="bg-gray-700 border-gray-600 text-white"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category_code" className="text-white">Category Code *</Label>
                  <Input
                    id="category_code"
                    value={formData.category_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, category_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g., TRAVEL"
                    className="bg-gray-700 border-gray-600 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description" className="text-white">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this category"
                  className="bg-gray-700 border-gray-600 text-white"
                  rows={2}
                />
              </div>

              {/* Auto-Categorization */}
              <div className="space-y-4">
                <Label className="text-white text-lg">Auto-Categorization Rules</Label>
                
                <div>
                  <Label htmlFor="ai_keywords" className="text-white">Keywords (comma-separated)</Label>
                  <Input
                    id="ai_keywords"
                    value={formData.ai_keywords}
                    onChange={(e) => setFormData(prev => ({ ...prev, ai_keywords: e.target.value }))}
                    placeholder="travel, hotel, flight, accommodation"
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                  <p className="text-gray-400 text-sm mt-1">
                    Keywords found in receipt descriptions will auto-categorize to this category
                  </p>
                </div>

                <div>
                  <Label htmlFor="vendor_patterns" className="text-white">Vendor Patterns (comma-separated)</Label>
                  <Input
                    id="vendor_patterns"
                    value={formData.vendor_patterns}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor_patterns: e.target.value }))}
                    placeholder="*airline*, *hotel*, booking.com"
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                  <p className="text-gray-400 text-sm mt-1">
                    Use * as wildcards. Vendor names matching these patterns will auto-categorize
                  </p>
                </div>
              </div>

              {/* Policy Configuration */}
              <div className="space-y-4">
                <Label className="text-white text-lg">Policy Settings</Label>
                
                <div>
                  <Label htmlFor="tax_treatment" className="text-white">Tax Treatment</Label>
                  <Select
                    value={formData.tax_treatment}
                    onValueChange={(value: 'deductible' | 'non_deductible' | 'partial') => 
                      setFormData(prev => ({ ...prev, tax_treatment: value }))
                    }
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
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
                  />
                  <Label htmlFor="requires_receipt" className="text-gray-300">
                    Requires receipt attachment
                  </Label>
                </div>

                {formData.requires_receipt && (
                  <div>
                    <Label htmlFor="receipt_threshold" className="text-white">Receipt Required Above Amount</Label>
                    <Input
                      id="receipt_threshold"
                      type="number"
                      step="0.01"
                      value={formData.receipt_threshold}
                      onChange={(e) => setFormData(prev => ({ ...prev, receipt_threshold: Number(e.target.value) }))}
                      placeholder="0.00"
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="policy_limit" className="text-white">Policy Limit (SGD)</Label>
                  <Input
                    id="policy_limit"
                    type="number"
                    step="0.01"
                    value={formData.policy_limit}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_limit: Number(e.target.value) }))}
                    placeholder="0.00 (0 = no limit)"
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requires_manager_approval"
                    checked={true}
                    disabled={true}
                  />
                  <Label htmlFor="requires_manager_approval" className="text-gray-500">
                    Always requires manager approval (enforced)
                  </Label>
                </div>

              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    resetForm()
                  }}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? (
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
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}