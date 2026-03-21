'use client'

/**
 * Custom Message Renderer
 *
 * Renders markdown content with citation support and action cards.
 * Parses [^N] citation markers and renders them as clickable superscripts
 * that open the CitationOverlay component.
 * Renders action cards from the extensible registry after text content.
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

/** Allow table elements through the sanitizer (GFM tables) */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  attributes: {
    ...defaultSchema.attributes,
    th: [...(defaultSchema.attributes?.th || []), 'align'],
    td: [...(defaultSchema.attributes?.td || []), 'align'],
    // Allow data-citation-index on sup elements
    sup: [...(defaultSchema.attributes?.sup || []), 'data-citation-index', 'className'],
  },
}
import CitationOverlay from './citation-overlay'
import { getActionCardComponent } from './action-cards'
import { BulkActionBar } from './action-cards/bulk-action-bar'
import type { CitationData } from '@/lib/ai/tools/base-tool'
import type { ChatAction } from '../lib/sse-parser'
import { CorrectionFeedback } from './correction-feedback'
import { FileImage } from 'lucide-react'

/** Module-level counter for assistant messages to trigger periodic "Was this helpful?" prompt */
let assistantMessageCounter = 0

/** Attachment metadata stored in message.metadata.attachments */
interface MessageAttachment {
  id: string
  s3Path: string
  mimeType: string
  filename: string
  size: number
}

interface MessageRendererProps {
  content: string
  role: 'user' | 'assistant'
  citations?: CitationData[]
  actions?: ChatAction[]
  attachments?: MessageAttachment[]
  isHistorical?: boolean
  /** When true, renders without the outer bubble wrapper (used inside streaming container) */
  isInline?: boolean
  className?: string
  onViewDetails?: (payload: { type: 'chart' | 'table' | 'dashboard'; title: string; data: unknown }) => void
  /** Metadata for correction feedback on assistant messages */
  messageId?: string
  conversationId?: string
  originalQuery?: string
  originalIntent?: string
  originalToolName?: string
}

/**
 * Renders a chat message with markdown formatting, citation support, and action cards.
 */
