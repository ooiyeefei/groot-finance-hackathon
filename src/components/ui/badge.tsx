import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Base styles using semantic tokens
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Default badge - neutral styling
        default: [
          // Light mode: light background with proper contrast
          "border border-border bg-muted text-muted-foreground",
          // Dark mode: subtle translucent design
          "dark:border-border dark:bg-muted/50 dark:text-muted-foreground dark:backdrop-blur-sm"
        ],

        // Success/Green badges - for "Completed", "Record Created", "Approved", "Submitted"
        success: [
          // Light mode: translucent green background with dark green text
          "border border-green-300 bg-green-100 text-green-900",
          // Dark mode: translucent green background with light green text
          "dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-400 dark:backdrop-blur-sm"
        ],

        // Warning/Yellow badges - for pending states
        warning: [
          // Light mode: translucent yellow background with dark yellow text
          "border border-yellow-300 bg-yellow-100 text-yellow-900",
          // Dark mode: translucent yellow background with light yellow text
          "dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:text-yellow-400 dark:backdrop-blur-sm"
        ],

        // Error/Red badges - for failed/rejected states
        error: [
          // Light mode: light red background with dark red text
          "border border-red-200 bg-red-50 text-red-800",
          // Dark mode: translucent red background with light red text
          "dark:border-red-700/30 dark:bg-red-900/20 dark:text-red-300 dark:backdrop-blur-sm"
        ],

        // Info/Blue badges - for informational states
        info: [
          // Light mode: translucent blue background with dark blue text
          "border border-blue-300 bg-blue-100 text-blue-900",
          // Dark mode: translucent blue background with light blue text
          "dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-400 dark:backdrop-blur-sm"
        ],

        // Primary badges - for draft/ready to submit status
        primary: [
          // Light mode: translucent blue background with dark blue text
          "border border-blue-300 bg-blue-100 text-blue-900",
          // Dark mode: translucent blue background with light blue text
          "dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-400 dark:backdrop-blur-sm"
        ],

        // Secondary badges - for less important status
        secondary: [
          // Light mode: secondary styling
          "border border-secondary/40 bg-secondary text-secondary-foreground",
          // Dark mode: secondary translucent design
          "dark:border-secondary/30 dark:bg-secondary/50 dark:text-secondary-foreground dark:backdrop-blur-sm"
        ],

        // Destructive badges - for delete/destructive actions
        destructive: [
          // Light mode: destructive styling
          "border border-destructive/40 bg-destructive text-destructive-foreground",
          // Dark mode: destructive translucent design
          "dark:border-destructive/30 dark:bg-destructive/15 dark:text-destructive-foreground dark:backdrop-blur-sm"
        ],

        // Outline badges - for minimal styling
        outline: [
          // Light mode: outlined with background on hover
          "border border-input bg-background text-foreground hover:bg-muted",
          // Dark mode: translucent outline
          "dark:border-input dark:bg-background/50 dark:text-foreground dark:hover:bg-muted dark:backdrop-blur-sm"
        ]
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs rounded-md",
        lg: "px-3 py-1 text-sm"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }