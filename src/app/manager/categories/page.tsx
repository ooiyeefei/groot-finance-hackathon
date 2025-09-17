/**
 * Manager Categories Page
 * Interface for managing expense categories
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CategoryManagement from '@/components/expense-claims/category-management'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function CategoriesPage() {
  const [userRole, setUserRole] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const response = await fetch('/api/user/role')
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setUserRole(result.data.permissions)
            
            // Redirect if not manager/finance
            if (!result.data.permissions.manager && !result.data.permissions.admin) {
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

    checkPermissions()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
            <p className="text-gray-400">Checking permissions...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!userRole || (!userRole.manager && !userRole.admin)) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-12 text-center">
              <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <h3 className="text-xl font-semibold text-white mb-2">Access Denied</h3>
              <p className="text-gray-400">
                Category management requires manager or finance permissions.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <CategoryManagement userRole={userRole} />
      </div>
    </div>
  )
}