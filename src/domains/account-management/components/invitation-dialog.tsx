'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mail, X } from 'lucide-react'

interface InvitationDialogProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (data: InvitationFormData) => Promise<void>
  isLoading?: boolean
}

export interface InvitationFormData {
  email: string
  role: 'employee' | 'manager' | 'admin'
  employee_id?: string
  department?: string
  job_title?: string
}

export default function InvitationDialog({
  isOpen,
  onClose,
  onInvite,
  isLoading = false
}: InvitationDialogProps) {
  const [formData, setFormData] = useState<InvitationFormData>({
    email: '',
    role: 'employee',
    employee_id: '',
    department: '',
    job_title: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!isOpen) return null

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
        <div className="relative transform overflow-hidden rounded-xl bg-gray-800 shadow-2xl text-left transition-all sm:my-8 w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-white">
                Invite Team Member
              </h3>
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
            {/* Email Field */}
            <div>
              <Label htmlFor="email" className="text-white">
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                placeholder="user@example.com"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-red-400 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Role Field */}
            <div>
              <Label htmlFor="role" className="text-white">
                Role *
              </Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'employee' | 'manager' | 'admin') =>
                  setFormData({ ...formData, role: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger className="mt-1 bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="employee" className="text-white hover:bg-gray-600">
                    Employee
                  </SelectItem>
                  <SelectItem value="manager" className="text-white hover:bg-gray-600">
                    Manager
                  </SelectItem>
                  <SelectItem value="admin" className="text-white hover:bg-gray-600">
                    Admin
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-red-400 text-sm mt-1">{errors.role}</p>
              )}
            </div>

            {/* Optional Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="employee_id" className="text-gray-300">
                  Employee ID
                </Label>
                <Input
                  id="employee_id"
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="mt-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  placeholder="Optional"
                  disabled={isLoading}
                />
              </div>

              <div>
                <Label htmlFor="department" className="text-gray-300">
                  Department
                </Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="mt-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  placeholder="Optional"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="job_title" className="text-gray-300">
                Job Title
              </Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                className="mt-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                placeholder="Optional"
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="bg-gray-600 hover:bg-gray-700 text-white border-gray-600"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-500"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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