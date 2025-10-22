'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, FileText, Globe, AlertCircle } from 'lucide-react'
import { CitationData } from '@/lib/ai/tools/base-tool'

interface CitationOverlayProps {
  citation: CitationData | null
  isOpen: boolean
  onClose: () => void
}

export default function CitationOverlay({ citation, isOpen, onClose }: CitationOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [webPreviewError, setWebPreviewError] = useState(false)
  const [webPreviewLoading, setWebPreviewLoading] = useState(true)

  // Handle ESC key press
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey)
      // Prevent body scroll when overlay is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Reset web preview state when citation changes
  useEffect(() => {
    if (citation) {
      setWebPreviewError(false)
      setWebPreviewLoading(true)
    }
  }, [citation])

  // Focus trap management
  useEffect(() => {
    if (isOpen && overlayRef.current) {
      const focusableElements = overlayRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement?.focus()
              e.preventDefault()
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement?.focus()
              e.preventDefault()
            }
          }
        }
      }

      document.addEventListener('keydown', handleTabKey)
      firstElement?.focus()

      return () => {
        document.removeEventListener('keydown', handleTabKey)
      }
    }
  }, [isOpen])

  if (!isOpen || !citation) {
    return null
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Overlay Panel */}
      <div
        ref={overlayRef}
        className={`
          fixed top-0 right-0 h-full w-full max-w-md sm:max-w-lg lg:max-w-xl xl:max-w-2xl
          bg-record-layer-1 border-l border-record-border shadow-2xl z-50
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          flex flex-col
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="citation-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-record-border bg-record-layer-1 backdrop-blur">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="citation-title"
                className="text-lg font-semibold text-foreground truncate"
              >
                {citation.source_name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-success rounded-full mr-2"></span>
                  {citation.country}
                </span>
                {citation.section && (
                  <>
                    <span>•</span>
                    <span className="truncate">{citation.section}</span>
                  </>
                )}
                {citation.page_number && (
                  <>
                    <span>•</span>
                    <span>Page {citation.page_number}</span>
                  </>
                )}
                <span>•</span>
                <span className="text-primary font-medium">
                  {(citation.confidence_score * 100).toFixed(1)}% confidence
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0"
            aria-label="Close citation details"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Relevant Content Section */}
          <div className="p-6">
            <div className="space-y-6">
              {/* Content Preview */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center">
                  <span className="w-1 h-4 bg-primary rounded-full mr-2"></span>
                  Relevant Content
                </h3>
                <div className="bg-record-layer-2 rounded-lg p-4 border border-record-border">
                  <p className="text-foreground text-sm leading-relaxed">
                    {citation.content_snippet}
                  </p>
                </div>
              </div>

              {/* Document Actions */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center">
                  <span className="w-1 h-4 bg-success rounded-full mr-2"></span>
                  Document Access
                </h3>
                <div className="flex flex-col gap-3">
                  {citation.official_url && (
                    <a
                      href={citation.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Official Document
                    </a>
                  )}
                  {citation.pdf_url && (
                    <a
                      href={citation.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 py-3 bg-secondary hover:bg-secondary-hover text-secondary-foreground text-sm font-medium rounded-lg transition-colors border border-input"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View PDF Document
                    </a>
                  )}
                </div>
              </div>

              {/* Document Preview */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center">
                  <span className="w-1 h-4 bg-purple-500 rounded-full mr-2"></span>
                  Document Preview
                </h3>
                {citation.pdf_url ? (
                  // PDF Preview Section
                  <div className="bg-record-layer-2 rounded-lg border border-record-border">
                    <div className="p-4 border-b border-record-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            PDF Document {citation.page_number && `• Page ${citation.page_number}`}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {citation.text_coordinates && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                              Highlighted
                            </span>
                          )}
                          <a
                            href={citation.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:text-primary/80"
                          >
                            Open Full PDF
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      {/* PDF Embed with proxy for CORS bypassing */}
                      <iframe
                        src={`/api/v1/chat/citation-preview?url=${encodeURIComponent(citation.pdf_url)}${citation.page_number ? `#page=${citation.page_number}` : ''}`}
                        className="w-full h-96 border-0"
                        title="PDF Document Preview"
                        onLoad={() => {
                          // PDF loaded successfully
                        }}
                        onError={(e) => {
                          console.warn('PDF proxy iframe failed to load, showing fallback');
                          (e.target as HTMLElement).style.display = 'none';
                          const fallback = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'block';
                        }}
                      />
                      {/* Enhanced fallback for PDFs that can't be embedded */}
                      <div className="hidden bg-record-layer-2 rounded p-8 text-center">
                        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <h4 className="text-foreground font-medium mb-2">PDF Preview Not Available</h4>
                        <p className="text-muted-foreground text-sm mb-4">
                          This PDF document cannot be embedded due to security restrictions or server configuration.
                        </p>
                        <div className="space-y-2">
                          <a
                            href={citation.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open PDF Document
                          </a>
                          <p className="text-xs text-muted-foreground mt-2">
                            URL: {citation.pdf_url.length > 50 ? citation.pdf_url.substring(0, 50) + '...' : citation.pdf_url}
                          </p>
                        </div>
                      </div>
                      
                      {/* Text Coordinates Overlay */}
                      {citation.text_coordinates && (
                        <div className="absolute top-2 right-2 bg-yellow-500/20 border border-yellow-500 rounded px-2 py-1">
                          <span className="text-xs text-yellow-300">
                            📍 Citation Location: ({citation.text_coordinates.x1}, {citation.text_coordinates.y1})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : citation.official_url ? (
                  // Website Preview Section
                  <div className="bg-record-layer-2 rounded-lg border border-record-border">
                    <div className="p-4 border-b border-record-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Globe className="w-4 h-4 text-success" />
                          <span className="text-sm text-muted-foreground">
                            Government Website
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground bg-success/20 px-2 py-1 rounded">
                            Official Source
                          </span>
                          <a
                            href={citation.official_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-success hover:text-success/80"
                          >
                            Open Website
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      {/* Loading State */}
                      {webPreviewLoading && (
                        <div className="absolute inset-0 bg-record-layer-2 flex items-center justify-center z-10">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-success mx-auto mb-2"></div>
                            <span className="text-sm text-muted-foreground">Loading website preview...</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Web Preview with Enhanced Error Handling */}
                      {!webPreviewError ? (
                        <iframe
                          src={citation.official_url}
                          className="w-full h-96 border-0"
                          title="Official Website Preview"
                          onLoad={(e) => {
                            setWebPreviewLoading(false);
                            // Additional check for iframe content accessibility
                            const iframe = e.target as HTMLIFrameElement;
                            setTimeout(() => {
                              try {
                                // Test if we can access iframe content or if it's blocked
                                if (iframe.contentWindow && iframe.contentDocument === null) {
                                  console.warn('Website iframe blocked by X-Frame-Options, showing fallback');
                                  setWebPreviewError(true);
                                }
                              } catch (error) {
                                console.warn('Website iframe access restricted, showing fallback');
                                setWebPreviewError(true);
                              }
                            }, 1000); // Give iframe time to load
                          }}
                          onError={() => {
                            console.warn('Website iframe failed to load, showing fallback');
                            setWebPreviewError(true);
                            setWebPreviewLoading(false);
                          }}
                          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                        />
                      ) : (
                        // Enhanced fallback for websites that can't be embedded
                        <div className="bg-record-layer-2 rounded p-8 text-center h-96 flex flex-col justify-center">
                          <AlertCircle className="w-12 h-12 text-warning mx-auto mb-3" />
                          <h4 className="text-foreground font-medium mb-2">Website Preview Not Available</h4>
                          <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
                            This website cannot be embedded due to security policies (X-Frame-Options header).
                          </p>
                          <div className="space-y-2">
                            <a
                              href={citation.official_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-4 py-2 bg-success hover:bg-success/90 text-success-foreground text-sm rounded-lg transition-colors mx-auto"
                            >
                              <Globe className="w-4 h-4 mr-2" />
                              Visit Official Website
                            </a>
                            <p className="text-xs text-muted-foreground mt-2">
                              URL: {new URL(citation.official_url).hostname}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Website URL Display */}
                      <div className="absolute bottom-2 left-2 bg-record-layer-2 rounded px-2 py-1 text-xs text-muted-foreground max-w-xs truncate">
                        {new URL(citation.official_url).hostname}
                      </div>
                    </div>
                  </div>
                ) : (
                  // No Preview Available
                  <div className="bg-record-layer-2 rounded-lg p-8 text-center border border-record-border border-dashed">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <h4 className="text-foreground font-medium mb-2">No Document Preview Available</h4>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                      This citation does not have an associated document or website for preview.
                    </p>
                  </div>
                )}
              </div>

              {/* Metadata Section */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center">
                  <span className="w-1 h-4 bg-warning rounded-full mr-2"></span>
                  Citation Metadata
                </h3>
                <div className="bg-record-layer-2 rounded-lg p-4 border border-record-border">
                  <dl className="grid grid-cols-1 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground font-medium">Citation ID</dt>
                      <dd className="text-foreground font-mono">{citation.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground font-medium">Reference Index</dt>
                      <dd className="text-foreground">[^{citation.index}]</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground font-medium">Confidence Score</dt>
                      <dd className="text-foreground">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${citation.confidence_score * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-xs">{(citation.confidence_score * 100).toFixed(1)}%</span>
                        </div>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}