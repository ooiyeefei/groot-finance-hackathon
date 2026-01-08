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
  const baseClasses = 'font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-lg'

  const variantClasses = {
    primary: 'bg-primary hover:bg-primary/90 text-primary-foreground disabled:bg-primary/50 disabled:opacity-50',
    secondary: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground disabled:bg-secondary/50 disabled:opacity-50'
  }
  
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base'
  }
  
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
  
  return (
    <button
      type="button"
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