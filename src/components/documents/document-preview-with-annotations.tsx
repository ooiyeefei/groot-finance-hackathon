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
  coordinateReference?: { width?: number; height?: number }
  onBoxHover?: (box: BoundingBox | null) => void
  onBoxClick?: (box: BoundingBox) => void
  document?: {
    extracted_data?: {
      metadata?: {
        coordinateReference?: { width?: number; height?: number }
        layoutElements?: any
      }
    }
  }
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
  coordinateReference,
  onBoxHover,
  onBoxClick,
  document
}: DocumentPreviewProps) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [hoveredBox, setHoveredBox] = useState<BoundingBox | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleImageLoad = () => {
    setImageLoaded(true)
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      })
    }
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
    if (!imageLoaded || !imageRef.current) return {}
    
    const img = imageRef.current
    const displayWidth = img.clientWidth
    const displayHeight = img.clientHeight
    
    // Get OCR coordinate reference dimensions from metadata
    const metadata = document?.extracted_data?.metadata
    const coordinateReference = metadata?.coordinateReference || metadata?.layoutElements
    
    // Extract reference dimensions - try multiple possible sources
    let referenceWidth = displayWidth
    let referenceHeight = displayHeight
    
    if (coordinateReference) {
      // Check if coordinate reference has dimensions
      if (coordinateReference.width && coordinateReference.height) {
        referenceWidth = coordinateReference.width
        referenceHeight = coordinateReference.height
      } else if (coordinateReference.dimensions) {
        referenceWidth = coordinateReference.dimensions.width || displayWidth
        referenceHeight = coordinateReference.dimensions.height || displayHeight
      }
    }
    
    // If we still don't have reference dimensions, try to get them from image natural size
    if (referenceWidth === displayWidth && referenceHeight === displayHeight && img.naturalWidth && img.naturalHeight) {
      referenceWidth = img.naturalWidth
      referenceHeight = img.naturalHeight
    }
    
    // Calculate proper scaling ratios
    const scaleX = displayWidth / referenceWidth
    const scaleY = displayHeight / referenceHeight
    
    // Transform coordinates with proper scaling and padding offset
    // The image container has p-4 (16px) padding that needs to be accounted for
    const CONTAINER_PADDING = 16 // p-4 = 1rem = 16px
    
    // CRITICAL FIX: Account for CSS scale transform applied to the container
    // The bounding boxes are rendered inside a scaled container, so we need to
    // apply the inverse scale factor to position them correctly
    const cssScaleFactor = scale // This is the zoom scale state variable
    
    const left = (box.x1 * scaleX / cssScaleFactor) + (CONTAINER_PADDING / cssScaleFactor)
    const top = (box.y1 * scaleY / cssScaleFactor) + (CONTAINER_PADDING / cssScaleFactor)
    const width = (box.x2 - box.x1) * scaleX / cssScaleFactor
    const height = (box.y2 - box.y1) * scaleY / cssScaleFactor
    
    // Enhanced debugging - log detailed transformation info
    console.log(`[BoundingBox DEBUG] Transform calculation:`)
    console.log(`  - Original box: [${box.x1}, ${box.y1}, ${box.x2}, ${box.y2}] "${box.text}"`)
    console.log(`  - Display dimensions: ${displayWidth}x${displayHeight}`)
    console.log(`  - Reference dimensions: ${referenceWidth}x${referenceHeight}`)
    console.log(`  - Scale factors: ${scaleX.toFixed(4)}x${scaleY.toFixed(4)}`)
    console.log(`  - CSS zoom scale: ${cssScaleFactor.toFixed(4)}x`)
    console.log(`  - Image natural size: ${img.naturalWidth}x${img.naturalHeight}`)
    console.log(`  - Coordinate reference source: ${metadata ? 'metadata' : 'fallback'}`)
    console.log(`  - Container padding: ${CONTAINER_PADDING}px (adjusted: ${(CONTAINER_PADDING / cssScaleFactor).toFixed(2)}px)`)
    console.log(`  - Transformed position: left=${left.toFixed(2)}px, top=${top.toFixed(2)}px`)
    console.log(`  - Transformed size: ${width.toFixed(2)}x${height.toFixed(2)}px`)
    console.log(`  - Expected on-screen box: [${left}, ${top}, ${left + width}, ${top + height}]`)
    
    // Additional debug: check for potential coordinate system mismatches
    if (referenceWidth !== img.naturalWidth || referenceHeight !== img.naturalHeight) {
      console.warn(`[BoundingBox WARNING] Coordinate reference (${referenceWidth}x${referenceHeight}) != natural image size (${img.naturalWidth}x${img.naturalHeight})`)
      console.warn(`  This suggests OCR coordinates may be based on a different image resolution`)
    }
    
    if (scaleX !== scaleY) {
      console.warn(`[BoundingBox WARNING] Non-uniform scaling detected: scaleX=${scaleX.toFixed(4)} != scaleY=${scaleY.toFixed(4)}`)
      console.warn(`  This may cause aspect ratio distortion in bounding boxes`)
    }
    
    const isHovered = hoveredBox === box
    // Use blue color for all bounding boxes
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
      <div className="flex items-center justify-between mb-4 p-2 bg-gray-700/30 rounded-lg">
        <div className="flex items-center space-x-2">
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
        
        <div className="text-xs text-gray-400">
          {boundingBoxes.length} regions detected
        </div>
      </div>

      {/* Document Container */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-auto bg-gray-900 rounded-lg border border-gray-600"
      >
        {imageUrl ? (
          <div 
            className="relative inline-block min-w-full min-h-full p-4"
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

      {/* Legend */}
      {boundingBoxes.length > 0 && (
        <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
          <div className="text-xs font-medium text-gray-300 mb-2">Detection Categories</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_COLORS).map(([category, color]) => {
              const count = boundingBoxes.filter(box => box.category === category).length
              if (count === 0) return null
              
              return (
                <div key={category} className="flex items-center space-x-1">
                  <div 
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-gray-400">
                    {category} ({count})
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}