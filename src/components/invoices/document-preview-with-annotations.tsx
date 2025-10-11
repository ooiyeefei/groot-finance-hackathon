'use client'

import { useState, useRef } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface BoundingBox {
  x1: number
  y1: number  
  x2: number
  y2: number
  category: string
  text: string
}

interface DocumentPreviewProps {
  imageUrl?: string
  fileName: string
  fileType: string
  fileSize: number
  boundingBoxes?: BoundingBox[]
  onBoxHover?: (box: BoundingBox | null) => void
  onBoxClick?: (box: BoundingBox) => void
  extraToolbarActions?: React.ReactNode // New prop for extra toolbar actions
  hideRegionsCount?: boolean // New prop to hide regions count
}

// Color mapping for different layout categories
const CATEGORY_COLORS = {
  'Caption': '#3B82F6',     // blue-500
  'Footnote': '#8B5CF6',    // violet-500  
  'Formula': '#F59E0B',     // amber-500
  'List-item': '#10B981',   // emerald-500
  'Page-footer': '#6B7280', // gray-500
  'Page-header': '#374151', // gray-700
  'Picture': '#EC4899',     // pink-500
  'Section-header': '#DC2626', // red-600
  'Table': '#059669',       // emerald-600
  'Text': '#1F2937',        // gray-800
  'Title': '#7C2D12'        // red-900
}

