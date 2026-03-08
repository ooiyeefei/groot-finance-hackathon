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
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Your Referral Code</h3>

      {/* Code display */}
      <div className="bg-muted rounded-lg p-4 mb-4 text-center">
        <span className="text-2xl font-mono font-bold text-foreground tracking-wider">
          {code}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyToClipboard(code, 'code')}
          className="flex-1"
        >
          {copiedCode ? (
            <><Check className="w-4 h-4 mr-1.5 text-green-600" /> Copied!</>
          ) : (
            <><Copy className="w-4 h-4 mr-1.5" /> Copy Code</>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyToClipboard(referralUrl, 'link')}
          className="flex-1"
        >
          {copiedLink ? (
            <><Check className="w-4 h-4 mr-1.5 text-green-600" /> Copied!</>
          ) : (
            <><Link className="w-4 h-4 mr-1.5" /> Copy Link</>
          )}
        </Button>
        <Button
          size="sm"
          onClick={handleShare}
          className="bg-primary hover:bg-primary/90 text-primary-foreground flex-1"
        >
          <Share2 className="w-4 h-4 mr-1.5" /> Share
        </Button>
      </div>
    </div>
  )
}
