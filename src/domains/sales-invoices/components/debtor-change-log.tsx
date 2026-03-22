'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RotateCcw, ArrowRight } from 'lucide-react'
import { formatBusinessDate } from '@/lib/utils'

interface DebtorChangeLogProps {
  businessId: string
  customerId: string
  userId: string
}

export function DebtorChangeLog({ businessId, customerId, userId }: DebtorChangeLogProps) {
  const entries: Array<{
    _id: string
    changedFields: Array<{ fieldName: string; oldValue: any; newValue: any }>
    submittedAt: number
    source: string
    isReverted?: boolean
  }> | undefined = useQuery((api as any).functions.debtorSelfService.getChangeLog, { businessId, customerId })
  const revertMutation = useMutation((api as any).functions.debtorSelfService.revertChange)
  const [revertingId, setRevertingId] = useState<string | null>(null)

  if (entries === undefined) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading change history...</span>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4">No self-service updates yet.</p>
    )
  }

  const handleRevert = async (changeLogId: string) => {
    setRevertingId(changeLogId)
    try {
      await revertMutation({ businessId, changeLogId, userId })
    } finally {
      setRevertingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const date = new Date(entry.submittedAt)
        const isRevert = entry.source === 'admin_revert'

        return (
          <Card key={entry._id} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-muted-foreground">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isRevert ? (
                      <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 text-xs">
                        Admin Revert
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs">
                        Self-Service
                      </Badge>
                    )}
                    {entry.isReverted && (
                      <Badge className="bg-muted text-muted-foreground border border-border text-xs">
                        Reverted
                      </Badge>
                    )}
                  </div>

                  {/* Changed fields */}
                  <div className="space-y-1">
                    {entry.changedFields.map((field, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground font-medium min-w-[120px]">
                          {formatFieldName(field.fieldName)}
                        </span>
                        <span className="text-destructive line-through truncate max-w-[150px]">
                          {field.oldValue || '(empty)'}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-primary truncate max-w-[150px]">
                          {field.newValue || '(empty)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revert button */}
                {!entry.isReverted && !isRevert && (
                  <Button
                    size="sm"
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground flex-shrink-0"
                    onClick={() => handleRevert(entry._id)}
                    disabled={revertingId === entry._id}
                  >
                    {revertingId === entry._id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Revert
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function formatFieldName(name: string): string {
  const map: Record<string, string> = {
    businessName: 'Business Name',
    contactPerson: 'Contact Person',
    contactPersonPosition: 'Position',
    email: 'Email',
    phone: 'Phone',
    phone2: 'Phone 2',
    fax: 'Fax',
    addressLine1: 'Address Line 1',
    addressLine2: 'Address Line 2',
    addressLine3: 'Address Line 3',
    city: 'City',
    stateCode: 'State',
    postalCode: 'Postal Code',
    countryCode: 'Country',
    tin: 'TIN',
    brn: 'BRN',
    idType: 'ID Type',
    sstRegistration: 'SST Registration',
    website: 'Website',
    businessNature: 'Business Nature',
  }
  return map[name] || name
}
