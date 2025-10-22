'use client'

import { useState, Suspense, lazy, memo } from 'react'
import { Building2, DollarSign, Users, Loader2 } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'
import { useUser } from '@clerk/nextjs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// PERFORMANCE OPTIMIZATION: Dynamic imports for tab content (reuse existing components)
const BusinessProfileSettings = lazy(() => import('@/domains/account-management/components/business-profile-settings'))
const CategoriesManagementClient = lazy(() => import('@/domains/expense-claims/components/categories-management-client'))
const TeamsManagementClient = lazy(() => import('@/domains/account-management/components/teams-management-client'))

// Wrapper components for existing components that need userId
const CategoryManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <CategoriesManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TeamManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <TeamsManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TabbedBusinessSettings = memo(() => {
  const { isAdmin, isManager } = usePermissions()
  const { user } = useUser()

  // Only show business management tabs to managers and admins
  const canManageBusiness = isAdmin || isManager

  if (!canManageBusiness) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          Business management settings are available to managers and administrators only.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      <Tabs defaultValue="business-profile" className="space-y-4">
        {/* Tab Navigation - Semantic Design System */}
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} bg-muted border border-border`}>
          <TabsTrigger
            value="business-profile"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Building2 className="w-4 h-4 mr-2" />
            Business Profile
          </TabsTrigger>
          <TabsTrigger
            value="category-management"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Categories
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="team-management"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Users className="w-4 h-4 mr-2" />
              Team
            </TabsTrigger>
          )}
        </TabsList>

        {/* Business Profile Tab Content */}
        <TabsContent value="business-profile" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading business profile...</span>
              </div>
            }>
              <BusinessProfileSettings />
            </Suspense>
          </div>
        </TabsContent>

        {/* Category Management Tab Content */}
        <TabsContent value="category-management" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading categories...</span>
              </div>
            }>
              <CategoryManagementTab userId={user?.id} />
            </Suspense>
          </div>
        </TabsContent>

        {/* Team Management Tab Content - Admin Only */}
        {isAdmin && (
          <TabsContent value="team-management" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading team management...</span>
                </div>
              }>
                <TeamManagementTab userId={user?.id} />
              </Suspense>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
})

TabbedBusinessSettings.displayName = 'TabbedBusinessSettings'

export default TabbedBusinessSettings