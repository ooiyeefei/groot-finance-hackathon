'use client'

import Link from 'next/link'
import { LayoutDashboard, FileText, BookOpen } from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', href: '/en/accounting', icon: LayoutDashboard },
  { id: 'journal-entries', label: 'Journal Entries', href: '/en/accounting/journal-entries', icon: FileText },
  { id: 'chart-of-accounts', label: 'Chart of Accounts', href: '/en/accounting/chart-of-accounts', icon: BookOpen },
] as const

interface AccountingTabsProps {
  activeTab: 'dashboard' | 'journal-entries' | 'chart-of-accounts'
}

export default function AccountingTabs({ activeTab }: AccountingTabsProps) {
  return (
    <div className="flex items-center gap-1 border border-border bg-muted rounded-lg p-1 w-fit">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab
        const Icon = tab.icon
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
