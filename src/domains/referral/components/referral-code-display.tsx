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
    <div className="bg-card border border-border rounded-xl p-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {codeType === 'partner_reseller' ? 'Your Reseller Code' : 'Your Referral Code'}
      </p>

      {/* Single row: [ code ] [copy code] [copy link] [share] */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="bg-muted rounded-lg px-6 py-3 flex items-center justify-center flex-1 min-w-0">
          <span className="text-2xl sm:text-3xl font-mono font-bold text-foreground tracking-widest">
            {code}
          </span>
        </div>

        <Button
          variant="outline"
          onClick={() => copyToClipboard(code, 'code')}
          className="h-12 px-4 text-sm font-medium whitespace-nowrap"
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
          className="h-12 px-4 text-sm font-medium whitespace-nowrap"
        >
          {copiedLink ? (
            <><Check className="w-4 h-4 mr-2 text-green-600" /> Copied!</>
          ) : (
            <><Link className="w-4 h-4 mr-2" /> Copy Link</>
          )}
        </Button>
        <Button
          onClick={handleShare}
          className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-4 text-sm font-medium whitespace-nowrap"
        >
          <Share2 className="w-4 h-4 mr-2" /> Share
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mt-3">
        Applicable to annual plans only. Referred businesses get RM {discount} off.
      </p>
    </div>
  )
}
