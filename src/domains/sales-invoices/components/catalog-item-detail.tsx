'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import SalesHistoryTab from './sales-history-tab'
import PurchaseHistoryTab from './purchase-history-tab'
import PriceComparisonTab from './price-comparison-tab'
import type { Id } from '../../../../convex/_generated/dataModel'

type TabId = 'overview' | 'sales' | 'purchase' | 'comparison'

export default function CatalogItemDetail() {
  const router = useRouter()
  const params = useParams()
  const itemId = params.itemId as string
  const locale = useLocale()
  const { businessId } = useActiveBusiness()

  const [activeTab, setActiveTab] = useState<TabId>('sales')

  const catalogItem = useQuery(
    api.functions.catalogItems.getById,
    businessId ? { id: itemId as Id<"catalog_items">, businessId: businessId as Id<"businesses"> } : "skip"
  )

  if (catalogItem === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (catalogItem === null) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground">Catalog item not found</h3>
        <Button
          onClick={() => router.push(`/${locale}/sales-invoices/catalog`)}
          className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Back to Catalog
        </Button>
      </div>
    )
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'sales', label: 'Sales History' },
    { id: 'purchase', label: 'Purchase History' },
    { id: 'comparison', label: 'Price Comparison' },
    { id: 'overview', label: 'Overview' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          onClick={() => router.push(`/${locale}/sales-invoices/catalog`)}
          className="bg-secondary hover:bg-secondary/80 text-secondary-foreground h-9 px-3"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{catalogItem.name}</h1>
            <Badge className={
              catalogItem.status === 'active'
                ? 'bg-green-500/10 text-green-600 border border-green-500/30'
                : 'bg-muted text-muted-foreground border border-border'
            }>
              {catalogItem.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-muted-foreground text-sm">
            {catalogItem.sku && <span>SKU: {catalogItem.sku}</span>}
            {catalogItem.category && <span>Category: {catalogItem.category}</span>}
            <span>Current Price: {formatCurrency(catalogItem.unitPrice, catalogItem.currency)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'sales' && (
        <SalesHistoryTab
          catalogItemId={itemId as Id<"catalog_items">}
          currency={catalogItem.currency}
        />
      )}

      {activeTab === 'purchase' && (
        <PurchaseHistoryTab
          catalogItemId={itemId as Id<"catalog_items">}
          currency={catalogItem.currency}
        />
      )}

      {activeTab === 'comparison' && (
        <PriceComparisonTab
          catalogItemId={itemId as Id<"catalog_items">}
          currency={catalogItem.currency}
        />
      )}

      {activeTab === 'overview' && (
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-foreground font-medium">Item Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                <p className="text-foreground">{catalogItem.name}</p>
              </div>
              {catalogItem.description && (
                <div>
                  <span className="text-muted-foreground">Description</span>
                  <p className="text-foreground">{catalogItem.description}</p>
                </div>
              )}
              {catalogItem.sku && (
                <div>
                  <span className="text-muted-foreground">SKU</span>
                  <p className="text-foreground">{catalogItem.sku}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Unit Price</span>
                <p className="text-foreground">{formatCurrency(catalogItem.unitPrice, catalogItem.currency)}</p>
              </div>
              {catalogItem.taxRate !== undefined && (
                <div>
                  <span className="text-muted-foreground">Tax Rate</span>
                  <p className="text-foreground">{catalogItem.taxRate}%</p>
                </div>
              )}
              {catalogItem.category && (
                <div>
                  <span className="text-muted-foreground">Category</span>
                  <p className="text-foreground">{catalogItem.category}</p>
                </div>
              )}
              {catalogItem.glCode && (
                <div>
                  <span className="text-muted-foreground">GL Code</span>
                  <p className="text-foreground">{catalogItem.glCode}</p>
                </div>
              )}
              {catalogItem.source && (
                <div>
                  <span className="text-muted-foreground">Source</span>
                  <p className="text-foreground">{catalogItem.source === 'stripe' ? 'Stripe' : 'Manual'}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