export default function DocumentPreviewWithAnnotations({
  imageUrl,
  fileName,
  fileType,
  fileSize,
  boundingBoxes = [],
  onBoxHover,
  onBoxClick,
  extraToolbarActions,
  hideRegionsCount = false
}: DocumentPreviewProps) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [hoveredBox, setHoveredBox] = useState<BoundingBox | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleImageLoad = () => {
    setImageLoaded(true)
  }

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3))
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.25))
  const handleResetView = () => {
    setScale(1)
    setRotation(0)
  }

  const handleBoxHover = (box: BoundingBox | null) => {
    setHoveredBox(box)
    onBoxHover?.(box)
  }

  const handleBoxClick = (box: BoundingBox) => {
    onBoxClick?.(box)
  }

  // Calculate bounding box positions relative to displayed image
  const getBoxStyle = (box: BoundingBox) => {
    if (!imageLoaded || !imageRef.current || !containerRef.current) return {}
    
    // Check if coordinates are already in percentage format (< 100)
    const arePercentages = box.x1 <= 100 && box.y1 <= 100 && box.x2 <= 100 && box.y2 <= 100
    
    if (arePercentages) {
      // Account for CSS layout factors (container has p-4 padding and border)
      // The percentage positioning is relative to the image element itself,
      // so no additional offset calculations are needed since the overlays
      // are positioned absolutely within the same parent as the image
      
      // Use percentage-based positioning relative to image dimensions
      const left = box.x1
      const top = box.y1  
      const width = box.x2 - box.x1
      const height = box.y2 - box.y1
      
      console.log(`[BBox] CSS-aware positioning: coords [${box.x1}%,${box.y1}%,${box.x2}%,${box.y2}%] → positioned at left:${left}%, top:${top}%, width:${width}%, height:${height}%`)
      
      const isHovered = hoveredBox === box
      const color = '#3B82F6' // blue-500
      
      return {
        position: 'absolute' as const,
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        border: `2px solid ${color}`,
        backgroundColor: isHovered ? `${color}20` : `${color}10`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        zIndex: isHovered ? 10 : 1,
        // Ensure bounding box is positioned relative to the image, not the container
        transform: 'translateZ(0)' // Force hardware acceleration for better positioning
      }
    }
    
    // Fallback: Legacy pixel-based scaling for old data
    const img = imageRef.current
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight
    const displayWidth = img.clientWidth
    const displayHeight = img.clientHeight
    
    // Prevent division by zero
    if (naturalWidth === 0 || naturalHeight === 0) {
      console.warn('[BBox] Natural image dimensions are zero, skipping bounding box')
      return {}
    }
    
    // Calculate scale factors from OCR coordinates to display coordinates
    const scaleX = displayWidth / naturalWidth
    const scaleY = displayHeight / naturalHeight
    
    // Transform coordinates with proper scaling
    let left = box.x1 * scaleX
    let top = box.y1 * scaleY
    let width = (box.x2 - box.x1) * scaleX
    let height = (box.y2 - box.y1) * scaleY
    
    // Handle edge cases: ensure bounding boxes stay within image bounds
    left = Math.max(0, Math.min(left, displayWidth - width))
    top = Math.max(0, Math.min(top, displayHeight - height))
    width = Math.min(width, displayWidth - left)
    height = Math.min(height, displayHeight - top)
    
    console.log(`[BBox] Legacy pixel scaling: [${box.x1},${box.y1},${box.x2},${box.y2}] × [${scaleX.toFixed(3)},${scaleY.toFixed(3)}] → [${left.toFixed(1)},${top.toFixed(1)},${width.toFixed(1)},${height.toFixed(1)}]`)
    
    const isHovered = hoveredBox === box
    const color = '#3B82F6' // blue-500
    
    return {
      position: 'absolute' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: `2px solid ${color}`,
      backgroundColor: isHovered ? `${color}20` : `${color}10`,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      zIndex: isHovered ? 10 : 1
    }
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center mb-4 gap-3">
        {/* Zoom Controls Section - Separate background */}
        <div className="flex items-center space-x-2 bg-gray-700/30 rounded-lg p-2 flex-grow-[2]">
          <button
            onClick={handleZoomOut}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-300 min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-gray-600 mx-2" />
          <button
            onClick={handleResetView}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* AI Extract Button Section - Separate section with matching height */}
        {extraToolbarActions && (
          <div className="flex-grow-[1] flex justify-end">
            <div className="h-10 flex items-center">
              {extraToolbarActions}
            </div>
          </div>
        )}

        {/* Regions Count (when not hidden) */}
        {!hideRegionsCount && !extraToolbarActions && (
          <div className="text-xs text-gray-400 flex-grow-[1] text-right bg-gray-700/30 rounded-lg p-2 h-10 flex items-center justify-end">
            {boundingBoxes.length} regions detected
          </div>
        )}
      </div>

      {/* Document Container */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-auto bg-gray-900 rounded-lg border border-gray-600 p-4"
      >
        {imageUrl ? (
          <div 
            className="relative inline-block min-w-full min-h-full"
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: 'top left',
              transition: 'transform 0.2s ease'
            }}
          >
            {/* Document Image */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt={fileName}
              className="max-w-full h-auto shadow-lg"
              onLoad={handleImageLoad}
              onError={() => setImageLoaded(false)}
            />
            
            {/* Bounding Box Overlays */}
            {imageLoaded && boundingBoxes.map((box, index) => (
              <div
                key={index}
                style={getBoxStyle(box)}
                onMouseEnter={() => handleBoxHover(box)}
                onMouseLeave={() => handleBoxHover(null)}
                onClick={() => handleBoxClick(box)}
                title={`${box.category}: ${box.text || 'No text'}`}
              />
            ))}
            
            {/* Hover Tooltip */}
            {hoveredBox && (
              <div className="absolute top-2 left-2 bg-gray-800 text-white p-2 rounded-lg shadow-lg z-20 max-w-xs">
                <div className="text-xs font-medium text-blue-400 mb-1">
                  {hoveredBox.category}
                </div>
                {hoveredBox.text && (
                  <div className="text-xs text-gray-300 truncate">
                    {hoveredBox.text.substring(0, 100)}
                    {hoveredBox.text.length > 100 ? '...' : ''}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  [{hoveredBox.x1}, {hoveredBox.y1}, {hoveredBox.x2}, {hoveredBox.y2}]
                </div>
              </div>
            )}
          </div>
        ) : (
          // Placeholder when no image
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">Document Preview</p>
              <p className="text-gray-500 text-xs mt-1">
                {fileType === 'application/pdf' ? 'PDF Document' : 'Image Document'}
              </p>
              <p className="text-gray-500 text-xs">
                {(fileSize / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}