'use client'

import React, { useState } from 'react'
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

  // SECURITY FIX: Enhanced HTML sanitization for tables
  const sanitizeTable = (tableHtml: string) => {
    return tableHtml
      // Add Tailwind classes to table elements
      .replace(/<table[^>]*>/gi, '<table class="min-w-full divide-y divide-gray-600">')
      .replace(/<thead[^>]*>/gi, '<thead class="bg-gray-700">')
      .replace(/<tbody[^>]*>/gi, '<tbody class="bg-gray-800 divide-y divide-gray-600">')
      .replace(/<tr[^>]*>/gi, '<tr class="hover:bg-gray-700/50 transition-colors">')
      .replace(/<th[^>]*>/gi, '<th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">')
      .replace(/<td[^>]*>/gi, '<td class="px-3 py-2 text-sm text-gray-200">')
      // SECURITY: Remove all potentially dangerous content
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove all event handlers
      .replace(/javascript\s*:/gi, '') // Remove javascript: URIs
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
      .replace(/<link[^>]*>/gi, '') // Remove link tags
      .replace(/<meta[^>]*>/gi, '') // Remove meta tags
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
      .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '') // Remove javascript hrefs
      .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, '') // Remove javascript src
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove iframes
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '') // Remove objects
      .replace(/<embed[^>]*>/gi, '') // Remove embeds
      .replace(/data\s*:\s*[^;]*;base64/gi, 'data:blocked') // Block data URIs
  }

  // SECURITY FIX: Safe markdown-like formatting without dangerouslySetInnerHTML
  const renderTextContent = (text: string) => {
    // Split text into lines for processing
    const lines = text.split('\n');

    return (
      <div>
        {lines.map((line, index) => {
          // Handle headers
          if (line.startsWith('### ')) {
            return (
              <h3 key={index} className="text-lg font-semibold text-white mt-4 mb-2">
                {line.slice(4)}
              </h3>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2 key={index} className="text-xl font-semibold text-white mt-4 mb-2">
                {line.slice(3)}
              </h2>
            );
          }
          if (line.startsWith('# ')) {
            return (
              <h1 key={index} className="text-2xl font-bold text-white mt-4 mb-2">
                {line.slice(2)}
              </h1>
            );
          }

          // Handle inline formatting (bold/italic)
          const renderInlineFormatting = (text: string) => {
            const parts: (string | React.ReactElement)[] = [];
            let currentIndex = 0;
            let partKey = 0;

            // Find bold text (**text**)
            const boldRegex = /\*\*(.*?)\*\*/g;
            let match: RegExpExecArray | null;
            const boldMatches: Array<{start: number, end: number, content: string, type: string}> = [];
            while ((match = boldRegex.exec(text)) !== null) {
              boldMatches.push({ start: match.index!, end: match.index! + match[0].length, content: match[1], type: 'bold' });
            }

            // Find italic text (*text*)
            const italicRegex = /\*(.*?)\*/g;
            const italicMatches: Array<{start: number, end: number, content: string, type: string}> = [];
            while ((match = italicRegex.exec(text)) !== null) {
              // Skip if this is part of a bold match
              const isPartOfBold = boldMatches.some(bold => match!.index! >= bold.start && match!.index! < bold.end);
              if (!isPartOfBold) {
                italicMatches.push({ start: match.index!, end: match.index! + match[0].length, content: match[1], type: 'italic' });
              }
            }

            // Combine and sort all matches
            const allMatches = [...boldMatches, ...italicMatches].sort((a, b) => a.start - b.start);

            // Build parts array
            allMatches.forEach(match => {
              // Add text before match
              if (match.start > currentIndex) {
                parts.push(text.slice(currentIndex, match.start));
              }

              // Add formatted match
              if (match.type === 'bold') {
                parts.push(
                  <strong key={`bold-${partKey++}`} className="font-semibold text-white">
                    {match.content}
                  </strong>
                );
              } else if (match.type === 'italic') {
                parts.push(
                  <em key={`italic-${partKey++}`} className="italic text-gray-300">
                    {match.content}
                  </em>
                );
              }

              currentIndex = match.end;
            });

            // Add remaining text
            if (currentIndex < text.length) {
              parts.push(text.slice(currentIndex));
            }

            return parts.length > 0 ? parts : [text];
          };

          // Return regular text with inline formatting
          return (
            <div key={index} className="text-gray-300">
              {renderInlineFormatting(line)}
            </div>
          );
        })}
      </div>
    );
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
          <Check className="w-4 h-4 text-success-foreground" />
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