'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import POList from './po-list'
import POForm from './po-form'
import PODetail from './po-detail'
import GRNForm from './grn-form'
import MatchingSettings from './matching-settings'
import type { Id } from '../../../../convex/_generated/dataModel'

export default function PurchaseOrdersTab() {
  const [showCreatePO, setShowCreatePO] = useState(false)
  const [selectedPoId, setSelectedPoId] = useState<Id<'purchase_orders'> | null>(null)
  const [grnForPoId, setGrnForPoId] = useState<Id<'purchase_orders'> | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="space-y-4">
      {/* Settings button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>

      <POList
        onCreatePO={() => setShowCreatePO(true)}
        onSelectPO={(poId) => setSelectedPoId(poId)}
      />

      {/* Create/Edit PO Form */}
      <POForm
        isOpen={showCreatePO}
        onClose={() => setShowCreatePO(false)}
      />

      {/* PO Detail */}
      {selectedPoId && (
        <PODetail
          poId={selectedPoId}
          onClose={() => setSelectedPoId(null)}
          onRecordGRN={(poId) => {
            setSelectedPoId(null)
            setGrnForPoId(poId)
          }}
        />
      )}

      {/* GRN Form from PO */}
      <GRNForm
        isOpen={grnForPoId !== null}
        onClose={() => setGrnForPoId(null)}
        preselectedPoId={grnForPoId}
      />

      {/* Settings */}
      <MatchingSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  )
}
