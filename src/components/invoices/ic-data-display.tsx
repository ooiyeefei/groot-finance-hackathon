'use client'

import { CheckCircle, Shield } from 'lucide-react'

interface ICData {
  document_type: string
  full_name: string
  ic_number: string
  gender: 'LELAKI' | 'PEREMPUAN' | string
  address: string
  date_of_birth: string
  confidence_score: number
}

interface ICDataDisplayProps {
  data: ICData
}

export default function ICDataDisplay({ data }: ICDataDisplayProps) {

  const formatGender = (gender: string) => {
    switch (gender?.toUpperCase()) {
      case 'LELAKI': return 'Male'
      case 'PEREMPUAN': return 'Female'
      default: return gender || 'Not specified'
    }
  }

  const formatDateOfBirth = (dob: string) => {
    try {
      const date = new Date(dob)
      return date.toLocaleDateString('en-MY', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return dob
    }
  }

  const hasData = (value: any) => value !== null && value !== undefined && value !== ''

  return (
    <div className="mt-4 p-4 bg-gray-700 rounded-lg">
      {/* Key Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Full Name */}
        {hasData(data.full_name) && (
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
              Full Name
            </label>
            <div className="text-sm text-white bg-gray-800 px-3 py-2 rounded border border-gray-600">
              {data.full_name}
            </div>
          </div>
        )}

        {/* IC Number */}
        {hasData(data.ic_number) && (
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
              IC Number
            </label>
            <div className="text-sm text-white bg-gray-800 px-3 py-2 rounded border border-gray-600 font-mono">
              {data.ic_number}
            </div>
          </div>
        )}
      </div>

      {/* Personal Information */}
      <div className="space-y-6">
        <div>
          <h6 className="text-sm font-medium text-gray-300 mb-3">Personal Information</h6>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasData(data.date_of_birth) && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Date of Birth
                </label>
                <div className="text-sm text-white bg-gray-800 px-3 py-2 rounded border border-gray-600">
                  {formatDateOfBirth(data.date_of_birth)}
                </div>
              </div>
            )}

            {hasData(data.gender) && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Gender
                </label>
                <div className="text-sm text-white bg-gray-800 px-3 py-2 rounded border border-gray-600">
                  {formatGender(data.gender)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Address Information */}
        {hasData(data.address) && (
          <div>
            <h6 className="text-sm font-medium text-gray-300 mb-3">Address Information</h6>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Registered Address
              </label>
              <div className="text-sm text-white bg-gray-800 px-3 py-2 rounded border border-gray-600 min-h-[60px]">
                {data.address}
              </div>
            </div>
          </div>
        )}

        {/* AI Extraction Warning - Bottom Left Corner */}
        <div className="flex items-center gap-2 mt-4 p-2 bg-amber-900/20 border border-amber-700/50 rounded">
          <span className="text-amber-400">⚠️</span>
          <span className="text-xs text-amber-300 font-medium">AI Extraction - Please verify accuracy</span>
        </div>
      </div>
    </div>
  )
}