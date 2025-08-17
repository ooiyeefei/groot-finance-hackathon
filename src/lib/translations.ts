/**
 * Multi-language Support for FinanSEAL AI Assistant
 * Supports English, Thai, and Indonesian
 */

export type SupportedLanguage = 'en' | 'th' | 'id'

export interface TranslationKeys {
  // Language Selector
  selectLanguage: string
  
  // Chat Interface
  send: string
  thinking: string
  welcome: string
  welcomeSubtitle: string
  inputPlaceholder: string
  inputHelp: string
  connected: string
  newChat: string
  
  // Page Headers
  aiAssistant: string
  aiAssistantSubtitle: string
  
  // Common
  loading: string
  error: string
  retry: string
}

export const translations: Record<SupportedLanguage, TranslationKeys> = {
  en: {
    // Language Selector
    selectLanguage: 'Select Language',
    
    // Chat Interface
    send: 'Send',
    thinking: 'Thinking...',
    welcome: 'Welcome to FinanSEAL AI',
    welcomeSubtitle: 'I\'m your financial assistant for Southeast Asian businesses. Ask me about budgeting, cash flow, taxes, or any financial questions.',
    inputPlaceholder: 'Ask me about financial planning, cash flow, or any business question...',
    inputHelp: 'Press Enter to send, Shift+Enter for new line',
    connected: 'Connected',
    newChat: 'New Chat',
    
    // Page Headers
    aiAssistant: 'AI Financial Assistant',
    aiAssistantSubtitle: 'Get intelligent financial guidance powered by SEA-LION AI',
    
    // Common
    loading: 'Loading...',
    error: 'Error',
    retry: 'Try again'
  },
  
  th: {
    // Language Selector
    selectLanguage: 'เลือกภาษา',
    
    // Chat Interface
    send: 'ส่ง',
    thinking: 'กำลังคิด...',
    welcome: 'ยินดีต้อนรับสู่ FinanSEAL AI',
    welcomeSubtitle: 'ฉันเป็นผู้ช่วยทางการเงินสำหรับธุรกิจในเอเชียตะวันออกเฉียงใต้ ถามฉันเกี่ยวกับการจัดทำงบประมาณ กระแสเงินสด ภาษี หรือคำถามทางการเงินใดๆ',
    inputPlaceholder: 'ถามฉันเกี่ยวกับการวางแผนทางการเงิน กระแสเงินสด หรือคำถามธุรกิจใดๆ...',
    inputHelp: 'กด Enter เพื่อส่ง กด Shift+Enter เพื่อขึ้นบรรทัดใหม่',
    connected: 'เชื่อมต่อแล้ว',
    newChat: 'แชทใหม่',
    
    // Page Headers
    aiAssistant: 'ผู้ช่วย AI ทางการเงิน',
    aiAssistantSubtitle: 'รับคำแนะนำทางการเงินที่ชาญฉลาดด้วยพลัง SEA-LION AI',
    
    // Common
    loading: 'กำลังโหลด...',
    error: 'ข้อผิดพลาด',
    retry: 'ลองอีกครั้ง'
  },
  
  id: {
    // Language Selector
    selectLanguage: 'Pilih Bahasa',
    
    // Chat Interface
    send: 'Kirim',
    thinking: 'Berpikir...',
    welcome: 'Selamat datang di FinanSEAL AI',
    welcomeSubtitle: 'Saya adalah asisten keuangan Anda untuk bisnis Asia Tenggara. Tanyakan tentang anggaran, arus kas, pajak, atau pertanyaan keuangan apapun.',
    inputPlaceholder: 'Tanyakan tentang perencanaan keuangan, arus kas, atau pertanyaan bisnis apapun...',
    inputHelp: 'Tekan Enter untuk mengirim, Shift+Enter untuk baris baru',
    connected: 'Terhubung',
    newChat: 'Chat Baru',
    
    // Page Headers
    aiAssistant: 'Asisten AI Keuangan',
    aiAssistantSubtitle: 'Dapatkan panduan keuangan cerdas yang didukung oleh SEA-LION AI',
    
    // Common
    loading: 'Memuat...',
    error: 'Kesalahan',
    retry: 'Coba lagi'
  }
}

// Language metadata
export const languageOptions = [
  { code: 'en' as const, name: 'English', flag: '🇺🇸' },
  { code: 'th' as const, name: 'ไทย', flag: '🇹🇭' },
  { code: 'id' as const, name: 'Indonesia', flag: '🇮🇩' }
]

// Browser language detection
export function detectBrowserLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en'
  
  const browserLang = navigator.language || navigator.languages?.[0] || 'en'
  const langCode = browserLang.split('-')[0].toLowerCase()
  
  // Map browser language codes to supported languages
  const languageMap: Record<string, SupportedLanguage> = {
    'en': 'en',
    'th': 'th',
    'id': 'id',
    'ms': 'id', // Malay speakers might prefer Indonesian
  }
  
  return languageMap[langCode] || 'en'
}

// Get translation for a specific key
export function getTranslation(language: SupportedLanguage, key: keyof TranslationKeys): string {
  return translations[language][key] || translations.en[key] || key
}

// Get all translations for a language
export function getTranslations(language: SupportedLanguage): TranslationKeys {
  return translations[language] || translations.en
}