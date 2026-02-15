'use client'

/**
 * Custom Message Renderer
 *
 * Renders markdown content with citation support and action cards.
 * Parses [^N] citation markers and renders them as clickable superscripts
 * that open the CitationOverlay component.
 * Renders action cards from the extensible registry after text content.
 */

import { useMemo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import CitationOverlay from './citation-overlay'
import { getActionCardComponent } from './action-cards'
import { BulkActionBar } from './action-cards/bulk-action-bar'
import type { CitationData } from '@/lib/ai/tools/base-tool'
import type { ChatAction } from '../lib/sse-parser'

interface MessageRendererProps {
  content: string
  role: 'user' | 'assistant'
  citations?: CitationData[]
  actions?: ChatAction[]
  isHistorical?: boolean
  /** When true, renders without the outer bubble wrapper (used inside streaming container) */
  isInline?: boolean
  className?: string
  onViewDetails?: (payload: { type: 'chart' | 'table' | 'dashboard'; title: string; data: unknown }) => void
}

/**
 * Renders a chat message with markdown formatting, citation support, and action cards.
 */
export function MessageRenderer({
  content,
  role,
  citations = [],
  actions,
  isHistorical = true,
  isInline = false,
  className = '',
  onViewDetails,
}: MessageRendererProps) {
  const [activeCitation, setActiveCitation] = useState<CitationData | null>(null)
  const [isCitationOpen, setIsCitationOpen] = useState(false)

  const handleCitationClick = useCallback(
    (index: number) => {
      const citation = citations[index - 1] // Citations are 1-indexed in markers
      if (citation) {
        setActiveCitation(citation)
        setIsCitationOpen(true)
      }
    },
    [citations]
  )

  const handleCloseCitation = useCallback(() => {
    setIsCitationOpen(false)
    setActiveCitation(null)
  }, [])

  // Process content: strip residual ```actions blocks and replace citation markers
  const processedContent = useMemo(() => {
    // Strip ```actions JSON blocks — handles raw, single-escaped, and multi-escaped backticks.
    // Also catches ```json blocks containing action card type objects.
    let processed = content
      .replace(/(?:\\*`){3,}actions[\s\S]*?(?:\\*`){3,}/g, '')
      .replace(/(?:\\*`){3,}(?:json)?\s*\n\s*\[\s*\{[\s\S]*?"type"\s*:\s*"(?:invoice_posting|cash_flow_dashboard|compliance_alert|budget_alert|spending_time_series|anomaly_card|vendor_comparison|expense_approval)"[\s\S]*?(?:\\*`){3,}/g, '')
      .trim()

    if (!citations.length) return processed

    // Replace [^N] markers with HTML superscript elements
    return processed.replace(
      /\[\^(\d+)\]/g,
      (_match, num) =>
        `<sup class="citation-marker" data-citation-index="${num}">[${num}]</sup>`
    )
  }, [content, citations])

  const isUser = role === 'user'

  // Handle citation clicks from action cards (event delegation for compliance_alert cards)
  const handleCardCitationClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const citationRef = target.closest('[data-citation-index]')
      if (citationRef) {
        const index = Number(citationRef.getAttribute('data-citation-index'))
        if (index > 0) handleCitationClick(index)
      }
    },
    [handleCitationClick]
  )

  // Render action cards from the registry (with bulk action support)
  const actionCards = useMemo(() => {
    if (!actions || actions.length === 0) return null

    // Check for bulk-actionable groups (2+ cards of the same approval type)
    const BULK_TYPES = ['expense_approval', 'invoice_posting']
    const typeCounts = new Map<string, ChatAction[]>()
    for (const action of actions) {
      if (BULK_TYPES.includes(action.type)) {
        const list = typeCounts.get(action.type) || []
        list.push(action)
        typeCounts.set(action.type, list)
      }
    }

    // Find the bulk group (if any with 2+ cards)
    let bulkType: string | null = null
    let bulkActions: ChatAction[] = []
    for (const [type, list] of typeCounts) {
      if (list.length >= 2) {
        bulkType = type
        bulkActions = list
        break
      }
    }

    // Separate non-bulk actions
    const bulkIds = new Set(bulkActions.map((a) => a.id))
    const nonBulkActions = bulkType
      ? actions.filter((a) => !bulkIds.has(a.id) || a.type !== bulkType)
      : actions

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div className="mt-2 space-y-2" onClick={handleCardCitationClick}>
        {/* Bulk action group */}
        {bulkType && bulkActions.length >= 2 && (
          <BulkActionBar
            actions={bulkActions}
            cardType={bulkType}
            isHistorical={isHistorical}
          />
        )}

        {/* Individual cards */}
        {nonBulkActions.map((action, idx) => {
          // Skip actions that are in the bulk group
          if (bulkType && action.type === bulkType && bulkIds.has(action.id)) return null

          try {
            const CardComponent = getActionCardComponent(action.type)
            return (
              <CardComponent
                key={action.id || `action-${idx}`}
                action={action}
                isHistorical={isHistorical}
                onViewDetails={onViewDetails}
              />
            )
          } catch (err) {
            console.warn('[MessageRenderer] Failed to render action card:', action.type, err)
            return null
          }
        })}
      </div>
    )
  }, [actions, isHistorical, onViewDetails, handleCardCitationClick])

  // Inline mode: render content directly without the bubble wrapper
  if (isInline && !isUser) {
    return (
      <>
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
          <ReactMarkdown
            rehypePlugins={[rehypeRaw, rehypeSanitize]}
            components={markdownComponents(handleCitationClick)}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
        {actionCards}
        <CitationOverlay
          citation={activeCitation}
          isOpen={isCitationOpen}
          onClose={handleCloseCitation}
        />
      </>
    )
  }

  return (
    <>
      <div
        className={`message-renderer ${isUser ? 'message-user' : 'message-assistant'} ${className}`}
      >
        <div
          className={`
            rounded-lg px-4 py-3 max-w-[85%] text-sm leading-relaxed
            ${
              isUser
                ? 'bg-primary text-primary-foreground ml-auto'
                : 'bg-card border border-border text-foreground'
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <>
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw, rehypeSanitize]}
                  components={markdownComponents(handleCitationClick)}
                >
                  {processedContent}
                </ReactMarkdown>
              </div>
              {actionCards}
            </>
          )}
        </div>
      </div>

      {/* Citation Overlay */}
      <CitationOverlay
        citation={activeCitation}
        isOpen={isCitationOpen}
        onClose={handleCloseCitation}
      />
    </>
  )
}

/** Shared markdown component overrides */
function markdownComponents(handleCitationClick: (index: number) => void) {
  return {
    // Handle citation superscripts
    sup: ({ children, ...props }: any) => {
      const citationIndex = props['data-citation-index']
      if (citationIndex) {
        return (
          <button
            type="button"
            className="inline-flex items-center text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors text-xs align-super"
            onClick={() => handleCitationClick(Number(citationIndex))}
            aria-label={`View citation ${citationIndex}`}
          >
            [{citationIndex}]
          </button>
        )
      }
      return <sup {...props}>{children}</sup>
    },
    // Style code blocks
    code: ({ children, className: codeClassName, ...props }: any) => {
      const isInline = !codeClassName
      if (isInline) {
        return (
          <code
            className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <code className={codeClassName} {...props}>
          {children}
        </code>
      )
    },
    // Style tables for financial data
    table: ({ children, ...props }: any) => (
      <div className="overflow-x-auto my-2">
        <table
          className="min-w-full border border-border rounded text-xs"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }: any) => (
      <th
        className="bg-muted px-3 py-2 text-left font-medium text-foreground border-b border-border"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td
        className="px-3 py-2 text-foreground border-b border-border"
        {...props}
      >
        {children}
      </td>
    ),
    // Style links
    a: ({ children, href, ...props }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 underline"
        {...props}
      >
        {children}
      </a>
    ),
  }
}
