'use client'

import { useState } from 'react'
import GRNList from './grn-list'
import GRNForm from './grn-form'

export default function GoodsReceivedTab() {
  const [showCreateGRN, setShowCreateGRN] = useState(false)

  return (
    <div className="space-y-4">
      <GRNList
        onCreateGRN={() => setShowCreateGRN(true)}
      />

      <GRNForm
        isOpen={showCreateGRN}
        onClose={() => setShowCreateGRN(false)}
      />
    </div>
  )
}
