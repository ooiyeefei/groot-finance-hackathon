'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// --- Types ---

export type PeriodMode = 'range' | 'point-in-time'

export interface PeriodSelectorProps {
  mode: PeriodMode
  onPeriodChange: (dateFrom: string, dateTo: string) => void
  /** Fiscal year start month (1 = January, default). */
  fiscalYearStart?: number
}

type PresetKey =
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-fy'
  | 'last-fy'
  | 'custom'

interface Preset {
  key: PresetKey
  label: string
}

const PRESETS: Preset[] = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'this-quarter', label: 'This Quarter' },
  { key: 'last-quarter', label: 'Last Quarter' },
  { key: 'this-fy', label: 'This Financial Year' },
  { key: 'last-fy', label: 'Last Financial Year' },
]

// --- Date helpers ---

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function lastDayOfMonth(year: number, month: number): Date {
  // month is 1-based; Date(year, month, 0) gives last day of that month
  return new Date(year, month, 0)
}

function computePresetRange(
  key: PresetKey,
  fiscalYearStart: number
): { from: string; to: string } {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1 // 1-based

  switch (key) {
    case 'this-month': {
      const from = new Date(year, month - 1, 1)
      const to = lastDayOfMonth(year, month)
      return { from: fmt(from), to: fmt(to) }
    }
    case 'last-month': {
      const lm = month === 1 ? 12 : month - 1
      const ly = month === 1 ? year - 1 : year
      const from = new Date(ly, lm - 1, 1)
      const to = lastDayOfMonth(ly, lm)
      return { from: fmt(from), to: fmt(to) }
    }
    case 'this-quarter': {
      const q = Math.ceil(month / 3)
      const qStart = (q - 1) * 3 + 1
      const from = new Date(year, qStart - 1, 1)
      const to = lastDayOfMonth(year, qStart + 2)
      return { from: fmt(from), to: fmt(to) }
    }
    case 'last-quarter': {
      const q = Math.ceil(month / 3)
      const prevQ = q === 1 ? 4 : q - 1
      const prevY = q === 1 ? year - 1 : year
      const qStart = (prevQ - 1) * 3 + 1
      const from = new Date(prevY, qStart - 1, 1)
      const to = lastDayOfMonth(prevY, qStart + 2)
      return { from: fmt(from), to: fmt(to) }
    }
    case 'this-fy': {
      // Fiscal year that contains today
      const fys = fiscalYearStart
      let fyStartYear: number
      if (month >= fys) {
        fyStartYear = year
      } else {
        fyStartYear = year - 1
      }
      const from = new Date(fyStartYear, fys - 1, 1)
      const to = lastDayOfMonth(fyStartYear + 1, fys - 1 || 12)
      // If fys is 1 (Jan), FY is Jan-Dec same year
      const fyEndMonth = fys === 1 ? 12 : fys - 1
      const fyEndYear = fys === 1 ? fyStartYear : fyStartYear + 1
      const toFixed = lastDayOfMonth(fyEndYear, fyEndMonth)
      return { from: fmt(from), to: fmt(toFixed) }
    }
    case 'last-fy': {
      const fys = fiscalYearStart
      let fyStartYear: number
      if (month >= fys) {
        fyStartYear = year - 1
      } else {
        fyStartYear = year - 2
      }
      const from = new Date(fyStartYear, fys - 1, 1)
      const fyEndMonth = fys === 1 ? 12 : fys - 1
      const fyEndYear = fys === 1 ? fyStartYear : fyStartYear + 1
      const to = lastDayOfMonth(fyEndYear, fyEndMonth)
      return { from: fmt(from), to: fmt(to) }
    }
    default:
      return { from: fmt(today), to: fmt(today) }
  }
}

// --- Component ---

export function PeriodSelector({
  mode,
  onPeriodChange,
  fiscalYearStart = 1,
}: PeriodSelectorProps) {
  const [activePreset, setActivePreset] = useState<PresetKey>('this-month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [pointInTimeDate, setPointInTimeDate] = useState('')

  // Fire initial "This Month" on mount
  useEffect(() => {
    const { from, to } = computePresetRange('this-month', fiscalYearStart)
    if (mode === 'point-in-time') {
      onPeriodChange(to, to)
    } else {
      onPeriodChange(from, to)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePreset = useCallback(
    (key: PresetKey) => {
      setActivePreset(key)
      const { from, to } = computePresetRange(key, fiscalYearStart)
      if (mode === 'point-in-time') {
        setPointInTimeDate(to)
        onPeriodChange(to, to)
      } else {
        setCustomFrom(from)
        setCustomTo(to)
        onPeriodChange(from, to)
      }
    },
    [fiscalYearStart, mode, onPeriodChange]
  )

  const handleCustomFromChange = useCallback(
    (value: string) => {
      setCustomFrom(value)
      setActivePreset('custom')
      if (value && customTo) {
        onPeriodChange(value, customTo)
      }
    },
    [customTo, onPeriodChange]
  )

  const handleCustomToChange = useCallback(
    (value: string) => {
      setCustomTo(value)
      setActivePreset('custom')
      if (customFrom && value) {
        onPeriodChange(customFrom, value)
      }
    },
    [customFrom, onPeriodChange]
  )

  const handlePointInTimeDateChange = useCallback(
    (value: string) => {
      setPointInTimeDate(value)
      setActivePreset('custom')
      if (value) {
        onPeriodChange(value, value)
      }
    },
    [onPeriodChange]
  )

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.key}
            variant={activePreset === preset.key ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handlePreset(preset.key)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Custom date picker */}
      <div className="flex items-end gap-4">
        {mode === 'point-in-time' ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-foreground">As of</Label>
            <input
              type="date"
              value={pointInTimeDate}
              onChange={(e) => handlePointInTimeDateChange(e.target.value)}
              className="h-10 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-foreground">Start date</Label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => handleCustomFromChange(e.target.value)}
                className="h-10 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-foreground">End date</Label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => handleCustomToChange(e.target.value)}
                className="h-10 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
