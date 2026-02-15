'use client'

import { lazy, Suspense, useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { BarChart3, Building, Loader2 } from 'lucide-react'
import APDashboard from './ap-dashboard'

const VendorManager = lazy(
  () => import('./vendor-manager')
)

const VALID_TABS = ['dashboard', 'vendors'] as const
type TabValue = (typeof VALID_TABS)[number]

function getTabFromHash(): TabValue {
  if (typeof window === 'undefined') return 'dashboard'
  const hash = window.location.hash.replace('#', '')
  const mapping: Record<string, TabValue> = {
    'dashboard': 'dashboard',
    'vendors': 'vendors',
  }
  return mapping[hash] || 'dashboard'
}

function getHashFromTab(tab: TabValue): string {
  const mapping: Record<TabValue, string> = {
    dashboard: 'dashboard',
    vendors: 'vendors',
  }
  return mapping[tab]
}

const TabLoading = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
)

export default function PayablesTabContainer() {
  const [activeTab, setActiveTab] = useState<TabValue>('dashboard')

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
          value="dashboard"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <BarChart3 className="h-4 w-4" />
          Dashboard
        </TabsTrigger>
        <TabsTrigger
          value="vendors"
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
        >
          <Building className="h-4 w-4" />
          Vendors
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="mt-4">
        <APDashboard />
      </TabsContent>

      <TabsContent value="vendors" className="mt-4">
        <Suspense fallback={<TabLoading />}>
          <VendorManager />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}
