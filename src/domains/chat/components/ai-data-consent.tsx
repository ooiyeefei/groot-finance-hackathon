'use client'

/**
 * AI Data Consent Dialog
 *
 * Apple Guideline 5.1.1(i) / 5.1.2(i) compliance.
 * Shown before the user's first AI chat interaction.
 * Explains what data is sent, to whom, and requires explicit consent.
 *
 * Consent is stored in localStorage per-user so it only shows once.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Shield, Bot, ExternalLink } from 'lucide-react'

const CONSENT_KEY = 'groot-ai-data-consent'

export function hasAiConsent(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(CONSENT_KEY) === 'accepted'
}

export function setAiConsent(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONSENT_KEY, 'accepted')
}

interface AiDataConsentProps {
  onAccept: () => void
  onDecline: () => void
}

export function AiDataConsent({ onAccept, onDecline }: AiDataConsentProps) {
  const [accepted, setAccepted] = useState(false)

  const handleAccept = () => {
    setAiConsent()
    setAccepted(true)
    onAccept()
  }

  if (accepted) return null

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="w-full max-w-sm space-y-5">
        {/* Icon */}
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-7 h-7 text-primary" />
        </div>

        {/* Title */}
        <div>
          <h3 className="text-lg font-semibold text-foreground">AI Assistant</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Before you start, here&apos;s how your data is handled.
          </p>
        </div>

        {/* Data disclosure */}
        <div className="text-left space-y-3 bg-muted/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground">
              <p className="font-medium">What data is shared</p>
              <p className="text-muted-foreground mt-0.5">
                Your chat messages and relevant business context (e.g. expense summaries, invoice data) are sent to process your request.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground">
              <p className="font-medium">Who processes it</p>
              <p className="text-muted-foreground mt-0.5">
                Data is processed by Google Gemini AI via our secure API. Your data is not used for model training.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground">
              <p className="font-medium">How it&apos;s protected</p>
              <p className="text-muted-foreground mt-0.5">
                All data is encrypted in transit. We use a paid enterprise API — your data is not stored by Google or used for training purposes.
              </p>
            </div>
          </div>
        </div>

        {/* Privacy policy link */}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Read our Privacy Policy <ExternalLink className="w-3 h-3" />
        </a>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            onClick={handleAccept}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            I Agree — Start Chatting
          </Button>
          <Button
            onClick={onDecline}
            variant="ghost"
            className="w-full text-muted-foreground"
          >
            No Thanks
          </Button>
        </div>
      </div>
    </div>
  )
}
