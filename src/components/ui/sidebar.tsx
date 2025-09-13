'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Home, FileText, CreditCard, Receipt, MessageSquare, Settings, Menu, ChevronLeft, Users, CheckCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

interface UserRole {
  employee: boolean
  manager: boolean
  admin: boolean
}

export default function Sidebar() {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>({ employee: true, manager: false, admin: false })
  
  // Base navigation items
  const baseNavigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Documents', href: '/documents', icon: FileText },
    { name: 'Transactions', href: '/transactions', icon: CreditCard },
    { name: 'Expense Claims', href: '/expense-claims', icon: Receipt },
    { name: 'AI Assistant', href: '/ai-assistant', icon: MessageSquare },
  ]

  // Manager-specific navigation items
  const managerNavigation = [
    { name: 'Approvals', href: '/manager/approvals', icon: CheckCircle },
    { name: 'Team Management', href: '/manager/teams', icon: Users },
  ]

  // Settings always at the end
  const settingsNavigation = [
    { name: 'Settings', href: '/settings', icon: Settings }
  ]

  // Build complete navigation based on role
  const navigation = [
    ...baseNavigation,
    ...(userRole.manager || userRole.admin ? managerNavigation : []),
    ...settingsNavigation
  ]

  // Load saved state from localStorage and fetch user role
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

    // Fetch user role and permissions
    fetchUserRole()
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch user role and pending approvals count
  const fetchUserRole = async () => {
    try {
      // Get user role from employee profile
      const roleResponse = await fetch('/api/user/role')
      if (roleResponse.ok) {
        const roleResult = await roleResponse.json()
        if (roleResult.success) {
          setUserRole(roleResult.data.permissions)
        }
      }
    } catch (error) {
      console.error('Failed to fetch user role:', error)
    }
  }


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
        <div className={`${isExpanded ? 'p-6' : 'p-4'} transition-all duration-300 ease-in-out`}>
          <div className={`flex items-center ${isExpanded ? 'justify-between' : 'justify-center'}`}>
            {isExpanded ? (
              <>
                <Link href="/" className="flex items-center space-x-3 min-w-0">
                  <div className="flex-shrink-0">
                    <Image
                      src="https://storage.googleapis.com/finanseal-logo/finanseal.png"
                      alt="FinanSEAL Logo"
                      width={43}
                      height={43}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="transition-all duration-300 ease-in-out overflow-hidden">
                    <h2 className="text-2xl font-bold text-white whitespace-nowrap">
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
                  <Image
                    src="https://storage.googleapis.com/finanseal-logo/finanseal.png"
                    alt="FinanSEAL Logo"
                    width={39}
                    height={39}
                    className="rounded hover:opacity-80 transition-opacity"
                  />
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
                    flex items-center rounded-lg transition-colors relative
                    ${isExpanded ? 'p-3' : 'p-3 justify-center'}
                    ${isActive 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isExpanded ? 'mr-3' : ''} flex-shrink-0`} />
                  <span className={`
                    transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap flex-1
                    ${isExpanded ? 'opacity-100 max-w-none' : 'opacity-0 max-w-0'}
                  `}>
                    {item.name}
                  </span>
                  {/* Badge for notifications */}
                  {'badge' in item && (item as any).badge && (
                    <Badge 
                      variant="secondary" 
                      className={`
                        bg-red-600 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center
                        ${isExpanded ? 'ml-2' : 'absolute -top-1 -right-1 scale-75'}
                        ${isExpanded ? 'opacity-100' : 'opacity-100'}
                      `}
                    >
                      {(item as any).badge}
                    </Badge>
                  )}
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
                        <div className="flex items-center gap-2">
                          {item.name}
                          {'badge' in item && (item as any).badge && (
                            <Badge variant="secondary" className="bg-red-600 text-white text-xs">
                              {(item as any).badge}
                            </Badge>
                          )}
                        </div>
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