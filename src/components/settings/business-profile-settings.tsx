'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, Camera, Building2 } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-profile-context'

interface BusinessProfile {
  id: string
  name: string
  logo_url?: string
  logo_fallback_color?: string
}

export default function BusinessProfileSettings() {
  const t = useTranslations('settings')
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.name || '')
    }
  }, [profile])


  const updateBusinessName = async () => {
    if (!profile || !businessName.trim()) return

    try {
      setIsUpdating(true)
      const response = await fetch('/api/business-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: businessName.trim()
        })
      })

      const result = await response.json()

      if (result.success) {
        updateProfile(result.data)
        addToast({
          type: 'success',
          title: t('businessProfile.toast.nameUpdatedTitle'),
          description: t('businessProfile.toast.nameUpdatedDescription')
        })
      } else {
        addToast({
          type: 'error',
          title: t('businessProfile.toast.nameUpdateFailedTitle'),
          description: result.error || t('businessProfile.toast.nameUpdateErrorDescription')
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: t('businessProfile.toast.nameUpdateErrorTitle'),
        description: t('businessProfile.toast.nameUpdateErrorDescription')
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      addToast({
        type: 'error',
        title: t('businessProfile.toast.invalidFileTypeTitle'),
        description: t('businessProfile.toast.invalidFileTypeDescription')
      })
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      addToast({
        type: 'error',
        title: t('businessProfile.toast.fileTooLargeTitle'),
        description: t('businessProfile.toast.fileTooLargeDescription')
      })
      return
    }

    try {
      setIsUploading(true)

      const formData = new FormData()
      formData.append('logo', file)

      const response = await fetch('/api/business-profile/upload-logo', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        const updatedProfile = { ...profile, logo_url: result.data.logo_url }
        updateProfile(updatedProfile)
        addToast({
          type: 'success',
          title: t('businessProfile.toast.logoUploadedTitle'),
          description: t('businessProfile.toast.logoUploadedDescription')
        })
      } else {
        addToast({
          type: 'error',
          title: t('businessProfile.toast.logoUploadFailedTitle'),
          description: result.error || t('businessProfile.toast.logoUploadErrorDescription')
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: t('businessProfile.toast.logoUploadErrorTitle'),
        description: t('businessProfile.toast.logoUploadErrorDescription')
      })
    } finally {
      setIsUploading(false)
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeLogo = async () => {
    if (!profile) return

    try {
      setIsUploading(true)

      const response = await fetch('/api/business-profile/upload-logo', {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        const updatedProfile = { ...profile, logo_url: undefined }
        updateProfile(updatedProfile)
        addToast({
          type: 'success',
          title: t('businessProfile.toast.logoRemovedTitle'),
          description: t('businessProfile.toast.logoRemovedDescription')
        })
      } else {
        addToast({
          type: 'error',
          title: t('businessProfile.toast.logoRemoveFailedTitle'),
          description: result.error || t('businessProfile.toast.logoRemoveErrorDescription')
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: t('businessProfile.toast.logoRemoveErrorTitle'),
        description: t('businessProfile.toast.logoRemoveErrorDescription')
      })
    } finally {
      setIsUploading(false)
    }
  }

  const getBusinessInitial = () => {
    return profile?.name?.[0]?.toUpperCase() || 'B'
  }

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Building2 className="w-6 h-6 text-blue-400" />
        <h2 className="text-xl font-semibold text-white">{t('businessProfile.title')}</h2>
      </div>

      <div className="space-y-6">
        {/* Business Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            {t('businessProfile.businessLogoLabel')}
          </label>

          <div className="flex items-center space-x-4">
            {/* Logo Display */}
            <div className="relative">
              {profile?.logo_url ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-700 border-2 border-gray-600">
                  <Image
                    src={profile.logo_url}
                    alt={t('businessProfile.logoAlt')}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-20 h-20 rounded-lg flex items-center justify-center text-white font-bold text-2xl border-2 border-gray-600"
                  style={{ backgroundColor: profile?.logo_fallback_color || '#3b82f6' }}
                >
                  {getBusinessInitial()}
                </div>
              )}

              {/* Remove Logo Button */}
              {profile?.logo_url && (
                <button
                  onClick={removeLogo}
                  disabled={isUploading}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Upload Button */}
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    {t('businessProfile.uploading')}
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    {profile?.logo_url ? t('businessProfile.changeLogo') : t('businessProfile.uploadLogo')}
                  </>
                )}
              </button>

              <p className="text-xs text-gray-400">
                {t('businessProfile.fileFormatDescription')}
              </p>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {t('businessProfile.businessNameLabel')}
          </label>
          <div className="flex space-x-3">
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder={t('businessProfile.businessNamePlaceholder')}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={updateBusinessName}
              disabled={isUpdating || businessName.trim() === profile?.name || !businessName.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {isUpdating ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                t('businessProfile.updateButton')
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {t('businessProfile.businessNameDescription')}
          </p>
        </div>
      </div>
    </div>
  )
}