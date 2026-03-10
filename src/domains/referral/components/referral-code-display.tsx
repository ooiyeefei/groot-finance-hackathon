'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Share2, Check, Link } from 'lucide-react'
import { buildReferralUrl, buildShareMessage, getCommissionRange } from '../lib/referral-utils'

interface ReferralCodeDisplayProps {
  code: string
  referralUrl: string
  codeType?: string
}

export function ReferralCodeDisplay({ code, referralUrl, codeType }: ReferralCodeDisplayProps) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const copyToClipboard = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'code') {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      }
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      if (type === 'code') {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      }
    }
  }

  const handleShare = async () => {
    const shareMessage = buildShareMessage(code, codeType)
    const shareUrl = buildReferralUrl(code)

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Groot Finance Referral',
          text: shareMessage,
          url: shareUrl,
        })
        return
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }
    await copyToClipboard(shareMessage, 'link')
  }

  const { discount } = getCommissionRange(codeType)

  return (
    <div className="bg-card border border-border rounded-xl p-8">
      {/* Inline: code on left, buttons on right */}
      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Code display */}
        <div className="bg-muted rounded-xl px-8 py-5 flex-1 w-full lg:w-auto text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {codeType === 'partner_reseller' ? 'Reseller Code' : 'Referral Code'}
          </p>
          <span className="text-3xl sm:text-4xl font-mono font-bold text-foreground tracking-widest">
            {code}
          </span>
        </div>

        {/* Action buttons - stacked vertically on right */}
        <div className="flex flex-row lg:flex-col gap-3 w-full lg:w-auto">
          <Button
            variant="outline"
            onClick={() => copyToClipboard(code, 'code')}
            className="h-11 text-sm font-medium flex-1 lg:w-40"
          >
            {copiedCode ? (
              <><Check className="w-4 h-4 mr-2 text-green-600" /> Copied!</>
            ) : (
              <><Copy className="w-4 h-4 mr-2" /> Copy Code</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => copyToClipboard(referralUrl, 'link')}
            className="h-11 text-sm font-medium flex-1 lg:w-40"
          >
            {copiedLink ? (
              <><Check className="w-4 h-4 mr-2 text-green-600" /> Copied!</>
            ) : (
              <><Link className="w-4 h-4 mr-2" /> Copy Link</>
            )}
          </Button>
          <Button
            onClick={handleShare}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 text-sm font-medium flex-1 lg:w-40"
          >
            <Share2 className="w-4 h-4 mr-2" /> Share
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-4 text-center lg:text-left">
        Applicable to annual plans only. Referred businesses get RM {discount} off.
      </p>
    </div>
  )
}
