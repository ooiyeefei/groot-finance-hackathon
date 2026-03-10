'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Share2, Check, Link } from 'lucide-react'
import { buildReferralUrl, buildShareMessage } from '../lib/referral-utils'

interface ReferralCodeDisplayProps {
  code: string
  referralUrl: string
}

export function ReferralCodeDisplay({ code, referralUrl }: ReferralCodeDisplayProps) {
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
      // Fallback for older browsers
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
    const shareMessage = buildShareMessage(code)
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
    // Fallback: copy the full share message
    await copyToClipboard(shareMessage, 'link')
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8">
      <h3 className="text-base font-semibold text-muted-foreground mb-4">Your Referral Code</h3>

      {/* Code display */}
      <div className="bg-muted rounded-xl p-6 mb-4 text-center">
        <span className="text-3xl sm:text-4xl font-mono font-bold text-foreground tracking-widest">
          {code}
        </span>
      </div>

      <p className="text-sm text-muted-foreground mb-6 text-center">
        Applicable to annual plans only. Referred businesses get RM 100 off.
      </p>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          onClick={() => copyToClipboard(code, 'code')}
          className="h-11 text-sm font-medium"
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
          className="h-11 text-sm font-medium"
        >
          {copiedLink ? (
            <><Check className="w-4 h-4 mr-2 text-green-600" /> Copied!</>
          ) : (
            <><Link className="w-4 h-4 mr-2" /> Copy Link</>
          )}
        </Button>
        <Button
          onClick={handleShare}
          className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 text-sm font-medium"
        >
          <Share2 className="w-4 h-4 mr-2" /> Share
        </Button>
      </div>
    </div>
  )
}
