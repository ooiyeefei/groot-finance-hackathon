'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, Eye, EyeOff } from 'lucide-react'

interface MultiPageDocumentPreviewProps {
  sourceRecordId: string
  documentType?: 'invoice' | 'expense_claim' | 'application'
  className?: string
}

interface DocumentInfo {
  pageCount: number
  imageUrls: string[]
  error?: string
}

function MultiPageDocumentPreview({
  sourceRecordId,
  documentType = 'invoice',
  className = ''
}: MultiPageDocumentPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(0.75)
  const [rotation, setRotation] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isIntersecting, setIsIntersecting] = useState(true) // Default true for immediate loading

  // Fetch document information (simplified without caching to fix infinite loop)
  useEffect(() => {
    const fetchDocumentInfo = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetching document information for preview

        // Call appropriate API based on document type
        const getApiEndpoint = () => {
          switch (documentType) {
            case 'expense_claim':
              return `/api/v1/expense-claims/${sourceRecordId}/image-url`
            case 'application':
              return `/api/v1/applications/${sourceRecordId}/image-url`
            case 'invoice':
            default:
              return `/api/v1/invoices/${sourceRecordId}/image-url`
          }
        }

        const response = await fetch(getApiEndpoint())

        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.status}`)
        }

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Failed to load document')
        }

        // Handle different API response formats
        let imageUrls: string[] = []

        if (result.data.availablePages && Array.isArray(result.data.availablePages)) {
          // New API format with availablePages - for now, single page with current imageUrl
          imageUrls = result.data.imageUrl ? [result.data.imageUrl] : []
        } else if (result.data.annotated_urls && Array.isArray(result.data.annotated_urls)) {
          // Legacy format with annotated_urls array
          imageUrls = result.data.annotated_urls.filter(Boolean)
        } else if (result.data.annotated_url || result.data.original_url || result.data.imageUrl) {
          // Single image formats
          const singleUrl = result.data.annotated_url || result.data.original_url || result.data.imageUrl
          imageUrls = singleUrl ? [singleUrl] : []
        }

        const docInfo: DocumentInfo = {
          pageCount: imageUrls.length,
          imageUrls: imageUrls
        }

        setDocumentInfo(docInfo)

      } catch (err) {
        console.error('[Document Preview] Error fetching document:', err)
        setError(err instanceof Error ? err.message : 'Failed to load document')
      } finally {
        setLoading(false)
      }
    }

    if (sourceRecordId) {
      fetchDocumentInfo()
    }
  }, [sourceRecordId])

  // Enhanced prefetching for better performance
  useEffect(() => {
    if (!documentInfo) return

    const prefetchUrls = []

    // Prefetch next page (priority)
    if (currentPage < documentInfo.pageCount) {
      const nextPageUrl = documentInfo.imageUrls[currentPage] // currentPage is 1-based, array is 0-based
      if (nextPageUrl) prefetchUrls.push(nextPageUrl)
    }

    // Prefetch previous page (lower priority)
    if (currentPage > 1) {
      const prevPageUrl = documentInfo.imageUrls[currentPage - 2]
      if (prevPageUrl) prefetchUrls.push(prevPageUrl)
    }

    const links: HTMLLinkElement[] = []

    prefetchUrls.forEach((url, index) => {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.href = url
      // Add higher priority to next page
      if (index === 0) link.setAttribute('importance', 'high')
      document.head.appendChild(link)
      links.push(link)
    })

    return () => {
      links.forEach(link => {
        try {
          document.head.removeChild(link)
        } catch (e) {
          // Link may have been removed already
        }
      })
    }
  }, [currentPage, documentInfo])

  // Define callback functions first
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
      setImageLoaded(false)
    }
  }, [currentPage])

  const goToNextPage = useCallback(() => {
    if (documentInfo && currentPage < documentInfo.pageCount) {
      setCurrentPage(prev => prev + 1)
      setImageLoaded(false)
    }
  }, [currentPage, documentInfo])

  // Throttled zoom functions for better performance
  const zoomIn = useCallback(() => {
    setScale(prev => {
      const newScale = Math.min(prev * 1.25, 3)
      return Math.round(newScale * 1000) / 1000 // Round to avoid floating point precision issues
    })
  }, [])

  const zoomOut = useCallback(() => {
    setScale(prev => {
      const newScale = Math.max(prev / 1.25, 0.25)
      return Math.round(newScale * 1000) / 1000 // Round to avoid floating point precision issues
    })
  }, [])

  const fitToWidth = useCallback(() => {
    setScale(0.75)
  }, [])

  const rotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360)
  }, [])

  // Enhanced keyboard navigation with accessibility
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // Don't interfere with form inputs
      }

      // Only handle document navigation when the document container has focus or when globally appropriate
      const isDocumentFocused = document.activeElement?.closest('[data-document-preview]') !== null

      switch (e.key) {
        case 'ArrowLeft':
          if (isDocumentFocused || e.altKey) {
            e.preventDefault()
            goToPreviousPage()
            // Announce page change for screen readers
            announcePageChange(currentPage - 1, documentInfo?.pageCount || 1)
          }
          break
        case 'ArrowRight':
          if (isDocumentFocused || e.altKey) {
            e.preventDefault()
            goToNextPage()
            // Announce page change for screen readers
            announcePageChange(currentPage + 1, documentInfo?.pageCount || 1)
          }
          break
        case 'Home':
          if (isDocumentFocused) {
            e.preventDefault()
            setCurrentPage(1)
            setImageLoaded(false)
            announcePageChange(1, documentInfo?.pageCount || 1)
          }
          break
        case 'End':
          if (isDocumentFocused && documentInfo) {
            e.preventDefault()
            setCurrentPage(documentInfo.pageCount)
            setImageLoaded(false)
            announcePageChange(documentInfo.pageCount, documentInfo.pageCount)
          }
          break
        case '=':
        case '+':
          if ((e.ctrlKey || e.metaKey) && isDocumentFocused) {
            e.preventDefault()
            zoomIn()
            announceZoomChange(scale * 1.25)
          }
          break
        case '-':
          if ((e.ctrlKey || e.metaKey) && isDocumentFocused) {
            e.preventDefault()
            zoomOut()
            announceZoomChange(scale / 1.25)
          }
          break
        case '0':
          if ((e.ctrlKey || e.metaKey) && isDocumentFocused) {
            e.preventDefault()
            fitToWidth()
            announceZoomChange(0.75)
          }
          break
        case 'r':
        case 'R':
          if (isDocumentFocused) {
            e.preventDefault()
            rotate()
            announceRotation((rotation + 90) % 360)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [goToPreviousPage, goToNextPage, zoomIn, zoomOut, fitToWidth, rotate, currentPage, documentInfo, scale, rotation])

  // Screen reader announcements
  const announcePageChange = useCallback((page: number, total: number) => {
    const message = `Page ${page} of ${total}`
    const announcement = document.createElement('div')
    announcement.setAttribute('aria-live', 'polite')
    announcement.setAttribute('aria-atomic', 'true')
    announcement.className = 'sr-only'
    announcement.textContent = message
    document.body.appendChild(announcement)
    setTimeout(() => document.body.removeChild(announcement), 1000)
  }, [])

  const announceZoomChange = useCallback((newScale: number) => {
    const percentage = Math.round(newScale * 100)
    const message = `Zoom ${percentage}%`
    const announcement = document.createElement('div')
    announcement.setAttribute('aria-live', 'polite')
    announcement.className = 'sr-only'
    announcement.textContent = message
    document.body.appendChild(announcement)
    setTimeout(() => document.body.removeChild(announcement), 1000)
  }, [])

  const announceRotation = useCallback((degrees: number) => {
    const message = `Document rotated ${degrees} degrees`
    const announcement = document.createElement('div')
    announcement.setAttribute('aria-live', 'polite')
    announcement.className = 'sr-only'
    announcement.textContent = message
    document.body.appendChild(announcement)
    setTimeout(() => document.body.removeChild(announcement), 1000)
  }, [])

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
  }, [])

  const handleImageError = useCallback(() => {
    setError('Failed to load document image')
    setImageLoaded(false)
  }, [])

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-record-layer-1 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-record-supporting text-sm">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error || !documentInfo) {
    return (
      <div className={`flex items-center justify-center h-full bg-record-layer-1 ${className}`}>
        <div className="text-center p-4">
          <EyeOff className="w-12 h-12 text-record-supporting-light mx-auto mb-2" />
          <p className="text-record-supporting text-sm mb-1">Unable to load document</p>
          <p className="text-record-supporting-light text-xs">{error}</p>
        </div>
      </div>
    )
  }

  const currentImageUrl = documentInfo.imageUrls[currentPage - 1] // Convert to 0-based index

  return (
    <div
      className={`flex flex-col h-full bg-record-layer-1 ${className}`}
      data-document-preview
      role="application"
      aria-label="Document viewer with navigation controls"
    >
      {/* Document Controls Header */}
      <div className="flex items-center justify-between p-3 border-b border-record-border bg-record-layer-2">
        <div className="flex items-center space-x-2">
          <Eye className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <span className="text-record-title text-sm font-medium" id="document-preview-title">Document Preview</span>
        </div>

        {/* Page Navigation */}
        {documentInfo.pageCount > 1 && (
          <div
            className="flex items-center space-x-2"
            role="group"
            aria-label="Page navigation"
          >
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="p-1 text-record-supporting hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
              aria-label={`Go to previous page. Current page ${currentPage} of ${documentInfo.pageCount}`}
              aria-describedby="page-info"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <span
              className="text-record-supporting text-sm px-2"
              id="page-info"
              aria-live="polite"
              aria-atomic="true"
            >
              Page {currentPage} of {documentInfo.pageCount}
            </span>

            <button
              onClick={goToNextPage}
              disabled={currentPage === documentInfo.pageCount}
              className="p-1 text-record-supporting hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
              aria-label={`Go to next page. Current page ${currentPage} of ${documentInfo.pageCount}`}
              aria-describedby="page-info"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Zoom and Rotation Controls */}
        <div
          className="flex items-center space-x-1"
          role="group"
          aria-label="Document view controls"
        >
          <button
            onClick={zoomOut}
            className="p-1 text-record-supporting hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
            aria-label={`Zoom out. Current zoom ${Math.round(scale * 100)}%`}
            title="Zoom out (Ctrl+-)"
            aria-describedby="zoom-info"
          >
            <ZoomOut className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            onClick={fitToWidth}
            className="p-1 text-record-supporting hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
            aria-label="Reset zoom to 100%"
            title="Reset zoom (Ctrl+0)"
            aria-describedby="zoom-info"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            onClick={zoomIn}
            className="p-1 text-record-supporting hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
            aria-label={`Zoom in. Current zoom ${Math.round(scale * 100)}%`}
            title="Zoom in (Ctrl++)"
            aria-describedby="zoom-info"
          >
            <ZoomIn className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            onClick={rotate}
            className="p-1 text-record-supporting hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
            aria-label={`Rotate document 90 degrees. Current rotation ${rotation} degrees`}
            title="Rotate 90° (R key)"
            aria-describedby="rotation-info"
          >
            <RotateCw className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Hidden status indicators for screen readers */}
          <span className="sr-only" id="zoom-info" aria-live="polite">
            Zoom level: {Math.round(scale * 100)}%
          </span>
          <span className="sr-only" id="rotation-info" aria-live="polite">
            Rotation: {rotation} degrees
          </span>
        </div>
      </div>

      {/* Document Image Container */}
      <div
        className="flex-1 overflow-auto bg-record-layer-2 relative"
        role="img"
        aria-labelledby="document-preview-title"
        aria-describedby="document-description"
        tabIndex={0}
      >
        <div className="flex items-center justify-center min-h-full p-4">
          {currentImageUrl && (
            <div className="relative">
              {!imageLoaded && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-record-layer-1 rounded"
                  aria-hidden="true"
                >
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                </div>
              )}
              <img
                src={currentImageUrl}
                alt={`Document page ${currentPage} of ${documentInfo.pageCount}. Zoom level ${Math.round(scale * 100)}%. Rotation ${rotation} degrees.`}
                className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  transform: `scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center'
                }}
                onLoad={handleImageLoad}
                onError={handleImageError}
                loading="lazy"
                decoding="async"
                fetchPriority="high"
                sizes="(max-width: 768px) 100vw, 50vw"
                role="presentation"
              />
            </div>
          )}
        </div>

        {/* Hidden description for screen readers */}
        <span className="sr-only" id="document-description">
          Document viewer. Navigate with arrow keys, zoom with Ctrl plus/minus, rotate with R key,
          go to first page with Home, go to last page with End.
        </span>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="p-2 border-t border-record-border bg-record-layer-2">
        <p className="text-xs text-record-supporting-light text-center" role="status" aria-live="polite">
          Keyboard: ← → navigate • Home/End first/last • Ctrl +/- zoom • Ctrl 0 reset • R rotate
          {documentInfo.pageCount > 1 && ` • ${documentInfo.pageCount} pages total`}
        </p>
      </div>
    </div>
  )
}

// Memoize the component to prevent unnecessary re-renders
export default memo(MultiPageDocumentPreview)