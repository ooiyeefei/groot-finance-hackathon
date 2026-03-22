'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { InventoryLocation, LocationType } from '../types'

interface LocationFormProps {
  businessId: Id<"businesses">
  location: InventoryLocation | null
  onClose: () => void
}

export function LocationForm({ businessId, location, onClose }: LocationFormProps) {
  const [name, setName] = useState(location?.name || '')
  const [address, setAddress] = useState(location?.address || '')
  const [type, setType] = useState<LocationType>(location?.type as LocationType || 'warehouse')
  const [isDefault, setIsDefault] = useState(location?.isDefault || false)
  const [saving, setSaving] = useState(false)

  const create = useMutation(api.functions.inventoryLocations.create)
  const update = useMutation(api.functions.inventoryLocations.update)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    try {
      if (location) {
        await update({
          id: location._id,
          businessId,
          name: name.trim(),
          address: address.trim() || undefined,
          type,
          isDefault,
        })
      } else {
        await create({
          businessId,
          name: name.trim(),
          address: address.trim() || undefined,
          type,
          isDefault,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {location ? 'Edit Location' : 'Add Location'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground">Name *</Label>
            <Input
              className="bg-input border-border text-foreground"
              placeholder="e.g., HQ, Warehouse A, Johor Branch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Address</Label>
            <Input
              className="bg-input border-border text-foreground"
              placeholder="Physical address (optional)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LocationType)}>
              <SelectTrigger className="bg-input border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-foreground">Default Location</Label>
              <p className="text-xs text-muted-foreground">
                Auto-selected when receiving inventory
              </p>
            </div>
            <Switch
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving...' : location ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
