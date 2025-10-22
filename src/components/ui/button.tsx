import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base styles using semantic tokens with proper focus and transition
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Default/Secondary actions (reprocess, cancel) - Gray variant
        default: [
          "bg-action-secondary text-action-secondary-foreground border-transparent hover:bg-action-secondary-hover hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        ],

        // Primary actions (create, submit, update, reprocess) - Blue variant
        primary: [
          "bg-action-primary text-action-primary-foreground border-transparent hover:bg-action-primary-hover hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        ],

        // View actions (analyze, view record) - Green variant
        view: [
          "bg-action-view text-action-view-foreground border-transparent hover:bg-action-view-hover hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        ],

        // Success/Approve actions - Green variant with white text
        success: [
          "bg-green-600 text-white border-transparent hover:bg-green-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        ],

        // Delete/Destructive actions - Red variant
        destructive: [
          "bg-destructive text-destructive-foreground border-transparent hover:bg-destructive/90 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        ],

        // Outline/Secondary button
        outline: [
          // Light mode: outlined with light grey hover (Image #2 reference)
          "border border-input bg-background hover:bg-muted hover:text-accent-foreground shadow-sm hover:shadow-md",
          // Dark mode: translucent outline
          "dark:border-input dark:bg-background/50 dark:backdrop-blur-sm dark:hover:bg-accent dark:hover:text-accent-foreground"
        ],

        // Secondary button
        secondary: [
          // Light mode: light grey with subtle hover (Image #2 reference)
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover",
          // Dark mode: dark secondary
          "dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary-hover"
        ],

        // Ghost button - transparent with hover
        ghost: [
          // Light mode: transparent with light grey hover (Image #2 reference)
          "text-foreground hover:bg-muted hover:text-accent-foreground",
          // Dark mode: transparent with subtle hover
          "dark:text-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
        ],

        // Link button
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md",  // 10% smaller size but keep text-sm
        default: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base rounded-lg",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }