'use client'

import { useState } from 'react'
import { Plus, Trash2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useActiveBusiness } from '@/contexts/business-context'
import { useFeeClassificationRules, useFeeClassificationMutations } from '../hooks/use-reconciliation'
import { useToast } from '@/components/ui/toast'
import type { Id } from '../../../../convex/_generated/dataModel'

const PLATFORMS = ['all', 'shopee', 'lazada', 'tiktok_shop', 'stripe', 'grabpay'] as const
const ACCOUNT_CODES = [
  { code: '5801', name: 'Commission Fees' },
  { code: '5802', name: 'Shipping Fees' },
  { code: '5803', name: 'Service Fees' },
  { code: '5804', name: 'Marketing Fees' },
  { code: '5810', name: 'Payment Processing Fees' },
  { code: '5800', name: 'Platform Fees (General)' },
]

export default function FeeRulesManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { businessId } = useActiveBusiness()
  const { addToast } = useToast()
  const [selectedPlatform, setSelectedPlatform] = useState<string | undefined>()
  const { rules, isLoading } = useFeeClassificationRules(selectedPlatform)
  const { createRule, removeRule, seedDefaults } = useFeeClassificationMutations()

  // New rule form state
  const [newKeyword, setNewKeyword] = useState('')
  const [newAccountCode, setNewAccountCode] = useState('5801')
  const [newPlatform, setNewPlatform] = useState('all')
  const [isAdding, setIsAdding] = useState(false)

  const handleAddRule = async () => {
    if (!businessId || !newKeyword.trim()) return
    setIsAdding(true)
    try {
      const account = ACCOUNT_CODES.find((a) => a.code === newAccountCode)
      await createRule({
        businessId: businessId as Id<"businesses">,
        platform: newPlatform,
        keyword: newKeyword.trim(),
        accountCode: newAccountCode,
        accountName: account?.name ?? 'Unknown',
      })
      setNewKeyword('')
      addToast({ title: 'Rule added', description: `"${newKeyword.trim()}" → ${newAccountCode}`, type: 'success' })
    } catch (error: any) {
      addToast({ title: 'Error', description: error.message, type: 'error' })
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteRule = async (ruleId: Id<"fee_classification_rules">) => {
    try {
      await removeRule({ ruleId })
      addToast({ title: 'Rule removed', type: 'success' })
    } catch (error: any) {
      addToast({ title: 'Error', description: error.message, type: 'error' })
    }
  }

  const handleSeedDefaults = async () => {
    if (!businessId) return
    try {
      const result = await seedDefaults({ businessId: businessId as Id<"businesses"> })
      addToast({
        title: result.seeded > 0 ? 'Default rules seeded' : 'Rules already exist',
        description: result.seeded > 0 ? `${result.seeded} rules added` : result.message,
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Error', description: error.message, type: 'error' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl bg-background border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Fee Classification Rules
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Platform filter */}
          <div className="flex flex-wrap gap-1">
            <Button
              variant={selectedPlatform === undefined ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPlatform(undefined)}
              className="text-xs"
            >
              All Platforms
            </Button>
            {PLATFORMS.map((p) => (
              <Button
                key={p}
                variant={selectedPlatform === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPlatform(p)}
                className="text-xs capitalize"
              >
                {p === 'tiktok_shop' ? 'TikTok Shop' : p}
              </Button>
            ))}
          </div>

          {/* Add new rule */}
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Add New Rule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Keyword (e.g., commission fee)"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  className="flex-1 bg-card"
                />
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                  className="bg-card border border-border rounded-md px-2 text-sm text-foreground"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p === 'tiktok_shop' ? 'TikTok Shop' : p === 'all' ? 'All Platforms' : p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <select
                  value={newAccountCode}
                  onChange={(e) => setNewAccountCode(e.target.value)}
                  className="bg-card border border-border rounded-md px-2 text-sm text-foreground flex-1"
                >
                  {ACCOUNT_CODES.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleAddRule}
                  disabled={!newKeyword.trim() || isAdding}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rules list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">
                {rules.length} rule{rules.length !== 1 ? 's' : ''}
              </h3>
              {rules.length === 0 && (
                <Button variant="outline" size="sm" onClick={handleSeedDefaults} className="text-xs">
                  Seed Default Rules
                </Button>
              )}
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading rules...</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules configured. Click "Seed Default Rules" to start with common platform fee mappings.</p>
            ) : (
              <div className="space-y-1">
                {rules.map((rule) => (
                  <div
                    key={rule._id}
                    className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0 shrink-0 capitalize">
                        {rule.platform === 'tiktok_shop' ? 'TikTok' : rule.platform}
                      </Badge>
                      <span className="text-sm text-foreground truncate">{rule.keyword}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {rule.accountCode} ({rule.accountName})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => handleDeleteRule(rule._id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
