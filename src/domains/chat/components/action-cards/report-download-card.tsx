'use client'

/**
 * Report Download Card
 *
 * Displays a download link for generated PDF reports with metadata
 * (report type, period, sections included, generation timestamp).
 */

import { FileDown, FileText, CheckCircle } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface ReportDownloadData {
  reportUrl: string
  filename: string
  reportType: string
  period: string
  sections: string[]
  generatedAt: string
}

function ReportDownloadCard({ action }: ActionCardProps) {
  const data = action.data as unknown as ReportDownloadData

  if (!data || !data.reportUrl) return null

  const formattedDate = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString('en', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">{data.reportType || 'Report'}</span>
        {data.period && (
          <span className="text-xs text-muted-foreground">— {data.period}</span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Sections list */}
        {data.sections && data.sections.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.sections.map((section, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                {section}
              </span>
            ))}
          </div>
        )}

        {/* Download button */}
        <a
          href={data.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
        >
          <FileDown className="w-4 h-4" />
          Download {data.filename || 'Report.pdf'}
        </a>

        {/* Metadata footer */}
        {formattedDate && (
          <div className="text-[10px] text-muted-foreground text-center">
            Generated {formattedDate}
          </div>
        )}
      </div>
    </div>
  )
}

registerActionCard('report_download', ReportDownloadCard)
