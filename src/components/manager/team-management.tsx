'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import InvitationDialog, { type InvitationFormData } from '@/components/ui/invitation-dialog'
import { Users, UserCheck, AlertCircle, UserPlus } from 'lucide-react'

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

  useEffect(() => {
    fetchTeamMembers()
  }, [])

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/user/team')
      const data = await response.json()
      
      if (data.success) {
        setTeamMembers(data.data.users)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load team members' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error loading team members' })
    } finally {
      setLoading(false)
    }
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
                className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-white font-medium">
                        {member.full_name || member.email || 'Unknown User'}
                      </h4>
                      <p className="text-sm text-gray-400">
                        {member.employee_id} • {member.department || 'No Department'} • {member.job_title || 'No Title'}
                      </p>
                      {member.email && (
                        <p className="text-xs text-gray-500">{member.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
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
                    <SelectTrigger className="w-32 bg-gray-600 border-gray-500 text-white">
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
                        Admin Admin
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {updating === member.user_id && (
                    <div className="text-xs text-gray-400">Updating...</div>
                  )}
                </div>
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
    </>
  )
}