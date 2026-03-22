'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, MapPin, Edit2, Power, PowerOff } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { LocationForm } from './location-form'
import type { InventoryLocation, LocationType } from '../types'

export function LocationManagement() {
  const { businessId } = useActiveBusiness()
  const [showForm, setShowForm] = useState(false)
  const [editingLocation, setEditingLocation] = useState<InventoryLocation | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null)

  const locations: InventoryLocation[] | undefined = useQuery(
    (api.functions as any).inventoryLocations?.listAll,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  )
  const deactivate = useMutation(api.functions.inventoryLocations.deactivate)
  const reactivate = useMutation(api.functions.inventoryLocations.reactivate)

  const handleDeactivate = async (id: Id<"inventory_locations">, confirm?: boolean) => {
    if (!businessId) return
    const result = await deactivate({ id, businessId, confirmWithStock: confirm }) as any
    if (result && !result.success && result.error?.includes('item(s) with stock')) {
      setConfirmDeactivate(id)
    } else {
      setConfirmDeactivate(null)
    }
  }

  const typeLabels: Record<LocationType, string> = {
    warehouse: 'Warehouse',
    office: 'Office',
    retail: 'Retail',
    other: 'Other',
  }

  if (locations === undefined) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="bg-muted rounded h-4 w-1/3" />
            <div className="bg-muted rounded h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Manage warehouses, offices, and retail outlets where you store inventory.
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={() => { setEditingLocation(null); setShowForm(true) }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

      {locations.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No locations yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first location to start tracking inventory.
            </p>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Name</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Type</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Address</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Status</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location: InventoryLocation) => (
                  <tr key={location._id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{location.name}</span>
                        {location.isDefault && (
                          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">
                      {typeLabels[location.type as LocationType]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {location.address || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={
                        location.status === 'active'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
                      }>
                        {location.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingLocation(location); setShowForm(true) }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        {location.status === 'active' ? (
                          confirmDeactivate === location._id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs"
                                onClick={() => handleDeactivate(location._id, true)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs"
                                onClick={() => setConfirmDeactivate(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivate(location._id)}
                            >
                              <PowerOff className="w-4 h-4" />
                            </Button>
                          )
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => businessId && reactivate({ id: location._id, businessId })}
                          >
                            <Power className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && businessId && (
        <LocationForm
          businessId={businessId as any}
          location={editingLocation}
          onClose={() => { setShowForm(false); setEditingLocation(null) }}
        />
      )}
    </div>
  )
}
