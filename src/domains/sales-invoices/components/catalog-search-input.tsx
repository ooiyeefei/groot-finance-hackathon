'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { useCatalogItemSearch } from '../hooks/use-catalog-items'
import { formatCurrency } from '@/lib/utils/format-number'

interface CatalogSearchItem {
  _id: string
  name: string
  description?: string
  unitPrice: number
  currency: string
  sku?: string
  unitMeasurement?: string
  taxRate?: number
}

interface CatalogSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSelect: (item: CatalogSearchItem) => void
  searchField: 'sku' | 'name'
  placeholder?: string
  className?: string
}

export function CatalogSearchInput({
  value,
  onChange,
  onSelect,
  searchField,
  placeholder,
  className,
}: CatalogSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { results } = useCatalogItemSearch(value, isOpen, searchField)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(e.target.value.length > 0)
        }}
        onFocus={() => value.length > 0 && setIsOpen(true)}
        className={className}
      />
      {isOpen && results.length > 0 && (
        <div className="absolute z-20 left-0 min-w-64 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item._id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-foreground text-sm"
              onMouseDown={() => {
                onSelect(item)
                setIsOpen(false)
              }}
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-muted-foreground text-xs">
                {formatCurrency(item.unitPrice, item.currency)}
                {item.sku && ` · ${item.sku}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
