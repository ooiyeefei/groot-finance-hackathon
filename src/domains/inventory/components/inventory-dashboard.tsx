'use client'

import { useState, useEffect } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, MapPin, AlertTriangle, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { HowItWorksDrawer } from './how-it-works-drawer'
import type { DashboardSummary } from '../types'

export function InventoryDashboard() {
  const { businessId } = useActiveBusiness()
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const getDashboardSummary = useAction(api.functions.inventoryStock.getDashboardSummary)

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    async function load() {
      try {
        const result = await getDashboardSummary({ businessId: businessId! })
        if (!cancelled) setData(result)
      } catch (err) {
        console.error('Failed to load inventory dashboard:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [businessId, getDashboardSummary])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="bg-muted rounded h-4 w-1/2" />
                  <div className="bg-muted rounded h-8 w-1/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const movementTypeBadge = (type: string) => {
    switch (type) {
      case 'stock_in':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
      case 'stock_out':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      case 'adjustment':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      default:
        return 'bg-muted text-muted-foreground border border-border'
    }
  }

  const movementTypeLabel = (type: string) => {
    switch (type) {
      case 'stock_in': return 'Stock In'
      case 'stock_out': return 'Stock Out'
      case 'adjustment': return 'Adjustment'
      case 'transfer': return 'Transfer'
      default: return type
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Inventory Overview</h2>
          <p className="text-sm text-muted-foreground">
            Track stock levels, movements, and low-stock alerts across all locations.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowHowItWorks(true)}>
          <Info className="w-4 h-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Items Tracked</p>
                <p className="text-2xl font-semibold text-foreground">{data?.totalItems || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <MapPin className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Locations</p>
                <p className="text-2xl font-semibold text-foreground">{data?.totalLocations || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-semibold text-foreground">{data?.lowStockCount || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {data && data.lowStockItems.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Item</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Location</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">On Hand</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockItems.map((item, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3 text-foreground font-medium">{item.itemName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.locationName}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={item.quantityOnHand <= 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-yellow-600 dark:text-yellow-400'}>
                        {item.quantityOnHand}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.reorderLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent Movements */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-foreground text-base">Recent Movements</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="bg-input border-border text-foreground text-sm h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="stock_in">Stock In</SelectItem>
                  <SelectItem value="stock_out">Stock Out</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From"
                className="bg-input border-border text-foreground text-sm h-8 w-36"
              />
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To"
                className="bg-input border-border text-foreground text-sm h-8 w-36"
              />
            </div>
          </div>
        </CardHeader>
        {data && data.recentMovements.length > 0 ? (() => {
          const filtered = data.recentMovements.filter((m) => {
            if (filterType !== 'all' && m.movementType !== filterType) return false
            if (filterDateFrom && m.date < filterDateFrom) return false
            if (filterDateTo && m.date > filterDateTo) return false
            return true
          })
          return filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Date</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Type</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Item</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Location</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Qty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((movement) => (
                  <tr key={movement._id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3 text-foreground text-sm">{movement.date}</td>
                    <td className="px-4 py-3">
                      <Badge className={movementTypeBadge(movement.movementType)}>
                        {movementTypeLabel(movement.movementType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">{movement.itemName}</td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{movement.locationName}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`flex items-center justify-end gap-1 text-sm font-medium ${
                        movement.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {movement.quantity > 0 ? (
                          <ArrowDownRight className="w-3 h-3" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No movements match the current filters.</p>
            </CardContent>
          )
        })() : (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No movements yet. Stock-in from an AP invoice to get started.</p>
          </CardContent>
        )}
      </Card>

      {showHowItWorks && <HowItWorksDrawer onClose={() => setShowHowItWorks(false)} />}
    </div>
  )
}
