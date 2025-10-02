'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, FileText, Globe, AlertCircle } from 'lucide-react'
import { CitationData } from '@/lib/tools/base-tool'

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
          bg-gray-800 border-l border-gray-700 shadow-2xl z-50
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          flex flex-col
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="citation-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-700 bg-gray-800/95 backdrop-blur">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 
                id="citation-title"
                className="text-lg font-semibold text-white truncate"
              >
                {citation.source_name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400 mt-1">
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
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
                <span className="text-blue-400 font-medium">
                  {(citation.confidence_score * 100).toFixed(1)}% confidence
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors ml-4 flex-shrink-0"
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
                <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
                  <span className="w-1 h-4 bg-blue-500 rounded-full mr-2"></span>
                  Relevant Content
                </h3>
                <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                  <p className="text-gray-100 text-sm leading-relaxed">
                    {citation.content_snippet}
                  </p>
                </div>
              </div>

              {/* Document Actions */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
                  <span className="w-1 h-4 bg-green-500 rounded-full mr-2"></span>
                  Document Access
                </h3>
                <div className="flex flex-col gap-3">
                  {citation.official_url && (
                    <a
                      href={citation.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
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
                      className="inline-flex items-center justify-center px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium rounded-lg transition-colors border border-gray-500"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View PDF Document
                    </a>
                  )}
                </div>
              </div>

              {/* Document Preview */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
                  <span className="w-1 h-4 bg-purple-500 rounded-full mr-2"></span>
                  Document Preview
                </h3>
                {citation.pdf_url ? (
                  // PDF Preview Section
                  <div className="bg-gray-700/30 rounded-lg border border-gray-600">
                    <div className="p-4 border-b border-gray-600">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-blue-400" />
                          <span className="text-sm text-gray-300">
                            PDF Document {citation.page_number && `• Page ${citation.page_number}`}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {citation.text_coordinates && (
                            <span className="text-xs text-gray-500 bg-gray-600 px-2 py-1 rounded">
                              Highlighted
                            </span>
                          )}
                          <a
                            href={citation.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Open Full PDF
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      {/* PDF Embed with proxy for CORS bypassing */}
                      <iframe
                        src={`/api/pdf-proxy?url=${encodeURIComponent(citation.pdf_url)}${citation.page_number ? `#page=${citation.page_number}` : ''}`}
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
                      <div className="hidden bg-gray-700 rounded p-8 text-center">
                        <FileText className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                        <h4 className="text-gray-300 font-medium mb-2">PDF Preview Not Available</h4>
                        <p className="text-gray-400 text-sm mb-4">
                          This PDF document cannot be embedded due to security restrictions or server configuration.
                        </p>
                        <div className="space-y-2">
                          <a
                            href={citation.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open PDF Document
                          </a>
                          <p className="text-xs text-gray-500 mt-2">
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
                  <div className="bg-gray-700/30 rounded-lg border border-gray-600">
                    <div className="p-4 border-b border-gray-600">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Globe className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-gray-300">
                            Government Website
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 bg-green-600/20 px-2 py-1 rounded">
                            Official Source
                          </span>
                          <a
                            href={citation.official_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-400 hover:text-green-300"
                          >
                            Open Website
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      {/* Loading State */}
                      {webPreviewLoading && (
                        <div className="absolute inset-0 bg-gray-700 flex items-center justify-center z-10">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto mb-2"></div>
                            <span className="text-sm text-gray-300">Loading website preview...</span>
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
                        <div className="bg-gray-700 rounded p-8 text-center h-96 flex flex-col justify-center">
                          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                          <h4 className="text-gray-300 font-medium mb-2">Website Preview Not Available</h4>
                          <p className="text-gray-400 text-sm mb-4 max-w-sm mx-auto">
                            This website cannot be embedded due to security policies (X-Frame-Options header).
                          </p>
                          <div className="space-y-2">
                            <a
                              href={citation.official_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors mx-auto"
                            >
                              <Globe className="w-4 h-4 mr-2" />
                              Visit Official Website
                            </a>
                            <p className="text-xs text-gray-500 mt-2">
                              URL: {new URL(citation.official_url).hostname}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Website URL Display */}
                      <div className="absolute bottom-2 left-2 bg-gray-800/90 rounded px-2 py-1 text-xs text-gray-300 max-w-xs truncate">
                        {new URL(citation.official_url).hostname}
                      </div>
                    </div>
                  </div>
                ) : (
                  // No Preview Available
                  <div className="bg-gray-700/30 rounded-lg p-8 text-center border border-gray-600 border-dashed">
                    <FileText className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                    <h4 className="text-gray-300 font-medium mb-2">No Document Preview Available</h4>
                    <p className="text-gray-400 text-sm max-w-sm mx-auto">
                      This citation does not have an associated document or website for preview.
                    </p>
                  </div>
                )}
              </div>

              {/* Metadata Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
                  <span className="w-1 h-4 bg-yellow-500 rounded-full mr-2"></span>
                  Citation Metadata
                </h3>
                <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                  <dl className="grid grid-cols-1 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-400 font-medium">Citation ID</dt>
                      <dd className="text-gray-200 font-mono">{citation.id}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400 font-medium">Reference Index</dt>
                      <dd className="text-gray-200">[^{citation.index}]</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400 font-medium">Confidence Score</dt>
                      <dd className="text-gray-200">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-600 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
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