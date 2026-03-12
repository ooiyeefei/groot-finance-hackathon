'use client'

import { useState, useCallback } from 'react'
import { useQuery } from 'convex/react'
import { X, Plus, Trash2, Upload, Loader2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useNextPoNumber } from '../hooks/use-purchase-orders'
import { CsvImportModal } from '@/lib/csv-parser/components/csv-import-modal'
import type { CsvImportResult } from '@/lib/csv-parser/types'

interface LineItem {
  itemCode: string
  description: string
  quantity: number
  unitPrice: number
  unitMeasurement: string
}

interface POFormProps {
  isOpen: boolean
  onClose: () => void
  editPoId?: Id<'purchase_orders'> | null
}

export default function POForm({ isOpen, onClose, editPoId }: POFormProps) {
  const { businessId } = useActiveBusiness()
  const { createPurchaseOrder } = useCreatePurchaseOrder()
  const { updatePurchaseOrder } = useUpdatePurchaseOrder()
  const nextPoNumber = useNextPoNumber()

  const vendorsResult = useQuery(
    api.functions.vendors.list,
    businessId
      ? { businessId: businessId as Id<'businesses'> }
      : 'skip'
  )
  const vendors = vendorsResult?.vendors ?? []

  const editPo = useQuery(
    api.functions.purchaseOrders.get,
    editPoId ? { poId: editPoId } : 'skip'
  )

  const [vendorId, setVendorId] = useState<string>('')
  const [poDate, setPoDate] = useState(new Date().toISOString().split('T')[0])
  const [deliveryDate, setDeliveryDate] = useState('')
  const [currency, setCurrency] = useState('MYR')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { itemCode: '', description: '', quantity: 1, unitPrice: 0, unitMeasurement: 'pcs' },
  ])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [vendorSearch, setVendorSearch] = useState('')

  // Pre-fill form when editing
  const isEditing = !!editPoId
  if (editPo && vendorId === '' && isEditing) {
    setVendorId(editPo.vendorId)
    setPoDate(editPo.poDate)
    setDeliveryDate(editPo.requiredDeliveryDate ?? '')
    setCurrency(editPo.currency)
    setNotes(editPo.notes ?? '')
    setLineItems(editPo.lineItems.map((li: { itemCode?: string; description: string; quantity: number; unitPrice: number; unitMeasurement?: string }) => ({
      itemCode: li.itemCode ?? '',
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      unitMeasurement: li.unitMeasurement ?? 'pcs',
    })))
  }

  const filteredVendors = vendors.filter((v) =>
    vendorSearch === '' || v.name.toLowerCase().includes(vendorSearch.toLowerCase())
  )

  const addLineItem = () => {
    setLineItems([...lineItems, { itemCode: '', description: '', quantity: 1, unitPrice: 0, unitMeasurement: 'pcs' }])
  }

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const totalAmount = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0)

  const handleCsvImportComplete = useCallback((result: CsvImportResult) => {
    const importedLines: LineItem[] = result.rows.map((row) => ({
      itemCode: String(row.itemCode ?? ''),
      description: String(row.lineDescription ?? row.description ?? ''),
      quantity: Number(row.quantity) || 1,
      unitPrice: Number(row.unitPrice) || 0,
      unitMeasurement: String(row.unitMeasurement ?? 'pcs'),
    }))

    if (importedLines.length > 0) {
      setLineItems(importedLines)
    }
    setShowCsvImport(false)
  }, [])

  const handleSave = async (issueAfterSave = false) => {
    setError(null)

    if (!vendorId) {
      setError('Please select a vendor')
      return
    }
    if (!poDate) {
      setError('Please enter a PO date')
      return
    }
    if (lineItems.some((li) => !li.description.trim())) {
      setError('All line items must have a description')
      return
    }
    if (lineItems.some((li) => li.quantity <= 0)) {
      setError('All quantities must be greater than 0')
      return
    }

    setIsSaving(true)
    try {
      const formattedLineItems = lineItems.map((li) => ({
        itemCode: li.itemCode || undefined,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        currency,
        unitMeasurement: li.unitMeasurement || undefined,
      }))

      if (isEditing && editPoId) {
        await updatePurchaseOrder({
          poId: editPoId,
          vendorId: vendorId as Id<'vendors'>,
          poDate,
          requiredDeliveryDate: deliveryDate || undefined,
          lineItems: formattedLineItems,
          currency,
          notes: notes || undefined,
        })
      } else {
        await createPurchaseOrder({
          vendorId: vendorId as Id<'vendors'>,
          poDate,
          requiredDeliveryDate: deliveryDate || undefined,
          lineItems: formattedLineItems,
          currency,
          notes: notes || undefined,
        })
      }

      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase order')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

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
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {isEditing ? 'Edit Purchase Order' : 'Create Purchase Order'}
                </h3>
                {nextPoNumber && !isEditing && (
                  <p className="text-xs text-muted-foreground mt-0.5">Next: {nextPoNumber}</p>
                )}
              </div>
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

              {/* Vendor */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Vendor *</label>
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  placeholder="Search vendors..."
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm mb-1"
                  disabled={isSaving}
                />
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                  disabled={isSaving}
                  size={vendorSearch ? Math.min(filteredVendors.length + 1, 6) : 1}
                >
                  <option value="">Select vendor...</option>
                  {filteredVendors.map((v) => (
                    <option key={v._id} value={v._id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">PO Date *</label>
                  <input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Delivery Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                  disabled={isSaving}
                >
                  <option value="MYR">MYR</option>
                  <option value="SGD">SGD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="THB">THB</option>
                  <option value="IDR">IDR</option>
                </select>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Line Items *</label>
                  <div className="flex gap-2">
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
                        <p className="text-xs text-muted-foreground">CSV columns: Description, Quantity, Unit Price</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Line
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {lineItems.map((li, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-start">
                      <input
                        placeholder="Item code"
                        value={li.itemCode}
                        onChange={(e) => updateLineItem(index, 'itemCode', e.target.value)}
                        className="col-span-2 bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
                        disabled={isSaving}
                      />
                      <input
                        placeholder="Description *"
                        value={li.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        className="col-span-3 bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
                        disabled={isSaving}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={li.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))}
                        className="col-span-1 bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm text-right"
                        min="0.01"
                        step="0.01"
                        disabled={isSaving}
                      />
                      <input
                        placeholder="UOM"
                        value={li.unitMeasurement}
                        onChange={(e) => updateLineItem(index, 'unitMeasurement', e.target.value)}
                        className="col-span-1 bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
                        disabled={isSaving}
                      />
                      <input
                        type="number"
                        placeholder="Unit price"
                        value={li.unitPrice}
                        onChange={(e) => updateLineItem(index, 'unitPrice', Number(e.target.value))}
                        className="col-span-2 bg-input border border-border text-foreground rounded-md px-2 py-1.5 text-sm text-right"
                        min="0"
                        step="0.01"
                        disabled={isSaving}
                      />
                      <div className="col-span-2 flex items-center gap-1">
                        <span className="text-sm text-muted-foreground text-right flex-1">
                          {(li.quantity * li.unitPrice).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1 || isSaving}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-30 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end mt-2 pt-2 border-t border-border">
                  <span className="text-sm font-semibold text-foreground">
                    Total: {currency} {totalAmount.toFixed(2)}
                  </span>
                </div>
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
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  isEditing ? 'Update PO' : 'Save as Draft'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal
        open={showCsvImport}
        onOpenChange={setShowCsvImport}
        schemaType="purchase_order"
        onComplete={handleCsvImportComplete}
        onCancel={() => setShowCsvImport(false)}
      />
    </>
  )
}
