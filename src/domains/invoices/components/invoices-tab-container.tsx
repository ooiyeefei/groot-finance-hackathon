'use client'

import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  BarChart3,
  Send,
  Users,
  FileText,
  Package,
  Building,
  TrendingUp,
  ArrowRightLeft,
  Loader2,
  ClipboardList,
  Link2,
  ShieldCheck,
} from 'lucide-react'
import DocumentsContainer from './documents-container'

// AR sub-tab components (lazy-loaded)
const ARDashboard = lazy(
  () => import('@/domains/sales-invoices/components/ar-dashboard')
)
const SalesInvoiceList = lazy(
  () => import('@/domains/sales-invoices/components/sales-invoice-list')
)
const DebtorList = lazy(
  () => import('@/domains/sales-invoices/components/debtor-list')
)
const CatalogItemManager = lazy(
  () => import('@/domains/sales-invoices/components/catalog-item-manager')
)
const ARReconciliation = lazy(
  () => import('@/domains/sales-invoices/components/ar-reconciliation')
)
const EinvoiceDashboard = lazy(
  () => import('@/domains/sales-invoices/components/einvoice-dashboard')
)

// AP sub-tab components (lazy-loaded)
const APDashboard = lazy(
  () => import('@/domains/payables/components/ap-dashboard')
)
const VendorManager = lazy(
  () => import('@/domains/payables/components/vendor-manager')
)
const PriceIntelligence = lazy(
  () => import('@/domains/payables/components/price-intelligence')
)
const PurchaseOrdersTab = lazy(
  () => import('@/domains/payables/components/purchase-orders-tab')
)
const GoodsReceivedTab = lazy(
  () => import('@/domains/payables/components/goods-received-tab')
)
const MatchingTab = lazy(
  () => import('@/domains/payables/components/matching-tab')
)

// --- Types ---
type TopLevelTab = 'ar' | 'ap'
type ARSubTab = 'dashboard' | 'sales' | 'debtors' | 'catalog' | 'reconciliation' | 'einvoice-compliance'
type APSubTab = 'dashboard' | 'incoming' | 'vendors' | 'prices' | 'purchase-orders' | 'goods-received' | 'matching'

const AR_SUB_TABS: readonly ARSubTab[] = ['dashboard', 'sales', 'debtors', 'catalog', 'reconciliation', 'einvoice-compliance']
const AP_SUB_TABS: readonly APSubTab[] = ['dashboard', 'incoming', 'vendors', 'prices', 'purchase-orders', 'goods-received', 'matching']


// --- URL query param routing (?tab=ar&sub=sales) ---
// Also supports legacy hash format (#ar-sales) for backwards compatibility
function parseTabParams(searchParams: URLSearchParams): { topLevel: TopLevelTab; subTab: string } {
  const tab = searchParams.get('tab')
  const sub = searchParams.get('sub')

  if (tab === 'ar' || tab === 'ap') {
    const subTabs = tab === 'ar' ? AR_SUB_TABS : AP_SUB_TABS
    const validSub = sub && (subTabs as readonly string[]).includes(sub) ? sub : 'dashboard'
    return { topLevel: tab, subTab: validSub }
  }

  // Legacy hash support: #ar-sales → tab=ar&sub=sales
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '')
    if (hash) {
      const dashIndex = hash.indexOf('-')
      if (dashIndex !== -1) {
        const prefix = hash.substring(0, dashIndex)
        const suffix = hash.substring(dashIndex + 1)
        if (prefix === 'ar' && (AR_SUB_TABS as readonly string[]).includes(suffix)) {
          return { topLevel: 'ar', subTab: suffix }
        }
        if (prefix === 'ap' && (AP_SUB_TABS as readonly string[]).includes(suffix)) {
          return { topLevel: 'ap', subTab: suffix }
        }
      }
    }
  }

  return { topLevel: 'ar', subTab: 'dashboard' }
}

const TabLoading = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
)

const subTriggerClassName =
  'flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm whitespace-nowrap'

const topTriggerClassName =
  'flex items-center gap-2 px-6 py-3 rounded-md text-muted-foreground font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm whitespace-nowrap'

