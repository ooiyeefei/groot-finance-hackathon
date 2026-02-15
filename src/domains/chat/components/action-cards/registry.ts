/**
 * Action Card Registry (core)
 *
 * Separated from index.tsx to avoid circular imports.
 * Card modules import registerActionCard from here,
 * and index.tsx re-exports everything + triggers card side-effect imports.
 */

import type { ComponentType } from 'react'
import type { ChatAction } from '../../lib/sse-parser'

export interface ActionCardProps {
  action: ChatAction
  isHistorical: boolean
  onActionComplete?: (result: { success: boolean; message?: string }) => void
  onViewDetails?: (payload: { type: 'chart' | 'table' | 'dashboard'; title: string; data: unknown }) => void
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

/** Look up an action card component, returns undefined if not found */
export function getRegisteredCard(
  type: string
): ComponentType<ActionCardProps> | undefined {
  return registry.get(type)
}

/** Check if a specific card type is registered */
export function hasActionCard(type: string): boolean {
  return registry.has(type)
}
