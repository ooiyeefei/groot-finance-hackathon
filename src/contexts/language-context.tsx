'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { SupportedLanguage, detectBrowserLanguage, getTranslations, TranslationKeys } from '@/lib/translations'

interface LanguageContextType {
  language: SupportedLanguage
  setLanguage: (language: SupportedLanguage) => void
  t: TranslationKeys
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = 'finanseal-language'

interface LanguageProviderProps {
  children: ReactNode
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguagState] = useState<SupportedLanguage>('en')

  // Initialize language from localStorage or browser detection
  useEffect(() => {
    const savedLanguage = localStorage.getItem(STORAGE_KEY) as SupportedLanguage
    const initialLanguage = savedLanguage || detectBrowserLanguage()
    setLanguagState(initialLanguage)
  }, [])

  // Save language preference to localStorage
  const setLanguage = (newLanguage: SupportedLanguage) => {
    setLanguagState(newLanguage)
    localStorage.setItem(STORAGE_KEY, newLanguage)
  }

  // Get translations for current language
  const t = getTranslations(language)

  const value: LanguageContextType = {
    language,
    setLanguage,
    t
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

// Custom hook to use language context
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}