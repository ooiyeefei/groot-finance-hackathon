'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  FileCheck,
  FileUp,
  Loader2,
  AlertCircle,
  QrCode,
  ExternalLink,
  Upload,
  RefreshCw,
  Clock,
  Ban,
  Eye,
  FileText,
  Info,
  Copy,
  Check,
  Mail,
} from 'lucide-react'
import EinvoiceStatusBadge from './einvoice-status-badge'
import EinvoiceMatchReview from './einvoice-match-review'
import { formatBusinessDate } from '@/lib/utils'

function getUserFriendlyError(rawError: string | null): string {
  if (!rawError) return 'Something went wrong. Please try again or fill the form manually.'
  const e = rawError.toLowerCase()
  if (e.includes('bot_blocked') || e.includes('cloudflare') || e.includes('403'))
    return '' // Handled by the amber BOT_BLOCKED banner
  if (e.includes('asyncio') || e.includes('playwright sync'))
    return 'A temporary system error occurred. Please retry — this usually resolves on the next attempt.'
  if (e.includes('timeout') || e.includes('timed out'))
    return 'The merchant form took too long to process. Please retry or fill the form manually.'
  if (e.includes('navigation') || e.includes('goto'))
    return 'Could not reach the merchant\'s website. The site may be temporarily down.'
  if (e.includes('no_merchant_form_url'))
    return 'No e-invoice form found for this merchant. You can fill it manually if you know the URL.'
  if (e.includes('validation') || e.includes('required'))
    return 'The merchant form has required fields we couldn\'t fill automatically. Please fill the form manually.'
  if (e.includes('no_business_details'))
    return 'Company details are missing. Please update your business settings and retry.'
  if (e.includes('gemini') || e.includes('api error'))
    return 'Our AI service had a temporary issue. Please retry.'
  return 'We couldn\'t submit the form automatically. You can retry or fill the form manually.'
}

interface MatchCandidate {
  receivedDocId: string
  supplierName: string
  total: number
  dateTimeIssued: string
  matchTier: string
  matchConfidence: number
}

interface EinvoiceSectionProps {
  claimId: string
  merchantFormUrl?: string | null
  einvoiceRequestStatus?: string | null
  einvoiceSource?: string | null
  einvoiceAttached?: boolean
  einvoiceEmailRef?: string | null
  einvoiceRequestedAt?: number | null
  einvoiceReceivedAt?: number | null
  einvoiceAgentError?: string | null
  einvoiceStoragePath?: string | null
  lhdnReceivedDocumentUuid?: string | null
  lhdnReceivedLongId?: string | null
  lhdnReceivedStatus?: string | null
  lhdnReceivedAt?: number | null
  pendingMatchCandidates?: MatchCandidate[]
  currency?: string
  onRefresh?: () => void
  // Business settings completeness (for missing fields warning)
  businessHasTin?: boolean
  businessHasBrn?: boolean
  businessHasAddress?: boolean
  businessHasPhone?: boolean
  businessHasEmail?: boolean
}

/**
 * E-Invoice section for expense claim detail view
 * Shows status, actions, and LHDN document references
 */
