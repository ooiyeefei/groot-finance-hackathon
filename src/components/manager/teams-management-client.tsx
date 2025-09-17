/**
 * Teams Management Client Component
 * Enhanced team management with user invitation functionality using Resend API
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Shield, Mail, Calendar, Briefcase, Loader2, ShieldAlert, AlertCircle, CheckCircle, Crown, UserCheck, UserPlus, Send, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import InvitationDialog, { InvitationFormData } from '@/components/ui/invitation-dialog'

interface TeamMember {
  id: string
  employee_id: string
  user_id: string
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
  clerk_user?: any
  manager_id?: string // For employee-manager association
  manager_name?: string // Display name of assigned manager
}

interface PendingInvitation {
  id: string
  email: string
  role: 'employee' | 'manager' | 'admin'
  department?: string
  job_title?: string
  invited_by: string
  created_at: string
  expires_at: string
  status: 'pending' | 'accepted' | 'expired'
}

type UserRole = 'employee' | 'manager' | 'admin'

interface TeamsManagementClientProps {
  userId: string
}

export default function TeamsManagementClient({ userId }: TeamsManagementClientProps) {
  const [userRole, setUserRole] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const router = useRouter()


  useEffect(() => {
    const initializePage = async () => {
      await checkPermissions()
      await fetchTeamMembers()
      await fetchPendingInvitations()
    }

    initializePage()
  }, [])

  const checkPermissions = async () => {
    try {
      const response = await fetch('/api/user/role')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setUserRole(result.data.permissions)
          
          // Only admin users can manage team roles
          if (!result.data.permissions.admin) {
            router.push('/')
            return
          }
        }
      }
    } catch (error) {
      console.error('Failed to check permissions:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/user/team')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTeamMembers(result.data.users)
        } else {
          setError(result.error || 'Failed to fetch team members')
        }
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error)
      setError('Network error while fetching team members')
    }
  }

  const fetchPendingInvitations = async () => {
    try {
      const response = await fetch('/api/invitations?status=pending')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setPendingInvitations(result.invitations || [])
        }
      }
    } catch (error) {
      console.error('Failed to fetch pending invitations:', error)
    }
  }

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      setUpdating(prev => new Set([...prev, userId]))
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/user/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: newRole })
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(`User role updated successfully`)
        await fetchTeamMembers() // Refresh the list
      } else {
        setError(result.error || 'Failed to update user role')
      }
    } catch (error) {
      console.error('Failed to update role:', error)
      setError('Network error while updating role')
    } finally {
      setUpdating(prev => {
        const newSet = new Set(prev)
        newSet.delete(userId)
        return newSet
      })
    }
  }

  const assignManager = async (employeeId: string, managerId: string) => {
    try {
      setUpdating(prev => new Set([...prev, employeeId]))
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/user/assign-manager', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          manager_id: managerId === 'none' ? null : managerId
        })
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(`Manager assignment updated successfully`)
        await fetchTeamMembers() // Refresh the list
      } else {
        setError(result.error || 'Failed to assign manager')
      }
    } catch (error) {
      console.error('Failed to assign manager:', error)
      setError('Network error while assigning manager')
    } finally {
      setUpdating(prev => {
        const newSet = new Set(prev)
        newSet.delete(employeeId)
        return newSet
      })
    }
  }

  // Get list of managers and admins for assignment dropdown
  const getAvailableManagers = () => {
    return teamMembers.filter(member =>
      member.role_permissions.manager || member.role_permissions.admin
    )
  }

  const sendInvitation = async (data: InvitationFormData) => {
    try {
      setInviteLoading(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          role: data.role,
          employee_id: data.employee_id || null,
          department: data.department || null,
          job_title: data.job_title || null
        })
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(`Invitation sent to ${data.email}`)
        setShowInviteDialog(false)
        await fetchPendingInvitations() // Refresh invitations list
      } else {
        setError(result.error || 'Failed to send invitation')
        throw new Error(result.error || 'Failed to send invitation')
      }
    } catch (error) {
      console.error('Failed to send invitation:', error)
      setError('Network error while sending invitation')
      throw error
    } finally {
      setInviteLoading(false)
    }
  }

  const resendInvitation = async (invitationId: string) => {
    try {
      setError(null)
      setSuccess(null)

      const response = await fetch(`/api/invitations/${invitationId}/resend`, {
        method: 'POST'
      })

      const result = await response.json()

      if (result.success) {
        setSuccess('Invitation resent successfully')
        await fetchPendingInvitations()
      } else {
        setError(result.error || 'Failed to resend invitation')
      }
    } catch (error) {
      console.error('Failed to resend invitation:', error)
      setError('Network error while resending invitation')
    }
  }

  const getRoleDisplay = (permissions: any): UserRole => {
    if (permissions.admin) return 'admin'
    if (permissions.manager) return 'manager'
    return 'employee'
  }

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'manager': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'admin': return Crown
      case 'manager': return Shield
      default: return UserCheck
    }
  }

  const getInvitationStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800'
      case 'expired': return 'bg-red-100 text-red-800'
      default: return 'bg-yellow-100 text-yellow-800'
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
        <p className="text-gray-400">Loading teams management...</p>
      </div>
    )
  }

  if (!userRole || !userRole.admin) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-12 text-center">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h3 className="text-xl font-semibold text-white mb-2">Access Denied</h3>
          <p className="text-gray-400">
            Teams management requires administrator permissions.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {error && (
        <Alert className="bg-red-900/20 border-red-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-900/20 border-green-700">
          <CheckCircle className="w-4 h-4" />
          <AlertDescription className="text-green-400">{success}</AlertDescription>
        </Alert>
      )}

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Teams Management</h2>
          <p className="text-gray-400">Manage team members, roles, and send invitations</p>
        </div>

        <Button 
          onClick={() => setShowInviteDialog(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Team Member
        </Button>
        
        <InvitationDialog
          isOpen={showInviteDialog}
          onClose={() => setShowInviteDialog(false)}
          onInvite={sendInvitation}
          isLoading={inviteLoading}
        />
      </div>

      {/* Role Information */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Role Permissions
          </CardTitle>
          <CardDescription className="text-gray-400">
            Understanding role permissions and capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-gray-400" />
                <h4 className="font-medium text-white">Employee</h4>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Submit expense claims</li>
                <li>• Upload receipts</li>
                <li>• View own transactions</li>
              </ul>
            </div>
            
            <div className="p-4 bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <h4 className="font-medium text-white">Manager</h4>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• All employee permissions</li>
                <li>• Approve/reject expenses</li>
                <li>• Manage categories</li>
                <li>• View team expenses</li>
              </ul>
            </div>
            
            <div className="p-4 bg-purple-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-purple-400" />
                <h4 className="font-medium text-white">Admin</h4>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• All manager permissions</li>
                <li>• Manage user roles</li>
                <li>• Send invitations</li>
                <li>• Full system access</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Teams and Invitations Tabs */}
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-gray-800 border border-gray-700">
          <TabsTrigger value="members" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Team Members ({teamMembers.length})
          </TabsTrigger>
          <TabsTrigger value="invitations" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            Pending Invitations ({pendingInvitations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5" />
                Active Team Members
              </CardTitle>
              <CardDescription className="text-gray-400">
                Manage role assignments for current team members
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">No team members found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {teamMembers.map((member) => {
                    const currentRole = getRoleDisplay(member.role_permissions)
                    const RoleIcon = getRoleIcon(currentRole)
                    const isUpdating = updating.has(member.id)

                    return (
                      <Card key={member.id} className="bg-gray-700 border-gray-600">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <h4 className="text-white font-medium">
                                    {member.clerk_user?.firstName && member.clerk_user?.lastName 
                                      ? `${member.clerk_user.firstName} ${member.clerk_user.lastName}`
                                      : member.full_name || 'Unknown User'
                                    }
                                  </h4>
                                  <Badge variant="outline" className={getRoleColor(currentRole)}>
                                    <RoleIcon className="w-3 h-3 mr-1" />
                                    {currentRole}
                                  </Badge>
                                </div>
                                
                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                                  <div className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    <span>{member.clerk_user?.emailAddresses?.[0]?.emailAddress || member.email || 'No email'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" />
                                    <span>{member.employee_id}</span>
                                  </div>
                                  {member.department && (
                                    <div className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      <span>{member.department}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>Joined {new Date(member.created_at).toLocaleDateString()}</span>
                                  </div>
                                  {member.manager_name && (
                                    <div className="flex items-center gap-1">
                                      <Shield className="w-3 h-3" />
                                      <span>Manager: {member.manager_name}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="min-w-[120px]">
                                <Label className="text-gray-400 text-sm">Role</Label>
                                <Select
                                  value={currentRole}
                                  onValueChange={(newRole: UserRole) => updateUserRole(member.user_id, newRole)}
                                  disabled={isUpdating}
                                >
                                  <SelectTrigger className="bg-gray-600 border-gray-500 text-white h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-gray-700 border-gray-600">
                                    <SelectItem value="employee" className="text-white">
                                      <div className="flex items-center gap-2">
                                        <UserCheck className="w-3 h-3" />
                                        Employee
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="manager" className="text-white">
                                      <div className="flex items-center gap-2">
                                        <Shield className="w-3 h-3" />
                                        Manager
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="admin" className="text-white">
                                      <div className="flex items-center gap-2">
                                        <Crown className="w-3 h-3" />
                                        Admin
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Manager Assignment - Only show for employees */}
                              {currentRole === 'employee' && (
                                <div className="min-w-[140px]">
                                  <Label className="text-gray-400 text-sm">Manager</Label>
                                  <Select
                                    value={member.manager_id || 'none'}
                                    onValueChange={(managerId: string) => assignManager(member.user_id, managerId)}
                                    disabled={isUpdating}
                                  >
                                    <SelectTrigger className="bg-gray-600 border-gray-500 text-white h-8">
                                      <SelectValue placeholder="Assign manager" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-700 border-gray-600">
                                      <SelectItem value="none" className="text-white">
                                        No Manager
                                      </SelectItem>
                                      {getAvailableManagers().map((manager) => (
                                        <SelectItem
                                          key={manager.user_id}
                                          value={manager.user_id}
                                          className="text-white"
                                        >
                                          <div className="flex items-center gap-2">
                                            {manager.role_permissions.admin ? (
                                              <Crown className="w-3 h-3" />
                                            ) : (
                                              <Shield className="w-3 h-3" />
                                            )}
                                            {manager.clerk_user?.firstName && manager.clerk_user?.lastName
                                              ? `${manager.clerk_user.firstName} ${manager.clerk_user.lastName}`
                                              : manager.full_name || manager.email || 'Unknown'
                                            }
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {isUpdating && (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Pending Invitations
              </CardTitle>
              <CardDescription className="text-gray-400">
                Track and manage sent invitations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvitations.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">No pending invitations</p>
                  <p className="text-sm text-gray-500 mt-2">Send your first invitation to grow your team</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingInvitations.map((invitation) => {
                    const RoleIcon = getRoleIcon(invitation.role)
                    
                    return (
                      <Card key={invitation.id} className="bg-gray-700 border-gray-600">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-white font-medium">{invitation.email}</h4>
                                <Badge variant="outline" className={getRoleColor(invitation.role)}>
                                  <RoleIcon className="w-3 h-3 mr-1" />
                                  {invitation.role}
                                </Badge>
                                <Badge className={getInvitationStatusColor(invitation.status)}>
                                  {invitation.status}
                                </Badge>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-400">
                                {invitation.department && (
                                  <div className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    <span>{invitation.department}</span>
                                  </div>
                                )}
                                {invitation.job_title && (
                                  <div className="flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" />
                                    <span>{invitation.job_title}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>Sent {new Date(invitation.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>Expires {new Date(invitation.expires_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {invitation.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resendInvitation(invitation.id)}
                                  className="border-gray-600 text-gray-300 hover:bg-gray-600"
                                >
                                  <Send className="w-3 h-3 mr-1" />
                                  Resend
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}