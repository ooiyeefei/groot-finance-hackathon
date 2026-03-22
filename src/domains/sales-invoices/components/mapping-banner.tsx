'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Link2, Check, X, Sparkles } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCatalogVendorMappings } from '../hooks/use-catalog-vendor-mappings'
import type { Id } from '../../../../convex/_generated/dataModel'

interface MappingBannerProps {
  catalogItemId: Id<"catalog_items">
}

export default function MappingBanner({ catalogItemId }: MappingBannerProps) {
  const { businessId } = useActiveBusiness()
  const {
    unmappedCount,
    suggestions,
    isSuggesting,
    runSuggestions,
    confirmMapping,
  } = useCatalogVendorMappings(businessId, catalogItemId)

  const [showSuggestions, setShowSuggestions] = useState(false)

  if (!unmappedCount.hasData) return null

  const handleRunMatching = async () => {
    setShowSuggestions(true)
    await runSuggestions()
  }

  return (
    <div className="space-y-4">
      {/* Banner */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-foreground font-medium text-sm">
                Purchase price data is available ({unmappedCount.count} vendor items)
              </p>
              <p className="text-muted-foreground text-xs">
                Link vendor items to this catalog item to see purchase costs and margin analysis.
              </p>
            </div>
          </div>
          <Button
            onClick={handleRunMatching}
            disabled={isSuggesting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSuggesting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Run Smart Matching
          </Button>
        </CardContent>
      </Card>

      {/* Suggestions List */}
      {showSuggestions && suggestions.length > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <h4 className="text-foreground font-medium text-sm">
              Suggested Matches ({suggestions.length})
            </h4>
            {suggestions.map((s: any, idx: number) => (
              <div
                key={`${s.vendorId}-${s.vendorItemIdentifier}`}
                className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-medium truncate">
                      {s.vendorItemDescription}
                    </span>
                    <Badge className="bg-muted text-muted-foreground text-xs">
                      {s.confidenceScore}% match
                    </Badge>
                  </div>
                  <div className="text-muted-foreground text-xs mt-1">
                    {s.vendorName} &middot; Latest: {s.currency} {s.latestPrice.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <Button
                    size="sm"
                    onClick={() => confirmMapping(s)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-3"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      // Remove from UI — skip (don't reject, user can revisit)
                      // Actual rejection would call rejectMapping mutation
                    }}
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground h-8 px-3"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Skip
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {showSuggestions && !isSuggesting && suggestions.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center text-muted-foreground text-sm">
            No matching vendor items found. You can create manual mappings from the Purchase History tab.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
