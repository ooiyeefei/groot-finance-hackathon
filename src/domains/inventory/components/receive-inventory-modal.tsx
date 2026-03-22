'use client'

import { useState, useEffect } from 'react'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import { CatalogSearchInput } from '@/domains/sales-invoices/components/catalog-search-input'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  itemCode?: string
}

interface ReceiveInventoryModalProps {
  businessId: Id<"businesses">
  invoiceId: Id<"invoices">
  lineItems: LineItem[]
  invoiceCurrency: string
  userId: string
  onClose: () => void
  onComplete: () => void
}

interface ReceiveItem {
  trackInventory: boolean
  catalogItemId: string
  catalogItemName: string
  locationId: string
  quantity: number
  unitCostOriginal: number
  description: string
}

export function ReceiveInventoryModal({
  businessId,
  invoiceId,
  lineItems,
  invoiceCurrency,
  userId,
  onClose,
  onComplete,
}: ReceiveInventoryModalProps) {
  const [items, setItems] = useState<ReceiveItem[]>([])
  const [bulkLocationId, setBulkLocationId] = useState('')
  const [saving, setSaving] = useState(false)

  // @ts-ignore - api types generated after convex codegen
  const locations: any[] | undefined = useQuery(
    (api.functions as any).inventoryLocations?.list,
    { businessId }
  )
  // @ts-ignore
  const defaultLocation: any | undefined = useQuery(
    (api.functions as any).inventoryLocations?.getDefault,
    { businessId }
  )
  // @ts-ignore
  const receiveFromInvoice = useAction(
    (api.functions as any).inventoryActions?.receiveFromInvoice
  )

  // Initialize items from line items
  useEffect(() => {
    const defaultLocId = defaultLocation?._id || ''
    setItems(
      lineItems.map((li) => ({
        trackInventory: li.quantity > 0,
        catalogItemId: '',
        catalogItemName: li.description || '',
        locationId: defaultLocId,
        quantity: li.quantity || 0,
        unitCostOriginal: li.unitPrice || 0,
        description: li.description || '',
      }))
    )
    if (defaultLocId) setBulkLocationId(defaultLocId)
  }, [lineItems, defaultLocation])

  const handleBulkLocation = (locationId: string) => {
    setBulkLocationId(locationId)
    setItems((prev) =>
      prev.map((item) => ({ ...item, locationId }))
    )
  }

  const updateItem = (index: number, updates: Partial<ReceiveItem>) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  const trackedItems = items.filter((i) => i.trackInventory && i.quantity > 0 && i.catalogItemId)
  const trackedButUnmatched = items.filter((i) => i.trackInventory && i.quantity > 0 && !i.catalogItemId)

  // Bulk approve: auto-accept all catalog matches that have been selected
  const handleBulkApprove = () => {
    // Already matched items stay matched — this is a no-op confirmation UX
    // Future: could auto-match unmatched items via fuzzy search
  }

  const handleConfirm = async () => {
    if (trackedItems.length === 0) return
    setSaving(true)
    try {
      await receiveFromInvoice({
        businessId,
        invoiceId,
        items: trackedItems.map((item) => ({
          catalogItemId: item.catalogItemId as Id<"catalog_items">,
          locationId: item.locationId as Id<"inventory_locations">,
          quantity: item.quantity,
          unitCostOriginal: item.unitCostOriginal,
          unitCostOriginalCurrency: invoiceCurrency,
          unitCostHome: item.unitCostOriginal, // TODO: currency conversion
          description: item.description,
        })),
        createdBy: userId,
      })
      onComplete()
    } catch (err) {
      console.error('Failed to receive inventory:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="bg-card border-border w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">Receive to Inventory</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Bulk location selector */}
          {locations && locations.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <span className="text-sm text-foreground font-medium whitespace-nowrap">Apply to all:</span>
              <Select value={bulkLocationId} onValueChange={handleBulkLocation}>
                <SelectTrigger className="bg-input border-border text-foreground flex-1">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc: any) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Line items */}
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  item.trackInventory ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">
                      {item.description || `Item ${index + 1}`}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Qty: {item.quantity} × {invoiceCurrency} {item.unitCostOriginal.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">Track</span>
                    <Switch
                      checked={item.trackInventory}
                      onCheckedChange={(checked) => updateItem(index, { trackInventory: checked })}
                    />
                  </div>
                </div>

                {item.trackInventory && (
                  <div className="mt-2 space-y-2">
                    {/* Catalog item match */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Catalog Item</label>
                      <CatalogSearchInput
                        value={item.catalogItemName}
                        onChange={(v) => updateItem(index, { catalogItemName: v, catalogItemId: '' })}
                        onSelect={(catItem) => updateItem(index, {
                          catalogItemId: catItem._id,
                          catalogItemName: catItem.name,
                        })}
                        searchField="name"
                        placeholder="Search or create catalog item..."
                        className="bg-input border-border text-foreground text-sm h-8"
                      />
                      {item.catalogItemId && (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span className="text-xs text-green-600 dark:text-green-400">Matched</span>
                        </div>
                      )}
                    </div>

                    {/* Location */}
                    {locations && locations.length > 0 && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                        <Select
                          value={item.locationId}
                          onValueChange={(v) => updateItem(index, { locationId: v })}
                        >
                          <SelectTrigger className="bg-input border-border text-foreground text-sm h-8">
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((loc: any) => (
                              <SelectItem key={loc._id} value={loc._id}>
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <p className="text-sm text-foreground">
              <span className="font-medium">{trackedItems.length}</span> item(s) matched and ready to receive.
            </p>
            {trackedButUnmatched.length > 0 && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {trackedButUnmatched.length} tracked item(s) need a catalog match before receiving.
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleConfirm}
            disabled={saving || trackedItems.length === 0}
          >
            {saving ? 'Receiving...' : `Receive ${trackedItems.length} Items`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
