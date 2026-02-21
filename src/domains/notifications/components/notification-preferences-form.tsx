'use client'

import { useState, useEffect } from 'react'
import { Bell, Mail, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationPreferences, NotificationPreferences } from '../hooks/use-notification-preferences'
import { useToast } from '@/components/ui/toast'

const CATEGORIES = [
  { key: 'approval', label: 'Approval Requests', description: 'Expense claim submissions and approvals' },
  { key: 'anomaly', label: 'Anomaly Alerts', description: 'Financial anomaly and spending alerts' },
  { key: 'compliance', label: 'Compliance Warnings', description: 'Tax, receipt, and compliance gaps' },
  { key: 'insight', label: 'AI Insights', description: 'Proactive financial intelligence' },
  { key: 'invoice_processing', label: 'Invoice Processing', description: 'Document processing updates' },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']

export function NotificationPreferencesForm() {
  const { preferences, loading, updatePreferences } = useNotificationPreferences()
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences | null>(null)

  useEffect(() => {
    if (preferences && !localPrefs) {
      setLocalPrefs(preferences)
    }
  }, [preferences, localPrefs])

  if (loading || !localPrefs) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const toggleInApp = (key: CategoryKey) => {
    setLocalPrefs((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        inApp: { ...prev.inApp, [key]: !prev.inApp[key] },
      }
    })
  }

  const toggleEmail = (key: CategoryKey) => {
    setLocalPrefs((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        email: { ...prev.email, [key]: !prev.email[key] },
      }
    })
  }

  const handleSave = async () => {
    if (!localPrefs) return
    setSaving(true)
    try {
      await updatePreferences(localPrefs)
      addToast({
        title: 'Preferences saved',
        description: 'Your notification preferences have been updated.',
        type: 'success',
      })
    } catch {
      addToast({
        title: 'Error saving preferences',
        description: 'Please try again.',
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Notification Preferences</h3>
      </div>

      {/* Category Grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr,80px,80px] gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
          <span>Category</span>
          <span className="text-center flex items-center justify-center gap-1">
            <Bell className="w-3 h-3" /> In-App
          </span>
          <span className="text-center flex items-center justify-center gap-1">
            <Mail className="w-3 h-3" /> Email
          </span>
        </div>

        {/* Category Rows */}
        {CATEGORIES.map((category) => (
          <div
            key={category.key}
            className="grid grid-cols-[1fr,80px,80px] gap-2 px-4 py-3 border-t border-border items-center"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{category.label}</p>
              <p className="text-xs text-muted-foreground">{category.description}</p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => toggleInApp(category.key)}
                className={`w-9 h-5 rounded-full relative overflow-hidden transition-colors ${
                  localPrefs.inApp[category.key]
                    ? 'bg-primary'
                    : 'bg-input'
                }`}
              >
                <span
                  className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    localPrefs.inApp[category.key] ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => toggleEmail(category.key)}
                className={`w-9 h-5 rounded-full relative overflow-hidden transition-colors ${
                  localPrefs.email[category.key]
                    ? 'bg-primary'
                    : 'bg-input'
                }`}
              >
                <span
                  className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    localPrefs.email[category.key] ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Digest Settings */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Email Digest</p>
        <div className="flex items-center gap-4">
          <label className="text-xs text-muted-foreground">Frequency:</label>
          <select
            value={localPrefs.digestFrequency}
            onChange={(e) =>
              setLocalPrefs((prev) =>
                prev ? { ...prev, digestFrequency: e.target.value as 'daily' | 'weekly' } : prev
              )
            }
            className="bg-input border border-border rounded-md px-2 py-1 text-sm text-foreground"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <CheckCircle className="w-4 h-4 mr-2" />
          )}
          Save Preferences
        </Button>
      </div>
    </div>
  )
}
