'use client'

/**
 * Custom Message Renderer
 *
 * Renders markdown content with citation support.
 * Parses [^N] citation markers and renders them as clickable superscripts
 * that open the CitationOverlay component.
 */

import { useMemo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import CitationOverlay from './citation-overlay'
import type { CitationData } from '@/lib/ai/tools/base-tool'

interface MessageRendererProps {
  content: string
  role: 'user' | 'assistant'
  citations?: CitationData[]
  className?: string
}

/**
 * Renders a chat message with markdown formatting and citation support.
 */
export function MessageRenderer({
  content,
  role,
  citations = [],
  className = '',
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

  // Process content to replace [^N] markers with clickable elements
  const processedContent = useMemo(() => {
    if (!citations.length) return content

    // Replace [^N] markers with HTML superscript elements
    return content.replace(
      /\[\^(\d+)\]/g,
      (_match, num) =>
        `<sup class="citation-marker" data-citation-index="${num}">[${num}]</sup>`
    )
  }, [content, citations])

  const isUser = role === 'user'

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
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
              <ReactMarkdown
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  // Handle citation superscripts
                  sup: ({ children, ...props }) => {
                    const citationIndex = (props as any)['data-citation-index']
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
                  code: ({ children, className: codeClassName, ...props }) => {
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
                  table: ({ children, ...props }) => (
                    <div className="overflow-x-auto my-2">
                      <table
                        className="min-w-full border border-border rounded text-xs"
                        {...props}
                      >
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children, ...props }) => (
                    <th
                      className="bg-muted px-3 py-2 text-left font-medium text-foreground border-b border-border"
                      {...props}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children, ...props }) => (
                    <td
                      className="px-3 py-2 text-foreground border-b border-border"
                      {...props}
                    >
                      {children}
                    </td>
                  ),
                  // Style links
                  a: ({ children, href, ...props }) => (
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
                }}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
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
