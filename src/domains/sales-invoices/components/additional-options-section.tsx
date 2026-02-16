'use client'

import { useState } from 'react'
import { Save, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface AdditionalOptionsSectionProps {
  // Template
  templateId: string
  onTemplateChange: (id: string) => void
  // Memo (maps to existing "notes" field)
  memo: string
  onMemoChange: (text: string) => void
  // Payment instructions
  paymentInstructions: string
  onPaymentInstructionsChange: (text: string) => void
  // Signature
  signatureName: string
  onSignatureNameChange: (name: string) => void
  // Save defaults
  onSaveDefaults?: () => Promise<void>
}

export function AdditionalOptionsSection({
  templateId,
  onTemplateChange,
  memo,
  onMemoChange,
  paymentInstructions,
  onPaymentInstructionsChange,
  signatureName,
  onSignatureNameChange,
  onSaveDefaults,
}: AdditionalOptionsSectionProps) {
  const [isSavingDefaults, setIsSavingDefaults] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<{ memo: string; paymentInstructions: string; signatureName: string } | null>(null)

  const isCurrentlySaved = savedSnapshot !== null &&
    memo === savedSnapshot.memo &&
    paymentInstructions === savedSnapshot.paymentInstructions &&
    signatureName === savedSnapshot.signatureName

  return (
    <div className="space-y-4">
      {/* Template selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Template</label>
        <Select value={templateId} onValueChange={onTemplateChange}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="modern">Modern</SelectItem>
            <SelectItem value="classic">Classic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Memo (notes) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Memo</label>
        <Textarea
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="Notes visible on the invoice..."
          rows={3}
          className="text-sm"
        />
      </div>

      {/* Payment instructions */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment instructions</label>
        <Textarea
          value={paymentInstructions}
          onChange={(e) => onPaymentInstructionsChange(e.target.value)}
          placeholder="Bank details, payment methods..."
          rows={4}
          className="text-sm"
        />
      </div>

      {/* Signature */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Signature name</label>
        <Input
          value={signatureName}
          onChange={(e) => onSignatureNameChange(e.target.value)}
          placeholder="Authorized signatory name"
          className="h-9 text-sm"
        />
      </div>

      {/* Save as defaults */}
      {onSaveDefaults && (
        <div className="pt-2 border-t border-border">
          <Button
            variant={isCurrentlySaved ? 'outline' : 'primary'}
            size="sm"
            className={`h-8 text-xs ${isCurrentlySaved ? 'border-green-600/30 text-green-600' : ''}`}
            disabled={isSavingDefaults || isCurrentlySaved}
            onClick={async () => {
              setIsSavingDefaults(true)
              try {
                await onSaveDefaults()
                setSavedSnapshot({ memo, paymentInstructions, signatureName })
              } catch {
                // Save failure is non-blocking
              } finally {
                setIsSavingDefaults(false)
              }
            }}
          >
            {isCurrentlySaved ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Defaults saved
              </>
            ) : (
              <>
                <Save className="h-3 w-3 mr-1" />
                {isSavingDefaults ? 'Saving...' : 'Save as invoice defaults'}
              </>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1">
            {isCurrentlySaved
              ? 'These values will auto-populate on new invoices.'
              : 'Saves memo, payment instructions, and signature as defaults for new invoices.'}
          </p>
        </div>
      )}
    </div>
  )
}