export function MessageRenderer({
  content,
  role,
  citations = [],
  actions,
  attachments,
  isHistorical = true,
  isInline = false,
  className = '',
  onViewDetails,
  messageId,
  conversationId,
  originalQuery,
  originalIntent,
  originalToolName,
}: MessageRendererProps) {
  const [activeCitation, setActiveCitation] = useState<CitationData | null>(null)
  const [isCitationOpen, setIsCitationOpen] = useState(false)

  // Track assistant message index for periodic "Was this helpful?" prompt
  const showPromptLabel = useMemo(() => {
    if (role !== 'assistant' || !originalQuery) return false
    assistantMessageCounter += 1
    return assistantMessageCounter % 3 === 0
  }, [role, originalQuery])

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

  // Process content: strip residual ```actions blocks, suggestions, and replace citation markers
  const { processedContent, inlineSuggestions } = useMemo(() => {
    // Strip ```actions and ```suggestions JSON blocks — handles raw, single-escaped, and multi-escaped backticks.
    // Also catches ```json blocks containing action card type objects.
    let processed = content
      .replace(/(?:\\*`){3,}actions[\s\S]*?(?:\\*`){3,}/g, '')
      .replace(/(?:\\*`){3,}suggestions[\s\S]*?(?:\\*`){3,}/g, '')
      .replace(/(?:\\*`){3,}(?:json)?\s*\n\s*\[\s*\{[\s\S]*?"type"\s*:\s*"(?:invoice_posting|cash_flow_dashboard|compliance_alert|budget_alert|spending_time_series|anomaly_card|vendor_comparison|expense_approval)"[\s\S]*?(?:\\*`){3,}/g, '')

    // Extract and strip inline suggestions that appear as plain text:
    // e.g. "suggestions: ["Show my expenses", "Check transactions"]"
    // or "suggestions: ["a", "b"]" at end of content
    const suggestions: string[] = []

    // Pattern 1: inline `suggestions: [...]` (plain text, not in a fenced block)
    const inlineMatch = processed.match(/\n?\s*suggestions:\s*(\[[\s\S]*?\])\s*$/i)
    if (inlineMatch?.[1]) {
      try {
        const parsed = JSON.parse(inlineMatch[1])
        if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === 'string')) {
          suggestions.push(...parsed.slice(0, 3))
        }
      } catch {
        // Fallback: extract quoted strings
        const strings = inlineMatch[1].match(/"([^"]+)"/g)
        if (strings) {
          suggestions.push(...strings.slice(0, 3).map((s) => s.replace(/^"|"$/g, '')))
        }
      }
      processed = processed.replace(inlineMatch[0], '')
    }

    // Pattern 2: fenced ```suggestions block that wasn't caught by the escaped-backtick regex
    // (e.g. actual triple backticks from the LLM)
    const fencedMatch = processed.match(/\n?\s*```suggestions\s*\n?([\s\S]*?)```/i)
    if (fencedMatch?.[1] && suggestions.length === 0) {
      try {
        const parsed = JSON.parse(fencedMatch[1].trim())
        if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === 'string')) {
          suggestions.push(...parsed.slice(0, 3))
        }
      } catch {
        const strings = fencedMatch[1].match(/"([^"]+)"/g)
        if (strings) {
          suggestions.push(...strings.slice(0, 3).map((s) => s.replace(/^"|"$/g, '')))
        }
      }
      processed = processed.replace(fencedMatch[0], '')
    }

    processed = processed.trim()

    if (!citations.length) return { processedContent: processed, inlineSuggestions: suggestions }

    // Replace [^N] markers with HTML superscript elements
    const withCitations = processed.replace(
      /\[\^(\d+)\]/g,
      (_match, num) =>
        `<sup class="citation-marker" data-citation-index="${num}">[${num}]</sup>`
    )
    return { processedContent: withCitations, inlineSuggestions: suggestions }
  }, [content, citations])

  const isUser = role === 'user'

  // Strip [Attached: ...] markers from user message content for clean display
  const cleanUserContent = useMemo(() => {
    if (!isUser) return content
    return content.replace(/\[Attached: [^\]]+\]\n*/g, '').trim()
  }, [isUser, content])

  // Determine which attachments to show (from props or parsed from content markers)
  const displayAttachments = useMemo(() => {
    if (!isUser) return [] as { filename: string; mimeType: string; s3Path: string }[]
    if (attachments && attachments.length > 0) return attachments
    // Fallback: parse from [Attached: filename (mimeType, s3Path: path)] markers
    const parsed: { filename: string; mimeType: string; s3Path: string }[] = []
    const markerRegex = /\[Attached: ([^(]+)\(([^,]+), s3Path: ([^)]+)\)\]/g
    let m
    while ((m = markerRegex.exec(content)) !== null) {
      parsed.push({ filename: m[1].trim(), mimeType: m[2].trim(), s3Path: m[3].trim() })
    }
    return parsed
  }, [isUser, attachments, content])

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

  // Render inline suggestion pills extracted from message content
  const suggestionPills = useMemo(() => {
    if (inlineSuggestions.length === 0) return null
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {inlineSuggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => {
              // Dispatch a custom event so chat-window can pick it up and send
              window.dispatchEvent(new CustomEvent('chat:send-message', { detail: { message: text } }))
            }}
            className="text-xs px-3 py-1.5 rounded-full border border-primary/25 text-foreground
              hover:bg-primary/10 hover:border-primary/40 transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    )
  }, [inlineSuggestions])

  // Inline mode: render content directly without the bubble wrapper
  if (isInline && !isUser) {
    return (
      <>
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
            components={markdownComponents(handleCitationClick)}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
        {actionCards}
        {suggestionPills}
        {originalQuery && (
          <CorrectionFeedback
            messageId={messageId}
            conversationId={conversationId}
            originalQuery={originalQuery}
            originalIntent={originalIntent}
            originalToolName={originalToolName}
            showPromptLabel={showPromptLabel}
          />
        )}
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
            <>
              {displayAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-1.5">
                  {displayAttachments.map((att, i) => (
                    <AttachmentThumbnail
                      key={att.s3Path || i}
                      filename={att.filename}
                      mimeType={att.mimeType}
                      s3Path={att.s3Path}
                    />
                  ))}
                </div>
              )}
              {cleanUserContent && <p className="whitespace-pre-wrap">{cleanUserContent}</p>}
            </>
          ) : (
            <>
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                  components={markdownComponents(handleCitationClick)}
                >
                  {processedContent}
                </ReactMarkdown>
              </div>
              {actionCards}
              {suggestionPills}
              {originalQuery && (
                <CorrectionFeedback
                  messageId={messageId}
                  conversationId={conversationId}
                  originalQuery={originalQuery}
                  originalIntent={originalIntent}
                  originalToolName={originalToolName}
                  showPromptLabel={showPromptLabel}
                />
              )}
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

/** Attachment thumbnail that fetches a pre-signed URL from the server */
function AttachmentThumbnail({ filename, mimeType, s3Path }: { filename: string; mimeType: string; s3Path: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [enlarged, setEnlarged] = useState(false)
  const isImage = mimeType.startsWith('image/')

  // Fetch pre-signed URL on mount for image attachments
  useEffect(() => {
    if (!isImage || !s3Path) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetch(`/api/v1/chat/attachment-url?s3Path=${encodeURIComponent(s3Path)}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.url) setImageUrl(data.url)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isImage, s3Path])

  if (!isImage) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-primary-foreground/20 rounded px-1.5 py-0.5">
        <FileImage className="w-3 h-3" />
        {filename}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => imageUrl && setEnlarged(true)}
        className="w-20 h-20 rounded-lg overflow-hidden bg-primary-foreground/10 border border-primary-foreground/20 cursor-pointer hover:opacity-80 transition-opacity"
        title="Click to enlarge"
      >
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileImage className="w-5 h-5 text-primary-foreground/60" />
          </div>
        )}
      </button>

      {/* Lightbox overlay */}
      {enlarged && imageUrl && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEnlarged(false)}
        >
          <button
            type="button"
            onClick={() => setEnlarged(false)}
            className="absolute top-4 right-4 text-white hover:text-white/80 z-10"
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={filename}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
