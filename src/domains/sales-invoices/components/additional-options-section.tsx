'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { InvoiceTemplateItem } from '../types'

interface AdditionalOptionsSectionProps {
  // Template
  templateId: string
  onTemplateChange: (id: string) => void
  // Memo (maps to existing "notes" field)
  memo: string
  onMemoChange: (text: string) => void
  // Footer
  footer: string
  onFooterChange: (text: string) => void
  // Custom fields
  customFields: Array<{ key: string; value: string }>
  onCustomFieldsChange: (fields: Array<{ key: string; value: string }>) => void
  // Tax ID
  showTaxId: boolean
  onToggleTaxId: (show: boolean) => void
  // Payment instructions
  paymentInstructions: string
  onPaymentInstructionsChange: (text: string) => void
  // Signature
  signatureName: string
  onSignatureNameChange: (name: string) => void
  // Templates for notes and payment instructions
  customNoteTemplates?: InvoiceTemplateItem[]
  customPaymentTemplates?: InvoiceTemplateItem[]
  onAddTemplate?: (type: 'note' | 'payment', label: string, text: string) => Promise<void>
  onDeleteTemplate?: (type: 'note' | 'payment', templateId: string) => Promise<void>
}

export function AdditionalOptionsSection({
  templateId,
  onTemplateChange,
  memo,
  onMemoChange,
  footer,
  onFooterChange,
  customFields,
  onCustomFieldsChange,
  showTaxId,
  onToggleTaxId,
  paymentInstructions,
  onPaymentInstructionsChange,
  signatureName,
  onSignatureNameChange,
}: AdditionalOptionsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showMemo, setShowMemo] = useState(!!memo)
  const [showFooter, setShowFooter] = useState(!!footer)
  const [showCustomFields, setShowCustomFields] = useState(customFields.length > 0)
  const [showPaymentInstructions, setShowPaymentInstructions] = useState(!!paymentInstructions)
  const [showSignature, setShowSignature] = useState(!!signatureName)

  const handleAddCustomField = () => {
    onCustomFieldsChange([...customFields, { key: '', value: '' }])
  }

  const handleUpdateCustomField = (index: number, field: 'key' | 'value', value: string) => {
    const updated = customFields.map((cf, i) =>
      i === index ? { ...cf, [field]: value } : cf
    )
    onCustomFieldsChange(updated)
  }

  const handleRemoveCustomField = (index: number) => {
    onCustomFieldsChange(customFields.filter((_, i) => i !== index))
  }

  const toggleOptions: Array<{ key: string; label: string; active: boolean; onToggle: () => void }> = [
    { key: 'memo', label: 'Memo', active: showMemo, onToggle: () => { setShowMemo(!showMemo); if (showMemo) onMemoChange('') } },
    { key: 'footer', label: 'Footer', active: showFooter, onToggle: () => { setShowFooter(!showFooter); if (showFooter) onFooterChange('') } },
    { key: 'customFields', label: 'Custom fields', active: showCustomFields, onToggle: () => { setShowCustomFields(!showCustomFields); if (showCustomFields) onCustomFieldsChange([]) } },
    { key: 'taxId', label: 'Show tax ID', active: showTaxId, onToggle: () => onToggleTaxId(!showTaxId) },
    { key: 'payment', label: 'Payment instructions', active: showPaymentInstructions, onToggle: () => { setShowPaymentInstructions(!showPaymentInstructions); if (showPaymentInstructions) onPaymentInstructionsChange('') } },
    { key: 'signature', label: 'Signature', active: showSignature, onToggle: () => { setShowSignature(!showSignature); if (showSignature) onSignatureNameChange('') } },
  ]

  return (
    <div className="space-y-3">
      {/* Template selector (always visible) */}
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

      {/* Collapsible advanced options */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        More options
      </button>

      {isExpanded && (
        <div className="space-y-4 pl-1">
          {/* Toggle chips */}
          <div className="flex flex-wrap gap-2">
            {toggleOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={opt.onToggle}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  opt.active
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Memo (notes) */}
          {showMemo && (
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
          )}

          {/* Footer */}
          {showFooter && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Footer</label>
              <Textarea
                value={footer}
                onChange={(e) => onFooterChange(e.target.value)}
                placeholder="Footer text for the invoice..."
                rows={2}
                className="text-sm"
              />
            </div>
          )}

          {/* Custom fields */}
          {showCustomFields && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Custom fields</label>
              {customFields.map((field, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={field.key}
                    onChange={(e) => handleUpdateCustomField(index, 'key', e.target.value)}
                    placeholder="Label"
                    className="h-8 text-sm flex-1"
                  />
                  <Input
                    value={field.value}
                    onChange={(e) => handleUpdateCustomField(index, 'value', e.target.value)}
                    placeholder="Value"
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveCustomField(index)}
                    className="text-destructive hover:text-destructive shrink-0 h-8 w-8 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={handleAddCustomField} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add field
              </Button>
            </div>
          )}

          {/* Payment instructions */}
          {showPaymentInstructions && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment instructions</label>
              <Textarea
                value={paymentInstructions}
                onChange={(e) => onPaymentInstructionsChange(e.target.value)}
                placeholder="Bank details, payment methods..."
                rows={3}
                className="text-sm"
              />
            </div>
          )}

          {/* Signature */}
          {showSignature && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Signature name</label>
              <Input
                value={signatureName}
                onChange={(e) => onSignatureNameChange(e.target.value)}
                placeholder="Authorized signatory name"
                className="h-9 text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
