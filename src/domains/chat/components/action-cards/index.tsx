/**
 * Action Card Registry
 *
 * Extensible type-to-component map for rendering interactive cards inline in chat.
 * New card types can be added by calling registerActionCard().
 * Unrecognized types fall back to a formatted text display.
 */

import type { ComponentType } from 'react'
import type { ChatAction } from '../../lib/sse-parser'

// Import card modules so their registerActionCard() side-effects execute
import './anomaly-card'
import './expense-approval-card'
import './vendor-comparison-card'
import './spending-chart'

export interface ActionCardProps {
  action: ChatAction
  isHistorical: boolean
  onActionComplete?: (result: { success: boolean; message?: string }) => void
}

/** Registry of action type → React component */
const registry = new Map<string, ComponentType<ActionCardProps>>()

/** Register a new action card component for a given type */
export function registerActionCard(
  type: string,
  component: ComponentType<ActionCardProps>
) {
  registry.set(type, component)
}

/** Look up and render an action card, or fall back to FallbackCard */
export function getActionCardComponent(
  type: string
): ComponentType<ActionCardProps> {
  return registry.get(type) || FallbackCard
}

/** Check if a specific card type is registered */
export function hasActionCard(type: string): boolean {
  return registry.has(type)
}

// --- Fallback Card ---

import { AlertCircle } from 'lucide-react'

/** Default card shown when the action type is unrecognized */
function FallbackCard({ action }: ActionCardProps) {
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="font-medium capitalize">
          {action.type.replace(/_/g, ' ')}
        </span>
      </div>
      <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-hidden">
        {JSON.stringify(action.data, null, 2).slice(0, 500)}
      </pre>
    </div>
  )
}
