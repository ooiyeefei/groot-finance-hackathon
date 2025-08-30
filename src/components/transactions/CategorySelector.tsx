'use client'

import { useState } from 'react'
import { Check, ChevronDown, Tag } from 'lucide-react'

interface CategorySelectorProps {
  transactionId: string
  currentCategory: string | null
  transactionType: 'income' | 'expense' | 'transfer' | 'asset' | 'liability' | 'equity'
  onCategoryUpdate?: (newCategory: string) => void
  className?: string
}

interface CategoryOption {
  value: string
  label: string
  group: string
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  // Income categories
  { value: 'operating_revenue', label: 'Operating Revenue', group: 'Income' },
  { value: 'other_income', label: 'Other Income', group: 'Income' },
  { value: 'investment_income', label: 'Investment Income', group: 'Income' },
  { value: 'government_grants', label: 'Government Grants', group: 'Income' },
  
  // Expense categories (organized by business function)
  { value: 'cost_of_goods_sold', label: 'Cost of Goods Sold', group: 'Direct Expenses' },
  
  { value: 'administrative_expenses', label: 'Administrative Expenses', group: 'Operating Expenses' },
  { value: 'marketing_advertising', label: 'Marketing & Advertising', group: 'Operating Expenses' },
  { value: 'travel_entertainment', label: 'Travel & Entertainment', group: 'Operating Expenses' },
  { value: 'utilities_communications', label: 'Utilities & Communications', group: 'Operating Expenses' },
  { value: 'rent_facilities', label: 'Rent & Facilities', group: 'Operating Expenses' },
  { value: 'insurance', label: 'Insurance', group: 'Operating Expenses' },
  { value: 'taxes_licenses', label: 'Taxes & Licenses', group: 'Operating Expenses' },
  { value: 'software_subscriptions', label: 'Software & Subscriptions', group: 'Operating Expenses' },
  { value: 'professional_services', label: 'Professional Services', group: 'Operating Expenses' },
  { value: 'other_operating', label: 'Other Operating Expenses', group: 'Operating Expenses' },
  
  { value: 'depreciation', label: 'Depreciation', group: 'Non-Operating Expenses' },
  { value: 'interest_expense', label: 'Interest Expense', group: 'Non-Operating Expenses' },
  
  // Legacy support
  { value: 'General Expenses', label: 'General Expenses (Legacy)', group: 'Legacy' },
  { value: 'General Income', label: 'General Income (Legacy)', group: 'Legacy' },
  { value: 'Other', label: 'Other', group: 'Legacy' }
]

export default function CategorySelector({
  transactionId,
  currentCategory,
  transactionType,
  onCategoryUpdate,
  className = ''
}: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Filter categories based on transaction type
  const getFilteredCategories = () => {
    if (transactionType === 'income') {
      return CATEGORY_OPTIONS.filter(opt => 
        opt.group === 'Income' || opt.value === 'General Income' || opt.value === 'Other'
      )
    } else if (transactionType === 'expense') {
      return CATEGORY_OPTIONS.filter(opt => 
        opt.group !== 'Income' || opt.value === 'General Expenses' || opt.value === 'Other'
      )
    } else {
      // For other transaction types, show all categories
      return CATEGORY_OPTIONS
    }
  }

  const filteredCategories = getFilteredCategories()

  // Group categories for better UX
  const groupedCategories = filteredCategories.reduce((groups, category) => {
    const group = category.group
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(category)
    return groups
  }, {} as Record<string, CategoryOption[]>)

  const currentCategoryLabel = CATEGORY_OPTIONS.find(
    opt => opt.value === currentCategory
  )?.label || currentCategory || 'Select Category'

  const handleCategorySelect = async (newCategory: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/transactions/${transactionId}/category`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category: newCategory }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update category')
      }

      const result = await response.json()
      console.log('Category updated successfully:', result)
      
      // Call parent callback if provided
      onCategoryUpdate?.(newCategory)
      
      setIsOpen(false)
    } catch (error) {
      console.error('Error updating category:', error)
      alert(error instanceof Error ? error.message : 'Failed to update category')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Category Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Tag className="w-4 h-4 text-gray-400" />
        <span className="text-gray-200 max-w-32 truncate">
          {isLoading ? 'Updating...' : currentCategoryLabel}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
          {Object.entries(groupedCategories).map(([groupName, categories]) => (
            <div key={groupName}>
              {/* Group Header */}
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 bg-gray-750 border-b border-gray-700">
                {groupName}
              </div>
              
              {/* Group Options */}
              {categories.map((category) => (
                <button
                  key={category.value}
                  onClick={() => handleCategorySelect(category.value)}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <span className="truncate">{category.label}</span>
                  {currentCategory === category.value && (
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          ))}
          
          {/* Close button */}
          <div className="border-t border-gray-700">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Click outside overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}