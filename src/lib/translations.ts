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

  // Financial Disclaimers
  chatDisclaimer: string
  ocrDocumentDisclaimer: string
  ocrReceiptDisclaimer: string
  generalDisclaimer: string
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
    retry: 'Try again',

    // Financial Disclaimers
    chatDisclaimer: 'AI Assistant provides general guidance based on your data. Not professional financial advice. Consult advisors for investment decisions.',
    ocrDocumentDisclaimer: 'AI extracted this data from your document. Please verify accuracy before proceeding with financial decisions.',
    ocrReceiptDisclaimer: 'AI extracted this data from your receipt. Please verify all amounts and details before submission.',
    generalDisclaimer: 'FinanSEAL is a financial management tool. For professional advice, consult qualified advisors.'
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
    retry: 'ลองอีกครั้ง',

    // Financial Disclaimers
    chatDisclaimer: 'ผู้ช่วย AI ให้คำแนะนำทั่วไปจากข้อมูลของคุณ ไม่ใช่คำแนะนำทางการเงินแบบมืออาชีพ ปรึกษาที่ปรึกษาสำหรับการตัดสินใจการลงทุน',
    ocrDocumentDisclaimer: 'AI ดึงข้อมูลนี้จากเอกสารของคุณ โปรดตรวจสอบความถูกต้องก่อนดำเนินการตัดสินใจทางการเงิน',
    ocrReceiptDisclaimer: 'AI ดึงข้อมูลนี้จากใบเสร็จของคุณ โปรดตรวจสอบจำนวนเงินและรายละเอียดทั้งหมดก่อนส่ง',
    generalDisclaimer: 'FinanSEAL เป็นเครื่องมือจัดการทางการเงิน สำหรับคำแนะนำมืออาชีพ ปรึกษาที่ปรึกษาที่มีคุณสมบัติ'
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
    retry: 'Coba lagi',

    // Financial Disclaimers
    chatDisclaimer: 'Asisten AI memberikan panduan umum berdasarkan data Anda. Bukan nasihat keuangan profesional. Konsultasikan dengan penasihat untuk keputusan investasi.',
    ocrDocumentDisclaimer: 'AI mengekstrak data ini dari dokumen Anda. Harap verifikasi akurasi sebelum melanjutkan keputusan keuangan.',
    ocrReceiptDisclaimer: 'AI mengekstrak data ini dari tanda terima Anda. Harap verifikasi semua jumlah dan detail sebelum pengiriman.',
    generalDisclaimer: 'FinanSEAL adalah alat manajemen keuangan. Untuk nasihat profesional, konsultasikan dengan penasihat yang berkualifikasi.'
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