export default function EinvoiceSection({
  claimId,
  merchantFormUrl,
  einvoiceRequestStatus,
  einvoiceSource,
  einvoiceAttached,
  einvoiceEmailRef,
  einvoiceRequestedAt,
  einvoiceReceivedAt,
  einvoiceAgentError,
  einvoiceStoragePath,
  lhdnReceivedDocumentUuid,
  lhdnReceivedLongId,
  lhdnReceivedStatus,
  lhdnReceivedAt,
  pendingMatchCandidates,
  currency = 'MYR',
  onRefresh,
  businessHasTin,
  businessHasBrn,
  businessHasAddress,
  businessHasPhone,
  businessHasEmail,
}: EinvoiceSectionProps) {
  const [requestLoading, setRequestLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailCopied, setEmailCopied] = useState(false)

  const systemEmail = einvoiceEmailRef ? `einvoice+${einvoiceEmailRef}@einv.hellogroot.com` : null

  const handleCopyEmail = async () => {
    if (!systemEmail) return
    await navigator.clipboard.writeText(systemEmail)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
  }

  const hasAnyEinvoiceData = merchantFormUrl || einvoiceRequestStatus || einvoiceAttached ||
    (pendingMatchCandidates && pendingMatchCandidates.length > 0)

  const handleRequestEinvoice = async () => {
    setRequestLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/expense-claims/${claimId}/request-einvoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to request e-invoice')
      }

      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request e-invoice')
    } finally {
      setRequestLoading(false)
    }
  }

  const handleUploadEinvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/v1/expense-claims/${claimId}/upload-einvoice`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload e-invoice')
      }

      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload e-invoice')
    } finally {
      setUploadLoading(false)
      // Reset input
      e.target.value = ''
    }
  }

  const handleViewEinvoicePdf = async () => {
    if (!einvoiceStoragePath) return

    setPdfLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/v1/expense-claims/${claimId}/image-url?storagePath=${encodeURIComponent(einvoiceStoragePath)}&useRawFile=true`
      )
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to load e-invoice PDF')
      }

      // Open PDF in new tab
      window.open(result.data.imageUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load e-invoice PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  const canRequestEinvoice = merchantFormUrl && !einvoiceAttached &&
    (!einvoiceRequestStatus || einvoiceRequestStatus === 'none' || einvoiceRequestStatus === 'failed')

  const canUploadEinvoice = !einvoiceAttached

  const canRetry = einvoiceRequestStatus === 'failed' && merchantFormUrl

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-sm flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-muted-foreground" />
          E-Invoice
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary cursor-help">
                  Beta
                  <Info className="w-2.5 h-2.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                <p>
                  Automated e-invoice requests work with many Malaysian merchants, but each merchant has a different system. Some may require manual submission. We appreciate your understanding as we improve coverage.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {hasAnyEinvoiceData && (
            <EinvoiceStatusBadge
              einvoiceRequestStatus={einvoiceRequestStatus}
              einvoiceAttached={einvoiceAttached}
              einvoiceSource={einvoiceSource}
              merchantFormUrl={merchantFormUrl}
              lhdnReceivedStatus={lhdnReceivedStatus}
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Missing Business Details Warning */}
        {businessHasTin !== undefined && !einvoiceAttached && (() => {
          const missing: string[] = []
          if (!businessHasTin) missing.push('Tax ID (TIN)')
          if (!businessHasBrn) missing.push('Business Registration (BRN)')
          if (!businessHasAddress) missing.push('Address')
          if (!businessHasPhone) missing.push('Phone')
          if (!businessHasEmail) missing.push('Email')
          if (missing.length === 0) return null
          return (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                    Business details incomplete
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Missing: {missing.join(', ')}. These are needed for automated e-invoice requests.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs h-7"
                    asChild
                  >
                    <a href="/en/business-settings?tab=business-profile">
                      Update Business Settings
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Error Display */}
        {error && (
          <div className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Agent Error */}
        {einvoiceAgentError && einvoiceRequestStatus === 'failed' && (
          einvoiceAgentError.startsWith('BOT_BLOCKED') && merchantFormUrl ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <Ban className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                    This merchant doesn&apos;t support automated requests
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Fill the form manually — use the email below so we auto-attach the e-invoice when it arrives.
                  </p>
                </div>
              </div>

              {/* Manual steps with system email */}
              {systemEmail && (
                <div className="pl-6 space-y-2">
                  <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-foreground truncate flex-1">{systemEmail}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={handleCopyEmail}
                    >
                      {emailCopied ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <ol className="text-muted-foreground text-xs space-y-1 list-decimal list-inside">
                    <li>Open the merchant form below</li>
                    <li>Fill in your company details</li>
                    <li>Use the email above for the e-invoice delivery</li>
                    <li>We&apos;ll auto-attach it when it arrives</li>
                  </ol>
                </div>
              )}

              <div className="pl-6">
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  asChild
                >
                  <a href={merchantFormUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Open Form
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                    E-invoice request failed
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {getUserFriendlyError(einvoiceAgentError)}
                  </p>
                </div>
              </div>

              {/* Manual fallback with system email */}
              {systemEmail && merchantFormUrl && (
                <div className="pl-6 space-y-2">
                  <p className="text-muted-foreground text-xs">
                    You can fill the form manually — use this email so we auto-attach the e-invoice:
                  </p>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-foreground truncate flex-1">{systemEmail}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={handleCopyEmail}
                    >
                      {emailCopied ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <ol className="text-muted-foreground text-xs space-y-1 list-decimal list-inside">
                    <li>Open the merchant form below</li>
                    <li>Fill in your company details</li>
                    <li>Use the email above for the e-invoice delivery</li>
                    <li>We&apos;ll auto-attach it when it arrives</li>
                  </ol>
                </div>
              )}

              {merchantFormUrl && (
                <div className="pl-6">
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    asChild
                  >
                    <a href={merchantFormUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      Open Form
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )
        )}

        {/* Status Details */}
        <div className="space-y-2 text-sm">
          {/* Source */}
          {einvoiceSource && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source</span>
              <span className="text-foreground">
                {einvoiceSource === 'merchant_issued' ? 'Merchant Issued' :
                 einvoiceSource === 'manual_upload' ? 'Manual Upload' :
                 'Not Applicable'}
              </span>
            </div>
          )}

          {/* Timestamps */}
          {einvoiceRequestedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested</span>
              <span className="text-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(einvoiceRequestedAt).toLocaleDateString('en-MY', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
          )}

          {einvoiceReceivedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Received</span>
              <span className="text-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(einvoiceReceivedAt).toLocaleDateString('en-MY', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
          )}

          {/* LHDN References */}
          {lhdnReceivedDocumentUuid && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">LHDN UUID</span>
              <span className="text-foreground text-xs font-mono truncate max-w-[200px]" title={lhdnReceivedDocumentUuid}>
                {lhdnReceivedDocumentUuid}
              </span>
            </div>
          )}

          {lhdnReceivedStatus === 'cancelled' && (
            <div className="flex items-center gap-2 bg-red-500/10 rounded px-3 py-2 mt-2">
              <Ban className="w-4 h-4 text-red-500" />
              <span className="text-red-600 dark:text-red-400 text-sm">
                This e-invoice has been cancelled by the supplier on LHDN
              </span>
            </div>
          )}

          {/* LHDN Verification QR Code Link */}
          {lhdnReceivedLongId && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">LHDN Verification</span>
              <a
                href={`https://myinvois.hasil.gov.my/${lhdnReceivedLongId}/share`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 text-xs flex items-center gap-1"
              >
                <QrCode className="w-3 h-3" />
                Verify on MyInvois
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Merchant Form URL — hide when error banner already shows the button */}
          {merchantFormUrl && !einvoiceAttached && einvoiceRequestStatus !== 'failed' && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Merchant Form</span>
              <Button size="sm" variant="ghost" className="h-auto py-1 px-2 text-xs text-primary hover:text-primary/80" asChild>
                <a href={merchantFormUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open form manually
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* Attached E-Invoice Document */}
        {einvoiceAttached && einvoiceStoragePath && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-green-600 dark:text-green-400 text-sm font-medium">E-Invoice Attached</p>
                  <p className="text-muted-foreground text-xs">
                    {einvoiceStoragePath.split('/').pop()}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleViewEinvoicePdf}
                disabled={pdfLoading}
                className="border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/10"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Eye className="w-4 h-4 mr-1" />
                )}
                View PDF
              </Button>
            </div>
          </div>
        )}

        {/* Match Review */}
        {pendingMatchCandidates && pendingMatchCandidates.length > 0 && (
          <div className="border-t border-border pt-4">
            <EinvoiceMatchReview
              claimId={claimId}
              candidates={pendingMatchCandidates}
              currency={currency}
              onResolved={onRefresh}
            />
          </div>
        )}

        {/* Action Buttons — always show upload, conditionally show request */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          {/* Request E-Invoice Button */}
          {canRequestEinvoice && (
            <Button
              size="sm"
              onClick={handleRequestEinvoice}
              disabled={requestLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {requestLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : canRetry ? (
                <RefreshCw className="w-4 h-4 mr-1" />
              ) : (
                <FileUp className="w-4 h-4 mr-1" />
              )}
              {canRetry ? 'Retry Request' : 'Request E-Invoice'}
            </Button>
          )}

          {/* Manual Upload / Replace Button — always available */}
          <label>
            <Button
              size="sm"
              variant="outline"
              disabled={uploadLoading}
              asChild
            >
              <span>
                {uploadLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Upload className="w-4 h-4 mr-1" />
                )}
                {einvoiceAttached ? 'Replace E-Invoice' : 'Upload E-Invoice'}
              </span>
            </Button>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleUploadEinvoice}
              className="hidden"
              disabled={uploadLoading}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
