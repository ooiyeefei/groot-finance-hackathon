'use client'

import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import DocumentsList from './documents-list'
import { Loader2, Info, Check, Shield, Clock, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const FileUploadZone = lazy(() => import('@/domains/utilities/components/file-upload-zone'))

export default function DocumentsContainer() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const documentsListRef = useRef<{ refreshDocuments: () => Promise<void> } | null>(null)

  const handleBusinessDocumentSuccess = useCallback((document: {
    id: string
    fileName: string
    fileSize: number
    fileType: string
    status: string
  }) => {
    // If document is auto-processing, trigger immediate refresh to show processing status
    if (document.status === 'processing') {
      // Trigger immediate refresh to show the processing status
      if (documentsListRef.current) {
        documentsListRef.current.refreshDocuments()
      } else {
        // Fallback to refresh trigger
        setRefreshTrigger(prev => prev + 1)
      }
    } else {
      // Standard refresh for pending documents
      setRefreshTrigger(prev => prev + 1)
    }
  }, [])

  const handleDocumentsRefresh = useCallback(() => {
    // Documents list refreshed - callback handled
  }, [])

  return (
    <div className="space-y-3">
      {/* Info Button */}
      <div className="flex justify-end">
        <EInvoiceHowItWorksDrawer />
      </div>

      {/* Business Document Upload */}
      <div>
        <Suspense fallback={<div className="border-2 border-dashed border-border rounded-lg p-4 text-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></div>}>
          <FileUploadZone
            onUploadSuccess={handleBusinessDocumentSuccess}
            onUploadStart={() => {/* Upload started callback */}}
            autoProcess={true}
            allowMultiple={true}
          />
        </Suspense>
      </div>

      {/* Documents List */}
      <div>
            <DocumentsList
              key={refreshTrigger}
              onRefresh={handleDocumentsRefresh}
              ref={documentsListRef}
            />
      </div>
    </div>
  )
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">{number}</div>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function BadgeItem({ icon: Icon, label, color, description }: { icon: typeof Shield; label: string; color: string; description: string }) {
  return (
    <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3 border">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
        <Icon className="w-3 h-3 mr-1" />{label}
      </span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </div>
  )
}

function EInvoiceHowItWorksDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full">
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>LHDN E-Invoice Detection</SheetTitle>
          <SheetDescription>Groot automatically detects and verifies LHDN e-invoices when you upload supplier invoices.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">How It Works</h3>
            <div className="space-y-3">
              <Step number={1} title="Upload your supplier invoice" description="Upload the PDF or image you received from your supplier — via email, WhatsApp, or any channel." />
              <Step number={2} title="Automatic e-invoice detection" description="Groot scans the document. If it finds an LHDN MyInvois QR code, it extracts the document ID and verifies it against LHDN within seconds." />
              <Step number={3} title="See the status" description="A badge appears on the invoice showing its LHDN status. Click into the detail view for full verification info." />
              <Step number={4} title="Reject if needed (72-hour window)" description="If the e-invoice is incorrect, click 'Reject E-Invoice' and enter a reason. You have 72 hours from LHDN validation to reject." />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Status Badges</h3>
            <div className="space-y-2">
              <BadgeItem icon={Shield} label="LHDN ✓" color="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" description="Validated — past the 72h window" />
              <BadgeItem icon={Clock} label="48h left" color="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" description="Within rejection window" />
              <BadgeItem icon={XCircle} label="Rejected" color="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" description="You rejected this e-invoice" />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Good to Know</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />Your supplier sends the e-invoice to you — LHDN does not deliver it</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />Regular invoices (without LHDN QR) work exactly as before</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />After 72 hours, the e-invoice is final and cannot be rejected</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />Rejected invoices are kept for your records (read-only)</li>
            </ul>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              To enable LHDN verification, connect your MyInvois account in{' '}
              <a href="/en/business-settings?tab=business" className="text-primary hover:underline">Settings → Business → e-Invoice</a>.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}