import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ChatInterface from '@/components/chat/chat-interface'
import { LanguageProvider } from '@/contexts/language-context'
import AIAssistantHeader from './ai-assistant-header'

export default async function AIAssistantPage() {
  // Server-side authentication check
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  return (
    <LanguageProvider>
      <AIAssistantContent />
    </LanguageProvider>
  )
}

function AIAssistantContent() {
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <HeaderWithUser />
        
        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-hidden">
          <div className="h-full max-w-4xl mx-auto">
            <AIAssistantHeader />
            
            {/* Chat Interface */}
            <div className="h-[calc(100%-5rem)]">
              <ChatInterface />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

