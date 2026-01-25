/**
 * RoleBadge Component
 * Standardized badge component for displaying user roles with consistent theming
 * across light and dark modes.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Crown, Shield, UserCheck, User } from "lucide-react"

const roleBadgeVariants = cva(
  // Base styles using semantic design system pattern
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      roleType: {
        // Owner: Yellow color scheme
        owner: [
          // Light mode: light yellow background with dark yellow text
          "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
          // Dark mode: light yellow background with light yellow text
          "dark:text-yellow-400"
        ],

        // Admin/Finance Admin: Purple color scheme
        admin: [
          // Light mode: light purple background with dark purple text
          "bg-purple-500/10 text-purple-600 border-purple-500/30",
          // Dark mode: light purple background with light purple text
          "dark:text-purple-400"
        ],

        // Finance Admin: Purple color scheme (same as admin)
        finance_admin: [
          // Light mode: light purple background with dark purple text
          "bg-purple-500/10 text-purple-600 border-purple-500/30",
          // Dark mode: light purple background with light purple text
          "dark:text-purple-400"
        ],

        // Manager: Blue color scheme
        manager: [
          // Light mode: light blue background with dark blue text
          "bg-blue-500/10 text-blue-600 border-blue-500/30",
          // Dark mode: light blue background with light blue text
          "dark:text-blue-400"
        ],

        // Employee: Grey color scheme
        employee: [
          // Light mode: light grey background with dark grey text
          "bg-gray-500/10 text-gray-600 border-gray-500/30",
          // Dark mode: light grey background with light grey text
          "dark:text-gray-400"
        ]
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-sm"
      }
    },
    defaultVariants: {
      roleType: "employee",
      size: "default"
    }
  }
)

const roleIcons = {
  owner: Crown,
  admin: Crown,
  finance_admin: Crown,
  manager: Shield,
  employee: UserCheck
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  finance_admin: 'Finance Admin',
  manager: 'Manager',
  employee: 'Employee'
}

export interface RoleBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof roleBadgeVariants> {
  /**
   * Show icon next to role label
   * @default true
   */
  showIcon?: boolean
}

function RoleBadge({
  className,
  roleType = "employee",
  size,
  showIcon = true,
  ...props
}: RoleBadgeProps) {
  const Icon = roleType ? roleIcons[roleType] : UserCheck
  const label = roleType ? (roleLabels[roleType] || roleType.charAt(0).toUpperCase() + roleType.slice(1)) : "Employee"

  return (
    <div
      className={cn(roleBadgeVariants({ roleType, size }), className)}
      {...props}
    >
      {showIcon && <Icon className="w-3 h-3 mr-1" />}
      {label}
    </div>
  )
}

export { RoleBadge, roleBadgeVariants }
