'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Plus, Eye, Edit, Trash2, RefreshCw, Calendar, Building, DollarSign, ChevronLeft, ChevronRight, X } from 'lucide-react'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import StatusSelector from './StatusSelector'
import type { AccountingEntry } from '@/domains/accounting-entries/lib/data-access'
import type { TransactionType, SupportedCurrency } from '@/domains/accounting-entries/types'
import type { TransactionStatus } from '@/domains/accounting-entries/constants/transaction-status'
import { formatCurrency, getAccountingEntryTypeColor, getAccountingEntryTypeIcon } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { useExpenseCategories } from '@/domains/expense-claims/hooks/use-expense-categories'
import { useCOGSCategories } from '@/lib/hooks/accounting/use-cogs-categories'
import { formatBusinessDate, formatTimestamp } from '@/lib/utils'

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

  // CRITICAL: Use formatBusinessDate for transaction_date (business date - no timezone conversion)
  // Use formatTimestamp for created_at, processed_at (system timestamps - local timezone OK)
  const formatDate = (dateString: string) => formatBusinessDate(dateString)

  // Format category name - supports both dynamic categories and hardcoded ones - same logic as edit form
  const formatCategoryName = (categoryId: string, accountingEntryType?: TransactionType) => {
    if (!categoryId) return 'Unknown Category'

    if (accountingEntryType === 'Cost of Goods Sold') {
      const cogsCategory = cogsCategories.find(cat => cat.id === categoryId)
      return cogsCategory ? cogsCategory.category_name : categoryId
    } else if (accountingEntryType === 'Expense') {
      const expenseCategory = expenseCategories.find(cat => cat.id === categoryId)
      return expenseCategory ? expenseCategory.category_name : categoryId
    } else {
      // Fallback to formatted hardcoded category names for Income and other types
      return categoryId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
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
        code: cat.id,
        name: cat.category_name
      }))
    } else if (selectedType === 'Cost of Goods Sold') {
      return cogsCategories.map(cat => ({
        code: cat.id,
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
        formatCategoryName(selectedCategory, sampleTransaction.transaction_type as TransactionType) :
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
      <div className="bg-record-layer-1 border border-record-border rounded-lg p-card-padding">
        <div className="text-center">
          <div className="w-16 h-16 bg-danger/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-xl font-semibold text-record-title mb-2">Error Loading Transactions</h3>
          <p className="text-record-supporting mb-4">{error}</p>
          <Button onClick={onRefresh} variant="primary">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-section-gap">
      {/* Filters */}
      <div className="bg-record-layer-2 border border-record-border rounded-lg p-card-padding">
        <div className="space-y-4">
          {/* First Row: Search, Category, Type */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                placeholder="Search transactions, vendors, line items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            {/* Date Range */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Date Range:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="From"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="To"
              />
            </div>

            <div className="flex-1"></div>

            {/* Refresh Button */}
            <Button
              onClick={onRefresh}
              disabled={isLoading}
              variant="default"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Active Filter Pills */}
      {hasActiveFilters && (
        <div className="bg-muted/50 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {getActiveFilters().map((filter, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 bg-primary/20 text-primary px-2 py-1 rounded-full text-xs border border-primary/30"
              >
                <span className="text-muted-foreground">{filter.label}:</span>
                <span>{filter.value}</span>
                <button
                  onClick={filter.onRemove}
                  className="ml-1 hover:bg-primary/30 rounded-full p-0.5 transition-colors"
                  title={`Remove ${filter.label} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <Button
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('')
                setSelectedType('')
                setDateFrom('')
                setDateTo('')
                resetPagination()
              }}
              variant="ghost"
              size="sm"
              className="text-xs ml-2"
            >
              Clear all filters
            </Button>
          </div>
        </div>
      )}

      {/* Results Summary and Pagination Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-record-supporting">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="text-xs sm:text-sm">
            {generateResultsSummary()}
          </span>
          <div className="flex items-center gap-2">
            <span>Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 bg-background border border-input rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
            <Button
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('')
                setSelectedType('')
                setDateFrom('')
                setDateTo('')
                resetPagination()
              }}
              variant="ghost"
              size="sm"
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Transactions List */}
      {isLoading ? (
        <SkeletonLoader variant="list" count={6} />
      ) : filteredTransactions.length === 0 ? (
        <div className="bg-record-layer-1 border border-record-border rounded-lg p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-record-supporting" />
            </div>
            <h3 className="text-xl font-semibold text-record-title mb-2">
              {transactions.length === 0 ? 'No Transactions Yet' : 'No Results Found'}
            </h3>
            <p className="text-record-supporting mb-4">
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
              className="bg-record-layer-1 border border-record-border hover:bg-record-hover hover:border-record-border-hover rounded-lg p-4 transition-all duration-200"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* Left Side - Transaction Info */}
                <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                  <div className="text-2xl flex-shrink-0">
                    {getAccountingEntryTypeIcon(transaction.transaction_type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-record-title truncate text-sm sm:text-base">
                        {transaction.description}
                      </h3>
                      <div className="badge-info-metadata inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors capitalize">
                        {transaction.transaction_type}
                      </div>
                      <StatusSelector
                        accountingEntryId={transaction.id}
                        currentStatus={(transaction.status || 'pending') as TransactionStatus}
                        onStatusUpdate={() => {
                          // Optimistically update the transaction in the parent component
                          onRefresh()
                        }}
                      />
                      {/* Show source document type tag based on polymorphic source */}
                      {transaction.source_document_type === 'invoice' && (
                        <div className="badge-info-metadata inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors">
                          Invoice
                        </div>
                      )}
                      {transaction.source_document_type === 'expense_claim' && (
                        <div className="badge-success-status inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors">
                          Expense
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-record-supporting flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(transaction.transaction_date)}
                      </span>

                      {transaction.vendor_name && (
                        <span className="flex items-center gap-1 truncate max-w-[120px] sm:max-w-none">
                          <Building className="w-3 h-3 flex-shrink-0" />
                          {transaction.vendor_name}
                        </span>
                      )}

                      <span className="flex items-center gap-1">
                        <span className="text-record-supporting-light text-xs">
                          {formatCategoryName(transaction.category, transaction.transaction_type as TransactionType)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side - Amount and Actions */}
                <div className="flex items-center gap-3 sm:gap-4 ml-9 sm:ml-0">
                  <div className="text-left sm:text-right">
                    <div className="text-base sm:text-lg font-bold text-record-title">
                      {transaction.transaction_type === 'Expense' && '-'}
                      {formatCurrency(transaction.original_amount, transaction.original_currency as SupportedCurrency)}
                    </div>
                    {transaction.home_currency_amount &&
                     transaction.original_currency !== transaction.home_currency &&
                     parseFloat(transaction.home_currency_amount.toString()) !== parseFloat(transaction.original_amount.toString()) && (
                      <div className="text-sm text-record-supporting">
                        ≈ {formatCurrency(transaction.home_currency_amount, transaction.home_currency as SupportedCurrency)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="view"
                      size="sm"
                      onClick={() => onView(transaction)}
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onEdit(transaction)}
                      title="Edit Transaction"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteClick(transaction)}
                      title="Delete Transaction"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Navigation */}
      {filteredTransactions.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between bg-record-layer-1 border border-record-border rounded-lg p-4">
          <div className="text-sm text-record-supporting">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

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
                  <Button
                    key={pageNum}
                    variant={pageNum === currentPage ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
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