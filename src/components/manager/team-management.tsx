'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import InvitationDialog, { type InvitationFormData } from '@/components/ui/invitation-dialog'
import { Users, UserCheck, AlertCircle, UserPlus, Copy, Check } from 'lucide-react'

interface TeamMember {
  id: string
  user_id: string
  employee_id: string
  full_name?: string
  email?: string
  department?: string
  job_title?: string
  role_permissions: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  created_at: string
}

export default function TeamManagement() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [departments, setDepartments] = useState<string[]>([])
  const [updatingDepartment, setUpdatingDepartment] = useState<string | null>(null)
  const [showNewDepartmentDialog, setShowNewDepartmentDialog] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [addingDepartment, setAddingDepartment] = useState(false)
  const [pendingUserDepartmentUpdate, setPendingUserDepartmentUpdate] = useState<string | null>(null)

  useEffect(() => {
    fetchTeamMembers()
    fetchDepartments()
  }, [])

  const fetchDepartments = async () => {
    try {
      // Extract unique departments from team members
      const uniqueDepartments = Array.from(new Set(
        teamMembers
          .map(member => member.department)
          .filter((dept: string | undefined): dept is string => dept !== undefined && dept !== null && dept !== 'No Department')
      )) as string[]
      setDepartments(uniqueDepartments)
    } catch (error) {
      console.error('Error fetching departments:', error)
    }
  }

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/user/team')
      const data = await response.json()

      if (data.success) {
        setTeamMembers(data.data.users)
        // Update departments list after fetching team members
        const uniqueDepartments = Array.from(new Set(
          data.data.users
            .map((member: TeamMember) => member.department)
            .filter((dept: string | undefined): dept is string => dept !== undefined && dept !== null && dept !== 'No Department')
        )) as string[]
        setDepartments(uniqueDepartments)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load team members' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error loading team members' })
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldId)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const updateUserDepartment = async (userId: string, newDepartment: string) => {
    // Handle new department creation
    if (newDepartment === '+') {
      setPendingUserDepartmentUpdate(userId)
      setShowNewDepartmentDialog(true)
      return
    }

    setUpdatingDepartment(userId)
    setMessage(null)

    try {
      const response = await fetch('/api/user/department', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          department: newDepartment
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ type: 'success', text: `Department updated successfully` })
        await fetchTeamMembers() // Refresh the list
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update department' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error updating department' })
    } finally {
      setUpdatingDepartment(null)
    }
  }

  const createNewDepartment = async () => {
    if (!newDepartmentName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a department name' })
      return
    }

    setAddingDepartment(true)
    setMessage(null)

    try {
      // Add the new department to the list
      const updatedDepartments = [...departments, newDepartmentName.trim()]
      setDepartments(updatedDepartments)

      // If there was a pending user update, update them to the new department
      if (pendingUserDepartmentUpdate) {
        await updateUserDepartment(pendingUserDepartmentUpdate, newDepartmentName.trim())
      }

      setMessage({ type: 'success', text: `Department "${newDepartmentName.trim()}" created successfully` })
      setShowNewDepartmentDialog(false)
      setNewDepartmentName('')
      setPendingUserDepartmentUpdate(null)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create new department' })
    } finally {
      setAddingDepartment(false)
    }
  }

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return 'N/A'
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const updateUserRole = async (userId: string, newRole: 'employee' | 'manager' | 'admin') => {
    setUpdating(userId)
    setMessage(null)

    try {
      const response = await fetch('/api/user/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          role: newRole
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ type: 'success', text: `Role updated to ${newRole} successfully` })
        await fetchTeamMembers() // Refresh the list
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update role' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error updating role' })
    } finally {
      setUpdating(null)
    }
  }

  const handleInviteUser = async (invitationData: InvitationFormData) => {
    setInviting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invitationData)
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: `Invitation sent to ${invitationData.email} successfully${data.warning ? ` (${data.warning})` : ''}` 
        })
        setShowInviteDialog(false)
        await fetchTeamMembers() // Refresh to show any pending invitations
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send invitation' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error sending invitation' })
    } finally {
      setInviting(false)
    }
  }

  const getCurrentRole = (permissions: TeamMember['role_permissions']): string => {
    if (permissions.admin) return 'admin'
    if (permissions.manager) return 'manager'
    return 'employee'
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-600'
      case 'manager': return 'bg-blue-600'
      case 'employee': return 'bg-gray-600'
      default: return 'bg-gray-600'
    }
  }

  if (loading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-400">Loading team members...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Management
              <Badge variant="secondary" className="ml-2">
                {teamMembers.length} members
              </Badge>
            </CardTitle>
            <Button
              onClick={() => setShowInviteDialog(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          </div>
        </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert className={`${message.type === 'success' ? 'border-green-600 bg-green-900/20' : 'border-red-600 bg-red-900/20'}`}>
            {message.type === 'success' ? (
              <UserCheck className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            <AlertDescription className={message.type === 'success' ? 'text-green-300' : 'text-red-300'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {teamMembers.map((member) => {
            const currentRole = getCurrentRole(member.role_permissions)

            return (
              <div
                key={member.id}
                className="p-4 bg-gray-700 rounded-lg"
              >
                {/* Header row with name and role controls */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-medium truncate">
                        {truncateText(member.full_name || member.email || 'Unknown User', 25)}
                      </h4>
                      <button
                        onClick={() => copyToClipboard(member.full_name || member.email || 'Unknown User', `name-${member.id}`)}
                        className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                        title="Copy name"
                      >
                        {copiedField === `name-${member.id}` ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    <Badge className={`text-white ${getRoleBadgeColor(currentRole)}`}>
                      {currentRole}
                    </Badge>

                    <Select
                      value={currentRole}
                      onValueChange={(newRole: 'employee' | 'manager' | 'admin') =>
                        updateUserRole(member.user_id, newRole)
                      }
                      disabled={updating === member.user_id}
                    >
                      <SelectTrigger className="w-24 bg-gray-600 border-gray-500 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-600 border-gray-500">
                        <SelectItem value="employee" className="text-white hover:bg-gray-500">
                          Employee
                        </SelectItem>
                        <SelectItem value="manager" className="text-white hover:bg-gray-500">
                          Manager
                        </SelectItem>
                        <SelectItem value="admin" className="text-white hover:bg-gray-500">
                          Admin
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  {/* Employee ID */}
                  <div className="bg-gray-800/50 p-2 rounded">
                    <div className="text-gray-400 text-xs mb-1">Employee ID</div>
                    <div className="flex items-center gap-1">
                      <span className="text-white font-mono text-xs truncate">
                        {truncateText(member.employee_id, 12)}
                      </span>
                      <button
                        onClick={() => copyToClipboard(member.employee_id, `id-${member.id}`)}
                        className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                        title="Copy employee ID"
                      >
                        {copiedField === `id-${member.id}` ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Department with dropdown */}
                  <div className="bg-gray-800/50 p-2 rounded">
                    <div className="text-gray-400 text-xs mb-1">Department</div>
                    <Select
                      value={member.department || 'No Department'}
                      onValueChange={(newDepartment) => updateUserDepartment(member.user_id, newDepartment)}
                      disabled={updatingDepartment === member.user_id}
                    >
                      <SelectTrigger className="h-6 bg-gray-700 border-gray-600 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-600 border-gray-500">
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept} className="text-white hover:bg-gray-500">
                            {dept}
                          </SelectItem>
                        ))}
                        <SelectItem value="+" className="text-blue-400 hover:bg-gray-500 font-medium">
                          + Add New Department
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Job Title */}
                  <div className="bg-gray-800/50 p-2 rounded">
                    <div className="text-gray-400 text-xs mb-1">Job Title</div>
                    <div className="flex items-center gap-1">
                      <span className="text-white text-xs truncate">
                        {truncateText(member.job_title || 'No Title', 15)}
                      </span>
                      {member.job_title && (
                        <button
                          onClick={() => copyToClipboard(member.job_title!, `title-${member.id}`)}
                          className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                          title="Copy job title"
                        >
                          {copiedField === `title-${member.id}` ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email row */}
                {member.email && (
                  <div className="mt-3 bg-gray-800/30 p-2 rounded">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-400 text-xs">Email</div>
                        <div className="text-white text-xs font-mono">
                          {truncateText(member.email, 40)}
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(member.email!, `email-${member.id}`)}
                        className="p-2 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                        title="Copy email"
                      >
                        {copiedField === `email-${member.id}` ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Update indicators */}
                {(updating === member.user_id || updatingDepartment === member.user_id) && (
                  <div className="mt-2 text-xs text-blue-400 flex items-center gap-2">
                    <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    {updating === member.user_id ? 'Updating role...' : 'Updating department...'}
                  </div>
                )}
              </div>
            )
          })}

          {teamMembers.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No team members found</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    {/* Invitation Dialog */}
    <InvitationDialog
      isOpen={showInviteDialog}
      onClose={() => setShowInviteDialog(false)}
      onInvite={handleInviteUser}
      isLoading={inviting}
    />

    {/* New Department Dialog */}
    {showNewDepartmentDialog && (
      <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
        <Card className="bg-gray-800 border-gray-700 w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-white">Add New Department</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="department-name" className="text-white text-sm">
                Department Name
              </Label>
              <input
                id="department-name"
                type="text"
                value={newDepartmentName}
                onChange={(e) => setNewDepartmentName(e.target.value)}
                placeholder="Enter department name..."
                className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewDepartmentDialog(false)
                  setNewDepartmentName('')
                  setPendingUserDepartmentUpdate(null)
                }}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                disabled={addingDepartment}
              >
                Cancel
              </Button>
              <Button
                onClick={createNewDepartment}
                disabled={addingDepartment || !newDepartmentName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {addingDepartment ? (
                  <>
                    <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create Department'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )}
    </>
  )
}