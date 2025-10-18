'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Plus, Eye, Edit, Trash2, RefreshCw, Calendar, Building, DollarSign, ChevronLeft, ChevronRight, X } from 'lucide-react'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import StatusSelector from './StatusSelector'
import { AccountingEntry, TransactionType } from '@/domains/accounting-entries/types'
import { formatCurrency, getAccountingEntryTypeColor, getAccountingEntryTypeIcon } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { useExpenseCategories } from '@/domains/expense-claims/hooks/use-expense-categories'
import { useCOGSCategories } from '@/lib/hooks/accounting/use-cogs-categories'

interface AccountingEntriesListProps {
  transactions: AccountingEntry[]
  totalTransactions?: number // Total count in user's account (unfiltered)
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onView: (transaction: AccountingEntry) => void
  onEdit: (transaction: AccountingEntry) => void
  onDelete: (accountingEntryId: string) => void
}

export default function AccountingEntriesList({
  transactions,
  totalTransactions,
  isLoading,
  error,
  onRefresh,
  onView,
  onEdit,
  onDelete
}: AccountingEntriesListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    transaction: AccountingEntry | null
    isLoading: boolean
  }>({
    isOpen: false,
    transaction: null,
    isLoading: false
  })

  // Dynamic category hooks - same as edit form
  const { categories: expenseCategories } = useExpenseCategories()
  const { categories: cogsCategories } = useCOGSCategories()

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Format category name - supports both dynamic categories and hardcoded ones - same logic as edit form
  const formatCategoryName = (categoryCode: string, accountingEntryType?: TransactionType) => {
    if (!categoryCode) return 'Unknown Category'

    if (accountingEntryType === 'Cost of Goods Sold') {
      const cogsCategory = cogsCategories.find(cat => cat.category_code === categoryCode)
      return cogsCategory ? cogsCategory.category_name : categoryCode
    } else if (accountingEntryType === 'Expense') {
      const expenseCategory = expenseCategories.find(cat => cat.category_code === categoryCode)
      return expenseCategory ? expenseCategory.category_name : categoryCode
    } else {
      // Fallback to formatted hardcoded category names for Income and other types
      return categoryCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  const handleDeleteClick = useCallback((transaction: AccountingEntry) => {
    setDeleteConfirmation({
      isOpen: true,
      transaction,
      isLoading: false
    })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmation.transaction) return

    setDeleteConfirmation(prev => ({ ...prev, isLoading: true }))

    try {
      await onDelete(deleteConfirmation.transaction.id)
      setDeleteConfirmation({
        isOpen: false,
        transaction: null,
        isLoading: false
      })
    } catch (error) {
      // Keep dialog open on error, just stop loading
      setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))
    }
  }, [deleteConfirmation.transaction, onDelete])

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmation({
      isOpen: false,
      transaction: null,
      isLoading: false
    })
  }, [])

  const filteredTransactions = transactions.filter(transaction => {
    // Enhanced search: includes descriptions, vendor names, reference numbers, and line items
    const matchesSearch = !searchQuery ||
      transaction.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.reference_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.line_items?.some(item =>
        (item.item_description || '').toLowerCase().includes(searchQuery.toLowerCase())
      )

    const matchesCategory = !selectedCategory || transaction.category === selectedCategory
    const matchesType = !selectedType || transaction.transaction_type === selectedType

    // Date range filtering
    const transactionDate = new Date(transaction.transaction_date)
    const fromDate = dateFrom ? new Date(dateFrom) : null
    const toDate = dateTo ? new Date(dateTo) : null

    const matchesDateFrom = !fromDate || transactionDate >= fromDate
    const matchesDateTo = !toDate || transactionDate <= toDate

    return matchesSearch && matchesCategory && matchesType && matchesDateFrom && matchesDateTo
  })

  // Dynamic categories based on selected transaction type
  const getDynamicCategories = () => {
    if (selectedType === 'Expense') {
      return expenseCategories.map(cat => ({
        code: cat.category_code,
        name: cat.category_name
      }))
    } else if (selectedType === 'Cost of Goods Sold') {
      return cogsCategories.map(cat => ({
        code: cat.category_code,
        name: cat.category_name
      }))
    } else {
      // For Income or when no type is selected, show all unique categories from transactions
      return [...new Set(transactions.map(t => t.category))].map(category => ({
        code: category,
        name: formatCategoryName(category)
      }))
    }
  }

  const dynamicCategories = getDynamicCategories()
  const accountingEntryTypes = ['Income', 'Cost of Goods Sold', 'Expense']

  // Detect if any filters are active
  const hasActiveFilters = !!(searchQuery || selectedCategory || selectedType || dateFrom || dateTo)

  // Generate appropriate results summary text
  const generateResultsSummary = () => {
    const displayedStart = startIndex + 1
    const displayedEnd = Math.min(endIndex, filteredTransactions.length)
    const filteredCount = filteredTransactions.length
    const totalCount = totalTransactions || transactions.length

    if (!hasActiveFilters) {
      // No filters active - show simple total display
      return `Displaying ${displayedStart}-${displayedEnd} of ${totalCount} total transactions`
    } else {
      // Filters active - show filtered vs total context
      if (filteredCount === totalCount) {
        // All transactions match filters
        return `Displaying ${displayedStart}-${displayedEnd} of ${totalCount} transactions`
      } else {
        // Some transactions filtered out
        return `Displaying ${displayedStart}-${displayedEnd} of ${filteredCount} matching transactions (filtered from ${totalCount} total)`
      }
    }
  }

  // Generate active filter pills for display
  const getActiveFilters = () => {
    const filters: Array<{ label: string; value: string; onRemove: () => void }> = []

    if (searchQuery) {
      filters.push({
        label: 'Search',
        value: searchQuery,
        onRemove: () => setSearchQuery('')
      })
    }

    if (selectedCategory) {
      // Find a transaction with this category to get its type for proper formatting
      const sampleTransaction = transactions.find(t => t.category === selectedCategory)
      const categoryLabel = sampleTransaction ?
        formatCategoryName(selectedCategory, sampleTransaction.transaction_type) :
        formatCategoryName(selectedCategory)

      filters.push({
        label: 'Category',
        value: categoryLabel,
        onRemove: () => setSelectedCategory('')
      })
    }

    if (selectedType) {
      filters.push({
        label: 'Type',
        value: formatCategoryName(selectedType),
        onRemove: () => setSelectedType('')
      })
    }

    if (dateFrom) {
      filters.push({
        label: 'From',
        value: new Date(dateFrom).toLocaleDateString(),
        onRemove: () => setDateFrom('')
      })
    }

    if (dateTo) {
      filters.push({
        label: 'To',
        value: new Date(dateTo).toLocaleDateString(),
        onRemove: () => setDateTo('')
      })
    }

    return filters
  }

  // Pagination calculations
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex)

  // Reset to first page when filters change
  const resetPagination = () => setCurrentPage(1)

  // Handle items per page change
  const handleItemsPerPageChange = useCallback((newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }, [])

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategory, selectedType, dateFrom, dateTo])

  // Clear selected category when transaction type changes to avoid invalid combinations
  useEffect(() => {
    setSelectedCategory('')
  }, [selectedType])

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Error Loading Transactions</h3>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={onRefresh}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="space-y-4">
          {/* First Row: Search, Category, Type */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search transactions, vendors, line items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {dynamicCategories.map(category => (
                <option key={category.code} value={category.code}>
                  {category.name}
                </option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              {accountingEntryTypes.map(type => (
                <option key={type} value={type}>
                  {formatCategoryName(type)}
                </option>
              ))}
            </select>
          </div>

          {/* Second Row: Date Range and Refresh */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Date Range */}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Date Range:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="From"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="To"
              />
            </div>

            <div className="flex-1"></div>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Active Filter Pills */}
      {hasActiveFilters && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Active filters:</span>
            {getActiveFilters().map((filter, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 bg-blue-600/20 text-blue-300 px-2 py-1 rounded-full text-xs border border-blue-600/30"
              >
                <span className="text-gray-400">{filter.label}:</span>
                <span>{filter.value}</span>
                <button
                  onClick={filter.onRemove}
                  className="ml-1 hover:bg-blue-600/30 rounded-full p-0.5 transition-colors"
                  title={`Remove ${filter.label} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('')
                setSelectedType('')
                setDateFrom('')
                setDateTo('')
                resetPagination()
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors ml-2"
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Results Summary and Pagination Controls */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <div className="flex items-center gap-4">
          <span>
            {generateResultsSummary()}
          </span>
          <div className="flex items-center gap-2">
            <span>Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
            <span>per page</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(searchQuery || selectedCategory || selectedType || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('')
                setSelectedType('')
                setDateFrom('')
                setDateTo('')
                resetPagination()
              }}
              className="text-blue-400 hover:text-blue-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions List */}
      {isLoading ? (
        <SkeletonLoader variant="list" count={6} />
      ) : filteredTransactions.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {transactions.length === 0 ? 'No Transactions Yet' : 'No Results Found'}
            </h3>
            <p className="text-gray-400 mb-4">
              {transactions.length === 0
                ? 'Start by creating your first transaction or uploading financial documents.'
                : 'Try adjusting your search criteria or clearing filters.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center justify-between">
                {/* Left Side - Transaction Info */}
                <div className="flex items-center gap-4">
                  <div className="text-2xl">
                    {getAccountingEntryTypeIcon(transaction.transaction_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-white truncate">
                        {transaction.description}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${getAccountingEntryTypeColor(transaction.transaction_type)}`}>
                        {transaction.transaction_type}
                      </span>
                      <StatusSelector
                        accountingEntryId={transaction.id}
                        currentStatus={transaction.status || 'pending'}
                        onStatusUpdate={() => {
                          // Optimistically update the transaction in the parent component
                          onRefresh()
                        }}
                      />
                      {/* Show source document type tag based on polymorphic source */}
                      {transaction.source_document_type === 'invoice' && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-600/20 text-green-400 border border-green-600/30">
                          Invoice
                        </span>
                      )}
                      {transaction.source_document_type === 'expense_claim' && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-600/20 text-blue-400 border border-blue-600/30">
                          Expense
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(transaction.transaction_date)}
                      </span>
                      
                      {transaction.vendor_name && (
                        <span className="flex items-center gap-1">
                          <Building className="w-3 h-3" />
                          {transaction.vendor_name}
                        </span>
                      )}
                      
                      <span className="flex items-center gap-1">
                        <span className="text-gray-500 text-xs">
                          {formatCategoryName(transaction.category, transaction.transaction_type)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side - Amount and Actions */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getAccountingEntryTypeColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type === 'Expense' && '-'}
                      {formatCurrency(transaction.original_amount, transaction.original_currency)}
                    </div>
                    {transaction.home_currency_amount &&
                     transaction.original_currency !== transaction.home_currency &&
                     parseFloat(transaction.home_currency_amount.toString()) !== parseFloat(transaction.original_amount.toString()) && (
                      <div className="text-sm text-gray-400">
                        ≈ {formatCurrency(transaction.home_currency_amount, transaction.home_currency)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onView(transaction)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => onEdit(transaction)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                      title="Edit Transaction"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => handleDeleteClick(transaction)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
                      title="Delete Transaction"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Navigation */}
      {filteredTransactions.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="text-sm text-gray-400">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      pageNum === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-600'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Transaction"
        message={
          deleteConfirmation.transaction
            ? `Are you sure you want to delete this ${deleteConfirmation.transaction.transaction_type}? This action cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={deleteConfirmation.isLoading}
      />
    </div>
  )
}