/**
 * TrialBanner Usage Examples
 * Demonstrates how to use the TrialBanner component in different scenarios
 */

import { TrialBanner } from './trial-banner'

// Example 1: Early trial (7+ days remaining) - Green/Primary styling
export function EarlyTrialExample() {
  const handleUpgrade = () => {
    console.log('Upgrade clicked')
    // Navigate to upgrade page or open pricing modal
  }

  return (
    <TrialBanner
      daysRemaining={10}
      trialEndDate="2025-01-10T00:00:00Z"
      onUpgrade={handleUpgrade}
    />
  )
}

// Example 2: Mid trial (3-6 days remaining) - Yellow/Warning styling
export function MidTrialExample() {
  const handleUpgrade = () => {
    console.log('Upgrade clicked')
  }

  return (
    <TrialBanner
      daysRemaining={5}
      trialEndDate="2025-01-05T00:00:00Z"
      onUpgrade={handleUpgrade}
    />
  )
}

// Example 3: Late trial (0-2 days remaining) - Red/Destructive styling
export function LateTrialExample() {
  const handleUpgrade = () => {
    console.log('Upgrade clicked')
  }

  return (
    <TrialBanner
      daysRemaining={1}
      trialEndDate="2025-01-01T00:00:00Z"
      onUpgrade={handleUpgrade}
    />
  )
}

// Example 4: With dismiss functionality
export function DismissableTrialBanner() {
  const handleUpgrade = () => {
    console.log('Upgrade clicked')
  }

  const handleDismiss = () => {
    console.log('Banner dismissed')
    // Store dismissal in localStorage or user preferences
    localStorage.setItem('trialBannerDismissed', 'true')
  }

  return (
    <TrialBanner
      daysRemaining={7}
      trialEndDate="2025-01-07T00:00:00Z"
      onUpgrade={handleUpgrade}
      onDismiss={handleDismiss}
    />
  )
}

// Example 5: Integration in app layout/header
export function AppLayoutWithTrialBanner() {
  const user = {
    subscriptionStatus: 'trial',
    trialEndsAt: '2025-01-15T00:00:00Z'
  }

  const calculateDaysRemaining = (endDate: string) => {
    const now = new Date()
    const end = new Date(endDate)
    const diff = end.getTime() - now.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const handleUpgrade = () => {
    // Navigate to pricing page
    window.location.href = '/pricing'
  }

  return (
    <div>
      {/* Show banner only for trial users */}
      {user.subscriptionStatus === 'trial' && (
        <TrialBanner
          daysRemaining={calculateDaysRemaining(user.trialEndsAt)}
          trialEndDate={user.trialEndsAt}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Rest of app layout */}
      <header className="bg-surface border-b border-border">
        {/* Header content */}
      </header>

      <main className="bg-background">
        {/* Main content */}
      </main>
    </div>
  )
}
