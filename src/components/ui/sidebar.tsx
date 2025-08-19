'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Home, FileText, CreditCard, MessageSquare, Settings, Menu, ChevronLeft } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function Sidebar() {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Documents', href: '/documents', icon: FileText },
    { name: 'Transactions', href: '/transactions', icon: CreditCard },
    { name: 'AI Assistant', href: '/ai-assistant', icon: MessageSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  // Load saved state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-expanded')
    if (savedState !== null) {
      setIsExpanded(JSON.parse(savedState))
    }

    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setIsExpanded(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Save state to localStorage
  const toggleSidebar = () => {
    const newState = !isExpanded
    setIsExpanded(newState)
    localStorage.setItem('sidebar-expanded', JSON.stringify(newState))
  }

  return (
    <TooltipProvider>
      <div className={`
        ${isExpanded ? 'w-64' : 'w-20'} 
        bg-gray-800 border-r border-gray-700 flex flex-col
        transition-all duration-300 ease-in-out
        ${isMobile ? 'fixed left-0 top-0 h-full z-50' : 'relative'}
      `}>
        {/* Logo and Toggle */}
        <div className={`${isExpanded ? 'p-6' : 'p-4'} border-b border-gray-700 transition-all duration-300 ease-in-out`}>
          <div className={`flex items-center ${isExpanded ? 'justify-between' : 'justify-center'}`}>
            {isExpanded ? (
              <>
                <Link href="/" className="flex items-center space-x-3 min-w-0">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                      F
                    </div>
                  </div>
                  <div className="transition-all duration-300 ease-in-out overflow-hidden">
                    <h2 className="text-xl font-bold text-white whitespace-nowrap">
                      FinanSEAL
                    </h2>
                  </div>
                </Link>
                
                <button
                  onClick={toggleSidebar}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <Link href="/" className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm hover:bg-blue-700 transition-colors">
                    F
                  </div>
                </Link>
                
                <button
                  onClick={toggleSidebar}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  aria-label="Expand sidebar"
                >
                  <Menu className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const NavItem = (
                <Link
                  href={item.href}
                  className={`
                    flex items-center rounded-lg transition-colors
                    ${isExpanded ? 'p-3' : 'p-3 justify-center'}
                    ${isActive 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isExpanded ? 'mr-3' : ''} flex-shrink-0`} />
                  <span className={`
                    transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                    ${isExpanded ? 'opacity-100 max-w-none' : 'opacity-0 max-w-0'}
                  `}>
                    {item.name}
                  </span>
                </Link>
              )

              return (
                <li key={item.name}>
                  {!isExpanded ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {NavItem}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="ml-2">
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    NavItem
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer - User info or additional actions could go here */}
        <div className={`p-4 border-t border-gray-700 ${!isExpanded ? 'px-2' : ''}`}>
          <div className={`
            text-xs text-gray-400 text-center
            transition-all duration-300 ease-in-out
            ${isExpanded ? 'opacity-100' : 'opacity-0'}
          `}>
            Financial Co-Pilot
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobile && isExpanded && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </TooltipProvider>
  )
}