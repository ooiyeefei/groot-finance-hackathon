'use client'

import React from 'react'

interface ActionButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

export default function ActionButton({
  children,
  onClick,
  variant = 'primary',
  size = 'sm',
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
  ...props
}: ActionButtonProps) {
  const baseClasses = 'font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded-lg'
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-800 disabled:opacity-50',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-white disabled:bg-gray-800 disabled:opacity-50'
  }
  
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base'
  }
  
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
  
  return (
    <button
      onClick={onClick}
      className={classes}
      disabled={disabled}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  )
}