'use client'

import React from 'react'
import { UserButton } from '@clerk/nextjs'

interface HeaderWithUserProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function HeaderWithUser({ title = "Dashboard", subtitle, actions }: HeaderWithUserProps) {
  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Title and subtitle */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
          {subtitle && (
            <p className="text-gray-400">{subtitle}</p>
          )}
        </div>
        
        {/* Center: Actions */}
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
        
        {/* Right: User button */}
        <UserButton 
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
            }
          }}
        />
      </div>
    </header>
  )
}