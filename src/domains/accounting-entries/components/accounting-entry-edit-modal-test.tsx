'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface TestModalProps {
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
}

export default function TestModal({ onClose, onSubmit }: TestModalProps) {
  return (
    <div className="fixed inset-0 bg-gray-800 z-50 flex flex-col">
      <div className="w-full h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
          <h3 className="text-lg font-medium text-white">Test Modal</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 p-6">
          <p className="text-white">Test content</p>
        </div>
      </div>
    </div>
  )
}