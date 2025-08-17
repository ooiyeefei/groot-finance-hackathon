'use client'

import { useLanguage } from '@/contexts/language-context'
import LanguageSelector from '@/components/ui/language-selector'

export default function AIAssistantHeader() {
  return (
    <div className="mb-6 flex items-start justify-between">
      <TranslatedHeader />
      <div className="ml-4">
        <LanguageSelector />
      </div>
    </div>
  )
}

function TranslatedHeader() {
  const { t } = useLanguage()
  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">{t.aiAssistant}</h1>
      <p className="text-gray-400">{t.aiAssistantSubtitle}</p>
    </div>
  )
}