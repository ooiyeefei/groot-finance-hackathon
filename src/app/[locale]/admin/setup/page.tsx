'use client'

// Force dynamic rendering - required for Clerk authentication
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, AlertCircle } from 'lucide-react'

export default function AdminSetupPage() {
  const { user } = useUser()
  const [adminKey, setAdminKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSetupAdmin = async () => {
    if (!user || !adminKey) return
    
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/v1/users/${user.id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'admin',
          admin_key: adminKey
        })
      })

      const data = await response.json()

      if (data.success) {
        setResult({
          success: true,
          message: 'Admin privileges assigned successfully! Please refresh the page to see manager features.'
        })
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to assign admin privileges'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Network error. Please try again.'
      })
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-border">
          <CardHeader>
            <CardTitle className="text-white">Please sign in first</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-border">
        <CardHeader>
          <CardTitle className="text-white">Business Admin Assignment</CardTitle>
          <CardDescription className="text-gray-400">
            Contact support to become a business administrator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-info" className="text-sm font-medium text-gray-300">
              Current User
            </Label>
            <div className="p-3 bg-gray-700 rounded-md">
              <p className="text-white text-sm">{user.emailAddresses[0]?.emailAddress}</p>
              <p className="text-gray-400 text-xs">User ID: {user.id}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-key" className="text-sm font-medium text-gray-300">
              Admin Setup Key
            </Label>
            <Input
              id="admin-key"
              type="password"
              placeholder="Enter your admin setup key"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              disabled={loading}
            />
            <p className="text-xs text-gray-400">
              This key should be provided by your system administrator
            </p>
          </div>

          {result && (
            <Alert className={`${result.success ? 'border-green-600 bg-green-900/20' : 'border-red-600 bg-red-900/20'}`}>
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <AlertDescription className={result.success ? 'text-green-300' : 'text-red-300'}>
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSetupAdmin}
            disabled={!adminKey || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? 'Setting up...' : 'Assign Admin Privileges'}
          </Button>

          <div className="mt-4 p-3 bg-blue-900/20 rounded-md border border-blue-600/20">
            <h4 className="text-sm font-medium text-blue-300 mb-2">After Setup:</h4>
            <ul className="text-xs text-blue-200 space-y-1">
              <li>• You&apos;ll have full finance permissions</li>
              <li>• Access to manager approval dashboard</li>
              <li>• Ability to assign roles to other users</li>
              <li>• Team management capabilities</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}