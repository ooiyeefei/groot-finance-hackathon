'use client'

/**
 * Business Creation Onboarding Page
 *
 * Allows users to create their first business account
 * with proper validation and user experience.
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Building2, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBusinessContext } from '@/contexts/business-context'

// Southeast Asian countries and currencies
const COUNTRIES = [
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'VN', name: 'Vietnam', currency: 'VND' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' },
]

const CURRENCIES = [
  'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'USD', 'EUR', 'CNY'
]

interface BusinessFormData {
  name: string
  country_code: string
  home_currency: string
}

export default function BusinessOnboarding() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { refreshMemberships, refreshContext } = useBusinessContext()

  const [formData, setFormData] = useState<BusinessFormData>({
    name: '',
    country_code: 'SG',
    home_currency: 'SGD'
  })

  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Ensure component is mounted before running client-side logic
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Redirect to sign-in if not authenticated (only after mounted)
  useEffect(() => {
    if (isMounted && isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isMounted, isLoaded, isSignedIn, router])

  // Don't render anything until we're sure about auth state
  if (!isMounted || !isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Redirect to sign-in if not authenticated
  if (!isSignedIn) {
    return null
  }

  const handleInputChange = (field: keyof BusinessFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    // Clear error when user starts typing
    if (error) setError(null)
  }

  const handleCountryChange = (countryCode: string) => {
    const country = COUNTRIES.find(c => c.code === countryCode)
    setFormData(prev => ({
      ...prev,
      country_code: countryCode,
      home_currency: country?.currency || prev.home_currency
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      // Validate form
      if (!formData.name.trim()) {
        throw new Error('Business name is required')
      }

      if (formData.name.trim().length < 2) {
        throw new Error('Business name must be at least 2 characters')
      }

      console.log('[BusinessOnboarding] Creating business:', formData.name)

      // Call the business creation API
      const response = await fetch('/api/business/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to create business')
      }

      console.log('[BusinessOnboarding] Business created successfully:', result.business.name)
      setIsSuccess(true)

      // Refresh business context to load the new business
      await Promise.all([
        refreshMemberships(),
        refreshContext()
      ])

      // Redirect to dashboard after a brief success message
      setTimeout(() => {
        console.log('[BusinessOnboarding] Redirecting to dashboard now...')
        // Use window.location.href instead of router.push to force a full page reload
        // This ensures all auth state and context is properly refreshed
        window.location.href = '/'
      }, 2000)

    } catch (err) {
      console.error('[BusinessOnboarding] Error creating business:', err)
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoBack = () => {
    router.push('/')
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-6 p-3 bg-green-900/20 rounded-full w-fit">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-semibold text-green-400 mb-2">
              Business Created!
            </h2>
            <p className="text-gray-300 mb-4">
              Welcome to FinanSEAL! Your business has been set up successfully.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting to dashboard...
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600/20 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-xl text-white">Create Your Business</CardTitle>
                <CardDescription className="text-gray-400">
                  Set up your business account to start using FinanSEAL
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business Name */}
            <div className="space-y-2">
              <Label htmlFor="businessName" className="text-sm font-medium text-gray-200">
                Business Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="businessName"
                type="text"
                placeholder="e.g. Acme Trading Pte Ltd"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                disabled={isLoading}
                className="w-full bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="country" className="text-sm font-medium text-gray-200">
                Country
              </Label>
              <Select
                value={formData.country_code}
                onValueChange={handleCountryChange}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code} className="text-white focus:bg-gray-600">
                      {country.name} ({country.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-medium text-gray-200">
                Home Currency
              </Label>
              <Select
                value={formData.home_currency}
                onValueChange={(value) => handleInputChange('home_currency', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency} className="text-white focus:bg-gray-600">
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Business...
                </>
              ) : (
                'Create Business'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <p className="text-xs text-gray-400 text-center">
              By creating a business, you agree to our Terms of Service and Privacy Policy.
              You will be set as the business owner with full administrative privileges.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}