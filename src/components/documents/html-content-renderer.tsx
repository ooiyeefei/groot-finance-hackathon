'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface HtmlContentRendererProps {
  content: string
  className?: string
}

export default function HtmlContentRenderer({ content, className = '' }: HtmlContentRendererProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy content:', error)
    }
  }

  // Parse and render mixed HTML/markdown content
  const renderContent = (text: string) => {
    // Split content by HTML table tags to separate tables from other content
    const parts = text.split(/(<table[^>]*>[\s\S]*?<\/table>)/gi)
    
    return parts.map((part, index) => {
      if (part.match(/^<table[^>]*>/i)) {
        // This is an HTML table - render it properly
        return (
          <div key={index} className="my-4 overflow-x-auto">
            <div 
              className="inline-block min-w-full rounded-lg overflow-hidden border border-gray-600"
              dangerouslySetInnerHTML={{ __html: sanitizeTable(part) }}
            />
          </div>
        )
      } else if (part.trim()) {
        // This is regular text content - render as markdown-like
        return (
          <div key={index} className="whitespace-pre-wrap">
            {renderTextContent(part)}
          </div>
        )
      }
      return null
    }).filter(Boolean)
  }

  // Sanitize and style HTML tables
  const sanitizeTable = (tableHtml: string) => {
    return tableHtml
      // Add Tailwind classes to table elements
      .replace(/<table[^>]*>/gi, '<table class="min-w-full divide-y divide-gray-600">')
      .replace(/<thead[^>]*>/gi, '<thead class="bg-gray-700">')
      .replace(/<tbody[^>]*>/gi, '<tbody class="bg-gray-800 divide-y divide-gray-600">')
      .replace(/<tr[^>]*>/gi, '<tr class="hover:bg-gray-700/50 transition-colors">')
      .replace(/<th[^>]*>/gi, '<th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">')
      .replace(/<td[^>]*>/gi, '<td class="px-3 py-2 text-sm text-gray-200">')
      // Remove any potentially dangerous attributes
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '')
  }

  // Render regular text content with basic markdown-like formatting
  const renderTextContent = (text: string) => {
    // Handle basic markdown patterns
    const formatted = text
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
      // Italic text  
      .replace(/\*(.*?)\*/g, '<em class="italic text-gray-300">$1</em>')
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-white mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-white mt-4 mb-2">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-4 mb-2">$1</h1>')

    return <div dangerouslySetInnerHTML={{ __html: formatted }} />
  }

  return (
    <div className={`relative ${className}`}>
      {/* Copy Button */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors z-10"
        title="Copy content"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content Container */}
      <div className="bg-gray-900 rounded-lg p-4 max-h-[32rem] overflow-auto">
        <style jsx>{`
          /* Custom table styles for better readability */
          :global(.bg-gray-900 table) {
            font-size: 0.875rem;
            line-height: 1.25rem;
          }
          
          :global(.bg-gray-900 table th) {
            font-weight: 600;
            background-color: rgb(55 65 81); /* gray-700 */
          }
          
          :global(.bg-gray-900 table td) {
            border-top: 1px solid rgb(75 85 99); /* gray-600 */
          }
          
          :global(.bg-gray-900 table tr:first-child td) {
            border-top: none;
          }
          
          /* Zebra striping for better readability */
          :global(.bg-gray-900 table tbody tr:nth-child(even)) {
            background-color: rgb(31 41 55); /* gray-800 */
          }
          
          :global(.bg-gray-900 table tbody tr:nth-child(odd)) {
            background-color: rgb(17 24 39); /* gray-900 */
          }
          
          /* Responsive table handling */
          @media (max-width: 640px) {
            :global(.bg-gray-900 table) {
              font-size: 0.75rem;
            }
            
            :global(.bg-gray-900 table th),
            :global(.bg-gray-900 table td) {
              padding: 0.5rem;
            }
          }
        `}</style>
        
        <div className="prose prose-invert prose-sm max-w-none">
          {renderContent(content)}
        </div>
      </div>
    </div>
  )
}