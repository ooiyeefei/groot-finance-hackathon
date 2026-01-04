'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Shield, Mail, Calendar, Briefcase, Loader2, ShieldAlert, AlertCircle, CheckCircle, Crown, UserCheck, UserPlus, Send, Plus, Trash2, Edit3, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/ui/role-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import InvitationDialog, { InvitationFormData } from '@/domains/account-management/components/invitation-dialog'
import { clearUserRoleCache, fetchUserRoleWithCache } from '@/lib/cache-utils'
import { useActiveBusiness } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTeamMembersRealtime, type TeamMember, type UserRole } from '@/domains/account-management/hooks/use-team-members-realtime'

interface PendingInvitation {
  id: string
  email: string
  role: 'employee' | 'manager' | 'admin'
  invited_by: string
  invited_at: string
  status: 'pending' | 'accepted'
}

interface TeamsManagementClientProps {
  userId: string
}

export default function TeamsManagementClient({ userId }: TeamsManagementClientProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members')
  const [userRole, setUserRole] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [editingName, setEditingName] = useState<Set<string>>(new Set())
  const [editingNameValue, setEditingNameValue] = useState<string>('')
  // Team limit exceeded state (T045)
  const [teamLimitExceeded, setTeamLimitExceeded] = useState(false)
  const [teamLimitMessage, setTeamLimitMessage] = useState<string | undefined>()
  const [nameUpdating, setNameUpdating] = useState<Set<string>>(new Set())
  const router = useRouter()
  const { addToast } = useToast()
  const { businessId } = useActiveBusiness()

  // Real-time team members from Convex - instant updates, no polling!
  const {
    teamMembers,
    isLoading: teamMembersLoading,
    error: teamMembersError,
    updateRole,
    removeMember,
    assignManager,
    updating,
  } = useTeamMembersRealtime({ businessId: businessId || undefined })

  // Always fetch invitations so tab count stays updated when sending new invitations
  const {
    data: pendingInvitations = [],
    isLoading: invitationsLoading
  } = useQuery({
    queryKey: ['pending-invitations', businessId],
    queryFn: async () => {
      const response = await fetch('/api/v1/account-management/invitations?status=pending')
      if (!response.ok) {
        throw new Error('Failed to fetch invitations')
      }
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch invitations')
      }
      return result.invitations || [] as PendingInvitation[]
    },
    staleTime: 1000 * 30,
    enabled: !!businessId,  // Always enabled - removed tab condition for real-time count updates
  })

  useEffect(() => {
    const initializePage = async () => {
      try {
        setLoading(true)
        const roleData = await fetchUserRoleWithCache()

        if (roleData && roleData.permissions) {
          setUserRole(roleData.permissions)

          if (!roleData.permissions.admin) {
            router.push('/')
            return
          }
        } else {
          router.push('/')
          return
        }
      } catch (error) {
        console.error('Failed to check permissions:', error)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    if (businessId) {
      initializePage()
    }
  }, [businessId, router])

  useEffect(() => {
    if (teamMembersError) {
      setError(teamMembersError instanceof Error ? teamMembersError.message : 'Failed to fetch team members')
    }
  }, [teamMembersError])

  // Wrapper functions with toast notifications for Convex mutations
  // No invalidateQueries needed - Convex auto-updates via WebSocket subscription!
  const handleUpdateRole = async (membershipId: string, newRole: UserRole) => {
    try {
      setError(null)
      await updateRole(membershipId, newRole)
      addToast({
        type: 'success',
        title: 'Success',
        description: 'User role updated successfully'
      })
      clearUserRoleCache()
    } catch (err) {
      console.error('Failed to update role:', err)
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update role'
      })
    }
  }

  const handleRemoveMember = async (membershipId: string) => {
    try {
      setError(null)
      await removeMember(membershipId)
      addToast({
        type: 'success',
        title: 'Success',
        description: 'User removed from business successfully'
      })
      clearUserRoleCache()
    } catch (err) {
      console.error('Failed to remove member:', err)
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to remove member'
      })
    }
  }

  const handleAssignManager = async (employeeUserId: string, managerId: string) => {
    try {
      setError(null)
      // Convert "none" to null for the Convex mutation
      await assignManager(employeeUserId, managerId === 'none' ? null : managerId)
      addToast({
        type: 'success',
        title: 'Success',
        description: 'Manager assignment updated successfully'
      })
    } catch (err) {
      console.error('Failed to assign manager:', err)
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to assign manager'
      })
    }
  }

  const getAvailableManagers = () => {
    return teamMembers.filter(member =>
      member.role_permissions.manager || member.role_permissions.admin
    )
  }

  const getCurrentManagerUserId = (member: TeamMember) => {
    if (!member.manager_id) return 'none'
    const manager = teamMembers.find(m => m.user_id === member.manager_id)
    return manager ? manager.user_id : 'none'
  }

  const sendInvitationMutation = useMutation({
    mutationFn: async (data: InvitationFormData) => {
      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      if (!csrfResponse.ok) {
        throw new Error('Failed to get CSRF token')
      }
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) {
        throw new Error(csrfData.error || 'Failed to get CSRF token')
      }

      const response = await fetch('/api/v1/account-management/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.token
        },
        body: JSON.stringify({
          email: data.email,
          role: data.role,
          business_id: businessId,
          employee_id: data.employee_id || null,
          department: data.department || null,
          job_title: data.job_title || null
        })
      })

      const result = await response.json()

      // Handle team limit exceeded error (T045)
      if (!result.success && result.code === 'TEAM_LIMIT_EXCEEDED') {
        // Throw a special error that will be caught in onError
        const limitError = new Error(result.error || 'Team limit exceeded')
        ;(limitError as any).code = 'TEAM_LIMIT_EXCEEDED'
        ;(limitError as any).upgradeRequired = result.upgradeRequired
        throw limitError
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to send invitation')
      }
      return result
    },
    onSuccess: (result, data) => {
      // Clear any previous team limit error
      setTeamLimitExceeded(false)
      setTeamLimitMessage(undefined)

      if (result.emailFailed && result.warning) {
        addToast({
          type: 'warning',
          title: 'Warning',
          description: result.warning
        })
      } else {
        addToast({
          type: 'success',
          title: 'Success',
          description: `Invitation sent to ${data.email}`
        })
      }
      setShowInviteDialog(false)
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', businessId] })
    },
    onError: (error: Error & { code?: string; upgradeRequired?: boolean }) => {
      console.error('Failed to send invitation:', error)

      // Handle team limit exceeded error (T045)
      if (error.code === 'TEAM_LIMIT_EXCEEDED') {
        setTeamLimitExceeded(true)
        setTeamLimitMessage(error.message)
        // Don't close dialog, show upgrade prompt instead
        return
      }

      addToast({
        type: 'error',
        title: 'Error',
        description: error.message || 'Network error while sending invitation'
      })
    }
  })

  const sendInvitation = async (data: InvitationFormData) => {
    await sendInvitationMutation.mutateAsync(data)
  }

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      if (!csrfResponse.ok) {
        throw new Error('Failed to get CSRF token')
      }
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) {
        throw new Error(csrfData.error || 'Failed to get CSRF token')
      }

      const response = await fetch(`/api/v1/account-management/invitations/${invitationId}/resend`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfData.data.token }
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to resend invitation')
      }
      return result
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Success',
        description: 'Invitation resent successfully'
      })
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', businessId] })
    },
    onError: (error: Error) => {
      console.error('Failed to resend invitation:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: error.message || 'Network error while resending invitation'
      })
    }
  })

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      if (!csrfResponse.ok) {
        throw new Error('Failed to get CSRF token')
      }
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) {
        throw new Error(csrfData.error || 'Failed to get CSRF token')
      }

      const response = await fetch(`/api/v1/account-management/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfData.data.token }
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete invitation')
      }
      return result
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Success',
        description: 'Invitation deleted successfully'
      })
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', businessId] })
    },
    onError: (error: Error) => {
      console.error('Failed to delete invitation:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: error.message || 'Network error while deleting invitation'
      })
    }
  })

  const resendInvitation = async (invitationId: string) => {
    await resendInvitationMutation.mutateAsync(invitationId)
  }

  const deleteInvitation = async (invitationId: string) => {
    await deleteInvitationMutation.mutateAsync(invitationId)
  }

  const startEditingName = (memberId: string, currentName: string) => {
    setEditingName(prev => new Set([...prev, memberId]))
    setEditingNameValue(currentName || '')
  }

  const cancelEditingName = (memberId: string) => {
    setEditingName(prev => {
      const newSet = new Set(prev)
      newSet.delete(memberId)
      return newSet
    })
    setEditingNameValue('')
  }

  const updateUserNameMutation = useMutation({
    mutationFn: async ({ memberId, name }: { memberId: string; name: string }) => {
      if (!name.trim()) {
        throw new Error('Please enter a valid name')
      }
      if (name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters long')
      }

      const response = await fetch(`/api/v1/users/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name.trim() })
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to update name')
      }
      return { result, memberId }
    },
    onMutate: ({ memberId }) => {
      setNameUpdating(prev => new Set([...prev, memberId]))
    },
    onSuccess: ({ memberId }) => {
      addToast({
        type: 'success',
        title: 'Success',
        description: 'Name updated successfully'
      })
      cancelEditingName(memberId)
      // No invalidateQueries needed - Convex real-time subscription auto-updates!
    },
    onError: (error: Error) => {
      console.error('Failed to update name:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: error.message || 'Network error while updating name'
      })
    },
    onSettled: (data) => {
      if (data) {
        setNameUpdating(prev => {
          const newSet = new Set(prev)
          newSet.delete(data.memberId)
          return newSet
        })
      }
    }
  })

  const updateUserName = async (memberId: string) => {
    await updateUserNameMutation.mutateAsync({ memberId, name: editingNameValue })
  }

  const getRoleDisplay = (permissions: any): UserRole => {
    if (permissions.admin) return 'admin'
    if (permissions.manager) return 'manager'
    return 'employee'
  }

  const getInvitationStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
      case 'expired': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
      default: return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30'
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading teams management...</p>
      </div>
    )
  }

  if (!userRole || !userRole.admin) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-destructive" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            Teams management requires administrator permissions.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-action-view/10 border-action-view/30">
          <CheckCircle className="w-4 h-4 text-action-view" />
          <AlertDescription className="text-action-view">{success}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Role Permissions
              </CardTitle>
              <CardDescription>
                Understanding role permissions and capabilities
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowInviteDialog(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Team Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-medium text-foreground">Employee</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Submit expense claims</li>
                <li>• Upload receipts</li>
                <li>• View own transactions</li>
              </ul>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <h4 className="font-medium text-foreground">Manager</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• All employee permissions</li>
                <li>• Approve/reject expenses</li>
                <li>• Manage categories</li>
                <li>• View team expenses</li>
              </ul>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-primary" />
                <h4 className="font-medium text-foreground">Admin</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• All manager permissions</li>
                <li>• Manage user roles</li>
                <li>• Send invitations</li>
                <li>• Full system access</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <InvitationDialog
        isOpen={showInviteDialog}
        onClose={() => {
          setShowInviteDialog(false)
          // Clear team limit state when closing dialog
          setTeamLimitExceeded(false)
          setTeamLimitMessage(undefined)
        }}
        onInvite={sendInvitation}
        isLoading={sendInvitationMutation.isPending}
        teamLimitExceeded={teamLimitExceeded}
        teamLimitMessage={teamLimitMessage}
        onDismissLimitError={() => {
          setTeamLimitExceeded(false)
          setTeamLimitMessage(undefined)
        }}
      />

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'members' | 'invitations')} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-muted border border-border">
          <TabsTrigger value="members" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Team Members ({teamMembers.length})
          </TabsTrigger>
          <TabsTrigger value="invitations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Pending Invitations ({pendingInvitations.length})
          </TabsTrigger>
        </TabsList>

        {activeTab === 'members' && (
          <TabsContent value="members" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Users className="w-5 h-5" />
                Active Team Members
              </CardTitle>
              <CardDescription>
                Manage role assignments for current team members
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No team members found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {teamMembers.map((member) => {
                    const currentRole = getRoleDisplay(member.role_permissions)
                    const isUpdating = updating.has(member.id)

                    return (
                      <Card key={member.id} className="bg-muted border-border">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  {editingName.has(member.id) ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingNameValue}
                                        onChange={(e) => setEditingNameValue(e.target.value)}
                                        className="bg-input border-input text-foreground h-8 w-48"
                                        placeholder="Enter full name"
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        onClick={() => updateUserName(member.user_id)}
                                        disabled={nameUpdating.has(member.id)}
                                        className="h-8 px-2 bg-action-view hover:bg-action-view/90 text-action-view-foreground"
                                      >
                                        <Save className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => cancelEditingName(member.id)}
                                        className="h-8 px-2"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-foreground font-medium">
                                        {member.clerk_user?.firstName && member.clerk_user?.lastName
                                          ? `${member.clerk_user.firstName} ${member.clerk_user.lastName}`
                                          : member.clerk_user?.firstName || member.full_name
                                          || member.email?.split('@')[0]
                                          || 'User'
                                        }
                                        {member.clerk_user?.id === userId && (
                                          <span className="text-muted-foreground font-normal ml-1">(You)</span>
                                        )}
                                      </h4>
                                      <Button
                                        size="sm"
                                        onClick={() => startEditingName(
                                          member.id,
                                          member.clerk_user?.firstName && member.clerk_user?.lastName
                                            ? `${member.clerk_user.firstName} ${member.clerk_user.lastName}`
                                            : member.clerk_user?.firstName || member.full_name
                                            || member.email?.split('@')[0] || ''
                                        )}
                                        className="h-6 px-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    <RoleBadge roleType={currentRole} />
                                    {member.clerk_user?.id === userId && (
                                      <RoleBadge roleType="owner" />
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
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
                                </div>
                              </div>
                            </div>

                            <div className="flex items-end gap-4">
                              <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground mb-1.5">Role</span>
                                <Select
                                  value={currentRole}
                                  onValueChange={(newRole: UserRole) => handleUpdateRole(member.id, newRole)}
                                  disabled={isUpdating}
                                >
                                  <SelectTrigger className="bg-input border border-border text-foreground h-9 min-w-[110px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-popover border-border">
                                    <SelectItem value="employee">
                                      Employee
                                    </SelectItem>
                                    <SelectItem value="manager">
                                      Manager
                                    </SelectItem>
                                    <SelectItem value="admin">
                                      Admin
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground mb-1.5">
                                  {currentRole === 'employee' ? 'Manager' : 'Manager (Optional)'}
                                </span>
                                <Select
                                  value={getCurrentManagerUserId(member)}
                                  onValueChange={(managerId) => handleAssignManager(member.user_id, managerId)}
                                  disabled={isUpdating}
                                >
                                  <SelectTrigger className="bg-input border border-border text-foreground h-9 min-w-[160px]">
                                    <SelectValue placeholder={currentRole === 'employee' ? 'Assign manager' : 'Optional manager'} />
                                  </SelectTrigger>
                                  <SelectContent className="bg-popover border-border">
                                    <SelectItem value="none">
                                      {currentRole === 'employee' ? 'No Manager' : 'No Assignment'}
                                    </SelectItem>
                                    {getAvailableManagers()
                                      .filter(manager => manager.user_id !== member.user_id)
                                      .map((manager) => (
                                        <SelectItem
                                          key={manager.user_id}
                                          value={manager.user_id}
                                        >
                                          {manager.clerk_user?.firstName && manager.clerk_user?.lastName
                                            ? `${manager.clerk_user.firstName} ${manager.clerk_user.lastName}`
                                            : manager.clerk_user?.firstName || manager.full_name
                                            || manager.email?.split('@')[0]
                                            || 'Manager'
                                          }
                                        </SelectItem>
                                      ))
                                    }
                                  </SelectContent>
                                </Select>
                              </div>

                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveMember(member.id)}
                                disabled={isUpdating}
                                className="h-9 px-3"
                              >
                                {isUpdating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </Button>
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
        )}

        {activeTab === 'invitations' && (
          <TabsContent value="invitations" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Pending Invitations
              </CardTitle>
              <CardDescription>
                Manage outstanding invitations to your business
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvitations.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No pending invitations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingInvitations.map((invitation: PendingInvitation) => (
                    <Card key={invitation.id} className="bg-muted border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-primary" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-foreground font-medium">{invitation.email}</span>
                                <RoleBadge roleType={invitation.role} />
                                <Badge variant="outline" className={getInvitationStatusColor(invitation.status)}>
                                  {invitation.status}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-sm">
                                Invited {new Date(invitation.invited_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => resendInvitation(invitation.id)}
                              className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Resend
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteInvitation(invitation.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}