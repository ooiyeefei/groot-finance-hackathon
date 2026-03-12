'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { X, Loader2, Upload, Trash2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCreateGRN } from '../hooks/use-grns'
import { CsvImportModal } from '@/lib/csv-parser/components/csv-import-modal'
import type { CsvImportResult } from '@/lib/csv-parser/types'

interface GRNLineItem {
  poLineItemIndex: number | null
  itemCode: string
  description: string
  quantityOrdered: number
  quantityReceived: number
  quantityRejected: number
  condition: 'good' | 'damaged' | 'rejected'
  notes: string
}

interface GRNFormProps {
  isOpen: boolean
  onClose: () => void
  preselectedPoId?: Id<'purchase_orders'> | null
}

export default function GRNForm({ isOpen, onClose, preselectedPoId }: GRNFormProps) {
  const { businessId } = useActiveBusiness()
  const { createGRN } = useCreateGRN()

  const vendorsResult = useQuery(
    api.functions.vendors.list,
    businessId
      ? { businessId: businessId as Id<'businesses'> }
      : 'skip'
  )
  const vendors = vendorsResult?.vendors ?? []

  // List POs for selector
  const purchaseOrders = useQuery(
    api.functions.purchaseOrders.list,
    businessId
      ? { businessId: businessId as Id<'businesses'> }
      : 'skip'
  )

  const [vendorId, setVendorId] = useState<string>('')
  const [purchaseOrderId, setPurchaseOrderId] = useState<string>(preselectedPoId ?? '')
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<GRNLineItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCsvImport, setShowCsvImport] = useState(false)

  // Get selected PO details
  const selectedPo = useQuery(
    api.functions.purchaseOrders.get,
    purchaseOrderId ? { poId: purchaseOrderId as Id<'purchase_orders'> } : 'skip'
  )

  // Pre-populate from PO when selected
  useEffect(() => {
    if (selectedPo) {
      setVendorId(selectedPo.vendorId)
      setLineItems(
        selectedPo.lineItems.map((li: { itemCode?: string; description: string; quantity: number; receivedQuantity?: number }, idx: number) => ({
          poLineItemIndex: idx,
          itemCode: li.itemCode ?? '',
          description: li.description,
          quantityOrdered: li.quantity,
          quantityReceived: li.quantity - (li.receivedQuantity ?? 0),
          quantityRejected: 0,
          condition: 'good' as const,
          notes: '',
        }))
      )
    }
  }, [selectedPo?._id])

  // Sync preselectedPoId
  useEffect(() => {
    if (preselectedPoId) {
      setPurchaseOrderId(preselectedPoId)
    }
  }, [preselectedPoId])

  const updateLineItem = (index: number, field: keyof GRNLineItem, value: string | number) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const handleCsvImportComplete = useCallback((result: CsvImportResult) => {
    const importedLines: GRNLineItem[] = result.rows.map((row) => ({
      poLineItemIndex: null,
      itemCode: String(row.itemCode ?? ''),
      description: String(row.lineDescription ?? row.description ?? ''),
      quantityOrdered: Number(row.quantityOrdered) || 0,
      quantityReceived: Number(row.quantityReceived) || 0,
      quantityRejected: Number(row.quantityRejected) || 0,
      condition: (['good', 'damaged', 'rejected'].includes(String(row.condition ?? '').toLowerCase())
        ? String(row.condition).toLowerCase() as 'good' | 'damaged' | 'rejected'
        : 'good'),
      notes: '',
    }))

    if (importedLines.length > 0) {
      setLineItems(importedLines)
    }
    setShowCsvImport(false)
  }, [])

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  // Add empty line for standalone GRN
  const addLineItem = () => {
    setLineItems([...lineItems, {
      poLineItemIndex: null,
      itemCode: '',
      description: '',
      quantityOrdered: 0,
      quantityReceived: 1,
      quantityRejected: 0,
      condition: 'good',
      notes: '',
    }])
  }

  const handleSave = async () => {
    setError(null)

    if (!vendorId) {
      setError('Please select a vendor')
      return
    }
    if (lineItems.length === 0) {
      setError('Add at least one line item')
      return
    }
    if (lineItems.some((li) => !li.description.trim())) {
      setError('All line items must have a description')
      return
    }

    setIsSaving(true)
    try {
      await createGRN({
        vendorId: vendorId as Id<'vendors'>,
        purchaseOrderId: purchaseOrderId ? purchaseOrderId as Id<'purchase_orders'> : undefined,
        grnDate,
        lineItems: lineItems.map((li) => ({
          poLineItemIndex: li.poLineItemIndex ?? undefined,
          itemCode: li.itemCode || undefined,
          description: li.description,
          quantityReceived: li.quantityReceived,
          quantityRejected: li.quantityRejected || undefined,
          condition: li.condition !== 'good' ? li.condition : undefined,
          notes: li.notes || undefined,
        })),
        notes: notes || undefined,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create GRN')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  // Filter POs to only actionable ones
  const activePOs = (purchaseOrders ?? []).filter((po) =>
    ['issued', 'partially_received'].includes(po.status)
  )

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div
          className="fixed inset-0 transition-opacity"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}
          onClick={!isSaving ? onClose : undefined}
        />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[96vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-base font-semibold text-foreground">Create Goods Received Note</h3>
              <button
                onClick={onClose}
                disabled={isSaving}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* PO Selector */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Purchase Order (optional)</label>
                <select
                  value={purchaseOrderId}
                  onChange={(e) => setPurchaseOrderId(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                  disabled={isSaving || !!preselectedPoId}
                >
                  <option value="">Standalone GRN (no PO)</option>
                  {activePOs.map((po) => (
                    <option key={po._id} value={po._id}>
                      {po.poNumber} - {po.vendorName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vendor (auto-filled from PO or manual) */}
              {!purchaseOrderId && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Vendor *</label>
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                    disabled={isSaving}
                  >
                    <option value="">Select vendor...</option>
                    {vendors.map((v) => (
                      <option key={v._id} value={v._id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">GRN Date *</label>
                <input
                  type="date"
                  value={grnDate}
                  onChange={(e) => setGrnDate(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                  disabled={isSaving}
                />
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Line Items</label>
                  <div className="flex gap-2">
                    {!purchaseOrderId && (
                      <div className="relative group">
                        <button
                          type="button"
                          onClick={() => setShowCsvImport(true)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Import CSV
                        </button>
                        <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-card border border-border rounded-md p-2 shadow-lg z-10 whitespace-nowrap">
                          <p className="text-xs text-muted-foreground">CSV columns: Description, Quantity Received, Condition</p>
                        </div>
                      </div>
                    )}
                    {!purchaseOrderId && (
                      <button
                        type="button"
                        onClick={addLineItem}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                      >
                        + Add Line
                      </button>
                    )}
                  </div>
                </div>

                {lineItems.length === 0 ? (
                  <div className="bg-muted rounded-md p-4 text-center text-sm text-muted-foreground">
                    {purchaseOrderId ? 'Loading PO line items...' : 'Add line items or import from CSV'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lineItems.map((li, index) => (
                      <div key={index} className="bg-muted rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">
                            {li.description}
                            {li.itemCode && <span className="text-xs text-muted-foreground ml-2">({li.itemCode})</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            {li.quantityOrdered > 0 && (
                              <span className="text-xs text-muted-foreground">Ordered: {li.quantityOrdered}</span>
                            )}
                            {!purchaseOrderId && (
                              <button
                                type="button"
                                onClick={() => removeLineItem(index)}
                                disabled={lineItems.length === 1 || isSaving}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-30 p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Received Qty *</label>
                            <input
                              type="number"
                              value={li.quantityReceived}
                              onChange={(e) => updateLineItem(index, 'quantityReceived', Number(e.target.value))}
                              className="w-full bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
                              min="0"
                              step="0.01"
                              disabled={isSaving}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Rejected Qty</label>
                            <input
                              type="number"
                              value={li.quantityRejected}
                              onChange={(e) => updateLineItem(index, 'quantityRejected', Number(e.target.value))}
                              className="w-full bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
                              min="0"
                              step="0.01"
                              disabled={isSaving}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Condition</label>
                            <select
                              value={li.condition}
                              onChange={(e) => updateLineItem(index, 'condition', e.target.value)}
                              className="w-full bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
                              disabled={isSaving}
                            >
                              <option value="good">Good</option>
                              <option value="damaged">Damaged</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm resize-none"
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-end p-4 border-t border-border shrink-0">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || lineItems.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Create GRN'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CsvImportModal
        open={showCsvImport}
        onOpenChange={setShowCsvImport}
        schemaType="goods_received_note"
        onComplete={handleCsvImportComplete}
        onCancel={() => setShowCsvImport(false)}
      />
    </>
  )
}
