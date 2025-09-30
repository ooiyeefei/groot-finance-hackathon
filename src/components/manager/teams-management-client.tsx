/**
 * Teams Management Client Component
 * Enhanced team management with user invitation functionality using Resend API
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Users, Shield, Mail, Calendar, Briefcase, Loader2, ShieldAlert, AlertCircle, CheckCircle, Crown, UserCheck, UserPlus, Send, Plus, Trash2, Edit3, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import InvitationDialog, { InvitationFormData } from '@/components/ui/invitation-dialog'
import { clearUserRoleCache } from '@/lib/cache-utils'

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
  manager_id?: string // For employee-manager association (employee_profiles.id)
  manager_name?: string // Display name of assigned manager
  manager_user_id?: string // Manager's user_id for Select component
}

interface PendingInvitation {
  id: string
  email: string
  role: 'member' | 'admin' | 'owner' // Use backend role values
  invited_by: string
  invited_at: string // Changed from created_at to match API response
  status: 'pending' | 'accepted'
}

type UserRole = 'employee' | 'manager' | 'admin'

interface TeamsManagementClientProps {
  userId: string
}

export default function TeamsManagementClient({ userId }: TeamsManagementClientProps) {
  const t = useTranslations('teams')
  const tCommon = useTranslations('common')
  const [userRole, setUserRole] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [editingName, setEditingName] = useState<Set<string>>(new Set())
  const [editingNameValue, setEditingNameValue] = useState<string>('')
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
      console.error(t('messages.failedToCheckPermissions'), error)
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
          setError(result.error || t('messages.failedToFetchTeamMembers'))
        }
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error)
      setError(t('messages.networkErrorTeamMembers'))
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
      console.error(t('messages.failedToFetchInvitations'), error)
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
        setSuccess(t('messages.userRoleUpdated'))
        // Clear user role cache so sidebar updates immediately
        clearUserRoleCache()
        await fetchTeamMembers() // Refresh the list
      } else {
        setError(result.error || t('messages.failedToUpdateRole'))
      }
    } catch (error) {
      console.error('Failed to update role:', error)
      setError(t('messages.networkErrorRole'))
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
        setSuccess(t('messages.managerAssignmentUpdated'))
        await fetchTeamMembers() // Refresh the list
      } else {
        setError(result.error || t('messages.failedToAssignManager'))
      }
    } catch (error) {
      console.error('Failed to assign manager:', error)
      setError(t('messages.networkErrorManager'))
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
        if (result.emailFailed && result.warning) {
          // Email failed but invitation was created
          setError(result.warning)
        } else {
          // Success with email sent
          setSuccess(t('messages.invitationSent', { email: data.email }))
        }
        setShowInviteDialog(false)
        await fetchPendingInvitations() // Refresh invitations list
      } else {
        setError(result.error || t('messages.failedToSendInvitation'))
        throw new Error(result.error || 'Failed to send invitation')
      }
    } catch (error) {
      console.error('Failed to send invitation:', error)
      setError(t('messages.networkErrorInvitation'))
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
        setSuccess(t('messages.invitationResent'))
        await fetchPendingInvitations()
      } else {
        setError(result.error || t('messages.failedToResendInvitation'))
      }
    } catch (error) {
      console.error('Failed to resend invitation:', error)
      setError(t('messages.networkErrorResend'))
    }
  }

  const deleteInvitation = async (invitationId: string) => {
    try {
      setError(null)
      setSuccess(null)

      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(t('messages.invitationDeleted'))
        await fetchPendingInvitations()
      } else {
        setError(result.error || t('messages.failedToDeleteInvitation'))
      }
    } catch (error) {
      console.error('Failed to delete invitation:', error)
      setError(t('messages.networkErrorDelete'))
    }
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

  const updateUserName = async (memberId: string, isCurrentUser: boolean = false) => {
    if (!editingNameValue.trim()) {
      setError(t('messages.enterValidName'))
      return
    }

    if (editingNameValue.trim().length < 2) {
      setError(t('messages.nameMinLength'))
      return
    }

    try {
      setUpdating(prev => new Set([...prev, memberId]))
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/user/update-name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: isCurrentUser ? undefined : memberId,
          full_name: editingNameValue.trim()
        })
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(t('messages.nameUpdated'))
        cancelEditingName(memberId)
        await fetchTeamMembers() // Refresh the list
      } else {
        setError(result.error || t('messages.failedToUpdateName'))
      }
    } catch (error) {
      console.error('Failed to update name:', error)
      setError(t('messages.networkErrorName'))
    } finally {
      setUpdating(prev => {
        const newSet = new Set(prev)
        newSet.delete(memberId)
        return newSet
      })
    }
  }

  const getRoleDisplay = (permissions: any): UserRole => {
    if (permissions.admin) return 'admin'
    if (permissions.manager) return 'manager'
    return 'employee'
  }

  // Map backend invitation roles to display roles
  const mapInvitationRoleToDisplay = (backendRole: string): UserRole => {
    switch (backendRole) {
      case 'owner': return 'admin'
      case 'admin': return 'manager'
      case 'member': return 'employee'
      default: return 'employee'
    }
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
        <p className="text-gray-400">{t('loading')}</p>
      </div>
    )
  }

  if (!userRole || !userRole.admin) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-12 text-center">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h3 className="text-xl font-semibold text-white mb-2">{t('accessDenied')}</h3>
          <p className="text-gray-400">
            {t('accessDeniedDescription')}
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


      {/* Role Information */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t('rolePermissions')}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {t('rolePermissionsDescription')}
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowInviteDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {t('inviteTeamMember')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-gray-400" />
                <h4 className="font-medium text-white">{t('roles.employee')}</h4>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• {t('permissions.submitExpenseClaims')}</li>
                <li>• {t('permissions.uploadReceipts')}</li>
                <li>• {t('permissions.viewOwnTransactions')}</li>
              </ul>
            </div>
            
            <div className="p-4 bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <h4 className="font-medium text-white">{t('roles.manager')}</h4>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• {t('permissions.allEmployeePermissions')}</li>
                <li>• {t('permissions.approveRejectExpenses')}</li>
                <li>• {t('permissions.manageCategories')}</li>
                <li>• {t('permissions.viewTeamExpenses')}</li>
              </ul>
            </div>
            
            <div className="p-4 bg-purple-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-purple-400" />
                <h4 className="font-medium text-white">{t('roles.admin')}</h4>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• {t('permissions.allManagerPermissions')}</li>
                <li>• {t('permissions.manageUserRoles')}</li>
                <li>• {t('permissions.sendInvitations')}</li>
                <li>• {t('permissions.fullSystemAccess')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invitation Dialog */}
      <InvitationDialog
        isOpen={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
        onInvite={sendInvitation}
        isLoading={inviteLoading}
      />

      {/* Teams and Invitations Tabs */}
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-gray-800 border border-gray-700">
          <TabsTrigger value="members" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            {t('teamMembers')} ({teamMembers.length})
          </TabsTrigger>
          <TabsTrigger value="invitations" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            {t('pendingInvitationsTab')} ({pendingInvitations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t('activeTeamMembers')}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {t('activeTeamMembersDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">{t('noTeamMembers')}</p>
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
                                  {editingName.has(member.id) ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingNameValue}
                                        onChange={(e) => setEditingNameValue(e.target.value)}
                                        className="bg-gray-600 border-gray-500 text-white h-8 w-48"
                                        placeholder={t('form.enterFullName')}
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        onClick={() => updateUserName(member.user_id, member.user_id === userId)}
                                        disabled={updating.has(member.id)}
                                        className="h-8 px-2 bg-green-600 hover:bg-green-700"
                                      >
                                        <Save className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => cancelEditingName(member.id)}
                                        className="h-8 px-2 border-gray-600"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-white font-medium">
                                        {member.clerk_user?.firstName && member.clerk_user?.lastName
                                          ? `${member.clerk_user.firstName} ${member.clerk_user.lastName}`
                                          : member.full_name || 'Unknown User'
                                        }
                                      </h4>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => startEditingName(
                                          member.id,
                                          member.clerk_user?.firstName && member.clerk_user?.lastName
                                            ? `${member.clerk_user.firstName} ${member.clerk_user.lastName}`
                                            : member.full_name || ''
                                        )}
                                        className="h-6 px-1 border-gray-600 hover:bg-gray-700"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
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
                                    <span>{t('form.joined')} {new Date(member.created_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="min-w-[120px]">
                                <Label className="text-gray-400 text-sm">{t('form.role')}</Label>
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
                                        {t('roles.employee')}
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="manager" className="text-white">
                                      <div className="flex items-center gap-2">
                                        <Shield className="w-3 h-3" />
                                        {t('roles.manager')}
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="admin" className="text-white">
                                      <div className="flex items-center gap-2">
                                        <Crown className="w-3 h-3" />
                                        {t('roles.admin')}
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Manager Assignment - Only show for employees */}
                              {currentRole === 'employee' && (
                                <div className="min-w-[140px]">
                                  <Label className="text-gray-400 text-sm">{t('form.manager')}</Label>
                                  <Select
                                    value={member.manager_user_id || 'none'}
                                    onValueChange={(managerId: string) => assignManager(member.user_id, managerId)}
                                    disabled={isUpdating}
                                  >
                                    <SelectTrigger className="bg-gray-600 border-gray-500 text-white h-8">
                                      <SelectValue placeholder={t('form.assignManager')} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-700 border-gray-600">
                                      <SelectItem value="none" className="text-white">
                                        {t('form.noManager')}
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
                {t('pendingInvitations')}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {t('pendingInvitationsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvitations.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                  <p className="text-gray-400">{t('noPendingInvitations')}</p>
                  <p className="text-sm text-gray-500 mt-2">{t('sendFirstInvitation')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingInvitations.map((invitation) => {
                    const displayRole = mapInvitationRoleToDisplay(invitation.role)
                    const RoleIcon = getRoleIcon(displayRole)
                    
                    return (
                      <Card key={invitation.id} className="bg-gray-700 border-gray-600">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-white font-medium">{invitation.email}</h4>
                                <Badge variant="outline" className={getRoleColor(displayRole)}>
                                  <RoleIcon className="w-3 h-3 mr-1" />
                                  {displayRole}
                                </Badge>
                                <Badge className={getInvitationStatusColor(invitation.status)}>
                                  {t(`invitation.${invitation.status}`)}
                                </Badge>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-400">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>{t('invitation.sent')} {new Date(invitation.invited_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {invitation.status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => resendInvitation(invitation.id)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    <Send className="w-3 h-3 mr-1" />
                                    {t('invitation.resend')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => deleteInvitation(invitation.id)}
                                    className="border-red-600 text-red-400 hover:bg-red-900/20"
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {tCommon('delete')}
                                  </Button>
                                </>
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