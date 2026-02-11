'use client'

import { lazy, Suspense, useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FileText, Send, Users, BarChart3, Package, Loader2 } from 'lucide-react'
import DocumentsContainer from './documents-container'

const SalesInvoiceList = lazy(
  () => import('@/domains/sales-invoices/components/sales-invoice-list')
)

const DebtorList = lazy(
  () => import('@/domains/sales-invoices/components/debtor-list')
)

const AgingReport = lazy(
  () => import('@/domains/sales-invoices/components/aging-report')
)

const CatalogItemManager = lazy(
  () => import('@/domains/sales-invoices/components/catalog-item-manager')
)

const VALID_TABS = ['incoming', 'sales', 'debtors', 'aging', 'catalog'] as const
type TabValue = (typeof VALID_TABS)[number]

function getTabFromHash(): TabValue {
  if (typeof window === 'undefined') return 'incoming'
  const hash = window.location.hash.replace('#', '')
  const mapping: Record<string, TabValue> = {
    'incoming-invoices': 'incoming',
    'sales-invoices': 'sales',
    'debtors': 'debtors',
    'aging-report': 'aging',
    'catalog': 'catalog',
  }
  return mapping[hash] || 'incoming'
}

function getHashFromTab(tab: TabValue): string {
  const mapping: Record<TabValue, string> = {
    incoming: 'incoming-invoices',
    sales: 'sales-invoices',
    debtors: 'debtors',
    aging: 'aging-report',
    catalog: 'catalog',
  }
  return mapping[tab]
}

const TabLoading = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
)

export default function InvoicesTabContainer() {
  const [activeTab, setActiveTab] = useState<TabValue>('incoming')

  // Read hash on mount and on hash changes
  useEffect(() => {
    setActiveTab(getTabFromHash())

    const onHashChange = () => setActiveTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const handleTabChange = (value: string) => {
    const tab = value as TabValue
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${getHashFromTab(tab)}`)
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="w-full justify-start border border-border bg-muted rounded-lg p-1 h-auto gap-1">
        <TabsTrigger
          value="incoming"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <FileText className="h-4 w-4" />
          Incoming Invoices
        </TabsTrigger>
        <TabsTrigger
          value="sales"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <Send className="h-4 w-4" />
          Sales Invoices
        </TabsTrigger>
        <TabsTrigger
          value="debtors"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <Users className="h-4 w-4" />
          Debtors
        </TabsTrigger>
        <TabsTrigger
          value="aging"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <BarChart3 className="h-4 w-4" />
          Aging Report
        </TabsTrigger>
        <TabsTrigger
          value="catalog"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <Package className="h-4 w-4" />
          Catalog
        </TabsTrigger>
      </TabsList>

      <TabsContent value="incoming" className="mt-4">
        <DocumentsContainer />
      </TabsContent>

      <TabsContent value="sales" className="mt-4">
        <Suspense fallback={<TabLoading />}>
          <SalesInvoiceList />
        </Suspense>
      </TabsContent>

      <TabsContent value="debtors" className="mt-4">
        <Suspense fallback={<TabLoading />}>
          <DebtorList />
        </Suspense>
      </TabsContent>

      <TabsContent value="aging" className="mt-4">
        <Suspense fallback={<TabLoading />}>
          <AgingReport />
        </Suspense>
      </TabsContent>

      <TabsContent value="catalog" className="mt-4">
        <Suspense fallback={<TabLoading />}>
          <CatalogItemManager />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}
