'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface GenerateReportDialogProps {
  open: boolean
  onClose: () => void
  businessId: string
}

export default function GenerateReportDialog({
  open,
  onClose,
  businessId,
}: GenerateReportDialogProps) {
  const [reportType, setReportType] = useState<'ar_aging' | 'ap_aging'>('ar_aging')
  const [asOfDate, setAsOfDate] = useState(() => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  })
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/v1/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, reportType, asOfDate }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      toast.success('Report generated successfully')

      // Open the PDF
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank')
      }

      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Aging Report</DialogTitle>
          <DialogDescription>
            Select the report type and reference date
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Report type selection */}
          <div className="space-y-2">
            <Label>Report Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                className={
                  reportType === 'ar_aging'
                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground flex-1'
                    : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground flex-1'
                }
                onClick={() => setReportType('ar_aging')}
              >
                AR Aging (Receivables)
              </Button>
              <Button
                type="button"
                className={
                  reportType === 'ap_aging'
                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground flex-1'
                    : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground flex-1'
                }
                onClick={() => setReportType('ap_aging')}
              >
                AP Aging (Payables)
              </Button>
            </div>
          </div>

          {/* Date selection */}
          <div className="space-y-2">
            <Label htmlFor="asOfDate">As of Date</Label>
            <Input
              id="asOfDate"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleGenerate}
            disabled={isGenerating || !asOfDate}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Report'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
