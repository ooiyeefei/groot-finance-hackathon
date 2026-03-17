'use client'

import { Suspense, lazy, useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { FileText, Loader2, Settings, Mail } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Lazy load the sub-components
const EInvoiceIntegrationSettings = lazy(() => import('@/domains/account-management/components/einvoice-integration-settings'))
const EInvoiceComplianceSettings = lazy(() => import('@/domains/account-management/components/einvoice-compliance-settings'))
const EInvoiceNotificationSettings = lazy(() => import('@/domains/account-management/components/einvoice-notification-settings'))

export default function EInvoiceSettingsWithTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Valid secondary tabs
  const validSecondaryTabs = ['integration', 'compliance', 'notifications'] as const
  type SecondaryTabValue = typeof validSecondaryTabs[number]

  // Read from URL hash (#integration, #compliance, #notifications)
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<SecondaryTabValue>('integration')

  // Sync with URL hash
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as SecondaryTabValue
    if (validSecondaryTabs.includes(hash)) {
      setActiveSecondaryTab(hash)
    }
  }, [])

  // Update URL hash when tab changes (without scroll)
  const handleSecondaryTabChange = useCallback((value: string) => {
    setActiveSecondaryTab(value as SecondaryTabValue)

    // Update URL hash
    const newUrl = `${pathname}?${searchParams.toString()}#${value}`
    router.replace(newUrl, { scroll: false })
  }, [router, pathname, searchParams])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold text-foreground">e-Invoice Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure LHDN MyInvois integration, compliance fields, and buyer notification preferences
          </p>
        </div>
      </div>

      {/* Secondary Tabs */}
      <Tabs value={activeSecondaryTab} onValueChange={handleSecondaryTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-muted border border-border">
          <TabsTrigger
            value="integration"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Settings className="w-4 h-4 mr-2" />
            Integration
          </TabsTrigger>
          <TabsTrigger
            value="compliance"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <FileText className="w-4 h-4 mr-2" />
            Compliance
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Mail className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Integration Tab */}
        <TabsContent value="integration" className="space-y-4">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading integration settings...</span>
            </div>
          }>
            <EInvoiceIntegrationSettings />
          </Suspense>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-4">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading compliance settings...</span>
            </div>
          }>
            <EInvoiceComplianceSettings />
          </Suspense>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading notification settings...</span>
            </div>
          }>
            <EInvoiceNotificationSettings />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
