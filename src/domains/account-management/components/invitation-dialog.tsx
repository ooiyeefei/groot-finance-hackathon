'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mail, X, AlertTriangle, ArrowRight } from 'lucide-react'

interface AvailableManager {
  user_id: string
  full_name?: string
  email?: string
}

interface InvitationDialogProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (data: InvitationFormData) => Promise<void>
  isLoading?: boolean
  teamLimitExceeded?: boolean
  teamLimitMessage?: string
  onDismissLimitError?: () => void
  availableManagers?: AvailableManager[]
}

export interface InvitationFormData {
  email: string
  role: 'employee' | 'manager' | 'finance_admin'
  manager_id?: string
  employee_id?: string
  department?: string
  job_title?: string
}

export default function InvitationDialog({
  isOpen,
  onClose,
  onInvite,
  isLoading = false,
  teamLimitExceeded = false,
  teamLimitMessage,
  onDismissLimitError,
  availableManagers = []
}: InvitationDialogProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<InvitationFormData>({
    email: '',
    role: 'employee',
    manager_id: '',
    employee_id: '',
    department: '',
    job_title: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!isOpen) return null

  // Handle upgrade navigation
  const handleUpgrade = () => {
    onClose()
    router.push('/settings/billing')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Basic validation
    const newErrors: Record<string, string> = {}

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.role) {
      newErrors.role = 'Role is required'
    }

    // Employees MUST have a manager assigned
    if (formData.role === 'employee' && !formData.manager_id) {
      newErrors.manager_id = 'Manager is required for employees'
    }

    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      return
    }

    try {
      await onInvite(formData)
      // Reset form on success
      setFormData({
        email: '',
        role: 'employee',
        manager_id: '',
        employee_id: '',
        department: '',
        job_title: ''
      })
      setErrors({})
    } catch (error) {
      // Error handled by parent component
    }
  }

  const handleClose = () => {
    if (isLoading) return
    setFormData({
      email: '',
      role: 'employee',
      manager_id: '',
      employee_id: '',
      department: '',
      job_title: ''
    })
    setErrors({})
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:items-center sm:p-6">
        <div className="relative transform overflow-hidden rounded-xl bg-card border border-border shadow-2xl text-left transition-all sm:my-8 w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                Invite Team Member
              </h3>
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Team Limit Exceeded Warning (T045) */}
          {teamLimitExceeded && (
            <div className="mx-6 mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-amber-500 font-medium">Team Limit Reached</h4>
                  <p className="text-amber-400/80 text-sm mt-1">
                    {teamLimitMessage || 'You\'ve reached the maximum number of team members for your current plan.'}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <Button
                      type="button"
                      onClick={handleUpgrade}
                      className="bg-amber-500 hover:bg-amber-600 text-black text-sm"
                    >
                      Upgrade Plan
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                    {onDismissLimitError && (
                      <button
                        type="button"
                        onClick={onDismissLimitError}
                        className="text-amber-400/60 hover:text-amber-400 text-sm"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
            {/* Email Field */}
            <div>
              <Label htmlFor="email" className="text-foreground">
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 bg-input border-border text-foreground placeholder:text-muted-foreground"
                placeholder="user@example.com"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-destructive text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Role Field */}
            <div>
              <Label htmlFor="role" className="text-foreground">
                Role *
              </Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'employee' | 'manager' | 'finance_admin') =>
                  setFormData({ ...formData, role: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger className="mt-1 bg-input border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="employee" className="text-foreground">
                    Employee
                  </SelectItem>
                  <SelectItem value="manager" className="text-foreground">
                    Manager
                  </SelectItem>
                  <SelectItem value="finance_admin" className="text-foreground">
                    Finance Admin
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-destructive text-sm mt-1">{errors.role}</p>
              )}
            </div>

            {/* Manager Field - Required for employees */}
            <div>
              <Label htmlFor="manager" className="text-foreground">
                Manager {formData.role === 'employee' ? '*' : '(Optional)'}
              </Label>
              <Select
                value={formData.manager_id || ''}
                onValueChange={(value) =>
                  setFormData({ ...formData, manager_id: value === 'none' ? '' : value })
                }
                disabled={isLoading}
              >
                <SelectTrigger className={`mt-1 bg-input text-foreground ${errors.manager_id ? 'border-destructive' : 'border-border'}`}>
                  <SelectValue placeholder={formData.role === 'employee' ? 'Select manager' : 'No manager'} />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {formData.role !== 'employee' && (
                    <SelectItem value="none" className="text-foreground">
                      No Manager
                    </SelectItem>
                  )}
                  {availableManagers.map((manager) => (
                    <SelectItem
                      key={manager.user_id}
                      value={manager.user_id}
                      className="text-foreground"
                    >
                      {manager.full_name || manager.email || 'Manager'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.manager_id && (
                <p className="text-destructive text-sm mt-1">{errors.manager_id}</p>
              )}
              {formData.role === 'employee' && availableManagers.length === 0 && (
                <p className="text-amber-500 text-sm mt-1">
                  No managers available. Add a manager first before inviting employees.
                </p>
              )}
            </div>

            {/* Optional Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="employee_id" className="text-muted-foreground">
                  Employee ID
                </Label>
                <Input
                  id="employee_id"
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="mt-1 bg-input border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Optional"
                  disabled={isLoading}
                />
              </div>

              <div>
                <Label htmlFor="department" className="text-muted-foreground">
                  Department
                </Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="mt-1 bg-input border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Optional"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="job_title" className="text-muted-foreground">
                Job Title
              </Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                className="mt-1 bg-input border-border text-foreground placeholder:text-muted-foreground"
                placeholder="Optional"
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    <span>Sending...</span>
                  </div>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}