'use client'

/**
 * Compliance Alert Card
 *
 * Renders regulatory compliance information from the RAG knowledge base
 * with severity badges, requirements list, and clickable citation links.
 */

import { Shield, ExternalLink } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface ComplianceAlertData {
  country: string
  countryCode: string
  authority: string
  topic: string
  severity: 'action_required' | 'for_information' | 'warning'
  requirements: string[]
  citationIndices: number[]
  effectiveDate?: string
  source?: string
}

const SEVERITY_CONFIG = {
  action_required: {
    label: 'Action Required',
    bg: 'bg-destructive/5',
    badge: 'bg-destructive/15 text-destructive',
    border: 'border-destructive/30',
  },
  warning: {
    label: 'Warning',
    bg: 'bg-yellow-500/5',
    badge: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/30',
  },
  for_information: {
    label: 'For Information',
    bg: 'bg-blue-500/5',
    badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
} as const

const COUNTRY_FLAGS: Record<string, string> = {
  SG: '🇸🇬',
  MY: '🇲🇾',
  ID: '🇮🇩',
  TH: '🇹🇭',
  PH: '🇵🇭',
  VN: '🇻🇳',
}

function ComplianceAlertCard({ action }: ActionCardProps) {
  const data = action.data as unknown as ComplianceAlertData

  if (!data?.topic || !data?.requirements?.length) return null

  const severity = SEVERITY_CONFIG[data.severity] || SEVERITY_CONFIG.for_information
  const flag = COUNTRY_FLAGS[data.countryCode] || ''

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className={`px-3 py-2 ${severity.bg} border-b border-border flex items-center gap-2`}>
        <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">
            {flag} {data.country} — {data.authority}
          </span>
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${severity.badge}`}>
          {severity.label}
        </span>
      </div>

      {/* Topic */}
      <div className="px-3 py-2.5">
        <p className="text-xs font-medium text-foreground mb-2">{data.topic}</p>

        {/* Requirements list */}
        <ul className="space-y-1 mb-2">
          {data.requirements.map((req, idx) => (
            <li key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="text-primary mt-0.5">•</span>
              <span>{req}</span>
            </li>
          ))}
        </ul>

        {/* Effective date */}
        {data.effectiveDate && (
          <p className="text-xs text-muted-foreground mb-2">
            Effective: {data.effectiveDate}
          </p>
        )}

        {/* Citation links */}
        {data.citationIndices && data.citationIndices.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sources:</span>
            {[...new Set(data.citationIndices)].map((citIdx) => (
              <span
                key={citIdx}
                className="citation-ref inline-flex items-center text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors text-xs"
                data-citation-index={citIdx}
              >
                [{citIdx}]
              </span>
            ))}
          </div>
        )}

        {/* Source name */}
        {data.source && !data.citationIndices?.length && (
          <p className="text-xs text-muted-foreground">
            Source: {data.source}
          </p>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('compliance_alert', ComplianceAlertCard)

export { ComplianceAlertCard }
