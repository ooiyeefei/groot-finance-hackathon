'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  description?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString()
    const newToast = { ...toast, id }
    setToasts(prev => [...prev, newToast])

    // Auto-remove after duration (default 5 seconds)
    const duration = toast.duration ?? 5000
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  removeToast: (id: string) => void
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onRemove: () => void
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-success-foreground" />
      case 'error':
        return <XCircle className="w-5 h-5 text-danger-foreground" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-warning-foreground" />
      case 'info':
        return <Info className="w-5 h-5 text-primary-foreground" />
      default:
        return <Info className="w-5 h-5 text-primary-foreground" />
    }
  }

  const getBgColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-success border-success'
      case 'error':
        return 'bg-danger border-danger'
      case 'warning':
        return 'bg-warning border-warning'
      case 'info':
        return 'bg-primary border-primary'
      default:
        return 'bg-card border-border'
    }
  }

  const getTextColor = () => {
    switch (toast.type) {
      case 'success':
        return 'text-success-foreground'
      case 'error':
        return 'text-danger-foreground'
      case 'warning':
        return 'text-warning-foreground'
      case 'info':
        return 'text-primary-foreground'
      default:
        return 'text-foreground'
    }
  }

  return (
    <div
      className={`
        ${getBgColor()}
        border rounded-lg p-4 shadow-lg backdrop-blur-sm
        animate-in slide-in-from-right-full duration-300
        max-w-sm min-w-0
      `}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${getTextColor()}`}>
            {toast.title}
          </p>
          {toast.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={onRemove}
          className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

