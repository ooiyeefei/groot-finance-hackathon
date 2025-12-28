'use client'

/**
 * InvoiceList Component
 *
 * Displays invoice history fetched from Stripe.
 * Provides download links for PDF invoices.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, ExternalLink, Loader2, RefreshCw, Receipt } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Invoice {
  id: string
  number: string | null
  status: string
  amount: number
  currency: string
  created: string
  dueDate: string | null
  paidAt: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  description: string | null
  periodStart: string | null
  periodEnd: string | null
}

interface InvoiceListProps {
  /** Maximum invoices to show initially */
  limit?: number
  /** Show compact version without card wrapper */
  compact?: boolean
}

export default function InvoiceList({ limit = 10, compact = false }: InvoiceListProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const fetchInvoices = useCallback(async (startingAfter?: string) => {
    // Wait for auth to be ready
    if (!isLoaded || !isSignedIn) {
      return
    }

    try {
      const isLoadMore = !!startingAfter
      if (isLoadMore) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }
      setError(null)

      const params = new URLSearchParams({ limit: String(limit) })
      if (startingAfter) {
        params.set('starting_after', startingAfter)
      }

      const response = await fetch(`/api/v1/billing/invoices?${params}`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch invoices')
      }

      if (isLoadMore) {
        setInvoices(prev => [...prev, ...result.data.invoices])
      } else {
        setInvoices(result.data.invoices)
      }
      setHasMore(result.data.hasMore)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[InvoiceList] Error:', message)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [limit, isLoaded, isSignedIn])

  // Fetch on mount when auth is ready
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchInvoices()
    }
  }, [fetchInvoices, isLoaded, isSignedIn])

  const loadMore = () => {
    if (invoices.length > 0 && hasMore) {
      const lastInvoice = invoices[invoices.length - 1]
      fetchInvoices(lastInvoice.id)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
            Paid
          </Badge>
        )
      case 'open':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            Open
          </Badge>
        )
      case 'draft':
        return (
          <Badge className="bg-muted text-muted-foreground border border-border">
            Draft
          </Badge>
        )
      case 'void':
        return (
          <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            Void
          </Badge>
        )
      case 'uncollectible':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
            Uncollectible
          </Badge>
        )
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border border-border">
            {status}
          </Badge>
        )
    }
  }

  const formatAmount = (amount: number, currency: string) => {
    // Stripe amounts are in smallest currency unit (cents)
    const displayAmount = amount / 100
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(displayAmount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Loading state
  if (isLoading) {
    const loadingContent = (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )

    if (compact) return loadingContent

    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Invoice History</CardTitle>
          <CardDescription>Your past invoices and receipts</CardDescription>
        </CardHeader>
        <CardContent>{loadingContent}</CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    const errorContent = (
      <div className="flex items-center justify-between py-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchInvoices()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )

    if (compact) return errorContent

    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Invoice History</CardTitle>
        </CardHeader>
        <CardContent>{errorContent}</CardContent>
      </Card>
    )
  }

  // Empty state
  if (invoices.length === 0) {
    const emptyContent = (
      <div className="text-center py-8">
        <Receipt className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">No invoices yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Invoices will appear here after your first payment
        </p>
      </div>
    )

    if (compact) return emptyContent

    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Invoice History</CardTitle>
          <CardDescription>Your past invoices and receipts</CardDescription>
        </CardHeader>
        <CardContent>{emptyContent}</CardContent>
      </Card>
    )
  }

  // Invoice list content
  const listContent = (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <div
          key={invoice.id}
          className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">
                  {invoice.number || `Invoice ${invoice.id.slice(-8)}`}
                </span>
                {getStatusBadge(invoice.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDate(invoice.created)}
                {invoice.paidAt && (
                  <span className="ml-2">
                    • Paid {formatDistanceToNow(new Date(invoice.paidAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-foreground font-semibold">
              {formatAmount(invoice.amount, invoice.currency)}
            </span>

            <div className="flex items-center gap-2">
              {invoice.hostedInvoiceUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-muted-foreground hover:text-foreground"
                >
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View invoice"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              )}
              {invoice.invoicePdf && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-muted-foreground hover:text-foreground"
                >
                  <a
                    href={invoice.invoicePdf}
                    download
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Load More Button */}
      {hasMore && (
        <div className="text-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  )

  if (compact) return listContent

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Invoice History</CardTitle>
        <CardDescription>Your past invoices and receipts</CardDescription>
      </CardHeader>
      <CardContent>{listContent}</CardContent>
    </Card>
  )
}
