'use client'

import { UserButton } from '@clerk/nextjs'

export default function HeaderWithUser() {
  return (
    <header className="bg-gray-800 border-b border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
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