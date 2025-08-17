'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, CreditCard, MessageSquare, Settings } from 'lucide-react'

export default function Sidebar() {
  const pathname = usePathname()
  
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Documents', href: '/documents', icon: FileText },
    { name: 'Transactions', href: '/transactions', icon: CreditCard },
    { name: 'AI Assistant', href: '/ai-assistant', icon: MessageSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]
  
  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <Link href="/" className="block">
          <h2 className="text-xl font-bold text-white">FinanSEAL</h2>
          <p className="text-sm text-gray-400">Financial Co-Pilot</p>
        </Link>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center p-3 rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}