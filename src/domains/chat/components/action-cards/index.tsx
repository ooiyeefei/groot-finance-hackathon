/**
 * Action Card Registry — Public API
 *
 * Re-exports registry functions and triggers card module side-effect imports.
 * Card modules import from ./registry (not here) to avoid circular deps.
 */

// Re-export registry API
export { registerActionCard, hasActionCard, type ActionCardProps } from './registry'
import { getRegisteredCard } from './registry'
import type { ComponentType } from 'react'
import type { ActionCardProps } from './registry'

// Import card modules so their registerActionCard() side-effects execute
import './anomaly-card'
import './expense-approval-card'
import './vendor-comparison-card'
import './spending-chart'

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

/** Look up and render an action card, or fall back to FallbackCard */
export function getActionCardComponent(
  type: string
): ComponentType<ActionCardProps> {
  return getRegisteredCard(type) || FallbackCard
}
