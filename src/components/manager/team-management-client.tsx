/**
 * Team Management Client Component
 * Client-side logic for managing team member roles and permissions
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Shield, Edit, Mail, Calendar, Briefcase, Loader2, ShieldAlert, AlertCircle, CheckCircle, Crown, UserCheck } from 'lucide-react'
import { clearUserRoleCache } from '@/lib/cache-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

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
}

type UserRole = 'employee' | 'manager' | 'admin'

interface TeamManagementClientProps {
  userId: string
}

export default function TeamManagementClient({ userId }: TeamManagementClientProps) {
  const [userRole, setUserRole] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const initializePage = async () => {
      await checkPermissions()
      await fetchTeamMembers()
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
        // Clear user role cache so sidebar updates immediately
        clearUserRoleCache()
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
        <p className="text-gray-400">Loading team management...</p>
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
            Team management requires admin administrator permissions.
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
                <li>• Full system access</li>
                <li>• Financial reporting</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members ({teamMembers.length})
          </CardTitle>
          <CardDescription className="text-gray-400">
            Manage role assignments for team members
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
                          {/* Profile Info */}
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
                            </div>
                          </div>
                        </div>

                        {/* Role Management */}
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
    </div>
  )
}