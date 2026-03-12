'use client'

import { useState } from 'react'
import MatchList from './match-list'
import MatchReview from './match-review'
import UnmatchedReport from './unmatched-report'
import MatchingSummary from './matching-summary'
import type { Id } from '../../../../convex/_generated/dataModel'

export default function MatchingTab() {
  const [selectedMatchId, setSelectedMatchId] = useState<Id<'po_matches'> | null>(null)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <MatchingSummary />

      {/* Match Records */}
      <MatchList onSelectMatch={(matchId) => setSelectedMatchId(matchId)} />

      {/* Unmatched Documents */}
      <UnmatchedReport />

      {/* Match Review Dialog */}
      {selectedMatchId && (
        <MatchReview
          matchId={selectedMatchId}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </div>
  )
}