export default function InvoicesTabContainer() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [topLevel, setTopLevel] = useState<TopLevelTab>('ar')
  const [arSubTab, setArSubTab] = useState<ARSubTab>('dashboard')
  const [apSubTab, setApSubTab] = useState<APSubTab>('dashboard')

  // Sync from URL on mount
  useEffect(() => {
    const { topLevel: tl, subTab } = parseTabParams(searchParams)
    setTopLevel(tl)
    if (tl === 'ar') setArSubTab(subTab as ARSubTab)
    else setApSubTab(subTab as APSubTab)
  }, [searchParams])

  const updateUrl = useCallback((tab: TopLevelTab, sub: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    params.set('sub', sub)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  const handleTopLevelChange = (value: string) => {
    const tl = value as TopLevelTab
    setTopLevel(tl)
    const sub = tl === 'ar' ? arSubTab : apSubTab
    updateUrl(tl, sub)
  }

  const handleArSubTabChange = (value: string) => {
    const sub = value as ARSubTab
    setArSubTab(sub)
    updateUrl('ar', sub)
  }

  const handleApSubTabChange = (value: string) => {
    const sub = value as APSubTab
    setApSubTab(sub)
    updateUrl('ap', sub)
  }

  return (
    <div className="w-full space-y-4">
      {/* Top-Level Tabs: AR / AP */}
      <Tabs value={topLevel} onValueChange={handleTopLevelChange}>
        <TabsList className="w-full justify-start border border-border bg-muted rounded-lg p-1 h-auto gap-1">
          <TabsTrigger value="ar" className={topTriggerClassName}>
            Account Receivables
          </TabsTrigger>
          <TabsTrigger value="ap" className={topTriggerClassName}>
            Account Payables
          </TabsTrigger>
        </TabsList>

        {/* AR Sub-tabs */}
        <TabsContent value="ar" className="mt-4">
          <Tabs value={arSubTab} onValueChange={handleArSubTabChange}>
            <TabsList className="w-full justify-start border border-border bg-muted rounded-lg p-1 h-auto gap-1 overflow-x-auto">
              <TabsTrigger value="dashboard" className={subTriggerClassName}>
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="sales" className={subTriggerClassName}>
                <Send className="h-4 w-4" />
                Sales Invoices
              </TabsTrigger>
              <TabsTrigger value="debtors" className={subTriggerClassName}>
                <Users className="h-4 w-4" />
                Debtors
              </TabsTrigger>
              <TabsTrigger value="catalog" className={subTriggerClassName}>
                <Package className="h-4 w-4" />
                Product Catalog
              </TabsTrigger>
              <TabsTrigger value="reconciliation" className={subTriggerClassName}>
                <ArrowRightLeft className="h-4 w-4" />
                Reconciliation
              </TabsTrigger>
              <TabsTrigger value="einvoice-compliance" className={subTriggerClassName}>
                <ShieldCheck className="h-4 w-4" />
                E-Invoice Compliance
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <ARDashboard />
              </Suspense>
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

            <TabsContent value="catalog" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <CatalogItemManager />
              </Suspense>
            </TabsContent>

            <TabsContent value="reconciliation" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <ARReconciliation />
              </Suspense>
            </TabsContent>

            <TabsContent value="einvoice-compliance" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <EinvoiceDashboard />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* AP Sub-tabs */}
        <TabsContent value="ap" className="mt-4">
          <Tabs value={apSubTab} onValueChange={handleApSubTabChange}>
            <TabsList className="w-full justify-start border border-border bg-muted rounded-lg p-1 h-auto gap-1 overflow-x-auto">
              <TabsTrigger value="dashboard" className={subTriggerClassName}>
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="incoming" className={subTriggerClassName}>
                <FileText className="h-4 w-4" />
                Incoming Invoices
              </TabsTrigger>
              <TabsTrigger value="vendors" className={subTriggerClassName}>
                <Building className="h-4 w-4" />
                Vendors
              </TabsTrigger>
              <TabsTrigger value="prices" className={subTriggerClassName}>
                <TrendingUp className="h-4 w-4" />
                Price Intelligence
              </TabsTrigger>
              <TabsTrigger value="purchase-orders" className={subTriggerClassName}>
                <ClipboardList className="h-4 w-4" />
                Purchase Orders
              </TabsTrigger>
              <TabsTrigger value="goods-received" className={subTriggerClassName}>
                <Package className="h-4 w-4" />
                Goods Received
              </TabsTrigger>
              <TabsTrigger value="matching" className={subTriggerClassName}>
                <Link2 className="h-4 w-4" />
                Matching
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <APDashboard />
              </Suspense>
            </TabsContent>

            <TabsContent value="incoming" className="mt-4">
              <DocumentsContainer />
            </TabsContent>

            <TabsContent value="vendors" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <VendorManager />
              </Suspense>
            </TabsContent>

            <TabsContent value="prices" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <PriceIntelligence />
              </Suspense>
            </TabsContent>

            <TabsContent value="purchase-orders" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <PurchaseOrdersTab />
              </Suspense>
            </TabsContent>

            <TabsContent value="goods-received" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <GoodsReceivedTab />
              </Suspense>
            </TabsContent>

            <TabsContent value="matching" className="mt-4">
              <Suspense fallback={<TabLoading />}>
                <MatchingTab />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  )
}
